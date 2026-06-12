import fs from "node:fs";
import path from "node:path";
import { saveBankCredentials } from "@/server/db/queries/bank-credentials";
import { getCategoryByName } from "@/server/db/queries/categories";
import { setGlobalSetting, setWorkspaceSetting } from "@/server/db/queries/settings";
import { completeSyncRun, createSyncRun } from "@/server/db/queries/sync-runs";
import {
  batchUpdateCategories,
  insertTransactions,
  queryTransactions,
} from "@/server/db/queries/transactions";
import { updateWorkspace } from "@/server/db/queries/workspaces";
import { generateDemoDataset } from "./lib/demo-data";

const WORKSPACE_ID = 1;

function wipeDataDir(): void {
  const dir = process.env.BUDGETEER_DATA_DIR
    ? path.resolve(process.env.BUDGETEER_DATA_DIR)
    : path.join(process.cwd(), "demo-data");
  if (dir === path.join(process.cwd(), "data") || dir.endsWith(`${path.sep}data`)) {
    throw new Error(`Refusing to wipe a real data dir: ${dir}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

function main(): void {
  wipeDataDir();

  const dataset = generateDemoDataset(new Date());

  updateWorkspace(WORKSPACE_ID, dataset.workspaceName);

  const credentialId = saveBankCredentials(WORKSPACE_ID, dataset.bankProvider, {
    userCode: "demo-user",
    password: "demo-password",
  });

  const scrapeFrom = dataset.transactions[0]?.date ?? new Date().toISOString().slice(0, 10);
  const syncRunId = createSyncRun(WORKSPACE_ID, dataset.bankProvider, credentialId, scrapeFrom);

  const raw = dataset.transactions.map((t) => ({
    accountNumber: dataset.accountNumber,
    date: t.date,
    processedDate: t.date,
    originalAmount: t.originalAmount ?? t.chargedAmount,
    originalCurrency: t.originalCurrency ?? "ILS",
    chargedAmount: t.chargedAmount,
    chargedCurrency: "ILS",
    description: t.description,
    memo: "",
    type: "normal" as const,
    status: "completed" as const,
  }));

  const result = insertTransactions(
    WORKSPACE_ID,
    raw,
    dataset.bankProvider,
    credentialId,
    syncRunId,
  );

  const descriptionToCategory = new Map<string, string>();
  for (const t of dataset.transactions) descriptionToCategory.set(t.description, t.categoryName);

  const categoryIdByName = new Map<string, number>();
  for (const name of new Set(descriptionToCategory.values())) {
    const cat = getCategoryByName(WORKSPACE_ID, name);
    if (!cat) throw new Error(`Seed category not found: ${name}`);
    categoryIdByName.set(name, cat.id);
  }

  const updates: { id: number; categoryId: number }[] = [];
  let offset = 0;
  while (true) {
    const page = queryTransactions(WORKSPACE_ID, { limit: 200, offset });
    for (const row of page.transactions) {
      const name = descriptionToCategory.get(row.description);
      if (!name) continue;
      const categoryId = categoryIdByName.get(name);
      if (categoryId != null) updates.push({ id: row.id, categoryId });
    }
    offset += page.transactions.length;
    if (offset >= page.total || page.transactions.length === 0) break;
  }
  batchUpdateCategories(WORKSPACE_ID, updates);

  setWorkspaceSetting(WORKSPACE_ID, "payday_day", String(dataset.settings.paydayDay));
  setWorkspaceSetting(WORKSPACE_ID, "monthly_target", String(dataset.settings.monthlyTarget));
  setWorkspaceSetting(WORKSPACE_ID, "current_balance", String(dataset.settings.currentBalance));
  setWorkspaceSetting(WORKSPACE_ID, "current_balance_date", dataset.settings.currentBalanceDate);
  setGlobalSetting("ai_provider", "ollama");

  completeSyncRun(syncRunId, result.added, result.updated);

  const months = new Set(dataset.transactions.map((t) => t.date.slice(0, 7)));
  console.log(
    `Demo data ready: workspace "${dataset.workspaceName}", ${result.added} transactions across ${months.size} months (${dataset.transactions[0]?.date} to ${dataset.transactions.at(-1)?.date}). Launch with: bun run demo`,
  );
}

main();
