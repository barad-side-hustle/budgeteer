# Plan: First-class accounts within a bank connection

## Context

A single bank connection can expose more than one account. The user's Bank
Hapoalim login, for example, contains a personal account and a joint account
shared with their girlfriend. Today the app collapses them into one entry.

The reason: a `bank_credentials` row models a **login/connection**, and the UI
groups and filters everything by `credentialId` (labeled with
`bank_credentials.label`). The scraper actually returns one entry per real
account (`accountNumber`, plus an optional `balance`), and that `accountNumber`
is already stored on every `transactions` row and is part of the dedup hash, but
it is **never surfaced as its own entity**. There is no `accounts` table:
accounts exist only implicitly as `(credentialId, accountNumber)` pairs.

Goal: make each account first-class. Auto-discover accounts during sync, let the
user give each a friendly **name** and an **ownership type** (Personal / Joint /
Shared), and present accounts clearly: per-account balances/summaries on the
dashboard, filtering by real account, and account management in Bank settings.

Confirmed product decisions:
1. Accounts are **auto-created** during sync with a default name; user renames later.
2. User sets a **name** + **ownership type** (`personal` | `joint` | `shared`) per account.
3. **Full** presentation: per-account balances/summaries on the dashboard, dashboard breakdowns filterable by account, plus account management in Bank settings.

## Core design decision

**Keep `transactions` keyed by `(credentialId, accountNumber)`; do NOT add an
`accountId` FK.** `bank_accounts` becomes a pure metadata/lookup table. Every
transaction already carries `credential_id` + `account_number`, the dedup hash
already includes `account_number`, and queries already join `bank_credentials`
on `credential_id`. Adding an FK would force a full rewrite of `transactions`
and add maintenance to the hot `insertTransactions` path for zero functional
gain. Account filters resolve a selected `bank_accounts.id` to its
`(credentialId, accountNumber)` pair and filter on those columns — exactly the
pattern `appendCredentialIdsFilter` already uses.

Risk acknowledged: `transactions.credential_id` is nullable (ON DELETE SET
NULL). Orphaned rows (NULL credential) get no `bank_accounts` row and won't
appear under an account filter — identical to today's behavior for the existing
credential filter. Acceptable.

## Implementation

### 1. Data model

**New migration `src/server/db/migrations/023_bank_accounts.sql`** (highest
existing is `022`; the duplicate `020_*`/`021_*` files all sort below it, so 023
is correct):

- Create `bank_accounts`: `id`, `workspace_id` (FK workspaces, CASCADE),
  `credential_id` (FK bank_credentials, **CASCADE** — account metadata is
  meaningless once the connection is gone; intentionally different from
  `transactions.credential_id` SET NULL), `account_number TEXT NOT NULL`,
  `name TEXT NOT NULL DEFAULT '' CHECK(length(name)<=128)`,
  `ownership_type TEXT NOT NULL DEFAULT 'personal' CHECK(ownership_type IN ('personal','joint','shared'))`,
  `balance REAL`, `balance_currency TEXT`, `balance_updated_at TEXT`,
  `created_at`/`updated_at` defaults like the other tables,
  `UNIQUE(workspace_id, credential_id, account_number)`. Add indexes on
  `workspace_id` and `credential_id`.
- **Backfill** existing data in the same migration:
  `INSERT INTO bank_accounts (workspace_id, credential_id, account_number, name)
  SELECT DISTINCT workspace_id, credential_id, account_number, account_number
  FROM transactions WHERE credential_id IS NOT NULL
  ON CONFLICT(workspace_id, credential_id, account_number) DO NOTHING;`
  Default name = account number; balances fill in on next sync.

**`src/server/db/schema.ts`**: add a `bankAccounts` `sqliteTable` mirroring the
migration (follow the existing column-helper conventions: `createdAt()`,
`updatedAt()`, `.$type<...>()` for the ownership enum). Per the file's header
comment, run `bun run db:pull` afterward and reconcile by hand.

### 2. Types — `src/lib/types.ts`

Add `AccountOwnershipType = "personal" | "joint" | "shared"`, a `BankAccount`
interface (id, credentialId, provider [joined from bank_credentials for the
badge], accountNumber, name, ownershipType, balance, balanceCurrency,
balanceUpdatedAt, timestamps), and `AccountSummary extends BankAccount` with
`income`, `expense`, `net`, `transactionCount`. Optionally add
`accountName: string | null` to `Transaction`/`TransactionWithCategory` for the
per-row label.

