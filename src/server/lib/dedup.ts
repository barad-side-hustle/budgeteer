import "server-only";

import crypto from "node:crypto";

import { toBankDayStartUtc } from "@/server/lib/dates";

interface DedupFields {
  accountNumber: string;
  date: string;
  originalAmount: number;
  originalCurrency: string;
  description: string;
  identifier?: string | number | null;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
}

export function computeDedupHash(fields: DedupFields): string {
  const parts = [
    fields.accountNumber,
    toBankDayStartUtc(fields.date),
    String(fields.originalAmount),
    fields.originalCurrency,
    fields.description,
    fields.identifier != null ? String(fields.identifier) : "",
    fields.installmentNumber != null ? String(fields.installmentNumber) : "",
    fields.installmentTotal != null ? String(fields.installmentTotal) : "",
  ];

  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}
