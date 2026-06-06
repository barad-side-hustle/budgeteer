import { NextResponse } from "next/server";
import { listBankCredentials } from "@/server/db/queries/bank-credentials";
import { getCredentialStats } from "@/server/db/queries/sync-runs";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const creds = listBankCredentials(workspaceId);
  const items = creds.map((c) => {
    const stats = getCredentialStats(workspaceId, c.id, c.provider);
    return {
      id: c.id,
      provider: c.provider,
      label: c.label,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      lastSyncAt: stats.lastSyncAt,
      transactionCount: stats.transactionCount,
      requiresManualTwoFactor: c.requiresManualTwoFactor,
      hasTwoFactorToken: c.hasTwoFactorToken,
    };
  });
  return NextResponse.json(items);
}
