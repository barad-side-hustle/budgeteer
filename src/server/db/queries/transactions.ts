import "server-only";

import { and, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { isTransactionSortField, TRANSACTION_SORT_SQL } from "@/lib/transaction-sort";
import type {
  CategoryBreakdown,
  MerchantSummary,
  MonthlySummary,
  TransactionWithCategory,
} from "@/lib/types";
import { getDb } from "@/server/db/index";
import { getOrm } from "@/server/db/orm";
import { transactions as transactionsTable } from "@/server/db/schema";
import { toJerusalemDate } from "@/server/lib/date-utils";
import { computeDedupHash } from "@/server/lib/dedup";
import type { MatchCandidate } from "@/server/lib/matching";
import { detectKind } from "@/server/lib/transfers";
export type TransactionKindFilter = "expense" | "income" | "all";

interface RawTransaction {
  accountNumber: string;
  date: string;
  processedDate: string;
  originalAmount: number;
  originalCurrency: string;
  chargedAmount: number;
  chargedCurrency?: string;
  description: string;
  memo?: string;
  type: "normal" | "installments";
  status: "completed" | "pending";
  identifier?: string | number;
  installmentNumber?: number;
  installmentTotal?: number;
}

interface InsertResult {
  added: number;
  updated: number;
}

export function insertTransactions(
  workspaceId: number,
  transactions: RawTransaction[],
  provider: string,
  credentialId: number,
  syncRunId: number,
): InsertResult {
  const db = getDb();
  let added = 0;
  let updated = 0;

  const hashCounts = new Map<string, number>();

  const existingCountStmt = db.prepare(
    "SELECT COUNT(*) as count FROM transactions WHERE workspace_id = ? AND dedup_hash = ?",
  );

  const insertStmt = db.prepare(`
    INSERT INTO transactions (
      workspace_id, account_number, date, processed_date, local_date, original_amount, original_currency,
      charged_amount, charged_currency, description, memo, type, status,
      identifier, installment_number, installment_total, provider, credential_id,
      sync_run_id, dedup_hash, dedup_sequence, kind
    ) VALUES (
      @workspaceId, @accountNumber, @date, @processedDate, @localDate, @originalAmount, @originalCurrency,
      @chargedAmount, @chargedCurrency, @description, @memo, @type, @status,
      @identifier, @installmentNumber, @installmentTotal, @provider, @credentialId,
      @syncRunId, @dedupHash, @dedupSequence, @kind
    )
    ON CONFLICT(workspace_id, dedup_hash, dedup_sequence) DO UPDATE SET
      status = CASE WHEN transactions.status = 'pending' THEN excluded.status ELSE transactions.status END,
      charged_amount = CASE WHEN transactions.status = 'pending' THEN excluded.charged_amount ELSE transactions.charged_amount END,
      processed_date = CASE WHEN transactions.status = 'pending' THEN excluded.processed_date ELSE transactions.processed_date END,
      local_date = CASE WHEN transactions.status = 'pending' THEN excluded.local_date ELSE transactions.local_date END,
      kind = transactions.kind,
      updated_at = CASE WHEN transactions.status = 'pending' THEN datetime('now') ELSE transactions.updated_at END
  `);

  const batchInsert = db.transaction(() => {
    for (const txn of transactions) {
      const hash = computeDedupHash({
        accountNumber: txn.accountNumber,
        date: txn.date,
        originalAmount: txn.originalAmount,
        originalCurrency: txn.originalCurrency,
        description: txn.description,
        identifier: txn.identifier,
        installmentNumber: txn.installmentNumber,
        installmentTotal: txn.installmentTotal,
      });

      const batchCount = (hashCounts.get(hash) ?? 0) + 1;
      hashCounts.set(hash, batchCount);

      const { count: existingCount } = existingCountStmt.get(workspaceId, hash) as {
        count: number;
      };

      const sequence = batchCount - 1;
      const kind = detectKind(txn.description, provider, txn.chargedAmount);

      const params = {
        workspaceId,
        accountNumber: txn.accountNumber,
        date: txn.date,
        localDate: toJerusalemDate(txn.date),
        processedDate: txn.processedDate,
        originalAmount: txn.originalAmount,
        originalCurrency: txn.originalCurrency,
        chargedAmount: txn.chargedAmount,
        chargedCurrency: txn.chargedCurrency ?? null,
        description: txn.description,
        memo: txn.memo ?? null,
        type: txn.type,
        status: txn.status,
        identifier: txn.identifier != null ? String(txn.identifier) : null,
        installmentNumber: txn.installmentNumber ?? null,
        installmentTotal: txn.installmentTotal ?? null,
        provider,
        credentialId,
        syncRunId: syncRunId,
        dedupHash: hash,
        dedupSequence: sequence,
        kind,
      };

      if (batchCount > existingCount) {
        insertStmt.run(params);
        added++;
      } else {
        const result = insertStmt.run(params);
        if (result.changes > 0) {
          updated++;
        }
      }
    }
  });

  batchInsert();
  return { added, updated };
}

interface QueryParams {
  from?: string;
  to?: string;
  search?: string;
  category?: number;
  categoryIds?: number[];
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
  kind?: TransactionKindFilter;
  provider?: string;
  credentialId?: number;
  credentialIds?: number[];
  accountKeys?: AccountKey[];
}

export interface AccountKey {
  credentialId: number;
  accountNumber: string;
}

export interface AccountFilter {
  credentialIds?: number[];
  accountKeys?: AccountKey[];
}

function appendCredentialIdsFilter(
  conditions: string[],
  values: (string | number)[],
  credentialIds: number[] | undefined,
  columnPrefix = "",
): void {
  if (!credentialIds || credentialIds.length === 0) return;
  const col = `${columnPrefix}credential_id`;
  const placeholders = credentialIds.map(() => "?").join(",");
  conditions.push(`${col} IN (${placeholders})`);
  for (const id of credentialIds) values.push(id);
}

function appendAccountKeysFilter(
  conditions: string[],
  values: (string | number)[],
  accountKeys: AccountKey[] | undefined,
  columnPrefix = "",
): void {
  if (!accountKeys || accountKeys.length === 0) return;
  const credCol = `${columnPrefix}credential_id`;
  const acctCol = `${columnPrefix}account_number`;
  const clauses = accountKeys.map(() => `(${credCol} = ? AND ${acctCol} = ?)`);
  conditions.push(`(${clauses.join(" OR ")})`);
  for (const key of accountKeys) values.push(key.credentialId, key.accountNumber);
}

function appendAccountFilter(
  conditions: string[],
  values: (string | number)[],
  filter: { credentialIds?: number[]; accountKeys?: AccountKey[] },
  columnPrefix = "",
): void {
  if (filter.accountKeys && filter.accountKeys.length > 0) {
    appendAccountKeysFilter(conditions, values, filter.accountKeys, columnPrefix);
  } else {
    appendCredentialIdsFilter(conditions, values, filter.credentialIds, columnPrefix);
  }
}

export function buildAccountFilterClause(
  filter: AccountFilter | undefined,
  columnPrefix = "",
): { sql: string; values: (string | number)[] } {
  if (!filter) return { sql: "", values: [] };
  const conditions: string[] = [];
  const values: (string | number)[] = [];
  appendAccountFilter(conditions, values, filter, columnPrefix);
  if (conditions.length === 0) return { sql: "", values: [] };
  return { sql: ` AND ${conditions.join(" AND ")}`, values };
}

function resolveSortSql(sort: string | undefined): string {
  if (isTransactionSortField(sort)) {
    return TRANSACTION_SORT_SQL[sort];
  }
  return TRANSACTION_SORT_SQL.date;
}

const TRANSACTION_LIST_FROM = `
  FROM transactions t
  LEFT JOIN categories c ON t.category_id = c.id
  LEFT JOIN bank_credentials bc ON t.credential_id = bc.id
  LEFT JOIN bank_accounts ba ON ba.workspace_id = t.workspace_id
    AND ba.credential_id = t.credential_id
    AND ba.account_number = t.account_number
  LEFT JOIN (
    SELECT em.workspace_id, em.event_id, MIN(tp.account_number) AS matched_card_number
    FROM event_members em
    JOIN transactions tp ON tp.id = em.transaction_id
    WHERE em.role = 'purchase'
    GROUP BY em.workspace_id, em.event_id
  ) mc ON mc.workspace_id = t.workspace_id
       AND mc.event_id = t.event_id
       AND t.event_role = 'bill_payment'`;

const TRANSACTION_LIST_SELECT = `
  SELECT t.*, c.name AS category_name, c.color AS category_color,
         bc.label AS account_label, ba.name AS account_name,
         mc.matched_card_number
  ${TRANSACTION_LIST_FROM}`;

export function queryTransactions(
  workspaceId: number,
  params: QueryParams,
): { transactions: TransactionWithCategory[]; total: number } {
  const db = getDb();
  const conditions: string[] = ["t.workspace_id = ?"];
  const values: (string | number)[] = [workspaceId];

  if (params.from) {
    conditions.push("t.date >= ?");
    values.push(params.from);
  }
  if (params.to) {
    conditions.push("t.date <= ?");
    values.push(params.to);
  }
  if (params.search) {
    conditions.push("(t.description LIKE ? OR t.memo LIKE ?)");
    const term = `%${params.search}%`;
    values.push(term, term);
  }
  if (params.categoryIds && params.categoryIds.length > 0) {
    const placeholders = params.categoryIds.map(() => "?").join(",");
    conditions.push(`t.category_id IN (${placeholders})`);
    for (const cid of params.categoryIds) values.push(cid);
  } else if (params.category !== undefined) {
    conditions.push("t.category_id = ?");
    values.push(params.category);
  }
  const kind: TransactionKindFilter = params.kind ?? "all";
  if (kind === "income") {
    conditions.push("t.kind = 'income'");
  } else if (kind === "expense") {
    conditions.push("t.kind = 'expense'");
  }
  if (params.provider) {
    conditions.push("t.provider = ?");
    values.push(params.provider);
  }
  const credentialIds =
    params.credentialIds && params.credentialIds.length > 0
      ? params.credentialIds
      : params.credentialId != null
        ? [params.credentialId]
        : undefined;
  appendAccountFilter(conditions, values, { credentialIds, accountKeys: params.accountKeys }, "t.");

  const where = `WHERE ${conditions.join(" AND ")}`;

  const sortSql = resolveSortSql(params.sort);
  const sortOrder = params.order === "asc" ? "ASC" : "DESC";
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM transactions t ${where}`)
    .get(...values) as { total: number };

  const rows = db
    .prepare(
      `${TRANSACTION_LIST_SELECT}
       ${where}
       ORDER BY ${sortSql} ${sortOrder}, t.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...values, limit, offset);

  return {
    transactions: rows.map(mapTransactionRow),
    total: countRow.total,
  };
}

