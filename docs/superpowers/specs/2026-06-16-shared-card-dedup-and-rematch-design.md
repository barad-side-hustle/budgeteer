# Shared-card dedup and card-bill rematch

Date: 2026-06-16

## Problem

Two household users (e.g. mom and dad) share the same bank accounts. On a credit
card issuer (Cal), each user's login exposes some **shared** cards and some
**private** cards. A single Cal credential returns every card visible to that
login. Each card has its own monthly bill posted to the bank account (the bill is
per-card, not a combined membership total).

Connecting both users' credentials surfaced two defects:

1. **Duplicate card accounts.** The same Cal account is connected via two
   credentials. Every shared card comes back from both logins, so
   `bank_accounts` (unique on `workspace_id, credential_id, account_number`) gets
   a second row per shared card. Transactions dedup workspace-wide
   (`dedup_hash` excludes `credential_id`), so they attach to whichever
   credential synced first; the second credential's duplicate row shows
   `0.00` because the account-summary join keys on
   `(credential_id, account_number)` and finds no transactions.

2. **Card bills stuck at "no match" (ללא התאמה).** A newly added card's bill
   (e.g. card 4384, 8,411.42) stays unmatched even after its purchases sync in.

### Root cause of (2)

`reclassifyCardPayments` (the full card-event rebuild) runs only when a card
credential is **added or removed** - before the new card's transactions have been
synced. The subsequent sync that ingests those purchases runs only
`runMatchingStep`, which:

- reads candidates via `getMatchCandidates`, filtered to `event_id IS NULL`, and
- never clears the prior `credit_card_payment` "counted as spend" event.

So the bill, already locked into a counted-as-spend event from an earlier sync,
is skipped by the incremental matcher and never re-evaluated against the
now-present purchases. The per-card grouping in `buildCardBillingGroups` is
correct; the failure is purely rematch timing/locking.

## Goals

- A shared card produces exactly one account row, owned by one credential.
- Adding a second overlapping credential brings in only that login's **new**
  unique cards and reports which cards were shared.
- A per-card bill matches its purchase cycle after the purchases sync in, with no
  manual re-add of the credential.
- Clean up duplicate account rows already present in the database.

## Non-goals

- Re-homing shared cards when their owner credential is deleted (rare; a later
  sync of a remaining credential re-establishes ownership). Out of scope.
- Decoupling account identity from credential via a link table (the heavier
  "Approach 2"). Rejected in favor of ingest-time ownership.
- Pre-ingest confirmation gate. Chosen behavior is auto-dedup then notify.

## Design

### 1. Card ownership at ingest

A card's identity is `(workspace_id, provider, account_number)`. The **owner** is
the credential whose `bank_accounts` row for that card is oldest.

New resolver (server-only query):

```
resolveCardOwner(workspaceId, provider, accountNumber): credentialId
  // SELECT ba.credential_id
  //   FROM bank_accounts ba JOIN bank_credentials bc ON ba.credential_id = bc.id
  //  WHERE ba.workspace_id = ? AND bc.provider = ? AND ba.account_number = ?
  //  ORDER BY ba.created_at ASC, ba.id ASC LIMIT 1
  // -> existing owner, else the syncing credential becomes the owner
```

In `syncOneCredential`, for each scraped account/card belonging to the syncing
credential B (provider P):

