import { describe, expect, test } from "bun:test";

import { getMonthRange } from "@/lib/formatters";

describe("getMonthRange", () => {
  test("spans the client-local month as UTC instants", () => {
    const { from, to } = getMonthRange(new Date(2026, 5, 15));
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
