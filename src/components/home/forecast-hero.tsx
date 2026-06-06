"use client";

import { ArrowRight, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatCurrency } from "@/lib/formatters";
import type { Forecast } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  forecast: Forecast;
}

const VERDICT_STYLE = {
  plus: {
    accent: "text-status-on-track",
    chip: "bg-status-on-track/12 text-status-on-track",
    Icon: TrendingUp,
  },
  tight: {
    accent: "text-status-heads-up",
    chip: "bg-status-heads-up/12 text-status-heads-up",
    Icon: Wallet,
  },
  minus: {
    accent: "text-status-over",
    chip: "bg-status-over/12 text-status-over",
    Icon: TrendingDown,
  },
} as const;

export function ForecastHero({ forecast: f }: Props) {
  const t = useTranslations("forecast");
  const locale = useLocale() as Locale;
  const fc = (n: number) => formatCurrency(n, "ILS", locale);

  if (!f.hasData) {
    return (
      <section className="rounded-xl border border-border bg-card p-8 text-center">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/12 text-primary">
            <Wallet className="size-6" />
          </span>
          <h2 className="text-xl font-semibold tracking-tight">{t("emptyTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>
          <Link
            href="/settings/bank"
            className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("emptyCta")}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    );
  }

  const style = VERDICT_STYLE[f.verdict];
  const month = new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-IL", {
    month: "long",
  }).format(new Date());
  const title =
    f.verdict === "plus"
      ? t("verdictPlusTitle", { month })
      : f.verdict === "tight"
        ? t("verdictTightTitle", { month })
        : t("verdictMinusTitle", { month });
  const sub =
    f.verdict === "plus"
      ? t("verdictPlusSub", { amount: fc(f.projectedNet) })
      : f.verdict === "tight"
        ? t("verdictTightSub")
        : t("verdictMinusSub", { amount: fc(Math.abs(f.projectedNet)) });

  const netSign = f.projectedNet > 0 ? "+" : f.projectedNet < 0 ? "-" : "";
  const incomeMax = Math.max(f.expectedIncome, f.projectedExpenses, 1);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-4">
        <div className="flex items-start gap-3">
          <span
            className={cn("mt-0.5 flex size-9 items-center justify-center rounded-lg", style.chip)}
          >
            <style.Icon className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold leading-snug tracking-tight">{title}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>
          </div>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {t("daysLeft", { days: f.daysLeft })}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-border bg-border md:grid-cols-4">
        <Kpi label={t("kpiExpectedIncome")} value={fc(f.expectedIncome)} />
        <Kpi label={t("kpiProjectedSpending")} value={fc(f.projectedExpenses)} />
        <Kpi
          label={t("kpiProjectedNet")}
          value={`${netSign}${fc(Math.abs(f.projectedNet))}`}
          valueClass={f.projectedNet >= 0 ? "text-status-on-track" : "text-status-over"}
        />
        <Kpi
          label={t("kpiSafePerDay")}
          value={fc(f.safeToSpendPerDay)}
          meta={
            <span className="text-xs text-muted-foreground">
              {t("perWeek", { amount: fc(f.safeToSpendThisWeek) })}
            </span>
          }
        />
      </div>

      <div className="border-t border-border p-5">
        <Bar
          label={t("incomeLabel")}
          value={f.expectedIncome}
          max={incomeMax}
          tone="income"
          valueText={fc(f.expectedIncome)}
        />
        <div className="h-2" />
        <Bar
          label={t("expenseLabel")}
          value={f.projectedExpenses}
          max={incomeMax}
          tone="expense"
          valueText={fc(f.projectedExpenses)}
        />
      </div>

      {f.hasBalance ? (
        <BalanceStrip
          today={f.balanceToday as number}
          monthEnd={f.expectedMonthEnd as number}
          risk={f.overdraftRisk}
          fc={fc}
        />
      ) : (
        <Link
          href="/settings/general"
          className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-5 py-3 text-sm transition-colors hover:bg-muted/50"
        >
          <span className="text-muted-foreground">{t("addBalanceHint")}</span>
          <span className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground">
            {t("addBalanceCta")}
            <ArrowRight className="size-3.5" />
          </span>
        </Link>
      )}
    </section>
  );
}

function BalanceStrip({
  today,
  monthEnd,
  risk,
  fc,
}: {
  today: number;
  monthEnd: number;
  risk: Forecast["overdraftRisk"];
  fc: (n: number) => string;
}) {
  const t = useTranslations("forecast");
  const riskStyle = {
    none: "bg-status-on-track/12 text-status-on-track",
    watch: "bg-status-heads-up/12 text-status-heads-up",
    high: "bg-status-over/12 text-status-over",
  } as const;
  const riskLabel = {
    none: t("overdraftNone"),
    watch: t("overdraftWatch"),
    high: t("overdraftHigh"),
  } as const;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t("balanceToday")}</span>
        <span className="font-semibold tabular-nums">{fc(today)}</span>
        <ArrowRight className="size-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">{t("monthEnd")}</span>
        <span
          className={cn(
            "font-semibold tabular-nums",
            monthEnd < 0 ? "text-status-over" : "text-foreground",
          )}
        >
          {fc(monthEnd)}
        </span>
      </div>
      <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", riskStyle[risk])}>
        {riskLabel[risk]}
      </span>
    </div>
  );
}

function Bar({
  label,
  value,
  max,
  tone,
  valueText,
}: {
  label: string;
  value: number;
  max: number;
  tone: "income" | "expense";
  valueText: string;
}) {
  const pct = Math.max(2, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{valueText}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            tone === "income" ? "bg-status-on-track" : "bg-status-over",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  meta,
  valueClass,
}: {
  label: string;
  value: string;
  meta?: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 bg-card p-5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-2xl font-semibold tracking-tight tabular-nums", valueClass)}>
        {value}
      </span>
      {meta}
    </div>
  );
}
