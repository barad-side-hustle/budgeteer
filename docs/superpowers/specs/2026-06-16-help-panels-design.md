# Per-Page Help Panels Design

**Date:** 2026-06-16
**Status:** Approved (design)

## Goal

Give each data-heavy page a help button that opens a side panel documenting the
logic of every pane on that page. The panel explains what each card or column
means and the non-obvious computations behind them (Asia/Jerusalem date
bucketing, credit-card bill matching, needs-review flagging, auto-budget
averaging). Help is available in both English and Hebrew.

## Scope

Five pages get a help panel: **Home**, **Transactions**, **Review**, **Budget**,
**Insights**. Settings and Chat are excluded as self-explanatory. One panel per
page (not per-pane contextual triggers).

## Approach

Section *structure* (which panes, their order, and an icon) lives in a typed
TypeScript registry. Section *text* (title and body) lives in the i18n `help`
namespace so every string is bilingual and passes the `i18n:check` gate. A single
reusable `<HelpButton page="...">` component reads the registry and renders a
right-side `Sheet`.

Rejected alternatives:

- **Pure i18n (no registry):** next-intl has no clean way to iterate an ordered
  list of sections with per-section icons, and loses type safety on the page key.
- **MDX per page:** two files per page for bilingual content, plus build tooling.
  Overkill and fights the existing i18n message system.

## Architecture

Each page already renders a shared `PageHeader` (`src/components/layout/app-shell.tsx`)
with an `actions` slot. `<HelpButton page="..." />` is added to that slot. It is a
ghost icon button (`HelpCircle` from lucide-react) that opens a right-side `Sheet`
(the same primitive `budget-detail-sheet.tsx` uses). The sheet body shows a short
page intro followed by one section per pane: icon, title, explanatory body.

## Files

### Create: `src/components/help/help-content.ts`

Pure data, no i18n, no `"use client"`.

```ts
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarRange,
  CreditCard,
  Filter,
  Gauge,
  LineChart,
  ListChecks,
  PiggyBank,
  Sparkles,
  Tags,
  Wallet,
} from "lucide-react";

export type HelpPageKey = "home" | "transactions" | "review" | "budget" | "insights";

export interface HelpSection {
  id: string;
  icon: LucideIcon;
}

export const HELP_SECTIONS: Record<HelpPageKey, HelpSection[]> = {
  home: [
    { id: "cashFlow", icon: Wallet },
    { id: "trend", icon: LineChart },
    { id: "typicalMonth", icon: Gauge },
    { id: "recentActivity", icon: ArrowLeftRight },
    { id: "flagged", icon: ListChecks },
  ],
  transactions: [
    { id: "kindFilter", icon: Filter },
    { id: "accountFilter", icon: Filter },
    { id: "period", icon: CalendarRange },
    { id: "cardMatch", icon: CreditCard },
    { id: "rowStates", icon: Tags },
  ],
  review: [
    { id: "whyFlagged", icon: AlertTriangle },
    { id: "queue", icon: ListChecks },
    { id: "actions", icon: Tags },
    { id: "cardMatch", icon: CreditCard },
  ],
  budget: [
    { id: "autoVsManual", icon: PiggyBank },
    { id: "average", icon: CalendarRange },
    { id: "spendBars", icon: Gauge },
    { id: "detail", icon: ArrowLeftRight },
  ],
  insights: [
    { id: "anomalies", icon: AlertTriangle },
    { id: "recommendations", icon: Sparkles },
    { id: "forecast", icon: LineChart },
    { id: "ranges", icon: CalendarRange },
  ],
};
```

### Create: `src/components/help/help-button.tsx`

Client component. Props `{ page: HelpPageKey }`. Reads `HELP_SECTIONS[page]`,
uses `useTranslations("help")`, and renders a `Sheet` opened from a ghost
`HelpCircle` icon button. The trigger has `aria-label={t("triggerLabel")}`. The
`SheetTitle` is `t(\`${page}.title\`)`; an intro paragraph is `t(\`${page}.intro\`)`;
each section renders its icon, `t(\`${page}.sections.${id}.title\`)`, and
`t(\`${page}.sections.${id}.body\`)`.

Dynamic key access (`${page}.sections.${id}...`) follows the existing pattern used
for `categoriesSeeded.*` and `banks.*`.

### Modify: i18n message files

Add a `help` namespace to both `src/i18n/messages/en.json` and
`src/i18n/messages/he.json`. Shape:

```json
"help": {
  "triggerLabel": "Help",
  "home": {
    "title": "Home",
    "intro": "What each card on your home page shows.",
    "sections": {
      "cashFlow": { "title": "Cash flow", "body": "..." },
      "trend": { "title": "Trend", "body": "..." },
      "typicalMonth": { "title": "Typical month", "body": "..." },
      "recentActivity": { "title": "Recent activity", "body": "..." },
      "flagged": { "title": "Needs review", "body": "..." }
    }
  },
  "transactions": { "title": "...", "intro": "...", "sections": { "kindFilter": {...}, "accountFilter": {...}, "period": {...}, "cardMatch": {...}, "rowStates": {...} } },
  "review": { "title": "...", "intro": "...", "sections": { "whyFlagged": {...}, "queue": {...}, "actions": {...}, "cardMatch": {...} } },
  "budget": { "title": "...", "intro": "...", "sections": { "autoVsManual": {...}, "average": {...}, "spendBars": {...}, "detail": {...} } },
  "insights": { "title": "...", "intro": "...", "sections": { "anomalies": {...}, "recommendations": {...}, "forecast": {...}, "ranges": {...} } }
}
```

