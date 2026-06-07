import "server-only";

import { applyProposedEvents, getMatchSettingsMap } from "@/server/db/queries/financial-events";
import { getMatchCandidates } from "@/server/db/queries/transactions";
import { proposeEvents } from "@/server/lib/matching";

export function runMatchingStep(
  workspaceId: number,
  fromDate: string,
  treatAtmAsTransfers: boolean,
): void {
  const candidates = getMatchCandidates(workspaceId, fromDate);
  if (candidates.length === 0) return;
  const settings = getMatchSettingsMap(workspaceId);
  const proposals = proposeEvents(candidates, settings, { treatAtmAsTransfers });
  applyProposedEvents(workspaceId, proposals);
}
