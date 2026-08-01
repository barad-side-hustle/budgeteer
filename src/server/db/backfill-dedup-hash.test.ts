import { describe, expect, test } from "bun:test";

import { planDedupRepair, type RepairRow } from "@/server/db/backfill-dedup-hash";

function row(id: number, hash: string, syncRunId: number, referenced = false): RepairRow {
  return { id, workspaceId: 1, hash, syncRunId, referenced };
}

describe("planDedupRepair", () => {
  test("collapses a transaction re-scraped under a new hash formula", () => {
    const plan = planDedupRepair([row(1, "abc", 1), row(2, "abc", 3)]);
    expect(plan.remove).toEqual([2]);
    expect(plan.keep).toEqual([{ id: 1, hash: "abc", sequence: 0 }]);
  });

  test("keeps genuinely repeated same-day charges from a single sync", () => {
    const plan = planDedupRepair([row(1, "abc", 1), row(2, "abc", 1)]);
    expect(plan.remove).toEqual([]);
    expect(plan.keep).toEqual([
      { id: 1, hash: "abc", sequence: 0 },
      { id: 2, hash: "abc", sequence: 1 },
    ]);
  });

  test("keeps repeated charges once when both syncs saw both of them", () => {
    const plan = planDedupRepair([
      row(1, "abc", 1),
      row(2, "abc", 1),
      row(3, "abc", 3),
      row(4, "abc", 3),
    ]);
    expect(plan.remove).toEqual([3, 4]);
    expect(plan.keep.map((r) => r.sequence)).toEqual([0, 1]);
  });

  test("prefers rows already linked to a financial event", () => {
    const plan = planDedupRepair([row(1, "abc", 1), row(2, "abc", 3, true)]);
    expect(plan.remove).toEqual([1]);
    expect(plan.keep).toEqual([{ id: 2, hash: "abc", sequence: 0 }]);
  });

  test("never merges across workspaces", () => {
    const plan = planDedupRepair([
      { id: 1, workspaceId: 1, hash: "abc", syncRunId: 1, referenced: false },
      { id: 2, workspaceId: 2, hash: "abc", syncRunId: 1, referenced: false },
    ]);
    expect(plan.remove).toEqual([]);
    expect(plan.keep).toHaveLength(2);
  });

  test("leaves distinct transactions untouched", () => {
    const plan = planDedupRepair([row(1, "abc", 1), row(2, "def", 1)]);
    expect(plan.remove).toEqual([]);
    expect(plan.keep).toEqual([
      { id: 1, hash: "abc", sequence: 0 },
      { id: 2, hash: "def", sequence: 0 },
    ]);
  });
});
