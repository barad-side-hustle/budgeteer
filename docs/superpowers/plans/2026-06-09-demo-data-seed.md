# Demo Data Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a committed seed script that builds a fully populated, demo-ready Budgeteer database in an isolated, gitignored directory so the app can be shown to others without real financial data.

**Architecture:** A pure, deterministic data generator (no DB, unit-tested) produces a synthetic dataset; a thin orchestrator script writes that dataset into a separate `demo-data/` database using the app's own query helpers (so schema, dedup, and `kind` detection stay correct). Two npm scripts build and launch the demo. Nothing real is touched; nothing fake is committed.

**Tech Stack:** TypeScript, Bun (test runner + script runtime), better-sqlite3 (via app helpers), Next.js dev server.

---

## Background the engineer needs

- **Data dir isolation:** `src/server/db/index.ts` resolves the DB directory from `process.env.BUDGETEER_DATA_DIR` (falling back to `./data`). Opening the DB (`getDb()`) runs all migrations, which create a `Default` workspace (id `1`) with seeded categories. So pointing a script at `BUDGETEER_DATA_DIR=./demo-data` gives it a fresh, migrated DB with workspace `1` already present.
- **`server-only`:** every file under `src/server/` starts with `import "server-only"`. Under plain `bun`, that import throws. The test runner and our seed script must run with `--conditions react-server`, which resolves `server-only` to an empty no-op. (This is the same flag the project's `test` script already uses.)
- **`@/` path alias:** `tsconfig.json` maps `@/*` to `src/*`. Bun honors tsconfig `paths`, so scripts may import `@/server/...`. If a path fails to resolve at runtime, fall back to a relative import.
- **Seeded category names** (exact strings, from `SEED_CATEGORIES` in `src/server/db/queries/workspaces.ts`): expense - `Groceries`, `Restaurants`, `Transport`, `Shopping`, `Entertainment`, `Health`, `Education`, `Bills & Utilities`, `Subscriptions`, `Travel`, `Cash & ATM`, `Transfers`, `Insurance`, `Home`, `Personal Care`, `Coffee & Cafes`, `Pet Care`, `Gifts & Donations`, `Kids & Childcare`, `Sports & Hobbies`; income - `Salary`, `Freelance & Side Income`, `Investment Income`, `Refunds & Reimbursements`.
- **`kind` detection** (`detectKind(description, provider, chargedAmount)` in `src/server/lib/transfers.ts`): for a bank provider, a positive `chargedAmount` becomes `income`, a transfer-pattern description becomes `transfer`, everything else `expense`. We use provider `hapoalim` (a bank, not a card) and plain English merchant names so salary lands as `income` and nothing accidentally becomes a `transfer`.
- **Relevant helper signatures (already exist, do not change):**
  - `updateWorkspace(id: number, name: string): Workspace` - `@/server/db/queries/workspaces`
  - `saveBankCredentials(workspaceId, provider, credentials: Record<string,string>, options?): number` - `@/server/db/queries/bank-credentials`
  - `createSyncRun(workspaceId, provider, credentialId, scrapeFromDate): number` and `completeSyncRun(id, added, updated): void` - `@/server/db/queries/sync-runs`
  - `insertTransactions(workspaceId, transactions, provider, credentialId, syncRunId): { added: number; updated: number }` - `@/server/db/queries/transactions`. The `transactions` array elements have this shape: `{ accountNumber, date, processedDate, originalAmount, originalCurrency, chargedAmount, chargedCurrency?, description, memo?, type: "normal"|"installments", status: "completed"|"pending", identifier?, installmentNumber?, installmentTotal? }`.
  - `queryTransactions(workspaceId, params): { transactions: { id: number; description: string }[]; total: number }` - `@/server/db/queries/transactions` (limit caps at 200; paginate with `offset`).
  - `getCategoryByName(workspaceId, name): { id: number } | null` - `@/server/db/queries/categories`
  - `batchUpdateCategories(workspaceId, updates: { id: number; categoryId: number }[]): void` - `@/server/db/queries/transactions`
  - `setWorkspaceSetting(workspaceId, key, value): void` and `setGlobalSetting(key, value): void` - `@/server/db/queries/settings`

## File Structure

- Create: `scripts/lib/demo-data.ts` - pure deterministic dataset generator. No DB, no `server-only`. One responsibility: turn a reference `Date` into a `DemoDataset`.
- Create: `scripts/lib/demo-data.test.ts` - unit tests for the generator.
- Create: `scripts/seed-demo.ts` - thin orchestrator. Wipes `demo-data/`, writes the dataset via app helpers, prints a summary. Not unit-tested (it is a dev-only DB script); verified by running it.
- Modify: `package.json` - add `seed:demo` and `demo` npm scripts.
- Modify: `.gitignore` - ignore `/demo-data/`.
- Modify: `README.md` - short "Demo data" note.

---

## Task 1: Pure deterministic demo-data generator

**Files:**
- Create: `scripts/lib/demo-data.ts`
- Test: `scripts/lib/demo-data.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/lib/demo-data.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { ALLOWED_CATEGORY_NAMES, generateDemoDataset } from "./demo-data";

const NOW = new Date(2026, 5, 15);

function monthsOf(dates: string[]): string[] {
  return [...new Set(dates.map((d) => d.slice(0, 7)))].sort();
}

describe("generateDemoDataset", () => {
  test("is deterministic for a fixed reference date", () => {
    expect(generateDemoDataset(NOW)).toEqual(generateDemoDataset(NOW));
  });

  test("spans 12 consecutive months ending in the current month", () => {
    const ds = generateDemoDataset(NOW);
    const months = monthsOf(ds.transactions.map((t) => t.date));
    expect(months).toHaveLength(12);
    expect(months[months.length - 1]).toBe("2026-06");
    expect(months[0]).toBe("2025-07");
  });

  test("has exactly one positive salary per month, categorized as Salary", () => {
    const ds = generateDemoDataset(NOW);
    const salary = ds.transactions.filter((t) => t.categoryName === "Salary");
    expect(salary).toHaveLength(12);
    expect(salary.every((t) => t.chargedAmount > 0)).toBe(true);
  });

  test("every non-salary transaction is a negative expense", () => {
    const ds = generateDemoDataset(NOW);
    const expenses = ds.transactions.filter((t) => t.categoryName !== "Salary");
    expect(expenses.every((t) => t.chargedAmount < 0)).toBe(true);
  });

  test("uses only allowed seeded category names", () => {
    const ds = generateDemoDataset(NOW);
    for (const t of ds.transactions) {
      expect(ALLOWED_CATEGORY_NAMES).toContain(t.categoryName);
    }
  });

  test("never produces a transaction dated after the reference date", () => {
    const ds = generateDemoDataset(NOW);
    const iso = "2026-06-15";
    expect(ds.transactions.every((t) => t.date <= iso)).toBe(true);
  });

  test("includes the rent charge in every completed month", () => {
    const ds = generateDemoDataset(NOW);
    const rentMonths = monthsOf(
      ds.transactions.filter((t) => t.description === "Maple Court Property Mgmt").map((t) => t.date),
    );
    expect(rentMonths).toContain("2025-07");
    expect(rentMonths).toContain("2026-05");
    expect(rentMonths.length).toBeGreaterThanOrEqual(11);
  });

  test("produces sensible settings", () => {
    const ds = generateDemoDataset(NOW);
    expect(ds.workspaceName).toBe("Demo");
    expect(ds.bankProvider).toBe("hapoalim");
    expect(ds.settings.paydayDay).toBe(10);
    expect(ds.settings.currentBalanceDate).toBe("2026-06-15");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test --conditions react-server scripts/lib/demo-data.test.ts`
Expected: FAIL (cannot resolve `./demo-data` / `generateDemoDataset` is not defined).

- [ ] **Step 3: Implement the generator**

Create `scripts/lib/demo-data.ts`:

```ts
export interface DemoTransaction {
  date: string;
  description: string;
  chargedAmount: number;
  categoryName: string;
}

export interface DemoSettings {
  paydayDay: number;
  monthlyTarget: number;
  currentBalance: number;
  currentBalanceDate: string;
}

export interface DemoDataset {
  workspaceName: string;
  bankProvider: string;
  accountNumber: string;
  transactions: DemoTransaction[];
  settings: DemoSettings;
}

interface RecurringDef {
  description: string;
  categoryName: string;
  base: number;
  jitter: number;
  day: number;
}

interface MerchantDef {
  description: string;
  categoryName: string;
  min: number;
  max: number;
}

const MONTHS = 12;
const SALARY_DESCRIPTION = "Monthly Salary - Acme Ltd";
const SALARY_BASE = 19500;
const SALARY_JITTER = 1200;

const RECURRING: RecurringDef[] = [
  { description: "Maple Court Property Mgmt", categoryName: "Home", base: 5600, jitter: 0, day: 2 },
  { description: "Phoenix Auto Insurance", categoryName: "Insurance", base: 430, jitter: 0, day: 4 },
  { description: "Clalit Health Plan", categoryName: "Insurance", base: 290, jitter: 0, day: 6 },
  { description: "PowerFit Gym", categoryName: "Sports & Hobbies", base: 179, jitter: 0, day: 8 },
  { description: "StreamBox Plus", categoryName: "Subscriptions", base: 89, jitter: 0, day: 12 },
  { description: "Cellcom Mobile & Net", categoryName: "Bills & Utilities", base: 139, jitter: 0, day: 16 },
];

const MERCHANTS: MerchantDef[] = [
  { description: "Shufersal Deal", categoryName: "Groceries", min: 90, max: 460 },
  { description: "Rami Levy Market", categoryName: "Groceries", min: 70, max: 380 },
  { description: "Cafe Aroma", categoryName: "Coffee & Cafes", min: 16, max: 52 },
  { description: "Giraffe Noodle Bar", categoryName: "Restaurants", min: 60, max: 240 },
  { description: "Paz Fuel Station", categoryName: "Transport", min: 120, max: 320 },
  { description: "Rav-Kav Transit", categoryName: "Transport", min: 20, max: 90 },
  { description: "Castro Fashion", categoryName: "Shopping", min: 80, max: 540 },
  { description: "KSP Electronics", categoryName: "Shopping", min: 120, max: 900 },
  { description: "City Electric Utility", categoryName: "Bills & Utilities", min: 220, max: 560 },
  { description: "SuperPharm", categoryName: "Health", min: 35, max: 240 },
];

export const ALLOWED_CATEGORY_NAMES: string[] = [
  ...new Set([
    "Salary",
    ...RECURRING.map((r) => r.categoryName),
    ...MERCHANTS.map((m) => m.categoryName),
  ]),
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function iso(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function generateDemoDataset(now: Date): DemoDataset {
  const rng = mulberry32(0x5eed1234);
  const transactions: DemoTransaction[] = [];
  const todayIso = iso(now.getFullYear(), now.getMonth(), now.getDate());

  for (let i = MONTHS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const isCurrent = i === 0;
    const cutoff = isCurrent ? now.getDate() : lastDayOfMonth(year, month);

    const salaryDay = Math.min(10, lastDayOfMonth(year, month));
    if (salaryDay <= cutoff) {
      transactions.push({
        date: iso(year, month, salaryDay),
        description: SALARY_DESCRIPTION,
        chargedAmount: round2(SALARY_BASE + (rng() - 0.5) * SALARY_JITTER),
        categoryName: "Salary",
      });
    }

    for (const r of RECURRING) {
      const day = Math.min(r.day, lastDayOfMonth(year, month));
      if (day > cutoff) continue;
      const amount = r.base + (rng() - 0.5) * r.jitter;
      transactions.push({
        date: iso(year, month, day),
        description: r.description,
        chargedAmount: -round2(amount),
        categoryName: r.categoryName,
      });
    }

    const count = 10 + Math.floor(rng() * 9);
    for (let k = 0; k < count; k++) {
      const day = 1 + Math.floor(rng() * lastDayOfMonth(year, month));
      if (day > cutoff) continue;
      const m = MERCHANTS[Math.floor(rng() * MERCHANTS.length)];
      const amount = m.min + rng() * (m.max - m.min);
      transactions.push({
        date: iso(year, month, day),
        description: m.description,
        chargedAmount: -round2(amount),
        categoryName: m.categoryName,
      });
    }
  }

  transactions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    workspaceName: "Demo",
    bankProvider: "hapoalim",
    accountNumber: "DEMO-0001",
    transactions,
    settings: {
      paydayDay: 10,
      monthlyTarget: 3000,
      currentBalance: 42850,
      currentBalanceDate: todayIso,
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test --conditions react-server scripts/lib/demo-data.test.ts`
Expected: PASS (8 tests).

Note: if the rent-in-every-month test fails because `MONTHS` math drops a month, confirm the loop produces 12 months; it should. The "11+" lower bound tolerates the current month being early (rent day 2 is almost always before today).

- [ ] **Step 5: Run formatter and typecheck**

Run: `bunx biome format --write scripts/lib/demo-data.ts scripts/lib/demo-data.test.ts && bun run typecheck`
Expected: formatting applied if needed; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/demo-data.ts scripts/lib/demo-data.test.ts
git commit -m "feat: add deterministic demo-data generator"
```

---

## Task 2: Seed orchestrator script

**Files:**
- Create: `scripts/seed-demo.ts`

- [ ] **Step 1: Implement the script**

Create `scripts/seed-demo.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { generateDemoDataset } from "@/../scripts/lib/demo-data";
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

const WORKSPACE_ID = 1;

function wipeDataDir(): void {
  const dir = process.env.BUDGETEER_DATA_DIR
    ? path.resolve(process.env.BUDGETEER_DATA_DIR)
    : path.join(process.cwd(), "demo-data");
  if (dir.endsWith(`${path.sep}data`) || dir === path.join(process.cwd(), "data")) {
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
    originalAmount: t.chargedAmount,
    originalCurrency: "ILS",
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
```

Note on the generator import: `@/../scripts/lib/demo-data` resolves `@/` to `src/` then climbs to repo root. If Bun rejects that path, replace the first import with a relative path: `import { generateDemoDataset } from "./lib/demo-data";`.

- [ ] **Step 2: Format and typecheck**

Run: `bunx biome format --write scripts/seed-demo.ts && bun run typecheck`
Expected: typecheck clean. (If the generator import path errors in typecheck, switch it to `./lib/demo-data` as noted.)

- [ ] **Step 3: Smoke-run the script against an isolated dir**

Run: `BUDGETEER_DATA_DIR=./demo-data bun --conditions react-server scripts/seed-demo.ts`
Expected: prints `Demo data ready: workspace "Demo", <N> transactions across 12 months ...`. A `demo-data/budgeteer.db` file now exists. Your real `data/` is untouched.

If it throws on `import "server-only"`, confirm the `--conditions react-server` flag is present. If it throws "Seed category not found", confirm the category name strings in `scripts/lib/demo-data.ts` exactly match the seeded names listed in this plan's Background section.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-demo.ts
git commit -m "feat: add demo-data seed orchestrator script"
```

---

## Task 3: npm scripts and gitignore

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Add the npm scripts**

In `package.json`, inside `"scripts"`, add these two entries (place them right after the `"dev"` line):

```jsonc
    "seed:demo": "BUDGETEER_DATA_DIR=./demo-data bun --conditions react-server scripts/seed-demo.ts",
    "demo": "BUDGETEER_DATA_DIR=./demo-data next dev",
```

- [ ] **Step 2: Ignore the demo data directory**

In `.gitignore`, directly below the existing `/data/` line (the section commented `# local data (sqlite db, encryption key)`), add:

```
/demo-data/
```

- [ ] **Step 3: Verify isolation and that the scripts work end to end**

Run: `bun run seed:demo`
Expected: same success line as Task 2 Step 3.

Run: `git status --short`
Expected: no `demo-data/` entries appear (it is ignored). Only tracked changes are `package.json` and `.gitignore`.

- [ ] **Step 4: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: add demo seed and launch npm scripts"
```

---

## Task 4: README note, full CI gate, and manual verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a Demo data note to the README**

In `README.md`, add this subsection. Place it under the existing getting-started / running content (search for the section that shows `bun dev`; add this immediately after that block). Keep it free of em dashes:

```markdown
### Demo data

Want to show Budgeteer without using your real accounts? Build an isolated demo
database and launch the app against it:

```bash
bun run seed:demo   # creates ./demo-data with a "Demo" workspace of synthetic data
bun run demo        # runs the app on the demo database (your real data/ is untouched)
```

The demo data is entirely fake and lives in a gitignored `demo-data/` folder. To
return to your real data, stop the demo and run `bun dev` again.
```

- [ ] **Step 2: Run the full CI gate**

Run: `bun run ci`
Expected: PASS for format, lint:changed, typecheck, i18n:check, knip, react:doctor, security, and test. The demo-data generator tests run as part of `bun test`. `knip` should not flag the new files because `scripts/**/*.{mjs,ts}` is already an entry pattern in `knip.json`.

If `knip` flags `scripts/lib/demo-data.ts` exports as unused, confirm `scripts/seed-demo.ts` imports `generateDemoDataset` and that the test imports `ALLOWED_CATEGORY_NAMES`; both are then referenced.

- [ ] **Step 3: Manual visual verification**

Run: `bun run seed:demo` then `bun run demo`.
Open `http://127.0.0.1:3000/`. Confirm:
- The app lands directly on the populated home dashboard (no setup wizard).
- No "AI not connected" banner is shown.
- The forecast hero shows a verdict and projected numbers.
- The Trends card shows 12 months of income and expense bars with a net line.
- The recurring charges card lists the synthetic subscriptions.
- The workspace switcher shows only "Demo".
Stop the demo server when done.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document demo data seed commands"
```

---

## Self-Review Notes

- **Spec coverage:** isolated `demo-data/` dir + gitignore (Task 3); committed seed script reusing app helpers (Task 2); pure, deterministic, reviewable generator with tests (Task 1); "Demo" workspace via `updateWorkspace` (Task 2); fake `hapoalim` credential to pass the setup gate (Task 2); 12 months of categorized income/recurring/discretionary transactions (Tasks 1-2); forecast settings + `ai_provider=ollama` banner suppression (Task 2); idempotent wipe-and-rebuild (Task 2 `wipeDataDir`); README note (Task 4); CI + manual verification (Task 4). All covered.
- **Type consistency:** `DemoTransaction`/`DemoDataset`/`DemoSettings` are defined in Task 1 and consumed unchanged in Task 2. The raw-transaction object shape in Task 2 matches the `insertTransactions` element shape listed in Background. Helper names and signatures match the verified exports in Background.
- **Safety:** `wipeDataDir` refuses to delete a `data/` directory, so a misconfigured env var cannot destroy real data. The seed only ever writes to whatever `BUDGETEER_DATA_DIR` points at, which the npm script pins to `./demo-data`.
- **server-only:** only `seed:demo` (the standalone bun script) needs `--conditions react-server`; `demo` runs through `next dev`, which handles `server-only` natively.
