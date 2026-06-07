"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  EyeOff,
  HelpCircle,
  ScanEye,
  Tags,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CategorizeButton } from "@/components/dashboard/categorize-button";
import { CardError, CardSkeleton } from "@/components/home/card-shell";
import { PageHeader } from "@/components/layout/app-shell";
import { ProviderBadge } from "@/components/setup/provider-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { translateCategoryName, translateProviderName } from "@/lib/i18n-data";
import { BANK_PROVIDERS, type Category, type TransactionWithCategory } from "@/lib/types";

type Bucket = "flagged" | "uncategorized" | "transfer";

function bucketOf(txn: TransactionWithCategory): Bucket {
  if (txn.kind === "transfer") return "transfer";
  if (txn.categoryId == null) return "uncategorized";
  return "flagged";
}

export function ReviewPage() {
  const t = useTranslations("review");
  const queryClient = useQueryClient();
  const [focus, setFocus] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["reviewTransactions"],
    queryFn: getReviewTransactions,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories", "review"],
    queryFn: () => getCategories(),
  });

  const txns = useMemo(() => data?.transactions ?? [], [data]);
  const loading = isLoading || !data;

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["reviewTransactions"] });
    queryClient.invalidateQueries({ queryKey: ["insights"] });
    queryClient.invalidateQueries({ queryKey: ["forecast"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
  }, [queryClient]);

  const groups = useMemo(() => {
    const flagged: TransactionWithCategory[] = [];
    const uncategorized: TransactionWithCategory[] = [];
    const transfer: TransactionWithCategory[] = [];
    for (const txn of txns) {
      const bucket = bucketOf(txn);
      if (bucket === "transfer") transfer.push(txn);
      else if (bucket === "uncategorized") uncategorized.push(txn);
      else flagged.push(txn);
    }
    return { flagged, uncategorized, transfer };
  }, [txns]);

  return (
    <>
      <PageHeader
        title={t("pageTitle")}
        meta={!loading && txns.length > 0 ? t("countMeta", { count: txns.length }) : undefined}
        actions={
          !loading && txns.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setFocus(true)}>
              <ScanEye className="size-3.5" />
              {t("focusMode")}
            </Button>
          ) : undefined
        }
      />

      {focus && txns.length > 0 ? (
        <FocusMode
          queue={txns}
          categories={categories}
          onExit={() => setFocus(false)}
          invalidate={invalidate}
        />
      ) : (
        <div className="space-y-5 p-4 md:p-6 lg:p-8">
          {loading ? (
            <CardSkeleton height={200} />
          ) : isError ? (
            <CardError label={t("pageTitle")} onRetry={refetch} />
          ) : txns.length === 0 ? (
            <AllClear />
          ) : (
            <>
              <ProgressSummary groups={groups} />
              <div className="flex flex-col gap-5">
                {groups.flagged.length > 0 && (
                  <ReviewGroup
                    icon={<HelpCircle />}
                    title={t("groupFlaggedTitle")}
                    description={t("groupFlaggedDescription")}
                    count={groups.flagged.length}
                    bulk={
                      <AcceptAllButton
                        ids={groups.flagged.map((x) => x.id)}
                        invalidate={invalidate}
                      />
                    }
                  >
                    {groups.flagged.map((txn) => (
                      <ReviewRow
                        key={txn.id}
                        txn={txn}
                        categories={categories}
                        invalidate={invalidate}
                      />
                    ))}
                  </ReviewGroup>
                )}
                {groups.uncategorized.length > 0 && (
                  <ReviewGroup
                    icon={<Tags />}
                    title={t("groupUncategorizedTitle")}
                    description={t("groupUncategorizedDescription")}
                    count={groups.uncategorized.length}
                    bulk={<CategorizeButton onApplied={invalidate} />}
                  >
                    {groups.uncategorized.map((txn) => (
                      <ReviewRow
                        key={txn.id}
                        txn={txn}
                        categories={categories}
                        invalidate={invalidate}
                      />
                    ))}
                  </ReviewGroup>
                )}
                {groups.transfer.length > 0 && (
                  <ReviewGroup
                    icon={<ArrowLeftRight />}
                    title={t("groupTransferTitle")}
                    description={t("groupTransferDescription")}
                    count={groups.transfer.length}
                  >
                    {groups.transfer.map((txn) => (
                      <ReviewRow
                        key={txn.id}
                        txn={txn}
                        categories={categories}
                        invalidate={invalidate}
                      />
                    ))}
                  </ReviewGroup>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

function ProgressSummary({
  groups,
}: {
  groups: {
    flagged: TransactionWithCategory[];
    uncategorized: TransactionWithCategory[];
    transfer: TransactionWithCategory[];
  };
}) {
  const t = useTranslations("review");
  const total = groups.flagged.length + groups.uncategorized.length + groups.transfer.length;
  const stats = [
    {
      label: t("groupFlaggedTitle"),
      count: groups.flagged.length,
      color: "var(--status-plenty-left)",
    },
    {
      label: t("groupUncategorizedTitle"),
      count: groups.uncategorized.length,
      color: "var(--status-heads-up)",
    },
    {
      label: t("groupTransferTitle"),
      count: groups.transfer.length,
      color: "var(--muted-foreground)",
    },
  ].filter((s) => s.count > 0);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">{t("summaryTitle")}</h2>
        <span className="text-sm text-muted-foreground">
          {t("summaryRemaining", { count: total })}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {stats.map((s) => (
          <span
            key={s.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 text-xs"
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: s.color }}
              aria-hidden
            />
            <span className="font-medium tabular-nums">{s.count}</span>
            <span className="text-muted-foreground">{s.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ReviewGroup({
  icon,
  title,
  description,
  count,
  bulk,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  count: number;
  bulk?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-3.5"
            aria-hidden
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
              <span className="truncate">{title}</span>
              <span className="shrink-0 rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">
                {count}
              </span>
            </h2>
            <p className="truncate text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {bulk && <div className="shrink-0">{bulk}</div>}
      </div>
      <div className="grid items-start gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        <AnimatePresence initial={false}>{children}</AnimatePresence>
      </div>
    </section>
  );
}

function AcceptAllButton({ ids, invalidate }: { ids: number[]; invalidate: () => void }) {
  const t = useTranslations("review");
  const [busy, setBusy] = useState(false);
  const acceptAll = async () => {
    setBusy(true);
    try {
      for (const id of ids) await approveTransactionCategory(id);
      toast.success(t("acceptedAllToast", { count: ids.length }));
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("actionFailed"));
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" size="sm" disabled={busy} onClick={acceptAll}>
      <Check className="size-3.5" />
      {t("acceptAll")}
    </Button>
  );
}

function leafCategoriesFor(categories: Category[], kind: "expense" | "income"): Category[] {
  const parentIds = new Set(
    categories.map((c) => c.parentId).filter((id): id is number => id != null),
  );
  return categories.filter((c) => c.kind === kind && !parentIds.has(c.id));
}

function CategoryPicker({
  label,
  variant,
  kind,
  categories,
  onPick,
  disabled,
}: {
  label: string;
  variant: "default" | "outline";
  kind: "expense" | "income";
  categories: Category[];
  onPick: (categoryId: number) => void;
  disabled?: boolean;
}) {
  const tCat = useTranslations("categoriesSeeded");
  const options = leafCategoriesFor(categories, kind);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant={variant} size="sm" disabled={disabled}>
            <Tags className="size-3.5" />
            {label}
            <ChevronDown className="size-3.5 opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="max-h-[20rem]">
        {options.map((c) => (
          <DropdownMenuItem key={c.id} onClick={() => onPick(c.id)} className="gap-2">
            <span className="size-2.5 rounded-full" style={{ background: c.color }} aria-hidden />
            {translateCategoryName(c.name, tCat)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function useReviewActions(txn: TransactionWithCategory, invalidate: () => void) {
  const t = useTranslations("review");
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (fn: () => Promise<unknown>, message: string) => {
      setBusy(true);
      try {
        await fn();
        toast.success(message);
        invalidate();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("actionFailed"));
        setBusy(false);
      }
    },
    [invalidate, t],
  );

  const accept = () => run(() => approveTransactionCategory(txn.id), t("savedApproved"));
  const keepTransfer = () => run(() => approveTransactionCategory(txn.id), t("savedKeptTransfer"));
  const exclude = () => run(() => setTransactionExcluded(txn.id, true), t("savedExcluded"));
  const categorize = (categoryId: number) =>
    run(async () => {
      if (txn.kind === "transfer") await setTransactionKind(txn.id, "expense");
      await updateTransactionCategory(txn.id, categoryId);
    }, t("savedCategorized"));

  return { busy, accept, keepTransfer, exclude, categorize };
}

function SourceMeta({ txn }: { txn: TransactionWithCategory }) {
  const tBanks = useTranslations("banks");
  const info = BANK_PROVIDERS.find((b) => b.id === txn.provider);
  const providerName = translateProviderName(txn.provider, info?.name ?? txn.provider, tBanks);
  const source = txn.accountLabel?.trim() || txn.accountName?.trim() || providerName;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {info ? (
        <ProviderBadge
          color={info.color}
          name={providerName}
          domain={info.domain}
          size={14}
          radius={4}
        />
      ) : null}
      <span className="truncate">{source}</span>
    </span>
  );
}

function TxnAmount({ txn }: { txn: TransactionWithCategory }) {
  const locale = useLocale() as Locale;
  const income = txn.kind === "income";
  return (
    <span
      className={`shrink-0 text-sm font-semibold tabular-nums ${income ? "text-status-on-track" : "text-foreground"}`}
    >
      {income ? "+" : "-"}
      {formatCurrency(Math.abs(txn.chargedAmount), txn.chargedCurrency ?? "ILS", locale)}
    </span>
  );
}

function AiGuess({ txn }: { txn: TransactionWithCategory }) {
  const t = useTranslations("review");
  const tCat = useTranslations("categoriesSeeded");
  if (txn.categoryName == null) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">{t("aiGuess")}</span>
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium"
        style={{
          backgroundColor: txn.categoryColor ? `${txn.categoryColor}1f` : "var(--muted)",
          color: txn.categoryColor ?? "var(--foreground)",
        }}
      >
        {txn.categoryColor && (
          <span
            className="size-1.5 rounded-full"
            style={{ background: txn.categoryColor }}
            aria-hidden
          />
        )}
        {translateCategoryName(txn.categoryName, tCat)}
      </span>
      {txn.aiConfidence != null && (
        <span className="tabular-nums text-muted-foreground">
          {t("confidence", { score: txn.aiConfidence })}
        </span>
      )}
    </span>
  );
}

function ReviewRow({
  txn,
  categories,
  invalidate,
}: {
  txn: TransactionWithCategory;
  categories: Category[];
  invalidate: () => void;
}) {
  const bucket = bucketOf(txn);
  const kind = txn.kind === "income" ? "income" : "expense";
  const { busy, accept, keepTransfer, exclude, categorize } = useReviewActions(txn, invalidate);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className="flex h-full flex-col rounded-xl border border-border bg-card p-4 transition-colors duration-200 ease-out hover:border-foreground/20"
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
            <SourceMeta txn={txn} />
          </div>
          {bucket === "flagged" && (
            <div className="mt-1.5">
              <AiGuess txn={txn} />
            </div>
          )}
        </div>
        <TxnAmount txn={txn} />
      </div>

      <div className="mt-auto">
        <RowActions
          bucket={bucket}
          kind={kind}
          categories={categories}
          busy={busy}
          onAccept={accept}
          onKeepTransfer={keepTransfer}
          onExclude={exclude}
          onCategorize={categorize}
        />
      </div>
    </motion.div>
  );
}

function RowActions({
  bucket,
  kind,
  categories,
  busy,
  onAccept,
  onKeepTransfer,
  onExclude,
  onCategorize,
}: {
  bucket: Bucket;
  kind: "expense" | "income";
  categories: Category[];
  busy: boolean;
  onAccept: () => void;
  onKeepTransfer: () => void;
  onExclude: () => void;
  onCategorize: (categoryId: number) => void;
}) {
  const t = useTranslations("review");
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {bucket === "flagged" && (
        <>
          <Button variant="default" size="sm" disabled={busy} onClick={onAccept}>
            <Check className="size-3.5" />
            {t("accept")}
          </Button>
          <CategoryPicker
            label={t("change")}
            variant="outline"
            kind={kind}
            categories={categories}
            onPick={onCategorize}
            disabled={busy}
          />
        </>
      )}
      {bucket === "uncategorized" && (
        <CategoryPicker
          label={t("pickCategory")}
          variant="default"
          kind={kind}
          categories={categories}
          onPick={onCategorize}
          disabled={busy}
        />
      )}
      {bucket === "transfer" && (
        <>
          <Button variant="default" size="sm" disabled={busy} onClick={onKeepTransfer}>
            <ArrowLeftRight className="size-3.5" />
            {t("keepTransfer")}
          </Button>
          <CategoryPicker
            label={t("itsSpending")}
            variant="outline"
            kind="expense"
            categories={categories}
            onPick={onCategorize}
            disabled={busy}
          />
        </>
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        className="ms-auto text-muted-foreground"
        onClick={onExclude}
      >
        <EyeOff className="size-3.5" />
        {t("exclude")}
      </Button>
    </div>
  );
}

function FocusMode({
  queue,
  categories,
  onExit,
  invalidate,
}: {
  queue: TransactionWithCategory[];
  categories: Category[];
  onExit: () => void;
  invalidate: () => void;
}) {
  const t = useTranslations("review");
  const [items] = useState(queue);
  const [index, setIndex] = useState(0);
  const total = items.length;
  const txn = items[index];

  const next = useCallback(() => setIndex((i) => i + 1), []);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onExit]);

  const done = index >= total;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground tabular-nums">
            {done
              ? t("focusProgressDone", { total })
              : t("focusProgress", { current: index + 1, total })}
          </span>
          <Button variant="ghost" size="sm" onClick={onExit}>
            <X className="size-3.5" />
            {t("focusExit")}
          </Button>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${total > 0 ? (Math.min(index, total) / total) * 100 : 0}%` }}
            aria-hidden
          />
        </div>

        <div className="mt-6">
          <AnimatePresence mode="wait">
            {done ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl border border-border bg-card p-10 text-center"
              >
                <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-status-on-track/12 text-status-on-track">
                  <CircleCheck className="size-6" />
                </span>
                <h2 className="text-xl font-semibold tracking-tight">{t("focusDoneTitle")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("focusDoneBody")}</p>
                <Button className="mt-5" onClick={onExit}>
                  {t("focusBack")}
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key={txn.id}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.18 }}
              >
                <FocusCard
                  txn={txn}
                  categories={categories}
                  invalidate={invalidate}
                  onNext={next}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!done && (
          <div className="mt-4 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={prev} disabled={index === 0}>
              <ArrowLeft className="size-3.5" />
              {t("focusPrev")}
            </Button>
            <Button variant="ghost" size="sm" onClick={next}>
              {t("focusSkip")}
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function FocusCard({
  txn,
  categories,
  invalidate,
  onNext,
}: {
  txn: TransactionWithCategory;
  categories: Category[];
  invalidate: () => void;
  onNext: () => void;
}) {
  const bucket = bucketOf(txn);
  const kind = txn.kind === "income" ? "income" : "expense";
  const { busy, accept, keepTransfer, exclude, categorize } = useReviewActions(txn, invalidate);

  const after = (fn: () => Promise<void> | void) => () => {
    fn();
    onNext();
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold tracking-tight">{txn.description}</div>
          {txn.memo && (
            <div className="mt-0.5 truncate text-sm text-muted-foreground/80">{txn.memo}</div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="tabular-nums">{formatDate(txn.date)}</span>
            <span aria-hidden>·</span>
            <SourceMeta txn={txn} />
          </div>
        </div>
        <TxnAmount txn={txn} />
      </div>

      {bucket === "flagged" && (
        <div className="mt-4 rounded-lg bg-muted/50 p-3">
          <AiGuess txn={txn} />
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <RowActions
          bucket={bucket}
          kind={kind}
          categories={categories}
          busy={busy}
          onAccept={after(accept)}
          onKeepTransfer={after(keepTransfer)}
          onExclude={after(exclude)}
          onCategorize={(id) => {
            categorize(id);
            onNext();
          }}
        />
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
