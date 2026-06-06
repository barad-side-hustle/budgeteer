import "server-only";

import type { ForecastPayload, InsightSection, InsightSectionError } from "@/lib/types";
import { getAutoBudgetAverage } from "@/server/db/queries/budgets";
import { getAllCategories } from "@/server/db/queries/categories";
import { getCashFlow, getTypicalMonthly } from "@/server/db/queries/home";
import { getBalanceAnchor, getWorkspaceSetting } from "@/server/db/queries/settings";
import { getCategorySpendInRange, getMerchantMonthlySpend } from "@/server/db/queries/transactions";
import { type CategoryMeta, computeMonthRanges, rollUpByParent } from "@/server/insights/compute";
import { computeForecast } from "@/server/insights/forecast";
import {
  buildRecommendations,
  buildSavings,
  type CategorySpendRow,
} from "@/server/insights/recommendations";
import {
  computeFixedVsVariable,
  detectRecurring,
  type MerchantSeries,
} from "@/server/insights/recurring";
import { daysUntil, nextPayday } from "@/server/lib/pace";

const RECURRING_MONTHS = 6;
const RECURRING_LIMIT = 8;
const FEES_CATEGORY_NAME = "Fees & Taxes";

function safe<T>(section: InsightSection, errors: InsightSectionError[], fn: () => T): T | null {
  try {
    return fn();
  } catch (err) {
    errors.push({ section, message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

function isoAddDay(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const next = new Date(y, (m ?? 1) - 1, (d ?? 1) + 1);
  const yy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** The trailing month keys (YYYY-MM), oldest first, ending with the current month. */
function trailingMonthKeys(now: Date, count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

/**
 * Assemble the full forecast payload: the cash-flow forecast, fixed-vs-variable
 * split, recurring charges, savings opportunities and recommendations. Every
 * section is wrapped so one failure never blanks the whole screen.
 */
export function buildForecastPayload(workspaceId: number, now: Date): ForecastPayload {
  const errors: InsightSectionError[] = [];
  const ranges = computeMonthRanges(now);
  const today = isoToday(now);

  const typicalExpenses = getTypicalMonthly(workspaceId, "expense", 3);
  const typicalIncome = getTypicalMonthly(workspaceId, "income", 3);
  const anchor = getBalanceAnchor(workspaceId);

  // Category metadata for rollups + fees lookup.
  const metaById = new Map<number, CategoryMeta>();
  let feesCategoryId: number | null = null;
  for (const c of getAllCategories(workspaceId, "expense")) {
    metaById.set(c.id, {
      id: c.id,
      parentId: c.parentId,
      name: c.name,
      color: c.color,
      icon: c.icon,
    });
    if (c.name === FEES_CATEGORY_NAME) feesCategoryId = c.id;
  }

  // Recurring charges first: the forecast needs the fixed split so it can count
  // committed spend (rent, bills) once instead of extrapolating it.
  let fixedMtd = 0;
  const recurring = safe("movers", errors, () => {
    const rows = getMerchantMonthlySpend(workspaceId, RECURRING_MONTHS);
    const keys = trailingMonthKeys(now, RECURRING_MONTHS);
    const lastIdx = keys.length - 1;
    const monthIndex = new Map(keys.map((k, i) => [k, i] as const));
    const byMerchant = new Map<string, MerchantSeries>();
    for (const r of rows) {
      const idx = monthIndex.get(r.month);
      if (idx == null) continue;
      let s = byMerchant.get(r.merchant);
      if (!s) {
        const cat = r.categoryId != null ? metaById.get(r.categoryId) : null;
        s = {
          merchant: r.merchant,
          categoryId: r.categoryId,
          categoryName: cat?.name ?? null,
          monthly: new Array(keys.length).fill(0),
        };
        byMerchant.set(r.merchant, s);
      }
      s.monthly[idx] += r.amount;
    }
    const detected = detectRecurring([...byMerchant.values()]);
    // Current-month spend already made on recurring merchants.
    fixedMtd = detected.reduce(
      (sum, r) => sum + (byMerchant.get(r.merchant)?.monthly[lastIdx] ?? 0),
      0,
    );
    return detected;
  });

  const fixedVsVariable = safe("breakdown", errors, () =>
    typicalExpenses != null ? computeFixedVsVariable(recurring ?? [], typicalExpenses) : null,
  );
  const fixedMonthly = fixedVsVariable?.fixedMonthly ?? 0;

  const forecast = safe("verdict", errors, () => {
    const cf = getCashFlow(workspaceId, ranges.current.from, ranges.current.to);
    const paydayDay = Number(getWorkspaceSetting(workspaceId, "payday_day") ?? "1");
    const daysUntilPayday = Math.max(0, daysUntil(nextPayday(now, paydayDay), now));
    const targetRaw = getWorkspaceSetting(workspaceId, "monthly_target");
    const parsedTarget = targetRaw != null ? Number(targetRaw) : Number.NaN;
    const monthlyTarget = Number.isFinite(parsedTarget) && parsedTarget > 0 ? parsedTarget : null;

    let balanceToday: number | null = null;
    if (anchor) {
      if (!anchor.date || anchor.date >= today) {
        balanceToday = anchor.amount;
      } else {
        const since = getCashFlow(workspaceId, isoAddDay(anchor.date), today);
        balanceToday = anchor.amount + since.net;
      }
    }

    return computeForecast({
      monthLabel: ranges.monthLabel,
      elapsedDays: ranges.elapsedDays,
      totalDays: ranges.totalDays,
      daysUntilPayday,
      incomeMtd: cf.income,
      expensesMtd: cf.expenses,
      fixedMtd,
      fixedMonthly,
      typicalMonthlyIncome: typicalIncome,
      typicalMonthlyExpenses: typicalExpenses,
      monthlyTarget,
      balanceToday,
    });
  });

  // Rolled-up current vs typical spend per top-level category, for spikes/trims.
  const leafCurrent = getCategorySpendInRange(workspaceId, ranges.current.from, ranges.current.to);
  const currentRolled = rollUpByParent(leafCurrent, metaById);
  const typicalRolled = rollUpByParent(getAutoBudgetAverage(workspaceId, 3), metaById);
  const categorySpend: CategorySpendRow[] = [];
  const keys = new Set<number>([...currentRolled.keys(), ...typicalRolled.keys()]);
  for (const key of keys) {
    const cat = metaById.get(key);
    if (!cat) continue;
    categorySpend.push({
      categoryId: key,
      name: cat.name,
      current: currentRolled.get(key) ?? 0,
      typical: typicalRolled.get(key) ?? 0,
    });
  }
  const feesThisMonth =
    feesCategoryId != null
      ? (leafCurrent.find((r) => r.categoryId === feesCategoryId)?.amount ?? 0)
      : 0;

  const savings = safe("insights", errors, () =>
    buildSavings({ recurring: recurring ?? [], categorySpend, feesThisMonth, feesCategoryId }),
  );

  const recommendations = safe("insights", errors, () =>
    forecast
      ? buildRecommendations({ forecast, savings: savings ?? [], hasBalance: anchor != null })
      : [],
  );

  const totalSavings = (savings ?? []).reduce((sum, s) => sum + s.estimatedMonthly, 0);

  return {
    forecast,
    fixedVsVariable,
    recurring: recurring ? recurring.slice(0, RECURRING_LIMIT) : null,
    savings,
    recommendations,
    totalSavings,
    errors,
  };
}

function isoToday(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}
