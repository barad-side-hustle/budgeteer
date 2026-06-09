import { describe, expect, test } from "bun:test";
import { ALLOWED_CATEGORY_NAMES, generateDemoDataset } from "./demo-data";

const NOW = new Date(2026, 5, 15);

function monthsOf(dates: string[]): string[] {
  return [...new Set(dates.map((d) => d.slice(0, 7)))].sort();
}

describe("generateDemoDataset", () => {
  test("is deterministic for a fixed reference date", () => {
    expect(generateDemoDataset(NOW)).toEqual(generateDemoDataset(NOW));
  });

  test("spans 12 consecutive months ending in the current month", () => {
    const ds = generateDemoDataset(NOW);
    const months = monthsOf(ds.transactions.map((t) => t.date));
    expect(months).toHaveLength(12);
    expect(months[months.length - 1]).toBe("2026-06");
    expect(months[0]).toBe("2025-07");
  });

  test("has exactly one positive salary per month, categorized as Salary", () => {
    const ds = generateDemoDataset(NOW);
    const salary = ds.transactions.filter((t) => t.categoryName === "Salary");
    expect(salary).toHaveLength(12);
    expect(salary.every((t) => t.chargedAmount > 0)).toBe(true);
  });

  test("every non-salary transaction is a negative expense", () => {
    const ds = generateDemoDataset(NOW);
    const expenses = ds.transactions.filter((t) => t.categoryName !== "Salary");
    expect(expenses.every((t) => t.chargedAmount < 0)).toBe(true);
  });

  test("uses only allowed seeded category names", () => {
    const ds = generateDemoDataset(NOW);
    for (const t of ds.transactions) {
      expect(ALLOWED_CATEGORY_NAMES).toContain(t.categoryName);
    }
  });

  test("never produces a transaction dated after the reference date", () => {
    const ds = generateDemoDataset(NOW);
    const iso = "2026-06-15";
    expect(ds.transactions.every((t) => t.date <= iso)).toBe(true);
  });

  test("includes the rent charge in every completed month", () => {
    const ds = generateDemoDataset(NOW);
    const rentMonths = monthsOf(
      ds.transactions
        .filter((t) => t.description === "Maple Court Property Mgmt")
        .map((t) => t.date),
    );
    expect(rentMonths).toContain("2025-07");
    expect(rentMonths).toContain("2026-05");
    expect(rentMonths.length).toBeGreaterThanOrEqual(11);
  });

  test("produces sensible settings", () => {
    const ds = generateDemoDataset(NOW);
    expect(ds.workspaceName).toBe("Demo");
    expect(ds.bankProvider).toBe("hapoalim");
    expect(ds.settings.paydayDay).toBe(10);
    expect(ds.settings.currentBalanceDate).toBe("2026-06-15");
  });
});
