import "server-only";

import { selectionStringToKeys } from "@/lib/account-group";
import { listBankAccounts } from "@/server/db/queries/bank-accounts";
import type { AccountFilter } from "@/server/db/queries/transactions";

const HEADER = "x-account-sel";

export function getAccountFilterFromRequest(
  req: Request,
  workspaceId: number,
): AccountFilter | undefined {
  const header = req.headers.get(HEADER);
  if (!header) return undefined;
  const accountKeys = selectionStringToKeys(listBankAccounts(workspaceId), header);
  if (accountKeys.length === 0) return undefined;
  return { accountKeys };
}
