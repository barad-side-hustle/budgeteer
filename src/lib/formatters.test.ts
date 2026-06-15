import { describe, expect, test } from "bun:test";

import { formatDate, getMonthRange } from "@/lib/formatters";

describe("getMonthRange", () => {
  test("spans the client-local month as UTC instants", () => {
    const { from } = getMonthRange(new Date(2026, 5, 15));
    expect(from).toBe(new Date(2026, 5, 1).toISOString());
    expect(from).toContain("T");
  });

  test("includes the first instant of the month and excludes the next month", () => {
    const { from, to } = getMonthRange(new Date(2026, 5, 15));
    const firstOfMonth = new Date(2026, 5, 1).toISOString();
    const firstOfNextMonth = new Date(2026, 6, 1).toISOString();
    expect(firstOfMonth >= from && firstOfMonth <= to).toBe(true);
    expect(firstOfNextMonth > to).toBe(true);
  });
});

describe("formatDate", () => {
  test("renders YYYY-MM-DD as dd/mm/yyyy with no timezone shift", () => {
    expect(formatDate("2026-06-01")).toBe("01/06/2026");
    expect(formatDate("2026-12-31")).toBe("31/12/2026");
  });

  test("returns empty string for null or undefined", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
  });
});
