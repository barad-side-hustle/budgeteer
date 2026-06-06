import { NextResponse } from "next/server";
import { getReviewTransactions } from "@/server/db/queries/transactions";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json({ transactions: getReviewTransactions(workspaceId) });
}