export function getReviewTransactions(
  workspaceId: number,
  filter: AccountFilter = {},
  limit = 200,
): TransactionWithCategory[] {
  const acct = buildAccountFilterClause(filter, "t.");
  const rows = getDb()
    .prepare(
      `${TRANSACTION_LIST_SELECT}
       WHERE t.workspace_id = ? AND t.is_excluded = 0
         AND (
           t.needs_review = 1
           OR (t.category_id IS NULL AND t.kind = 'expense' AND t.status = 'completed')
         )${acct.sql}
       ORDER BY t.needs_review DESC, t.date DESC, t.id DESC
       LIMIT ?`,
    )
    .all(workspaceId, ...acct.values, limit);
  return rows.map(mapTransactionRow);
}

export function getUncategorizedTransactionIds(workspaceId: number): number[] {
  const rows = getOrm()
    .select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.workspaceId, workspaceId),
        isNull(transactionsTable.categoryId),
        ne(transactionsTable.kind, "transfer"),
        eq(transactionsTable.isExcluded, 0),
      ),
    )
    .orderBy(desc(transactionsTable.date))
    .all();
  return rows.map((r) => r.id);
}

export function getUncategorizedIdsByKind(
  workspaceId: number,
  kind: "expense" | "income",
): number[] {
  const rows = getOrm()
    .select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.workspaceId, workspaceId),
        isNull(transactionsTable.categoryId),
        eq(transactionsTable.kind, kind),
        eq(transactionsTable.isExcluded, 0),
      ),
    )
    .orderBy(desc(transactionsTable.date))
    .all();
  return rows.map((r) => r.id);
}

