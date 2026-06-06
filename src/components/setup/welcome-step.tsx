"use client";

import { motion } from "framer-motion";
import { Lock, RefreshCw, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function WelcomeStep({ onComplete }: { onComplete: () => void }) {
  const t = useTranslations("setup");
  const points = [
    { Icon: RefreshCw, title: t("welcomeValueAutoTitle"), body: t("welcomeValueAutoBody") },
    {
      Icon: TrendingUp,
      title: t("welcomeValueForecastTitle"),
      body: t("welcomeValueForecastBody"),
    },
    { Icon: Lock, title: t("welcomeValuePrivateTitle"), body: t("welcomeValuePrivateBody") },
  ];

  return (
    <div className="mx-auto w-full max-w-[480px]">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
          {t("welcomeKicker")}
        </div>
        <h1 className="mt-2 font-semibold text-4xl leading-[1.05] tracking-tight">
          {t("welcomeHeadline")}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          {t("welcomeSubhead")}
        </p>
      </motion.div>

      <div className="mt-7 flex flex-col gap-1">
        {points.map(({ Icon, title, body }, i) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.07, duration: 0.3 }}
            className="flex items-start gap-3.5 rounded-xl px-3 py-3 transition-colors hover:bg-muted/50"
          >
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <Icon className="size-[18px]" />
            </span>
            <div>
              <div className="text-sm font-semibold">{title}</div>
              <div className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{body}</div>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.36 }}
        className="mt-8"
      >
        <Button size="lg" onClick={onComplete} className="w-full sm:w-auto">
          {t("welcomeCta")}
        </Button>
      </motion.div>
    </div>
  );
}
