# Per-Page Help Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a help button to the five data pages (Home, Transactions, Review, Budget, Insights) that opens a bilingual side panel documenting the logic of every pane on that page.

**Architecture:** A typed registry (`help-content.ts`) defines, per page, an ordered list of `{ id, icon }` sections. All text lives in the i18n `help` namespace (English + Hebrew). A single reusable client component `<HelpButton page="...">` reads the registry and renders a right-side `Sheet`, pulling translated title/intro/section text via dynamic i18n keys. The button is dropped into each page's existing `PageHeader` `actions` slot.

**Tech Stack:** Next.js 16 (App Router, client components), TypeScript strict, shadcn/ui v4 on base-ui (`Sheet` = base-ui Dialog; no `asChild`, use props), next-intl, lucide-react, Bun test runner.

**Conventions (from CLAUDE.md / AGENTS.md):** No comments anywhere. No em dashes. No `eslint-disable`/`@ts-expect-error`. Self-documenting code. Conventional commits. The i18n `check-i18n.mjs` script needs dynamic namespaces allow-listed.

**Reference spec:** `docs/superpowers/specs/2026-06-16-help-panels-design.md`

---

## File Structure

- **Create** `src/components/help/help-content.ts` — typed registry: `HelpPageKey`, `HelpSection`, `HELP_SECTIONS`. Pure data + lucide icon references. No `"use client"`, no i18n.
- **Create** `src/components/help/help-content.test.ts` — pure-logic test asserting registry/i18n parity across `en` and `he`.
- **Create** `src/components/help/help-button.tsx` — client component rendering the trigger + `Sheet`.
- **Modify** `src/i18n/messages/en.json` — add `help` namespace.
- **Modify** `src/i18n/messages/he.json` — add `help` namespace (Hebrew).
- **Modify** `scripts/check-i18n.mjs` — add `"help.*"` to `dynamicNamespaces`.
- **Modify** `src/components/home/home-page.tsx` — add `<HelpButton page="home" />` to header actions.
- **Modify** `src/components/transactions/transactions-page.tsx` — `page="transactions"`.
- **Modify** `src/components/review/review-page.tsx` — `page="review"`.
- **Modify** `src/components/dashboard/dashboard.tsx` — `page="budget"`.
- **Modify** `src/components/insights/insights-page.tsx` — `page="insights"`.
- **Modify** `README.md` + regenerate affected `public/screenshots/*.png`.

---

## Task 1: Help registry + bilingual i18n content + parity test

**Files:**
- Create: `src/components/help/help-content.ts`
- Create: `src/components/help/help-content.test.ts`
- Modify: `src/i18n/messages/en.json`
- Modify: `src/i18n/messages/he.json`
- Modify: `scripts/check-i18n.mjs`

- [ ] **Step 1: Write the failing test**

Create `src/components/help/help-content.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import en from "@/i18n/messages/en.json";
import he from "@/i18n/messages/he.json";
import { HELP_SECTIONS, type HelpPageKey } from "@/components/help/help-content";

type HelpMessages = {
  help: {
    triggerLabel: string;
  } & Record<
    string,
    | string
    | {
        title: string;
        intro: string;
        sections: Record<string, { title: string; body: string }>;
      }
  >;
};

const locales: Record<string, HelpMessages> = {
  en: en as unknown as HelpMessages,
  he: he as unknown as HelpMessages,
};

const pages = Object.keys(HELP_SECTIONS) as HelpPageKey[];

describe("help content parity", () => {
  test("every page has at least one section", () => {
    for (const page of pages) {
      expect(HELP_SECTIONS[page].length).toBeGreaterThan(0);
    }
  });

  for (const [locale, messages] of Object.entries(locales)) {
    test(`${locale} has triggerLabel`, () => {
      expect(typeof messages.help.triggerLabel).toBe("string");
      expect(messages.help.triggerLabel.length).toBeGreaterThan(0);
    });

    for (const page of pages) {
      test(`${locale} has title and intro for ${page}`, () => {
        const entry = messages.help[page];
        expect(typeof entry).toBe("object");
        if (typeof entry === "object") {
          expect(entry.title.length).toBeGreaterThan(0);
          expect(entry.intro.length).toBeGreaterThan(0);
        }
      });

      for (const { id } of HELP_SECTIONS[page]) {
        test(`${locale} has copy for ${page}.${id}`, () => {
          const entry = messages.help[page];
          expect(typeof entry).toBe("object");
          if (typeof entry === "object") {
            const section = entry.sections[id];
            expect(section).toBeDefined();
            expect(section.title.length).toBeGreaterThan(0);
            expect(section.body.length).toBeGreaterThan(0);
          }
        });
      }
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --conditions react-server src/components/help/help-content.test.ts`
Expected: FAIL — `Cannot find module "@/components/help/help-content"` (registry not created yet).

