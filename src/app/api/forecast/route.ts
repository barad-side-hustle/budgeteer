import { NextResponse } from "next/server";
import { buildForecastPayload } from "@/server/insights/forecast-engine";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json(buildForecastPayload(workspaceId, new Date()));
}
