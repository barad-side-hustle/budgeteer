import { describe, expect, test } from "bun:test";

import {
  type AnomalyTxn,
  type DetectAnomaliesInput,
  detectAnomalies,
} from "@/server/insights/anomalies";

let nextId = 1;

function txn(partial: Partial<AnomalyTxn> & { date: string; amount: number }): AnomalyTxn {
  const merchant = partial.merchant ?? "shop";
  return {
    id: partial.id ?? nextId++,
    date: partial.date,
    monthKey: partial.monthKey ?? partial.date.slice(0, 7),
    merchant,
    displayMerchant: partial.displayMerchant ?? merchant,
    description: partial.description ?? merchant,
    amount: partial.amount,
    originalCurrency: partial.originalCurrency ?? "ILS",
    categoryId: partial.categoryId ?? null,
    categoryName: partial.categoryName ?? null,
  };
}

function run(txns: AnomalyTxn[], overrides: Partial<DetectAnomaliesInput> = {}) {
  return detectAnomalies({
    txns,
    currentMonthKey: "2026-06",
    homeCurrency: "ILS",
    feesCategoryName: "Fees & Taxes",
    ...overrides,
  });
}

describe("detectAnomalies - duplicate charge", () => {
  test("flags two equal charges from the same merchant within the window", () => {
    const result = run([
      txn({ merchant: "supermarket", date: "2026-06-10", amount: 240 }),
      txn({ merchant: "supermarket", date: "2026-06-12", amount: 240 }),
    ]);
    const dup = result.find((a) => a.type === "duplicate-charge");
    expect(dup).toBeDefined();
    expect(dup?.severity).toBe("flag");
    expect(dup?.transactionIds).toHaveLength(2);
  });

  test("does not flag equal charges more than three days apart", () => {
    const result = run([
      txn({ merchant: "supermarket", date: "2026-06-10", amount: 240 }),
      txn({ merchant: "supermarket", date: "2026-06-20", amount: 240 }),
    ]);
    expect(result.some((a) => a.type === "duplicate-charge")).toBe(false);
  });

  test("ignores tiny equal charges", () => {
    const result = run([
      txn({ merchant: "parking", date: "2026-06-10", amount: 12 }),
      txn({ merchant: "parking", date: "2026-06-11", amount: 12 }),
    ]);
    expect(result.some((a) => a.type === "duplicate-charge")).toBe(false);
  });
});

describe("detectAnomalies - foreign charge", () => {
  test("flags a large foreign charge from a new merchant", () => {
    const result = run([
      txn({ merchant: "overseas-store", date: "2026-06-05", amount: 320, originalCurrency: "USD" }),
    ]);
    const foreign = result.find((a) => a.type === "foreign-charge");
    expect(foreign).toBeDefined();
    expect(foreign?.currency).toBe("USD");
  });

  test("does not flag a foreign charge from an established merchant", () => {
    const result = run([
      txn({ merchant: "netflix", date: "2026-04-05", amount: 40, originalCurrency: "USD" }),
      txn({ merchant: "netflix", date: "2026-05-05", amount: 40, originalCurrency: "USD" }),
      txn({ merchant: "netflix", date: "2026-06-05", amount: 200, originalCurrency: "USD" }),
    ]);
    expect(result.some((a) => a.type === "foreign-charge")).toBe(false);
  });

  test("ignores home-currency charges", () => {
    const result = run([
      txn({ merchant: "local", date: "2026-06-05", amount: 320, originalCurrency: "ILS" }),
    ]);
    expect(result.some((a) => a.type === "foreign-charge")).toBe(false);
  });

  test("treats shekel aliases from scrapers as home currency", () => {
    const result = run([
      txn({ merchant: "garage", date: "2026-06-05", amount: 1740, originalCurrency: "NIS" }),
      txn({ merchant: "tavern", date: "2026-06-06", amount: 180, originalCurrency: "₪" }),
      txn({ merchant: "espresso", date: "2026-06-07", amount: 171, originalCurrency: 'ש"ח' }),
      txn({ merchant: "no-currency", date: "2026-06-08", amount: 500, originalCurrency: "" }),
      txn({ merchant: "padded", date: "2026-06-09", amount: 300, originalCurrency: " ils " }),
    ]);
    expect(result.some((a) => a.type === "foreign-charge")).toBe(false);
  });
});

