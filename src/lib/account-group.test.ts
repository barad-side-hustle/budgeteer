import { describe, expect, test } from "bun:test";

import {
  accountSelectionValue,
  effectiveGroupKey,
  formatBillingAccountKey,
  groupAccountsForFilter,
  groupSelectionValue,
  parseAccountSelection,
  selectionToKeys,
} from "@/lib/account-group";
import type { BankAccount } from "@/lib/types";

function account(
  overrides: Partial<BankAccount> & Pick<BankAccount, "id" | "accountNumber">,
): BankAccount {
  return {
    credentialId: 1,
    provider: "cal",
    name: overrides.accountNumber,
    ownershipType: "personal",
    balance: null,
    balanceCurrency: null,
    balanceUpdatedAt: null,
    groupKey: null,
    groupName: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

const cal4929 = account({
  id: 1,
  accountNumber: "4929",
  groupKey: "12-609-191138",
  groupName: "12-609-191138",
});
const cal7408 = account({
  id: 2,
  accountNumber: "7408",
  groupKey: "12-640-490192",
  groupName: "12-640-490192",
});
const cal5287 = account({
  id: 3,
  accountNumber: "5287",
  groupKey: "12-640-490192",
  groupName: "12-640-490192",
});
const hapoalimMain = account({
  id: 4,
  credentialId: 2,
  provider: "hapoalim",
  accountNumber: "12-609-191138",
});
const hapoalimJoint = account({
  id: 5,
  credentialId: 2,
  provider: "hapoalim",
  accountNumber: "12-640-490192",
});

const all = [cal4929, cal7408, cal5287, hapoalimMain, hapoalimJoint];

describe("formatBillingAccountKey", () => {
  test("matches the bank scrapers' account_number format", () => {
    expect(
      formatBillingAccountKey({
        originalBankCode: 12,
        bankBranchNum: "640",
        bankAccountNum: "490192",
      }),
    ).toBe("12-640-490192");
  });
});

describe("effectiveGroupKey", () => {
  test("uses groupKey when present", () => {
    expect(effectiveGroupKey(cal4929)).toBe("12-609-191138");
  });

  test("falls back to accountNumber when ungrouped", () => {
    expect(effectiveGroupKey(hapoalimMain)).toBe("12-609-191138");
  });
});

describe("groupAccountsForFilter", () => {
  test("keeps cards as members under their billing account", () => {
    const groups = groupAccountsForFilter(all);
    expect(groups.length).toBe(4);

    const joint = groups.find((g) => g.provider === "cal" && g.groupKey === "12-640-490192");
    expect(joint?.grouped).toBe(true);
    expect(joint?.members.map((m) => m.accountNumber)).toEqual(["7408", "5287"]);

    const main = groups.find((g) => g.provider === "cal" && g.groupKey === "12-609-191138");
    expect(main?.grouped).toBe(true);
    expect(main?.members.map((m) => m.accountNumber)).toEqual(["4929"]);
  });

  test("treats ungrouped bank accounts as standalone, non-grouped entries", () => {
    const groups = groupAccountsForFilter([hapoalimMain]);
    expect(groups).toHaveLength(1);
    expect(groups[0].grouped).toBe(false);
    expect(groups[0].name).toBe("12-609-191138");
    expect(groups[0].members).toHaveLength(1);
  });

  test("does not merge across credentials even when group keys match", () => {
    const groups = groupAccountsForFilter(all);
    const cal = groups.filter((g) => g.provider === "cal");
    const hapoalim = groups.filter((g) => g.provider === "hapoalim");
    expect(cal).toHaveLength(2);
    expect(hapoalim).toHaveLength(2);
  });
});

describe("selection encoding", () => {
  test("round-trips an account selection", () => {
    expect(parseAccountSelection(accountSelectionValue(5))).toEqual({ kind: "account", id: 5 });
  });

  test("round-trips a group selection", () => {
    expect(parseAccountSelection(groupSelectionValue(1, "12-640-490192"))).toEqual({
      kind: "group",
      credentialId: 1,
      groupKey: "12-640-490192",
    });
  });

  test("rejects malformed selections", () => {
    expect(parseAccountSelection("nope")).toBeNull();
    expect(parseAccountSelection("a:0")).toBeNull();
    expect(parseAccountSelection("g:1:")).toBeNull();
  });
});

describe("selectionToKeys", () => {
  test("a specific card resolves to only that card", () => {
    expect(selectionToKeys(all, accountSelectionValue(2))).toEqual([
      { credentialId: 1, accountNumber: "7408" },
    ]);
  });

  test("an account resolves to every card in it", () => {
    expect(selectionToKeys(all, groupSelectionValue(1, "12-640-490192"))).toEqual([
      { credentialId: 1, accountNumber: "7408" },
      { credentialId: 1, accountNumber: "5287" },
    ]);
  });

  test("never crosses credentials", () => {
    expect(selectionToKeys(all, groupSelectionValue(1, "12-609-191138"))).toEqual([
      { credentialId: 1, accountNumber: "4929" },
    ]);
  });

  test("returns nothing for unknown or malformed selections", () => {
    expect(selectionToKeys(all, accountSelectionValue(999))).toEqual([]);
    expect(selectionToKeys(all, "garbage")).toEqual([]);
  });
});
