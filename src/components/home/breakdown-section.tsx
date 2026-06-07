"use client";

import { PieChart } from "lucide-react";
import { useTranslations } from "next-intl";
import { Donut, type DonutSlice } from "@/components/charts/donut";
import { CardAction, CardShell } from "@/components/home/card-shell";
import { DeltaBadge } from "@/components/ui/delta-badge";
import { formatCurrency } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";
import type { BreakdownItem } from "@/lib/types";

const MAX_ROWS = 8;
const DONUT_SLICES = 6;
const OTHER_COLOR = "var(--muted-foreground)";

export function BreakdownSection({ items }: { items: BreakdownItem[] }) {
  const t = useTranslations("home");
  const tCat = useTranslations("categoriesSeeded");

  if (items.length === 0) {
    return (
      <CardShell label={t("breakdownTitle")} icon={<PieChart />}>
        <div className="flex flex-1 items-center justify-center py-8 text-center text-sm text-muted-foreground">
          {t("breakdownEmpty")}
        </div>
      </CardShell>
    );
  }

  const total = items.reduce((sum, i) => sum + i.amount, 0);
  const rows = items.slice(0, MAX_ROWS);
  const slices: DonutSlice[] = items
    .slice(0, DONUT_SLICES)
    .map((i) => ({ value: i.amount, color: i.color }));
  const otherSum = items.slice(DONUT_SLICES).reduce((sum, i) => sum + i.amount, 0);
  if (otherSum > 0) slices.push({ value: otherSum, color: OTHER_COLOR });

  const topCategory = items[0];

  return (
    <CardShell
      label={t("breakdownTitle")}
      icon={<PieChart />}
      action={<CardAction href="/transactions">{t("allTransactions")}</CardAction>}
    >
      <div className="flex flex-1 flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3 pt-2">
          <Donut slices={slices} size={208} thickness={24}>
            <span className="text-xs text-muted-foreground">{t("breakdownTotal")}</span>
            <span className="text-2xl font-semibold tracking-tight tabular-nums">
              {formatCurrency(total)}
            </span>
          </Donut>
          {topCategory && (
            <p className="text-center text-xs text-muted-foreground">
              {t("breakdownTopCategory", {
                category: translateCategoryName(topCategory.name, tCat),
                percent: Math.round(topCategory.percentOfTotal),
              })}
            </p>
          )}
        </div>
        <ul className="grid w-full grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
          {rows.map((item) => {
            const name = translateCategoryName(item.name, tCat);
            return (
              <li key={item.categoryId} className="flex items-center gap-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: item.color }}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {Math.round(item.percentOfTotal)}%
                </span>
                <span className="w-20 shrink-0 text-end text-sm tabular-nums">
                  {formatCurrency(item.amount)}
                </span>
                <DeltaBadge percent={item.deltaPercent} goodWhen="down" />
              </li>
            );
          })}
        </ul>
      </div>
    </CardShell>
  );
}
