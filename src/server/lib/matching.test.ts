import { describe, expect, test } from "bun:test";

import type { MatchSettings } from "@/lib/types";
import {
  buildCardBillingGroups,
  type CardBillingGroup,
  type MatchCandidate,
  type MatchSettingsMap,
  matchBillToGroup,
  proposeEvents,
} from "@/server/lib/matching";
import type { CardIssuer } from "@/server/lib/transfers";

const noCards = new Set<CardIssuer>();
const withCal = new Set<CardIssuer>(["cal"]);

function cand(p: Partial<MatchCandidate> & { id: number }): MatchCandidate {
  return {
    credentialId: null,
    accountNumber: "A",
    provider: "leumi",
    date: "2026-05-01",
    processedDate: "2026-05-01",
    chargedAmount: -100,
    chargedCurrency: "ILS",
    description: "העברה",
    kind: "expense",
    dedupHash: `h${p.id}`,
    dedupSequence: 0,
    ...p,
  };
}

function setting(eventType: MatchSettings["eventType"], enabled = true): MatchSettings {
  return {
    eventType,
    epsilon: 0.01,
    dayWindow: 2,
    minScore: 0.8,
    autoScore: 0.97,
    requireKeyword: true,
    enabled,
  };
}

const SETTINGS: MatchSettingsMap = {
  internal_transfer: setting("internal_transfer"),
  credit_card_payment: setting("credit_card_payment"),
  atm_withdrawal: setting("atm_withdrawal"),
};

const NO_ATM = { treatAtmAsTransfers: false, connectedCardIssuers: noCards };
const WITH_ATM = { treatAtmAsTransfers: true, connectedCardIssuers: noCards };

describe("proposeEvents", () => {
  test("groups an internal transfer into one event with two grouping legs", () => {
    const events = proposeEvents(
      [
        cand({ id: 1, accountNumber: "A", chargedAmount: -1500, description: "העברה לחשבון" }),
        cand({
          id: 2,
          accountNumber: "B",
          chargedAmount: 1500,
          kind: "income",
          date: "2026-05-02",
        }),
      ],
      SETTINGS,
      NO_ATM,
    );
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.eventType).toBe("internal_transfer");
    expect(e.needsReview).toBe(true);
    expect(e.canonicalTransactionId).toBeNull();
    expect(e.confidence).toBeGreaterThanOrEqual(0.8);
    expect(e.reasons.length).toBeGreaterThan(0);
    const roles = e.members.map((m) => m.role).sort();
    expect(roles).toEqual(["credit", "debit"]);
    expect(e.members.every((m) => m.flipKindTo === "transfer" && m.grouping)).toBe(true);
  });

  test("event_key is deterministic and independent of member ordering", () => {
    const a = cand({ id: 1, accountNumber: "A", chargedAmount: -1500, description: "העברה" });
    const b = cand({ id: 2, accountNumber: "B", chargedAmount: 1500, kind: "income" });
    const e1 = proposeEvents([a, b], SETTINGS, NO_ATM)[0];
    const e2 = proposeEvents([b, a], SETTINGS, NO_ATM)[0];
    expect(e1.eventKey).toBe(e2.eventKey);
    expect(e1.eventKey.startsWith("internal_transfer:")).toBe(true);
  });

  test("counts a bank card bill as spend when no card is connected", () => {
    const events = proposeEvents(
      [cand({ id: 5, provider: "hapoalim", kind: "transfer", description: "חיוב ויזה" })],
      SETTINGS,
      { treatAtmAsTransfers: false, connectedCardIssuers: noCards },
    );
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("credit_card_payment");
    expect(events[0].members[0].role).toBe("bill_payment");
    expect(events[0].members[0].flipKindTo).toBe("expense");
    expect(events[0].needsReview).toBe(false);
  });

  test("counts a connected-issuer bill with no matching statement as spend for review", () => {
    const events = proposeEvents(
      [cand({ id: 5, provider: "leumi", kind: "transfer", description: "תשלום לכ.א.ל" })],
      SETTINGS,
      { treatAtmAsTransfers: false, connectedCardIssuers: withCal },
    );
    expect(events).toHaveLength(1);
    expect(events[0].members[0].flipKindTo).toBe("expense");
    expect(events[0].needsReview).toBe(true);
  });

  test("counts a bill payment when a different issuer is connected", () => {
    const events = proposeEvents(
      [cand({ id: 5, provider: "leumi", kind: "transfer", description: "מקסימום" })],
      SETTINGS,
      { treatAtmAsTransfers: false, connectedCardIssuers: withCal },
    );
    expect(events[0].members[0].flipKindTo).toBe("expense");
    expect(events[0].needsReview).toBe(false);
  });

  test("counts an ambiguous bill as spend when no card is connected", () => {
    const events = proposeEvents(
      [cand({ id: 6, provider: "leumi", kind: "transfer", description: "חיוב ויזה" })],
      SETTINGS,
      { treatAtmAsTransfers: false, connectedCardIssuers: noCards },
    );
    expect(events[0].members[0].flipKindTo).toBe("expense");
    expect(events[0].needsReview).toBe(false);
  });

  test("does not wrap card payments from a non-bank provider", () => {
    const events = proposeEvents(
      [cand({ id: 5, provider: "isracard", kind: "transfer", description: "ויזה" })],
      SETTINGS,
      { treatAtmAsTransfers: false, connectedCardIssuers: noCards },
    );
    expect(events).toHaveLength(0);
  });

  test("ATM withdrawals only become events when cash is tracked manually", () => {
    const rows = [cand({ id: 9, chargedAmount: -400, description: "משיכת מזומן כספומט" })];
    expect(proposeEvents(rows, SETTINGS, NO_ATM)).toHaveLength(0);
    const withAtm = proposeEvents(rows, SETTINGS, WITH_ATM);
    expect(withAtm).toHaveLength(1);
    expect(withAtm[0].eventType).toBe("atm_withdrawal");
    expect(withAtm[0].members[0].flipKindTo).toBe("transfer");
  });

  test("a leg claimed by a transfer is not also claimed as a card payment", () => {
    const events = proposeEvents(
      [
        cand({ id: 1, accountNumber: "A", chargedAmount: -1500, description: "העברה ויזה" }),
        cand({
          id: 2,
          accountNumber: "B",
          chargedAmount: 1500,
          kind: "income",
          description: "העברה",
        }),
      ],
      SETTINGS,
      NO_ATM,
    );
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("internal_transfer");
  });

  test("disabled settings suppress the matcher", () => {
    const events = proposeEvents(
      [
        cand({ id: 1, accountNumber: "A", chargedAmount: -1500, description: "העברה" }),
        cand({ id: 2, accountNumber: "B", chargedAmount: 1500, kind: "income" }),
      ],
      { internal_transfer: setting("internal_transfer", false) },
      NO_ATM,
    );
    expect(events).toHaveLength(0);
  });
});

