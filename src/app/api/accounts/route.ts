import { NextResponse } from "next/server";
import { getAccountSummaries, listBankAccounts } from "@/server/db/queries/bank-accounts";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // With a date range, return per-account spend aggregates for the dashboard
  // cards; otherwise just the account list (for filters and settings).
  if (from && to) {
    return NextResponse.json(getAccountSummaries(workspaceId, from, to));
  }

  return NextResponse.json(listBankAccounts(workspaceId));
}
