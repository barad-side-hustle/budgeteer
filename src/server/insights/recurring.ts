import type { FixedVsVariable, RecurringCharge } from "@/lib/types";

export interface MerchantSeries {
  merchant: string;
  categoryId: number | null;
  categoryName: string | null;
  monthly: number[];
}

export interface RecurringOptions {
  minMonths?: number;
  recentWindow?: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function detectRecurring(
  series: MerchantSeries[],
  options: RecurringOptions = {},
): RecurringCharge[] {
  const out: RecurringCharge[] = [];
  for (const s of series) {
    const monthsConsidered = s.monthly.length;
    if (monthsConsidered === 0) continue;
    const minMonths = options.minMonths ?? Math.min(3, monthsConsidered);
    const recentWindow = options.recentWindow ?? 2;

    const present = s.monthly.filter((v) => v > 0);
    const monthsPresent = present.length;
    if (monthsPresent < minMonths) continue;

    const recent = s.monthly.slice(-recentWindow);
    const appearedRecently = recent.some((v) => v > 0);
    if (!appearedRecently) continue;

    out.push({
      merchant: s.merchant,
      categoryId: s.categoryId,
      categoryName: s.categoryName,
      amount: median(present),
      monthsPresent,
      monthsConsidered,
      lapsed: s.monthly[s.monthly.length - 1] === 0,
      monthly: s.monthly,
    });
  }
  out.sort((a, b) => b.amount - a.amount);
  return out;
}

export function computeFixedVsVariable(
  recurring: RecurringCharge[],
  typicalMonthly: number,
): Omit<FixedVsVariable, "byCategory"> {
  const fixedMonthly = recurring.reduce((sum, r) => sum + r.amount, 0);
  const cappedFixed = Math.min(fixedMonthly, typicalMonthly > 0 ? typicalMonthly : fixedMonthly);
  return {
    fixedMonthly: cappedFixed,
    variableMonthly: Math.max(0, typicalMonthly - cappedFixed),
    typicalMonthly,
  };
}