- [ ] **Step 3: Create the registry**

Create `src/components/help/help-content.ts`:

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

- [ ] **Step 4: Add the English `help` namespace**

In `src/i18n/messages/en.json`, add a top-level `"help"` key (alongside existing namespaces such as `"anomalies"`). Mind JSON comma placement — if `help` is not the last key, end its block with a comma; if it is last, no trailing comma.

```json
"help": {
  "triggerLabel": "Help",
  "home": {
    "title": "Home",
    "intro": "What each card on your home page shows.",
    "sections": {
      "cashFlow": {
        "title": "Cash flow",
        "body": "Your income minus expenses for the selected period and accounts. Transfers and matched credit-card bills are left out so money is never counted twice."
      },
      "trend": {
        "title": "Trend",
        "body": "Income versus expenses month by month. Each transaction is counted in its Israel (Asia/Jerusalem) calendar month, so an end-of-month purchase lands in the right month."
      },
      "typicalMonth": {
        "title": "Typical month",
        "body": "A baseline built from your recent months, to compare the current month against."
      },
      "recentActivity": {
        "title": "Recent activity",
        "body": "The latest transactions across the accounts you have selected."
      },
      "flagged": {
        "title": "Needs review",
        "body": "Transactions Budgeteer could not categorize with confidence and is asking you to check."
      }
    }
  },
  "transactions": {
    "title": "Transactions",
    "intro": "How to read and filter your transactions list.",
    "sections": {
      "kindFilter": {
        "title": "Income / expense filter",
        "body": "Switch between all transactions, income only, or expenses only."
      },
      "accountFilter": {
        "title": "Account filter",
        "body": "The account selector at the top of the app. Totals and rows reflect only the accounts you pick."
      },
      "period": {
        "title": "Month navigation",
        "body": "Move between months. Rows are grouped by their Israel calendar date."
      },
      "cardMatch": {
        "title": "Card-bill match",
        "body": "When a bank charge is a credit-card bill, a badge links it to the individual card purchases that make it up, so the bill is not counted as extra spending."
      },
      "rowStates": {
        "title": "Row states",
        "body": "'Needs review' marks an uncertain category; 'excluded' rows are kept out of totals."
      }
    }
  },
  "review": {
    "title": "Review",
    "intro": "Clear the queue of transactions that need your attention.",
    "sections": {
      "whyFlagged": {
        "title": "Why it's flagged",
        "body": "Either the AI was not confident about the category, or it is an expense with no category yet."
      },
      "queue": {
        "title": "The queue",
        "body": "Items are ordered by what needs review first and leave the list once you categorize them."
      },
      "actions": {
        "title": "Actions",
        "body": "Assign a category to clear an item, or mark it reviewed as-is."
      },
      "cardMatch": {
        "title": "Card-bill match",
        "body": "A badge links a credit-card bill to the card purchases behind it, so it is not counted as extra spending."
      }
    }
  },
  "budget": {
    "title": "Budget",
    "intro": "How budgets are set and tracked.",
    "sections": {
      "autoVsManual": {
        "title": "Auto vs manual",
        "body": "Auto budgets follow a rolling average of your spending; manual budgets are a fixed monthly amount you set yourself."
      },
      "average": {
        "title": "How the average works",
        "body": "An auto budget is the average expense for that category over the last three completed months."
      },
      "spendBars": {
        "title": "Spend vs budget",
        "body": "Each bar shows how much you have spent this month against the budgeted amount."
      },
      "detail": {
        "title": "Category detail",
        "body": "Open a category to see the individual transactions behind its total."
      }
    }
  },
  "insights": {
    "title": "Insights",
    "intro": "Patterns and projections from your spending.",
    "sections": {
      "anomalies": {
        "title": "Anomalies",
        "body": "Charges that stand out from your normal pattern for that merchant or category."
      },
      "recommendations": {
        "title": "Recommendations",
        "body": "Suggested actions based on how you spend."
      },
      "forecast": {
        "title": "Forecast",
        "body": "A projection of your total spending by the end of the month."
      },
      "ranges": {
        "title": "Time ranges",
        "body": "Monthly and month-to-date windows, anchored to the Israel (Asia/Jerusalem) calendar."
      }
    }
  }
}
```

