import { NextResponse } from "next/server";
import { buildInsightPayload } from "@/server/insights/engine";
import { getAccountFilterFromRequest } from "@/server/lib/account-context";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { getNextRunAt } from "@/server/sync/scheduler";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const accountFilter = getAccountFilterFromRequest(request, workspaceId);
  const payload = buildInsightPayload(workspaceId, new Date(), accountFilter);
  payload.nextScheduledSync = getNextRunAt();
  return NextResponse.json(payload);
}
