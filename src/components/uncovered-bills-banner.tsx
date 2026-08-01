"use client";

import { useQuery } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getUncoveredCardBills } from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface UncoveredBillsBannerProps {
  className?: string;
}

export function UncoveredBillsBanner({ className }: UncoveredBillsBannerProps) {
  const t = useTranslations("uncoveredBills");
  const locale = useLocale() as Locale;
  const { data } = useQuery({
    queryKey: ["card-coverage"],
    queryFn: getUncoveredCardBills,
    staleTime: 60_000,
  });

  if (!data || data.length === 0) return null;

  const total = data.reduce((sum, bill) => sum + Math.abs(bill.chargedAmount), 0);
  const accounts = [...new Set(data.map((bill) => bill.accountNumber))];

  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5",
        className,
      )}
      style={{
        background: "color-mix(in oklch, var(--status-over) 14%, var(--card))",
        borderColor: "color-mix(in oklch, var(--status-over) 35%, var(--border))",
      }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{
          background: "color-mix(in oklch, var(--status-over) 28%, var(--card))",
          color: "var(--status-over)",
        }}
      >
        <CreditCard className="h-5 w-5" strokeWidth={1.75} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="font-semibold text-base leading-tight tracking-tight">
          {t("title", { count: data.length, total: formatCurrency(total, "ILS", locale) })}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("description", { accounts: accounts.join(", ") })}
        </p>
      </div>

      <Button
        size="sm"
        nativeButton={false}
        className="self-start sm:self-auto"
        render={<Link href="/settings/bank">{t("connectCard")}</Link>}
      />
    </div>
  );
}
