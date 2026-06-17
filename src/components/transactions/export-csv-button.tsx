"use client";

import { Download, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getTransactions, type TransactionKindFilter } from "@/lib/api";
import { useDateBasis } from "@/lib/date-basis-store";
import { buildTransactionsCsv } from "@/lib/transactions-csv";

const EXPORT_LIMIT = 100000;

interface ExportCsvButtonProps {
  from: string;
  to: string;
  search: string;
  categoryIds: number[] | undefined;
  kind: TransactionKindFilter;
  sort: string;
  order: "asc" | "desc";
  disabled?: boolean;
}

function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExportCsvButton({
  from,
  to,
  search,
  categoryIds,
  kind,
  sort,
  order,
  disabled = false,
}: ExportCsvButtonProps) {
  const t = useTranslations("transactions");
  const dateBasis = useDateBasis();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { transactions } = await getTransactions({
        from,
        to,
        search: search || undefined,
        categoryIds,
        kind,
        sort,
        order,
        limit: EXPORT_LIMIT,
        offset: 0,
      });

      if (transactions.length === 0) {
        toast.info(t("exportEmpty"));
        return;
      }

      const csv = buildTransactionsCsv(transactions, {
        dateBasis,
        uncategorizedLabel: t("rowUncategorized"),
        headers: {
          date: t("csvHeaderDate"),
          description: t("csvHeaderDescription"),
          category: t("csvHeaderCategory"),
          account: t("csvHeaderAccount"),
          amount: t("csvHeaderAmount"),
          currency: t("csvHeaderCurrency"),
        },
      });

      downloadCsv(csv, `budgeteer-transactions-${from.slice(0, 7)}.csv`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={disabled || exporting}
      className="gap-1.5"
    >
      {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {t("exportCsv")}
    </Button>
  );
}
