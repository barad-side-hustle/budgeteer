import type { BankAccount } from "@/lib/types";

export interface RawBillingAccount {
  originalBankCode: number | string;
  bankBranchNum: string;
  bankAccountNum: string;
  bankName?: string;
}

export function formatBillingAccountKey(billing: RawBillingAccount): string {
  return `${billing.originalBankCode}-${billing.bankBranchNum}-${billing.bankAccountNum}`;
}

type GroupableAccount = Pick<BankAccount, "groupKey" | "accountNumber">;

export function effectiveGroupKey(account: GroupableAccount): string {
  return account.groupKey ?? account.accountNumber;
}

export interface AccountGroup {
  groupKey: string;
  credentialId: number;
  provider: string;
  name: string;
  grouped: boolean;
  members: BankAccount[];
}

export function groupAccountsForFilter(accounts: BankAccount[]): AccountGroup[] {
  const byKey = new Map<string, AccountGroup>();
  const result: AccountGroup[] = [];
  for (const account of accounts) {
    const key = `${account.credentialId}::${effectiveGroupKey(account)}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.members.push(account);
      continue;
    }
    const group: AccountGroup = {
      groupKey: effectiveGroupKey(account),
      credentialId: account.credentialId,
      provider: account.provider,
      name: account.groupName ?? account.name,
      grouped: account.groupKey != null,
      members: [account],
    };
    byKey.set(key, group);
    result.push(group);
  }
  return result;
}

export interface AccountKey {
  credentialId: number;
  accountNumber: string;
}

export type ParsedSelection =
  | { kind: "account"; id: number }
  | { kind: "group"; credentialId: number; groupKey: string };

export function accountSelectionValue(accountId: number): string {
  return `a:${accountId}`;
}

export function groupSelectionValue(credentialId: number, groupKey: string): string {
  return `g:${credentialId}:${groupKey}`;
}

export function parseAccountSelection(raw: string): ParsedSelection | null {
  if (raw.startsWith("a:")) {
    const id = Number(raw.slice(2));
    return Number.isInteger(id) && id > 0 ? { kind: "account", id } : null;
  }
  if (raw.startsWith("g:")) {
    const rest = raw.slice(2);
    const sep = rest.indexOf(":");
    if (sep <= 0) return null;
    const credentialId = Number(rest.slice(0, sep));
    const groupKey = rest.slice(sep + 1);
    return Number.isInteger(credentialId) && credentialId > 0 && groupKey.length > 0
      ? { kind: "group", credentialId, groupKey }
      : null;
  }
  return null;
}

export function selectionToKeys(accounts: BankAccount[], raw: string): AccountKey[] {
  const selection = parseAccountSelection(raw);
  if (!selection) return [];
  if (selection.kind === "account") {
    const account = accounts.find((candidate) => candidate.id === selection.id);
    return account
      ? [{ credentialId: account.credentialId, accountNumber: account.accountNumber }]
      : [];
  }
  return accounts
    .filter(
      (account) =>
        account.credentialId === selection.credentialId &&
        effectiveGroupKey(account) === selection.groupKey,
    )
    .map((account) => ({
      credentialId: account.credentialId,
      accountNumber: account.accountNumber,
    }));
}