export function getMatchCandidates(workspaceId: number, from: string): MatchCandidate[] {
  return getOrm()
    .select({
      id: transactionsTable.id,
      credentialId: transactionsTable.credentialId,
      accountNumber: transactionsTable.accountNumber,
      provider: transactionsTable.provider,
      date: transactionsTable.date,
      processedDate: transactionsTable.processedDate,
      chargedAmount: transactionsTable.chargedAmount,
      chargedCurrency: transactionsTable.chargedCurrency,
      description: transactionsTable.description,
      kind: transactionsTable.kind,
      dedupHash: transactionsTable.dedupHash,
      dedupSequence: transactionsTable.dedupSequence,
    })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.workspaceId, workspaceId),
        gte(transactionsTable.date, from),
        isNull(transactionsTable.eventId),
      ),
    )
    .orderBy(desc(transactionsTable.date))
    .all() as MatchCandidate[];
}

export function getUncategorizedExpenses(
  workspaceId: number,
): { id: number; description: string }[] {
  return getOrm()
    .select({ id: transactionsTable.id, description: transactionsTable.description })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.workspaceId, workspaceId),
        eq(transactionsTable.kind, "expense"),
        isNull(transactionsTable.categoryId),
      ),
    )
    .all();
}

export function getTransactionsForCategorization(
  workspaceId: number,
  ids: number[],
): {
  id: number;
  description: string;
  chargedAmount: number;
  originalCurrency: string;
  memo: string | null;
}[] {
  if (ids.length === 0) return [];
  return getOrm()
    .select({
      id: transactionsTable.id,
      description: transactionsTable.description,
      chargedAmount: transactionsTable.chargedAmount,
      originalCurrency: transactionsTable.originalCurrency,
      memo: transactionsTable.memo,
    })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.workspaceId, workspaceId), inArray(transactionsTable.id, ids)))
    .all();
}

