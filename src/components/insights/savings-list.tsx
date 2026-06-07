"use client";

import { CalendarClock, PiggyBank, Receipt, Scissors, TrendingUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { CardShell } from "@/components/home/card-shell";
import type { Locale } from "@/i18n/routing";
import { formatCurrency } from "@/lib/formatters";
import type { SavingsOpportunity, SavingsType } from "@/lib/types";

const ICON: Record<SavingsType, typeof Receipt> = {
  subscription: CalendarClock,
  "category-spike": TrendingUp,
  "trim-category": Scissors,
  fees: Receipt,
};

export function SavingsList({
  savings,
  totalSavings,
}: {
  savings: SavingsOpportunity[];
  totalSavings: number;
}) {
  const t = useTranslations("insights");
  const locale = useLocale() as Locale;
  const fc = (n: number) => formatCurrency(n, "ILS", locale);

  return (
    <CardShell
      label={t("savingsTitle")}
      description={
        savings.length > 0 ? t("savingsSubtitle", { amount: fc(totalSavings) }) : undefined
      }
      icon={<PiggyBank />}
    >
      {savings.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 py-10 text-center">
          <p className="text-sm font-medium">{t("savingsEmptyTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("savingsEmptyBody")}</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60">
          {savings.map((s) => {
            const Icon = ICON[s.type];
            const title =
              s.type === "subscription"
                ? t("savSubscriptionTitle", { merchant: s.merchant ?? "" })
                : s.type === "category-spike"
                  ? t("savSpikeTitle", { category: s.categoryName ?? "" })
                  : s.type === "trim-category"
                    ? t("savTrimTitle", { category: s.categoryName ?? "" })
                    : t("savFeesTitle");
            const body =
              s.type === "subscription"
                ? t("savSubscriptionBody")
                : s.type === "category-spike"
                  ? t("savSpikeBody")
                  : s.type === "trim-category"
                    ? t("savTrimBody", { percent: Math.round((s.fraction ?? 0) * 100) })
                    : t("savFeesBody", { amount: fc(s.estimatedMonthly) });
            return (
              <li key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{title}</div>
                  <div className="truncate text-xs text-muted-foreground">{body}</div>
                </div>
                <span className="shrink-0 rounded-full bg-status-on-track/12 px-2.5 py-1 text-xs font-semibold text-status-on-track tabular-nums">
                  {t("savingsAmount", { amount: fc(s.estimatedMonthly) })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}
