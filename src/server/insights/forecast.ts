// Pure, deterministic cash-flow forecast math. No DB access and no `server-only`
// import so it can be unit-tested directly. The engine (forecast-engine.ts)
// gathers data through the query layer and feeds it here. This is the heart of
// the RiseUp-style "bottom line": will the month finish in the plus or minus,
// how much is safe to spend, and where the balance is heading.

import type { Forecast, ForecastVerdict, OverdraftRisk } from "@/lib/types";

export interface ForecastInput {
  monthLabel: string;
  elapsedDays: number;
  totalDays: number;
  daysUntilPayday: number;
  incomeMtd: number;
  expensesMtd: number;
  /** Spend so far this month on recurring (fixed) merchants. */
  fixedMtd: number;
  /** Typical total monthly recurring commitment (rent, bills, subscriptions...). */
  fixedMonthly: number;
  typicalMonthlyIncome: number | null;
  typicalMonthlyExpenses: number | null;
  monthlyTarget: number | null;
  /** Known current balance (Tier 2). Null disables the month-end balance line. */
  balanceToday: number | null;
}

// Below this many elapsed days a straight-line projection is too noisy, so we
// blend it toward the user's own typical month until enough of the month is in.
const CONFIDENCE_DAYS = 10;

/**
 * Project the variable (discretionary) spend for the month. A straight-line from
 * a couple of days swings wildly, so blend it toward the typical variable month
 * until enough of the month is in. Never projects below what is already spent.
 */
function projectVariable(
  variableMtd: number,
  elapsedDays: number,
  totalDays: number,
  typicalVariable: number | null,
): number {
  if (elapsedDays <= 0) return typicalVariable ?? variableMtd;
  const straightLine = (variableMtd / elapsedDays) * totalDays;
  if (typicalVariable == null || typicalVariable <= 0) return Math.max(straightLine, variableMtd);
  const weight = Math.min(elapsedDays / CONFIDENCE_DAYS, 1);
  const blended = weight * straightLine + (1 - weight) * typicalVariable;
  return Math.max(blended, variableMtd);
}

function classifyVerdict(projectedNet: number, scale: number): ForecastVerdict {
  if (projectedNet >= 0) return "plus";
  const tightBand = Math.max(50, 0.05 * scale);
  if (projectedNet >= -tightBand) return "tight";
  return "minus";
}

function classifyOverdraft(expectedMonthEnd: number, projectedExpenses: number): OverdraftRisk {
  if (expectedMonthEnd < 0) return "high";
  const buffer = Math.max(500, 0.15 * projectedExpenses);
  if (expectedMonthEnd < buffer) return "watch";
  return "none";
}

export function computeForecast(input: ForecastInput): Forecast {
  const {
    monthLabel,
    elapsedDays,
    totalDays,
    daysUntilPayday,
    incomeMtd,
    expensesMtd,
    typicalMonthlyIncome,
    typicalMonthlyExpenses,
    monthlyTarget,
    balanceToday,
  } = input;

  const daysLeft = Math.max(0, totalDays - elapsedDays);
  const netMtd = incomeMtd - expensesMtd;

  // Salary is lumpy: if this month's income is still below a typical month, the
  // rest is treated as upcoming rather than assuming income simply stops.
  const expectedIncome = Math.max(incomeMtd, typicalMonthlyIncome ?? incomeMtd);

  // Fixed commitments (rent, bills, subscriptions) happen once a month, so they
  // must NOT be extrapolated. Only the variable part is paced by the day. This
  // is what stops a rent payment early in the month from inflating the forecast.
  const fixedMonthly = Math.max(0, input.fixedMonthly);
  const fixedMtd = Math.max(0, Math.min(input.fixedMtd, expensesMtd));
  const variableMtd = Math.max(0, expensesMtd - fixedMtd);
  const typicalVariable =
    typicalMonthlyExpenses != null ? Math.max(0, typicalMonthlyExpenses - fixedMonthly) : null;
  const projectedVariable = projectVariable(variableMtd, elapsedDays, totalDays, typicalVariable);
  const projectedExpenses = Math.max(
    expensesMtd,
    Math.max(fixedMtd, fixedMonthly) + projectedVariable,
  );
  const remainingIncome = Math.max(0, expectedIncome - incomeMtd);
  const remainingExpenses = Math.max(0, projectedExpenses - expensesMtd);
  const projectedNet = expectedIncome - projectedExpenses;

  const scale = Math.max(expectedIncome, projectedExpenses, 1);
  const verdict = classifyVerdict(projectedNet, scale);

  // Safe-to-spend: what is left of the month's spending headroom. The ceiling is
  // an explicit target if set, otherwise the month's expected income (so you
  // finish at or above zero). Spread the remainder over the days left.
  const ceiling = monthlyTarget != null && monthlyTarget > 0 ? monthlyTarget : expectedIncome;
  const safeToSpendRemaining = Math.max(0, ceiling - expensesMtd);
  const safeToSpendPerDay = daysLeft > 0 ? safeToSpendRemaining / daysLeft : safeToSpendRemaining;
  const safeToSpendThisWeek = safeToSpendPerDay * Math.min(7, Math.max(1, daysLeft));

  let expectedMonthEnd: number | null = null;
  let overdraftRisk: OverdraftRisk = "none";
  if (balanceToday != null) {
    expectedMonthEnd = balanceToday + remainingIncome - remainingExpenses;
    overdraftRisk = classifyOverdraft(expectedMonthEnd, projectedExpenses);
  }

  const hasData =
    incomeMtd > 0 ||
    expensesMtd > 0 ||
    (typicalMonthlyExpenses ?? 0) > 0 ||
    (typicalMonthlyIncome ?? 0) > 0;

  return {
    monthLabel,
    elapsedDays,
    totalDays,
    daysLeft,
    daysUntilPayday,
    incomeMtd,
    expensesMtd,
    netMtd,
    expectedIncome,
    projectedExpenses,
    projectedNet,
    remainingIncome,
    remainingExpenses,
    verdict,
    safeToSpendRemaining,
    safeToSpendPerDay,
    safeToSpendThisWeek,
    typicalMonthlyExpenses,
    typicalMonthlyIncome,
    monthlyTarget,
    balanceToday,
    expectedMonthEnd,
    overdraftRisk,
    hasData,
    hasBalance: balanceToday != null,
  };
}
