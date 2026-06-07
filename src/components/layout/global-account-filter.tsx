"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, CreditCard, Layers } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useMemo } from "react";
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
import {
  type AccountGroup,
  accountSelectionValue,
  groupAccountsForFilter,
  groupSelectionValue,
  parseAccountSelection,
} from "@/lib/account-group";
import { setAccountSelection, useAccountSelection } from "@/lib/account-store";
import { listAccounts } from "@/lib/api";
import { translateProviderName } from "@/lib/i18n-data";
import { BANK_PROVIDERS, type BankAccount } from "@/lib/types";

const HIDDEN_PREFIXES = ["/settings", "/setup", "/chat"];

export function GlobalAccountFilter() {
  const pathname = usePathname();
  const t = useTranslations("accountFilter");
  const tBanks = useTranslations("banks");
  const queryClient = useQueryClient();
  const selection = useAccountSelection();

  const { data: accounts = [] } = useQuery<BankAccount[]>({
    queryKey: ["accounts"],
    queryFn: listAccounts,
    staleTime: 60_000,
  });

  const groups = useMemo(() => groupAccountsForFilter(accounts), [accounts]);

  const groupedByProvider = useMemo(() => {
    const map = new Map<string, AccountGroup[]>();
    for (const group of groups) {
      const list = map.get(group.provider) ?? [];
      list.push(group);
      map.set(group.provider, list);
    }
    return [...map.entries()];
  }, [groups]);

  const activeInfo = useMemo(() => {
    if (!selection) return null;
    const parsed = parseAccountSelection(selection);
    if (!parsed) return null;
    if (parsed.kind === "account") {
      const account = accounts.find((candidate) => candidate.id === parsed.id);
      return account ? { name: account.name, provider: account.provider } : null;
    }
    const group = groups.find(
      (candidate) =>
        candidate.credentialId === parsed.credentialId && candidate.groupKey === parsed.groupKey,
    );
    return group ? { name: group.name, provider: group.provider } : null;
  }, [selection, accounts, groups]);

  const hidden = HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (hidden || accounts.length < 2) return null;

  const activeProvider = activeInfo
    ? BANK_PROVIDERS.find((b) => b.id === activeInfo.provider)
    : null;

  const select = (value: string | null) => {
    setAccountSelection(value);
    queryClient.invalidateQueries();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex max-w-[14rem] items-center gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent"
        aria-label={t("ariaLabel")}
      >
        {activeInfo && activeProvider ? (
          <ProviderBadge
            color={activeProvider.color}
            name={activeInfo.name}
            domain={activeProvider.domain}
            size={18}
            radius={5}
          />
        ) : (
          <Layers className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{activeInfo ? activeInfo.name : t("allAccounts")}</span>
        <ChevronsUpDown className="ms-auto size-3.5 shrink-0 opacity-60" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="min-w-[15rem]">
        <DropdownMenuItem onClick={() => select(null)} className="gap-2">
          <Layers className="size-4 opacity-70" />
          <span className="flex-1 truncate">{t("allAccounts")}</span>
          {selection == null ? <Check className="size-4 text-primary" /> : null}
        </DropdownMenuItem>
        {groupedByProvider.map(([provider, providerGroups]) => {
          const info = BANK_PROVIDERS.find((b) => b.id === provider);
          const providerName = translateProviderName(provider, info?.name ?? provider, tBanks);
          return (
            <DropdownMenuGroup key={provider}>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{providerName}</DropdownMenuLabel>
              {providerGroups.map((group) => {
                if (!group.grouped) {
                  const account = group.members[0];
                  const value = accountSelectionValue(account.id);
                  return (
                    <DropdownMenuItem key={value} onClick={() => select(value)} className="gap-2">
                      {info ? (
                        <ProviderBadge
                          color={info.color}
                          name={group.name}
                          domain={info.domain}
                          size={18}
                          radius={5}
                        />
                      ) : (
                        <Layers className="size-4 opacity-70" />
                      )}
                      <span className="flex-1 truncate">{group.name}</span>
                      {selection === value ? <Check className="size-4 text-primary" /> : null}
                    </DropdownMenuItem>
                  );
                }

                const groupValue = groupSelectionValue(group.credentialId, group.groupKey);
                return (
                  <Fragment key={groupValue}>
                    <DropdownMenuItem onClick={() => select(groupValue)} className="gap-2">
                      {info ? (
                        <ProviderBadge
                          color={info.color}
                          name={group.name}
                          domain={info.domain}
                          size={18}
                          radius={5}
                        />
                      ) : (
                        <Layers className="size-4 opacity-70" />
                      )}
                      <span className="flex-1 truncate">{group.name}</span>
                      {selection === groupValue ? <Check className="size-4 text-primary" /> : null}
                    </DropdownMenuItem>
                    {group.members.map((account) => {
                      const value = accountSelectionValue(account.id);
                      return (
                        <DropdownMenuItem
                          key={value}
                          onClick={() => select(value)}
                          className="gap-2 ps-9"
                        >
                          <CreditCard className="size-3.5 shrink-0 opacity-60" />
                          <span className="flex-1 truncate text-[0.8125rem]">{account.name}</span>
                          {selection === value ? <Check className="size-4 text-primary" /> : null}
                        </DropdownMenuItem>
                      );
                    })}
                  </Fragment>
                );
              })}
            </DropdownMenuGroup>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
