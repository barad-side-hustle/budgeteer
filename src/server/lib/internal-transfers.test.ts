import { describe, expect, test } from "bun:test";

import { findInternalTransferPairs, type TransferCandidate } from "@/server/lib/internal-transfers";

function row(partial: Partial<TransferCandidate> & { id: number }): TransferCandidate {
  return {
    credentialId: 1,
    accountNumber: "A",
    date: "2026-05-01",
    chargedAmount: -100,
    chargedCurrency: "ILS",
    description: "העברה",
    kind: "expense",
    ...partial,
  };
}

describe("findInternalTransferPairs", () => {
  test("pairs opposite-sign equal-amount rows across accounts within the window", () => {
    const pairs = findInternalTransferPairs([
      row({ id: 1, credentialId: 1, chargedAmount: -1500, description: "העברה לחשבון" }),
      row({ id: 2, credentialId: 2, chargedAmount: 1500, kind: "income", date: "2026-05-02" }),
    ]);
    expect(pairs).toEqual([{ debitId: 1, creditId: 2 }]);
  });

  test("does NOT pair when neither side has a transfer keyword", () => {
    const pairs = findInternalTransferPairs([
      row({ id: 1, credentialId: 1, chargedAmount: -200, description: "שופרסל" }),
      row({ id: 2, credentialId: 2, chargedAmount: 200, kind: "income", description: "מכולת" }),
    ]);
    expect(pairs).toEqual([]);
  });

  test("pairs a Hebrew standing order between two owned accounts", () => {
    const pairs = findInternalTransferPairs([
      row({
        id: 1,
        credentialId: 2,
        accountNumber: "12-640-490192",
        chargedAmount: -8000,
        description: "\u05d4\u05d5\u05e8\u05d0\u05ea-\u05e7\u05d1\u05e2",
        date: "2026-07-01",
      }),
      row({
        id: 2,
        credentialId: 2,
        accountNumber: "12-609-191138",
        chargedAmount: 8000,
        kind: "income",
        description: "\u05d4\u05d5\u05e8\u05d0\u05ea-\u05e7\u05d1\u05e2",
        date: "2026-07-02",
      }),
    ]);
    expect(pairs).toEqual([{ debitId: 1, creditId: 2 }]);
  });

  test("leaves a standing order with no opposite leg alone", () => {
    const pairs = findInternalTransferPairs([
      row({
        id: 1,
        credentialId: 2,
        accountNumber: "12-640-490192",
        chargedAmount: -5000,
        description: "\u05d4\u05d5\u05e8\u05d0\u05ea-\u05e7\u05d1\u05e2",
      }),
    ]);
    expect(pairs).toEqual([]);
  });

  test("pairs without a keyword once requireKeyword is off", () => {
    const rows = [
      row({
        id: 1,
        credentialId: 1,
        chargedAmount: -200,
        description: "\u05e9\u05d5\u05e4\u05e8\u05e1\u05dc",
      }),
      row({
        id: 2,
        credentialId: 2,
        chargedAmount: 200,
        kind: "income" as const,
        description: "\u05de\u05db\u05d5\u05dc\u05ea",
      }),
    ];
    expect(findInternalTransferPairs(rows)).toEqual([]);
    expect(findInternalTransferPairs(rows, { requireKeyword: false })).toEqual([
      { debitId: 1, creditId: 2 },
    ]);
  });

  test("does not pair within the same account", () => {
    const pairs = findInternalTransferPairs([
      row({ id: 1, credentialId: 1, accountNumber: "A", chargedAmount: -200 }),
      row({ id: 2, credentialId: 1, accountNumber: "A", chargedAmount: 200, kind: "income" }),
    ]);
    expect(pairs).toEqual([]);
  });

  test("rejects amounts beyond epsilon", () => {
    const pairs = findInternalTransferPairs([
      row({ id: 1, credentialId: 1, chargedAmount: -200 }),
      row({ id: 2, credentialId: 2, chargedAmount: 201, kind: "income" }),
    ]);
    expect(pairs).toEqual([]);
  });

  test("rejects dates more than 2 days apart", () => {
    const pairs = findInternalTransferPairs([
      row({ id: 1, credentialId: 1, chargedAmount: -200, date: "2026-05-01" }),
      row({ id: 2, credentialId: 2, chargedAmount: 200, kind: "income", date: "2026-05-05" }),
    ]);
    expect(pairs).toEqual([]);
  });

  test("rejects currency mismatch", () => {
    const pairs = findInternalTransferPairs([
      row({ id: 1, credentialId: 1, chargedAmount: -200, chargedCurrency: "ILS" }),
      row({ id: 2, credentialId: 2, chargedAmount: 200, kind: "income", chargedCurrency: "USD" }),
    ]);
    expect(pairs).toEqual([]);
  });

  test("skips rows already marked as transfers", () => {
    const pairs = findInternalTransferPairs([
      row({ id: 1, credentialId: 1, chargedAmount: -200, kind: "transfer" }),
      row({ id: 2, credentialId: 2, chargedAmount: 200, kind: "transfer" }),
    ]);
    expect(pairs).toEqual([]);
  });

  test("greedy 1:1 — two debits, one credit produce exactly one deterministic pair", () => {
    const pairs = findInternalTransferPairs([
      row({ id: 1, credentialId: 1, chargedAmount: -300, date: "2026-05-03" }),
      row({ id: 2, credentialId: 1, chargedAmount: -300, date: "2026-05-01" }),
      row({ id: 3, credentialId: 2, chargedAmount: 300, kind: "income", date: "2026-05-01" }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toEqual({ debitId: 2, creditId: 3 });
  });

  test("epsilon boundary: 200.00 vs 200.005 still pairs", () => {
    const pairs = findInternalTransferPairs([
      row({ id: 1, credentialId: 1, chargedAmount: -200 }),
      row({ id: 2, credentialId: 2, chargedAmount: 200.005, kind: "income" }),
    ]);
    expect(pairs).toEqual([{ debitId: 1, creditId: 2 }]);
  });
});
