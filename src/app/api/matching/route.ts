import { NextResponse } from "next/server";
import { BANK_PROVIDERS } from "@/lib/types";
import { listBankAccounts } from "@/server/db/queries/bank-accounts";
import { getCardBillMatchingRows } from "@/server/db/queries/manual-card-bill-links";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const cardProviderIds = new Set<string>(
    BANK_PROVIDERS.filter((b) => b.kind === "card").map((b) => b.id),
  );
  const seen = new Set<string>();
  const cards = listBankAccounts(workspaceId)
    .filter(
      (a) =>
        cardProviderIds.has(a.provider) && !seen.has(a.accountNumber) && seen.add(a.accountNumber),
    )
    .map((a) => ({
      accountNumber: a.accountNumber,
      name: a.name,
      provider: a.provider,
    }));
  return NextResponse.json({ bills: getCardBillMatchingRows(workspaceId), cards });
}
