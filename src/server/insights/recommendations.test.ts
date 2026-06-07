import { describe, expect, test } from "bun:test";

import type { Forecast, RecurringCharge } from "@/lib/types";
import {
  buildRecommendations,
  buildSavings,
  type CategorySpendRow,
  type SavingsInput,
} from "@/server/insights/recommendations";

function recurring(merchant: string, amount: number, categoryName: string | null): RecurringCharge {
  return {
    merchant,
    amount,
    categoryName,
    categoryId: 1,
    monthsPresent: 6,
    monthsConsidered: 6,
    lapsed: false,
    monthly: [amount, amount, amount, amount, amount, amount],
  };
}

function cat(categoryId: number, name: string, current: number, typical: number): CategorySpendRow {
  return { categoryId, name, current, typical };
}

const baseForecast: Forecast = {
  monthLabel: "March",
  elapsedDays: 15,
  totalDays: 30,
  daysLeft: 15,
  daysUntilPayday: 15,
  incomeMtd: 10000,
  expensesMtd: 4000,
  netMtd: 6000,
  expectedIncome: 10000,
  projectedExpenses: 8000,
  projectedNet: 2000,
  remainingIncome: 0,
  remainingExpenses: 4000,
  verdict: "plus",
  safeToSpendRemaining: 6000,
  safeToSpendPerDay: 400,
  safeToSpendThisWeek: 2800,
  typicalMonthlyExpenses: 8000,
  typicalMonthlyIncome: 10000,
  monthlyTarget: null,
  balanceToday: null,
  expectedMonthEnd: null,
  overdraftRisk: "none",
  hasData: true,
  hasBalance: false,
};

describe("buildSavings", () => {
  test("flags discretionary subscriptions but not rent", () => {
    const input: SavingsInput = {
      recurring: [recurring("Netflix", 55, "Subscriptions"), recurring("Rent", 5000, "Home")],
      categorySpend: [],
      feesThisMonth: 0,
      feesCategoryId: null,
    };
    const savings = buildSavings(input);
    expect(savings.some((s) => s.merchant === "Netflix" && s.type === "subscription")).toBe(true);
    expect(savings.some((s) => s.merchant === "Rent")).toBe(false);
  });

  test("flags a category spiking above its usual", () => {
    const input: SavingsInput = {
      recurring: [],
      categorySpend: [cat(2, "Restaurants", 900, 500)],
      feesThisMonth: 0,
      feesCategoryId: null,
    };
    const savings = buildSavings(input);
    const spike = savings.find((s) => s.type === "category-spike");
    expect(spike?.estimatedMonthly).toBe(400);
  });

  test("suggests trimming a big variable category and avoids essentials", () => {
    const input: SavingsInput = {
      recurring: [],
      categorySpend: [cat(3, "Shopping", 1000, 1000), cat(4, "Bills & Utilities", 2000, 2000)],
      feesThisMonth: 0,
      feesCategoryId: null,
    };
    const savings = buildSavings(input);
    const trim = savings.find((s) => s.type === "trim-category");
    expect(trim?.categoryName).toBe("Shopping");
    expect(trim?.estimatedMonthly).toBeCloseTo(150);
    expect(savings.some((s) => s.categoryName === "Bills & Utilities")).toBe(false);
  });

  test("surfaces avoidable fees", () => {
    const input: SavingsInput = {
      recurring: [],
      categorySpend: [],
      feesThisMonth: 80,
      feesCategoryId: 9,
    };
    const savings = buildSavings(input);
    expect(savings.find((s) => s.type === "fees")?.estimatedMonthly).toBe(80);
  });
});

describe("buildRecommendations", () => {
  test("leads with overdraft risk when the balance is heading negative", () => {
    const f: Forecast = {
      ...baseForecast,
      verdict: "minus",
      projectedNet: -2000,
      balanceToday: 500,
      expectedMonthEnd: -1500,
      overdraftRisk: "high",
      hasBalance: true,
    };
    const recs = buildRecommendations({ forecast: f, savings: [], hasBalance: true });
    expect(recs[0].type).toBe("overdraft-risk");
  });

  test("celebrates a surplus month and nudges saving", () => {
    const recs = buildRecommendations({ forecast: baseForecast, savings: [], hasBalance: true });
    const types = recs.map((r) => r.type);
    expect(types).toContain("plus-month");
    expect(types).toContain("build-savings");
    expect(types).toContain("safe-to-spend");
  });

  test("prompts to add a balance when none is set, and caps the feed", () => {
    const recs = buildRecommendations({
      forecast: baseForecast,
      savings: [
        {
          id: "a",
          type: "subscription",
          estimatedMonthly: 55,
          merchant: "Netflix",
          categoryId: 1,
          categoryName: "Subscriptions",
          fraction: null,
        },
      ],
      hasBalance: false,
    });
    expect(recs.some((r) => r.type === "add-balance")).toBe(true);
    expect(recs.length).toBeLessThanOrEqual(6);
  });
});
