import { describe, expect, mock, test } from "bun:test";
import type { CardIssuer } from "@/server/lib/transfers";

const fakeWorkspaceId = 1;
const fakeCreditCardCategoryId = 99;

function noopChain() {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    all: () => [] as unknown[],
    get: () => null,
    update: () => chain,
    delete: () => chain,
    insert: () => chain,
    set: () => chain,
    run: () => undefined,
    returning: () => chain,
    onConflictDoNothing: () => chain,
    values: () => chain,
  };
  return chain;
}

mock.module("@/server/db/orm", () => ({
  getOrm: () => ({
    transaction: (fn: (tx: ReturnType<typeof noopChain>) => void) => fn(noopChain()),
    ...noopChain(),
  }),
}));

mock.module("@/server/db/schema", () => ({
  financialEvents: {},
  eventMembers: {},
  transactions: {},
  matchSettings: {},
  bankCredentials: {},
}));

mock.module("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  asc: (col: unknown) => ({ asc: col }),
  desc: (col: unknown) => ({ desc: col }),
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  inArray: (col: unknown, vals: unknown) => ({ inArray: [col, vals] }),
  ne: (col: unknown, val: unknown) => ({ ne: [col, val] }),
  gte: (col: unknown, val: unknown) => ({ gte: [col, val] }),
  isNull: (col: unknown) => ({ isNull: col }),
  sql: Object.assign((s: TemplateStringsArray) => ({ sql: s[0] }), { raw: (s: string) => s }),
}));

mock.module("@/server/lib/transfers", () => ({
  matchCardPaymentIssuer: (description: string) =>
    description.includes("כ.א.ל") ? { issuer: "cal" } : null,
}));

const capturedCategoryUpdates: Array<{ id: number; categoryId: number }> = [];
const capturedCandidateIds: number[][] = [];

mock.module("@/server/db/queries/transactions", () => ({
  getMatchCandidates: () => [
    {
      id: 42,
      provider: "leumi",
      description: "תשלום לכ.א.ל",
      kind: "transfer",
    },
    {
      id: 77,
      provider: "cal",
      description: "רסטורנט",
      kind: "expense",
      processedDate: "2024-01-15",
    },
  ],
  batchUpdateCategories: (_workspaceId: number, updates: { id: number; categoryId: number }[]) => {
    for (const u of updates) capturedCategoryUpdates.push(u);
  },
}));

mock.module("@/server/db/queries/categories", () => ({
  getCategoryByName: (_workspaceId: number, name: string) =>
    name === "Credit Card" ? { id: fakeCreditCardCategoryId, name, kind: "expense" } : null,
}));

const connectedIssuersSeen: ReadonlySet<CardIssuer>[] = [];

mock.module("@/server/lib/matching", () => ({
  proposeEvents: (
    candidates: Array<{ id: number }>,
    _settings: unknown,
    options: { connectedCardIssuers: ReadonlySet<CardIssuer> },
  ) => {
    capturedCandidateIds.push(candidates.map((c) => c.id));
    connectedIssuersSeen.push(options.connectedCardIssuers);
    if (options.connectedCardIssuers.has("cal" as CardIssuer)) return [];
    return [
      {
        members: [{ transactionId: 42, role: "bill_payment", flipKindTo: "expense" }],
      },
    ];
  },
}));

import { reclassifyCardPayments } from "@/server/db/queries/financial-events";

describe("reclassifyCardPayments", () => {
  test("files the bill under Credit Card with no card connected, excludes it once the issuer connects", () => {
    capturedCategoryUpdates.length = 0;
    connectedIssuersSeen.length = 0;
    capturedCandidateIds.length = 0;

    reclassifyCardPayments(fakeWorkspaceId, new Set<CardIssuer>());
    expect(capturedCategoryUpdates).toEqual([{ id: 42, categoryId: fakeCreditCardCategoryId }]);
    expect(connectedIssuersSeen[0]?.has("cal")).toBe(false);

    capturedCategoryUpdates.length = 0;
    connectedIssuersSeen.length = 0;
    capturedCandidateIds.length = 0;

    reclassifyCardPayments(fakeWorkspaceId, new Set<CardIssuer>(["cal"]));
    expect(capturedCategoryUpdates).toHaveLength(0);
    expect(connectedIssuersSeen[0]?.has("cal")).toBe(true);
  });

  test("passes the full candidate set (including non-transfer purchases) to proposeEvents", () => {
    capturedCandidateIds.length = 0;

    reclassifyCardPayments(fakeWorkspaceId, new Set<CardIssuer>());

    expect(capturedCandidateIds[0]).toContain(77);
    expect(capturedCandidateIds[0]).toContain(42);
  });
});
