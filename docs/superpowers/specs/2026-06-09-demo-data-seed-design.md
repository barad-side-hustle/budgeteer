# Demo data seed

## Summary

Add a way to show Budgeteer to other people without exposing real financial
data. A committed seed script builds a complete, demo-ready database in an
isolated, gitignored directory. The demo is modeled as a single workspace named
"Demo" so the in-app workspace switcher reveals nothing real. The user runs one
command to build the demo data and another to launch the app against it; their
real `data/budgeteer.db` is never read or written.

## Goals

- One command builds a fully populated demo database from synthetic data.
- The app launched against it lands directly on a populated dashboard, with no
  setup wizard and no "connect a bank / AI" prompts.
- Total isolation from the user's real data. Nothing fake is ever committed and
  nothing real is ever touched.
- Reproducible and reviewable: data is generated in code with deterministic
  randomness, not shipped as a binary blob.

## Non-goals

- No in-app "Load demo data" button (no product/UI code is touched).
- No committed pre-built `.db` file.
- No multiple demo workspaces; exactly one "Demo" workspace.
- No live AI categorization; categories are assigned directly by the seed.

## Decisions (locked during brainstorming)

- **Location:** an isolated, gitignored `demo-data/` directory containing only a
  "Demo" workspace. Rejected: a "Demo" workspace inside the real DB (mixes fake
  and real data in one file and leaks the real workspace's existence/name through
  the switcher while screen-sharing).
- **Mechanism:** a committed `scripts/seed-demo.ts` plus two npm scripts.
  Rejected: a committed `.db` blob (stale on migrations, unreviewable) and an
  in-app button (ships product code the user did not ask for).
- **Data shape:** 12 months of history ending in the current month; ILS; a fake
  `hapoalim` bank connection; a monthly salary; about six recurring charges; and
  varied discretionary spend, all pre-categorized.

## Architecture and data flow

The seed script reuses the application's own server-side query helpers, so it
always matches the live schema, dedup rules, and `kind` detection. It never
writes raw SQL.

1. **Isolation via env var.** Both the script and the app honor
   `BUDGETEER_DATA_DIR` (already resolved in `src/server/db/index.ts`). The demo
   lives in `./demo-data`, which is added to `.gitignore` next to `/data/`.
2. **Idempotent build.** Each run deletes and recreates `demo-data/` so the
   result is identical every time and never accumulates state.
3. **npm scripts** in `package.json`:
   - `"seed:demo": "BUDGETEER_DATA_DIR=./demo-data bun scripts/seed-demo.ts"`
   - `"demo": "BUDGETEER_DATA_DIR=./demo-data next dev"`
4. **User workflow:** `bun run seed:demo` once to build, then `bun run demo` to
   launch. Returning to real data is just `bun dev` again.

### What the seed creates

- **Workspace:** the database initializes with one auto-seeded workspace (with
  seed categories). The script renames it to "Demo" via `updateWorkspace`, so the
  demo DB contains exactly one workspace and the switcher shows nothing else.
- **Bank connection:** one fake `hapoalim` credential via `saveBankCredentials`
  (obviously-fake id and password; encryption handled by the existing helper).
  This satisfies the setup gate `anyWorkspaceHasBankCredentials()`, so the app
  skips the wizard. A bank provider (not a card issuer) is used so that positive
  amounts are detected as income by `detectKind`.
- **Sync run + transactions:** a completed sync run via `createSyncRun` /
  `completeSyncRun`, with ~12 months of synthetic transactions inserted through
  `insertTransactions` (which computes dedup hashes and `kind`). Contents:
  - a monthly **salary** (positive amount, detected as income);
  - about six **recurring charges** (rent or mortgage, car insurance, health
    insurance, gym, a streaming bundle, mobile or internet) so the recurring and
    lapsed-badge cards have content;
  - varied **discretionary** spend across groceries, dining, transport or fuel,
    shopping, and utilities.
  All amounts and dates come from a **deterministic seeded RNG** so reruns are
  identical and the data is reviewable.
- **Categorization:** because no AI runs, the seed assigns a category to every
  transaction in a post-insert pass that maps each synthetic merchant to a seeded
  category (looked up via `getCategoryByName` / `getAllCategories`) and applies it
  with `updateTransactionCategory`.
- **Forecast settings:** `payday_day` (10), a `monthly_target`, and a balance
  anchor (`current_balance` + `current_balance_date`) via `setWorkspaceSetting`,
  so the forecast hero and KPIs are fully populated.
- **AI banner suppression:** set the global `ai_provider` to `ollama` (the banner
  only appears when it is `none`). This is cosmetic; no live AI calls are made.

### Output

After seeding, the script prints a short summary: workspace name, transaction
count, month range, and the data directory path.

## Edge cases

- **Re-running `seed:demo`:** safe and repeatable; the directory is wiped and
  rebuilt each time.
- **Stale demo after a schema migration:** harmless. Migrations run on open, and
  rerunning `seed:demo` regenerates a fresh, current database.
- **Accidental commit of fake data:** prevented by gitignoring `/demo-data/`.

## Testing

This is a dev-only script, so no unit tests are added. It is committed code, so
it must pass `bun run typecheck` and Biome formatting, and it must be exercised
once by running `bun run seed:demo` and confirming the app launched with
`bun run demo` lands on a populated dashboard showing the trends, recurring, and
forecast cards with synthetic data only.

## Documentation

Add a short "Demo data" note to the README explaining the two commands, so other
self-hosters can spin up a demo too. No screenshots change (the existing home
screenshots are already generated from synthetic data).
