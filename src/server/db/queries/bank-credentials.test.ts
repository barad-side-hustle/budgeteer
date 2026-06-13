import { describe, expect, test } from "bun:test";
import type { CardIssuer } from "@/server/lib/transfers";
import { BANK_PROVIDERS } from "@/lib/types";
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

  test("CARD_ISSUERS agrees with the card-kind providers in BANK_PROVIDERS", () => {
    const cardKindIds = BANK_PROVIDERS.filter((b) => b.kind === "card")
      .map((b) => b.id as CardIssuer)
      .sort();
    const result = cardIssuersFromProviders(cardKindIds);
    expect([...result].sort()).toEqual(cardKindIds);
  });
});
