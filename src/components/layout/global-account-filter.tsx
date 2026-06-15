"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, CreditCard, Layers, Minus } from "lucide-react";
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
  parseAccountSelection,
} from "@/lib/account-group";
import {
  getAccountTokensSync,
  setAccountTokens,
  toggleAccountToken,
  useAccountSelection,
} from "@/lib/account-store";
import { listAccounts } from "@/lib/api";
import { translateProviderName } from "@/lib/i18n-data";
import { BANK_PROVIDERS, type BankAccount } from "@/lib/types";

const HIDDEN_PREFIXES = ["/settings", "/setup"];

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

  const selectedIds = useMemo(() => {
    const ids = new Set<number>();
    if (!selection) return ids;
    for (const token of selection.split(",")) {
      const parsed = parseAccountSelection(token.trim());
      if (parsed?.kind === "account") ids.add(parsed.id);
    }
    return ids;
  }, [selection]);

  const labelInfo = useMemo(() => {
    if (selectedIds.size === 0) return { kind: "all" as const };
    if (selectedIds.size === 1) {
      const id = [...selectedIds][0];
      const account = accounts.find((candidate) => candidate.id === id);
      return account
        ? { kind: "one" as const, name: account.name, provider: account.provider }
        : { kind: "all" as const };
    }
    return { kind: "many" as const, count: selectedIds.size };
  }, [selectedIds, accounts]);

  const selectAll = (event: React.MouseEvent) => {
    event.preventDefault();
    setAccountTokens([]);
    queryClient.invalidateQueries();
  };

  const toggleAccount = (event: React.MouseEvent, accountId: number) => {
    event.preventDefault();
    toggleAccountToken(accountSelectionValue(accountId));
    queryClient.invalidateQueries();
  };

  const toggleGroup = (event: React.MouseEvent, group: AccountGroup) => {
    event.preventDefault();
    const memberTokens = group.members.map((m) => accountSelectionValue(m.id));
    const allSelected = group.members.every((m) => selectedIds.has(m.id));
    const current = getAccountTokensSync();
    const next = allSelected
      ? current.filter((tok) => !memberTokens.includes(tok))
      : [...new Set([...current, ...memberTokens])];
    setAccountTokens(next);
    queryClient.invalidateQueries();
  };

  const hidden = HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (hidden || accounts.length < 2) return null;

  const oneProvider =
    labelInfo.kind === "one" ? BANK_PROVIDERS.find((b) => b.id === labelInfo.provider) : null;

  const triggerLabel =
    labelInfo.kind === "all"
      ? t("allAccounts")
      : labelInfo.kind === "one"
        ? labelInfo.name
        : t("accountsCount", { count: labelInfo.count });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex max-w-[14rem] items-center gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent"
        aria-label={t("ariaLabel")}
      >
        {labelInfo.kind === "one" && oneProvider ? (
          <ProviderBadge
            color={oneProvider.color}
            name={labelInfo.name}
            domain={oneProvider.domain}
            size={18}
            radius={5}
          />
        ) : (
          <Layers className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{triggerLabel}</span>
        <ChevronsUpDown className="ms-auto size-3.5 shrink-0 opacity-60" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="min-w-[15rem]">
        <DropdownMenuItem onClick={selectAll} className="gap-2">
          <Layers className="size-4 opacity-70" />
          <span className="flex-1 truncate">{t("allAccounts")}</span>
          {selectedIds.size === 0 ? <Check className="size-4 text-primary" /> : null}
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
                  const checked = selectedIds.has(account.id);
                  return (
                    <DropdownMenuItem
                      key={accountSelectionValue(account.id)}
                      onClick={(e) => toggleAccount(e, account.id)}
                      className="gap-2"
                    >
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
                      {checked ? <Check className="size-4 text-primary" /> : null}
                    </DropdownMenuItem>
                  );
                }

                const selectedCount = group.members.filter((m) => selectedIds.has(m.id)).length;
                const memberCount = group.members.length;
                const groupIcon =
                  selectedCount === memberCount ? (
                    <Check className="size-4 text-primary" />
                  ) : selectedCount > 0 ? (
                    <Minus className="size-4 text-primary" />
                  ) : null;

                return (
                  <Fragment key={`${group.credentialId}:${group.groupKey}`}>
                    <DropdownMenuItem onClick={(e) => toggleGroup(e, group)} className="gap-2">
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
                      {groupIcon}
                    </DropdownMenuItem>
                    {group.members.map((account) => {
                      const checked = selectedIds.has(account.id);
                      return (
                        <DropdownMenuItem
                          key={accountSelectionValue(account.id)}
                          onClick={(e) => toggleAccount(e, account.id)}
                          className="gap-2 ps-9"
                        >
                          <CreditCard className="size-3.5 shrink-0 opacity-60" />
                          <span className="flex-1 truncate text-[0.8125rem]">{account.name}</span>
                          {checked ? <Check className="size-4 text-primary" /> : null}
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
