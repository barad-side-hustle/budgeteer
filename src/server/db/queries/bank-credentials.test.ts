import { describe, expect, test } from "bun:test";
import { cardIssuersFromProviders } from "@/server/db/queries/bank-credentials";

describe("cardIssuersFromProviders", () => {
  test("keeps only providers whose BANK_PROVIDERS kind is card", () => {
    const result = cardIssuersFromProviders(["leumi", "isracard", "max", "hapoalim"]);
    expect([...result].sort()).toEqual(["isracard", "max"]);
  });

  test("ignores unknown providers and dedups", () => {
    const result = cardIssuersFromProviders(["cal", "cal", "nope"]);
    expect([...result]).toEqual(["cal"]);
  });

  test("returns an empty set when no card providers present", () => {
    expect(cardIssuersFromProviders(["leumi", "hapoalim"]).size).toBe(0);
  });
});
