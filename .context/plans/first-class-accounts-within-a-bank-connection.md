# Plan: First-class accounts within a bank connection

## Context

A single bank login can expose multiple real accounts. The user's Bank Hapoalim
login contains a personal account and a joint account; today Budgeteer collapses
them into one entry because a `bank_credentials` row models a **login/connection**
and the entire UI groups/filters by `credentialId` (labeled with
`bank_credentials.label`, surfaced in the app as the `Integration` entity).

The scraper already returns one entry per real account (`accountNumber`, plus an
optional `balance` it currently **drops**), and `accountNumber` is stored on every
`transactions` row and is part of the dedup hash. But accounts exist only
implicitly as `(credentialId, accountNumber)` pairs — there is no `accounts`
table and no way to name or scope by a real account.

**Goal:** make each account first-class. Auto-discover accounts during sync, let
the user give each a friendly **name** and an **ownership type**
(Personal / Joint / Shared), and present accounts clearly: per-account
balances/summaries on the dashboard, filtering by real account, and account
management in Bank settings.

Confirmed product decisions:
1. Accounts are **auto-created** during sync with a default name (the account
   number); user renames later.
2. User sets a **name** + **ownership type** (`personal` | `joint` | `shared`) per account.
3. **Full** presentation: per-account balances/summaries on the dashboard,
   dashboard breakdowns filterable by account, plus account management in Bank settings.
4. Stored balance currency: **default to `ILS`** (library gives balance without a
   currency; documented assumption).
5. Transactions table "Source" cell shows the **per-account name** (requires an
   `account_name` join on the row query).

## Core design decision

**Keep `transactions` keyed by `(credentialId, accountNumber)`; do NOT add an
`accountId` FK.** `bank_accounts` becomes a pure metadata/lookup table. Every
transaction already carries `credential_id` + `account_number`, the dedup hash
already includes `account_number`, and queries already join `bank_credentials` on
`credential_id`. Adding an FK would force a full rewrite of `transactions` and add
maintenance to the hot `insertTransactions` path for zero functional gain. Account
filters resolve a selected `bank_accounts.id` to its `(credentialId,
accountNumber)` pair and filter on those columns — exactly the pattern
`appendCredentialIdsFilter` (`src/server/db/queries/transactions.ts:163`) already
uses.

**Do NOT touch `src/server/lib/dedup.ts` or the hash.** Accounts are a pure
metadata overlay; this is the entire reason for not adding an `accountId` FK.

Risk acknowledged: `transactions.credential_id` is nullable (ON DELETE SET NULL,
`schema.ts:111`). Orphaned rows (NULL credential) get no `bank_accounts` row and
won't appear under an account filter — identical to today's behavior for the
existing credential filter. Acceptable.

## Implementation

### 1. Data model — migration + schema

**New migration `src/server/db/migrations/023_bank_accounts.sql`** (022 is the
highest logical number; `migrate.ts:34` sorts lexicographically so 023 is next):

- Create `bank_accounts`: `id`, `workspace_id` (FK workspaces, CASCADE),
  `credential_id` (FK bank_credentials, **CASCADE** — account metadata is
  meaningless once the connection is gone; intentionally different from
  `transactions.credential_id` SET NULL), `account_number TEXT NOT NULL`,
  `name TEXT NOT NULL DEFAULT '' CHECK(length(name)<=128)`,
  `ownership_type TEXT NOT NULL DEFAULT 'personal' CHECK(ownership_type IN ('personal','joint','shared'))`,
  `balance REAL`, `balance_currency TEXT`, `balance_updated_at TEXT`,
  `created_at`/`updated_at` with the same `datetime('now')` defaults as other
  tables, `UNIQUE(workspace_id, credential_id, account_number)`. Indexes on
  `workspace_id` and `credential_id`.
- **Backfill** in the same migration:
  `INSERT INTO bank_accounts (workspace_id, credential_id, account_number, name)
  SELECT DISTINCT workspace_id, credential_id, account_number, account_number
  FROM transactions WHERE credential_id IS NOT NULL
  ON CONFLICT(workspace_id, credential_id, account_number) DO NOTHING;`
  Default name = account number; balances fill in on next sync.

**`src/server/db/schema.ts`**: add a `bankAccounts` `sqliteTable` mirroring the
migration, following the existing helpers (`createdAt()`/`updatedAt()` at lines
14-15, `.$type<AccountOwnershipType>()` for the ownership enum like
`kind` at line 49). Per the file header comment, run `bun run db:pull` afterward
and reconcile by hand.

### 2. Types — `src/lib/types.ts`

Add `AccountOwnershipType = "personal" | "joint" | "shared"`, a `BankAccount`
interface (id, credentialId, provider [joined from bank_credentials for the
badge], accountNumber, name, ownershipType, balance, balanceCurrency,
balanceUpdatedAt, timestamps), and `AccountSummary extends BankAccount` with
`income`, `expense`, `net`, `transactionCount`. Add `accountName: string | null`
to `Transaction`/`TransactionWithCategory` for the per-row label (decision #5;
distinct from the existing `accountLabel`, which is the connection label).