- **Shared (owner exists and owner != B):** do not `upsertBankAccount` for B.
  Insert the card's transactions attributed to the **owner** credential, so newer
  shared-card transactions land under the owner and the account view stays
  correct. (They still dedup against the owner's existing rows.)
- **New / owned by B (no owner, or owner == B):** ingest normally under B.

`insertTransactions` currently takes one fixed `credentialId` for the whole
batch. It changes to attribute each transaction to its card's resolved owner:
resolve the owner per `account_number` once per sync, then insert each account's
rows under that owner. The dedup hash is unaffected (it never included
`credential_id`).

### 2. Cleanup migration for existing duplicates

A SQL migration collapses pre-existing duplicates. For each
`(workspace_id, provider, account_number)` with more than one `bank_accounts`
row:

- keep the oldest row (the owner),
- reattribute any transactions on the losing rows
  (`credential_id, account_number`) to the owner's `credential_id`,
- delete the losing `bank_accounts` rows.

This removes the `0.00` phantom card rows currently shown.

### 3. Rematch card bills after sync

At the end of `syncWorkspace`, after `runMatchingStep`, if any **card-issuer**
transactions were added or updated during the run, run the full card-event
rebuild (`reclassifyCardPayments(workspaceId, getConnectedCardIssuers(...))`).
This clears stale `credit_card_payment` / `credit_card_statement` events and
re-proposes, so a bill previously counted as spend is re-evaluated against
newly-synced purchases and matches its cycle.

Gating: only run when card data changed this sync. `runMatchingStep` continues
to own `internal_transfer` and `atm_withdrawal` matching.

`reclassifyCardPayments` is also fixed so it resets `category_id` /
`category_source` / `kind` only for **bill** members (`role = 'bill_payment'`),
not for **purchase** members. Purchases are non-grouping members whose
transaction rows the matcher never modified, so nulling their category is wrong:
it would drop the purchase's category and force the AI step (which runs right
after matching) to re-categorize it on every sync - an AI-cost regression. This
fix also benefits the existing add/delete callers.

The orchestrator already aggregates per-credential `added` / `updated`; it gains a
signal for whether any synced credential's provider was a card issuer with a
non-zero change count.

### 4. Notify summary

`syncOneCredential` reports, per credential, which cards were **shared** (skipped
as duplicates) vs **newly added**. This is surfaced on the sync result and the
SSE `provider-done` event so the UI can show, e.g.:

> Dad's Cal shares cards 0905, 2315, 3307 with Mom's Cal; added 11 new cards
> (4384, 4777, ...).

The exact wording and component placement follow existing sync-summary UI
conventions.

## Components and boundaries

- `resolveCardOwner` - new query in `src/server/db/queries/bank-accounts.ts`.
  Pure DB read; depends on `bank_accounts` + `bank_credentials`.
- `insertTransactions` - `src/server/db/queries/transactions.ts`. Changes to
  attribute per-card to the resolved owner; otherwise unchanged dedup behavior.
- `syncOneCredential` - `src/server/sync/orchestrator.ts`. Owner resolution,
  shared-vs-new classification, account upsert only for owned cards, and the
  shared/new report.
- Card-issuer change detection + post-sync `reclassifyCardPayments` call -
  `src/server/sync/orchestrator.ts` (`syncWorkspace`).
- Cleanup migration - `src/server/db/migrations/028_dedup_shared_card_accounts.sql`
  (next number after `027_billing_local_date.sql`).
- Notify summary type/render - sync result type + the sync UI component.

## Data flow

```
scrape (credential B) -> per account:
  owner = resolveCardOwner(ws, provider, accountNumber)
  if owner != B  -> shared: skip account row; txns inserted under owner
  else           -> new/owned: account row + txns under B
report shared[] / added[] per credential
...after all credentials...
runMatchingStep (transfers, atm)
if cardDataChanged -> reclassifyCardPayments (rebuild card events over all time)
```

## Error handling

- `resolveCardOwner` with no existing row returns the syncing credential
  (the card becomes newly owned). No special-casing needed.
- If two credentials return different `account_number` strings for the same
  physical card, they are treated as distinct cards (no dedup). This is an
  accepted dependency on Cal returning a stable card number; documented, not
  defended in code.
- The cleanup migration is idempotent: re-running finds no
  multi-row groups and is a no-op.

## Testing

Per the repo constraint (`better-sqlite3` will not load under `bun test`; tests
are pure-logic only):

- Unit: owner-resolution decision (shared vs new vs self-owned) as a pure
  function over a candidate list, independent of the DB.
- Unit: shared/new classification and the summary it produces.
- Unit (extends `matching.test.ts`): a per-card bill matches its cycle once
  purchases are present and prior events are cleared.
- DB-touching paths (cleanup migration, ingest attribution, post-sync rematch)
  verified via the dev server against a seeded mock database, not `bun test`.

## Assumptions

- A shared card returns an identical `account_number` from every credential that
  can see it.
- Bills are per-card (confirmed against the Cal statement: 8,411.42 = card 4384's
  monthly total).
- Provider id for Cal is `cal` (matches `CardIssuer` and stored
  `transactions.provider`).
