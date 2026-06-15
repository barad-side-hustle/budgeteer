import { describe, expect, test } from "bun:test";

import { computeDedupHash } from "@/server/lib/dedup";

type Fields = Parameters<typeof computeDedupHash>[0];

/**
 * Mirrors the count-based decision in insertTransactions: per sync (batch), a row
 * is inserted only when its running count within the batch exceeds the count
 * already stored for that hash; otherwise it is an update (no new row). The store
 * persists across syncs, exactly like the transactions table.
 */
function simulateSyncs(syncs: Fields[][]): number {
  const stored = new Map<string, number>();
  for (const batch of syncs) {
    const batchCounts = new Map<string, number>();
    for (const txn of batch) {
      const hash = computeDedupHash(txn);
      const batchCount = (batchCounts.get(hash) ?? 0) + 1;
      batchCounts.set(hash, batchCount);
      const existing = stored.get(hash) ?? 0;
      if (batchCount > existing) stored.set(hash, batchCount);
    }
  }
  return [...stored.values()].reduce((a, b) => a + b, 0);
}

const cardBill: Omit<Fields, "date"> = {
  accountNumber: "946-354388_73",
  originalAmount: -2662.49,
  originalCurrency: "ILS",
  description: "לאומי מאסטרקרד",
  identifier: "745812",
  installmentNumber: null,
  installmentTotal: null,
};

describe("dedup across resyncs (the workspace-3 scenario)", () => {
  test("a pending card bill scraped four times stays a single row", () => {
    const rows = simulateSyncs([
      [{ ...cardBill, date: "2026-06-15T16:41:39.000Z" }],
      [{ ...cardBill, date: "2026-06-15T16:42:48.000Z" }],
      [{ ...cardBill, date: "2026-06-15T18:56:08.000Z" }],
      [{ ...cardBill, date: "2026-06-15T19:04:45.000Z" }],
    ]);
    expect(rows).toBe(1);
  });

  test("a pending bill that later posts collapses onto one row, not two", () => {
    const rows = simulateSyncs([
      [{ ...cardBill, date: "2026-06-15T18:56:08.000Z" }],
      [{ ...cardBill, date: "2026-06-14T21:00:00.000Z" }],
    ]);
    expect(rows).toBe(1);
  });

  test("two genuinely distinct same-day charges remain two rows", () => {
    const a: Fields = { ...cardBill, date: "2026-06-15T10:00:00.000Z", identifier: "111" };
    const b: Fields = { ...cardBill, date: "2026-06-15T10:00:00.000Z", identifier: "222" };
    expect(simulateSyncs([[a, b]])).toBe(2);
  });
});
