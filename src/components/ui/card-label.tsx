import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function CardLabel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-label"
      className={cn(
        "text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { CardLabel };
