import { describe, expect, mock, test } from "bun:test";
import type { CardIssuer } from "@/server/lib/transfers";

const fakeWorkspaceId = 1;
const fakeCreditCardCategoryId = 99;

const mockGetOrm = mock();
const mockTransaction = mock();
const selectMock = mock();
const fromMock = mock();
const whereMock = mock();
const allMock = mock();
const getMock = mock();
const updateMock = mock();
const setMock = mock();
const deleteMock = mock();
const runMock = mock();
const insertMock = mock();
const returningMock = mock();
const onConflictMock = mock();

const transactionBuilder = {
  select: selectMock,
  update: updateMock,
  delete: deleteMock,
  insert: insertMock,
};

function makeChain(finalValue: unknown = []) {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    all: () => finalValue,
    get: () => finalValue,
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
    transaction: (fn: (tx: typeof transactionBuilder) => void) => fn(transactionBuilder),
    ...makeChain([]),
  }),
}));

mock.module("@/server/db/schema", () => ({
  financialEvents: {},
  eventMembers: {},
  transactions: {},
  matchSettings: {},
  bankCredentials: {},
}));

mock.module("@/server/lib/transfers", () => ({
  matchCardPaymentIssuer: (description: string) => {
    if (description.includes("כ.א.ל") || description.includes("cal")) {
      return { issuer: "cal" };
    }
    return null;
  },
  CARD_ISSUERS: ["amex", "behatsdaa", "beyahadBishvilha", "cal", "isracard", "max"],
  cardIssuerLabel: (issuer: string) => issuer,
  BANK_PROVIDERS_SET: new Set(),
  isBankProvider: () => false,
  matchesCreditCardPayment: () => false,
  matchesInternalTransfer: () => false,
  isAtmWithdrawal: () => false,
  detectKind: () => "expense",
}));

const capturedKindUpdates: Array<{ kind: string }> = [];
const capturedCategoryUpdates: Array<{ id: number; categoryId: number }> = [];

let getMatchCandidatesCalls = 0;
let connectedIssuersAtCall: ReadonlySet<CardIssuer>[] = [];

mock.module("@/server/db/queries/transactions", () => ({
  getMatchCandidates: (_workspaceId: number, _from: string) => {
    getMatchCandidatesCalls++;
    return [
      {
        id: 42,
        credentialId: null,
        accountNumber: "A1",
        provider: "leumi",
        date: "2026-05-10",
        chargedAmount: -2000,
        chargedCurrency: "ILS",
        description: "תשלום לכ.א.ל",
        kind: "transfer",
        dedupHash: "abc",
        dedupSequence: 0,
      },
    ];
  },
  batchUpdateCategories: (_workspaceId: number, updates: { id: number; categoryId: number }[]) => {
    for (const u of updates) capturedCategoryUpdates.push(u);
  },
}));

mock.module("@/server/db/queries/categories", () => ({
  getCategoryByName: (_workspaceId: number, name: string) => {
    if (name === "Credit Card") {
      return { id: fakeCreditCardCategoryId, name: "Credit Card", kind: "expense" };
    }
    return null;
  },
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

let lastProposeOptions: { connectedCardIssuers: ReadonlySet<CardIssuer> } | null = null;

mock.module("@/server/lib/matching", () => ({
  proposeEvents: (
    candidates: unknown[],
    _settings: unknown,
    options: { treatAtmAsTransfers: boolean; connectedCardIssuers: ReadonlySet<CardIssuer> },
  ) => {
    lastProposeOptions = options;
    connectedIssuersAtCall.push(options.connectedCardIssuers);

    if (options.connectedCardIssuers.has("cal" as CardIssuer)) {
      return [];
    }

    return [
      {
        eventType: "credit_card_payment",
        canonicalTransactionId: null,
        confidence: 0.99,
        reasons: ["matched cal payment"],
        eventKey: "ccpay-42",
        needsReview: false,
        members: [
          {
            transactionId: 42,
            role: "bill_payment",
            flipKindTo: "expense",
            priorKind: "transfer",
            grouping: true,
          },
        ],
      },
    ];
  },
}));

const eventSelectChain = makeChain([]);
const memberSelectChain = makeChain([]);

selectMock.mockImplementation(() => makeChain([]));
updateMock.mockImplementation(() => makeChain());
deleteMock.mockImplementation(() => makeChain());
insertMock.mockImplementation(() => makeChain());

import { reclassifyCardPayments } from "@/server/db/queries/financial-events";

describe("reclassifyCardPayments", () => {
  test("counts the bill as expense with no card, excludes it once the issuer connects", () => {
    capturedCategoryUpdates.length = 0;
    connectedIssuersAtCall.length = 0;

    reclassifyCardPayments(fakeWorkspaceId, new Set<CardIssuer>());

    expect(capturedCategoryUpdates).toHaveLength(1);
    expect(capturedCategoryUpdates[0]).toEqual({
      id: 42,
      categoryId: fakeCreditCardCategoryId,
    });

    capturedCategoryUpdates.length = 0;
    connectedIssuersAtCall.length = 0;

    reclassifyCardPayments(fakeWorkspaceId, new Set<CardIssuer>(["cal"]));

    expect(capturedCategoryUpdates).toHaveLength(0);
    expect(connectedIssuersAtCall[0]?.has("cal")).toBe(true);
  });
});
