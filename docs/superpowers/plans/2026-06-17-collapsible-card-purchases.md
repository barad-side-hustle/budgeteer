# Collapsible Card Purchases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the transactions table, nest each credit-card bill's loaded purchase rows under the bill row with a collapsed-by-default plus/minus toggle and a hidden-item count badge.

**Architecture:** A pure, unit-tested transform groups the already-loaded page rows into a parent/child render model (bill_payment parent, its same-`eventId` purchase rows as children). `transactions-table.tsx` renders from that model, holds an `expandedEvents` Set in state, shows a toggle in the first column for bills that have loaded children, and renders child rows indented when expanded. No server/API changes.

**Tech Stack:** Next.js 16 App Router, React (client component), TypeScript strict, `bun test`, next-intl (ICU), Tailwind v4, lucide-react icons.

---

### Task 1: Pure grouping transform with tests

**Files:**
- Create: `src/lib/bill-grouping.ts`
- Test: `src/lib/bill-grouping.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, test } from "bun:test";

import { groupBillChildren } from "@/lib/bill-grouping";
import type { TransactionWithCategory } from "@/lib/types";

function txn(over: Partial<TransactionWithCategory>): TransactionWithCategory {
  return {
    id: 0,
    accountNumber: "1",
    date: "2026-06-01",
    processedDate: "2026-06-01",
    localDate: "2026-06-01",
    billingLocalDate: "2026-06-01",
    originalAmount: 0,
    originalCurrency: "ILS",
    chargedAmount: 0,
    chargedCurrency: "ILS",
    description: "x",
    memo: null,
    type: "normal",
    status: "completed",
    identifier: null,
    installmentNumber: null,
    installmentTotal: null,
    categoryId: null,
    categorySource: null,
    aiConfidence: null,
    provider: "isracard",
    credentialId: null,
    accountLabel: null,
    accountName: null,
    syncRunId: 1,
    kind: "expense",
    needsReview: false,
    eventId: null,
    eventRole: null,
    matchConfidence: null,
    createdAt: "",
    updatedAt: "",
    categoryName: null,
    categoryColor: null,
    isExcluded: false,
    matchedCardNumber: null,
    ...over,
  };
}

describe("groupBillChildren", () => {
  test("nests purchases under their bill and removes them from top level", () => {
    const bill = txn({ id: 1, eventId: 10, eventRole: "bill_payment", kind: "transfer" });
    const p1 = txn({ id: 2, eventId: 10, eventRole: "purchase" });
    const p2 = txn({ id: 3, eventId: 10, eventRole: "purchase" });
    const rows = groupBillChildren([bill, p1, p2]);
    expect(rows).toHaveLength(1);
    expect(rows[0].txn.id).toBe(1);
    expect(rows[0].children.map((c) => c.id)).toEqual([2, 3]);
  });

  test("bill with no loaded children has empty children", () => {
    const bill = txn({ id: 1, eventId: 10, eventRole: "bill_payment", kind: "transfer" });
    const rows = groupBillChildren([bill]);
    expect(rows).toHaveLength(1);
    expect(rows[0].children).toEqual([]);
  });

  test("orphan purchase (bill absent) stays as a top-level row", () => {
    const p1 = txn({ id: 2, eventId: 10, eventRole: "purchase" });
    const rows = groupBillChildren([p1]);
    expect(rows).toHaveLength(1);
    expect(rows[0].txn.id).toBe(2);
    expect(rows[0].children).toEqual([]);
  });

  test("preserves top-level order across multiple bills and plain rows", () => {
    const plain = txn({ id: 1 });
    const billA = txn({ id: 2, eventId: 10, eventRole: "bill_payment", kind: "transfer" });
    const a1 = txn({ id: 3, eventId: 10, eventRole: "purchase" });
    const billB = txn({ id: 4, eventId: 20, eventRole: "bill_payment", kind: "transfer" });
    const b1 = txn({ id: 5, eventId: 20, eventRole: "purchase" });
    const rows = groupBillChildren([plain, billA, a1, billB, b1]);
    expect(rows.map((r) => r.txn.id)).toEqual([1, 2, 4]);
    expect(rows[1].children.map((c) => c.id)).toEqual([3]);
    expect(rows[2].children.map((c) => c.id)).toEqual([5]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/bill-grouping.test.ts`
Expected: FAIL — cannot find module `@/lib/bill-grouping` / `groupBillChildren` is not defined.

- [ ] **Step 3: Write minimal implementation**

