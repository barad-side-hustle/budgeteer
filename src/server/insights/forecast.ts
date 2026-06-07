import type { Forecast, ForecastVerdict, OverdraftRisk } from "@/lib/types";

export interface ForecastInput {
  monthLabel: string;
  elapsedDays: number;
  totalDays: number;
  daysUntilPayday: number;
  incomeMtd: number;
  expensesMtd: number;
  fixedMtd: number;
  fixedMonthly: number;
  typicalMonthlyIncome: number | null;
  typicalMonthlyExpenses: number | null;
  monthlyTarget: number | null;
  balanceToday: number | null;
}

const CONFIDENCE_DAYS = 10;

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

  const expectedIncome = Math.max(incomeMtd, typicalMonthlyIncome ?? incomeMtd);

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
