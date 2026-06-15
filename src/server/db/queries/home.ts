import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { trimToSyncedMonths } from "@/lib/cashflow";
import type {
  HomeBankHealthItem,
  HomeCashFlow,
  HomeHistoricalTrendPoint,
  HomeNeedsAttention,
  HomeRecentTransaction,
} from "@/lib/types";
import { BANK_PROVIDERS } from "@/lib/types";
import { getDb } from "@/server/db/index";
import { getOrm } from "@/server/db/orm";
import { type AccountFilter, buildAccountFilterClause } from "@/server/db/queries/transactions";
import { bankCredentials, syncRuns } from "@/server/db/schema";
import {
  jerusalemToday,
  monthEnd,
  monthStart,
  shiftMonth,
  toLocalISODate,
} from "@/server/lib/date-utils";

export function getCashFlow(
  workspaceId: number,
  from: string,
  to: string,
  filter: AccountFilter = {},
): HomeCashFlow {
  const db = getDb();
  const acct = buildAccountFilterClause(filter);
  const income = db
    .prepare(
      `SELECT COALESCE(SUM(charged_amount), 0) as total
       FROM transactions
       WHERE workspace_id = ? AND local_date >= ? AND local_date <= ?
         AND status = 'completed' AND kind = 'income' AND is_excluded = 0${acct.sql}`,
    )
    .get(workspaceId, from, to, ...acct.values) as { total: number };
  const expenses = db
    .prepare(
      `SELECT COALESCE(SUM((-charged_amount)), 0) as total
       FROM transactions
       WHERE workspace_id = ? AND local_date >= ? AND local_date <= ?
         AND status = 'completed' AND kind = 'expense' AND is_excluded = 0${acct.sql}`,
    )
    .get(workspaceId, from, to, ...acct.values) as { total: number };
  return {
    income: income.total,
    expenses: expenses.total,
    net: income.total - expenses.total,
  };
}

export function getTypicalMonthly(
  workspaceId: number,
  kind: "expense" | "income",
  monthsBack = 3,
  filter: AccountFilter = {},
): number | null {
  const db = getDb();
  const now = new Date();
  const acct = buildAccountFilterClause(filter);
  const sumExpr = kind === "income" ? "SUM(charged_amount)" : "SUM((-charged_amount))";
  const stmt = db.prepare(
    `SELECT COALESCE(${sumExpr}, 0) as total
     FROM transactions
     WHERE workspace_id = ? AND local_date >= ? AND local_date <= ?
       AND status = 'completed' AND kind = ? AND is_excluded = 0${acct.sql}`,
  );
  let total = 0;
  let monthsSeen = 0;
  for (let i = 1; i <= monthsBack; i++) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const row = stmt.get(
      workspaceId,
      toLocalISODate(start),
      toLocalISODate(end),
      kind,
      ...acct.values,
    ) as {
      total: number;
    };
    if (row.total > 0) {
      total += row.total;
      monthsSeen++;
    }
  }
  return monthsSeen > 0 ? total / monthsSeen : null;
}

