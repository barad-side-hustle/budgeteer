"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Layers } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { ProviderBadge } from "@/components/setup/provider-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname } from "@/i18n/navigation";
import { setActiveAccountId, useActiveAccountId } from "@/lib/account-store";
import { listAccounts } from "@/lib/api";
import { translateProviderName } from "@/lib/i18n-data";
import { BANK_PROVIDERS, type BankAccount } from "@/lib/types";

const HIDDEN_PREFIXES = ["/settings", "/setup", "/chat"];

export function GlobalAccountFilter() {
  const pathname = usePathname();
  const t = useTranslations("accountFilter");
  const tBanks = useTranslations("banks");
  const queryClient = useQueryClient();
  const activeId = useActiveAccountId();

  const { data: accounts = [] } = useQuery<BankAccount[]>({
    queryKey: ["accounts"],
    queryFn: listAccounts,
    staleTime: 60_000,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, BankAccount[]>();
    for (const account of accounts) {
      const list = map.get(account.provider) ?? [];
      list.push(account);
      map.set(account.provider, list);
    }
    return [...map.entries()];
  }, [accounts]);

  const hidden = HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (hidden || accounts.length < 2) return null;

  const active = accounts.find((a) => a.id === activeId) ?? null;
  const activeProvider = active ? BANK_PROVIDERS.find((b) => b.id === active.provider) : null;

  const select = (id: number | null) => {
    setActiveAccountId(id);
    queryClient.invalidateQueries();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex max-w-[14rem] items-center gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent"
        aria-label={t("ariaLabel")}
      >
        {active && activeProvider ? (
          <ProviderBadge
            color={activeProvider.color}
            name={active.name}
            domain={activeProvider.domain}
            size={18}
            radius={5}
          />
        ) : (
          <Layers className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{active ? active.name : t("allAccounts")}</span>
        <ChevronsUpDown className="ms-auto size-3.5 shrink-0 opacity-60" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="min-w-[15rem]">
        <DropdownMenuItem onClick={() => select(null)} className="gap-2">
          <Layers className="size-4 opacity-70" />
          <span className="flex-1 truncate">{t("allAccounts")}</span>
          {activeId == null ? <Check className="size-4 text-primary" /> : null}
        </DropdownMenuItem>
        {grouped.map(([provider, providerAccounts]) => {
          const info = BANK_PROVIDERS.find((b) => b.id === provider);
          const providerName = translateProviderName(provider, info?.name ?? provider, tBanks);
          return (
            <DropdownMenuGroup key={provider}>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{providerName}</DropdownMenuLabel>
              {providerAccounts.map((account) => (
                <DropdownMenuItem
                  key={account.id}
                  onClick={() => select(account.id)}
                  className="gap-2"
                >
                  {info ? (
                    <ProviderBadge
                      color={info.color}
                      name={account.name}
                      domain={info.domain}
                      size={18}
                      radius={5}
                    />
                  ) : (
                    <Layers className="size-4 opacity-70" />
                  )}
                  <span className="flex-1 truncate">{account.name}</span>
                  {account.id === activeId ? <Check className="size-4 text-primary" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
