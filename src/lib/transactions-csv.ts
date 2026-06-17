import type { DateBasis } from "@/lib/date-basis";
import type { TransactionWithCategory } from "@/lib/types";

export interface CsvHeaderLabels {
  date: string;
  description: string;
  category: string;
  account: string;
  amount: string;
  currency: string;
}

export interface BuildTransactionsCsvOptions {
  dateBasis: DateBasis;
  headers: CsvHeaderLabels;
  uncategorizedLabel: string;
}

function quote(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function escapeText(value: string): string {
  return quote(/^[=+\-@]/.test(value) ? `'${value}` : value);
}

function accountLabel(txn: TransactionWithCategory): string {
  return txn.accountName ?? txn.accountLabel ?? txn.accountNumber;
}

function dateValue(txn: TransactionWithCategory, dateBasis: DateBasis): string {
  const value = dateBasis === "billing" ? (txn.billingLocalDate ?? txn.localDate) : txn.localDate;
  return value ?? "";
}

export function buildTransactionsCsv(
  transactions: TransactionWithCategory[],
  options: BuildTransactionsCsvOptions,
): string {
  const { dateBasis, headers, uncategorizedLabel } = options;
  const lines: string[] = [
    [
      headers.date,
      headers.description,
      headers.category,
      headers.account,
      headers.amount,
      headers.currency,
    ]
      .map(escapeText)
      .join(","),
  ];

  for (const txn of transactions) {
    lines.push(
      [
        quote(dateValue(txn, dateBasis)),
        escapeText(txn.description),
        escapeText(txn.categoryName ?? uncategorizedLabel),
        escapeText(accountLabel(txn)),
        quote(String(txn.chargedAmount)),
        quote(txn.chargedCurrency ?? "ILS"),
      ].join(","),
    );
  }

  return lines.join("\r\n");
}