export function updateTransactionCategory(
  workspaceId: number,
  id: number,
  categoryId: number,
  source: "ai" | "user",
): void {
  getOrm()
    .update(transactionsTable)
    .set({ categoryId, categorySource: source, updatedAt: sql`datetime('now')` })
    .where(and(eq(transactionsTable.workspaceId, workspaceId), eq(transactionsTable.id, id)))
    .run();
}

export function batchUpdateCategories(
  workspaceId: number,
  updates: { id: number; categoryId: number; aiConfidence?: number | null }[],
): void {
  getOrm().transaction((tx) => {
    for (const { id, categoryId, aiConfidence } of updates) {
      tx.update(transactionsTable)
        .set({
          categoryId,
          categorySource: "ai",
          aiConfidence: aiConfidence ?? null,
          updatedAt: sql`datetime('now')`,
        })
        .where(
          and(
            eq(transactionsTable.workspaceId, workspaceId),
            eq(transactionsTable.id, id),
            sql`${transactionsTable.categorySource} IS NOT 'user'`,
          ),
        )
        .run();
    }
  });
}

export function getMonthlySummary(
  workspaceId: number,
  months: number,
  filter: AccountFilter = {},
): MonthlySummary[] {
  const conditions = [
    "workspace_id = ?",
    "date >= date('now', '-' || ? || ' months')",
    "status = 'completed'",
    "kind = 'expense'",
    "is_excluded = 0",
  ];
  const values: (string | number)[] = [workspaceId, months];
  appendAccountFilter(conditions, values, filter);
  return getDb()
    .prepare(
      `SELECT strftime('%Y-%m', date) as month,
              SUM((-charged_amount)) as amount
       FROM transactions
       WHERE ${conditions.join(" AND ")}
       GROUP BY month
       ORDER BY month ASC`,
    )
    .all(...values) as MonthlySummary[];
}

export interface CategoryMonthSpend {
  month: string;
  categoryId: number;
  amount: number;
}

