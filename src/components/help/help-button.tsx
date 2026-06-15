"use client";

import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarRange,
  CreditCard,
  Filter,
  Gauge,
  HelpCircle,
  LineChart,
  ListChecks,
  PiggyBank,
  Sparkles,
  Tags,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { HELP_SECTIONS, type HelpIconName, type HelpPageKey } from "@/components/help/help-content";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const ICON_MAP: Record<HelpIconName, React.ComponentType<{ className?: string }>> = {
  AlertTriangle,
  ArrowLeftRight,
  CalendarRange,
  CreditCard,
  Filter,
  Gauge,
  LineChart,
  ListChecks,
  PiggyBank,
  Sparkles,
  Tags,
  Wallet,
};

export function HelpButton({ page }: { page: HelpPageKey }) {
  const t = useTranslations("help");
  const [open, setOpen] = useState(false);
  const sections = HELP_SECTIONS[page];

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("triggerLabel")}
        onClick={() => setOpen(true)}
      >
        <HelpCircle className="size-4" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="font-serif text-2xl font-normal">
              {t(`${page}.title`)}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-6 px-4 pb-8">
            <p className="text-sm text-muted-foreground">{t(`${page}.intro`)}</p>
            <ul className="space-y-5">
              {sections.map(({ id, icon }) => {
                const Icon = ICON_MAP[icon];
                return (
                  <li key={id} className="flex gap-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <Icon className="size-4" />
                    </span>
                    <div className="space-y-1">
                      <h3 className="text-sm font-medium">{t(`${page}.sections.${id}.title`)}</h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {t(`${page}.sections.${id}.body`)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