const purchase = (over: Partial<MatchCandidate>): MatchCandidate => ({
  id: 0,
  credentialId: 8,
  accountNumber: "8682",
  provider: "cal",
  date: "2026-05-12T00:00:00.000Z",
  processedDate: "2026-06-09T00:00:00.000Z",
  chargedAmount: -100,
  chargedCurrency: "ILS",
  description: "x",
  kind: "expense",
  dedupHash: "h",
  dedupSequence: 0,
  ...over,
});

describe("buildCardBillingGroups", () => {
  test("groups a connected card's purchases by processed-date into a summed group", () => {
    const groups = buildCardBillingGroups(
      [
        purchase({ id: 1, chargedAmount: -102 }),
        purchase({ id: 2, chargedAmount: -17.9 }),
        purchase({ id: 3, processedDate: "2026-07-09T00:00:00.000Z", chargedAmount: -50 }),
      ],
      new Set<CardIssuer>(["cal"]),
    );
    const june = groups.find(
      (g) => g.billingDay === Math.floor(Date.parse("2026-06-09") / 86_400_000),
    );
    expect(june?.amount).toBeCloseTo(119.9, 2);
    expect(june?.accountNumber).toBe("8682");
    expect(june?.transactionIds.sort()).toEqual([1, 2]);
  });

  test("ignores purchases from issuers that are not connected", () => {
    const groups = buildCardBillingGroups(
      [purchase({ id: 1, provider: "max", chargedAmount: -102 })],
      new Set<CardIssuer>(["cal"]),
    );
    expect(groups).toHaveLength(0);
  });

  test("keeps cards apart even on the same billing day", () => {
    const groups = buildCardBillingGroups(
      [
        purchase({ id: 1, accountNumber: "8682", chargedAmount: -100 }),
        purchase({ id: 2, accountNumber: "2315", chargedAmount: -200 }),
      ],
      new Set<CardIssuer>(["cal"]),
    );
    expect(groups).toHaveLength(2);
  });
});

const group = (over: Partial<CardBillingGroup>): CardBillingGroup => ({
  credentialId: 8,
  accountNumber: "8682",
  issuer: "cal",
  billingDay: Math.floor(Date.parse("2026-06-09") / 86_400_000),
  amount: 119.9,
  transactionIds: [1, 2],
  ...over,
});

