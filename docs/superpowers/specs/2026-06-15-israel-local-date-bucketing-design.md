# Israel-Local Date Bucketing Design

**Date:** 2026-06-15
**Status:** Approved (design)

## Goal

Make every transaction belong to a single, canonical calendar date - its instant
in **Asia/Jerusalem** - and use that date consistently for aggregation, range
filtering, and display. This fixes monthly totals (trends, summary, category
spend) that currently drop end-of-month transactions into a gap between months.

## Background: the bug

Transactions are stored with `date` as the scraper's UTC ISO instant
(e.g. `2026-05-31T21:00:00.000Z`). For completed transactions this equals
Israel-local midnight expressed in UTC (Israel is UTC+2 in winter, +3 in summer),
so a transaction whose Israel-local date is June 1 is stored as `...-05-31T21:00:00.000Z`.

Two layers disagree on what date that is:

- **Display:** `formatDate` does `new Date(iso)` then `getDate()/getMonth()/...`,
  i.e. the **browser-local** date.
- **Range filters (SQL):** compare the **raw UTC string** lexically against
  date-only bounds, e.g. `date >= '2026-05-01' AND date <= '2026-05-31'`.

Because `'2026-05-31T21:00:00.000Z' > '2026-05-31'` as strings, the row is excluded
from May; and because `'2026-05-31T21:00:00.000Z' < '2026-06-01'`, it is also
excluded from June. End-of-month transactions therefore land in **no month** and
vanish from monthly aggregates.

Verified against the live DB (workspace 3, the account selection excluding
`965-140006_43`):

| Bucketing | May income | May expense |
|---|---|---|
| Raw-UTC bounds `date <= '2026-05-31'` (current) | 18,274.59 | 25,432.06 |
| Asia/Jerusalem local date | **24,999.34** | 25,450.00 |

The user's manual reconciliation was 24,999 - an exact match to Asia/Jerusalem
bucketing. (The expense column differs from the user's ~26,117 because matched
credit-card bill amounts are reclassified as transfers; income matching to the
cent confirms the convention.)

## Canonical rule

A transaction belongs to the calendar date of its instant in **Asia/Jerusalem**.
That single date drives aggregation, range filtering, and display. The raw UTC
`date` column is retained as the source of truth for the instant and for
intra-day ordering (instant order is monotonic with local order, so existing
`ORDER BY date` sorts stay correct).

## Design

### 1. Schema

New migration `src/server/db/migrations/026_local_date.sql`:

- `ALTER TABLE transactions ADD COLUMN local_date TEXT;` (nullable; backfilled in code).
- `CREATE INDEX IF NOT EXISTS idx_transactions_ws_local_date ON transactions(workspace_id, local_date);`

`local_date` stores `'YYYY-MM-DD'` in Jerusalem time.

### 2. Write path

**Conversion util** (`src/server/lib/date-utils.ts`):

```ts
export function toJerusalemDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}
```

`en-CA` yields `YYYY-MM-DD`. `Intl` carries IANA DST data, so this is correct
across the +2/+3 transition and independent of the host server's timezone (the
project is open-source and self-hosters may run in any timezone).

**Insert / upsert** (`src/server/db/queries/transactions.ts` insert path):
populate `local_date = toJerusalemDate(date)` on insert **and** in the
`ON CONFLICT` update branch. Pending transactions carry volatile clock times that
shift on resync, so recomputing on every upsert keeps `local_date` correct.

**Backfill** (one-time, in `getDb()` init after `runMigrations`): the migration
runner executes `.sql` files only and cannot do DST-correct conversion, so the
backfill runs in JS. Select all rows `WHERE local_date IS NULL`, compute
`toJerusalemDate(date)` for each, and `UPDATE` them inside a single transaction.
Idempotent: once every row has a `local_date`, subsequent boots match no rows and
do nothing. This must complete before any query runs, so it is synchronous in init.

### 3. Read path

**Range filters.** Every query that filters by a month/day range switches its
bound comparison column from `date` to `local_date`. The `from`/`to` contract is
unchanged - callers already pass `'YYYY-MM-DD'` strings (from `toLocalISODate` or
request params), and `local_date BETWEEN from AND to` (inclusive `<=`) is now
correct because `local_date` has no time component.

Call sites to convert:

- `transactions.ts`: `getMonthlySummary`, `getCategoryMonthlySpend`,
  `getMerchantMonthlySpend`, `getMerchantChargeDays`, `getTransactionsForAnomalies`,
  `getTopMerchants`, `getCategoryBreakdown`, `getCategorySpendInRange`,
  `getTopMerchantPerCategory`, `getCategorySpendByDay`, `getDailySpendTotals`,
  `getTopMerchantsForCategory`, `getPeriodTotal`, `getPeriodCount`, and the date
  range branch of `queryTransactions`.
