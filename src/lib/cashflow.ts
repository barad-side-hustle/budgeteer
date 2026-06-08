import type { HomeHistoricalTrendPoint } from "@/lib/types";

export function trimToSyncedMonths(points: HomeHistoricalTrendPoint[]): HomeHistoricalTrendPoint[] {
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
