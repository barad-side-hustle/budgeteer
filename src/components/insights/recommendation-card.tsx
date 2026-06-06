"use client";

import { AlertTriangle, ArrowRight, Lightbulb, PartyPopper, Zap } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatCurrency } from "@/lib/formatters";
import type { Recommendation, RecommendationTone } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONE_STYLE: Record<RecommendationTone, { Icon: typeof Zap; chip: string }> = {
  celebrate: { Icon: PartyPopper, chip: "bg-status-on-track/12 text-status-on-track" },
  encourage: { Icon: Lightbulb, chip: "bg-primary/12 text-primary" },
  watch: { Icon: AlertTriangle, chip: "bg-status-heads-up/12 text-status-heads-up" },
  act: { Icon: Zap, chip: "bg-status-over/12 text-status-over" },
};

const CTA_KEY: Record<string, string> = {
  "/transactions": "recCtaReview",
  "/insights": "recCtaSave",
  "/settings/general": "recCtaBalance",
};

export function RecommendationCard({ rec }: { rec: Recommendation }) {
  // Keys are accessed dynamically (rec_<type>_title/body); they live in the
  // `recommendations` namespace, which is on the i18n-check dynamic allowlist.
  const t = useTranslations("recommendations");
  const locale = useLocale() as Locale;
  const { Icon, chip } = TONE_STYLE[rec.tone];

  const values = {
    amount: rec.amount != null ? formatCurrency(Math.abs(rec.amount), "ILS", locale) : "",
    amount2: rec.amount2 != null ? formatCurrency(Math.abs(rec.amount2), "ILS", locale) : "",
    category: rec.categoryName ?? "",
    merchant: rec.merchant ?? "",
  };

  const ctaKey = rec.href ? (CTA_KEY[rec.href] ?? "recCtaView") : null;

  return (
    <div className="flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", chip)}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-tight">
            {t(`rec_${rec.type}_title`, values)}
          </h3>
          <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
            {t(`rec_${rec.type}_body`, values)}
          </p>
        </div>
      </div>
      {rec.href && ctaKey && (
        <Link
          href={rec.href}
          className="ms-11 inline-flex items-center gap-1 text-xs font-medium text-foreground underline-offset-4 hover:underline"
        >
          {t(ctaKey)}
          <ArrowRight className="size-3" />
        </Link>
      )}
    </div>
  );
}
