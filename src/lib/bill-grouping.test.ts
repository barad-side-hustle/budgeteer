import { describe, expect, test } from "bun:test";

import { groupBillChildren } from "@/lib/bill-grouping";
import type { TransactionWithCategory } from "@/lib/types";

function txn(over: Partial<TransactionWithCategory>): TransactionWithCategory {
  return {
    id: 0,
    accountNumber: "1",
    date: "2026-06-01",
    processedDate: "2026-06-01",
    localDate: "2026-06-01",
    billingLocalDate: "2026-06-01",
    originalAmount: 0,
    originalCurrency: "ILS",
    chargedAmount: 0,
    chargedCurrency: "ILS",
    description: "x",
    memo: null,
    type: "normal",
    status: "completed",
    identifier: null,
    installmentNumber: null,
    installmentTotal: null,
    categoryId: null,
    categorySource: null,
    aiConfidence: null,
    provider: "isracard",
    credentialId: null,
    accountLabel: null,
    accountName: null,
    syncRunId: 1,
    kind: "expense",
    needsReview: false,
    eventId: null,
    eventRole: null,
    matchConfidence: null,
    createdAt: "",
    updatedAt: "",
    categoryName: null,
    categoryColor: null,
    isExcluded: false,
    matchedCardNumber: null,
    ...over,
  };
}

describe("groupBillChildren", () => {
  test("nests purchases under their bill and removes them from top level", () => {
    const bill = txn({ id: 1, eventId: 10, eventRole: "bill_payment", kind: "transfer" });
    const p1 = txn({ id: 2, eventId: 10, eventRole: "purchase" });
    const p2 = txn({ id: 3, eventId: 10, eventRole: "purchase" });
    const rows = groupBillChildren([bill, p1, p2]);
    expect(rows).toHaveLength(1);
    expect(rows[0].txn.id).toBe(1);
    expect(rows[0].children.map((c) => c.id)).toEqual([2, 3]);
  });

  test("bill with no loaded children has empty children", () => {
    const bill = txn({ id: 1, eventId: 10, eventRole: "bill_payment", kind: "transfer" });
    const rows = groupBillChildren([bill]);
    expect(rows).toHaveLength(1);
    expect(rows[0].children).toEqual([]);
  });

  test("orphan purchase (bill absent) stays as a top-level row", () => {
    const p1 = txn({ id: 2, eventId: 10, eventRole: "purchase" });
    const rows = groupBillChildren([p1]);
    expect(rows).toHaveLength(1);
    expect(rows[0].txn.id).toBe(2);
    expect(rows[0].children).toEqual([]);
  });

  test("preserves top-level order across multiple bills and plain rows", () => {
    const plain = txn({ id: 1 });
    const billA = txn({ id: 2, eventId: 10, eventRole: "bill_payment", kind: "transfer" });
    const a1 = txn({ id: 3, eventId: 10, eventRole: "purchase" });
    const billB = txn({ id: 4, eventId: 20, eventRole: "bill_payment", kind: "transfer" });
    const b1 = txn({ id: 5, eventId: 20, eventRole: "purchase" });
    const rows = groupBillChildren([plain, billA, a1, billB, b1]);
    expect(rows.map((r) => r.txn.id)).toEqual([1, 2, 4]);
    expect(rows[1].children.map((c) => c.id)).toEqual([3]);
    expect(rows[2].children.map((c) => c.id)).toEqual([5]);
  });
});
