"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { AINotConnectedBanner } from "@/components/ai-not-connected-banner";
import { CategorizeButton } from "@/components/dashboard/categorize-button";
import { SyncButton } from "@/components/dashboard/sync-button";
import { HelpButton } from "@/components/help/help-button";
import { BreakdownSection } from "@/components/home/breakdown-section";
import { CardError, CardSkeleton } from "@/components/home/card-shell";
import { ConnectedAccounts } from "@/components/home/connected-accounts";
import { FlaggedTransactions } from "@/components/home/flagged-transactions";
import { ForecastHero } from "@/components/home/forecast-hero";
import { RecentActivity } from "@/components/home/recent-activity";
import { SyncFailureBanner } from "@/components/home/sync-failure-banner";
import { SyncStatusPill } from "@/components/home/sync-status-pill";
import { TopInsights } from "@/components/home/top-insights";
import { TrendsChart } from "@/components/home/trends-chart";
import { PageHeader } from "@/components/layout/app-shell";
import { getActivity, getForecast, getInsights } from "@/lib/api";

export function HomePage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [autoStartSync] = useState(() => searchParams.get("sync") === "1");
  const t = useTranslations("home");

  const insights = useQuery({ queryKey: ["insights"], queryFn: getInsights });
  const forecast = useQuery({ queryKey: ["forecast"], queryFn: getForecast });

  const [activityPopoverOpen, setActivityPopoverOpen] = useState(false);
  const { data: activity } = useQuery({
    queryKey: ["activity"],
    queryFn: getActivity,
    refetchInterval: (q) => {
      const a = q.state.data;
      if (activityPopoverOpen) return 3000;
      if (a?.sync.active) return 3000;
      return 15000;
    },
    refetchIntervalInBackground: false,
  });

  const handleActivityOpenChange = useCallback(
    (open: boolean) => {
      setActivityPopoverOpen(open);
      if (open) queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
    [queryClient],
  );

  const handleComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["insights"] });
    queryClient.invalidateQueries({ queryKey: ["forecast"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["reviewTransactions"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["activity"] });
  }, [queryClient]);

  const data = insights.data;
  const insightsLoading = insights.isLoading || !data;
  const forecastLoading = forecast.isLoading || !forecast.data;

  return (
    <>
      <PageHeader
        title={t("pageTitle")}
        actions={
          <>
            <SyncStatusPill
              items={data?.bankHealth ?? null}
              nextScheduledSync={data?.nextScheduledSync ?? null}
              activity={activity ?? null}
              onOpenChange={handleActivityOpenChange}
            />
            <CategorizeButton onApplied={handleComplete} />
            <SyncButton onComplete={handleComplete} autoStart={autoStartSync} />
            <HelpButton page="home" />
          </>
        }
      />

      <div className="p-4 md:p-6 lg:p-8">
        <SyncFailureBanner items={data?.bankHealth ?? null} className="mb-4 md:mb-5 lg:mb-6" />
        <AINotConnectedBanner className="mb-4 md:mb-5 lg:mb-6" />

        <div className="flex flex-col gap-4 md:gap-5 lg:gap-6">
          {forecastLoading ? (
            <CardSkeleton height={260} />
          ) : forecast.isError || !forecast.data.forecast ? (
            <CardError label={t("pageTitle")} onRetry={forecast.refetch} />
          ) : (
            <ForecastHero forecast={forecast.data.forecast} />
          )}

          {insightsLoading ? (
            <CardSkeleton label={t("trendsTitle")} height={300} />
          ) : data.trend ? (
            <TrendsChart points={data.trend} />
          ) : (
            <CardError label={t("trendsTitle")} onRetry={insights.refetch} />
          )}

          <div className="grid grid-cols-12 gap-4 md:gap-5 lg:gap-6">
            <div className="col-span-12 lg:col-span-7">
              {insightsLoading ? (
                <CardSkeleton label={t("breakdownTitle")} height={360} />
              ) : data.breakdown ? (
                <BreakdownSection items={data.breakdown} />
              ) : (
                <CardError label={t("breakdownTitle")} onRetry={insights.refetch} />
              )}
            </div>
            <div className="col-span-12 lg:col-span-5">
              {insightsLoading ? (
                <CardSkeleton label={t("recentActivity")} height={360} />
              ) : data.recentTransactions ? (
                <RecentActivity items={data.recentTransactions} />
              ) : (
                <CardError label={t("recentActivity")} onRetry={insights.refetch} />
              )}
            </div>
            <div className="col-span-12 lg:col-span-4">
              <ConnectedAccounts health={data?.bankHealth ?? null} />
            </div>
            <div className="col-span-12 lg:col-span-4">
              {insightsLoading ? (
                <CardSkeleton label={t("topInsightsTitle")} height={260} />
              ) : data.insights ? (
                <TopInsights insights={data.insights} />
              ) : (
                <CardError label={t("topInsightsTitle")} onRetry={insights.refetch} />
              )}
            </div>
            <div className="col-span-12 lg:col-span-4">
              <FlaggedTransactions />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
