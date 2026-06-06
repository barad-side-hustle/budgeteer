"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, Check, CircleHelp, EyeOff, ShieldQuestion } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { CardError, CardSkeleton } from "@/components/home/card-shell";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Locale } from "@/i18n/routing";
import {
  approveTransactionCategory,
  getCategories,
  getReviewTransactions,
  setTransactionExcluded,
  setTransactionKind,
  updateTransactionCategory,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { translateProviderName } from "@/lib/i18n-data";
import { BANK_PROVIDERS, type Category, type TransactionWithCategory } from "@/lib/types";

export function ReviewPage() {
  const t = useTranslations("review");
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["reviewTransactions"],
    queryFn: getReviewTransactions,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories", "review"],
    queryFn: () => getCategories(),
  });

  const txns = data?.transactions ?? [];
  const loading = isLoading || !data;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["reviewTransactions"] });
    queryClient.invalidateQueries({ queryKey: ["insights"] });
    queryClient.invalidateQueries({ queryKey: ["forecast"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
  };

  return (
    <>
      <PageHeader
        title={t("pageTitle")}
        meta={!loading && txns.length > 0 ? t("countMeta", { count: txns.length }) : undefined}
      />
      <div className="space-y-4 p-4 md:space-y-6 md:p-6 lg:p-8">
        <ExplainCard />

        {loading ? (
          <CardSkeleton height={200} />
        ) : isError ? (
          <CardError label={t("pageTitle")} onRetry={refetch} />
        ) : txns.length === 0 ? (
          <AllClear />
        ) : (
          <div className="flex flex-col gap-2.5">
            <AnimatePresence initial={false}>
              {txns.map((txn) => (
                <ReviewRow key={txn.id} txn={txn} categories={categories} onDone={invalidate} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </>
  );
}

function ExplainCard() {
  const t = useTranslations("review");
  const points = [
    { Icon: ShieldQuestion, title: t("explainFlaggedTitle"), body: t("explainFlaggedBody") },
    {
      Icon: CircleHelp,
      title: t("explainUncategorizedTitle"),
      body: t("explainUncategorizedBody"),
    },
    { Icon: EyeOff, title: t("explainExcludeTitle"), body: t("explainExcludeBody") },
    { Icon: BadgeCheck, title: t("explainWhyTitle"), body: t("explainWhyBody") },
  ];
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold tracking-tight">{t("explainTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("explainIntro")}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {points.map(({ Icon, title, body }) => (
          <div key={title} className="flex flex-col gap-1.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="size-4" />
            </span>
            <div className="text-xs font-semibold">{title}</div>
            <div className="text-xs leading-snug text-muted-foreground">{body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AllClear() {
  const t = useTranslations("review");
  return (
    <div className="rounded-xl border border-border bg-card p-10 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-status-on-track/12 text-status-on-track">
          <Check className="size-6" />
        </span>
        <h2 className="text-xl font-semibold tracking-tight">{t("emptyTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>
      </div>
    </div>
  );
}

function ReviewRow({
  txn,
  categories,
  onDone,
}: {
  txn: TransactionWithCategory;
  categories: Category[];
  onDone: () => void;
}) {
  const t = useTranslations("review");
  const tBanks = useTranslations("banks");
  const locale = useLocale() as Locale;
  const [busy, setBusy] = useState(false);

  const reason = txn.needsReview ? "flagged" : "uncategorized";
  const kind = txn.kind === "income" ? "income" : "expense";
  const options = categories.filter((c) => c.kind === kind);
  const amount = Math.abs(txn.chargedAmount);
  const providerInfo = BANK_PROVIDERS.find((b) => b.id === txn.provider);
  const source =
    txn.accountLabel?.trim() ||
    txn.accountName?.trim() ||
    translateProviderName(txn.provider, providerInfo?.name ?? txn.provider, tBanks);

  const run = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("actionFailed"));
      setBusy(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: -10 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border border-border bg-card p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{txn.description}</div>
          {txn.memo && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground/80">{txn.memo}</div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="tabular-nums">{formatDate(txn.date)}</span>
            <span aria-hidden>·</span>
            <span className="truncate">{source}</span>
            <span aria-hidden>·</span>
            <ReasonBadge reason={reason} />
          </div>
        </div>
        <div
          className={`shrink-0 text-sm font-semibold tabular-nums ${
            kind === "income" ? "text-status-on-track" : "text-foreground"
          }`}
        >
          {kind === "income" ? "+" : "-"}
          {formatCurrency(amount, txn.chargedCurrency ?? "ILS", locale)}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select
          value={txn.categoryId != null ? String(txn.categoryId) : ""}
          onValueChange={(v) =>
            v &&
            run(async () => {
              // Categorizing a mis-detected transfer also makes it real spending.
              if (txn.kind === "transfer") await setTransactionKind(txn.id, "expense");
              await updateTransactionCategory(txn.id, Number(v));
            }, t("savedCategorized"))
          }
        >
          <SelectTrigger className="h-9 w-[200px]" disabled={busy}>
            <SelectValue placeholder={t("pickCategory")} />
          </SelectTrigger>
          <SelectContent>
            {options.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                <span className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: c.color }}
                    aria-hidden
                  />
                  {c.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {txn.needsReview && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => run(() => approveTransactionCategory(txn.id), t("savedApproved"))}
          >
            <Check className="size-3.5" />
            {t("looksRight")}
          </Button>
        )}

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                className="ms-auto text-muted-foreground"
                onClick={() => run(() => setTransactionExcluded(txn.id, true), t("savedExcluded"))}
              >
                <EyeOff className="size-3.5" />
                {t("exclude")}
              </Button>
            }
          />
          <TooltipContent side="top" className="max-w-[220px]">
            {t("excludeTooltip")}
          </TooltipContent>
        </Tooltip>
      </div>
    </motion.div>
  );
}

function ReasonBadge({ reason }: { reason: "uncategorized" | "flagged" }) {
  const t = useTranslations("review");
  const style =
    reason === "uncategorized"
      ? "bg-status-heads-up/12 text-status-heads-up"
      : "bg-status-plenty-left/12 text-status-plenty-left";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${style}`}>
      {reason === "uncategorized" ? t("reasonUncategorized") : t("reasonFlagged")}
    </span>
  );
}
