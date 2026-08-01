import "server-only";

import type { UncoveredCardBill } from "@/lib/types";
import { getDb } from "@/server/db/index";

const UNCOVERED_BILL_MIN_AMOUNT = 500;

export function listUncoveredCardBills(
  workspaceId: number,
  sinceLocalDate: string,
  minAmount: number = UNCOVERED_BILL_MIN_AMOUNT,
): UncoveredCardBill[] {
  return getDb()
    .prepare(
      `SELECT t.id AS id,
              t.account_number AS accountNumber,
              t.local_date AS localDate,
              t.charged_amount AS chargedAmount,
              t.description AS description
         FROM financial_events e
         JOIN event_members m ON m.event_id = e.id
         JOIN transactions t ON t.id = m.transaction_id
        WHERE e.workspace_id = ?
          AND e.event_type = 'credit_card_payment'
          AND e.status = 'suggested'
          AND t.local_date >= ?
          AND ABS(t.charged_amount) >= ?
        GROUP BY t.id
        ORDER BY t.local_date DESC`,
    )
    .all(workspaceId, sinceLocalDate, minAmount) as UncoveredCardBill[];
}
