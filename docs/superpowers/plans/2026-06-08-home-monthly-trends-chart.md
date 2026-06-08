# Home Monthly Trends Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-width "Trends" card to the home page showing income vs expense per synced month with the net result as the hero line and a summary of average income, expense, and net.

**Architecture:** Finish a dormant pipeline. `buildInsightPayload` already produces a `trend` field (monthly expense totals via `getHistoricalTrend`) that nothing renders. Extend that data with income and net, expose pure summary/trim helpers, and render it with a recharts `ComposedChart` (bars + line) placed below the forecast hero.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, better-sqlite3, recharts (already a dependency), next-intl, Tailwind v4, Bun test runner.

---

## File Structure

- `src/lib/cashflow.ts` (create) — pure, framework-agnostic helpers (`trimToSyncedMonths`, `summarizeCashflow`) importable by both server (engine/query) and client (component).
- `src/lib/cashflow.test.ts` (create) — unit tests for the helpers.
- `src/lib/types.ts` (modify) — extend `HomeHistoricalTrendPoint` with `income` and `net`.
- `src/server/db/queries/home.ts` (modify) — `getHistoricalTrend` returns income/net and trims leading empty months.
- `src/server/insights/engine.ts` (modify) — widen the trend window to 12 months.
- `src/i18n/messages/en.json` and `src/i18n/messages/he.json` (modify) — new `home` keys.
- `src/components/home/trends-chart.tsx` (create) — the chart card.
- `src/components/home/home-page.tsx` (modify) — render the card below the forecast hero.

---

## Task 1: Pure cashflow helpers

**Files:**
- Create: `src/lib/cashflow.ts`
- Test: `src/lib/cashflow.test.ts`

Note: this task references `HomeHistoricalTrendPoint` with `income`/`net`. Those fields are added in Task 2; for this task, the test builds the object literally, so no import-time dependency on the new fields is required beyond the type. If `bun test` complains about missing fields before Task 2, run Task 2's type edit first. To keep ordering simple, Task 2 edits the type; this task only needs the type to exist (it already does).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/cashflow.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { summarizeCashflow, trimToSyncedMonths } from "@/lib/cashflow";
import type { HomeHistoricalTrendPoint } from "@/lib/types";

function pt(month: string, income: number, total: number): HomeHistoricalTrendPoint {
  return { month, label: month, income, total, net: income - total, isCurrent: false };
}

describe("trimToSyncedMonths", () => {
  test("drops leading months with no income and no expense", () => {
    const out = trimToSyncedMonths([
      pt("2026-01", 0, 0),
      pt("2026-02", 0, 0),
      pt("2026-03", 100, 40),
      pt("2026-04", 0, 0),
    ]);
    expect(out.map((p) => p.month)).toEqual(["2026-03", "2026-04"]);
  });

  test("keeps everything when the first month has activity", () => {
    const out = trimToSyncedMonths([pt("2026-01", 50, 20), pt("2026-02", 0, 0)]);
    expect(out).toHaveLength(2);
  });

  test("returns empty when no month has activity", () => {
    const out = trimToSyncedMonths([pt("2026-01", 0, 0), pt("2026-02", 0, 0)]);
    expect(out).toHaveLength(0);
  });
});

