import "server-only";

import type { AccountOwnershipType, AccountSummary, BankAccount } from "@/lib/types";
import { getDb } from "@/server/db/index";

export const BANK_ACCOUNT_NAME_MAX_LENGTH = 128;

const OWNERSHIP_TYPES: readonly AccountOwnershipType[] = ["personal", "joint", "shared"];

export function isAccountOwnershipType(value: unknown): value is AccountOwnershipType {
  return typeof value === "string" && OWNERSHIP_TYPES.includes(value as AccountOwnershipType);
}

function normalizeAccountName(name: string, fallback: string): string {
  const trimmed = name.trim();
  const value = trimmed || fallback;
  return value.slice(0, BANK_ACCOUNT_NAME_MAX_LENGTH);
}

interface BankAccountRow {
  id: number;
  credential_id: number;
  provider: string;
  account_number: string;
  name: string;
  ownership_type: string;
  balance: number | null;
  balance_currency: string | null;
  balance_updated_at: string | null;
  group_key: string | null;
  group_name: string | null;
  created_at: string;
  updated_at: string;
}

function mapBankAccountRow(row: BankAccountRow): BankAccount {
  return {
    id: row.id,
    credentialId: row.credential_id,
    provider: row.provider,
    accountNumber: row.account_number,
    name: row.name,
    ownershipType: isAccountOwnershipType(row.ownership_type) ? row.ownership_type : "personal",
    balance: row.balance,
    balanceCurrency: row.balance_currency,
    balanceUpdatedAt: row.balance_updated_at,
    groupKey: row.group_key,
    groupName: row.group_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const BANK_ACCOUNT_SELECT = `
  SELECT ba.id, ba.credential_id, bc.provider, ba.account_number, ba.name,
         ba.ownership_type, ba.balance, ba.balance_currency, ba.balance_updated_at,
         ba.group_key, ba.group_name, ba.created_at, ba.updated_at
  FROM bank_accounts ba
  JOIN bank_credentials bc ON ba.credential_id = bc.id`;

interface UpsertOptions {
  balance?: number;
  balanceCurrency?: string;
  groupKey?: string;
  groupName?: string;
}

export function upsertBankAccount(
  workspaceId: number,
  credentialId: number,
  accountNumber: string,
  options: UpsertOptions = {},
): void {
  const db = getDb();
  const groupKey = options.groupKey ?? null;
  const groupName = options.groupName ?? null;

  if (options.balance != null) {
    db.prepare(
      `INSERT INTO bank_accounts
         (workspace_id, credential_id, account_number, name, balance, balance_currency, balance_updated_at, group_key, group_name)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
       ON CONFLICT(workspace_id, credential_id, account_number) DO UPDATE SET
         balance = excluded.balance,
         balance_currency = excluded.balance_currency,
         balance_updated_at = excluded.balance_updated_at,
         group_key = COALESCE(excluded.group_key, bank_accounts.group_key),
         group_name = COALESCE(excluded.group_name, bank_accounts.group_name),
         updated_at = datetime('now')`,
    ).run(
      workspaceId,
      credentialId,
      accountNumber,
      accountNumber,
      options.balance,
      options.balanceCurrency ?? "ILS",
      groupKey,
      groupName,
    );
    return;
  }

  db.prepare(
    `INSERT INTO bank_accounts (workspace_id, credential_id, account_number, name, group_key, group_name)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, credential_id, account_number) DO UPDATE SET
       group_key = COALESCE(excluded.group_key, bank_accounts.group_key),
       group_name = COALESCE(excluded.group_name, bank_accounts.group_name),
       updated_at = datetime('now')`,
  ).run(workspaceId, credentialId, accountNumber, accountNumber, groupKey, groupName);
}

export function listBankAccounts(workspaceId: number): BankAccount[] {
  const rows = getDb()
    .prepare(`${BANK_ACCOUNT_SELECT} WHERE ba.workspace_id = ? ORDER BY bc.provider, ba.name`)
    .all(workspaceId) as BankAccountRow[];
  return rows.map(mapBankAccountRow);
}

export function listBankAccountsByCredential(
  workspaceId: number,
  credentialId: number,
): BankAccount[] {
  const rows = getDb()
    .prepare(
      `${BANK_ACCOUNT_SELECT}
       WHERE ba.workspace_id = ? AND ba.credential_id = ?
       ORDER BY ba.name`,
    )
    .all(workspaceId, credentialId) as BankAccountRow[];
  return rows.map(mapBankAccountRow);
}

export function getBankAccountById(workspaceId: number, id: number): BankAccount | null {
  const row = getDb()
    .prepare(`${BANK_ACCOUNT_SELECT} WHERE ba.workspace_id = ? AND ba.id = ?`)
    .get(workspaceId, id) as BankAccountRow | undefined;
  return row ? mapBankAccountRow(row) : null;
}

interface UpdateBankAccountInput {
  name?: string;
  ownershipType?: AccountOwnershipType;
}

export function updateBankAccount(
  workspaceId: number,
  id: number,
  input: UpdateBankAccountInput,
): BankAccount | null {
  const existing = getBankAccountById(workspaceId, id);
  if (!existing) return null;

  const name =
    input.name !== undefined ? normalizeAccountName(input.name, existing.accountNumber) : undefined;
  const ownershipType = input.ownershipType;

  if (name === undefined && ownershipType === undefined) return existing;

  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (name !== undefined) {
    sets.push("name = ?");
    values.push(name);
  }
  if (ownershipType !== undefined) {
    sets.push("ownership_type = ?");
    values.push(ownershipType);
  }
  sets.push("updated_at = datetime('now')");

  getDb()
    .prepare(`UPDATE bank_accounts SET ${sets.join(", ")} WHERE workspace_id = ? AND id = ?`)
    .run(...values, workspaceId, id);

  return getBankAccountById(workspaceId, id);
}

interface AccountSummaryRow extends BankAccountRow {
  income: number;
  expense: number;
  transaction_count: number;
}

export function getAccountSummaries(
  workspaceId: number,
  from: string,
  to: string,
): AccountSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT ba.id, ba.credential_id, bc.provider, ba.account_number, ba.name,
              ba.ownership_type, ba.balance, ba.balance_currency, ba.balance_updated_at,
              ba.group_key, ba.group_name, ba.created_at, ba.updated_at,
              COALESCE(SUM(CASE WHEN t.kind = 'income' THEN t.charged_amount ELSE 0 END), 0) AS income,
              COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN -t.charged_amount ELSE 0 END), 0) AS expense,
              COUNT(t.id) AS transaction_count
       FROM bank_accounts ba
       JOIN bank_credentials bc ON ba.credential_id = bc.id
       LEFT JOIN transactions t
         ON t.workspace_id = ba.workspace_id
         AND t.credential_id = ba.credential_id
         AND t.account_number = ba.account_number
         AND t.status = 'completed'
         AND t.is_excluded = 0
         AND t.date >= ? AND t.date <= ?
       WHERE ba.workspace_id = ?
       GROUP BY ba.id
       ORDER BY bc.provider, ba.name`,
    )
    .all(from, to, workspaceId) as AccountSummaryRow[];

  return rows.map((row) => ({
    ...mapBankAccountRow(row),
    income: row.income,
    expense: row.expense,
    net: row.income - row.expense,
    transactionCount: row.transaction_count,
  }));
}
