import "server-only";

import type { EventRole, EventType, MatchSettings } from "@/lib/types";
import { findInternalTransferPairs } from "@/server/lib/internal-transfers";
import {
  isAtmWithdrawal,
  isBankProvider,
  matchesCreditCardPayment,
  matchesInternalTransfer,
  type TransactionKind,
} from "@/server/lib/transfers";

export interface MatchCandidate {
  id: number;
  credentialId: number | null;
  accountNumber: string;
  provider: string;
  date: string;
  chargedAmount: number;
  chargedCurrency: string | null;
  description: string;
  kind: TransactionKind;
  dedupHash: string;
  dedupSequence: number;
}

export interface ProposedMember {
  transactionId: number;
  role: EventRole;
  flipKindTo: TransactionKind | null;
  priorKind: TransactionKind;
  grouping: boolean;
}

export interface ProposedEvent {
  eventType: EventType;
  members: ProposedMember[];
  canonicalTransactionId: number | null;
  confidence: number;
  reasons: string[];
  eventKey: string;
  needsReview: boolean;
}

export type MatchSettingsMap = Partial<Record<EventType, MatchSettings>>;

export interface ProposeOptions {
  treatAtmAsTransfers: boolean;
}

function dayNumber(date: string): number {
  const ms = Date.parse(date.slice(0, 10));
  return Number.isNaN(ms) ? Number.NaN : Math.floor(ms / 86_400_000);
}

function memberKey(c: MatchCandidate): string {
  return `${c.dedupHash}:${c.dedupSequence}`;
}

function eventKeyFor(eventType: EventType, members: MatchCandidate[]): string {
  const parts = members.map(memberKey).sort();
  return `${eventType}:${parts.join("|")}`;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function scoreInternalTransfer(
  debit: MatchCandidate,
  credit: MatchCandidate,
  settings: MatchSettings,
): { confidence: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0.5;

  const amtDiff = Math.abs(Math.abs(debit.chargedAmount) - Math.abs(credit.chargedAmount));
  const amount = Math.abs(debit.chargedAmount).toFixed(2);
  const currency = debit.chargedCurrency ?? "";
  if (amtDiff < 0.001) {
    score += 0.3;
    reasons.push(`Exact equal amount ${amount} ${currency} on two accounts`);
  } else {
    score += 0.2;
    reasons.push(`Near-equal amount ${amount} ${currency} (within ${settings.epsilon})`);
  }

  const gap = Math.abs(dayNumber(debit.date) - dayNumber(credit.date));
  if (gap === 0) {
    score += 0.15;
    reasons.push("Same day on both accounts");
  } else if (gap <= 1) {
    score += 0.1;
    reasons.push(`${gap} day apart`);
  } else {
    score += 0.05;
    reasons.push(`${gap} days apart`);
  }

  const debitKw = matchesInternalTransfer(debit.description);
  const creditKw = matchesInternalTransfer(credit.description);
  if (debitKw && creditKw) {
    score += 0.2;
    reasons.push("Transfer keyword on both sides");
  } else if (debitKw || creditKw) {
    score += 0.1;
    reasons.push("Transfer keyword on one side");
  }

  reasons.push("Opposite directions across different owned accounts");
  return { confidence: clamp01(score), reasons };
}

export function proposeEvents(
  candidates: readonly MatchCandidate[],
  settings: MatchSettingsMap,
  opts: ProposeOptions,
): ProposedEvent[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const used = new Set<number>();
  const events: ProposedEvent[] = [];

  const it = settings.internal_transfer;
  if (it?.enabled) {
    const pairs = findInternalTransferPairs(candidates, {
      epsilon: it.epsilon,
      dayWindow: it.dayWindow,
    });
    for (const { debitId, creditId } of pairs) {
      const debit = byId.get(debitId);
      const credit = byId.get(creditId);
      if (!debit || !credit) continue;
      const { confidence, reasons } = scoreInternalTransfer(debit, credit, it);
      events.push({
        eventType: "internal_transfer",
        members: [
          {
            transactionId: debit.id,
            role: "debit",
            flipKindTo: "transfer",
            priorKind: debit.kind,
            grouping: true,
          },
          {
            transactionId: credit.id,
            role: "credit",
            flipKindTo: "transfer",
            priorKind: credit.kind,
            grouping: true,
          },
        ],
        canonicalTransactionId: null,
        confidence,
        reasons,
        eventKey: eventKeyFor("internal_transfer", [debit, credit]),
        needsReview: true,
      });
      used.add(debit.id);
      used.add(credit.id);
    }
  }

  const cc = settings.credit_card_payment;
  if (cc?.enabled) {
    for (const cand of candidates) {
      if (used.has(cand.id)) continue;
      if (cand.kind !== "transfer") continue;
      if (!isBankProvider(cand.provider)) continue;
      if (!matchesCreditCardPayment(cand.description)) continue;
      events.push({
        eventType: "credit_card_payment",
        members: [
          {
            transactionId: cand.id,
            role: "bill_payment",
            flipKindTo: null,
            priorKind: cand.kind,
            grouping: true,
          },
        ],
        canonicalTransactionId: null,
        confidence: 0.9,
        reasons: [
          "Bank-side credit card bill payment (the individual card purchases are counted instead)",
        ],
        eventKey: eventKeyFor("credit_card_payment", [cand]),
        needsReview: false,
      });
      used.add(cand.id);
    }
  }

  const atm = settings.atm_withdrawal;
  if (opts.treatAtmAsTransfers && atm?.enabled) {
    for (const cand of candidates) {
      if (used.has(cand.id)) continue;
      if (cand.kind !== "expense") continue;
      if (!isAtmWithdrawal(cand.description)) continue;
      events.push({
        eventType: "atm_withdrawal",
        members: [
          {
            transactionId: cand.id,
            role: "debit",
            flipKindTo: "transfer",
            priorKind: cand.kind,
            grouping: true,
          },
        ],
        canonicalTransactionId: null,
        confidence: 0.95,
        reasons: ["ATM cash withdrawal (excluded from spend; cash is tracked manually)"],
        eventKey: eventKeyFor("atm_withdrawal", [cand]),
        needsReview: false,
      });
      used.add(cand.id);
    }
  }

  return events;
}
