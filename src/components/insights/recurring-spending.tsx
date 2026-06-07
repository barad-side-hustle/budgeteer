"use client";

import { RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { CardShell } from "@/components/home/card-shell";
import type { Locale } from "@/i18n/routing";
import { formatCurrency } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";
import type { RecurringCharge } from "@/lib/types";

export function RecurringSpending({ recurring }: { recurring: RecurringCharge[] }) {
  const t = useTranslations("insights");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale() as Locale;
  const fc = (n: number) => formatCurrency(n, "ILS", locale);

  const monthlyTotal = recurring.filter((r) => !r.lapsed).reduce((sum, r) => sum + r.amount, 0);

  return (
    <CardShell
      label={t("recurringTitle")}
      description={t("recurringSubtitle", { amount: fc(monthlyTotal) })}
      icon={<RotateCcw />}
    >
      {recurring.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-8 text-center text-sm text-muted-foreground">
          {t("recurringEmpty")}
        </div>
      ) : (
        <div>
          <div className="mb-1.5 grid grid-cols-12 gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="col-span-5">{t("recurringColMerchant")}</span>
            <span className="col-span-2 text-center">{t("recurringColSeen")}</span>
            <span className="col-span-2 text-center">{t("recurringColTrend")}</span>
            <span className="col-span-3 text-end">{t("recurringColAmount")}</span>
          </div>
          <ul className="divide-y divide-border/50">
            {recurring.map((r) => (
              <li key={r.merchant} className="grid grid-cols-12 items-center gap-2 py-2.5">
                <div className="col-span-5 flex min-w-0 flex-col">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{r.merchant}</span>
                    {r.lapsed && (
                      <span className="shrink-0 rounded-full bg-status-over/12 px-1.5 py-0.5 text-[10px] font-medium text-status-over">
                        {t("recurringLapsed")}
                      </span>
                    )}
                  </div>
                  <span className="truncate text-xs text-muted-foreground">
                    {r.categoryName
                      ? translateCategoryName(r.categoryName, tCat)
                      : t("recurringUncategorized")}
                  </span>
                </div>
                <span className="col-span-2 text-center text-xs tabular-nums text-muted-foreground">
                  {t("recurringSeenValue", {
                    present: r.monthsPresent,
                    considered: r.monthsConsidered,
                  })}
                </span>
                <span className="col-span-2 flex justify-center">
                  <MiniBars values={r.monthly} />
                </span>
                <span className="col-span-3 text-end text-sm tabular-nums font-medium">
                  {t("recurringPerMonth", { amount: fc(r.amount) })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </CardShell>
  );
}

function MiniBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <span className="flex h-6 items-end gap-0.5" aria-hidden>
      {values.map((v, i) => {
        const height = Math.max(2, Math.round((v / max) * 24));
        const last = i === values.length - 1;
        return (
          <span
            key={i}
            className={last ? "w-1 rounded-sm bg-primary" : "w-1 rounded-sm bg-muted-foreground/35"}
            style={{ height }}
          />
        );
      })}
    </span>
  );
}
