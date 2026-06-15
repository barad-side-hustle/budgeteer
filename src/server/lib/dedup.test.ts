import { describe, expect, test } from "bun:test";

import { computeDedupHash } from "@/server/lib/dedup";

const baseFields = {
  accountNumber: "1234",
  date: "2026-05-01",
  originalAmount: -42.5,
  originalCurrency: "ILS",
  description: "סופר",
  identifier: "abc",
  installmentNumber: null,
  installmentTotal: null,
};

describe("computeDedupHash", () => {
  test("is deterministic for identical input", () => {
    expect(computeDedupHash(baseFields)).toBe(computeDedupHash(baseFields));
  });

  test("differs when any stable field changes", () => {
    const baseline = computeDedupHash(baseFields);
    expect(computeDedupHash({ ...baseFields, accountNumber: "9999" })).not.toBe(baseline);
    expect(computeDedupHash({ ...baseFields, date: "2026-05-02" })).not.toBe(baseline);
    expect(computeDedupHash({ ...baseFields, originalAmount: -42.51 })).not.toBe(baseline);
    expect(computeDedupHash({ ...baseFields, originalCurrency: "USD" })).not.toBe(baseline);
    expect(computeDedupHash({ ...baseFields, description: "אחר" })).not.toBe(baseline);
    expect(computeDedupHash({ ...baseFields, identifier: "xyz" })).not.toBe(baseline);
  });

  test("treats null and undefined identifier as equivalent", () => {
    const withNull = computeDedupHash({ ...baseFields, identifier: null });
    const withUndefined = computeDedupHash({ ...baseFields, identifier: undefined });
    expect(withNull).toBe(withUndefined);
  });

  test("distinguishes installment positions", () => {
    const first = computeDedupHash({ ...baseFields, installmentNumber: 1, installmentTotal: 3 });
    const second = computeDedupHash({ ...baseFields, installmentNumber: 2, installmentTotal: 3 });
    expect(first).not.toBe(second);
  });

  test("is stable across the volatile timestamps a pending transaction carries between syncs", () => {
    const firstSync = computeDedupHash({ ...baseFields, date: "2026-06-15T18:56:08.000Z" });
    const secondSync = computeDedupHash({ ...baseFields, date: "2026-06-15T19:04:45.000Z" });
    expect(firstSync).toBe(secondSync);
  });

  test("matches a pending transaction to its completed Israel-midnight form", () => {
    const pending = computeDedupHash({ ...baseFields, date: "2026-06-15T19:04:45.000Z" });
    const completed = computeDedupHash({ ...baseFields, date: "2026-06-14T21:00:00.000Z" });
    expect(pending).toBe(completed);
  });
});
