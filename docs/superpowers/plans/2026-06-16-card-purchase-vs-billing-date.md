# Purchase-date vs billing-date toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Purchase ↔ Billing date toggle to the Transactions page so the list can be reconciled against a bank statement, defaulting to purchase date (today's behaviour).

**Architecture:** Store a precomputed Asia/Jerusalem `billing_local_date` column (mirroring the existing `local_date`). A localStorage-backed basis store sends an `x-date-basis` header; only the `/api/transactions` route reads it and passes a `dateBasis` into `queryTransactions`, which swaps `local_date` for `COALESCE(billing_local_date, local_date)` in both the month filter and the date sort. The Transactions table shows each row's billing date when billing mode is active. Home, Insights, and Budget are untouched and stay purchase-basis.

**Tech Stack:** Next.js 16 App Router, better-sqlite3, Drizzle, TypeScript strict, Tailwind v4, next-intl, Bun test.

**Spec:** `docs/superpowers/specs/2026-06-16-card-purchase-vs-billing-date-design.md`

**Conventions (from CLAUDE.md):** No comments in code. No em dashes. Conventional commits. `import "server-only"` at the top of every `src/server/` file. shadcn uses base-ui (no `asChild`; use `render`). Run `bun run format:check` style via `bunx biome format --write` before each commit. The full gate is `bun run ci`; tests run with `bun test --conditions react-server`. **Tests are pure-logic only — better-sqlite3 cannot load under `bun test`, so DB-touching code is verified via the dev server, not unit tests.**

---

## File Structure

- Create `src/lib/date-basis.ts` — shared `DateBasis` type + pure helpers (`isDateBasis`, `dateBasisColumn`, `DEFAULT_DATE_BASIS`).
- Create `src/lib/date-basis.test.ts` — unit tests for the pure helpers.
- Create `src/lib/date-basis-store.ts` — localStorage external store (client).
- Create `src/lib/date-basis-store.test.ts` — unit tests for the store.
- Create `src/server/lib/date-basis-context.ts` — server header reader.
- Create `src/server/lib/date-basis-context.test.ts` — unit tests for the reader.
- Create `src/server/db/migrations/027_billing_local_date.sql` — column + index.
- Create `src/server/db/backfill-billing-local-date.ts` — startup backfill.
- Create `src/components/transactions/date-basis-toggle.tsx` — the toggle + caption.
- Modify `src/server/db/schema.ts` — add `billingLocalDate` column.
- Modify `src/server/db/index.ts` — call the backfill at init.
- Modify `src/server/db/queries/transactions.ts` — insert population, row type/map, `queryTransactions` threading.
- Modify `src/lib/types.ts` — add `billingLocalDate` to `Transaction`.
- Modify `src/lib/api.ts` — send `x-date-basis` header.
- Modify `src/app/api/transactions/route.ts` — read basis, pass to query.
- Modify `src/components/transactions/transactions-page.tsx` — render the toggle.
- Modify `src/components/dashboard/transactions-table.tsx` — basis-aware date cell.
- Modify `src/components/help/help-content.ts` — add `dateBasis` section to `transactions`.
- Modify `src/i18n/messages/en.json` and `src/i18n/messages/he.json` — toggle, caption, help copy.

---

## Task 1: Shared date-basis helpers (pure)