```typescript
import type { TransactionWithCategory } from "@/lib/types";

export interface BillGroupRow {
  txn: TransactionWithCategory;
  children: TransactionWithCategory[];
}

export function groupBillChildren(
  transactions: TransactionWithCategory[],
): BillGroupRow[] {
  const billByEvent = new Map<number, BillGroupRow>();
  for (const txn of transactions) {
    if (txn.eventRole === "bill_payment" && txn.eventId != null) {
      billByEvent.set(txn.eventId, { txn, children: [] });
    }
  }

  const rows: BillGroupRow[] = [];
  for (const txn of transactions) {
    if (txn.eventRole === "bill_payment" && txn.eventId != null) {
      const group = billByEvent.get(txn.eventId);
      if (group) rows.push(group);
      continue;
    }
    if (
      txn.eventRole === "purchase" &&
      txn.eventId != null &&
      billByEvent.has(txn.eventId)
    ) {
      billByEvent.get(txn.eventId)?.children.push(txn);
      continue;
    }
    rows.push({ txn, children: [] });
  }
  return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/bill-grouping.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bill-grouping.ts src/lib/bill-grouping.test.ts
git commit -m "feat: pure transform to group card purchases under bill rows"
```

---

### Task 2: i18n keys for toggle and count badge

**Files:**
- Modify: `src/i18n/messages/en.json`
- Modify: `src/i18n/messages/he.json`

- [ ] **Step 1: Add keys to `en.json`**

Inside the `"transactions"` object (next to `rowInstallment`), add:

```json
    "cardItemsCount": "{count, plural, one {# item} other {# items}}",
    "expandPurchases": "Show card purchases",
    "collapsePurchases": "Hide card purchases",
```

- [ ] **Step 2: Add the same keys to `he.json`**

Inside the `"transactions"` object, add:

```json
    "cardItemsCount": "{count, plural, one {פריט #} other {# פריטים}}",
    "expandPurchases": "הצג חיובי כרטיס",
    "collapsePurchases": "הסתר חיובי כרטיס",
```

- [ ] **Step 3: Run the i18n check**

Run: `bun run i18n:check`
Expected: PASS — no missing or orphan keys.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/en.json src/i18n/messages/he.json
git commit -m "feat: i18n keys for collapsible card purchases"
```

---

### Task 3: Render grouped rows with expand/collapse toggle

**Files:**
- Modify: `src/components/dashboard/transactions-table.tsx`

This task replaces the flat `transactions.map(...)` body with a grouped render
that uses Task 1's transform and Task 2's keys. The per-row cell markup
(direction icon, date, description+badges, category dropdown, source, amount,
actions menu) is unchanged; it is extracted into a `renderRow` helper so it can be
reused for both bill rows and child rows.

- [ ] **Step 1: Add imports and expanded state**

Add to the lucide-react import (line ~4-14), keeping alphabetical grouping with the existing icons:

```typescript
  ChevronRight,
