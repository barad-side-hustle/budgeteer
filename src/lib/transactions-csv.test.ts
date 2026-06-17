import { describe, expect, test } from "bun:test";

import { buildTransactionsCsv, type CsvHeaderLabels } from "@/lib/transactions-csv";
import type { TransactionWithCategory } from "@/lib/types";

const headers: CsvHeaderLabels = {
  date: "Date",
  description: "Description",
  category: "Category",
  account: "Account",
  amount: "Amount",
  currency: "Currency",
};

function txn(over: Partial<TransactionWithCategory>): TransactionWithCategory {
  return {
    id: 0,
    accountNumber: "1234",
    date: "2026-06-01",
    processedDate: "2026-06-01",
    localDate: "2026-06-01",
    billingLocalDate: "2026-07-02",
    originalAmount: 0,
    originalCurrency: "ILS",
    chargedAmount: -42.5,
    chargedCurrency: "ILS",
    description: "Coffee",
    memo: null,
    type: "normal",
    status: "completed",
    identifier: null,
    installmentNumber: null,
    installmentTotal: null,
    categoryId: null,
    categorySource: null,
    aiConfidence: null,
    provider: "isracard",
    credentialId: null,
    accountLabel: null,
    accountName: "Visa",
    syncRunId: 0,
    kind: "expense",
    needsReview: false,
    eventId: null,
    eventRole: null,
    matchConfidence: null,
    createdAt: "2026-06-01",
    updatedAt: "2026-06-01",
    categoryName: "Dining",
    categoryColor: null,
    isExcluded: false,
    matchedCardNumber: null,
    ...over,
  };
}

function rows(csv: string): string[] {
  return csv.split("\r\n");
}

describe("buildTransactionsCsv", () => {
  test("emits a localized header row", () => {
    const csv = buildTransactionsCsv([], {
      dateBasis: "purchase",
      headers,
      uncategorizedLabel: "Uncategorized",
    });
    expect(rows(csv)[0]).toBe("Date,Description,Category,Account,Amount,Currency");
  });

  test("maps core fields with raw numeric amount", () => {
    const csv = buildTransactionsCsv([txn({})], {
      dateBasis: "purchase",
      headers,
      uncategorizedLabel: "Uncategorized",
    });
    expect(rows(csv)[1]).toBe("2026-06-01,Coffee,Dining,Visa,-42.5,ILS");
  });

  test("uses billing date when basis is billing", () => {
    const csv = buildTransactionsCsv([txn({})], {
      dateBasis: "billing",
      headers,
      uncategorizedLabel: "Uncategorized",
    });
    expect(rows(csv)[1].startsWith("2026-07-02,")).toBe(true);
  });

  test("falls back to transaction date when billing date missing", () => {
    const csv = buildTransactionsCsv([txn({ billingLocalDate: null })], {
      dateBasis: "billing",
      headers,
      uncategorizedLabel: "Uncategorized",
    });
    expect(rows(csv)[1].startsWith("2026-06-01,")).toBe(true);
  });

  test("uses the uncategorized fallback label", () => {
    const csv = buildTransactionsCsv([txn({ categoryName: null })], {
      dateBasis: "purchase",
      headers,
      uncategorizedLabel: "Uncategorized",
    });
    expect(rows(csv)[1]).toContain(",Uncategorized,");
  });

  test("prefers account name, then label, then number", () => {
    const byLabel = buildTransactionsCsv([txn({ accountName: null, accountLabel: "Joint" })], {
      dateBasis: "purchase",
      headers,
      uncategorizedLabel: "Uncategorized",
    });
    const byNumber = buildTransactionsCsv([txn({ accountName: null, accountLabel: null })], {
      dateBasis: "purchase",
      headers,
      uncategorizedLabel: "Uncategorized",
    });
    expect(rows(byLabel)[1]).toContain(",Joint,");
    expect(rows(byNumber)[1]).toContain(",1234,");
  });

  test("escapes fields containing commas, quotes, and newlines", () => {
    const csv = buildTransactionsCsv([txn({ description: 'Cafe "Aroma", TLV\nbranch' })], {
      dateBasis: "purchase",
      headers,
      uncategorizedLabel: "Uncategorized",
    });
    expect(rows(csv).length).toBe(2);
    expect(csv).toContain('"Cafe ""Aroma"", TLV\nbranch"');
  });

  test("guards against CSV injection on formula-leading cells", () => {
    const csv = buildTransactionsCsv([txn({ description: "=SUM(A1:A2)" })], {
      dateBasis: "purchase",
      headers,
      uncategorizedLabel: "Uncategorized",
    });
    expect(csv).toContain("'=SUM(A1:A2)");
  });
});
