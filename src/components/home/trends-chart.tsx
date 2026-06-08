"use client";

import { TrendingUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { CardShell } from "@/components/home/card-shell";
import type { Locale } from "@/i18n/routing";
import { summarizeCashflow } from "@/lib/cashflow";
import { formatCurrency, formatMonthLabel } from "@/lib/formatters";
import type { HomeHistoricalTrendPoint } from "@/lib/types";

const INCOME_COLOR = "#34d399";
const EXPENSE_COLOR = "#fb7185";
const NET_COLOR = "#818cf8";

function bcp(locale: Locale): string {
  return locale === "he" ? "he-IL" : "en-US";
}

function monthDate(month: string): Date {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, (m ?? 1) - 1, 1);
}

function axisLabel(month: string, locale: Locale): string {
  return monthDate(month).toLocaleDateString(bcp(locale), { month: "short" });
}

export function TrendsChart({ points }: { points: HomeHistoricalTrendPoint[] }) {
  const t = useTranslations("home");
  const locale = useLocale() as Locale;
  const fc = (n: number) => formatCurrency(n, "ILS", locale);

  if (points.length === 0) {
    return (
      <CardShell label={t("trendsTitle")} icon={<TrendingUp />}>
        <div className="flex flex-1 items-center justify-center py-10 text-center text-sm text-muted-foreground">
          {t("trendsEmpty")}
        </div>
      </CardShell>
    );
  }

  const summary = summarizeCashflow(points);
  const data = points.map((p) => ({
    axis: axisLabel(p.month, locale),
    full: formatMonthLabel(monthDate(p.month), locale),
    income: p.income,
    expense: p.total,
    net: p.net,
  }));

  return (
    <CardShell
      label={t("trendsTitle")}
      description={t("trendsSubtitle", { count: points.length })}
      icon={<TrendingUp />}
      action={
        <div className="flex gap-5">
          <Kpi label={t("trendsAvgIncome")} value={fc(summary.avgIncome)} color={INCOME_COLOR} />
          <Kpi label={t("trendsAvgExpense")} value={fc(summary.avgExpense)} color={EXPENSE_COLOR} />
          <Kpi
            label={t("trendsAvgNet")}
            value={fc(summary.avgNet)}
            color={summary.avgNet < 0 ? EXPENSE_COLOR : INCOME_COLOR}
          />
        </div>
      }
    >
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 4, bottom: 4, left: 4 }}>
            <XAxis
              dataKey="axis"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              reversed={locale === "he"}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as {
                  full: string;
                  income: number;
                  expense: number;
                  net: number;
                };
                return (
                  <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                    <div className="mb-1 font-medium">{p.full}</div>
                    <TooltipRow
                      label={t("trendsIncome")}
                      value={fc(p.income)}
                      color={INCOME_COLOR}
                    />
                    <TooltipRow
                      label={t("trendsExpense")}
                      value={fc(p.expense)}
                      color={EXPENSE_COLOR}
                    />
                    <div className="mt-1 border-t pt-1">
                      <TooltipRow
                        label={t("trendsNet")}
                        value={fc(p.net)}
                        color={p.net < 0 ? EXPENSE_COLOR : NET_COLOR}
                      />
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="income" fill={INCOME_COLOR} fillOpacity={0.55} radius={[3, 3, 0, 0]} />
            <Bar dataKey="expense" fill={EXPENSE_COLOR} fillOpacity={0.55} radius={[3, 3, 0, 0]} />
            <Line
              dataKey="net"
              stroke={NET_COLOR}
              strokeWidth={3}
              dot={{ r: 3, fill: NET_COLOR }}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </CardShell>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-end">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function TooltipRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex justify-between gap-4" style={{ color }}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