export function getHistoricalTrend(
  workspaceId: number,
  monthsBack: number,
  filter: AccountFilter = {},
): HomeHistoricalTrendPoint[] {
  const db = getDb();
  const acct = buildAccountFilterClause(filter);
  const today = jerusalemToday();
  const currentMonthStart = monthStart(today);
  const currentMonthKey = currentMonthStart.slice(0, 7);

  const months: { key: string; label: string; from: string; to: string }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const from = shiftMonth(currentMonthStart, -i);
    const key = from.slice(0, 7);
    const [y, m] = from.split("-").map(Number);
    months.push({
      key,
      label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short" }),
      from,
      to: monthEnd(from),
    });
  }

  const stmt = db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN kind = 'expense' THEN (-charged_amount) ELSE 0 END), 0) as total,
       COALESCE(SUM(CASE WHEN kind = 'income' THEN charged_amount ELSE 0 END), 0) as income
     FROM transactions
     WHERE workspace_id = ? AND local_date >= ? AND local_date <= ?
       AND status = 'completed' AND is_excluded = 0${acct.sql}`,
  );

  const points = months.map((m) => {
    const row = stmt.get(workspaceId, m.from, m.to, ...acct.values) as {
      total: number;
      income: number;
    };
    return {
      month: m.key,
      label: m.label,
      total: row.total,
      income: row.income,
      net: row.income - row.total,
      isCurrent: m.key === currentMonthKey,
    };
  });

  return trimToSyncedMonths(points);
}

export function getRecentTransactionsForHome(
  workspaceId: number,
  limit: number,
  filter: AccountFilter = {},
): HomeRecentTransaction[] {
  const acct = buildAccountFilterClause(filter, "t.");
  const rows = getDb()
    .prepare(
      `SELECT t.id, t.date, t.description, t.charged_amount as chargedAmount,
              t.charged_currency as chargedCurrency, t.kind, t.provider,
              c.name as categoryName, c.color as categoryColor,
              bc.label as accountLabel, ba.name as accountName
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN bank_credentials bc ON bc.id = t.credential_id
       LEFT JOIN bank_accounts ba ON ba.workspace_id = t.workspace_id
         AND ba.credential_id = t.credential_id
         AND ba.account_number = t.account_number
       WHERE t.workspace_id = ? AND t.status = 'completed' AND t.kind != 'transfer'
         AND t.is_excluded = 0${acct.sql}
       ORDER BY t.date DESC, t.id DESC
       LIMIT ?`,
    )
    .all(workspaceId, ...acct.values, limit) as HomeRecentTransaction[];
  return rows;
}

export function getNeedsAttentionCounts(
  workspaceId: number,
  filter: AccountFilter = {},
): HomeNeedsAttention {
  const db = getDb();
  const acct = buildAccountFilterClause(filter);
  const uncategorized = db
    .prepare(
      `SELECT COUNT(*) as count FROM transactions
       WHERE workspace_id = ? AND category_id IS NULL AND kind = 'expense' AND status = 'completed'
         AND is_excluded = 0${acct.sql}`,
    )
    .get(workspaceId, ...acct.values) as { count: number };
  const lowConfidence = db
    .prepare(
      `SELECT COUNT(*) as count FROM transactions
       WHERE workspace_id = ? AND ai_confidence IS NOT NULL AND ai_confidence < 0.5
         AND category_source = 'ai' AND status = 'completed' AND is_excluded = 0${acct.sql}`,
    )
    .get(workspaceId, ...acct.values) as { count: number };
  const flagged = db
    .prepare(
      `SELECT COUNT(*) as count FROM transactions
       WHERE workspace_id = ? AND needs_review = 1 AND status = 'completed' AND is_excluded = 0${acct.sql}`,
    )
    .get(workspaceId, ...acct.values) as { count: number };
  return {
    uncategorized: uncategorized.count,
    lowConfidence: lowConfidence.count,
    flagged: flagged.count,
  };
}

export function getBankHealth(workspaceId: number): HomeBankHealthItem[] {
  const orm = getOrm();
  const creds = orm
    .select({ provider: bankCredentials.provider })
    .from(bankCredentials)
    .where(eq(bankCredentials.workspaceId, workspaceId))
    .orderBy(asc(bankCredentials.provider))
    .all();

  const staleThresholdMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  return creds.map(({ provider }) => {
    const latest = orm
      .select({
        status: syncRuns.status,
        completedAt: syncRuns.completedAt,
        errorMessage: syncRuns.errorMessage,
      })
      .from(syncRuns)
      .where(and(eq(syncRuns.workspaceId, workspaceId), eq(syncRuns.provider, provider)))
      .orderBy(desc(syncRuns.startedAt))
      .limit(1)
      .get();
    const providerInfo = BANK_PROVIDERS.find((p) => p.id === provider);
    const providerName = providerInfo?.name ?? provider;

    if (!latest) {
      return {
        provider,
        providerName,
        lastSyncAt: null,
        status: "never",
        errorMessage: null,
      };
    }

    if (latest.status === "failed") {
      return {
        provider,
        providerName,
        lastSyncAt: latest.completedAt,
        status: "error",
        errorMessage: latest.errorMessage,
      };
    }

    if (!latest.completedAt) {
      return {
        provider,
        providerName,
        lastSyncAt: null,
        status: "never",
        errorMessage: null,
      };
    }

    const ageMs = now - new Date(`${latest.completedAt}Z`).getTime();
    const status: "ok" | "stale" = ageMs > staleThresholdMs ? "stale" : "ok";
    return {
      provider,
      providerName,
      lastSyncAt: latest.completedAt,
      status,
      errorMessage: null,
    };
  });
}