### 3. Capture account balance from the scraper

- `src/server/scrapers/types.ts`: add `balance?: number` to `ScrapedAccount`
  (currently only `accountNumber` + `transactions`, lines 18-21).
- `src/server/scrapers/index.ts`: add `balance: account.balance,` to the
  `result.accounts.map(...)` at line 178.
- `src/server/scrapers/one-zero.ts`: same addition in `mapAccounts` (lines 58-82).

Note: `node_modules` is not installed in this workspace, so confirm
`account.balance` typechecks against `israeli-bank-scrapers@6.7.5`'s
`TransactionsAccount` during the build (it is a documented public field). No
currency comes from the library — default to `ILS` at the upsert layer (decision #4).

### 4. Account queries — new `src/server/db/queries/bank-accounts.ts`

`import "server-only"` at top. Mirror the style of
`src/server/db/queries/bank-credentials.ts`. Add a **non-throwing**
`normalizeAccountName` (trim + 128-char clamp, default to `accountNumber` when
empty) — distinct from `normalizeLabel` (`bank-credentials.ts:31`) which throws on
empty:

- `upsertBankAccount(workspaceId, credentialId, accountNumber, { balance?, balanceCurrency? })`
  — `INSERT ... ON CONFLICT(workspace_id, credential_id, account_number) DO UPDATE`
  refreshing balance/currency/`balance_updated_at` only when a balance is given,
  and **never** overwriting `name`/`ownership_type`. Default `name` to
  `accountNumber`, `balance_currency` to `ILS` on insert.
- `listBankAccounts(workspaceId)` and
  `listBankAccountsByCredential(workspaceId, credentialId)` — join
  `bank_credentials` for `provider`.
- `updateBankAccount(workspaceId, id, { name?, ownershipType? })` — validate
  ownershipType against the enum, normalize name.
- `getBankAccountById(workspaceId, id)`.
- `getAccountSummaries(workspaceId, from, to)` — `bank_accounts ba LEFT JOIN
  transactions t ON t.workspace_id=ba.workspace_id AND
  t.credential_id=ba.credential_id AND t.account_number=ba.account_number` (with
  `status='completed'`, `is_excluded=0`, date range), grouped by `ba.id`,
  returning per-account income/expense/net/count alongside the stored balance.
  Drives the dashboard per-account cards.

### 5. Sync orchestrator — auto-upsert accounts

`src/server/sync/orchestrator.ts`, in `syncOneCredential` immediately **after**
`insertTransactions` (line 246) and before `applyMerchantRulesToSyncRun` (~line
247): loop `result.accounts` and call `upsertBankAccount(workspaceId, meta.id,
account.accountNumber, { balance: account.balance })`. The orchestrator already
has `workspaceId`, `meta.id` (credentialId), and `result.accounts` in scope.

### 6. Account filtering in transaction queries — `src/server/db/queries/transactions.ts`

- Add `accountKeys?: { credentialId: number; accountNumber: string }[]` to
  `QueryParams` (line 141) and `TransactionsSummaryParams` (line 829).
- Add `appendAccountKeysFilter(conditions, values, accountKeys, prefix)` emitting
  one parenthesized `((credential_id=? AND account_number=?) OR ...)` clause,
  modeled on `appendCredentialIdsFilter`. Apply it wherever
  `appendCredentialIdsFilter` is applied: `queryTransactions` (line 193),
  `getTransactionsSummary` (line 835, including the `pickLargest` subquery, lines
  875-895). When both filters are present, account keys win (more specific).
- Add `LEFT JOIN bank_accounts ba ON t.credential_id=ba.credential_id AND
  t.account_number=ba.account_number` to `TRANSACTION_LIST_SELECT` (line 188),
  select `ba.name AS account_name`, and map it in `mapTransactionRow` to populate
  `Transaction.accountName` (decision #5).

### 7. Dashboard summary filtering — query funcs + `src/app/api/summary/route.ts`

Largest surface. `/api/summary/route.ts` has **no filtering today**, so this is
greenfield. Thread an optional `accountKeys` filter into the summary query
functions the route calls, converting each from its hardcoded
`.prepare(...).all(workspaceId, from, to)` form into the dynamic
conditions/values pattern already used by `getTransactionsSummary`, then append
the account-key clause:

- In `transactions.ts`: `getCategorySpendInRange` (512), `getCategoryBreakdown`
  (483), `getPeriodTotal` (651), `getPeriodCount` (663),
  `getTopMerchantPerCategory` (536), `getNeedsReviewCountByCategory` (935),
  `getMonthlySummary` (415), `getTopMerchants` (462).
- `getAutoBudgetAverage`/`getAllBudgets` live in `budgets.ts` and **stay
  unfiltered** (budgets are workspace-level).
- The route parses `accountIds` (multi) via `searchParams.getAll(...)`, resolves
  them to `(credentialId, accountNumber)` via `listBankAccounts`, and passes
  `accountKeys` through. No `accountIds` → unchanged workspace-wide behavior.

### 8. API routes + client

- `src/app/api/accounts/route.ts` (new): `GET` → `listBankAccounts`, folding in
  `getAccountSummaries` when `?from&to` present. Resolve workspace via
  `getWorkspaceIdFromRequest`.
- `src/app/api/accounts/[id]/route.ts` (new): `PATCH` body `{ name?, ownershipType? }`
  → `updateBankAccount`; 400 on invalid ownershipType.
- `src/app/api/transactions/route.ts` (line 23) and
  `src/app/api/transactions/summary/route.ts` (line 15): parse `accountIds` like
  `credentialIds`, resolve to account keys, pass through.
- `src/lib/api.ts`: add `listAccounts()`, `updateAccount(id, {...})`, and extend
  the transactions/summary/dashboard fetchers to forward `accountIds` (same
  `URLSearchParams.append` loop used for `credentialIds`).

### 9. UI

- **Transactions filter** (`src/components/transactions/transactions-page.tsx` +
  `src/components/dashboard/transactions-table.tsx`): add an `["accounts"]` query
  (`listAccounts`); rebuild `accountOptions` (currently from `integrations`,
  table line 225) from real accounts grouped under their connection's provider
  badge, so two Hapoalim accounts show as two entries labeled by account `name`
  (fallback `accountNumber`). `accountFilter` state (page line 32) becomes
  `bank_accounts.id[]` sent as `accountIds`; update the query key (line 61) and
  fetch (line 79). `showAccountFilter` stays `length > 1`.
- **Dashboard** (`src/components/dashboard/dashboard.tsx`): add a global account
  filter near the period selector and a new `account-summary-cards.tsx` rendering
  per-account balance + income/expense/net (from `/api/accounts?from&to`).
  Selecting accounts passes `accountIds` into the `["summary", from, to,
  accountIds]` query (currently `["summary", from, to]`, line 59) so hero +
  category grid scope to those accounts.
- **Account management** (`src/components/settings/bank-detail-sheet.tsx`): in
  edit mode add an "Accounts" section listing accounts for `connected.id`
  (`["accounts", credentialId]` query). Each row: name `Input` + ownership-type
  `Select` (base-ui `Select` `onValueChange` returns `string | null`), saved via
  `updateAccount` + `invalidateQueries(["accounts"])`. Follow the existing
  `useMutation`/toast/`invalidateQueries` patterns in this file.

### 10. i18n

Add every new string key to **both** `src/i18n/messages/en.json` and `he.json`
with identical key sets, all actually referenced (the `i18n:check` gate fails on
missing keys, orphan keys, and on en/he mismatch). Do **not** extend the baseline
ignore list in `scripts/check-i18n.mjs`. New keys: ownership labels, account
section heading/name/saved, dashboard per-account labels, etc.
(`transactions.filterAccount` already exists — reuse).

## Suggested order

1. Migration 023 + `schema.ts` (`bun run db:pull` reconcile) → 2. types →
3. scraper balance threading → 4. `bank-accounts.ts` queries → 5. orchestrator
upsert → 6. `transactions.ts` accountKeys filter + name join → 7. summary query
funcs + routes accountIds → 8. `api.ts` client + new account routes →
9. UI (transactions filter, dashboard cards/filter, settings accounts section) →
10. i18n keys → 11. `bun run ci`.

## Risks / CI gates

- **Dedup untouched**: do not modify `dedup.ts` or the hash.
- **ON DELETE asymmetry** (intentional): `bank_accounts.credential_id` CASCADE vs
  `transactions.credential_id` SET NULL.
- **Nullable credentialId**: orphaned transactions get no account row / filter
  entry (same blind spot as today's credential filter).
- **`typecheck`**: adding `accountKeys` to shared param types means updating every
  call site of the summary query functions.
- **`knip`**: every new export must be imported somewhere — no speculative exports.
- **`react:doctor`**: new client components must follow Rules of React; copy the
  existing `useQuery`/`useMutation` + `invalidateQueries` patterns.
- **Balance currency**: stored as `ILS` by assumption (decision #4); document it
  in the upsert function.
- **Library types**: `node_modules` not installed here — confirm
  `account.balance` typechecks once dependencies are present.

## Verification

1. `bun run db:reset` (or delete `data/budgeteer.db*`) then `bun dev`; confirm
   migration 023 applies cleanly and `bank_accounts` exists with backfilled rows.
2. Run a sync (real Hapoalim, or seed two distinct `account_number`s under one
   credential via the setup API in CLAUDE.md). Confirm two `bank_accounts` rows
   auto-create with default names and a balance snapshot.
3. Bank settings → open the connection → rename each account and set ownership
   type (Personal / Joint); reload and confirm persistence.
4. Transactions page: account filter shows two distinct entries; filtering by one
   narrows the list; the Source cell shows the per-account name.
5. Dashboard: per-account cards show each balance + income/expense/net; selecting
   an account scopes hero + category grid; clearing returns to workspace totals.
6. `bun run ci` passes (format, i18n, knip, react:doctor, typecheck, tests).