**Files:**
- Create: `src/lib/date-basis.ts`
- Test: `src/lib/date-basis.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/date-basis.test.ts
import { describe, expect, test } from "bun:test";
import { dateBasisColumn, DEFAULT_DATE_BASIS, isDateBasis } from "@/lib/date-basis";

describe("date-basis helpers", () => {
  test("default basis is purchase", () => {
    expect(DEFAULT_DATE_BASIS).toBe("purchase");
  });

  test("isDateBasis validates values", () => {
    expect(isDateBasis("purchase")).toBe(true);
    expect(isDateBasis("billing")).toBe(true);
    expect(isDateBasis("nope")).toBe(false);
    expect(isDateBasis(null)).toBe(false);
    expect(isDateBasis(undefined)).toBe(false);
  });

  test("dateBasisColumn returns local_date for purchase", () => {
    expect(dateBasisColumn("purchase")).toBe("local_date");
    expect(dateBasisColumn("purchase", "t.")).toBe("t.local_date");
  });

  test("dateBasisColumn coalesces billing onto local_date for billing", () => {
    expect(dateBasisColumn("billing")).toBe("COALESCE(billing_local_date, local_date)");
    expect(dateBasisColumn("billing", "t.")).toBe(
      "COALESCE(t.billing_local_date, t.local_date)",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/date-basis.test.ts`
Expected: FAIL — cannot resolve `@/lib/date-basis`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/date-basis.ts
export type DateBasis = "purchase" | "billing";

export const DEFAULT_DATE_BASIS: DateBasis = "purchase";

export function isDateBasis(value: string | null | undefined): value is DateBasis {
  return value === "purchase" || value === "billing";
}

