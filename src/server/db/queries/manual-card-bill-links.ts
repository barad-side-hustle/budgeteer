import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db/index";
import { getOrm } from "@/server/db/orm";
import { manualCardBillLinks } from "@/server/db/schema";

export interface ManualCardBillLink {
  billTransactionId: number;
  accountNumber: string;
}

export interface CardBillMatchingRow {
  billTransactionId: number;
  date: string;
  description: string;
  chargedAmount: number;
  chargedCurrency: string | null;
  linkedAccountNumber: string | null;
}

export function getManualCardBillLinks(workspaceId: number): ManualCardBillLink[] {
  return getOrm()
    .select({
      billTransactionId: manualCardBillLinks.billTransactionId,
      accountNumber: manualCardBillLinks.accountNumber,
    })
    .from(manualCardBillLinks)
    .where(eq(manualCardBillLinks.workspaceId, workspaceId))
    .all();
}

export function upsertManualCardBillLink(
  workspaceId: number,
  billTransactionId: number,
  accountNumber: string,
): void {
  getOrm()
    .insert(manualCardBillLinks)
    .values({ workspaceId, billTransactionId, accountNumber })
    .onConflictDoUpdate({
      target: [manualCardBillLinks.workspaceId, manualCardBillLinks.billTransactionId],
      set: { accountNumber },
    })
    .run();
}

export function deleteManualCardBillLink(workspaceId: number, billTransactionId: number): void {
  getOrm()
    .delete(manualCardBillLinks)
    .where(
      and(
        eq(manualCardBillLinks.workspaceId, workspaceId),
        eq(manualCardBillLinks.billTransactionId, billTransactionId),
      ),
    )
    .run();
}

export function getCardBillMatchingRows(workspaceId: number): CardBillMatchingRow[] {
  const rows = getDb()
    .prepare(
      `SELECT t.id AS bill_transaction_id,
              t.date AS date,
              t.description AS description,
              t.charged_amount AS charged_amount,
              t.charged_currency AS charged_currency,
              l.account_number AS linked_account_number
       FROM transactions t
       LEFT JOIN manual_card_bill_links l
         ON l.workspace_id = t.workspace_id AND l.bill_transaction_id = t.id
       LEFT JOIN financial_events e
         ON e.id = t.event_id
       WHERE t.workspace_id = ?
         AND (
           l.bill_transaction_id IS NOT NULL
           OR (e.event_type = 'credit_card_payment' AND e.status != 'rejected')
         )
       ORDER BY t.date DESC`,
    )
    .all(workspaceId) as {
    bill_transaction_id: number;
    date: string;
    description: string;
    charged_amount: number;
    charged_currency: string | null;
    linked_account_number: string | null;
  }[];
  return rows.map((r) => ({
    billTransactionId: r.bill_transaction_id,
    date: r.date,
    description: r.description,
    chargedAmount: r.charged_amount,
    chargedCurrency: r.charged_currency,
    linkedAccountNumber: r.linked_account_number,
  }));
}