- `home.ts`: `getHomeSummary`, `getTypicalMonthly`, `getHistoricalTrend`.
- `budgets.ts`: `getAutoBudgetAverage`.

**Derived expressions** that read the date for month/day extraction switch to
`local_date`:

- `strftime('%Y-%m', date)` -> `substr(local_date, 1, 7)` (monthly grouping).
- `strftime('%d', date)` -> `substr(local_date, 9, 2)` cast to integer (day of month).
- Day-keyed CTE joins `substr(t.date, 1, 10) = days.d` -> `t.local_date = days.d`
  (`getCategorySpendByDay`, `getDailySpendTotals`).

**Boundary derivations.** Computations that build "current month" / "trend
months" ranges from `now` are anchored to Asia/Jerusalem so "this month" agrees
with the canonical timezone on any server:

- `src/app/api/summary/route.ts` default `from`/`to`.
- `getHistoricalTrend` month loop in `home.ts`.
- Insights range computation in `src/server/insights/engine.ts`.

A shared helper derives the current Jerusalem `YYYY-MM-DD` (today) and the
first/last day of a Jerusalem month, replacing direct `now.getFullYear()/
getMonth()/getDate()` usage in these range builders.

### 4. Display

- Add `localDate: string` to the transaction API payload
  (`TransactionWithCategory` and the row mapping in `transactions.ts`).
- `formatDate` (`src/lib/formatters.ts`) takes the `'YYYY-MM-DD'` string and
  renders `dd/mm/yyyy` by splitting on `-`, with no `new Date()` parse and no
  timezone conversion.
- Update callers to pass `txn.localDate`: `src/components/dashboard/transactions-table.tsx`,
  `src/components/review/review-page.tsx`, `src/components/home/flagged-transactions.tsx`,
  and any other `formatDate(txn.date)` call sites.

Display then always matches the aggregation buckets, independent of the viewer's
browser timezone.

## Data flow

```
scrape -> txn.date (UTC ISO instant)
  -> insert: local_date = toJerusalemDate(date)        [Jerusalem YYYY-MM-DD]
  -> queries filter/group by local_date
  -> API payload includes localDate
  -> formatDate(localDate) renders dd/mm/yyyy
```

## Error handling / edge cases

- **DST transitions:** handled by `Intl` IANA data; no fixed-offset arithmetic.
- **Pending transactions:** volatile times -> `local_date` recomputed on each upsert.
- **NULL local_date:** only possible before backfill completes; backfill is
  synchronous in init and runs before queries, and the insert path always sets it.
- **Server timezone:** irrelevant to `local_date` (Intl pins Asia/Jerusalem);
  boundary derivations are also pinned to Asia/Jerusalem.
- **Sorting:** `ORDER BY date` (instant) is unchanged and remains correct because
  instant order is monotonic with Jerusalem-local order.

## Testing

Pure-logic unit tests (run under `bun test --conditions react-server`; DB-touching
code is verified via the dev server per project memory):

- `date-utils.test.ts` for `toJerusalemDate`:
  - summer `2026-05-31T21:00:00.000Z` -> `2026-06-01`
  - summer `2026-04-30T21:00:00.000Z` -> `2026-05-01`
  - winter `2025-12-31T22:00:00.000Z` -> `2026-01-01`
  - midday `2026-05-15T10:00:00.000Z` -> `2026-05-15`
- `formatters.test.ts` for `formatDate`:
  - `'2026-06-01'` -> `'01/06/2026'`
  - no timezone shift regardless of host TZ.

Manual verification via `bun dev`:

- Trend chart May income for the user's account selection reads **24,999.34**.
- End-of-month transactions appear in exactly one month (the Jerusalem month).
- Transactions list dates match the month each row aggregates into.

## CI

Full gate `bun run ci` must stay green: format, lint, typecheck, i18n check, knip,
react-doctor, security, `bun test`. Update README screenshots if the date display
changes are user-visible (per project PR rules).

## Out of scope

Flagged during investigation, not addressed here:

- Duplicate `הפקדת שיק` deposit (+342,317, transaction ids 2525 and 2527) on
  account `965-140006_43` - a dedup miss.
- The bounced-check wash on the same account (`הפקדת שיק` income +342,317 paired
  with `החזרת שיק` expense -342,317) inflating both income and expense.

These are dedup / event-modeling concerns, independent of date bucketing.
