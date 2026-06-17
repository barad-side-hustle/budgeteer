import type { TransactionWithCategory } from "@/lib/types";

export interface BillGroupRow {
  txn: TransactionWithCategory;
  children: TransactionWithCategory[];
}

export function groupBillChildren(transactions: TransactionWithCategory[]): BillGroupRow[] {
  const billByEvent = new Map<number, BillGroupRow>();
  for (const txn of transactions) {
    if (txn.eventRole === "bill_payment" && txn.eventId != null) {
      billByEvent.set(txn.eventId, { txn, children: [] });
    }
  }

  const rows: BillGroupRow[] = [];
  for (const txn of transactions) {
    if (txn.eventRole === "bill_payment" && txn.eventId != null) {
      const group = billByEvent.get(txn.eventId);
      if (group) rows.push(group);
      continue;
    }
    if (txn.eventRole === "purchase" && txn.eventId != null && billByEvent.has(txn.eventId)) {
      billByEvent.get(txn.eventId)?.children.push(txn);
      continue;
    }
    rows.push({ txn, children: [] });
  }
  return rows;
}