describe("matchBillToGroup", () => {
  const billDay = "2026-06-10T00:00:00.000Z";

  test("matches on equal amount within the +/-2 day window", () => {
    expect(matchBillToGroup(119.9, billDay, [group({})])?.accountNumber).toBe("8682");
  });

  test("no match when amount differs", () => {
    expect(matchBillToGroup(120.5, billDay, [group({})])).toBeNull();
  });

  test("no match when the date is too far", () => {
    expect(matchBillToGroup(119.9, "2026-06-20T00:00:00.000Z", [group({})])).toBeNull();
  });

  test("ambiguous (two groups, same amount and day) returns null", () => {
    expect(
      matchBillToGroup(119.9, billDay, [
        group({ accountNumber: "8682" }),
        group({ accountNumber: "2315" }),
      ]),
    ).toBeNull();
  });
});

describe("card statement matching", () => {
  const billCand = (over: Partial<MatchCandidate> & { id: number }): MatchCandidate =>
    cand({ provider: "leumi", kind: "transfer", ...over });

  test("a generic bill that equals a connected card's cycle becomes a covered statement", () => {
    const events = proposeEvents(
      [
        billCand({
          id: 10,
          chargedAmount: -119.9,
          date: "2026-06-10T00:00:00.000Z",
          description: "כרטיסי אשראי",
        }),
        purchase({ id: 1, chargedAmount: -102, processedDate: "2026-06-09T00:00:00.000Z" }),
        purchase({ id: 2, chargedAmount: -17.9, processedDate: "2026-06-09T00:00:00.000Z" }),
      ],
      SETTINGS,
      { treatAtmAsTransfers: false, connectedCardIssuers: withCal },
    );
    const ev = events.find((e) => e.eventType === "credit_card_statement");
    expect(ev).toBeTruthy();
    const bill = ev?.members.find((m) => m.role === "bill_payment");
    expect(bill?.transactionId).toBe(10);
    expect(bill?.flipKindTo).toBe("transfer");
    expect(
      ev?.members
        .filter((m) => m.role === "purchase")
        .map((m) => m.transactionId)
        .sort(),
    ).toEqual([1, 2]);
  });

  test("an unmatched generic bill is a Credit Card cost flagged for review", () => {
    const events = proposeEvents(
      [
        billCand({
          id: 11,
          chargedAmount: -8411.42,
          date: "2026-06-01T00:00:00.000Z",
          description: "כרטיסי אשראי",
        }),
      ],
      SETTINGS,
      { treatAtmAsTransfers: false, connectedCardIssuers: withCal },
    );
    const ev = events.find((e) => e.eventType === "credit_card_payment");
    expect(ev?.members[0].flipKindTo).toBe("expense");
    expect(ev?.needsReview).toBe(true);
  });

  test("a named not-connected issuer is a cost without review", () => {
    const events = proposeEvents(
      [billCand({ id: 12, chargedAmount: -1759.7, description: "מקס איט פיננ" })],
      SETTINGS,
      { treatAtmAsTransfers: false, connectedCardIssuers: withCal },
    );
    const ev = events.find((e) => e.eventType === "credit_card_payment");
    expect(ev?.members[0].flipKindTo).toBe("expense");
    expect(ev?.needsReview).toBe(false);
  });

  test("a second bill matching an already-consumed statement is a cost, not an empty statement", () => {
    const events = proposeEvents(
      [
        billCand({
          id: 10,
          chargedAmount: -119.9,
          date: "2026-06-10T00:00:00.000Z",
          description: "כרטיסי אשראי",
        }),
        billCand({
          id: 11,
          chargedAmount: -119.9,
          date: "2026-06-10T00:00:00.000Z",
          description: "כרטיסי אשראי",
        }),
        purchase({ id: 1, chargedAmount: -102, processedDate: "2026-06-09T00:00:00.000Z" }),
        purchase({ id: 2, chargedAmount: -17.9, processedDate: "2026-06-09T00:00:00.000Z" }),
      ],
      SETTINGS,
      { treatAtmAsTransfers: false, connectedCardIssuers: withCal },
    );
    const statements = events.filter((e) => e.eventType === "credit_card_statement");
    expect(statements).toHaveLength(1);
    expect(statements[0].members.filter((m) => m.role === "purchase")).toHaveLength(2);
    const costs = events.filter((e) => e.eventType === "credit_card_payment");
    expect(costs).toHaveLength(1);
    expect(costs[0].members[0].flipKindTo).toBe("expense");
  });
});
