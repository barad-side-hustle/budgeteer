"use client";

import { Repeat } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { CardShell } from "@/components/home/card-shell";
import type { Locale } from "@/i18n/routing";
import { formatCurrency } from "@/lib/formatters";
import type { FixedVsVariable, RecurringCharge } from "@/lib/types";

export function FixedVsVariableCard({
  data,
  recurring,
}: {
  data: FixedVsVariable;
  recurring: RecurringCharge[];
}) {
  const t = useTranslations("insights");
  const locale = useLocale() as Locale;
  const fc = (n: number) => formatCurrency(n, "ILS", locale);

  const total =
    data.typicalMonthly > 0 ? data.typicalMonthly : data.fixedMonthly + data.variableMonthly;
  const fixedPct = total > 0 ? Math.round((data.fixedMonthly / total) * 100) : 0;

  return (
    <CardShell label={t("fixedTitle")} description={t("fixedSubtitle")} icon={<Repeat />}>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-status-plenty-left"
          style={{ width: `${fixedPct}%` }}
          aria-hidden
        />
        <div className="h-full flex-1 bg-status-heads-up" aria-hidden />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Legend
          swatch="bg-status-plenty-left"
          label={t("fixedLabel")}
          value={fc(data.fixedMonthly)}
          hint={t("fixedHint")}
        />
        <Legend
          swatch="bg-status-heads-up"
          label={t("variableLabel")}
          value={fc(data.variableMonthly)}
          hint={t("variableHint")}
        />
      </div>

      {recurring.length > 0 && (
        <div className="mt-4 border-t border-border/60 pt-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("recurringTitle")}
          </div>
          <ul className="flex flex-col gap-1.5">
            {recurring.slice(0, 6).map((r) => (
              <li key={r.merchant} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{r.merchant}</span>
                <span className="shrink-0 font-medium tabular-nums text-muted-foreground">
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

function Legend({
  swatch,
  label,
  value,
  hint,
}: {
  swatch: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className={`size-2.5 rounded-full ${swatch}`} aria-hidden />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
