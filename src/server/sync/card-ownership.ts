import "server-only";

import { BANK_PROVIDERS } from "@/lib/types";

export interface CardClassification {
  ownerByAccount: Map<string, number>;
  shared: string[];
  newlyAdded: string[];
  existingOwn: string[];
}

export interface SyncCountResult {
  ok: boolean;
  provider: string;
  added: number;
  updated: number;
}

export function isCardIssuerProvider(provider: string): boolean {
  return BANK_PROVIDERS.find((b) => b.id === provider)?.kind === "card";
}

export function classifyScrapedCards(
  syncingCredentialId: number,
  scrapedAccountNumbers: readonly string[],
  priorOwnerByAccount: ReadonlyMap<string, number>,
): CardClassification {
  const result: CardClassification = {
    ownerByAccount: new Map<string, number>(),
    shared: [],
    newlyAdded: [],
    existingOwn: [],
  };
  const seen = new Set<string>();
  for (const accountNumber of scrapedAccountNumbers) {
    if (seen.has(accountNumber)) continue;
    seen.add(accountNumber);
    const priorOwner = priorOwnerByAccount.get(accountNumber);
    const owner = priorOwner ?? syncingCredentialId;
    result.ownerByAccount.set(accountNumber, owner);
    if (priorOwner === undefined) {
      result.newlyAdded.push(accountNumber);
    } else if (priorOwner === syncingCredentialId) {
      result.existingOwn.push(accountNumber);
    } else {
      result.shared.push(accountNumber);
    }
  }
  return result;
}

export function hasCardDataChange(results: readonly SyncCountResult[]): boolean {
  return results.some(
    (r) => r.ok && isCardIssuerProvider(r.provider) && r.added + r.updated > 0,
  );
}
