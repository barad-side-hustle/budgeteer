"use client";

import { Activity } from "lucide-react";
import { useTranslations } from "next-intl";
import { BurndownChart } from "@/components/charts/burndown-chart";
import { CardShell } from "@/components/home/card-shell";
import type { BurndownPayload } from "@/lib/types";

export function SpendingPaceCard({ burndown }: { burndown: BurndownPayload }) {
  const t = useTranslations("home");
  const hasBurndown = burndown.current.length > 1;
  return (
    <CardShell label={t("burndownTitle")} description={t("burndownSubtitle")} icon={<Activity />}>
      {hasBurndown ? (
        <BurndownChart
          current={burndown.current}
          prior={burndown.prior}
          totalDays={burndown.totalDays}
          labels={{ thisMonth: t("burndownThisMonth"), lastMonth: t("burndownLastMonth") }}
        />
      ) : (
        <div className="flex items-center justify-center rounded-lg bg-muted/40 py-8 text-center text-sm text-muted-foreground">
          {t("burndownEmpty")}
        </div>
      )}
    </CardShell>
  );
}
