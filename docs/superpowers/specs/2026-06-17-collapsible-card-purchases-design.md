# Collapsible card purchases under bill rows

Date: 2026-06-17

## Goal

In the transactions table, the individual credit-card purchase rows that belong to
a credit-card bill collapse and expand from that bill row. The bill row shows a
plus/minus toggle indicating collapsed/expanded state. Bill rows start collapsed.

## Background

The app already models a `credit_card_statement` financial event that groups one
`bill_payment` row (the bank debit that settles a card statement) with N
`purchase` rows (the individual card transactions). All members share an
`eventId`. The transactions table (`src/components/dashboard/transactions-table.tsx`)
currently renders every row as a flat list. The matched bill row shows a
matched-card transfer badge via `getCardBillBadgeState`.

The transactions list is filtered by month and paginated (50 rows/page) on the
server. A bill debited in June settles purchases made in May (purchase date basis)
or billed in June (billing date basis), so a bill's purchases are usually only on
the same page as the bill under the **billing** date basis.

## Scope

- Parent: a row with `eventRole === "bill_payment"`.
- Children: rows with `eventRole === "purchase"` whose `eventId` matches a
  `bill_payment` row present in the same loaded page.
- Grouping is purely client-side over the rows already loaded on the current page.
  No API or server changes.
- A bill row becomes expandable only when one or more of its purchase children are
  present in the same result set. Bills with no children on the page render as a
  normal row (no toggle). Purchase rows whose bill is not on the page render as
  normal standalone rows in their original position.

## Design

### Grouping transform (pure logic, unit tested)

Add a helper, `groupBillChildren(transactions)`, that takes the page's
`TransactionWithCategory[]` and returns an ordered render model:

```
type BillGroupRow = {
  txn: TransactionWithCategory;
  children: TransactionWithCategory[]; // empty unless this is a bill with loaded purchases
};
```

Algorithm:

1. Index `bill_payment` rows by `eventId`.
2. Walk the original (already server-sorted) list. For each `purchase` row whose
   `eventId` maps to a present bill, append it to that bill's `children` and skip
   it from the top-level output.
3. Every other row (including bills, orphan purchases, and bills without loaded
   children) becomes a top-level `BillGroupRow`. A bill keeps its original sorted
   position; its children follow it when rendered expanded.

This transform is order-preserving for the top-level rows and is the only piece
with non-trivial logic, so it lives in a separate module
(e.g. `src/lib/bill-grouping.ts`) with tests.

### Component changes (`transactions-table.tsx`)

- `expandedEvents: Set<number>` in component state. Empty = all collapsed (default).
- Render from `groupBillChildren(transactions)` instead of mapping `transactions`
  directly.
- **Toggle control:** in the existing first column (`w-[32px]`), a bill row that
  has children renders a chevron/plus-minus button (replacing the direction arrow
  for that row). Clicking toggles its `eventId` in `expandedEvents`. The button
  has an aria-label (`expandPurchases` / `collapsePurchases`). Rows without
  children keep the direction arrow as today.
- **Collapsed summary:** the bill row's description area shows a small count badge
  ("N items", pluralized) next to the existing matched-card badge, so the number
  of hidden purchases is visible while collapsed. The badge stays when expanded.
- **Child rows:** rendered immediately after their bill row only when the event is
  expanded. Styled as nested: indented description plus a subtle muted background
  / left accent so the hierarchy reads clearly. Children keep all existing cell
  content and row actions (category, kind, exclude, etc.).

### Preserved behavior

- Sorting: bills keep their server-sorted slot; children render directly beneath.
- Pagination and total counts: grouping is display-only; counts are unchanged.
- Filters, search, and all existing row dropdown menus continue to work.

## i18n

New keys in `src/i18n/messages/en.json` and `src/i18n/messages/he.json`:

- `cardItemsCount` — pluralized count badge, e.g. "{count} items".
- `expandPurchases` — toggle aria-label (collapsed state).
- `collapsePurchases` — toggle aria-label (expanded state).

## Testing

- Unit tests for `groupBillChildren`: bill with children, bill with no children on
  page, orphan purchase (bill absent), multiple bills interleaved, ordering
  preserved.
- UI verified via the dev server (toggle expands/collapses, count badge correct,
  nesting reads clearly, no console errors).
- Regenerate the affected README screenshot from synthetic/mock data and update
  README copy, per project PR rules.

## Out of scope

- Fetching a bill's purchases from the server when they are not on the current
  page (chosen approach is client-side grouping of loaded rows only).
- Persisting expanded/collapsed state across navigation or reloads.
