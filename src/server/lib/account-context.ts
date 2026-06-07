import "server-only";

import { getBankAccountById } from "@/server/db/queries/bank-accounts";
import type { AccountFilter } from "@/server/db/queries/transactions";

const HEADER = "x-account-id";

export function getAccountFilterFromRequest(
  req: Request,
  workspaceId: number,
): AccountFilter | undefined {
  const header = req.headers.get(HEADER);
  if (!header) return undefined;
  const id = Number(header);
  if (!Number.isInteger(id) || id <= 0) return undefined;
  const account = getBankAccountById(workspaceId, id);
  if (!account) return undefined;
  return {
    accountKeys: [{ credentialId: account.credentialId, accountNumber: account.accountNumber }],
  };
}
