import "server-only";

import { matchesInternalTransfer } from "@/server/lib/transfers";

export interface TransferCandidate {
  id: number;
  credentialId: number | null;
  accountNumber: string;
  date: string;
  chargedAmount: number;
  chargedCurrency: string | null;
  description: string;
  kind: "expense" | "income" | "transfer";
}

export interface TransferPair {
  debitId: number;
  creditId: number;
}

interface PairOptions {
  epsilon?: number;
  dayWindow?: number;
}

const DEFAULT_EPSILON = 0.01;
const DEFAULT_DAY_WINDOW = 2;

function dayNumber(date: string): number {
  const ms = Date.parse(date.slice(0, 10));
  return Number.isNaN(ms) ? Number.NaN : Math.floor(ms / 86_400_000);
}

function isDifferentAccount(a: TransferCandidate, b: TransferCandidate): boolean {
  if (a.credentialId != null && b.credentialId != null && a.credentialId !== b.credentialId) {
    return true;
  }
  return a.accountNumber !== b.accountNumber;
}

function sameCurrency(a: TransferCandidate, b: TransferCandidate): boolean {
  return (a.chargedCurrency ?? null) === (b.chargedCurrency ?? null);
}

function sortKey(a: TransferCandidate, b: TransferCandidate): number {
  const amtA = Math.abs(a.chargedAmount);
  const amtB = Math.abs(b.chargedAmount);
  if (amtA !== amtB) return amtA - amtB;
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.id - b.id;
}

export function findInternalTransferPairs(
  rows: readonly TransferCandidate[],
  opts: PairOptions = {},
): TransferPair[] {
  const epsilon = opts.epsilon ?? DEFAULT_EPSILON;
  const dayWindow = opts.dayWindow ?? DEFAULT_DAY_WINDOW;

  const eligible = rows.filter((r) => r.kind !== "transfer" && r.chargedAmount !== 0);
  const debits = eligible.filter((r) => r.chargedAmount < 0).sort(sortKey);
  const credits = eligible.filter((r) => r.chargedAmount > 0).sort(sortKey);

  const usedCredits = new Set<number>();
  const pairs: TransferPair[] = [];

  for (const debit of debits) {
    let best: TransferCandidate | null = null;
    let bestGap = Number.POSITIVE_INFINITY;

    for (const credit of credits) {
      if (usedCredits.has(credit.id)) continue;
      if (!isDifferentAccount(debit, credit)) continue;
      if (!sameCurrency(debit, credit)) continue;
      if (Math.abs(Math.abs(debit.chargedAmount) - Math.abs(credit.chargedAmount)) > epsilon) {
        continue;
      }
      const gap = Math.abs(dayNumber(debit.date) - dayNumber(credit.date));
      if (Number.isNaN(gap) || gap > dayWindow) continue;
      if (
        !matchesInternalTransfer(debit.description) &&
        !matchesInternalTransfer(credit.description)
      ) {
        continue;
      }
      if (gap < bestGap) {
        best = credit;
        bestGap = gap;
      }
    }

    if (best) {
      usedCredits.add(best.id);
      pairs.push({ debitId: debit.id, creditId: best.id });
    }
  }

  return pairs;
}