- [ ] **Step 5: Add the Hebrew `help` namespace**

In `src/i18n/messages/he.json`, add the matching `"help"` key with the same structure:

```json
"help": {
  "triggerLabel": "עזרה",
  "home": {
    "title": "בית",
    "intro": "מה מציג כל כרטיס בעמוד הבית.",
    "sections": {
      "cashFlow": {
        "title": "תזרים מזומנים",
        "body": "ההכנסות פחות ההוצאות לתקופה ולחשבונות שנבחרו. העברות וחיובי אשראי שותפו אינם נכללים כדי שלא לספור כסף פעמיים."
      },
      "trend": {
        "title": "מגמה",
        "body": "הכנסות מול הוצאות לפי חודשים. כל תנועה נספרת לפי החודש הקלנדרי בישראל (Asia/Jerusalem), כך שרכישה בסוף החודש משויכת לחודש הנכון."
      },
      "typicalMonth": {
        "title": "חודש טיפוסי",
        "body": "בסיס שמחושב מהחודשים האחרונים, להשוואה מול החודש הנוכחי."
      },
      "recentActivity": {
        "title": "פעילות אחרונה",
        "body": "התנועות האחרונות בכל החשבונות שנבחרו."
      },
      "flagged": {
        "title": "דורש בדיקה",
        "body": "תנועות ש-Budgeteer לא הצליח לסווג בביטחון ומבקש שתבדוק."
      }
    }
  },
  "transactions": {
    "title": "תנועות",
    "intro": "כיצד לקרוא ולסנן את רשימת התנועות.",
    "sections": {
      "kindFilter": {
        "title": "סינון הכנסה/הוצאה",
        "body": "מעבר בין כל התנועות, הכנסות בלבד או הוצאות בלבד."
      },
      "accountFilter": {
        "title": "סינון חשבונות",
        "body": "בורר החשבונות בראש האפליקציה. הסכומים והשורות משקפים רק את החשבונות שנבחרו."
      },
      "period": {
        "title": "ניווט חודשים",
        "body": "מעבר בין חודשים. השורות מקובצות לפי התאריך הקלנדרי בישראל."
      },
      "cardMatch": {
        "title": "התאמת חיוב אשראי",
        "body": "כאשר חיוב בבנק הוא חשבון כרטיס אשראי, תג מקשר אותו לרכישות הבודדות שמרכיבות אותו, כך שהחיוב אינו נספר כהוצאה נוספת."
      },
      "rowStates": {
        "title": "מצבי שורה",
        "body": "'דורש בדיקה' מסמן סיווג לא ודאי; שורות 'מוחרגות' אינן נכללות בסכומים."
      }
    }
  },
  "review": {
    "title": "בדיקה",
    "intro": "טיפול בתור התנועות שדורשות את תשומת לבך.",
    "sections": {
      "whyFlagged": {
        "title": "מדוע סומן",
        "body": "או שה-AI לא היה בטוח בסיווג, או שזו הוצאה ללא סיווג עדיין."
      },
      "queue": {
        "title": "התור",
        "body": "הפריטים מסודרים לפי מה שדורש בדיקה קודם ויוצאים מהרשימה לאחר שתסווג אותם."
      },
      "actions": {
        "title": "פעולות",
        "body": "שייך סיווג כדי לטפל בפריט, או סמן אותו כנבדק כפי שהוא."
      },
      "cardMatch": {
        "title": "התאמת חיוב אשראי",
        "body": "תג מקשר חשבון כרטיס אשראי לרכישות שמאחוריו, כך שאינו נספר כהוצאה נוספת."
      }
    }
  },
  "budget": {
    "title": "תקציב",
    "intro": "כיצד נקבעים ונמדדים התקציבים.",
    "sections": {
      "autoVsManual": {
        "title": "אוטומטי מול ידני",
        "body": "תקציבים אוטומטיים עוקבים אחר ממוצע מתגלגל של ההוצאות; תקציבים ידניים הם סכום חודשי קבוע שאתה קובע."
      },
      "average": {
        "title": "כיצד מחושב הממוצע",
        "body": "תקציב אוטומטי הוא ממוצע ההוצאה בקטגוריה זו בשלושת החודשים המלאים האחרונים."
      },
      "spendBars": {
        "title": "הוצאה מול תקציב",
        "body": "כל פס מציג כמה הוצאת החודש מול הסכום שתוקצב."
      },
      "detail": {
        "title": "פירוט קטגוריה",
        "body": "פתח קטגוריה כדי לראות את התנועות הבודדות שמרכיבות את הסכום."
      }
    }
  },
  "insights": {
    "title": "תובנות",
    "intro": "דפוסים ותחזיות מתוך ההוצאות שלך.",
    "sections": {
      "anomalies": {
        "title": "חריגות",
        "body": "חיובים שחורגים מהדפוס הרגיל שלך עבור אותו בית עסק או קטגוריה."
      },
      "recommendations": {
        "title": "המלצות",
        "body": "פעולות מוצעות בהתאם לאופן ההוצאה שלך."
      },
      "forecast": {
        "title": "תחזית",
        "body": "תחזית לסך ההוצאות עד סוף החודש."
      },
      "ranges": {
        "title": "טווחי זמן",
        "body": "חלונות חודשיים ומתחילת החודש, מעוגנים ללוח השנה בישראל (Asia/Jerusalem)."
      }
    }
  }
}
```

