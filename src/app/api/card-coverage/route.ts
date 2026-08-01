import { NextResponse } from "next/server";
import { listUncoveredCardBills } from "@/server/db/queries/card-coverage";
import { jerusalemToday } from "@/server/lib/date-utils";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

const LOOKBACK_DAYS = 120;

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const since = new Date(jerusalemToday());
  since.setDate(since.getDate() - LOOKBACK_DAYS);
  const sinceLocalDate = since.toISOString().slice(0, 10);

  return NextResponse.json(listUncoveredCardBills(workspaceId, sinceLocalDate));
}
