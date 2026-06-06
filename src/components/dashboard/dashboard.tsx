"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { AINotConnectedBanner } from "@/components/ai-not-connected-banner";
import { AccountSummaryCards } from "@/components/dashboard/account-summary-cards";
import { CategorizeButton } from "@/components/dashboard/categorize-button";
import { CategoryGrid } from "@/components/dashboard/category-grid";
import { HeroCard } from "@/components/dashboard/hero-card";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { SyncButton } from "@/components/dashboard/sync-button";
import { PageHeader } from "@/components/layout/app-shell";
import { QueryError } from "@/components/ui/query-error";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Locale } from "@/i18n/routing";
import { getSummary } from "@/lib/api";
import { addMonths, formatMonthLabel, getMonthRange, isCurrentMonth } from "@/lib/formatters";
import type { CategoryViewMode } from "@/lib/types";

const VIEW_MODE_KEY = "budgeteer.dashboard.viewMode";

function readViewMode(): CategoryViewMode {
  if (typeof window === "undefined") return "collapsed";
  try {
    const raw = window.localStorage.getItem(VIEW_MODE_KEY);
    return raw === "expanded" ? "expanded" : "collapsed";
  } catch {
    return "collapsed";
  }
}

export function Dashboard() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<CategoryViewMode>("collapsed");
  const [accountFilter, setAccountFilter] = useState<number[]>([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Deliberate post-mount read: the server renders the default and the stored
    // preference is applied on the client to avoid a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViewMode(readViewMode());
  }, []);

  const handleViewModeChange = useCallback((mode: CategoryViewMode) => {
    setViewMode(mode);
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // Storage may be unavailable; in-memory state still works.
    }
  }, []);

  const { from, to } = getMonthRange(selectedDate);

  const summaryQuery = useQuery({
    queryKey: ["summary", from, to, accountFilter],
    queryFn: () =>
      getSummary({ from, to, accountIds: accountFilter.length > 0 ? accountFilter : undefined }),
  });

  const toggleAccount = useCallback((accountId: number) => {
    setAccountFilter((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId],
    );
  }, []);

  const handleSyncComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["settings"] });
  }, [queryClient]);

  const monthLabel = formatMonthLabel(selectedDate, locale);
  const summary = summaryQuery.data;

  return (
    <>
      <PageHeader
        title={t("pageTitle")}
        meta={monthLabel}
        actions={
          <>
            <PeriodSelector
              label={monthLabel}
              onPrev={() => setSelectedDate((d) => addMonths(d, -1))}
              onNext={() => setSelectedDate((d) => addMonths(d, 1))}
              prevLabel={tc("previousMonth")}
              nextLabel={tc("nextMonth")}
              nextDisabled={isCurrentMonth(selectedDate)}
            />
            <CategorizeButton onApplied={handleSyncComplete} />
            <SyncButton onComplete={handleSyncComplete} />
          </>
        }
      />

      <div className="space-y-6 p-4 md:p-6 lg:p-8">
        <AINotConnectedBanner />
        {summaryQuery.isError && !summary ? (
          <QueryError onRetry={() => summaryQuery.refetch()} />
        ) : (
          <>
            <HeroCard data={summary} loading={summaryQuery.isLoading} monthLabel={monthLabel} />

            <AccountSummaryCards
              from={from}
              to={to}
              selectedIds={accountFilter}
              onToggle={toggleAccount}
            />

            <div className="flex items-center justify-end">
              <Tabs
                value={viewMode}
                onValueChange={(v) =>
                  handleViewModeChange(v === "expanded" ? "expanded" : "collapsed")
                }
              >
                <TabsList>
                  <TabsTrigger value="collapsed">{t("viewModeGrouped")}</TabsTrigger>
                  <TabsTrigger value="expanded">{t("viewModeAll")}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <CategoryGrid
              categories={summary?.categoriesWithData ?? []}
              loading={summaryQuery.isLoading}
              periodTotal={summary?.periodTotal ?? 0}
              from={from}
              to={to}
              viewMode={viewMode}
            />
          </>
        )}
      </div>
    </>
  );
}