- [ ] **Step 6: Allow-list the dynamic namespace**

In `scripts/check-i18n.mjs`, add `"help.*"` to the `dynamicNamespaces` array:

```js
const dynamicNamespaces = [
  "banks.*",
  "categoriesSeeded.*",
  "settings.sidebar.*",
  "nav.*",
  "recommendations.*",
  "anomalies.*",
  "help.*",
];
```

- [ ] **Step 7: Run test to verify it passes**

Run: `bun test --conditions react-server src/components/help/help-content.test.ts`
Expected: PASS — all parity tests green (1 + 2 trigger + 5 pages × 2 locales title/intro + every section × 2 locales).

- [ ] **Step 8: Verify JSON validity and i18n gate**

Run: `bun run i18n:check`
Expected: PASS — no missing or orphan keys reported for `help.*`.

- [ ] **Step 9: Commit**

```bash
git add src/components/help/help-content.ts src/components/help/help-content.test.ts src/i18n/messages/en.json src/i18n/messages/he.json scripts/check-i18n.mjs
git commit -m "feat: add help content registry and bilingual help copy"
```

---

## Task 2: HelpButton component

**Files:**
- Create: `src/components/help/help-button.tsx`

This is a client React component. The project unit-tests pure logic only (better-sqlite3 cannot load under `bun test`, and there is no React Testing Library setup), so verification is by typecheck + the dev server, not a unit test.

- [ ] **Step 1: Create the component**

Create `src/components/help/help-button.tsx`:

```tsx
"use client";

import { HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { HELP_SECTIONS, type HelpPageKey } from "@/components/help/help-content";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function HelpButton({ page }: { page: HelpPageKey }) {
  const t = useTranslations("help");
  const [open, setOpen] = useState(false);
  const sections = HELP_SECTIONS[page];

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("triggerLabel")}
        onClick={() => setOpen(true)}
      >
        <HelpCircle className="size-4" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="font-serif text-2xl font-normal">{t(`${page}.title`)}</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 px-4 pb-8">
            <p className="text-sm text-muted-foreground">{t(`${page}.intro`)}</p>
            <ul className="space-y-5">
              {sections.map(({ id, icon: Icon }) => (
                <li key={id} className="flex gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="size-4" />
                  </span>
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium">{t(`${page}.sections.${id}.title`)}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {t(`${page}.sections.${id}.body`)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
```

