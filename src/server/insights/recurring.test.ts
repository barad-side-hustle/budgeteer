import { describe, expect, test } from "bun:test";

import {
  computeFixedVsVariable,
  detectRecurring,
  type MerchantSeries,
} from "@/server/insights/recurring";

function series(merchant: string, monthly: number[]): MerchantSeries {
  return { merchant, categoryId: null, categoryName: null, monthly };
}

describe("detectRecurring", () => {
  test("flags a steady monthly charge and ignores a one-off", () => {
    const recurring = detectRecurring([
      series("Netflix", [55, 55, 55, 55, 55, 55]),
      series("Random Shop", [0, 0, 400, 0, 0, 0]),
    ]);
    expect(recurring.map((r) => r.merchant)).toEqual(["Netflix"]);
    expect(recurring[0].amount).toBe(55);
    expect(recurring[0].monthsPresent).toBe(6);
  });

  test("uses the median so a double-charge month does not inflate the amount", () => {
    const recurring = detectRecurring([series("Gym", [120, 120, 240, 120, 120, 120])]);
    expect(recurring[0].amount).toBe(120);
  });

  test("drops a cancelled subscription that has not billed recently", () => {
    const recurring = detectRecurring([series("Old SaaS", [50, 50, 50, 0, 0, 0])]);
    expect(recurring).toHaveLength(0);
  });

  test("marks a present-but-skipped-last-month charge as lapsed", () => {
    const recurring = detectRecurring([series("Insurance", [200, 200, 200, 200, 0])], {
      recentWindow: 3,
    });
    expect(recurring).toHaveLength(1);
    expect(recurring[0].lapsed).toBe(true);
  });

  test("sorts by amount, largest first", () => {
    const recurring = detectRecurring([
      series("Spotify", [30, 30, 30]),
      series("Rent", [5000, 5000, 5000]),
    ]);
    expect(recurring.map((r) => r.merchant)).toEqual(["Rent", "Spotify"]);
  });
});

describe("computeFixedVsVariable", () => {
  test("splits typical spend into fixed and variable", () => {
    const recurring = detectRecurring([
      series("Rent", [5000, 5000, 5000]),
      series("Netflix", [55, 55, 55]),
    ]);
    const fv = computeFixedVsVariable(recurring, 8000);
    expect(fv.fixedMonthly).toBe(5055);
    expect(fv.variableMonthly).toBe(2945);
  });

  test("never produces a negative variable bucket", () => {
    const recurring = detectRecurring([series("Rent", [9000, 9000, 9000])]);
    const fv = computeFixedVsVariable(recurring, 8000);
    expect(fv.fixedMonthly).toBe(8000);
    expect(fv.variableMonthly).toBe(0);
  });
});