```

Add the grouping import near the other `@/lib` imports:

```typescript
import { groupBillChildren } from "@/lib/bill-grouping";
```

Inside the component body, next to the other `useState` calls (near line 115):

```typescript
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  const toggleEvent = (eventId: number) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };
```

- [ ] **Step 2: Extract the existing row markup into a `renderRow` helper**

Inside the component, above the `return (`, define a helper that returns the
`<TableRow>` currently produced inside `transactions.map`. Move the body of the
existing `transactions.map((txn) => { ... return (<TableRow .../>) })` into this
function verbatim, with two changes:

1. The function signature carries the nesting flag and toggle UI:

```typescript
  const renderRow = (
    txn: TransactionWithCategory,
    options: { isChild?: boolean; childCount?: number; expanded?: boolean } = {},
  ) => {
    const { isChild = false, childCount = 0, expanded = false } = options;
    const isIncome = txn.chargedAmount > 0;
    const directionColor = isIncome ? "var(--status-on-track)" : "var(--status-over)";
    const categoryKind: Kind = isIncome ? "income" : "expense";
    const matchedCardBill = getCardBillBadgeState(
      txn.eventRole,
      txn.kind,
      txn.matchedCardNumber,
    )?.matched;
    const categoryName = txn.categoryName
      ? translateCategoryName(txn.categoryName, tCat)
      : matchedCardBill
        ? t("categoryCardTransfer")
        : t("rowUncategorized");
    const expandable = childCount > 0;
    return (
      <TableRow
        key={txn.id}
        className={cn(
          "transition-colors duration-200 hover:bg-muted/50",
          txn.isExcluded && "opacity-50",
          isChild && "bg-muted/30",
        )}
      >
        <TableCell>
          {expandable ? (
            <button
              type="button"
              onClick={() => txn.eventId != null && toggleEvent(txn.eventId)}
              aria-label={expanded ? t("collapsePurchases") : t("expandPurchases")}
              className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronRight
                className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")}
              />
            </button>
          ) : (
            <div style={{ color: directionColor }} className={cn(isChild && "ps-4")}>
              {isIncome ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : (
                <ArrowDownRight className="h-4 w-4" />
              )}
            </div>
          )}
        </TableCell>
```

Keep the date cell as-is. In the description `<TableCell>`, indent child rows by
wrapping the description in the existing `<div className="flex items-center gap-2">`
with an added `isChild && "ps-4"` class, and add the count badge after the
matched-card badge block (see Step 3). Everything from the category cell through
the actions cell stays identical to the current code. End the helper with
`</TableRow> ); };`.

- [ ] **Step 3: Add the count badge to the description cell**

In `renderRow`, inside the description `<TableCell>`'s flex row, after the existing
event-badge IIFE and before/after the `needsReview` badge, add the collapsed/anytime
count badge (only on bills that have children):

```typescript
                          {childCount > 0 && (
                            <span
                              className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums"
                              title={t("cardItemsCount", { count: childCount })}
                            >
                              {t("cardItemsCount", { count: childCount })}
                            </span>
                          )}
```

Apply the indent on the description wrapper for child rows:

```typescript
                        <div className={cn("flex items-center gap-2", isChild && "ps-4")}>
```

- [ ] **Step 4: Replace the `<TableBody>` map with grouped rendering**

Replace the existing `{transactions.map((txn) => { ... })}` inside `<TableBody>`
with:

```tsx
                {groupBillChildren(transactions).map((group) => {
                  const expanded =
                    group.txn.eventId != null && expandedEvents.has(group.txn.eventId);
                  return (
                    <Fragment key={group.txn.id}>
                      {renderRow(group.txn, {
                        childCount: group.children.length,
                        expanded,
                      })}
                      {expanded &&
                        group.children.map((child) =>
                          renderRow(child, { isChild: true }),
                        )}
                    </Fragment>
                  );
                })}
```

Add `Fragment` to the React import at the top of the file:

```typescript
import { Fragment, useState } from "react";
```

- [ ] **Step 5: Typecheck and run the full gate**

Run: `bun run typecheck`
Expected: PASS (no type errors).

Run: `bun run format:check && bun run knip && bun run react:doctor && bun test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/transactions-table.tsx
git commit -m "feat: collapse and expand card purchases under bill rows"
```

---

### Task 4: Verify in the browser

**Files:** none (manual verification via dev server).

- [ ] **Step 1: Start the dev server and open the transactions page**

Use the preview tooling (`preview_start`, then navigate to `/transactions`).
Switch the date basis toggle to **Billing** so a bill and its purchases land in
the same month.

- [ ] **Step 2: Confirm behavior**

- A matched bill row shows a chevron (collapsed, pointing right) plus an "N items" badge.
- Clicking the chevron rotates it down and reveals indented purchase rows beneath the bill.
- Clicking again hides them.
- Bills with no loaded purchases, and ordinary rows, show the normal direction arrow and no badge.
- No console errors (`preview_console_logs`).

- [ ] **Step 3: Capture proof**

Take a `preview_screenshot` of the expanded state for the PR / README.

---

### Task 5: Update README and screenshot

**Files:**
- Modify: `README.md`
- Modify/Regenerate: affected `public/screenshots/*.png`

- [ ] **Step 1: Regenerate the transactions screenshot from mock data**

Per CLAUDE.md PR rules, seed a throwaway mock DB (point the app at it via
`BUDGETEER_DATA_DIR`) and capture the transactions screenshot showing an expanded
bill group. Never use real data.

- [ ] **Step 2: Update README copy**

Add a sentence under the transactions section describing that card purchases
collapse/expand under their bill row.

- [ ] **Step 3: Commit**

```bash
git add README.md public/screenshots
git commit -m "docs: document collapsible card purchases under bill rows"
```

---

## Self-Review

- **Spec coverage:** grouping transform (Task 1), client-side over loaded page only (Task 1 logic), collapsed-by-default toggle in first column (Task 3), count badge (Tasks 2-3), indented children (Task 3), i18n keys (Task 2), preserved row actions/sorting/pagination (Task 3 reuses existing markup, display-only), tests (Task 1), browser verify (Task 4), README + screenshot (Task 5). All covered.
- **Placeholder scan:** no TBD/TODO; all code shown.
- **Type consistency:** `groupBillChildren` / `BillGroupRow` used consistently across Tasks 1 and 3; key names `cardItemsCount` / `expandPurchases` / `collapsePurchases` consistent across Tasks 2 and 3.