Note: `SheetTitle` here uses `font-serif text-2xl font-normal` to match the heading style already used in `budget-detail-sheet.tsx`. If that file's `SheetHeader` adds its own padding, no extra padding is needed on `SheetHeader`; the body `div` supplies horizontal padding (`px-4`).

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: PASS — no errors. (Confirms `size="icon-sm"`, `side="right"`, and `Sheet` `open`/`onOpenChange` props are valid.)

- [ ] **Step 3: Lint/format**

Run: `bunx @biomejs/biome check --write src/components/help/help-button.tsx`
Expected: No remaining errors; import order normalized.

- [ ] **Step 4: Commit**

```bash
git add src/components/help/help-button.tsx
git commit -m "feat: add reusable HelpButton side-panel component"
```

---

## Task 3: Wire HelpButton into the five page headers

**Files:**
- Modify: `src/components/home/home-page.tsx`
- Modify: `src/components/transactions/transactions-page.tsx`
- Modify: `src/components/review/review-page.tsx`
- Modify: `src/components/dashboard/dashboard.tsx`
- Modify: `src/components/insights/insights-page.tsx`

The help button goes last in each `actions` fragment (rightmost in LTR, inline-end in RTL).

- [ ] **Step 1: Home page**

In `src/components/home/home-page.tsx`, add the import near the other component imports:

```tsx
import { HelpButton } from "@/components/help/help-button";
```

The header `actions` is already a fragment. Add the button as the last child:

```tsx
        actions={
          <>
            <SyncStatusPill
              items={data?.bankHealth ?? null}
              nextScheduledSync={data?.nextScheduledSync ?? null}
              activity={activity ?? null}
              onOpenChange={handleActivityOpenChange}
            />
            <CategorizeButton onApplied={handleComplete} />
            <SyncButton onComplete={handleComplete} autoStart={autoStartSync} />
            <HelpButton page="home" />
          </>
        }
```

- [ ] **Step 2: Transactions page**

In `src/components/transactions/transactions-page.tsx`, add the import:

```tsx
import { HelpButton } from "@/components/help/help-button";
```

The current `actions` is a single `<PeriodSelector .../>`. Wrap it in a fragment and append the button:

```tsx
        actions={
          <>
            <PeriodSelector
              label={monthLabel}
              onPrev={() => setSelectedDate((d) => addMonths(d, -1))}
              onNext={() => setSelectedDate((d) => addMonths(d, 1))}
              prevLabel={tc("previousMonth")}
              nextLabel={tc("nextMonth")}
              nextDisabled={isCurrentMonth(selectedDate)}
            />
            <HelpButton page="transactions" />
          </>
        }
```

- [ ] **Step 3: Review page**

In `src/components/review/review-page.tsx`, add the import:

```tsx
import { HelpButton } from "@/components/help/help-button";
```

The current `actions` is conditional (focus button or `undefined`). Replace it so the help button always shows and the focus button remains conditional:

```tsx
        actions={
          <>
            {!loading && txns.length > 0 ? (
              <Button variant="outline" size="sm" onClick={() => setFocus(true)}>
                <ScanEye className="size-3.5" />
                {t("focusMode")}
              </Button>
            ) : null}
            <HelpButton page="review" />
          </>
        }
```

- [ ] **Step 4: Budget page (dashboard component)**

In `src/components/dashboard/dashboard.tsx`, add the import:

```tsx
import { HelpButton } from "@/components/help/help-button";
```

The header `actions` is already a fragment. Add the button last:

```tsx
        actions={
          <>
            <PeriodSelector
              label={monthLabel}
              onPrev={() => setSelectedDate((d) => addMonths(d, -1))}
              onNext={() => setSelectedDate((d) => addMonths(d, 1))}
              prevLabel={tc("previousMonth")}
              nextLabel={tc("nextMonth")}
              nextDisabled={isCurrentMonth(selectedDate)}
            />
            <CategorizeButton onApplied={handleSyncComplete} />
            <SyncButton onComplete={handleSyncComplete} />
            <HelpButton page="budget" />
          </>
        }
```

- [ ] **Step 5: Insights page**

In `src/components/insights/insights-page.tsx`, add the import:

```tsx
import { HelpButton } from "@/components/help/help-button";
```

The header has no actions yet. Add the `actions` prop:

