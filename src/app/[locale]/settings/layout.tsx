import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { SettingsNav } from "@/components/settings/settings-nav";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("settings") };
}

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("settings");
  return (
    <AppShell>
      <PageHeader title={t("pageTitle")} />
      <SettingsNav />
      <div className="p-4 md:p-6 lg:p-8">{children}</div>
    </AppShell>
  );
}
