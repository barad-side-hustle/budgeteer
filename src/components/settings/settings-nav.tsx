"use client";

import { Landmark, Layers, Palette, ShieldAlert, SlidersHorizontal, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  labelKey: string;
  Icon: React.ComponentType<{ className?: string }>;
  match: (p: string) => boolean;
}

const ITEMS: NavItem[] = [
  {
    href: "/settings/general",
    labelKey: "general",
    Icon: SlidersHorizontal,
    match: (p) => p === "/settings/general" || p === "/settings",
  },
  {
    href: "/settings/bank",
    labelKey: "bank",
    Icon: Landmark,
    match: (p) => p.startsWith("/settings/bank"),
  },
  {
    href: "/settings/ai",
    labelKey: "ai",
    Icon: Sparkles,
    match: (p) => p.startsWith("/settings/ai"),
  },
  {
    href: "/settings/categories",
    labelKey: "categories",
    Icon: Layers,
    match: (p) => p.startsWith("/settings/categories"),
  },
  {
    href: "/settings/appearance",
    labelKey: "appearance",
    Icon: Palette,
    match: (p) => p.startsWith("/settings/appearance"),
  },
  {
    href: "/settings/data",
    labelKey: "data",
    Icon: ShieldAlert,
    match: (p) => p.startsWith("/settings/data"),
  },
];

export function SettingsNav() {
  const pathname = usePathname();
  const t = useTranslations("settings.sidebar");
  return (
    <div className="sticky top-14 z-10 border-b border-border/40 bg-background/80 backdrop-blur md:top-16">
      <nav className="flex gap-1 overflow-x-auto px-4 md:px-6 lg:px-8">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm transition-colors",
                active
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <item.Icon className="size-4 shrink-0 opacity-80" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