Every `id` in `HELP_SECTIONS` must have a matching `title` and `body` in both
locales. Content guidance per section is in the Content section below.

### Modify: `scripts/check-i18n.mjs`

Add `"help.*"` to the `dynamicNamespaces` array so the dynamic key access does not
trip the unused/orphan check.

### Modify: page components (add `<HelpButton>` to `PageHeader` actions)

- `src/components/home/home-page.tsx` -> `<HelpButton page="home" />`
- `src/components/transactions/transactions-page.tsx` -> `page="transactions"`
- `src/components/review/review-page.tsx` -> `page="review"`
- `src/components/dashboard/dashboard.tsx` (Budget) -> `page="budget"`
- `src/components/insights/insights-page.tsx` -> `page="insights"`

Where a page header already has actions (e.g. transactions' `PeriodSelector`), the
help button sits alongside them inside the same `actions` fragment. The Budget
route (`src/app/[locale]/budget/page.tsx`) renders `Dashboard`
(`src/components/dashboard/dashboard.tsx`), whose `PageHeader` is the integration
point for `page="budget"`.

## Content

Bodies are 1-3 plain sentences each, written in the app's calm tone. Key points
the copy must convey:

- **Home / cashFlow:** income minus expense for the selected period and account
  set; transfers and matched card bills are excluded so money is not double
  counted.
- **Home / trend:** monthly income vs expense over recent months; each
  transaction is bucketed by its **Asia/Jerusalem calendar date**, so an
  end-of-month purchase lands in the correct month.
- **Home / typicalMonth:** a typical-month baseline derived from recent history.
- **Home / recentActivity:** the latest transactions across selected accounts.
- **Home / flagged:** transactions Budgeteer could not confidently categorize and
  wants you to review.
- **Transactions / kindFilter:** all vs income vs expense.
- **Transactions / accountFilter:** the global multi-account filter; totals and
  rows reflect the selected accounts.
- **Transactions / period:** month navigation; rows are grouped by Jerusalem
  calendar date.
- **Transactions / cardMatch:** the card-bill badge links a bank debit to the
  individual card purchases that make it up, so the bill is not counted as extra
  spend.
- **Transactions / rowStates:** what "needs review" and "excluded" rows mean.
- **Review / whyFlagged:** low AI confidence or an uncategorized expense.
- **Review / queue:** ordering and how items leave the queue once categorized.
- **Review / actions:** assign a category, mark reviewed.
- **Review / cardMatch:** same badge meaning as Transactions.
- **Budget / autoVsManual:** auto budgets track a rolling average; manual budgets
  are a fixed monthly amount you set.
- **Budget / average:** auto amount is the average expense over the last 3
  completed months for that category.
- **Budget / spendBars:** spend so far this month vs the budget amount.
- **Budget / detail:** the detail sheet lists the transactions behind a category.
- **Insights / anomalies:** charges that deviate from your normal pattern.
- **Insights / recommendations:** suggested actions based on spending.
- **Insights / forecast:** projected end-of-month spend.
- **Insights / ranges:** month and month-to-date windows, anchored to
  Asia/Jerusalem.

Final wording is authored during implementation; ids and structure are fixed
here.

## RTL and accessibility

- Use `<SheetContent side="right" />`. The `Sheet` primitive is built on logical
  properties (`side="right"` resolves to the inline-end edge via `end-0` /
  `border-s` and has explicit RTL translate variants), so it already slides from
  the correct edge in Hebrew. No custom direction logic is needed.
- Trigger button: `aria-label` from `help.triggerLabel`, icon-only, ghost
  variant, sized to match other header actions.
- The `Sheet` provides focus trap, Esc-to-close, and a labelled `SheetTitle`.

## Testing

Pure-logic unit test (`bun test --conditions react-server`), no DB or browser:

- `src/components/help/help-content.test.ts`: import `HELP_SECTIONS` and both
  message JSON files. For every `HelpPageKey`:
  - the page has at least one section;
  - `help.<page>.title` and `help.<page>.intro` exist in `en` and `he`;
  - every section `id` resolves to a non-empty `title` and `body` in `en` and
    `he`.

This guarantees no page renders a missing-key placeholder and that English and
Hebrew stay in lockstep.

Manual verification via `bun dev`: each of the five pages shows a help button in
its header; clicking opens the panel; sections match the page's panes; Hebrew
locale shows translated copy and the panel opens from the correct side.

## CI

Full `bun run ci` must stay green: format, lint, typecheck, `i18n:check` (with the
`help.*` allow-list entry), knip, react-doctor, `bun test`. Per project PR rules,
regenerate any affected `public/screenshots/*.png` from synthetic/mock data if the
help button changes a captured screen, and update the README to mention per-page
help.

## Out of scope

- Per-pane contextual help triggers (one panel per page only).
- Help for Settings, Setup, and Chat.
- Search within help, deep links to specific sections, or a standalone docs page.
