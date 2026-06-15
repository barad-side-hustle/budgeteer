import { describe, expect, test } from "bun:test";

import { toBankDayStartUtc } from "@/server/lib/dates";

describe("toBankDayStartUtc", () => {
  test("leaves a completed Israel-midnight instant unchanged (summer, +3)", () => {
    expect(toBankDayStartUtc("2026-06-14T21:00:00.000Z")).toBe("2026-06-14T21:00:00.000Z");
  });

  test("leaves a completed Israel-midnight instant unchanged (winter, +2)", () => {
    expect(toBankDayStartUtc("2025-12-30T22:00:00.000Z")).toBe("2025-12-30T22:00:00.000Z");
  });

  test("collapses a volatile pending timestamp onto the same day-start as its completed form", () => {
    const pendingEarly = toBankDayStartUtc("2026-06-15T18:56:08.000Z");
    const pendingLate = toBankDayStartUtc("2026-06-15T19:04:45.000Z");
    const completed = toBankDayStartUtc("2026-06-14T21:00:00.000Z");
    expect(pendingEarly).toBe(completed);
    expect(pendingLate).toBe(completed);
  });

  test("keeps different calendar days distinct", () => {
    expect(toBankDayStartUtc("2026-05-01")).not.toBe(toBankDayStartUtc("2026-05-02"));
  });

  test("returns the input untouched when it is not a valid date", () => {
    expect(toBankDayStartUtc("not-a-date")).toBe("not-a-date");
  });
});