export function getCategoryMonthlySpend(
  workspaceId: number,
  monthsBack: number,
  filter: AccountFilter = {},
): CategoryMonthSpend[] {
  const acct = buildAccountFilterClause(filter);
  return getDb()
    .prepare(
      `SELECT strftime('%Y-%m', date) as month,
              category_id as categoryId,
              SUM((-charged_amount)) as amount
       FROM transactions
       WHERE workspace_id = ?
         AND date >= date('now', 'start of month', '-' || ? || ' months')
         AND status = 'completed'
         AND kind = 'expense'
         AND category_id IS NOT NULL
         AND is_excluded = 0${acct.sql}
       GROUP BY month, category_id
       ORDER BY month ASC`,
    )
    .all(workspaceId, monthsBack, ...acct.values) as CategoryMonthSpend[];
}

export interface MerchantMonthSpend {
  month: string;
  merchant: string;
  categoryId: number | null;
  amount: number;
}

export function getMerchantMonthlySpend(
  workspaceId: number,
  monthsBack: number,
  filter: AccountFilter = {},
): MerchantMonthSpend[] {
  const acct = buildAccountFilterClause(filter);
  return getDb()
    .prepare(
      `SELECT strftime('%Y-%m', date) as month,
              description as merchant,
              category_id as categoryId,
              SUM((-charged_amount)) as amount
       FROM transactions
       WHERE workspace_id = ?
         AND date >= date('now', 'start of month', '-' || ? || ' months')
         AND status = 'completed'
         AND kind = 'expense'
         AND is_excluded = 0
         AND description != ''${acct.sql}
       GROUP BY month, description
       ORDER BY month ASC`,
    )
    .all(workspaceId, monthsBack, ...acct.values) as MerchantMonthSpend[];
}

export interface MerchantChargeDay {
  merchant: string;
  day: number;
}

export function getMerchantChargeDays(
  workspaceId: number,
  monthsBack: number,
  filter: AccountFilter = {},
): MerchantChargeDay[] {
  const acct = buildAccountFilterClause(filter);
  return getDb()
    .prepare(
      `SELECT description as merchant,
              CAST(strftime('%d', date) AS INTEGER) as day
       FROM transactions
       WHERE workspace_id = ?
         AND date >= date('now', 'start of month', '-' || ? || ' months')
         AND status = 'completed'
         AND kind = 'expense'
         AND is_excluded = 0
         AND description != ''${acct.sql}`,
    )
    .all(workspaceId, monthsBack, ...acct.values) as MerchantChargeDay[];
}

export interface AnomalyTransactionRow {
  id: number;
  date: string;
  description: string;
  amount: number;
  originalCurrency: string;
  categoryId: number | null;
  categoryName: string | null;
}

export function getTransactionsForAnomalies(
  workspaceId: number,
  monthsBack: number,
  filter: AccountFilter = {},
): AnomalyTransactionRow[] {
  const acct = buildAccountFilterClause(filter, "t.");
  return getDb()
    .prepare(
      `SELECT t.id as id,
              t.date as date,
              t.description as description,
              (-t.charged_amount) as amount,
              t.original_currency as originalCurrency,
              t.category_id as categoryId,
              c.name as categoryName
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.workspace_id = ?
         AND t.date >= date('now', 'start of month', '-' || ? || ' months')
         AND t.status = 'completed'
         AND t.kind = 'expense'
         AND t.is_excluded = 0
         AND t.description != ''${acct.sql}
       ORDER BY t.date ASC`,
    )
    .all(workspaceId, monthsBack, ...acct.values) as AnomalyTransactionRow[];
}

export function getTopMerchants(
  workspaceId: number,
  from: string,
  to: string,
  limit = 10,
  filter: AccountFilter = {},
): MerchantSummary[] {
  const conditions = [
    "workspace_id = ?",
    "date >= ?",
    "date <= ?",
    "status = 'completed'",
    "kind = 'expense'",
    "is_excluded = 0",
  ];
  const values: (string | number)[] = [workspaceId, from, to];
  appendAccountFilter(conditions, values, filter);
  return getDb()
    .prepare(
      `SELECT description as name,
              SUM((-charged_amount)) as amount,
              COUNT(*) as count
       FROM transactions
       WHERE ${conditions.join(" AND ")}
       GROUP BY description
       ORDER BY amount DESC
       LIMIT ?`,
    )
    .all(...values, limit) as MerchantSummary[];
}

