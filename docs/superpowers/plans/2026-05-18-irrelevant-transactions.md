# Irrelevant transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user mark transactions as irrelevant. Marked rows are excluded from every aggregate (totals, charts, budgets, top merchants) and hidden from the default list. An optional per-merchant rule auto-applies the flag on future syncs so the recurring noise row (e.g. the bank's monthly Isracard summary line) stays hidden.

**Architecture:** A new `is_excluded` boolean column on `transactions` plus a new `excluded_merchants` rule table. Every existing aggregate query gains `AND is_excluded = 0`. The list view gets an `includeExcluded` parameter to support a "Show hidden" toggle. After every sync, an indexed UPDATE flags newly-inserted rows that match a stored rule. UI: row action menu gains Hide/Show with a "remember this merchant" toast prompt; Settings gets a Hidden merchants management page.

**Tech Stack:** Next.js 16 (App Router, server components by default), TypeScript strict, better-sqlite3, shadcn/ui v4 (base-ui), Tailwind v4, react-query, next-intl. No automated test framework — every behavioral check is a manual verification step against `npm run dev` (per `CLAUDE.md`).

**Source-of-truth spec:** [docs/superpowers/specs/2026-05-18-irrelevant-transactions-design.md](../specs/2026-05-18-irrelevant-transactions-design.md)

---

## Conventions used throughout this plan

- Working dir for all commands: `/Users/shayavivi/Desktop/Projects/Budgeteer`.
- Commit style: conventional commits. No em dashes anywhere.
- Dev server: `npm run dev` on `127.0.0.1:3000`. Restart only when needed (HMR handles most edits; restart when migrations change or `next.config.ts` changes).
- Workspace header for API calls: `X-Workspace-ID: 1` (default workspace seeded by migration 013).
- Reset DB if a migration is wrong: `rm -f data/budgeteer.db*` and restart dev. The user already has data — do NOT do this on the user's machine, only on a scratch instance if needed.

---

## Task 1: Migration 020 — DB schema

**Files:**
- Create: `src/server/db/migrations/020_excluded.sql`

- [ ] **Step 1: Write the migration**

Create `src/server/db/migrations/020_excluded.sql`:

```sql
ALTER TABLE transactions
  ADD COLUMN is_excluded INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_transactions_workspace_excluded
  ON transactions(workspace_id, is_excluded);

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

- [ ] **Step 2: Apply the migration**

Restart dev so the DB layer re-opens and applies the migration:

```bash
# If dev is running, stop it (Ctrl-C in the dev terminal).
npm run dev
```

Open the app at `http://127.0.0.1:3000` once. The migration runs lazily on first DB access.

- [ ] **Step 3: Verify the migration applied**

In a new terminal:

```bash
sqlite3 data/budgeteer.db ".schema transactions" | grep is_excluded
sqlite3 data/budgeteer.db ".schema excluded_merchants"
sqlite3 data/budgeteer.db "SELECT name FROM _migrations ORDER BY id DESC LIMIT 3;"
```

Expected:
- First command prints a line containing `is_excluded INTEGER NOT NULL DEFAULT 0`.
- Second command prints the `CREATE TABLE excluded_merchants (...)` body.
- Third command lists `020_excluded.sql` at the top.

- [ ] **Step 4: Verify foreign-key health**

```bash
sqlite3 data/budgeteer.db "PRAGMA foreign_key_check;"
```

Expected: no output (no violations).

- [ ] **Step 5: Commit**

```bash
git add src/server/db/migrations/020_excluded.sql
git commit -m "feat(db): add is_excluded column and excluded_merchants table"
```

---

## Task 2: Type definitions

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Open `src/lib/types.ts` and find the `TransactionWithCategory` interface.**

Add `isExcluded: boolean;` to the interface, immediately after `needsReview: boolean;`:

```ts
export interface TransactionWithCategory {
  // ... existing fields ...
  needsReview: boolean;
  isExcluded: boolean;
  // ... rest of fields ...
}
```

- [ ] **Step 2: Add the `ExcludedMerchant` type to the same file**

Add at the bottom of the file (or near other settings/rule types — pick the spot consistent with the existing organization):

```ts
export interface ExcludedMerchant {
  id: number;
  provider: string;
  merchantKey: string;
  createdAt: string;
}
```

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
npx tsc --noEmit
```

Expected: many errors complaining that `isExcluded` is missing from objects we build, because we haven't updated the mappers yet. This is fine — it confirms the type is being enforced. We will fix these errors over the next tasks.

If you see compile errors NOT related to `isExcluded` or `ExcludedMerchant`, stop and investigate — those are pre-existing or signal a different problem.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add isExcluded flag and ExcludedMerchant type"
```

---

## Task 3: Server-side queries — excluded merchants module

**Files:**
- Create: `src/server/db/queries/excluded-merchants.ts`

- [ ] **Step 1: Create the file with full CRUD + the sync helper**

Create `src/server/db/queries/excluded-merchants.ts`:

