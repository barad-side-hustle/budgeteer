"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

interface CardShellProps {
  label?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function CardShell({
  label,
  description,
  icon,
  action,
  children,
  className,
}: CardShellProps) {
  return (
    <div
      className={cn("flex h-full flex-col rounded-xl border border-border bg-card p-5", className)}
    >
      {(label || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && (
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-3.5"
                aria-hidden
              >
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {label && (
                <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">
                  {label}
                </h2>
              )}
              {description && (
                <p className="truncate text-xs text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          {action && <div className="shrink-0 text-xs text-muted-foreground">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function CardAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="underline-offset-4 hover:text-foreground hover:underline">
      {children}
    </Link>
  );
}

export function CardSkeleton({
  label,
  height = 140,
  className,
}: {
  label?: string;
  height?: number;
  className?: string;
}) {
  return (
    <CardShell label={label} className={className}>
      <Skeleton className="w-full" style={{ height }} />
    </CardShell>
  );
}

export function CardError({
  label,
  className,
  onRetry,
}: {
  label?: string;
  className?: string;
  onRetry?: () => void;
}) {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  return (
    <CardShell label={label} className={className}>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center text-sm text-muted-foreground">
        {t("couldntLoad")}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {tc("retry")}
          </button>
        )}
      </div>
    </CardShell>
  );
}