describe("detectAnomalies - merchant outlier", () => {
  test("flags a charge far above the merchant's own history", () => {
    const result = run([
      txn({ merchant: "gym", date: "2026-03-01", amount: 150 }),
      txn({ merchant: "gym", date: "2026-04-01", amount: 150 }),
      txn({ merchant: "gym", date: "2026-05-01", amount: 150 }),
      txn({ merchant: "gym", date: "2026-06-01", amount: 600 }),
    ]);
    const outlier = result.find((a) => a.type === "merchant-outlier");
    expect(outlier).toBeDefined();
    expect(outlier?.amount2).toBe(150);
  });

  test("does not flag without enough history", () => {
    const result = run([
      txn({ merchant: "gym", date: "2026-05-01", amount: 150 }),
      txn({ merchant: "gym", date: "2026-06-01", amount: 600 }),
    ]);
    expect(result.some((a) => a.type === "merchant-outlier")).toBe(false);
  });
});

describe("detectAnomalies - price creep", () => {
  test("flags a recurring charge that stepped up", () => {
    const result = run([
      txn({ merchant: "saas", date: "2026-02-15", amount: 45 }),
      txn({ merchant: "saas", date: "2026-03-15", amount: 45 }),
      txn({ merchant: "saas", date: "2026-04-15", amount: 45 }),
      txn({ merchant: "saas", date: "2026-05-15", amount: 45 }),
      txn({ merchant: "saas", date: "2026-06-15", amount: 60 }),
    ]);
    const creep = result.find((a) => a.type === "price-creep");
    expect(creep).toBeDefined();
    expect(creep?.amount).toBe(60);
    expect(creep?.amount2).toBe(45);
  });

  test("does not flag a stable recurring charge", () => {
    const result = run([
      txn({ merchant: "saas", date: "2026-02-15", amount: 45 }),
      txn({ merchant: "saas", date: "2026-03-15", amount: 45 }),
      txn({ merchant: "saas", date: "2026-04-15", amount: 45 }),
      txn({ merchant: "saas", date: "2026-05-15", amount: 45 }),
      txn({ merchant: "saas", date: "2026-06-15", amount: 45 }),
    ]);
    expect(result.some((a) => a.type === "price-creep")).toBe(false);
  });

  test("does not flag a high-variance merchant like a supermarket", () => {
    const result = run([
      txn({ merchant: "market", date: "2026-02-03", amount: 120 }),
      txn({ merchant: "market", date: "2026-02-18", amount: 340 }),
      txn({ merchant: "market", date: "2026-03-06", amount: 90 }),
      txn({ merchant: "market", date: "2026-03-22", amount: 410 }),
      txn({ merchant: "market", date: "2026-04-09", amount: 60 }),
      txn({ merchant: "market", date: "2026-05-14", amount: 280 }),
      txn({ merchant: "market", date: "2026-06-02", amount: 150 }),
      txn({ merchant: "market", date: "2026-06-19", amount: 520 }),
    ]);
    expect(result.some((a) => a.type === "price-creep")).toBe(false);
  });
});

describe("detectAnomalies - new subscription", () => {
  test("flags a newly started recurring charge", () => {
    const result = run([
      txn({ merchant: "newapp", date: "2026-05-08", amount: 39 }),
      txn({ merchant: "newapp", date: "2026-06-08", amount: 39 }),
    ]);
    const newSub = result.find((a) => a.type === "new-subscription");
    expect(newSub).toBeDefined();
    expect(newSub?.amount).toBe(39);
  });
});

describe("detectAnomalies - interest charge", () => {
  test("sweeps interest keywords regardless of category", () => {
    const result = run([
      txn({ merchant: "bank", description: "ריבית חובה", date: "2026-06-03", amount: 87 }),
    ]);
    const interest = result.find((a) => a.type === "interest-charge");
    expect(interest).toBeDefined();
    expect(interest?.amount).toBe(87);
  });
});

describe("detectAnomalies - fee spike", () => {
  test("flags a fee category month above its trailing median", () => {
    const result = run([
      txn({ categoryName: "Fees & Taxes", merchant: "fee", date: "2026-03-01", amount: 20 }),
      txn({ categoryName: "Fees & Taxes", merchant: "fee", date: "2026-04-01", amount: 20 }),
      txn({ categoryName: "Fees & Taxes", merchant: "fee", date: "2026-05-01", amount: 20 }),
      txn({ categoryName: "Fees & Taxes", merchant: "fee", date: "2026-06-01", amount: 120 }),
    ]);
    const spike = result.find((a) => a.type === "fee-spike");
    expect(spike).toBeDefined();
    expect(spike?.amount).toBe(120);
    expect(spike?.amount2).toBe(20);
  });
});

describe("detectAnomalies - prioritization", () => {
  test("returns flags before watch-level anomalies", () => {
    const result = run([
      txn({ merchant: "store", date: "2026-06-10", amount: 500 }),
      txn({ merchant: "store", date: "2026-06-11", amount: 500 }),
      txn({ merchant: "newapp", date: "2026-05-08", amount: 39 }),
      txn({ merchant: "newapp", date: "2026-06-08", amount: 39 }),
    ]);
    expect(result[0].severity).toBe("flag");
  });
});