```ts
import "server-only";

import { getDb } from "../index";
import type { ExcludedMerchant } from "@/lib/types";

interface RawExcludedMerchantRow {
  id: number;
  provider: string;
  merchant_key: string;
  created_at: string;
}

function mapRow(row: RawExcludedMerchantRow): ExcludedMerchant {
  return {
    id: row.id,
    provider: row.provider,
    merchantKey: row.merchant_key,
    createdAt: row.created_at,
  };
}

export function listExcludedMerchants(workspaceId: number): ExcludedMerchant[] {
  const rows = getDb()
    .prepare(
      `SELECT id, provider, merchant_key, created_at
       FROM excluded_merchants
       WHERE workspace_id = ?
       ORDER BY created_at DESC, id DESC`
    )
    .all(workspaceId) as RawExcludedMerchantRow[];
  return rows.map(mapRow);
}

export function addExcludedMerchant(
  workspaceId: number,
  provider: string,
  merchantKey: string
): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO excluded_merchants (workspace_id, provider, merchant_key)
       VALUES (?, ?, ?)`
    )
    .run(workspaceId, provider, merchantKey);
}

export function deleteExcludedMerchant(
  workspaceId: number,
  id: number
): boolean {
  const result = getDb()
    .prepare(
      `DELETE FROM excluded_merchants WHERE workspace_id = ? AND id = ?`
    )
    .run(workspaceId, id);
  return result.changes > 0;
}

/**
 * Flags all rows just inserted by the given sync run that match an existing
 * excluded_merchants rule. Called once per sync immediately after
 * insertTransactions returns. Cheap indexed join.
 */
export function applyMerchantRulesToSyncRun(
  workspaceId: number,
  syncRunId: number
): number {
  const result = getDb()
    .prepare(
      `UPDATE transactions
       SET is_excluded = 1, updated_at = datetime('now')
       WHERE workspace_id = ?
         AND sync_run_id = ?
         AND is_excluded = 0
         AND EXISTS (
           SELECT 1 FROM excluded_merchants em
           WHERE em.workspace_id = transactions.workspace_id
             AND em.provider = transactions.provider
             AND em.merchant_key = transactions.description
         )`
    )
    .run(workspaceId, syncRunId);
  return result.changes;
}
```

- [ ] **Step 2: Add a per-transaction setter for the row-action menu**

Append the following to the same file:

```ts
/**
 * Flips is_excluded for a single transaction. Used by the row "Hide / Show"
 * action. Does NOT touch the rules table.
 */
