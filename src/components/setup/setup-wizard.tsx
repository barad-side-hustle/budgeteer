"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { AIStep } from "@/components/setup/ai-step";
import { BankStep } from "@/components/setup/bank-step";
import { BudgetsStep } from "@/components/setup/budgets-step";
import { CompleteStep } from "@/components/setup/complete-step";
import { MonthlyTargetStep } from "@/components/setup/monthly-target-step";
import { WelcomeStep } from "@/components/setup/welcome-step";
import { WorkspaceNameStep } from "@/components/setup/workspace-name-step";
import { useRouter } from "@/i18n/navigation";
import { createWorkspace } from "@/lib/api";
import { GITHUB_REPO_URL } from "@/lib/constants";
import { setActiveWorkspaceId } from "@/lib/workspace-store";

export type SetupMode = "first-run" | "new-workspace";

type Step = "welcome" | "name" | "connect" | "ai" | "target" | "budgets" | "done";

const FLOWS: Record<SetupMode, Step[]> = {
  "first-run": ["welcome", "connect", "ai", "target", "budgets", "done"],
  "new-workspace": ["name", "connect", "target", "budgets", "done"],
};

const variants = {
  enter: (dir: number) => ({ x: dir >= 0 ? 36 : -36, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir >= 0 ? -36 : 36, opacity: 0 }),
};

export function SetupWizard({ mode = "first-run" }: { mode?: SetupMode }) {
  const t = useTranslations("setup");
  const tNav = useTranslations("nav");
  const router = useRouter();
  const queryClient = useQueryClient();
  const flow = FLOWS[mode];
  const [step, setStep] = useState<Step>(flow[0]);
  const [dir, setDir] = useState(0);
  const [creating, setCreating] = useState(false);

  const idx = flow.indexOf(step);
  const goTo = (nextStep: Step, direction: number) => {
    setDir(direction);
    setStep(nextStep);
  };
  const next = () => goTo(flow[Math.min(idx + 1, flow.length - 1)], 1);
  const back = () => goTo(flow[Math.max(idx - 1, 0)], -1);

  async function handleNameSubmit(name: string) {
    setCreating(true);
    try {
      const ws = await createWorkspace(name);
      setActiveWorkspaceId(ws.id);
      queryClient.invalidateQueries();
      next();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("workspaceCreateFailed"));
    } finally {
      setCreating(false);
    }
  }

  function handleFinish() {
    queryClient.invalidateQueries();
    router.push("/?sync=1");
  }

  const total = flow.length;
  const current = idx + 1;
  const progress = total > 1 ? idx / (total - 1) : 1;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-muted/30 to-background px-4 py-8">
      <a
        href={GITHUB_REPO_URL}
        target="_blank"
        rel="noreferrer"
        className="absolute end-5 top-5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {t("docs")}
      </a>

      <div className="w-full max-w-[560px]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="Budgeteer" className="h-7 w-7" />
            <div>
              <div className="text-base font-semibold leading-none tracking-tight">Budgeteer</div>
              <div className="mt-1 text-[8px] font-bold tracking-[0.18em] text-muted-foreground">
                {tNav("brandTagline")}
              </div>
            </div>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {t("railStepLabel", { current, total })}
          </span>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-primary"
            animate={{ width: `${Math.round(progress * 100)}%` }}
            transition={{ duration: 0.4, ease: [0.2, 0.7, 0.3, 1] }}
          />
        </div>

        <div className="mt-4 h-[min(72vh,580px)] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex h-full flex-col overflow-y-auto px-6 py-8 md:px-10">
            <AnimatePresence mode="wait" custom={dir} initial={false}>
              <motion.div
                key={step}
                custom={dir}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.26, ease: [0.2, 0.7, 0.3, 1] }}
                className="m-auto w-full"
              >
                {step === "welcome" && <WelcomeStep onComplete={next} />}
                {step === "name" && (
                  <WorkspaceNameStep onComplete={handleNameSubmit} submitting={creating} />
                )}
                {step === "connect" && <BankStep onComplete={next} />}
                {step === "ai" && <AIStep onComplete={next} onBack={back} />}
                {step === "target" && <MonthlyTargetStep onComplete={next} onBack={back} />}
                {step === "budgets" && <BudgetsStep onComplete={next} onBack={back} />}
                {step === "done" && <CompleteStep onFinish={handleFinish} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" />
          {t("railReassure")}
        </div>
      </div>
    </div>
  );
}
