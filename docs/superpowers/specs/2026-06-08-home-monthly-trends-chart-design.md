# Home monthly trends chart

## Summary

The home page lacks any month-over-month visualization. Add a full-width
"Trends" card under the forecast hero that shows income versus expense per
synced month, with the net result as the hero line and a summary of average
income, expense, and net across the range.

This largely finishes a dormant pipeline: `buildInsightPayload` already
computes a `trend` field (monthly expense totals via `getHistoricalTrend`)
that is included in the insights payload but rendered nowhere. We extend that
data with income and net, then visualize it.

## Goals

- Show one income bar and one expense bar per synced month, with a net trend
  line overlaid as the visual hero.
- Summarize the range with average income, average expense, and average net.
- Reveal exact per-month income, expense, and net on hover.
- Show only months the user has actually synced (no leading empty months),
  capped at 12 months for readability.

## Non-goals

- No date-range picker or 6/12 toggle. The range is automatic.
- No per-category breakdown in this card (that already exists elsewhere).
- No account-filter control beyond whatever the insights payload already uses.

## Decisions (locked during brainstorming)

- **Chart style:** muted income/expense bars in the background with the net
  line as the hero (income emerald, expense rose, net indigo).
- **Placement:** full-width band on the home page, directly below the forecast
  hero and above the existing 12-column card grid.
- **Range:** all synced months, capped at 12; trim leading months that have no
  income and no expense.
- **Numbers:** KPI trio shows averages (not totals, not current month). Exact
  per-month figures appear only on hover.

## Architecture and data flow

The home page already calls `getInsights()` -> `buildInsightPayload()`, whose
payload carries `trend: HomeHistoricalTrendPoint[]`. We extend this path rather
than add a parallel query or endpoint.

1. **`getHistoricalTrend`** (`src/server/db/queries/...`) gains `income` and
   `net` per month. Reuse the existing income/expense `CASE` aggregation
   pattern already present in `bank-accounts.ts`
   (`SUM(CASE WHEN kind='income' THEN charged_amount ...)` and
   `SUM(CASE WHEN kind='expense' THEN ABS(charged_amount) ...)`). `total`
   keeps its current meaning (expense); `net = income - total`.
2. **Window:** raise the historical window to 12 months. After fetching, trim
   leading months where both income and expense are zero so the chart starts
   at the first synced month.
3. The extended `trend` flows through the unchanged insights payload to the
   home page.

## Types

Extend `HomeHistoricalTrendPoint` in `src/lib/types.ts`:

```ts
export interface HomeHistoricalTrendPoint {
  month: string;
  label: string;
  total: number;   // expense (unchanged)
  income: number;  // new
  net: number;     // new (income - total)
  isCurrent: boolean;
}
```

No other payload type changes. Nothing currently consumes `trend`, so adding
fields is safe.

## Pure helpers (testable without the DB)

Add a small module (e.g. `src/server/insights/cashflow.ts`) with:

- `trimToSyncedMonths(points: HomeHistoricalTrendPoint[]) => HomeHistoricalTrendPoint[]`
  drops leading entries where `income === 0 && total === 0`.
- `summarizeCashflow(points) => { avgIncome: number; avgExpense: number; avgNet: number }`
  averages over the (trimmed) points; returns zeros for an empty array.

Keeping these pure mirrors the project's existing insights test style and lets
the chart logic be verified without a database.

## Component

New `src/components/home/trends-chart.tsx` (client component), wrapped in the
existing `CardShell`:

- `label`: "Trends"; `description`: "Income vs expense, last N months synced";
  `icon`: a lucide trend/bar-chart icon.
- **KPI trio in the CardShell `action` slot** (it already right-aligns header
  content): Avg income (emerald), Avg expense (rose), Avg net (indigo line
  color, but the value text is green when positive and rose when negative).
- **Chart via recharts `ComposedChart`** (recharts is already a dependency,
  used in `budget-detail-sheet.tsx`):
  - Two `<Bar>` series, income and expense, rendered muted (~60% opacity).
  - One `<Line>` for net, indigo, full opacity, as the hero.
  - Month labels on the X axis; no visible Y axis, matching the approved mock.
  - A custom `<Tooltip>` showing exact income, expense, and net for the hovered
    month.
- Must render correctly in RTL (Hebrew home), with the month axis reading
  right to left.

## Home page integration

In `src/components/home/home-page.tsx`, insert a full-width row between
`<ForecastHero>` and the 12-column grid:

- Loading: `CardSkeleton` (matching the other cards).
- Error / missing: `CardError` with retry, like the existing sections.
- Otherwise: `<TrendsChart points={data.trend} />`.

## Edge cases

- **0 synced months** (everything trimmed): render a gentle empty state inside
  the card ("Sync to see your monthly trends") rather than an empty chart.
- **1 month:** bars render; the net line is a single dot. Acceptable.
- **Negative net:** the net line dips; bars always sit on a zero baseline; the
  Avg-net KPI shows a leading minus and rose color.

## i18n

Add keys under the `home` namespace in both locale files (en and he) for the
title, description, the three KPI labels, the empty state, and the tooltip
labels. `i18n:check` must pass with no missing or orphan keys.

## Testing

- Unit tests for `trimToSyncedMonths` (leading-zero trim, all-zero array,
  no-trim case) and `summarizeCashflow` (averages including a negative-net
  month, and the empty-array zero case).
- Full `bun run ci` gate (format, i18n, knip, react-doctor, tests) must pass.

## Documentation

Per project rules, this is a user-facing UI change: regenerate the home page
screenshot from synthetic mock data and update the README in the same PR so it
does not lag the UI.