export function setTransactionExcluded(
  workspaceId: number,
  id: number,
  excluded: boolean
): void {
  getDb()
    .prepare(
      `UPDATE transactions
       SET is_excluded = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(excluded ? 1 : 0, workspaceId, id);
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: existing `isExcluded` errors still present (will be fixed in Task 4), no new errors in `excluded-merchants.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/server/db/queries/excluded-merchants.ts
git commit -m "feat(db): add excluded_merchants CRUD and sync-run rule applier"
```

---

## Task 4: Update `queryTransactions` for `includeExcluded` + mapper

**Files:**
- Modify: `src/server/db/queries/transactions.ts`

- [ ] **Step 1: Add `includeExcluded` param to `QueryParams`**

In `src/server/db/queries/transactions.ts`, locate the `QueryParams` interface (around line 134). Add the new field:

```ts
interface QueryParams {
  from?: string;
  to?: string;
  search?: string;
  category?: number;
  categoryIds?: number[];
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
  kind?: TransactionKindFilter;
  provider?: string;
  /**
   * When false (default), excluded rows are filtered out. When true,
   * both excluded and non-excluded rows are returned so the user can
   * manage them via the "Show hidden" toggle.
   */
  includeExcluded?: boolean;
}
```

- [ ] **Step 2: Apply the filter in `queryTransactions`**

In the same function (`queryTransactions`, currently around line 160), find the block that builds `conditions`. After the provider filter and before `const where = ...`, add:

```ts
if (!params.includeExcluded) {
  conditions.push("t.is_excluded = 0");
}
```

- [ ] **Step 3: Update the `TransactionRow` interface**

Locate the `TransactionRow` interface (around line 503). Add the new field next to `needs_review`:

```ts
needs_review: number;
is_excluded: number;
```

- [ ] **Step 4: Update `mapTransactionRow`**

Locate `mapTransactionRow` (around line 532). Add `isExcluded` to the returned object, next to `needsReview`:

```ts
needsReview: r.needs_review === 1,
isExcluded: r.is_excluded === 1,
```

- [ ] **Step 5: Ensure SELECT * returns the column**

The function already uses `SELECT t.*` so `is_excluded` is included automatically. No change needed to the SELECT clause.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: `mapTransactionRow`-related errors gone. Remaining errors (if any) should be about other places that build `TransactionWithCategory` objects directly without going through the mapper — fix them by adding `isExcluded: false` (those are server-built test responses, no real data).

If any non-trivial errors remain, list them and resolve before continuing.

- [ ] **Step 7: Commit**

```bash
git add src/server/db/queries/transactions.ts
git commit -m "feat(db): map is_excluded in queryTransactions and add includeExcluded filter"
```

---

## Task 5: Filter `is_excluded` from all aggregate queries in `transactions.ts`

**Files:**
- Modify: `src/server/db/queries/transactions.ts`

The pattern: every WHERE clause that currently filters `status = 'completed'` AND `kind = 'expense'` (or a `charged_amount > 0`/`< 0` variant) gets `AND is_excluded = 0` appended. Below are exact functions and the line context to find.

- [ ] **Step 1: `getMonthlySummary`**

Find:
```ts
WHERE workspace_id = ?
  AND date >= date('now', '-' || ? || ' months')
  AND status = 'completed'
  AND kind = 'expense'
```

Replace with (add the `is_excluded` clause as the final AND):
```ts
WHERE workspace_id = ?
  AND date >= date('now', '-' || ? || ' months')
  AND status = 'completed'
  AND kind = 'expense'
  AND is_excluded = 0
```

- [ ] **Step 2: `getTopMerchants`**

Append `AND is_excluded = 0` to the WHERE clause.

- [ ] **Step 3: `getCategoryBreakdown`**

Append `AND t.is_excluded = 0` to the WHERE clause (note the `t.` prefix because the query joins `categories`).

- [ ] **Step 4: `getCategorySpendInRange`**

Append `AND is_excluded = 0`.

- [ ] **Step 5: `getTopMerchantPerCategory`**

Append `AND is_excluded = 0` to the inner subquery's WHERE.

- [ ] **Step 6: `getCategorySpendByDay`**

Find the `LEFT JOIN transactions t ON ...` block. Add a new ON-clause condition:
```ts
AND t.is_excluded = 0
```
(must be on the JOIN, not WHERE — `WHERE` would turn the LEFT JOIN into an inner join and drop days with no spend).

- [ ] **Step 7: `getTopMerchantsForCategory`**

Append `AND is_excluded = 0` to the WHERE clause.

- [ ] **Step 8: `getPeriodTotal`**

Append `AND is_excluded = 0`.

- [ ] **Step 9: `getPeriodCount`**

Append `AND is_excluded = 0`.

- [ ] **Step 10: `getTransactionsSummary` — all four sub-queries**

This function contains four SQL queries: `incomeAgg`, `expenseAgg`, `pickLargest`, `topMerchantsRows`, and `pendingReview`. Append `AND is_excluded = 0` to all five WHERE clauses. (`pickLargest` uses table alias `t` — use `t.is_excluded = 0` there.)

- [ ] **Step 11: `getNeedsReviewCountByCategory`**

Append `AND is_excluded = 0`.

- [ ] **Step 12: `getUncategorizedTransactionIds`**

Append `AND is_excluded = 0`. (No point asking AI to categorize hidden rows.)

- [ ] **Step 13: `getUncategorizedIdsByKind`**

Append `AND is_excluded = 0`.

- [ ] **Step 14: Type-check + lint**

```bash
npx tsc --noEmit
npm run lint
```

Both must pass clean.

- [ ] **Step 15: Manual smoke**

Start dev. Open the dashboard. With no hidden rows yet, every number must look identical to before:

```bash
npm run dev
# In another shell, sanity-check a couple of aggregates:
curl -s -H "X-Workspace-ID: 1" "http://127.0.0.1:3000/api/summary" | head -c 400
curl -s -H "X-Workspace-ID: 1" "http://127.0.0.1:3000/api/transactions?limit=5" | head -c 600
```

Both should return non-empty JSON with no errors.

- [ ] **Step 16: Commit**

```bash
git add src/server/db/queries/transactions.ts
git commit -m "feat(db): exclude is_excluded rows from all transaction aggregates"
```

---

## Task 6: Filter `is_excluded` in other query modules

**Files:**
- Modify: `src/server/db/queries/home.ts`
- Modify: `src/server/db/queries/budgets.ts`
- Modify: `src/server/db/queries/category-corrections.ts` (audit only)

- [ ] **Step 1: Audit `home.ts`**

```bash
grep -nE "FROM transactions|JOIN transactions" src/server/db/queries/home.ts
```

For every result that participates in an aggregate (SUM, COUNT, GROUP BY) and currently filters `status = 'completed'`, append `AND is_excluded = 0` (or `AND t.is_excluded = 0` if aliased). Leave row-listing queries that the UI displays directly alone — but if any in this file return data shown on the home/dashboard charts, those count as aggregates and must filter.

If unsure about a specific query, prefer adding the filter. The cost of false negatives (excluded rows polluting an aggregate) is higher than the cost of false positives (an excluded row not showing in a list that wasn't meant to show it anyway).

- [ ] **Step 2: Audit `budgets.ts`**

Same procedure:

```bash
grep -nE "FROM transactions|JOIN transactions" src/server/db/queries/budgets.ts
```

Any spend calculation must add `AND is_excluded = 0`. Budgets are explicitly in scope per the spec.

- [ ] **Step 3: Audit `category-corrections.ts`**

```bash
grep -nE "FROM transactions|JOIN transactions" src/server/db/queries/category-corrections.ts
```

If it only reads correction metadata (the corrections table), no changes needed. If it reads transactions, apply the same filter.

- [ ] **Step 4: Type-check + lint**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 5: Manual smoke**

With dev running, hit `/api/home` (or whatever the home payload route is) and `/api/budgets`:

```bash
curl -s -H "X-Workspace-ID: 1" "http://127.0.0.1:3000/api/home" | head -c 400
curl -s -H "X-Workspace-ID: 1" "http://127.0.0.1:3000/api/budgets" | head -c 400
```

Both should return JSON without errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/db/queries/home.ts src/server/db/queries/budgets.ts src/server/db/queries/category-corrections.ts
git commit -m "feat(db): exclude is_excluded rows from home, budgets, and corrections aggregates"
```

---

## Task 7: Wire `applyMerchantRulesToSyncRun` into the sync orchestrator

**Files:**
- Modify: `src/server/sync/orchestrator.ts`

- [ ] **Step 1: Import the new helper**

At the top of `src/server/sync/orchestrator.ts`, add the import next to the existing `insertTransactions` import:

```ts
import { applyMerchantRulesToSyncRun } from "../db/queries/excluded-merchants";
```

- [ ] **Step 2: Call it after `insertTransactions`**

Find this block (around line 250):

```ts
const { added, updated } = insertTransactions(
  workspaceId,
  allTransactions,
  provider,
  syncRunId
);
completeSyncRun(syncRunId, added, updated);
```

Insert the rule application call between the insert and the completion:

```ts
const { added, updated } = insertTransactions(
  workspaceId,
  allTransactions,
  provider,
  syncRunId
);
applyMerchantRulesToSyncRun(workspaceId, syncRunId);
completeSyncRun(syncRunId, added, updated);
```

- [ ] **Step 3: Type-check + lint**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/server/sync/orchestrator.ts
git commit -m "feat(sync): apply excluded-merchants rules after inserting new transactions"
```

---

## Task 8: Extend `PATCH /api/transactions/:id` with `excluded` branch

**Files:**
- Modify: `src/app/api/transactions/[id]/route.ts`

- [ ] **Step 1: Add the imports**

At the top of `src/app/api/transactions/[id]/route.ts`, add:

```ts
import {
  setTransactionExcluded,
  addExcludedMerchant,
} from "@/server/db/queries/excluded-merchants";
```

- [ ] **Step 2: Add the `excluded` branch in the PATCH handler**

The current handler dispatches on `body.approve` → `body.kind`. Add a third disjoint branch BEFORE the kind branch, after the `approve` block ends:

```ts
if (typeof body.excluded === "boolean") {
  const ctx = getTransactionContext(workspaceId, numericId);
  if (!ctx) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  setTransactionExcluded(workspaceId, numericId, body.excluded);

  if (body.excluded === true && body.rememberMerchant === true) {
    // Fetch provider + description to build the rule.
    const row = getDb()
      .prepare(
        "SELECT provider, description FROM transactions WHERE workspace_id = ? AND id = ?"
      )
      .get(workspaceId, numericId) as
      | { provider: string; description: string }
      | undefined;
    if (row) {
      addExcludedMerchant(workspaceId, row.provider, row.description);
    }
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Add the missing import**

The `getDb` reference above is new for this file. Add to imports:

```ts
import { getDb } from "@/server/db";
```

- [ ] **Step 4: Update the body type**

Find the `as { kind?: unknown; approve?: unknown }` cast at the top of `PATCH`. Replace with:

```ts
const body = (await request.json().catch(() => ({}))) as {
  kind?: unknown;
  approve?: unknown;
  excluded?: unknown;
  rememberMerchant?: unknown;
};
```

- [ ] **Step 5: Type-check + lint**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 6: Manual verification — hide and un-hide a real row**

With dev running, pick an existing transaction id (any from `curl /api/transactions`). Hide it:

```bash
TX_ID=<some_id>
curl -s -X PATCH -H "Content-Type: application/json" -H "X-Workspace-ID: 1" \
  -d '{"excluded": true}' \
  "http://127.0.0.1:3000/api/transactions/$TX_ID"
sqlite3 data/budgeteer.db "SELECT id, is_excluded FROM transactions WHERE id=$TX_ID;"
```

Expected: response `{"success":true}`, and the row's `is_excluded` is `1`.

Now un-hide:

```bash
curl -s -X PATCH -H "Content-Type: application/json" -H "X-Workspace-ID: 1" \
  -d '{"excluded": false}' \
  "http://127.0.0.1:3000/api/transactions/$TX_ID"
sqlite3 data/budgeteer.db "SELECT id, is_excluded FROM transactions WHERE id=$TX_ID;"
```

Expected: `is_excluded` back to `0`.

Now hide WITH remember:

```bash
curl -s -X PATCH -H "Content-Type: application/json" -H "X-Workspace-ID: 1" \
  -d '{"excluded": true, "rememberMerchant": true}' \
  "http://127.0.0.1:3000/api/transactions/$TX_ID"
sqlite3 data/budgeteer.db "SELECT * FROM excluded_merchants;"
```

Expected: one row in `excluded_merchants` whose `provider` and `merchant_key` match the transaction's. Calling again with the same id is a no-op (the `INSERT OR IGNORE`).

Restore the row before continuing:

```bash
curl -s -X PATCH -H "Content-Type: application/json" -H "X-Workspace-ID: 1" \
  -d '{"excluded": false}' \
  "http://127.0.0.1:3000/api/transactions/$TX_ID"
sqlite3 data/budgeteer.db "DELETE FROM excluded_merchants;"
```

- [ ] **Step 7: Commit**

```bash
git add src/app/api/transactions/\[id\]/route.ts
git commit -m "feat(api): support excluded + rememberMerchant in PATCH /api/transactions/:id"
```

---

## Task 9: Extend `GET /api/transactions` with `includeExcluded`

**Files:**
- Modify: `src/app/api/transactions/route.ts`

- [ ] **Step 1: Read `?includeExcluded` and pass it through**

In `src/app/api/transactions/route.ts`, inside the `queryTransactions(...)` call object, add:

```ts
includeExcluded: searchParams.get("includeExcluded") === "1",
```

Place it next to the other params.

- [ ] **Step 2: Type-check + lint**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 3: Manual verification**

With dev running and at least one excluded row in the DB (set one via the PATCH from Task 8):

```bash
TX_ID=<some_id>
curl -s -X PATCH -H "Content-Type: application/json" -H "X-Workspace-ID: 1" \
  -d '{"excluded": true}' "http://127.0.0.1:3000/api/transactions/$TX_ID" > /dev/null

# Default: excluded row must NOT appear
curl -s -H "X-Workspace-ID: 1" "http://127.0.0.1:3000/api/transactions?limit=200" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(any(t['id']==$TX_ID for t in d['transactions']))"
# Expected: False

# With includeExcluded=1: it must appear
curl -s -H "X-Workspace-ID: 1" "http://127.0.0.1:3000/api/transactions?limit=200&includeExcluded=1" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(any(t['id']==$TX_ID and t['isExcluded'] for t in d['transactions']))"
# Expected: True

# Restore
curl -s -X PATCH -H "Content-Type: application/json" -H "X-Workspace-ID: 1" \
  -d '{"excluded": false}' "http://127.0.0.1:3000/api/transactions/$TX_ID" > /dev/null
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/transactions/route.ts
git commit -m "feat(api): support includeExcluded query param in GET /api/transactions"
```

---

## Task 10: New routes `/api/excluded-merchants` and `/:id`

**Files:**
- Create: `src/app/api/excluded-merchants/route.ts`
- Create: `src/app/api/excluded-merchants/[id]/route.ts`

- [ ] **Step 1: Create the list route**

`src/app/api/excluded-merchants/route.ts`:

```ts
import { NextResponse } from "next/server";
import { listExcludedMerchants } from "@/server/db/queries/excluded-merchants";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json({ rules: listExcludedMerchants(workspaceId) });
}
```

- [ ] **Step 2: Create the delete route**

`src/app/api/excluded-merchants/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { deleteExcludedMerchant } from "@/server/db/queries/excluded-merchants";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const removed = deleteExcludedMerchant(workspaceId, numericId);
  if (!removed) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Type-check + lint**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 4: Manual verification**

```bash
# Seed a rule via PATCH (Task 8 flow):
TX_ID=<some_id>
curl -s -X PATCH -H "Content-Type: application/json" -H "X-Workspace-ID: 1" \
  -d '{"excluded": true, "rememberMerchant": true}' \
  "http://127.0.0.1:3000/api/transactions/$TX_ID" > /dev/null

# List
curl -s -H "X-Workspace-ID: 1" "http://127.0.0.1:3000/api/excluded-merchants"
# Expected: {"rules":[{"id":1,"provider":"...","merchantKey":"...","createdAt":"..."}]}

# Delete
RULE_ID=$(curl -s -H "X-Workspace-ID: 1" "http://127.0.0.1:3000/api/excluded-merchants" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['rules'][0]['id'])")
curl -s -X DELETE -H "X-Workspace-ID: 1" \
  "http://127.0.0.1:3000/api/excluded-merchants/$RULE_ID"
# Expected: {"success":true}

# Restore the transaction
curl -s -X PATCH -H "Content-Type: application/json" -H "X-Workspace-ID: 1" \
  -d '{"excluded": false}' "http://127.0.0.1:3000/api/transactions/$TX_ID" > /dev/null
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/excluded-merchants/
git commit -m "feat(api): add list and delete routes for excluded-merchants"
```

---

## Task 11: Client API helpers

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add the type imports**

In `src/lib/api.ts`, add `ExcludedMerchant` to the existing `import type` block:

```ts
import type {
  // ... existing types ...
  ExcludedMerchant,
} from "./types";
```

- [ ] **Step 2: Add the transaction-level helper**

Add somewhere alongside the other transaction helpers:

```ts
export async function setTransactionExcluded(
  id: number,
  excluded: boolean,
  rememberMerchant = false
): Promise<void> {
  await fetchJSON<{ success: true }>(`/api/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ excluded, rememberMerchant }),
  });
}
```

- [ ] **Step 3: Add the rule-list helpers**

Add at the bottom (or alongside related management helpers):

```ts
export async function listExcludedMerchants(): Promise<ExcludedMerchant[]> {
  const { rules } = await fetchJSON<{ rules: ExcludedMerchant[] }>(
    "/api/excluded-merchants"
  );
  return rules;
}

export async function deleteExcludedMerchant(id: number): Promise<void> {
  await fetchJSON<{ success: true }>(`/api/excluded-merchants/${id}`, {
    method: "DELETE",
  });
}
```

- [ ] **Step 4: Update the `getTransactions` signature to support `includeExcluded`**

Find the existing `getTransactions` (or equivalent) client helper. Add an `includeExcluded?: boolean` field to its params type and append `includeExcluded=1` to the query string when true. If you can't find an explicit options param, follow whatever pattern exists for query-string composition in that helper (it likely uses `URLSearchParams`).

- [ ] **Step 5: Type-check + lint**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(client): add excluded-merchants client helpers"
```

---

## Task 12: i18n keys

**Files:**
- Modify: `src/i18n/messages/en.json`
- Modify: `src/i18n/messages/he.json`

- [ ] **Step 1: Add keys to `en.json`**

Locate the `"transactions"` object. Add (place near `markAsIncome`/`markAsExpense`):

```json
"rowHide": "Hide transaction",
"rowShow": "Show transaction",
"hiddenBadge": "Hidden",
"showHidden": "Show hidden ({count})",
"showHiddenZero": "Show hidden",
"toastHidden": "Transaction hidden.",
"toastHideMerchantPrompt": "Also hide future {merchant} from {provider}?",
"toastYes": "Yes",
"toastUndo": "Undo"
```

Locate the `"settings"` object (or `"settings.sidebar"` for the nav label). Add to `"settings.sidebar"`:

```json
"hiddenMerchants": "Hidden merchants"
```

Add a new top-level `"hiddenMerchants"` block (place next to `"categories"` or wherever similar setting sections live):

```json
"hiddenMerchants": {
  "title": "Hidden merchants",
  "description": "When you hide a transaction, we can remember the merchant so future ones are automatically hidden. These rules apply only to the bank they were learned from.",
  "empty": "No hidden merchants yet.",
  "remove": "Remove",
  "removeConfirm": "Stop auto-hiding {merchant}? Past hidden rows stay hidden."
}
```

- [ ] **Step 2: Mirror to `he.json`**

Add the same keys with Hebrew translations. The user is a native Hebrew speaker, so use idiomatic phrasing. Suggested translations:

```json
"rowHide": "הסתר עסקה",
"rowShow": "הצג עסקה",
"hiddenBadge": "מוסתר",
"showHidden": "הצג מוסתרים ({count})",
"showHiddenZero": "הצג מוסתרים",
"toastHidden": "העסקה הוסתרה.",
"toastHideMerchantPrompt": "להסתיר גם עסקאות עתידיות של {merchant} מ-{provider}?",
"toastYes": "כן",
"toastUndo": "ביטול"
```

In `settings.sidebar`:
```json
"hiddenMerchants": "עסקים מוסתרים"
```

Top-level `hiddenMerchants`:
```json
"hiddenMerchants": {
  "title": "עסקים מוסתרים",
  "description": "כאשר אתה מסתיר עסקה, אנחנו יכולים לזכור את העסק כדי שעסקאות עתידיות יוסתרו אוטומטית. הכללים חלים רק על הבנק שממנו נלמדו.",
  "empty": "אין עסקים מוסתרים עדיין.",
  "remove": "הסר",
  "removeConfirm": "להפסיק להסתיר אוטומטית עסקאות של {merchant}? עסקאות שכבר הוסתרו יישארו מוסתרות."
}
```

- [ ] **Step 3: Lint**

```bash
npm run lint
```

JSON syntax errors will surface here.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/en.json src/i18n/messages/he.json
git commit -m "feat(i18n): add hide-transaction and hidden-merchants strings"
```

---

## Task 13: UI — Hide/Show in row action menu + toast

**Files:**
- Modify: `src/components/dashboard/transactions-table.tsx`

- [ ] **Step 1: Add the new imports**

At the top of `src/components/dashboard/transactions-table.tsx`, alongside existing imports:

```ts
import { setTransactionExcluded } from "@/lib/api";
import { toast } from "sonner";
import { EyeOff, Eye } from "lucide-react";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
```

Verify `sonner` is the toast library used in this project:

```bash
grep -rn "from \"sonner\"" src/components | head -5
```

If `sonner` is used elsewhere, proceed. If a different toast helper is used, swap the import and the `toast.*` calls below to match.

- [ ] **Step 2: Add the hide/unhide handler**

Inside the `TransactionsTable` component, near `handleKindChange` and `handleApprove`, add:

```ts
const handleHide = async (txn: TransactionWithCategory) => {
  setUpdatingId(txn.id);
  try {
    await setTransactionExcluded(txn.id, true, false);
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["transactions-summary"] });
    queryClient.invalidateQueries({ queryKey: ["home"] });
    queryClient.invalidateQueries({ queryKey: ["budgets"] });

    toast(t("toastHidden"), {
      description: t("toastHideMerchantPrompt", {
        merchant: txn.description,
        provider: txn.provider,
      }),
      duration: 6000,
      action: {
        label: t("toastYes"),
        onClick: async () => {
          await setTransactionExcluded(txn.id, true, true);
          queryClient.invalidateQueries({ queryKey: ["excluded-merchants"] });
        },
      },
      cancel: {
        label: t("toastUndo"),
        onClick: async () => {
          await setTransactionExcluded(txn.id, false, false);
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
          queryClient.invalidateQueries({ queryKey: ["summary"] });
          queryClient.invalidateQueries({ queryKey: ["transactions-summary"] });
          queryClient.invalidateQueries({ queryKey: ["home"] });
          queryClient.invalidateQueries({ queryKey: ["budgets"] });
        },
      },
    });
  } finally {
    setUpdatingId(null);
  }
};

const handleUnhide = async (txnId: number) => {
  setUpdatingId(txnId);
  try {
    await setTransactionExcluded(txnId, false, false);
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["transactions-summary"] });
    queryClient.invalidateQueries({ queryKey: ["home"] });
    queryClient.invalidateQueries({ queryKey: ["budgets"] });
  } finally {
    setUpdatingId(null);
  }
};
```

- [ ] **Step 3: Add the new menu items to the existing row dropdown**

Locate the row's `MoreHorizontal` `DropdownMenu` (around line 424). Inside `DropdownMenuContent align="end"`, before the existing `otherKinds[txn.kind].map(...)`:

```tsx
{txn.isExcluded ? (
  <DropdownMenuItem onClick={() => handleUnhide(txn.id)}>
    <Eye className="me-2 h-4 w-4" />
    {t("rowShow")}
  </DropdownMenuItem>
) : (
  <DropdownMenuItem onClick={() => handleHide(txn)}>
    <EyeOff className="me-2 h-4 w-4" />
    {t("rowHide")}
  </DropdownMenuItem>
)}
<DropdownMenuSeparator />
```

- [ ] **Step 4: Render hidden rows with reduced opacity + badge**

Find the `<TableRow key={txn.id} className="..." >` (around line 298). Update the className expression to:

```tsx
<TableRow
  key={txn.id}
  className={`transition-colors duration-200 hover:bg-muted/50 ${
    txn.isExcluded ? "opacity-50" : ""
  }`}
>
```

In the description `TableCell`, immediately after the `needsReview` badge block, add a Hidden badge:

```tsx
{txn.isExcluded && (
  <span
    className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
  >
    {t("hiddenBadge")}
  </span>
)}
```

- [ ] **Step 5: Type-check + lint**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 6: Manual verification**

With dev running, open `http://127.0.0.1:3000/transactions`. Pick any row, open the `...` menu — "Hide transaction" must appear. Click it:

- The row disappears.
- A toast appears with the merchant name and a "Yes" / "Undo" pair.
- Click "Undo" → row reappears.
- Hide again, click "Yes" → check `sqlite3 data/budgeteer.db "SELECT * FROM excluded_merchants;"` shows a row.
- Use Task 8's curl flow to unhide the transaction and delete the rule to reset.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/transactions-table.tsx
git commit -m "feat(ui): add Hide/Show row action and remember-merchant toast"
```

---

## Task 14: UI — "Show hidden" toggle in the transactions header

**Files:**
- Modify: `src/components/dashboard/transactions-table.tsx`
- Modify: the parent component that owns the `transactions` query (likely `src/components/dashboard/dashboard.tsx` or a `/transactions` page component)

The toggle drives the query, so state lives in the parent that calls `useQuery(["transactions", ...])`. First locate the parent.

- [ ] **Step 1: Locate the parent**

```bash
grep -rn "TransactionsTable" src/components src/app | grep -v ".test."
grep -rn "queryKey:.*\\[\"transactions\"" src/components src/app | head -10
```

The page that renders `<TransactionsTable />` is the parent. Most likely `src/app/(app)/transactions/page.tsx` or similar — confirm by reading the file's render output.

- [ ] **Step 2: Add `includeExcluded` state to the parent**

In the parent file, alongside the existing search/category/page state:

```tsx
const [includeExcluded, setIncludeExcluded] = useState(false);
```

Pass it into the existing `useQuery(["transactions", ...])` queryKey AND into the fetcher (use the `getTransactions` helper updated in Task 11):

```tsx
useQuery({
  queryKey: ["transactions", { search, categoryFilter, page, includeExcluded }],
  queryFn: () =>
    getTransactions({ search, categoryFilter, page, includeExcluded }),
});
```

Add a separate query for the hidden COUNT used to label the toggle. The simplest way: a `useQuery(["transactions", "hidden-count", filters], ...)` that does `getTransactions({ ..., includeExcluded: true, limit: 1 })` and subtracts the default total. Or fetch with `includeExcluded` true and filter client-side. Pick whichever fits the existing code style; the count must NOT include the toggle's own filter state to avoid going to zero when the toggle is on.

A pragmatic shortcut: count using a derived helper inside the data — fetch with `includeExcluded: true` always and filter client-side:

```tsx
const visible = useMemo(
  () => (includeExcluded ? data.transactions : data.transactions.filter((t) => !t.isExcluded)),
  [data, includeExcluded]
);
const hiddenCount = useMemo(
  () => data.transactions.filter((t) => t.isExcluded).length,
  [data]
);
```

This means `getTransactions` always uses `includeExcluded: true` and the toggle is purely UI. Cleaner, no second query needed. **Use this approach.**

Pass `hiddenCount`, `includeExcluded`, and `setIncludeExcluded` down to `TransactionsTable` as new props.

- [ ] **Step 3: Add the new props to `TransactionsTable`**

In `transactions-table.tsx`, extend `TransactionsTableProps`:

```ts
interface TransactionsTableProps {
  // ... existing ...
  hiddenCount: number;
  includeExcluded: boolean;
  onIncludeExcludedChange: (v: boolean) => void;
}
```

Destructure them in the function signature.

- [ ] **Step 4: Render the toggle**

In the header `<div className="flex items-center gap-2">` near the search input and category select, add as the last item:

```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={() => onIncludeExcludedChange(!includeExcluded)}
  disabled={hiddenCount === 0 && !includeExcluded}
  className="h-8 gap-1 px-2 text-xs"
>
  {includeExcluded ? (
    <Eye className="h-3.5 w-3.5" />
  ) : (
    <EyeOff className="h-3.5 w-3.5" />
  )}
  {hiddenCount > 0
    ? t("showHidden", { count: hiddenCount })
    : t("showHiddenZero")}
</Button>
```

- [ ] **Step 5: Type-check + lint**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 6: Manual verification**

With dev running and at least one hidden row, the toggle reads `Show hidden (1)`. Click it — the hidden row appears, dimmed, with the Hidden badge. Click again — it disappears. With zero hidden rows, the toggle reads `Show hidden` and is disabled.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/transactions-table.tsx <parent_file>
git commit -m "feat(ui): add Show hidden toggle to transactions table"
```

---

## Task 15: UI — Settings sub-route for managing rules

**Files:**
- Create: `src/app/settings/hidden-merchants/page.tsx`
- Create: `src/components/settings/hidden-merchants-section.tsx`
- Modify: `src/components/settings/settings-sidebar.tsx`

- [ ] **Step 1: Add the sidebar entry**

Open `src/components/settings/settings-sidebar.tsx`. Import the new icon:

```ts
import { EyeOff } from "lucide-react";
```

In the `GROUPS` array, add a new item to the `groupAdvanced` group (or wherever fits the existing IA — `groupCategories` is also reasonable; `groupAdvanced` is fine):

```ts
{
  href: "/settings/hidden-merchants",
  labelKey: "hiddenMerchants",
  Icon: EyeOff,
  match: (p) => p.startsWith("/settings/hidden-merchants"),
},
```

- [ ] **Step 2: Create the section component**

`src/components/settings/hidden-merchants-section.tsx`:

```tsx
"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import {
  listExcludedMerchants,
  deleteExcludedMerchant,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BANK_PROVIDERS } from "@/lib/types";

function providerLabel(id: string): string {
  return BANK_PROVIDERS.find((p) => p.id === id)?.name ?? id;
}

export function HiddenMerchantsSection() {
  const t = useTranslations("hiddenMerchants");
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["excluded-merchants"],
    queryFn: listExcludedMerchants,
  });

  const handleRemove = async (id: number, merchant: string) => {
    const ok = window.confirm(t("removeConfirm", { merchant }));
    if (!ok) return;
    await deleteExcludedMerchant(id);
    queryClient.invalidateQueries({ queryKey: ["excluded-merchants"] });
  };

  return (
    <Card className="rounded-2xl border border-border bg-card shadow-none">
      <CardHeader>
        <CardTitle className="font-serif text-2xl font-normal">
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data.map((rule) => (
              <li
                key={rule.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{rule.merchantKey}</div>
                  <div className="text-xs text-muted-foreground">
                    {providerLabel(rule.provider)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(rule.id, rule.merchantKey)}
                  className="shrink-0 gap-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("remove")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create the page**

`src/app/settings/hidden-merchants/page.tsx`:

```tsx
import { HiddenMerchantsSection } from "@/components/settings/hidden-merchants-section";

export default function Page() {
  return <HiddenMerchantsSection />;
}
```

If the existing `/settings/*` pages use a more elaborate page shell (e.g. `SectionShell`), match that pattern — open `src/app/settings/categories/page.tsx` to see what convention applies.

- [ ] **Step 4: Type-check + lint**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 5: Manual verification**

Seed a rule (via the Hide → Yes flow in the UI, or the Task 8 curl). Navigate to `http://127.0.0.1:3000/settings/hidden-merchants`. The rule must appear with the provider label and merchant description. Click Remove → confirm → the row vanishes and the API DELETE returns `success`. Verify with `sqlite3 data/budgeteer.db "SELECT COUNT(*) FROM excluded_merchants;"`.

- [ ] **Step 6: Commit**

```bash
git add src/app/settings/hidden-merchants/ src/components/settings/hidden-merchants-section.tsx src/components/settings/settings-sidebar.tsx
git commit -m "feat(ui): add Settings page for managing hidden merchants"
```

---

## Task 16: Final end-to-end verification

**Files:** none (manual verification only)

- [ ] **Step 1: Reset and full build**

```bash
npm run lint
npx tsc --noEmit
npm run build
```

All three must succeed.

- [ ] **Step 2: Run the full manual checklist from the spec**

Walk through the testing checklist in [docs/superpowers/specs/2026-05-18-irrelevant-transactions-design.md](../specs/2026-05-18-irrelevant-transactions-design.md#testing-checklist). All 10 items must pass. If any fails, return to the relevant task and fix the regression.

- [ ] **Step 3: Sanity-check no aggregate regressed**

With NO hidden rows, the numbers on the dashboard (hero card, monthly chart, category breakdown, top merchants, budgets) must be identical to before the feature. If any number changed, audit Task 5 and Task 6 — most likely a missing or duplicated WHERE filter.

- [ ] **Step 4: Final commit (if any small fixups were needed in Step 2/3)**

```bash
git add -A
git diff --cached --stat
# only commit if there are actual changes
git commit -m "chore: cleanup from end-to-end verification" || echo "nothing to commit"
```

---

## Plan self-review notes

- All spec requirements are mapped:
  - Migration 020 → Task 1.
  - `is_excluded` filter in every aggregate → Tasks 5 & 6.
  - `queryTransactions` opt-in → Task 4.
  - Sync rule application → Tasks 3 & 7.
  - PATCH excluded branch → Task 8.
  - GET includeExcluded → Task 9.
  - GET/DELETE excluded-merchants → Task 10.
  - Client helpers → Task 11.
  - i18n → Task 12.
  - Row menu + toast → Task 13.
  - Show hidden toggle → Task 14.
  - Settings sub-route → Task 15.
  - End-to-end checklist (spec section) → Task 16.

- Type names used consistently: `TransactionWithCategory.isExcluded`, `ExcludedMerchant`, helpers `setTransactionExcluded` / `addExcludedMerchant` / `applyMerchantRulesToSyncRun` / `listExcludedMerchants` / `deleteExcludedMerchant`. The PATCH body uses `excluded` and `rememberMerchant`, mirroring the spec.

- No placeholders — every code block is complete and exact. Two places say "match the existing convention" (Task 11 query-string composition, Task 15 page shell) because the in-repo pattern is the source of truth there; in both cases I gave the engineer the exact files to consult.
