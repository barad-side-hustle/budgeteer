import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const TONE_FG = {
  good: "var(--status-on-track)",
  bad: "var(--status-over)",
  muted: "var(--muted-foreground)",
} as const;

export function DeltaBadge({
  percent,
  goodWhen = "down",
  className,
}: {
  percent: number | null | undefined;
  goodWhen?: "up" | "down";
  className?: string;
}) {
  if (percent == null) return null;
  const rounded = Math.round(percent);
  const flat = rounded === 0;
  const up = rounded > 0;
  const tone = flat ? "muted" : (goodWhen === "up" ? up : !up) ? "good" : "bad";
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const fg = TONE_FG[tone];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums",
        className,
      )}
      style={{ color: fg, backgroundColor: `color-mix(in oklch, ${fg} 12%, transparent)` }}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {Math.abs(rounded)}%
    </span>
  );
}