export function dateBasisColumn(basis: DateBasis, alias = ""): string {
  return basis === "billing"
    ? `COALESCE(${alias}billing_local_date, ${alias}local_date)`
    : `${alias}local_date`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/date-basis.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
bunx biome format --write src/lib/date-basis.ts src/lib/date-basis.test.ts
git add src/lib/date-basis.ts src/lib/date-basis.test.ts
git commit -m "feat: shared date-basis type and sql column helper"
```

---

## Task 2: Migration + Drizzle schema for `billing_local_date`

**Files:**
- Create: `src/server/db/migrations/027_billing_local_date.sql`
- Modify: `src/server/db/schema.ts` (the transactions table, next to `localDate: text("local_date")` around line 112)

- [ ] **Step 1: Write the migration**

```sql
-- src/server/db/migrations/027_billing_local_date.sql
ALTER TABLE transactions ADD COLUMN billing_local_date TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_ws_billing_local_date
  ON transactions(workspace_id, billing_local_date);
```

- [ ] **Step 2: Add the column to the Drizzle schema**

In `src/server/db/schema.ts`, immediately after the line `localDate: text("local_date"),` add:

```ts
  billingLocalDate: text("billing_local_date"),
```

- [ ] **Step 3: Verify typecheck passes**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/server/db/migrations/027_billing_local_date.sql src/server/db/schema.ts
git commit -m "feat: add billing_local_date column and index"
```

---

## Task 3: Startup backfill for `billing_local_date`

**Files:**
- Create: `src/server/db/backfill-billing-local-date.ts`
- Modify: `src/server/db/index.ts` (after the existing `backfillLocalDate(db);` call, around line 35)

Model this exactly on the existing `src/server/db/backfill-local-date.ts`.

- [ ] **Step 1: Write the backfill module**

```ts
// src/server/db/backfill-billing-local-date.ts
import "server-only";

import type Database from "better-sqlite3";
import { toJerusalemDate } from "@/server/lib/date-utils";

export function backfillBillingLocalDate(db: Database.Database): void {
  const rows = db
    .prepare(
      "SELECT id, processed_date FROM transactions WHERE billing_local_date IS NULL AND processed_date IS NOT NULL",
    )
    .all() as { id: number; processed_date: string }[];
  if (rows.length === 0) return;

  const update = db.prepare("UPDATE transactions SET billing_local_date = ? WHERE id = ?");
  db.transaction(() => {
    for (const row of rows) {
      update.run(toJerusalemDate(row.processed_date), row.id);
    }
  })();
}
```

- [ ] **Step 2: Wire it into DB init**

In `src/server/db/index.ts`, add the import next to the existing backfill import:

```ts
import { backfillBillingLocalDate } from "@/server/db/backfill-billing-local-date";
```

and add this line immediately after the existing `backfillLocalDate(db);` call:

```ts
  backfillBillingLocalDate(db);
```

- [ ] **Step 3: Verify typecheck passes**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
bunx biome format --write src/server/db/backfill-billing-local-date.ts src/server/db/index.ts
git add src/server/db/backfill-billing-local-date.ts src/server/db/index.ts
git commit -m "feat: backfill billing_local_date on startup"
```

---

## Task 4: Populate `billing_local_date` on insert

**Files:**
- Modify: `src/server/db/queries/transactions.ts` (the `insertStmt` and its params inside `upsertTransactions`, lines ~59-126)

- [ ] **Step 1: Add the column to the INSERT statement**

In the `insertStmt` SQL, add `billing_local_date` to the column list (next to `local_date`) and `@billingLocalDate` to the VALUES list (next to `@localDate`). The column list currently reads:

```
      workspace_id, account_number, date, processed_date, local_date, original_amount, original_currency,
```

change the `local_date` part so it becomes:

```
      workspace_id, account_number, date, processed_date, local_date, billing_local_date, original_amount, original_currency,
```

and in the VALUES list change:

```
      @workspaceId, @accountNumber, @date, @processedDate, @localDate, @originalAmount, @originalCurrency,
```

to:

```
      @workspaceId, @accountNumber, @date, @processedDate, @localDate, @billingLocalDate, @originalAmount, @originalCurrency,
```

- [ ] **Step 2: Refresh it on the pending → completed update**

In the same `insertStmt`, inside the `ON CONFLICT(...) DO UPDATE SET` block, add this line right after the existing `local_date = CASE WHEN transactions.status = 'pending' THEN excluded.local_date ELSE transactions.local_date END,` line:

```
      billing_local_date = CASE WHEN transactions.status = 'pending' THEN excluded.billing_local_date ELSE transactions.billing_local_date END,
```

- [ ] **Step 3: Compute the param**

In the `params` object (the one with `localDate: toJerusalemDate(txn.date),`), add right after that line:

```ts
        billingLocalDate: txn.processedDate ? toJerusalemDate(txn.processedDate) : null,
```

(`toJerusalemDate` is already imported in this file. `txn.processedDate` is the scraper field already used for the `processed_date` column.)

- [ ] **Step 4: Verify typecheck passes**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/queries/transactions.ts
git commit -m "feat: populate billing_local_date on transaction insert"
```

---

## Task 5: Return `billingLocalDate` on transaction rows

**Files:**
- Modify: `src/lib/types.ts` (the `Transaction` interface, after `localDate: string | null;` line 24)
- Modify: `src/server/db/queries/transactions.ts` (`TransactionRow` interface ~line 938, and `mapTransactionRow` ~line 972)

The list query uses `SELECT t.*`, so `billing_local_date` is already returned by SQL once the column exists; these steps surface it on the typed object.

- [ ] **Step 1: Add the field to the `Transaction` type**

In `src/lib/types.ts`, in `interface Transaction`, add right after `localDate: string | null;`:

```ts
  billingLocalDate: string | null;
```

- [ ] **Step 2: Add the field to the DB row interface**

In `src/server/db/queries/transactions.ts`, in `interface TransactionRow`, add right after `local_date: string;`:

```ts
  billing_local_date: string | null;
```

- [ ] **Step 3: Map it in `mapTransactionRow`**

In `mapTransactionRow`, add right after `localDate: r.local_date,`:

```ts
    billingLocalDate: r.billing_local_date ?? null,
```

- [ ] **Step 4: Verify typecheck passes**

Run: `bun run typecheck`
Expected: no errors (every place constructing a `Transaction` now compiles because the field comes from the DB row).

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/server/db/queries/transactions.ts
git commit -m "feat: expose billingLocalDate on transaction rows"
```

---

## Task 6: Thread `dateBasis` into `queryTransactions`

**Files:**
- Modify: `src/server/db/queries/transactions.ts` (`QueryParams` ~line 144, `queryTransactions` ~line 253)

- [ ] **Step 1: Import the helper and type**

At the top of `src/server/db/queries/transactions.ts`, add to the existing imports:

```ts
import { type DateBasis, dateBasisColumn } from "@/lib/date-basis";
```

- [ ] **Step 2: Add `dateBasis` to `QueryParams`**

In `interface QueryParams`, add:

```ts
  dateBasis?: DateBasis;
```

- [ ] **Step 3: Use the basis column for the month filter and date sort**

In `queryTransactions`, just after `const values: (string | number)[] = [workspaceId];`, add:

```ts
  const basis: DateBasis = params.dateBasis ?? "purchase";
  const dateCol = dateBasisColumn(basis, "t.");
```

Then change the `from` filter from:

```ts
  if (params.from) {
    conditions.push("t.local_date >= ?");
    values.push(params.from);
  }
  if (params.to) {
    conditions.push("t.local_date <= ?");
    values.push(params.to);
  }
```

to:

```ts
  if (params.from) {
    conditions.push(`${dateCol} >= ?`);
    values.push(params.from);
  }
  if (params.to) {
    conditions.push(`${dateCol} <= ?`);
    values.push(params.to);
  }
```

- [ ] **Step 4: Make the date sort basis-aware (billing only)**

Find the line `const sortSql = resolveSortSql(params.sort);` and replace it with:

```ts
  let sortSql = resolveSortSql(params.sort);
  if (basis === "billing" && sortSql === "t.date") {
    sortSql = dateCol;
  }
```

(Purchase mode keeps the existing `t.date` sort exactly, so current behaviour is unchanged when the basis is off.)

- [ ] **Step 5: Verify typecheck passes**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/db/queries/transactions.ts
git commit -m "feat: filter and sort transactions by date basis"
```

---

## Task 7: Date-basis localStorage store (client)

**Files:**
- Create: `src/lib/date-basis-store.ts`
- Test: `src/lib/date-basis-store.test.ts`

Model this on `src/lib/account-store.ts` (same `useSyncExternalStore` pattern), but typed to `DateBasis` and defaulting to `"purchase"`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/date-basis-store.test.ts
import { beforeEach, describe, expect, test } from "bun:test";
import { getDateBasisSync, setDateBasis } from "@/lib/date-basis-store";

beforeEach(() => {
  setDateBasis("purchase");
});

describe("date-basis store", () => {
  test("defaults to purchase", () => {
    expect(getDateBasisSync()).toBe("purchase");
  });

  test("set and get round-trips", () => {
    setDateBasis("billing");
    expect(getDateBasisSync()).toBe("billing");
    setDateBasis("purchase");
    expect(getDateBasisSync()).toBe("purchase");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/date-basis-store.test.ts`
Expected: FAIL — cannot resolve `@/lib/date-basis-store`.

- [ ] **Step 3: Write the store**

```ts
// src/lib/date-basis-store.ts
"use client";

import { useSyncExternalStore } from "react";
import { type DateBasis, DEFAULT_DATE_BASIS, isDateBasis } from "@/lib/date-basis";

const STORAGE_KEY = "budgeteer.dateBasis";

let memValue: DateBasis = readFromStorage();
const listeners = new Set<() => void>();

function readFromStorage(): DateBasis {
  if (typeof window === "undefined") return DEFAULT_DATE_BASIS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isDateBasis(raw) ? raw : DEFAULT_DATE_BASIS;
  } catch {
    return DEFAULT_DATE_BASIS;
  }
}

function writeToStorage(value: DateBasis): void {
  if (typeof window === "undefined") return;
  try {
    if (value === DEFAULT_DATE_BASIS) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    return;
  }
}

export function getDateBasisSync(): DateBasis {
  return memValue;
}

export function setDateBasis(value: DateBasis): void {
  if (memValue === value) return;
  memValue = value;
  writeToStorage(value);
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useDateBasis(): DateBasis {
  return useSyncExternalStore(
    subscribe,
    () => memValue,
    () => DEFAULT_DATE_BASIS,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/date-basis-store.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
bunx biome format --write src/lib/date-basis-store.ts src/lib/date-basis-store.test.ts
git add src/lib/date-basis-store.ts src/lib/date-basis-store.test.ts
git commit -m "feat: localStorage store for date basis"
```

---

## Task 8: Send and read the `x-date-basis` header

**Files:**
- Modify: `src/lib/api.ts` (`withScopeHeaders`, ~lines 25-36)
- Create: `src/server/lib/date-basis-context.ts`
- Test: `src/server/lib/date-basis-context.test.ts`

- [ ] **Step 1: Write the failing server-reader test**

```ts
// src/server/lib/date-basis-context.test.ts
import { describe, expect, test } from "bun:test";
import { getDateBasisFromRequest } from "@/server/lib/date-basis-context";

function reqWith(header: string | null): Request {
  const headers = new Headers();
  if (header != null) headers.set("x-date-basis", header);
  return new Request("http://localhost/api/transactions", { headers });
}

describe("getDateBasisFromRequest", () => {
  test("returns billing when header is billing", () => {
    expect(getDateBasisFromRequest(reqWith("billing"))).toBe("billing");
  });
  test("returns purchase when header is absent", () => {
    expect(getDateBasisFromRequest(reqWith(null))).toBe("purchase");
  });
  test("returns purchase for a garbage header", () => {
    expect(getDateBasisFromRequest(reqWith("nonsense"))).toBe("purchase");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --conditions react-server src/server/lib/date-basis-context.test.ts`
Expected: FAIL — cannot resolve `@/server/lib/date-basis-context`.

- [ ] **Step 3: Write the server reader**

```ts
// src/server/lib/date-basis-context.ts
import "server-only";

import { type DateBasis, DEFAULT_DATE_BASIS, isDateBasis } from "@/lib/date-basis";

export function getDateBasisFromRequest(req: Request): DateBasis {
  const header = req.headers.get("x-date-basis");
  return isDateBasis(header) ? header : DEFAULT_DATE_BASIS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test --conditions react-server src/server/lib/date-basis-context.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Send the header from the client**

In `src/lib/api.ts`, add the import at the top with the other `@/lib` imports:

```ts
import { getDateBasisSync } from "@/lib/date-basis-store";
```

Then inside `withScopeHeaders`, right before `return { ...init, headers };`, add:

```ts
  const dateBasis = getDateBasisSync();
  if (dateBasis === "billing" && !headers.has("x-date-basis")) {
    headers.set("x-date-basis", dateBasis);
  }
```

(The header is only sent in billing mode, so purchase-mode requests are byte-identical to today.)

- [ ] **Step 6: Verify typecheck passes**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
bunx biome format --write src/lib/api.ts src/server/lib/date-basis-context.ts src/server/lib/date-basis-context.test.ts
git add src/lib/api.ts src/server/lib/date-basis-context.ts src/server/lib/date-basis-context.test.ts
git commit -m "feat: send and read x-date-basis header"
```

---

## Task 9: Pass the basis through the transactions route

**Files:**
- Modify: `src/app/api/transactions/route.ts`

- [ ] **Step 1: Import the reader**

Add to the imports:

```ts
import { getDateBasisFromRequest } from "@/server/lib/date-basis-context";
```

- [ ] **Step 2: Pass `dateBasis` into the query**

In the `queryTransactions(workspaceId, { ... })` call, add as the last property in the params object (after `accountKeys,`):

```ts
    dateBasis: getDateBasisFromRequest(request),
```

- [ ] **Step 3: Verify typecheck passes**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/transactions/route.ts
git commit -m "feat: apply date basis in transactions route"
```

---

## Task 10: Basis-aware date cell in the transactions table

**Files:**
- Modify: `src/components/dashboard/transactions-table.tsx` (the date cell, `{formatDate(txn.localDate)}` ~line 410)

- [ ] **Step 1: Import the hook**

Add near the other `@/lib` imports in `src/components/dashboard/transactions-table.tsx`:

```ts
import { useDateBasis } from "@/lib/date-basis-store";
```

- [ ] **Step 2: Read the basis in the component**

Inside the `TransactionsTable` component body (near the top, alongside other hooks), add:

```ts
  const dateBasis = useDateBasis();
```

- [ ] **Step 3: Render the basis-appropriate date**

Replace `{formatDate(txn.localDate)}` with:

```tsx
{formatDate(
  dateBasis === "billing" ? (txn.billingLocalDate ?? txn.localDate) : txn.localDate,
)}
```

- [ ] **Step 4: Verify typecheck passes**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
bunx biome format --write src/components/dashboard/transactions-table.tsx
git add src/components/dashboard/transactions-table.tsx
git commit -m "feat: show billing date in transactions table when billing basis active"
```

---

## Task 11: The Purchase/Billing toggle + inline caption

**Files:**
- Create: `src/components/transactions/date-basis-toggle.tsx`
- Modify: `src/components/transactions/transactions-page.tsx` (render it in the header area near the kind tabs, before the `TransactionsTable`)
- Modify: `src/i18n/messages/en.json` and `src/i18n/messages/he.json` (new `transactions` UI keys — exact JSON in Step 1 below; do them first so the component resolves)

- [ ] **Step 1: Add the i18n keys (both locales)**

In `src/i18n/messages/en.json`, find the top-level `"transactions"` object (the page namespace, not the `help` one) and add these keys inside it:

```json
    "dateBasisPurchase": "Purchase date",
    "dateBasisBilling": "Billing date",
    "dateBasisCaptionPurchase": "Credit-card spending is counted on its purchase date.",
    "dateBasisCaptionBilling": "Credit-card spending is counted on its bank billing date.",
    "dateBasisAriaLabel": "Date basis"
```

In `src/i18n/messages/he.json`, add to the matching `"transactions"` object:

```json
    "dateBasisPurchase": "תאריך עסקה",
    "dateBasisBilling": "תאריך חיוב",
    "dateBasisCaptionPurchase": "הוצאות אשראי נספרות לפי תאריך העסקה.",
    "dateBasisCaptionBilling": "הוצאות אשראי נספרות לפי תאריך החיוב בבנק.",
    "dateBasisAriaLabel": "בסיס תאריך"
```

If you are unsure of the exact translator namespace the page uses, check the top of `transactions-page.tsx`: it calls `useTranslations("transactions")`. These keys live under that object.

- [ ] **Step 2: Write the toggle component**

```tsx
// src/components/transactions/date-basis-toggle.tsx
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { DateBasis } from "@/lib/date-basis";
import { setDateBasis, useDateBasis } from "@/lib/date-basis-store";

export function DateBasisToggle() {
  const t = useTranslations("transactions");
  const queryClient = useQueryClient();
  const basis = useDateBasis();

  const select = (next: DateBasis) => {
    if (next === basis) return;
    setDateBasis(next);
    queryClient.invalidateQueries();
  };

  const options: { value: DateBasis; label: string }[] = [
    { value: "purchase", label: t("dateBasisPurchase") },
    { value: "billing", label: t("dateBasisBilling") },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className="inline-flex rounded-full border border-border/70 bg-background p-0.5"
        role="group"
        aria-label={t("dateBasisAriaLabel")}
      >
        {options.map((opt) => {
          const active = opt.value === basis;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => select(opt.value)}
              className={
                active
                  ? "rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background transition-colors"
                  : "rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground">
        {basis === "billing" ? t("dateBasisCaptionBilling") : t("dateBasisCaptionPurchase")}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Render it on the Transactions page**

In `src/components/transactions/transactions-page.tsx`, add the import near the other component imports:

```ts
import { DateBasisToggle } from "@/components/transactions/date-basis-toggle";
```

Then render `<DateBasisToggle />` directly above the closing `</div>` of the kind-tabs row (the `<div>` that contains the `opt.label` buttons, right before the `{transactionsQuery.isError ...}` block). Place it on its own line so it sits between the tab row and the table:

```tsx
        <DateBasisToggle />
```

(If the surrounding layout needs spacing, wrap nothing extra — the component already manages its own gap. Keep it visually under the filters and above the table.)

- [ ] **Step 4: Verify typecheck + i18n**

Run: `bun run typecheck && bun run i18n:check`
Expected: no errors; no missing/orphan keys.

- [ ] **Step 5: Commit**

```bash
bunx biome format --write src/components/transactions/date-basis-toggle.tsx src/components/transactions/transactions-page.tsx src/i18n/messages/en.json src/i18n/messages/he.json
git add src/components/transactions/date-basis-toggle.tsx src/components/transactions/transactions-page.tsx src/i18n/messages/en.json src/i18n/messages/he.json
git commit -m "feat: purchase/billing date toggle on transactions page"
```

---

## Task 12: Help-panel section explaining purchase vs billing date

**Files:**
- Modify: `src/components/help/help-content.ts` (the `transactions` array in `HELP_SECTIONS`)
- Modify: `src/i18n/messages/en.json` and `src/i18n/messages/he.json` (the `help.transactions.sections` object)

- [ ] **Step 1: Register the section**

In `src/components/help/help-content.ts`, in `HELP_SECTIONS.transactions`, add a new entry at the end of the array:

```ts
    { id: "dateBasis", icon: "CalendarRange" },
```

(`CalendarRange` is already in `HelpIconName` and the `ICON_MAP`.)

- [ ] **Step 2: Add English help copy**

In `src/i18n/messages/en.json`, inside `help.transactions.sections`, add:

```json
      "dateBasis": {
        "title": "Purchase vs billing date",
        "body": "By default every transaction is counted on its purchase date, so a card purchase made in May is a May expense. Your bank counts it on the billing date instead, when the card bill is paid, which can be a month later. Use the Purchase / Billing toggle to switch this list to the bank's view when you are reconciling against a statement. Only the Transactions list changes; Home, Insights, and Budget always use purchase date.",
        "example": "A ₪410 electricity charge bought on May 3 is billed by the card company on June 14. In Purchase mode it appears under May; switch to Billing and it moves to June, matching your bank statement."
      }
```

- [ ] **Step 3: Add Hebrew help copy**

In `src/i18n/messages/he.json`, inside `help.transactions.sections`, add:

```json
      "dateBasis": {
        "title": "תאריך עסקה מול תאריך חיוב",
        "body": "כברירת מחדל כל תנועה נספרת לפי תאריך העסקה, כך שרכישת אשראי שבוצעה במאי היא הוצאה של מאי. הבנק סופר אותה לפי תאריך החיוב, כשחשבון האשראי משולם, ולעיתים זה חודש מאוחר יותר. השתמשו במתג עסקה / חיוב כדי להעביר את הרשימה הזו לתצוגת הבנק בעת התאמה מול דף חשבון. רק רשימת התנועות משתנה; בית, תובנות ותקציב משתמשים תמיד בתאריך העסקה.",
        "example": "חיוב חשמל של ₪410 שנרכש ב-3 במאי מחויב בידי חברת האשראי ב-14 ביוני. במצב עסקה הוא מופיע תחת מאי; מעבר למצב חיוב מעביר אותו ליוני, בהתאמה לדף החשבון בבנק."
      }
```

- [ ] **Step 4: Verify i18n + help-content parity test**

Run: `bun run i18n:check && bun test --conditions react-server src/components/help/help-content.test.ts`
Expected: no missing/orphan keys; help-content parity test PASSES (it loops the new `dateBasis` id for both locales).

- [ ] **Step 5: Commit**

```bash
bunx biome format --write src/components/help/help-content.ts src/i18n/messages/en.json src/i18n/messages/he.json
git add src/components/help/help-content.ts src/i18n/messages/en.json src/i18n/messages/he.json
git commit -m "docs: help section for purchase vs billing date"
```

---

## Task 13: Full gate + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the strict checks**

Run: `bun run format:check && bun run typecheck && bun run i18n:check && bun run knip && bun run react:doctor && bun test --conditions react-server`
Expected: all pass. (`bun run security` may report pre-existing transitive-dependency advisories for `protobufjs`/`js-yaml`; those are unrelated to this change and are not a regression — note them but do not attempt to fix them here.)

- [ ] **Step 2: Fix any knip "unused" findings**

If knip flags any new export as unused, ensure it is actually imported (e.g. `useDateBasis`, `DEFAULT_DATE_BASIS`). Every new export in this plan is consumed; if one is not, wire it up rather than deleting the feature.

- [ ] **Step 3: Manual verification via dev server (if an environment is available)**

```bash
BUDGETEER_DATA_DIR=./demo-data bun run seed:demo
BUDGETEER_DATA_DIR=./demo-data PORT=3000 bun dev
```

On `/transactions`, navigate to a month containing card purchases billed the next month, toggle Purchase ↔ Billing, and confirm: rows shift between months, each row's date cell follows the basis, and Home/Insights/Budget totals are unaffected. If no browser/runtime is available (headless CI), rely on the passing test gate and note that manual UI verification is pending.

- [ ] **Step 4: Update the README if the Transactions screenshot changed**

Per CLAUDE.md, UI changes regenerate affected screenshots. The toggle adds a control to the Transactions page. If you can run the app and capture `public/screenshots/transactions-light.png` from demo data, do so. If you cannot capture screenshots in this environment, add a line to the PR description noting the Transactions screenshot needs reg.

- [ ] **Step 5: Push the branch and open a PR**

```bash
git push -u origin feat/card-purchase-vs-billing-date
gh pr create --title "feat: purchase vs billing date toggle on transactions" --body "$(cat <<'BODY'
Adds a Purchase / Billing date toggle to the Transactions page so the list can be reconciled against a bank statement.

- New `billing_local_date` column (Asia/Jerusalem), backfilled on startup and populated on insert, mirroring `local_date`.
- `/api/transactions` reads an `x-date-basis` header (localStorage-backed) and swaps `local_date` for `COALESCE(billing_local_date, local_date)` in the month filter and date sort.
- Default stays purchase date; the header is only sent in billing mode, so existing behaviour is unchanged when off.
- Home, Insights, and Budget intentionally stay purchase-basis (their trend/forecast share the insights engine and are out of scope).
- Help panel gains a "Purchase vs billing date" section with a worked example.

Spec: docs/superpowers/specs/2026-06-16-card-purchase-vs-billing-date-design.md
Plan: docs/superpowers/plans/2026-06-16-card-purchase-vs-billing-date.md

Note: the Transactions screenshot may need regenerating from demo data.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

## Self-review notes (for the implementer)

- **Purchase mode is byte-identical to today:** the header is only sent when billing; `queryTransactions` only changes the filter/sort columns when `dateBasis === "billing"` for the sort, and the filter column resolves to `t.local_date` in purchase mode. No existing test should change.
- **Null safety:** `COALESCE(billing_local_date, local_date)` keeps rows with a null billing date on their purchase date rather than dropping them.
- **knip/i18n:** every new key and export is consumed (toggle, caption, help section, store hook, helpers). Run the gate in Task 13 and wire up anything flagged.
- **Type names are consistent across tasks:** `DateBasis`, `dateBasisColumn`, `isDateBasis`, `DEFAULT_DATE_BASIS`, `getDateBasisSync`, `setDateBasis`, `useDateBasis`, `getDateBasisFromRequest`, `billingLocalDate` / `billing_local_date`.
