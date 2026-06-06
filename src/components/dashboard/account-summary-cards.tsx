"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { ProviderBadge } from "@/components/setup/provider-badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { getAccountSummaries } from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";
import { translateProviderName } from "@/lib/i18n-data";
import { type AccountSummary, BANK_PROVIDERS } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AccountSummaryCardsProps {
  from: string;
  to: string;
  selectedIds: number[];
  onToggle: (accountId: number) => void;
}

export function AccountSummaryCards({ from, to, selectedIds, onToggle }: AccountSummaryCardsProps) {
  const query = useQuery({
    queryKey: ["accounts", "summaries", from, to],
    queryFn: () => getAccountSummaries({ from, to }),
  });

  const accounts = query.data ?? [];

  // No point showing the row when there is only one account: the hero already
  // covers it and there is nothing to scope to.
  if (!query.isLoading && accounts.length < 2) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {query.isLoading
        ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)
        : accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              selected={selectedIds.includes(account.id)}
              anySelected={selectedIds.length > 0}
              onToggle={() => onToggle(account.id)}
            />
          ))}
    </div>
  );
}

function AccountCard({
  account,
  selected,
  anySelected,
  onToggle,
}: {
  account: AccountSummary;
  selected: boolean;
  anySelected: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("dashboard");
  const tAccounts = useTranslations("accounts");
  const tBanks = useTranslations("banks");
  const locale = useLocale() as Locale;

  const info = BANK_PROVIDERS.find((b) => b.id === account.provider);
  const providerName = translateProviderName(
    account.provider,
    info?.name ?? account.provider,
    tBanks,
  );
  const label = account.name.trim() || account.accountNumber;
  const currency = account.balanceCurrency ?? "ILS";
  const ownershipLabel =
    account.ownershipType === "joint"
      ? tAccounts("ownershipJoint")
      : account.ownershipType === "shared"
        ? tAccounts("ownershipShared")
        : tAccounts("ownershipPersonal");

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-xl border border-border bg-card p-4 text-start text-card-foreground transition-colors hover:border-ring/50",
        selected && "border-primary ring-1 ring-primary",
        anySelected && !selected && "opacity-60",
      )}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {info ? (
            <ProviderBadge
              color={info.color}
              name={providerName}
              domain={info.domain}
              size={20}
              radius={6}
            />
          ) : (
            <div className="h-5 w-5 shrink-0 rounded-md bg-muted" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium leading-tight">{label}</div>
            <div className="truncate text-xs text-muted-foreground">{providerName}</div>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {ownershipLabel}
          </span>
        </div>

        <div>
          <div className="text-xs text-muted-foreground">{t("accountBalance")}</div>
          <div className="font-semibold text-lg tabular-nums">
            {account.balance != null ? formatCurrency(account.balance, currency, locale) : "—"}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs tabular-nums">
          <span className="text-status-on-track">
            {t("accountIncome")} {formatCurrency(account.income, currency, locale)}
          </span>
          <span className="text-status-over">
            {t("accountExpense")} {formatCurrency(account.expense, currency, locale)}
          </span>
        </div>
      </div>
    </button>
  );
}
