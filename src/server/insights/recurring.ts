// Pure recurring-charge detection. No DB access and no `server-only` import so it
// can be unit-tested directly. A merchant that bills most months is a fixed
// commitment (rent, utilities, subscriptions, insurance); the rest is variable
// discretionary spend. The engine feeds in each merchant's trailing monthly
// series; this decides what counts as recurring and the fixed monthly total.

import type { FixedVsVariable, RecurringCharge } from "@/lib/types";

export interface MerchantSeries {
  merchant: string;
  categoryId: number | null;
  categoryName: string | null;
  /** Monthly spend over the trailing window, oldest first, 0 where absent. */
  monthly: number[];
}

export interface RecurringOptions {
  /** Minimum months (of the window) a merchant must appear in to count. */
  minMonths?: number;
  /** Must have appeared within this many of the most recent months. */
  recentWindow?: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Classify which merchants are recurring. A merchant qualifies when it appears
 * in at least `minMonths` of the window AND showed up recently (so cancelled
 * subscriptions fade out). The representative amount is the median of the months
 * it actually appeared in, which shrugs off a one-off double charge.
 */
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
    });
  }
  out.sort((a, b) => b.amount - a.amount);
  return out;
}

/** Split a typical month into fixed (recurring) vs variable (discretionary). */
export function computeFixedVsVariable(
  recurring: RecurringCharge[],
  typicalMonthly: number,
): FixedVsVariable {
  const fixedMonthly = recurring.reduce((sum, r) => sum + r.amount, 0);
  // A merchant's median can exceed the trailing average in a light month, so
  // clamp fixed to the typical total to avoid a negative variable bucket.
  const cappedFixed = Math.min(fixedMonthly, typicalMonthly > 0 ? typicalMonthly : fixedMonthly);
  return {
    fixedMonthly: cappedFixed,
    variableMonthly: Math.max(0, typicalMonthly - cappedFixed),
    typicalMonthly,
  };
}
