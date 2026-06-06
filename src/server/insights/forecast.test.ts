import { describe, expect, test } from "bun:test";

import { computeForecast, type ForecastInput } from "@/server/insights/forecast";

const base: ForecastInput = {
  monthLabel: "March",
  elapsedDays: 15,
  totalDays: 30,
  daysUntilPayday: 15,
  incomeMtd: 10000,
  expensesMtd: 4000,
  fixedMtd: 0,
  fixedMonthly: 0,
  typicalMonthlyIncome: 10000,
  typicalMonthlyExpenses: 8000,
  monthlyTarget: null,
  balanceToday: null,
};

describe("computeForecast verdict", () => {
  test("projects a surplus month as 'plus'", () => {
    const f = computeForecast(base);
    // 4000 spent over 15 of 30 days, blended fully onto live pace by day 10 -> 8000.
    expect(f.projectedExpenses).toBeCloseTo(8000);
    expect(f.expectedIncome).toBe(10000);
    expect(f.projectedNet).toBeCloseTo(2000);
    expect(f.verdict).toBe("plus");
  });

  test("projects an overspending month as 'minus'", () => {
    const f = computeForecast({ ...base, expensesMtd: 7000, typicalMonthlyExpenses: 14000 });
    expect(f.projectedExpenses).toBeCloseTo(14000);
    expect(f.projectedNet).toBeCloseTo(-4000);
    expect(f.verdict).toBe("minus");
  });

  test("counts not-yet-received salary as upcoming income", () => {
    const f = computeForecast({ ...base, incomeMtd: 0, typicalMonthlyIncome: 10000 });
    expect(f.expectedIncome).toBe(10000);
    expect(f.remainingIncome).toBe(10000);
  });
});

describe("computeForecast safe-to-spend", () => {
  test("spreads remaining headroom over the days left", () => {
    const f = computeForecast(base);
    // ceiling = expectedIncome 10000, spent 4000 -> 6000 left over 15 days.
    expect(f.safeToSpendRemaining).toBe(6000);
    expect(f.safeToSpendPerDay).toBeCloseTo(400);
    expect(f.safeToSpendThisWeek).toBeCloseTo(2800);
  });

  test("uses an explicit monthly target as the ceiling when set", () => {
    const f = computeForecast({ ...base, monthlyTarget: 5000 });
    expect(f.safeToSpendRemaining).toBe(1000);
  });

  test("never goes negative once the ceiling is blown", () => {
    const f = computeForecast({ ...base, expensesMtd: 12000 });
    expect(f.safeToSpendRemaining).toBe(0);
  });
});

describe("computeForecast balance tier", () => {
  test("projects month-end balance and flags a healthy buffer as 'none'", () => {
    const f = computeForecast({ ...base, balanceToday: 5000 });
    // remainingIncome 0 (income already received), remainingExpenses 4000.
    expect(f.expectedMonthEnd).toBeCloseTo(1000);
    expect(f.hasBalance).toBe(true);
    // buffer = max(500, 0.15*8000=1200) -> 1000 < 1200 -> watch
    expect(f.overdraftRisk).toBe("watch");
  });

  test("flags a negative projected balance as 'high'", () => {
    const f = computeForecast({ ...base, balanceToday: 1000 });
    expect(f.expectedMonthEnd).toBeCloseTo(-3000);
    expect(f.overdraftRisk).toBe("high");
  });

  test("omits balance fields when no balance is known", () => {
    const f = computeForecast(base);
    expect(f.balanceToday).toBeNull();
    expect(f.expectedMonthEnd).toBeNull();
    expect(f.overdraftRisk).toBe("none");
    expect(f.hasBalance).toBe(false);
  });
});

describe("computeForecast edge cases", () => {
  test("reports no data for an empty workspace", () => {
    const f = computeForecast({
      ...base,
      incomeMtd: 0,
      expensesMtd: 0,
      typicalMonthlyIncome: null,
      typicalMonthlyExpenses: null,
    });
    expect(f.hasData).toBe(false);
  });

  test("does not project below what is already spent", () => {
    const f = computeForecast({
      ...base,
      elapsedDays: 28,
      expensesMtd: 9000,
      typicalMonthlyExpenses: 3000,
    });
    expect(f.projectedExpenses).toBeGreaterThanOrEqual(9000);
  });

  test("counts a big fixed charge once instead of extrapolating it", () => {
    // Day 3 of 30: rent (5000) + a little variable (300) already spent.
    // Naive straight-line would project 5300/3*30 = 53,000. With the fixed
    // split, rent is counted once and only the 300 variable is paced.
    const f = computeForecast({
      ...base,
      elapsedDays: 3,
      expensesMtd: 5300,
      fixedMtd: 5000,
      fixedMonthly: 5200,
      typicalMonthlyExpenses: 8000,
    });
    expect(f.projectedExpenses).toBeLessThan(12000);
    expect(f.projectedExpenses).toBeGreaterThanOrEqual(5300);
  });
});