export function getCategoryBreakdown(
  workspaceId: number,
  from: string,
  to: string,
  filter: AccountFilter = {},
): CategoryBreakdown[] {
  const conditions = [
    "t.workspace_id = ?",
    "t.date >= ?",
    "t.date <= ?",
    "t.status = 'completed'",
    "t.kind = 'expense'",
    "t.is_excluded = 0",
  ];
  const values: (string | number)[] = [workspaceId, from, to];
  appendAccountFilter(conditions, values, filter, "t.");
  return getDb()
    .prepare(
      `SELECT
         COALESCE(t.category_id, 0) as categoryId,
         COALESCE(c.name, 'Uncategorized') as name,
         COALESCE(c.color, '#B5B3AC') as color,
         SUM((-t.charged_amount)) as amount,
         COUNT(*) as count
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE ${conditions.join(" AND ")}
       GROUP BY t.category_id
       ORDER BY amount DESC`,
    )
    .all(...values) as CategoryBreakdown[];
}

export interface CategorySpend {
  categoryId: number;
  amount: number;
  count: number;
}

export function getCategorySpendInRange(
  workspaceId: number,
  from: string,
  to: string,
  filter: AccountFilter = {},
): CategorySpend[] {
  const conditions = [
    "workspace_id = ?",
    "date >= ?",
    "date <= ?",
    "status = 'completed'",
    "kind = 'expense'",
    "category_id IS NOT NULL",
    "is_excluded = 0",
  ];
  const values: (string | number)[] = [workspaceId, from, to];
  appendAccountFilter(conditions, values, filter);
  return getDb()
    .prepare(
      `SELECT category_id as categoryId,
              SUM((-charged_amount)) as amount,
              COUNT(*) as count
       FROM transactions
       WHERE ${conditions.join(" AND ")}
       GROUP BY category_id`,
    )
    .all(...values) as CategorySpend[];
}

export interface CategoryTopMerchant {
  categoryId: number;
  merchant: string;
  amount: number;
}

export function getTopMerchantPerCategory(
  workspaceId: number,
  from: string,
  to: string,
  filter: AccountFilter = {},
): CategoryTopMerchant[] {
  const conditions = [
    "workspace_id = ?",
    "date >= ?",
    "date <= ?",
    "status = 'completed'",
    "kind = 'expense'",
    "category_id IS NOT NULL",
    "is_excluded = 0",
  ];
  const values: (string | number)[] = [workspaceId, from, to];
  appendAccountFilter(conditions, values, filter);
  return getDb()
    .prepare(
      `SELECT category_id as categoryId, description as merchant, amount
       FROM (
         SELECT category_id, description, SUM((-charged_amount)) as amount,
                ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY SUM((-charged_amount)) DESC) as rn
         FROM transactions
         WHERE ${conditions.join(" AND ")}
         GROUP BY category_id, description
       )
       WHERE rn = 1`,
    )
    .all(...values) as CategoryTopMerchant[];
}

export interface DailySpendPoint {
  date: string;
  amount: number;
}

export function getCategorySpendByDay(
  workspaceId: number,
  categoryId: number,
  from: string,
  to: string,
  filter: AccountFilter = {},
): DailySpendPoint[] {
  const acct = buildAccountFilterClause(filter, "t.");
  return getDb()
    .prepare(
      `WITH RECURSIVE days(d) AS (
         SELECT date(?)
         UNION ALL
         SELECT date(d, '+1 day') FROM days WHERE d < date(?)
       )
       SELECT days.d as date,
              COALESCE(SUM((-t.charged_amount)), 0) as amount
       FROM days
       LEFT JOIN transactions t
         ON substr(t.date, 1, 10) = days.d
         AND t.workspace_id = ?
         AND t.category_id = ?
         AND t.kind = 'expense'
         AND t.status = 'completed'
         AND t.is_excluded = 0${acct.sql}
       GROUP BY days.d
       ORDER BY days.d ASC`,
    )
    .all(from, to, workspaceId, categoryId, ...acct.values) as DailySpendPoint[];
}