```tsx
      <PageHeader title={t("pageTitle")} actions={<HelpButton page="insights" />} />
```

- [ ] **Step 6: Typecheck and lint**

Run: `bunx tsc --noEmit`
Expected: PASS.

Run: `bunx @biomejs/biome check --write src/components/home/home-page.tsx src/components/transactions/transactions-page.tsx src/components/review/review-page.tsx src/components/dashboard/dashboard.tsx src/components/insights/insights-page.tsx`
Expected: No remaining errors.

- [ ] **Step 7: Manual dev-server verification**

Run: `bun dev` (stop any existing instance first; the script hard-codes port 3000).
Verify on `http://127.0.0.1:3000`:
- Each of `/`, `/transactions`, `/review`, `/budget`, `/insights` shows a `?` icon button in the header.
- Clicking it opens a right-side panel titled with the page name, an intro line, and one section per pane.
- Switch the locale to Hebrew and confirm the copy is Hebrew and the panel opens from the inline-end (left) edge.

- [ ] **Step 8: Commit**

```bash
git add src/components/home/home-page.tsx src/components/transactions/transactions-page.tsx src/components/review/review-page.tsx src/components/dashboard/dashboard.tsx src/components/insights/insights-page.tsx
git commit -m "feat: add help button to home, transactions, review, budget, insights"
```

---

## Task 4: README and screenshots

**Files:**
- Modify: `README.md`
- Regenerate: affected `public/screenshots/*.png` (home/`/`, budget/`/budget`, transactions/`/transactions`)

Per CLAUDE.md PR rules, UI changes require README updates and regenerated screenshots from synthetic/mock data only. Never use the real `data/budgeteer.db`. The screenshot pipeline already exists: `seed:demo` builds a throwaway DB under `./demo-data`, and `scripts/capture-screenshots.mjs` captures the screens.

- [ ] **Step 1: Add a help mention to the README**

In `README.md`, in the features or UI section, add one bullet describing the per-page help panels, for example:

```markdown
- **In-app help** - every data page has a help button that opens a side panel explaining each pane (cash flow, trends, card-bill matching, budgets, anomalies) in English and Hebrew.
```

- [ ] **Step 2: Seed a throwaway demo database**

Run: `bun run seed:demo`
Expected: a populated SQLite DB created under `./demo-data` (gitignored path; never the real `data/` dir).

- [ ] **Step 3: Start the dev server against the demo data**

Run (in a separate shell, foreground): `BUDGETEER_DATA_DIR=./demo-data bun dev`
Wait until it serves on `http://127.0.0.1:3000`.

- [ ] **Step 4: Capture screenshots**

Run: `node scripts/capture-screenshots.mjs`
Expected: regenerates the configured PNGs (including `home-light.png`, `dashboard-light.png` from `/budget`, `transactions-light.png`) now showing the help button in the header. Stop the dev server afterward.

- [ ] **Step 5: Confirm no real data leaked**

Run: `git status --porcelain public/screenshots`
Visually inspect the changed PNGs to confirm they show demo data only, not real account data.

- [ ] **Step 6: Commit**

```bash
git add README.md public/screenshots
git commit -m "docs: document help panels and refresh screenshots"
```

---

## Final verification

- [ ] **Run the full CI gate**

Run: `bun run ci`
Expected: format, typecheck, `i18n:check`, knip, react-doctor, and `bun test` all pass. The only acceptable red is the pre-existing transitive `js-yaml` security advisory (unrelated to this change). If `knip` flags `help-button.tsx` or `help-content.ts` as unused, confirm the Task 3 wiring landed (every page imports `HelpButton`, which imports the registry).

---

## Self-Review notes

- **Spec coverage:** registry (Task 1), bilingual i18n + allow-list (Task 1), component + RTL `side="right"` + a11y `aria-label`/`SheetTitle` (Task 2), 5-page integration (Task 3), parity test (Task 1 Step 1), README/screenshots (Task 4). All spec sections mapped.
- **Type consistency:** `HelpPageKey` and `HELP_SECTIONS` defined in Task 1 are imported unchanged in Task 1's test and Task 2's component. Page keys `"home" | "transactions" | "review" | "budget" | "insights"` used identically in Task 3 props.
- **No placeholders:** every i18n string, every component line, and every command is concrete.
