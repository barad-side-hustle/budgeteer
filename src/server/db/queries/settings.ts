import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { type AppSettings, RECOMMENDED_GEMINI_MODELS } from "@/lib/types";
import { getOrm } from "@/server/db/orm";
import { settings, workspaceSettings } from "@/server/db/schema";
import { toLocalISODate } from "@/server/lib/date-utils";

export function getGlobalSetting(key: string): string | null {
  const row = getOrm()
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .get();
  return row?.value ?? null;
}

export function setGlobalSetting(key: string, value: string): void {
  getOrm()
    .insert(settings)
    .values({ key, value, updatedAt: sql`datetime('now')` })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: sql`datetime('now')` },
    })
    .run();
}

export function deleteGlobalSetting(key: string): void {
  getOrm().delete(settings).where(eq(settings.key, key)).run();
}

export function getWorkspaceSetting(workspaceId: number, key: string): string | null {
  const row = getOrm()
    .select({ value: workspaceSettings.value })
    .from(workspaceSettings)
    .where(and(eq(workspaceSettings.workspaceId, workspaceId), eq(workspaceSettings.key, key)))
    .get();
  return row?.value ?? null;
}

export function setWorkspaceSetting(workspaceId: number, key: string, value: string): void {
  getOrm()
    .insert(workspaceSettings)
    .values({ workspaceId, key, value, updatedAt: sql`datetime('now')` })
    .onConflictDoUpdate({
      target: [workspaceSettings.workspaceId, workspaceSettings.key],
      set: { value, updatedAt: sql`datetime('now')` },
    })
    .run();
}

export function deleteWorkspaceSetting(workspaceId: number, key: string): void {
  getOrm()
    .delete(workspaceSettings)
    .where(and(eq(workspaceSettings.workspaceId, workspaceId), eq(workspaceSettings.key, key)))
    .run();
}

export interface BalanceAnchor {
  amount: number;
  date: string;
}

export function getBalanceAnchor(workspaceId: number): BalanceAnchor | null {
  const amountRaw = getWorkspaceSetting(workspaceId, "current_balance");
  if (amountRaw == null) return null;
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount)) return null;
  const date = getWorkspaceSetting(workspaceId, "current_balance_date") ?? "";
  return { amount, date };
}

export const getSetting = getGlobalSetting;
export const setSetting = setGlobalSetting;

const AUTO_SYNC_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_GEMINI_MODEL = RECOMMENDED_GEMINI_MODELS[0].name;

export function getAppSettings(workspaceId: number): AppSettings {
  const targetRaw = getWorkspaceSetting(workspaceId, "monthly_target");
  const target = targetRaw != null ? Number(targetRaw) : NaN;
  const balanceRaw = getWorkspaceSetting(workspaceId, "current_balance");
  const balance = balanceRaw != null ? Number(balanceRaw) : NaN;
  const storedTime = getGlobalSetting("auto_sync_time");
  return {
    currentBalance: Number.isFinite(balance) ? balance : null,
    balanceDate: getWorkspaceSetting(workspaceId, "current_balance_date"),
    monthsToSync: Number(getWorkspaceSetting(workspaceId, "months_to_sync") ?? "3"),
    aiProvider: (getGlobalSetting("ai_provider") ?? "none") as AppSettings["aiProvider"],
    geminiModel: getGlobalSetting("ai_gemini_model") ?? DEFAULT_GEMINI_MODEL,
    ollamaUrl: getGlobalSetting("ai_ollama_url") ?? "http://localhost:11434",
    ollamaModel: getGlobalSetting("ai_ollama_model") ?? "llama3.2:3b",
    showBrowser: getWorkspaceSetting(workspaceId, "scraper_show_browser") === "true",
    paydayDay: Number(getWorkspaceSetting(workspaceId, "payday_day") ?? "1"),
    monthlyTarget: Number.isFinite(target) && target > 0 ? target : null,
    autoSyncEnabled: getGlobalSetting("auto_sync_enabled") === "true",
    autoSyncTime: storedTime && AUTO_SYNC_TIME_RE.test(storedTime) ? storedTime : "06:00",
    treatAtmAsTransfers: getGlobalSetting("treat_atm_as_transfers") === "true",
  };
}

export function updateAppSettings(
  workspaceId: number,
  settingsToApply: Partial<AppSettings>,
): AppSettings {
  getOrm().transaction((tx) => {
    if (settingsToApply.monthsToSync !== undefined) {
      setWorkspaceSetting(workspaceId, "months_to_sync", String(settingsToApply.monthsToSync));
    }
    if (settingsToApply.aiProvider !== undefined) {
      setGlobalSetting("ai_provider", settingsToApply.aiProvider);
    }
    if (settingsToApply.ollamaUrl !== undefined) {
      setGlobalSetting("ai_ollama_url", settingsToApply.ollamaUrl);
    }
    if (settingsToApply.ollamaModel !== undefined) {
      setGlobalSetting("ai_ollama_model", settingsToApply.ollamaModel);
    }
    if (settingsToApply.geminiModel !== undefined) {
      setGlobalSetting("ai_gemini_model", settingsToApply.geminiModel);
    }
    if (settingsToApply.showBrowser !== undefined) {
      setWorkspaceSetting(
        workspaceId,
        "scraper_show_browser",
        settingsToApply.showBrowser ? "true" : "false",
      );
    }
    if (settingsToApply.paydayDay !== undefined) {
      const clamped = Math.max(1, Math.min(28, Math.round(settingsToApply.paydayDay)));
      setWorkspaceSetting(workspaceId, "payday_day", String(clamped));
    }
    if (settingsToApply.monthlyTarget !== undefined) {
      const t = settingsToApply.monthlyTarget;
      if (t == null || !Number.isFinite(t) || t <= 0) {
        tx.delete(workspaceSettings)
          .where(
            and(
              eq(workspaceSettings.workspaceId, workspaceId),
              eq(workspaceSettings.key, "monthly_target"),
            ),
          )
          .run();
      } else {
        setWorkspaceSetting(workspaceId, "monthly_target", String(Math.round(t)));
      }
    }
    if (settingsToApply.autoSyncEnabled !== undefined) {
      setGlobalSetting("auto_sync_enabled", settingsToApply.autoSyncEnabled ? "true" : "false");
    }
    if (settingsToApply.autoSyncTime !== undefined) {
      if (!AUTO_SYNC_TIME_RE.test(settingsToApply.autoSyncTime)) {
        throw new Error("autoSyncTime must be HH:MM 24-hour");
      }
      setGlobalSetting("auto_sync_time", settingsToApply.autoSyncTime);
    }
    if (settingsToApply.treatAtmAsTransfers !== undefined) {
      setGlobalSetting(
        "treat_atm_as_transfers",
        settingsToApply.treatAtmAsTransfers ? "true" : "false",
      );
    }
    if (settingsToApply.currentBalance !== undefined) {
      const b = settingsToApply.currentBalance;
      if (b == null || !Number.isFinite(b)) {
        deleteWorkspaceSetting(workspaceId, "current_balance");
        deleteWorkspaceSetting(workspaceId, "current_balance_date");
      } else {
        setWorkspaceSetting(workspaceId, "current_balance", String(b));
        const date = settingsToApply.balanceDate ?? toLocalISODate(new Date());
        setWorkspaceSetting(workspaceId, "current_balance_date", date);
      }
    }
  });
  return getAppSettings(workspaceId);
}
