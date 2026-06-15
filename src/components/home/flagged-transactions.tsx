"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, HelpCircle, ListChecks } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { CardAction, CardShell } from "@/components/home/card-shell";
import { ProviderBadge } from "@/components/setup/provider-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getAccountDisplayLabel } from "@/lib/account-label";
import { getReviewTransactions } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { translateCategoryName, translateProviderName } from "@/lib/i18n-data";
import { BANK_PROVIDERS, type TransactionWithCategory } from "@/lib/types";

const MAX_ROWS = 5;

export function FlaggedTransactions() {
  const t = useTranslations("home");

  const { data, isLoading } = useQuery({
    queryKey: ["reviewTransactions"],
    queryFn: getReviewTransactions,
  });

  const flagged = (data?.transactions ?? []).filter((txn) => txn.needsReview);

  if (isLoading) {
    return (
      <CardShell label={t("flaggedTitle")} icon={<ListChecks />}>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </CardShell>
    );
  }

  if (flagged.length === 0) {
    return (
      <CardShell label={t("flaggedTitle")} icon={<ListChecks />}>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-status-on-track/10 text-status-on-track">
            <Check className="h-5 w-5" />
          </span>
          <p className="text-sm text-muted-foreground">{t("flaggedEmpty")}</p>
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell
      label={t("flaggedTitle")}
      description={t("flaggedCount", { count: flagged.length })}
      icon={<ListChecks />}
      action={<CardAction href="/review">{t("flaggedReviewAll")}</CardAction>}
    >
      <ul className="-mx-2 divide-y divide-border/60">
        {flagged.slice(0, MAX_ROWS).map((txn) => (
          <FlaggedRow key={txn.id} txn={txn} />
        ))}
      </ul>
    </CardShell>
  );
}

function FlaggedRow({ txn }: { txn: TransactionWithCategory }) {
  const t = useTranslations("home");
  const tCat = useTranslations("categoriesSeeded");
  const tBanks = useTranslations("banks");
  const locale = useLocale() as Locale;
  const info = BANK_PROVIDERS.find((b) => b.id === txn.provider);
  const providerName = translateProviderName(txn.provider, info?.name ?? txn.provider, tBanks);
  const sourceLabel = getAccountDisplayLabel(
    txn.provider,
    providerName,
    txn.accountName,
    txn.accountLabel,
  ).primary;

  return (
    <li>
      <Link
        href="/review"
        className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/40"
      >
        <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">
          {formatDayMonth(txn.date)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{txn.description}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {txn.categoryName ? (
              <span className="inline-flex items-center gap-1.5">
                {txn.categoryColor && (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: txn.categoryColor }}
                  />
                )}
                <span className="truncate">{translateCategoryName(txn.categoryName, tCat)}</span>
              </span>
            ) : (
              <span>{t("uncategorized")}</span>
            )}
            <span
              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium"
              style={{
                backgroundColor: "color-mix(in oklch, var(--status-heads-up) 18%, transparent)",
                color: "var(--status-heads-up)",
              }}
            >
              <HelpCircle className="h-3 w-3" />
              {txn.aiConfidence != null
                ? t("flaggedConfidence", { score: txn.aiConfidence })
                : t("flaggedUnsure")}
            </span>
          </div>
        </div>
        <span className="hidden shrink-0 sm:block" title={sourceLabel}>
          {info ? (
            <ProviderBadge
              color={info.color}
              name={providerName}
              domain={info.domain}
              size={18}
              radius={5}
            />
          ) : null}
        </span>
        <span className="shrink-0 text-sm tabular-nums">
          {formatCurrency(txn.chargedAmount, txn.chargedCurrency ?? "ILS", locale)}
        </span>
      </Link>
    </li>
  );
}

function formatDayMonth(iso: string): string {
  const parts = formatDate(iso).split("/");
  return `${parts[0]}/${parts[1]}`;
}
