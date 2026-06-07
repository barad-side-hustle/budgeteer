import { NextResponse } from "next/server";
import { buildForecastPayload } from "@/server/insights/forecast-engine";
import { getAccountFilterFromRequest } from "@/server/lib/account-context";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const accountFilter = getAccountFilterFromRequest(request, workspaceId);
  return NextResponse.json(buildForecastPayload(workspaceId, new Date(), accountFilter));
}