export function getDailySpendTotals(
  workspaceId: number,
  from: string,
  to: string,
  filter: AccountFilter = {},
): DailySpendPoint[] {
  const acct = buildAccountFilterClause(filter, "t.");
  return getDb()
    .prepare(
      `WITH RECURSIVE days(d) AS (
         SELECT date(?)
         UNION ALL
         SELECT date(d, '+1 day') FROM days WHERE d < date(?)
       )
       SELECT days.d as date,
              COALESCE(SUM((-t.charged_amount)), 0) as amount
       FROM days
       LEFT JOIN transactions t
         ON substr(t.date, 1, 10) = days.d
         AND t.workspace_id = ?
         AND t.kind = 'expense'
         AND t.status = 'completed'
         AND t.is_excluded = 0${acct.sql}
       GROUP BY days.d
       ORDER BY days.d ASC`,
    )
    .all(from, to, workspaceId, ...acct.values) as DailySpendPoint[];
}

export interface TopMerchantForCategory {
  merchant: string;
  amount: number;
  count: number;
}

export function getTopMerchantsForCategory(
  workspaceId: number,
  categoryId: number,
  from: string,
  to: string,
  limit = 8,
  filter: AccountFilter = {},
): TopMerchantForCategory[] {
  const acct = buildAccountFilterClause(filter);
  return getDb()
    .prepare(
      `SELECT description as merchant,
              SUM((-charged_amount)) as amount,
              COUNT(*) as count
       FROM transactions
       WHERE workspace_id = ? AND category_id = ?
         AND date >= ? AND date <= ?
         AND status = 'completed'
         AND kind = 'expense'
         AND is_excluded = 0${acct.sql}
       GROUP BY description
       ORDER BY amount DESC
       LIMIT ?`,
    )
    .all(workspaceId, categoryId, from, to, ...acct.values, limit) as TopMerchantForCategory[];
}

export function getPeriodTotal(
  workspaceId: number,
  from: string,
  to: string,
  filter: AccountFilter = {},
): number {
  const conditions = [
    "workspace_id = ?",
    "date >= ?",
    "date <= ?",
    "status = 'completed'",
    "kind = 'expense'",
    "is_excluded = 0",
  ];
  const values: (string | number)[] = [workspaceId, from, to];
  appendAccountFilter(conditions, values, filter);
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM((-charged_amount)), 0) as total
       FROM transactions
       WHERE ${conditions.join(" AND ")}`,
    )
    .get(...values) as { total: number };
  return row.total;
}

export function getPeriodCount(
  workspaceId: number,
  from: string,
  to: string,
  filter: AccountFilter = {},
): number {
  const conditions = [
    "workspace_id = ?",
    "date >= ?",
    "date <= ?",
    "status = 'completed'",
    "kind = 'expense'",
    "is_excluded = 0",
  ];
  const values: (string | number)[] = [workspaceId, from, to];
  appendAccountFilter(conditions, values, filter);
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as count
       FROM transactions
       WHERE ${conditions.join(" AND ")}`,
    )
    .get(...values) as { count: number };
  return row.count;
}

interface TransactionRow {
  id: number;
  account_number: string;
  date: string;
  processed_date: string;
  local_date: string;
  original_amount: number;
  original_currency: string;
  charged_amount: number;
  charged_currency: string | null;
  description: string;
  memo: string | null;
  type: string;
  status: string;
  identifier: string | null;
  installment_number: number | null;
  installment_total: number | null;
  category_id: number | null;
  category_source: string | null;
  ai_confidence: number | null;
  provider: string;
  credential_id: number | null;
  sync_run_id: number;
  kind: string;
  needs_review: number;
  is_excluded: number;
  event_id: number | null;
  event_role: string | null;
  match_confidence: number | null;
  created_at: string;
  updated_at: string;
  category_name?: string | null;
  category_color?: string | null;
  account_label?: string | null;
  account_name?: string | null;
  matched_card_number?: string | null;
}

