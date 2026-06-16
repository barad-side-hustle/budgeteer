import { describe, expect, test } from "bun:test";

import {
  classifyScrapedCards,
  hasCardDataChange,
  isCardIssuerProvider,
  ownedAccounts,
} from "@/server/sync/card-ownership";

describe("isCardIssuerProvider", () => {
  test("true for card issuers, false for banks", () => {
    expect(isCardIssuerProvider("cal")).toBe(true);
    expect(isCardIssuerProvider("isracard")).toBe(true);
    expect(isCardIssuerProvider("leumi")).toBe(false);
    expect(isCardIssuerProvider("unknown")).toBe(false);
  });
});

describe("classifyScrapedCards", () => {
  test("new card (no prior owner) is owned by the syncing credential", () => {
    const c = classifyScrapedCards(7, ["4384"], new Map());
    expect(c.newlyAdded).toEqual(["4384"]);
    expect(c.shared).toEqual([]);
    expect(c.existingOwn).toEqual([]);
    expect(c.ownerByAccount.get("4384")).toBe(7);
  });

  test("card owned by another credential is shared and keeps its owner", () => {
    const c = classifyScrapedCards(7, ["3307"], new Map([["3307", 3]]));
    expect(c.shared).toEqual(["3307"]);
    expect(c.newlyAdded).toEqual([]);
    expect(c.ownerByAccount.get("3307")).toBe(3);
  });

  test("card already owned by the syncing credential is existingOwn", () => {
    const c = classifyScrapedCards(7, ["8682"], new Map([["8682", 7]]));
    expect(c.existingOwn).toEqual(["8682"]);
    expect(c.shared).toEqual([]);
    expect(c.newlyAdded).toEqual([]);
    expect(c.ownerByAccount.get("8682")).toBe(7);
  });

  test("mixed batch is partitioned and duplicates are ignored", () => {
    const c = classifyScrapedCards(
      7,
      ["3307", "4384", "8682", "4384"],
      new Map([
        ["3307", 3],
        ["8682", 7],
      ]),
    );
    expect(c.shared).toEqual(["3307"]);
    expect(c.newlyAdded).toEqual(["4384"]);
    expect(c.existingOwn).toEqual(["8682"]);
    expect(c.ownerByAccount.get("4384")).toBe(7);
  });
});

describe("ownedAccounts", () => {
  test("returns the accounts owned by the syncing credential (new + existing own)", () => {
    const c = classifyScrapedCards(
      7,
      ["3307", "4384", "8682"],
      new Map([
        ["3307", 3],
        ["8682", 7],
      ]),
    );
    expect(ownedAccounts(c).sort()).toEqual(["4384", "8682"]);
  });

  test("excludes shared accounts owned by another credential", () => {
    const c = classifyScrapedCards(7, ["3307"], new Map([["3307", 3]]));
    expect(ownedAccounts(c)).toEqual([]);
  });

  test("adopts a previously-orphaned card as owned when no prior owner exists", () => {
    const c = classifyScrapedCards(7, ["4384"], new Map());
    expect(ownedAccounts(c)).toEqual(["4384"]);
  });
});

describe("hasCardDataChange", () => {
  test("true when a card issuer added rows", () => {
    expect(hasCardDataChange([{ ok: true, provider: "cal", added: 3, updated: 0 }])).toBe(true);
  });

  test("true when a card issuer only updated rows", () => {
    expect(hasCardDataChange([{ ok: true, provider: "cal", added: 0, updated: 2 }])).toBe(true);
  });

  test("false for a bank provider", () => {
    expect(hasCardDataChange([{ ok: true, provider: "leumi", added: 9, updated: 9 }])).toBe(false);
  });

  test("false when the card sync failed or had no changes", () => {
    expect(hasCardDataChange([{ ok: false, provider: "cal", added: 5, updated: 5 }])).toBe(false);
    expect(hasCardDataChange([{ ok: true, provider: "cal", added: 0, updated: 0 }])).toBe(false);
  });
});