### 3. Capture account balance from the scraper

The scraper drops `balance` today. Thread it through:
- `src/server/scrapers/types.ts`: add `balance?: number` to `ScrapedAccount`.
- `src/server/scrapers/index.ts`: add `balance: account.balance,` to the
  `result.accounts.map(...)` (the library's `TransactionsAccount.balance?: number`
  is confirmed present).
- `src/server/scrapers/one-zero.ts`: same addition in its account mapping.

### 4. Account queries — new `src/server/db/queries/bank-accounts.ts`

`import "server-only"` at top. Functions (mirror style of the existing
bank-credentials query module, reuse a `normalizeLabel`-style trim/length guard):
- `upsertBankAccount(workspaceId, credentialId, accountNumber, { balance?, balanceCurrency? })`
  — `INSERT ... ON CONFLICT(workspace_id, credential_id, account_number) DO UPDATE`
  refreshing balance/currency/`balance_updated_at` only when a balance is given,
  and **never** overwriting `name`/`ownership_type`. Default `name` to
  `accountNumber` on insert.
- `listBankAccounts(workspaceId)` and `listBankAccountsByCredential(workspaceId, credentialId)`
  — join `bank_credentials` for `provider`.
- `updateBankAccount(workspaceId, id, { name?, ownershipType? })` — validate
  ownershipType against the enum, normalize name.
- `getBankAccountById(workspaceId, id)`.
- `getAccountSummaries(workspaceId, from, to)` — `bank_accounts ba LEFT JOIN
  transactions t ON t.workspace_id=ba.workspace_id AND t.credential_id=ba.credential_id
  AND t.account_number=ba.account_number` (with `status='completed'`,
  `is_excluded=0`, date range), grouped by `ba.id`, returning per-account income
  / expense / net / count alongside the stored balance. Drives the dashboard
  per-account cards.

### 5. Account filtering in transaction queries — `src/server/db/queries/transactions.ts`

- Add `accountKeys?: { credentialId: number; accountNumber: string }[]` to
  `QueryParams` and `TransactionsSummaryParams`.
- Add `appendAccountKeysFilter(conditions, values, accountKeys, prefix)` emitting
  one parenthesized `(... OR (credential_id=? AND account_number=?) ...)` clause,
  applied wherever `appendCredentialIdsFilter` is applied today: `queryTransactions`,
  `getTransactionsSummary` (including the `pickLargest` subquery). When both
  filters are present, account keys win (more specific).
- Optional: add `LEFT JOIN bank_accounts ba ON t.credential_id=ba.credential_id
  AND t.account_number=ba.account_number` to `TRANSACTION_LIST_SELECT`, select
  `ba.name AS account_name`, and map it in `mapTransactionRow` to power a richer
  per-row account label in `TransactionSourceCell`.

### 6. Dashboard summary filtering — `src/app/api/summary/route.ts` + query funcs

This is the largest surface. To make the whole category dashboard scopeable to an
account, thread an optional `accountKeys` filter into the summary query functions
the route calls: `getCategorySpendInRange`, `getCategoryBreakdown`,
`getPeriodTotal`, `getPeriodCount`, `getTopMerchantPerCategory`,
`getNeedsReviewCountByCategory`, `getMonthlySummary`, `getTopMerchants` (all in
`transactions.ts`), and `getAutoBudgetAverage`/`getAllBudgets` stay unfiltered
(budgets are workspace-level). Each function converts its hardcoded
`.prepare(...).all(workspaceId, from, to)` into the dynamic
conditions/values pattern already used by `getTransactionsSummary`, then appends
the account-key clause. The route parses `accountIds` (multi), resolves them to
`(credentialId, accountNumber)` via `listBankAccounts`, and passes `accountKeys`
through. No accountIds → unchanged workspace-wide behavior.

### 7. API routes

- `src/app/api/accounts/route.ts` (new): `GET` → `listBankAccounts`, optionally
  folding in `getAccountSummaries` when `?from&to` present.
- `src/app/api/accounts/[id]/route.ts` (new): `PATCH` body `{ name?, ownershipType? }`
  → `updateBankAccount`; 400 on invalid ownershipType.
- `src/app/api/transactions/route.ts` and `src/app/api/transactions/summary/route.ts`:
  parse `accountIds` like `credentialIds`, resolve to account keys, pass through.
