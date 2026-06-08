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
