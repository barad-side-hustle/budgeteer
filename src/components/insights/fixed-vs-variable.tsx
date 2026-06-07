"use client";

import { Repeat } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { CardShell } from "@/components/home/card-shell";
import { DeltaBadge } from "@/components/ui/delta-badge";
import type { Locale } from "@/i18n/routing";
import { formatCurrency } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";
import type { FixedVsVariable } from "@/lib/types";

const MAX_CATEGORY_ROWS = 12;

export function FixedVsVariableCard({ data }: { data: FixedVsVariable }) {
  const t = useTranslations("insights");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale() as Locale;
  const fc = (n: number) => formatCurrency(n, "ILS", locale);

  const total =
    data.typicalMonthly > 0 ? data.typicalMonthly : data.fixedMonthly + data.variableMonthly;
  const fixedPct = total > 0 ? Math.round((data.fixedMonthly / total) * 100) : 0;
  const rows = data.byCategory.slice(0, MAX_CATEGORY_ROWS);

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

      {rows.length > 0 && (
        <div className="mt-5 border-t border-border/60 pt-4">
          <div className="mb-1.5 grid grid-cols-12 gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="col-span-5">{t("fvColCategory")}</span>
            <span className="col-span-2 text-end">{t("fvColFixed")}</span>
            <span className="col-span-2 text-end">{t("fvColVariable")}</span>
            <span className="col-span-2 text-end">{t("fvColTotal")}</span>
            <span className="col-span-1" />
          </div>
          <ul className="divide-y divide-border/50">
            {rows.map((row) => {
              const name = translateCategoryName(row.name, tCat);
              const split = row.current > 0 ? (row.fixed / row.current) * 100 : 0;
              return (
                <li key={row.categoryId} className="grid grid-cols-12 items-center gap-2 py-2">
                  <div className="col-span-5 flex min-w-0 flex-col gap-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="truncate text-sm font-medium">{name}</span>
                    </span>
                    <span className="flex h-1 overflow-hidden rounded-full bg-status-heads-up/30">
                      <span
                        className="h-full bg-status-plenty-left"
                        style={{ width: `${split}%` }}
                        aria-hidden
                      />
                    </span>
                  </div>
                  <span className="col-span-2 text-end text-xs tabular-nums text-muted-foreground">
                    {fc(row.fixed)}
                  </span>
                  <span className="col-span-2 text-end text-xs tabular-nums text-muted-foreground">
                    {fc(row.variable)}
                  </span>
                  <span className="col-span-2 text-end text-sm tabular-nums font-medium">
                    {fc(row.current)}
                  </span>
                  <span className="col-span-1 flex justify-end">
                    <DeltaBadge percent={row.deltaPercent} goodWhen="down" />
                  </span>
                </li>
              );
            })}
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