- `src/lib/api.ts`: add `listAccounts()`, `updateAccount(id, {...})`, and extend
  the transactions/summary/dashboard fetchers to forward `accountIds`.

### 8. UI

- **Transactions filter** (`src/components/transactions/transactions-page.tsx` +
  `src/components/dashboard/transactions-table.tsx`): add an `["accounts"]` query
  (`listAccounts`); rebuild `accountOptions` from real accounts (grouped under
  their connection's provider badge), so two Hapoalim accounts show as two
  entries labeled by account `name` (fallback `accountNumber`). The page's
  `accountFilter` now holds `bank_accounts.id[]` sent as `accountIds`. Update the
  query key + fetch accordingly. `showAccountFilter` stays `length > 1`.
- **Dashboard** (`src/components/dashboard/dashboard.tsx`): add a global account
  filter control near the period selector and a new
  `account-summary-cards.tsx` rendering per-account balance + income/expense/net
  (from `/api/accounts?from&to`). Selecting an account passes `accountIds` into
  the `["summary", from, to, accountIds]` query so hero + category grid scope to
  that account.
- **Account management** (`src/components/settings/bank-detail-sheet.tsx`): in
  edit mode add an "Accounts" section listing accounts for `connected.id`
  (`["accounts", credentialId]` query). Each row: name `Input` + ownership-type
  `Select` (reuse `components/ui` primitives — note base-ui `Select`
  `onValueChange` returns `string | null`), saved via `updateAccount` +
  `invalidateQueries(["accounts"])`. Follow the existing `useMutation`/toast
  patterns in this file.

### 9. i18n

Add every new string key to **both** `src/i18n/messages/en.json` and `he.json`
with identical key sets, all actually referenced (the `i18n:check` gate fails on
missing keys, orphan keys, and on `en`/`he` mismatch). Do **not** extend the
baseline ignore list in `scripts/check-i18n.mjs`. New keys: ownership labels,
account section heading/name/saved, dashboard per-account labels, etc.
(`transactions.filterAccount` already exists — reuse).

## Suggested order

1. Migration 023 + `schema.ts` (`bun run db:pull` reconcile) → 2. types →
3. scraper balance threading → 4. `bank-accounts.ts` queries →
5. orchestrator upsert (`src/server/sync/orchestrator.ts`: after a successful
scrape, loop `result.accounts` and `upsertBankAccount`) →
6. `transactions.ts` accountKeys filter + optional name join →
7. summary query funcs + routes accountIds → 8. `api.ts` client →
9. UI (transactions filter, dashboard cards/filter, settings accounts section) →
10. i18n keys → 11. `bun run ci`.

## Risks / CI gates

- **Dedup untouched**: do not modify `dedup.ts` or the hash. Accounts are a pure
  metadata overlay; this is the whole reason for not adding an `accountId` FK.
- **ON DELETE asymmetry** (intentional): `bank_accounts.credential_id` CASCADE
  vs `transactions.credential_id` SET NULL.
- **Nullable credentialId**: orphaned transactions get no account row / filter
  entry (same blind spot as today's credential filter).
- **`knip`**: every new export must be imported somewhere — no speculative exports.
- **`react:doctor`**: new client components must follow Rules of React; copy the
  existing `useQuery`/`useMutation` + `invalidateQueries` patterns.
- **`typecheck`**: adding `accountKeys` to shared param types means updating every
  call site of the summary query functions.
- **OneZero balance currency**: scraper balance has no explicit currency; default
  to the account's transaction currency / `ILS` and document the assumption.

## Verification

1. `bun run db:reset` (or delete `data/budgeteer.db*`) then `bun dev`; confirm
   migration 023 applies cleanly and `bank_accounts` exists.
2. Run a sync (real Hapoalim, or seed transactions with two distinct
   `account_number`s under one credential via the setup API in CLAUDE.md). Confirm
   two `bank_accounts` rows auto-create with default names and a balance snapshot.
3. Bank settings → open the connection → rename each account and set ownership
   type (Personal / Joint); reload and confirm persistence.
4. Transactions page: account filter shows two distinct entries; filtering by one
   narrows the list correctly.
5. Dashboard: per-account cards show each balance + income/expense/net; selecting
   an account scopes hero + category grid; clearing returns to workspace totals.
6. `bun run ci` passes (format, i18n, knip, react:doctor, typecheck, tests).