describe("summarizeCashflow", () => {
  test("averages income, expense, and net across points", () => {
    const s = summarizeCashflow([pt("2026-01", 100, 40), pt("2026-02", 200, 60)]);
    expect(s.avgIncome).toBe(150);
    expect(s.avgExpense).toBe(50);
    expect(s.avgNet).toBe(100);
  });

  test("supports a negative average net", () => {
    const s = summarizeCashflow([pt("2026-01", 30, 100)]);
    expect(s.avgNet).toBe(-70);
  });

  test("returns zeros for an empty array", () => {
    expect(summarizeCashflow([])).toEqual({ avgIncome: 0, avgExpense: 0, avgNet: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/cashflow.test.ts`
Expected: FAIL — cannot resolve `@/lib/cashflow` (module does not exist yet).

- [ ] **Step 3: Implement the helpers**

Create `src/lib/cashflow.ts`:

```ts
import type { HomeHistoricalTrendPoint } from "@/lib/types";

export function trimToSyncedMonths(
  points: HomeHistoricalTrendPoint[],
): HomeHistoricalTrendPoint[] {
  let start = 0;
  while (start < points.length && points[start].income === 0 && points[start].total === 0) {
    start++;
  }
  return points.slice(start);
}

export interface CashflowSummary {
  avgIncome: number;
  avgExpense: number;
  avgNet: number;
}

export function summarizeCashflow(points: HomeHistoricalTrendPoint[]): CashflowSummary {
  if (points.length === 0) {
    return { avgIncome: 0, avgExpense: 0, avgNet: 0 };
  }
  const totals = points.reduce(
    (acc, p) => {
      acc.income += p.income;
      acc.expense += p.total;
      acc.net += p.net;
      return acc;
    },
    { income: 0, expense: 0, net: 0 },
  );
  const n = points.length;
  return {
    avgIncome: totals.income / n,
    avgExpense: totals.expense / n,
    avgNet: totals.net / n,
  };
}
```

Note: this file imports the extended `HomeHistoricalTrendPoint` (with `income`/`net`). Apply Task 2 Step 1 (the type edit) before running Step 4 if your tooling resolves types eagerly. The test object literal already includes `income` and `net`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/cashflow.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cashflow.ts src/lib/cashflow.test.ts
git commit -m "feat: add pure cashflow trim and summary helpers"
```

---

## Task 2: Extend trend type, query, and window

**Files:**
- Modify: `src/lib/types.ts:229` (`HomeHistoricalTrendPoint`)
- Modify: `src/server/db/queries/home.ts` (`getHistoricalTrend`)
- Modify: `src/server/insights/engine.ts:40` (`HISTORICAL_MONTHS`)

- [ ] **Step 1: Extend the type**

In `src/lib/types.ts`, replace the `HomeHistoricalTrendPoint` interface:

```ts
export interface HomeHistoricalTrendPoint {
  month: string;
  label: string;
  total: number;
  income: number;
  net: number;
  isCurrent: boolean;
}
```

- [ ] **Step 2: Update the query to compute income and net, and trim**

In `src/server/db/queries/home.ts`, add the import near the other imports at the top of the file:

```ts
import { trimToSyncedMonths } from "@/lib/cashflow";
```

Then replace the statement and the final `return months.map(...)` block of `getHistoricalTrend` with:

```ts
  const stmt = db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN kind = 'expense' THEN ABS(charged_amount) ELSE 0 END), 0) as total,
       COALESCE(SUM(CASE WHEN kind = 'income' THEN charged_amount ELSE 0 END), 0) as income
     FROM transactions
     WHERE workspace_id = ? AND date >= ? AND date <= ?
       AND status = 'completed' AND is_excluded = 0${acct.sql}`,
  );

  const points = months.map((m) => {
    const row = stmt.get(workspaceId, m.from, m.to, ...acct.values) as {
      total: number;
      income: number;
    };
    return {
      month: m.key,
      label: m.label,
      total: row.total,
      income: row.income,
      net: row.income - row.total,
      isCurrent: m.key === currentMonthKey,
    };
  });

  return trimToSyncedMonths(points);
```

(The previous statement filtered `AND kind = 'expense'` in the WHERE clause; the new one must NOT, because it aggregates both kinds with CASE.)

- [ ] **Step 3: Widen the trend window to 12 months**

In `src/server/insights/engine.ts`, change:

```ts
const HISTORICAL_MONTHS = 8;
```

to:

```ts
const HISTORICAL_MONTHS = 12;
```

- [ ] **Step 4: Verify typecheck and existing tests**

Run: `bun run typecheck`
Expected: PASS, no errors.

Run: `bun test`
Expected: PASS — all existing tests plus the 6 from Task 1.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/server/db/queries/home.ts src/server/insights/engine.ts
git commit -m "feat: include income and net in home trend, widen window to 12 months"
```

---

## Task 3: Add i18n keys

**Files:**
- Modify: `src/i18n/messages/en.json` (`home` object)
- Modify: `src/i18n/messages/he.json` (`home` object)

- [ ] **Step 1: Add English keys**

In `src/i18n/messages/en.json`, inside the `"home"` object, add these keys (place them after the existing `"breakdownTotal"` key to keep related entries together):

```json
    "trendsTitle": "Trends",
    "trendsSubtitle": "Income vs expense · last {count} months",
    "trendsEmpty": "Sync to see your monthly trends.",
    "trendsAvgIncome": "Avg income",
    "trendsAvgExpense": "Avg expense",
    "trendsAvgNet": "Avg net",
    "trendsIncome": "Income",
    "trendsExpense": "Expense",
    "trendsNet": "Net",
```

- [ ] **Step 2: Add Hebrew keys**

In `src/i18n/messages/he.json`, inside the `"home"` object, add the matching keys:

```json
    "trendsTitle": "מגמות",
    "trendsSubtitle": "הכנסות מול הוצאות · {count} חודשים אחרונים",
    "trendsEmpty": "בצעו סנכרון כדי לראות מגמות חודשיות.",
    "trendsAvgIncome": "הכנסה ממוצעת",
    "trendsAvgExpense": "הוצאה ממוצעת",
    "trendsAvgNet": "נטו ממוצע",
    "trendsIncome": "הכנסה",
    "trendsExpense": "הוצאה",
    "trendsNet": "נטו",
```

- [ ] **Step 3: Verify i18n check and JSON validity**

Run: `bun run i18n:check`
Expected: PASS — no missing or orphan keys (en and he have the same key set).

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/en.json src/i18n/messages/he.json
git commit -m "feat: add i18n keys for home trends chart"
```

---

## Task 4: Trends chart component and home page wiring

**Files:**
- Create: `src/components/home/trends-chart.tsx`
- Modify: `src/components/home/home-page.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/home/trends-chart.tsx`:

```tsx
"use client";

import { TrendingUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { CardShell } from "@/components/home/card-shell";
import type { Locale } from "@/i18n/routing";
import { summarizeCashflow } from "@/lib/cashflow";
import { formatCurrency, formatMonthLabel } from "@/lib/formatters";
import type { HomeHistoricalTrendPoint } from "@/lib/types";

const INCOME_COLOR = "#34d399";
const EXPENSE_COLOR = "#fb7185";
const NET_COLOR = "#818cf8";

function bcp(locale: Locale): string {
  return locale === "he" ? "he-IL" : "en-US";
}

function monthDate(month: string): Date {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, (m ?? 1) - 1, 1);
}

function axisLabel(month: string, locale: Locale): string {
  return monthDate(month).toLocaleDateString(bcp(locale), { month: "short" });
}

export function TrendsChart({ points }: { points: HomeHistoricalTrendPoint[] }) {
  const t = useTranslations("home");
  const locale = useLocale() as Locale;
  const fc = (n: number) => formatCurrency(n, "ILS", locale);

  if (points.length === 0) {
    return (
      <CardShell label={t("trendsTitle")} icon={<TrendingUp />}>
        <div className="flex flex-1 items-center justify-center py-10 text-center text-sm text-muted-foreground">
          {t("trendsEmpty")}
        </div>
      </CardShell>
    );
  }

  const summary = summarizeCashflow(points);
  const data = points.map((p) => ({
    axis: axisLabel(p.month, locale),
    full: formatMonthLabel(monthDate(p.month), locale),
    income: p.income,
    expense: p.total,
    net: p.net,
  }));

  return (
    <CardShell
      label={t("trendsTitle")}
      description={t("trendsSubtitle", { count: points.length })}
      icon={<TrendingUp />}
      action={
        <div className="flex gap-5">
          <Kpi label={t("trendsAvgIncome")} value={fc(summary.avgIncome)} color={INCOME_COLOR} />
          <Kpi label={t("trendsAvgExpense")} value={fc(summary.avgExpense)} color={EXPENSE_COLOR} />
          <Kpi
            label={t("trendsAvgNet")}
            value={fc(summary.avgNet)}
            color={summary.avgNet < 0 ? EXPENSE_COLOR : INCOME_COLOR}
          />
        </div>
      }
    >
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 4, bottom: 4, left: 4 }}>
            <XAxis
              dataKey="axis"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              reversed={locale === "he"}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as {
                  full: string;
                  income: number;
                  expense: number;
                  net: number;
                };
                return (
                  <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                    <div className="mb-1 font-medium">{p.full}</div>
                    <TooltipRow label={t("trendsIncome")} value={fc(p.income)} color={INCOME_COLOR} />
                    <TooltipRow
                      label={t("trendsExpense")}
                      value={fc(p.expense)}
                      color={EXPENSE_COLOR}
                    />
                    <div className="mt-1 border-t pt-1">
                      <TooltipRow
                        label={t("trendsNet")}
                        value={fc(p.net)}
                        color={p.net < 0 ? EXPENSE_COLOR : NET_COLOR}
                      />
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="income" fill={INCOME_COLOR} fillOpacity={0.55} radius={[3, 3, 0, 0]} />
            <Bar dataKey="expense" fill={EXPENSE_COLOR} fillOpacity={0.55} radius={[3, 3, 0, 0]} />
            <Line
              dataKey="net"
              stroke={NET_COLOR}
              strokeWidth={3}
              dot={{ r: 3, fill: NET_COLOR }}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </CardShell>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-end">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function TooltipRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex justify-between gap-4" style={{ color }}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the home page**

In `src/components/home/home-page.tsx`, add the import alongside the other home-component imports:

```tsx
import { TrendsChart } from "@/components/home/trends-chart";
```

Then, inside the `<div className="flex flex-col gap-4 md:gap-5 lg:gap-6">`, insert a new block immediately AFTER the forecast hero block (the one ending with `<ForecastHero forecast={forecast.data.forecast} />` and its closing `)}`) and BEFORE the `<div className="grid grid-cols-12 ...">`:

```tsx
          {insightsLoading ? (
            <CardSkeleton label={t("trendsTitle")} height={300} />
          ) : data.trend ? (
            <TrendsChart points={data.trend} />
          ) : (
            <CardError label={t("trendsTitle")} onRetry={insights.refetch} />
          )}
```

(`CardSkeleton` and `CardError` are already imported in this file; `t` and `insightsLoading` and `data` already exist in scope.)

- [ ] **Step 3: Verify typecheck, dead-code, and react compiler**

Run: `bun run typecheck`
Expected: PASS.

Run: `bun run knip`
Expected: PASS — `trends-chart.tsx` is now imported, `summarizeCashflow` is used, no unused exports.

Run: `bun run react:doctor`
Expected: PASS — no react-compiler violations.

- [ ] **Step 4: Visually verify in the running app**

Run the app (foreground in a separate shell, or background): `bun dev`
Open `http://127.0.0.1:3000/`. Confirm:
- A full-width "Trends" card appears directly under the forecast hero.
- Bars for income (emerald) and expense (rose) per month, net line (indigo) on top.
- KPI trio (avg income/expense/net) in the card header, right-aligned.
- Hovering a month shows a tooltip with exact income, expense, and net.
- Only synced months are shown (no leading empty months).

- [ ] **Step 5: Commit**

```bash
git add src/components/home/trends-chart.tsx src/components/home/home-page.tsx
git commit -m "feat: render monthly trends chart on the home page"
```

---

## Task 5: Full CI gate, screenshot, and README

**Files:**
- Modify: `public/screenshots/*.png` (regenerate the home screenshot)
- Modify: `README.md` (if any home-page copy references the screenshot or feature list)

- [ ] **Step 1: Run the full CI gate**

Run: `bun run ci`
Expected: PASS — format, lint:changed, typecheck, i18n:check, knip, react:doctor, security, test all green. Fix any failures before continuing.

- [ ] **Step 2: Regenerate the home screenshot from synthetic data**

Per `CLAUDE.md`, screenshots must come from synthetic/mock data, never the real `data/budgeteer.db`. Seed a throwaway database and point the app at it:

```bash
mkdir -p .tmp-mockdb
BUDGETEER_DATA_DIR="$(pwd)/.tmp-mockdb" bun dev
```

With the app running on the mock dir, populate a few months of synthetic transactions (use the setup API documented in `CLAUDE.md` plus any local mock-import path the project provides), so the Trends card has multiple months of income and expense. Then, in another shell, capture screenshots:

```bash
bun scripts/capture-screenshots.mjs
```

Note: `scripts/capture-screenshots.mjs` writes to `website/src/assets/screenshots` and captures `home-light.png` / `dashboard-dark.png` (home path `/`). Copy or regenerate the home image into `public/screenshots/` if that is where the README references it. Confirm the new image shows the Trends card and contains only synthetic data.

```bash
rm -rf .tmp-mockdb
```

- [ ] **Step 3: Update the README**

If `README.md` lists home-page features or embeds the home screenshot, add the Trends chart to the feature description and ensure the embedded image points at the regenerated screenshot. Keep wording free of em dashes (project convention).

- [ ] **Step 4: Commit**

```bash
git add public/screenshots README.md website/src/assets/screenshots 2>/dev/null
git commit -m "docs: regenerate home screenshot and README for trends chart"
```

---

## Self-Review Notes

- **Spec coverage:** chart style (Task 4 bars+line), placement under hero (Task 4 Step 2), synced-months range + 12 cap (Task 2 trim + window), averages KPI + hover-only numbers (Task 4), extend dormant pipeline (Task 2), pure testable helpers (Task 1), i18n en+he (Task 3), RTL axis (Task 4 `reversed`), edge cases empty/negative (Task 1 tests + component empty state + sign coloring), README/screenshot (Task 5). All covered.
- **Type consistency:** `HomeHistoricalTrendPoint` fields (`month`, `label`, `total`, `income`, `net`, `isCurrent`) are identical across the type definition (Task 2), the query (Task 2), the helpers and tests (Task 1), and the component (Task 4). The component maps `total` to the `expense` data key for the chart only; the payload field stays `total`.
- **i18n keys:** every `t("...")` call in Task 4 (`trendsTitle`, `trendsSubtitle`, `trendsEmpty`, `trendsAvgIncome`, `trendsAvgExpense`, `trendsAvgNet`, `trendsIncome`, `trendsExpense`, `trendsNet`) is defined in both locale files in Task 3.