function mapTransactionRow(row: unknown): TransactionWithCategory {
  const r = row as TransactionRow;
  return {
    id: r.id,
    accountNumber: r.account_number,
    date: r.date,
    processedDate: r.processed_date,
    localDate: r.local_date,
    originalAmount: r.original_amount,
    originalCurrency: r.original_currency,
    chargedAmount: r.charged_amount,
    chargedCurrency: r.charged_currency,
    description: r.description,
    memo: r.memo,
    type: r.type as "normal" | "installments",
    status: r.status as "completed" | "pending",
    identifier: r.identifier,
    installmentNumber: r.installment_number,
    installmentTotal: r.installment_total,
    categoryId: r.category_id,
    categorySource: r.category_source as "ai" | "user" | null,
    aiConfidence: r.ai_confidence,
    provider: r.provider,
    credentialId: r.credential_id ?? null,
    accountLabel: r.account_label ?? null,
    accountName: r.account_name ?? null,
    syncRunId: r.sync_run_id,
    kind: r.kind as "expense" | "income" | "transfer",
    needsReview: r.needs_review === 1,
    isExcluded: r.is_excluded === 1,
    eventId: r.event_id ?? null,
    eventRole: (r.event_role as TransactionWithCategory["eventRole"]) ?? null,
    matchConfidence: r.match_confidence ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    categoryName: r.category_name ?? null,
    categoryColor: r.category_color ?? null,
    matchedCardNumber: r.matched_card_number ?? null,
  };
}

export function setTransactionKind(
  workspaceId: number,
  id: number,
  kind: "expense" | "income" | "transfer",
): void {
  getOrm()
    .update(transactionsTable)
    .set({ kind, updatedAt: sql`datetime('now')` })
    .where(and(eq(transactionsTable.workspaceId, workspaceId), eq(transactionsTable.id, id)))
    .run();
}

export function setTransactionNeedsReview(workspaceId: number, id: number, value: boolean): void {
  getOrm()
    .update(transactionsTable)
    .set({ needsReview: value ? 1 : 0, updatedAt: sql`datetime('now')` })
    .where(and(eq(transactionsTable.workspaceId, workspaceId), eq(transactionsTable.id, id)))
    .run();
}

interface TransactionContext {
  id: number;
  description: string;
  categoryId: number | null;
  categorySource: "ai" | "user" | null;
  kind: "expense" | "income" | "transfer";
  provider: string;
}

export function getTransactionContext(workspaceId: number, id: number): TransactionContext | null {
  const row = getOrm()
    .select({
      id: transactionsTable.id,
      description: transactionsTable.description,
      categoryId: transactionsTable.categoryId,
      categorySource: transactionsTable.categorySource,
      kind: transactionsTable.kind,
      provider: transactionsTable.provider,
    })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.workspaceId, workspaceId), eq(transactionsTable.id, id)))
    .get();
  return row ?? null;
}

export function batchSetNeedsReview(
  workspaceId: number,
  updates: { id: number; needsReview: boolean }[],
): void {
  if (updates.length === 0) return;
  getOrm().transaction((tx) => {
    for (const { id, needsReview } of updates) {
      tx.update(transactionsTable)
        .set({ needsReview: needsReview ? 1 : 0, updatedAt: sql`datetime('now')` })
        .where(and(eq(transactionsTable.workspaceId, workspaceId), eq(transactionsTable.id, id)))
        .run();
    }
  });
}

export interface NeedsReviewCount {
  categoryId: number;
  count: number;
}

export function getNeedsReviewCountByCategory(
  workspaceId: number,
  from: string,
  to: string,
  filter: AccountFilter = {},
): NeedsReviewCount[] {
  const conditions = [
    "workspace_id = ?",
    "date >= ?",
    "date <= ?",
    "status = 'completed'",
    "kind = 'expense'",
    "needs_review = 1",
    "category_id IS NOT NULL",
  ];
  const values: (string | number)[] = [workspaceId, from, to];
  appendAccountFilter(conditions, values, filter);
  return getDb()
    .prepare(
      `SELECT category_id as categoryId, COUNT(*) as count
       FROM transactions
       WHERE ${conditions.join(" AND ")}
       GROUP BY category_id`,
    )
    .all(...values) as NeedsReviewCount[];
}
