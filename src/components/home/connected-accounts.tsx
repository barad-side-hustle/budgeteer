"use client";

import { useQuery } from "@tanstack/react-query";
import { Landmark } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { CardAction, CardShell } from "@/components/home/card-shell";
import { ProviderBadge } from "@/components/setup/provider-badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { getAccountSummaries } from "@/lib/api";
import { formatCurrency, getMonthRange } from "@/lib/formatters";
import { translateProviderName } from "@/lib/i18n-data";
import { BANK_PROVIDERS, type HomeBankHealthItem } from "@/lib/types";

type Status = HomeBankHealthItem["status"];

const STATUS_COLOR: Record<Status, string> = {
  ok: "var(--status-on-track)",
  stale: "var(--status-heads-up)",
  error: "var(--status-over)",
  never: "var(--muted-foreground)",
};

export function ConnectedAccounts({ health }: { health: HomeBankHealthItem[] | null }) {
  const t = useTranslations("home");
  const tBanks = useTranslations("banks");
  const locale = useLocale() as Locale;
  const { from, to } = getMonthRange(new Date());

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["accounts", "summaries", from, to],
    queryFn: () => getAccountSummaries({ from, to }),
  });

  const statusTitle: Record<Status, string> = {
    ok: t("accountStatusOk"),
    stale: t("accountStatusStale"),
    error: t("accountStatusError"),
    never: t("accountStatusNever"),
  };

  const statusByProvider = new Map<string, Status>();
  for (const item of health ?? []) statusByProvider.set(item.provider, item.status);

  return (
    <CardShell
      label={t("connectedAccountsTitle")}
      icon={<Landmark />}
      action={<CardAction href="/settings/bank">{t("connectedAccountsManage")}</CardAction>}
    >
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !accounts || accounts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-8 text-center text-sm text-muted-foreground">
          {t("connectedAccountsEmpty")}
        </div>
      ) : (
        <ul className="-mx-2 divide-y divide-border/60">
          {accounts.map((account) => {
            const info = BANK_PROVIDERS.find((b) => b.id === account.provider);
            const providerName = translateProviderName(
              account.provider,
              info?.name ?? account.provider,
              tBanks,
            );
            const status = statusByProvider.get(account.provider) ?? "never";
            return (
              <li key={account.id} className="flex items-center gap-3 px-2 py-2.5">
                <span className="relative shrink-0">
                  {info ? (
                    <ProviderBadge
                      color={info.color}
                      name={providerName}
                      domain={info.domain}
                      size={32}
                      radius={9}
                    />
                  ) : (
                    <span className="block h-8 w-8 rounded-lg bg-muted" />
                  )}
                  <span
                    className="absolute -end-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card"
                    style={{ backgroundColor: STATUS_COLOR[status] }}
                    title={statusTitle[status]}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{account.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{providerName}</div>
                </div>
                <div className="shrink-0 text-end">
                  <div className="text-sm font-medium tabular-nums">
                    {account.balance != null
                      ? formatCurrency(account.balance, account.balanceCurrency ?? "ILS", locale)
                      : t("accountNoBalance")}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {t("accountSpent", { amount: formatCurrency(account.expense) })}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}
