"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { CardError, CardSkeleton } from "@/components/home/card-shell";
import { FixedVsVariableCard } from "@/components/insights/fixed-vs-variable";
import { RecommendationCard } from "@/components/insights/recommendation-card";
import { RecurringSpending } from "@/components/insights/recurring-spending";
import { SavingsList } from "@/components/insights/savings-list";
import { PageHeader } from "@/components/layout/app-shell";
import { Link } from "@/i18n/navigation";
import { getForecast } from "@/lib/api";

export function InsightsPage() {
  const t = useTranslations("insights");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["forecast"],
    queryFn: getForecast,
  });
  const loading = isLoading || !data;

  return (
    <>
      <PageHeader title={t("pageTitle")} />
      <div className="p-4 md:p-6 lg:p-8">
        {loading ? (
          <div className="flex flex-col gap-4 md:gap-6">
            <CardSkeleton height={120} />
            <div className="grid grid-cols-12 gap-4 md:gap-6">
              <CardSkeleton className="col-span-12 lg:col-span-7" height={260} />
              <CardSkeleton className="col-span-12 lg:col-span-5" height={260} />
            </div>
          </div>
        ) : isError ? (
          <CardError label={t("pageTitle")} onRetry={refetch} />
        ) : !data.forecast?.hasData ? (
          <EmptyInsights />
        ) : (
          <div className="flex flex-col gap-4 md:gap-6">
            {data.recommendations && data.recommendations.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold tracking-tight text-muted-foreground">
                  {t("recommendationsTitle")}
                </h2>
                <div className="grid grid-cols-12 gap-3 md:gap-4">
                  {data.recommendations.map((rec) => (
                    <div key={rec.id} className="col-span-12 md:col-span-6 lg:col-span-4">
                      <RecommendationCard rec={rec} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {data.fixedVsVariable ? (
              <FixedVsVariableCard data={data.fixedVsVariable} />
            ) : (
              <CardError label={t("fixedTitle")} onRetry={refetch} />
            )}

            <div className="grid grid-cols-12 gap-4 md:gap-6">
              <div className="col-span-12 lg:col-span-7">
                <RecurringSpending recurring={data.recurring ?? []} />
              </div>
              <div className="col-span-12 lg:col-span-5">
                <SavingsList savings={data.savings ?? []} totalSavings={data.totalSavings} />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function EmptyInsights() {
  const t = useTranslations("insights");
  return (
    <div className="rounded-xl border border-border bg-card p-10 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/12 text-primary">
          <Sparkles className="size-6" />
        </span>
        <h2 className="text-xl font-semibold tracking-tight">{t("emptyTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>
        <Link
          href="/settings/bank"
          className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t("emptyCta")}
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
