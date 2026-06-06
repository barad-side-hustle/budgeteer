# Irrelevant transactions design

Date: 2026-05-18
Status: Draft, pending user review

## Goal

Let the user mark a transaction as **irrelevant** so it stops polluting every aggregate (totals, charts, budgets, top merchants) and disappears from the default transactions list. A per-merchant rule auto-applies the flag on future syncs, so a recurring noise row (e.g. the bank's monthly "ישראכרט" summary line that double-counts the credit card already scraped directly) is hidden once and stays hidden.

## Motivating use case

The user connects both Bank Hapoalim and Isracard. Hapoalim's transaction feed contains one row per month with description "ישראכרט" that equals the full credit-card bill. The individual purchases that make up that bill are already in the database via the Isracard scraper. The summary line is pure double-counting noise.

## Non-goals

- Globally-scoped rules. A rule is always tied to a single `(provider, description)` pair within a workspace.
- Amount-range or date-window matching. Description match alone is sufficient for the motivating case; smarter matching can be added later if needed.
- Bulk-marking from a list selection. Single-row action only for v1.
- Showing irrelevant transactions in any aggregate, ever. Once flagged they are excluded from every number on the dashboard.
- A dedicated "Hidden merchants" management screen. The rule list lives inside Settings as a small section.

## Why not reuse `kind = 'transfer'`?

`kind = 'transfer'` already excludes a row from expense/income aggregates, so on paper it looks like a fit. It is not, for three reasons:

1. **Semantics.** A credit-card payment from a checking account IS technically a transfer. If the user also uses `transfer` for genuine money movement (savings sweep, payday→trading account), mixing in noise rows dilutes the meaning and makes the existing "Transfers" view useless as a real signal.
2. **List visibility.** Transfers currently still appear in the transactions table. The user explicitly wants noise rows hidden by default.
3. **No memory.** `kind` is a per-row label with no future-syncs behavior. The recurring-merchant case needs a rule.

A dedicated `is_excluded` flag keeps the model clean: `kind` describes *what* a transaction is, `is_excluded` describes *whether the user wants it counted*.

## Data model

### Migration 020

**1. Column on `transactions`:**

```sql
ALTER TABLE transactions
  ADD COLUMN is_excluded INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_transactions_workspace_excluded
  ON transactions(workspace_id, is_excluded);
```

The index supports the "show hidden count" query and is also useful as a partial filter for the main list (most rows will be 0).

**2. New table `excluded_merchants`:**

```sql
CREATE TABLE excluded_merchants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  merchant_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, provider, merchant_key)
);

CREATE INDEX idx_excluded_merchants_lookup
  ON excluded_merchants(workspace_id, provider, merchant_key);
```

`merchant_key` is the exact `transactions.description` value. We do not normalize it — Isracard summary lines from the same bank have a stable description, and exact match is the safest matching strategy (no false positives).

## Sync integration

After `insertTransactions` returns inside the sync route, run a single UPDATE that flags any newly-inserted row matching an existing rule:

```sql
UPDATE transactions
SET is_excluded = 1, updated_at = datetime('now')
WHERE workspace_id = ?
  AND sync_run_id = ?
  AND is_excluded = 0
  AND EXISTS (
    SELECT 1 FROM excluded_merchants em
    WHERE em.workspace_id = transactions.workspace_id
      AND em.provider = transactions.provider
      AND em.merchant_key = transactions.description
  );
```

Scoped to the current `sync_run_id` so we only touch what we just inserted. Indexed join makes this cheap even with a few hundred new rows.

## Query changes

Every aggregate currently filtering `kind = 'expense'` also adds `AND is_excluded = 0`. Concretely, in `src/server/db/queries/transactions.ts`:

- `getMonthlySummary`
- `getTopMerchants`
- `getCategoryBreakdown`
- `getCategorySpendInRange`
- `getTopMerchantPerCategory`
- `getCategorySpendByDay`
- `getTopMerchantsForCategory`
- `getPeriodTotal`
- `getPeriodCount`
- `getNeedsReviewCountByCategory`
- `getTransactionsSummary` (both the `income` and `expense` aggregates, the `pickLargest` helper, the `topMerchantsRows` query, and the `pendingReview` count)
- `getUncategorizedTransactionIds` and `getUncategorizedIdsByKind` (no point asking the AI to categorize noise)

In other query files, audit and apply the same filter wherever the dashboard reads transactions for any aggregate:

- `src/server/db/queries/home.ts` — any `kind = 'expense'` query.
- `src/server/db/queries/budgets.ts` — budget spend totals must exclude.
- `src/server/db/queries/category-corrections.ts` — only if it reads transactions; check.

`queryTransactions` (the list view) does NOT auto-filter excluded rows. Instead it gains a new param `includeExcluded?: boolean` (default `false`). When `false`, append `AND t.is_excluded = 0`. When `true`, no filter — both excluded and non-excluded rows return so the user can manage them.

The list also needs a separate count query for the header toggle: how many hidden rows fall within the current filters. This is `queryTransactions` with `includeExcluded: true` minus the default count, or a dedicated `countHiddenTransactions(workspaceId, filters)` — implementer's call.

## API

### `PATCH /api/transactions/:id`

Already exists. Add support for `excluded` in the body:

```ts
{ excluded: boolean, rememberMerchant?: boolean }
```

- `excluded: true` → set `is_excluded = 1`. If `rememberMerchant` is also true, insert into `excluded_merchants` using the row's `provider` and `description` (`INSERT OR IGNORE` on the unique constraint).
- `excluded: false` → set `is_excluded = 0`. Does NOT remove the rule, since the user may want to keep auto-hiding future ones while un-hiding this specific row. Removing the rule is a separate Settings action.

This piggy-backs on the existing PATCH handler shape (which already handles `approve` and `kind`). Add `excluded` as a third disjoint branch.

### `GET /api/transactions`

Add `?includeExcluded=1` query param. Default behavior unchanged.

### `GET /api/excluded-merchants` and `DELETE /api/excluded-merchants/:id`

New routes. Lists/deletes rules within the current workspace. Deletion of a rule does NOT un-exclude historical rows — those stay flagged. (We could add a `?unflagHistorical=1` query if asked.)

## UI

### Row action menu

In `src/components/dashboard/transactions-table.tsx`, the existing `MoreHorizontal` dropdown (currently shows kind-change options) gains:

- **Hide transaction** (when `!txn.isExcluded`)
- **Show transaction** (when `txn.isExcluded`)

Clicking "Hide transaction" fires `PATCH /api/transactions/:id` with `{ excluded: true, rememberMerchant: false }` and then surfaces a toast:

> Hidden. *Also hide future "ישראכרט" from Hapoalim?* **\[Yes]**  ·  **\[Undo]**

- **Yes** → second PATCH with `rememberMerchant: true` (and `excluded: true` no-op).
- **Undo** → PATCH with `{ excluded: false }`.
- Toast auto-dismisses in ~6 seconds.

Two-step toast (rather than a confirm dialog) keeps the common case one click while still offering the rule shortcut.

### Header toggle

Next to the search input and category select, a new control:

> **Show hidden (N)** [toggle]

When `N = 0` the toggle is dimmed and disabled. When on, the table includes excluded rows rendered at ~50% opacity with a small **Hidden** badge in the description column. The row action menu still works, so the user can "Show transaction" to un-hide.

### Settings page

A new sub-route `src/app/settings/hidden-merchants/page.tsx` registered in `settings-sidebar.tsx`, rendering a section titled **Hidden merchants**:

> When you hide a transaction, we can remember the merchant so future ones are automatically hidden. These rules apply only to the bank they were learned from.

Below: a list of rule rows. Each row shows the provider (using the existing provider label/logo helpers in `src/lib/types.ts`), the merchant description, and a small `Remove` button. Empty state: a one-line "No hidden merchants yet" placeholder.

## Type changes

`src/lib/types.ts`:

- Add `isExcluded: boolean` to `TransactionWithCategory`.
- Add `ExcludedMerchant` type for the Settings list.

`src/lib/api.ts`:

- New helper `setTransactionExcluded(id, excluded, rememberMerchant?)`.
- New helpers `listExcludedMerchants()` and `deleteExcludedMerchant(id)`.

`mapTransactionRow` in the transactions query file: pull `is_excluded` and convert to boolean.

## i18n

New keys under `transactions` (English + Hebrew):

- `rowHide` / `rowShow` — dropdown menu item.
- `toastHidden` — "Transaction hidden."
- `toastHideMerchantPrompt` — "Also hide future {merchant} from {provider}?"
- `toastYes` / `toastUndo`.
- `showHidden` / `showHiddenZero` — header toggle label.
- `hiddenBadge` — "Hidden" badge text.

Under `settings`:

- `hiddenMerchantsTitle`, `hiddenMerchantsDescription`, `hiddenMerchantsEmpty`, `hiddenMerchantsRemove`.

## Testing checklist

Manual end-to-end flow to verify before completion:

1. Seed two transactions with same description for the same provider (use the test fetch trick in `CLAUDE.md`).
2. Hide one without remembering → it disappears, the other stays.
3. Verify monthly summary total, hero card, category breakdown, and top merchants all dropped by the hidden amount.
4. Toggle "Show hidden" → both rows visible, hidden one is dimmed with badge.
5. Hide the second one and accept "remember merchant".
6. Run another sync that produces a third matching row → it arrives already hidden.
7. Open Settings → Hidden merchants → row appears → click Remove → rule gone.
8. Hide a transaction, then click "Show" via the row menu → un-hidden, rule (if any) remains.
9. Verify with `kind = 'transfer'` and `kind = 'income'` rows: hiding works regardless of kind.
10. Try the budget detail sheet for a category that had a hidden row in it — totals reflect the exclusion.

## Out of scope (for this spec)

- A separate badge in the transactions list distinguishing "auto-hidden by rule" vs "manually hidden" — we may add this if it turns out to matter.
- Hiding by amount range, date window, or regex match.
- Bulk-hide from selection.
- Telling the AI categorizer about hidden merchants in a smarter way (currently they're just skipped because `category_id IS NULL` filter doesn't match — already handled by the query change).
- A keyboard shortcut for hide.
