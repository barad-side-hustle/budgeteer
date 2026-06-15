"use client";

import { Receipt } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { CardAction, CardShell } from "@/components/home/card-shell";
import { ProviderBadge } from "@/components/setup/provider-badge";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getAccountDisplayLabel } from "@/lib/account-label";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { translateCategoryName, translateProviderName } from "@/lib/i18n-data";
import { BANK_PROVIDERS, type HomeRecentTransaction } from "@/lib/types";

export function RecentActivity({ items }: { items: HomeRecentTransaction[] }) {
  const t = useTranslations("home");
  const tCat = useTranslations("categoriesSeeded");
  const tBanks = useTranslations("banks");
  const locale = useLocale() as Locale;

  if (items.length === 0) {
    return (
      <CardShell label={t("recentActivity")} icon={<Receipt />}>
        <div className="flex flex-1 items-center justify-center py-6 text-center text-sm text-muted-foreground">
          {t("noTransactionsYet")}
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell
      label={t("recentActivity")}
      icon={<Receipt />}
      action={<CardAction href="/transactions">{t("allTransactions")}</CardAction>}
    >
      <ul className="-mx-2 divide-y divide-border/60">
        {items.map((txn) => {
          const info = BANK_PROVIDERS.find((b) => b.id === txn.provider);
          const providerName = translateProviderName(
            txn.provider,
            info?.name ?? txn.provider,
            tBanks,
          );
          const sourceLabel = getAccountDisplayLabel(
            txn.provider,
            providerName,
            txn.accountName,
            txn.accountLabel,
          ).primary;
          return (
            <li key={txn.id}>
              <Link
                href="/transactions"
                className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/40"
              >
                <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatDayMonth(txn.localDate)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{txn.description}</div>
                  {txn.categoryName ? (
                    <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      {txn.categoryColor && (
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: txn.categoryColor }}
                        />
                      )}
                      <span className="truncate">
                        {translateCategoryName(txn.categoryName, tCat)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("uncategorized")}</span>
                  )}
                </div>
                <span
                  className="hidden min-w-0 max-w-[7.5rem] items-center gap-1.5 sm:flex"
                  title={sourceLabel}
                >
                  {info ? (
                    <ProviderBadge
                      color={info.color}
                      name={providerName}
                      domain={info.domain}
                      size={16}
                      radius={5}
                    />
                  ) : null}
                  <span className="truncate text-xs text-muted-foreground">{sourceLabel}</span>
                </span>
                <span
                  className={`shrink-0 text-sm tabular-nums ${
                    txn.kind === "income" ? "text-status-on-track" : "text-foreground"
                  }`}
                >
                  {txn.kind === "income" ? "+" : "−"}
                  {formatCurrency(txn.chargedAmount, txn.chargedCurrency ?? "ILS", locale)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </CardShell>
  );
}

function formatDayMonth(iso: string | null): string {
  const parts = formatDate(iso).split("/");
  return `${parts[0]}/${parts[1]}`;
}
