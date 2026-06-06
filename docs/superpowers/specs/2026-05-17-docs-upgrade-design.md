# Docs upgrade design

Date: 2026-05-17
Status: Draft, pending user review

## Goal

Rebuild the Budgeteer docs (under `website/src/content/docs/`) so they:

1. Match the editorial vibe of the homepage (buttercream + sage palette, Fraunces italic + Inter bold split headlines, pastel accents, in-doc UI fragments).
2. Are equally useful to non-technical users and developers (plain-English body, `<details>` accordions for the technical version).
3. Reflect the **actual** current install flow: `npm install` + `npm run setup`, not the 7-step manual flow from older docs.
4. Use new in-doc Astro components instead of screenshots wherever feasible. Where real screenshots are required, they are generated from a curated fake-data dataset, never from the maintainer's own data.

## Non-goals

- Hebrew translation of the docs (the app supports Hebrew/RTL but docs stay English-only for now).
- Custom Starlight theme components beyond what's needed for the new visual vocabulary.
- Docs versioning. There is one current version.

## Information architecture

The Starlight sidebar is restructured around the user journey, not internal categories.

```
Welcome
  Getting started        (NEW landing page — editorial card grid)
  What is Budgeteer?         (NEW — one-pager about the project, philosophy, scope)

Install
  On macOS               (REWRITE — 3 steps around `npm run setup`)
  On Windows             (REWRITE — 3 steps, no Visual Studio Build Tools)
  On Linux               (NEW — service-only flow)

Using Budgeteer
  Connect your bank      (REWRITE — fake-data screenshots, fragment components)
  Categorize with AI     (REWRITE — in-doc components, switch flow)
  Sync & dashboard       (REWRITE — focused on day-to-day usage)
  Categories & budgets   (NEW — split out from sync-and-dashboard)
  Hebrew & RTL           (NEW — covers the new i18n toggle)

Reference
  Troubleshooting        (REWRITE — grouped per-OS with anchors)
  Security & privacy     (STYLE-PASS, tighten copy)
  Disclaimer             (STYLE-PASS)
```

Page slugs map 1:1 to the file path under `src/content/docs/`. The 404 page stays as-is content-wise; only the visual style updates with the global changes.

## Visual design vocabulary

A small, reusable set of components and CSS conventions so every doc page reads like a homepage section, not generic markdown.

### Components (new, in `website/src/components/docs/`)

| Component | Purpose | Used on |
|---|---|---|
| `DocsHero.astro` | Per-page header: eyebrow chip + two-line Fraunces/Inter split headline + lede + optional CTA row. | All non-reference pages. |
| `DocsCardGrid.astro` + `DocsCard.astro` | The card grid for `getting-started.mdx`. Each card has a pastel accent color, eyebrow, title, one-line description, and arrow link. | Getting started. |
| `Callout.astro` | Three variants: `note` (sage), `gotcha` (pink), `for-developers` (blue). Used inline in MDX as `<Callout variant="gotcha">…</Callout>`. | Throughout. |
| `ForDevelopers.astro` | A `<details>`-based accordion styled like the blue Callout but collapsed by default. The "expand for the technical version" pattern. | Throughout. |
| `StepList.astro` + `StepItem.astro` | Evolves the existing `InstallStepCard`. Step number in big Fraunces italic with pastel color rotation (`vibrant → pink → blue → orange`). | Install pages, connect-bank. |
| `BankFormFragment.astro` | Extracted from `HowItWorks.astro`'s `frag-form`. Drop-in MDX use. | Connect your bank. |
| `SyncProgressFragment.astro` | Extracted from `frag-sync`. | Sync & dashboard. |
| `TransactionListFragment.astro` | Extracted from `frag-cat`. Now parameterized so docs can pass their own rows. | Multiple pages. |
| `ProviderCard.astro` | Three-up card for Claude / Ollama / Manual on the AI page. | Categorize with AI. |
| `NextStepCard.astro` | "Next: <page name>" CTA at the end of each page. | All pages. |

### CSS conventions

- All new components use the existing tokens in `website/src/styles/global.css` (`--spent-bg`, `--spent-primary`, etc.). No new color tokens.
- Step number rotation: `step[1] → --spent-vibrant`, `step[2] → --spent-pink`, `step[3] → --spent-blue`, `step[4] → --spent-orange`, then cycles.
- Headings keep the existing Fraunces italic treatment from Starlight overrides. Page heroes opt-in to the split (`spent-sans-bold` + `spent-serif-ital`).
- Screenshots use the existing `.doc-shot` class with the buttercream border and soft drop-shadow.

### Per-page hero recipe

Every non-reference page opens with:

```mdx
<DocsHero
  eyebrow="USING SPENT"
  titleBold="Connect"
  titleItalic="your bank."
  lede="Pick your bank, paste your credentials. Budgeteer encrypts them and never sends them anywhere."
/>
```

The eyebrow uses the same chip styling as `spent-eyebrow.center` on the homepage.

## Page-by-page content

### Welcome / Getting started (`getting-started.mdx`)

**Replaces:** existing text-heavy intro.

**Layout:**

1. `<DocsHero eyebrow="WELCOME" titleBold="Budgeteer" titleItalic="in five minutes." lede="A local-only finance tracker for Israeli banks. Beautiful, private, open source." />`
2. Brief 2-paragraph intro: what it is, who it's for, what's required (Mac/Windows/Linux + bank login + optional AI provider).
3. A live dashboard screenshot (one of the few real screenshots; generated from fake-data dataset).
4. `<DocsCardGrid>` with 6 cards:
   - **Install** (vibrant) — "Get Budgeteer running in three commands."
   - **Connect a bank** (pink) — "What credentials each bank needs."
   - **Categorize with AI** (blue) — "Claude, Ollama, or manual — pick one."
   - **Sync & dashboard** (orange) — "Day-to-day use."
   - **Security & privacy** (sage) — "How encryption works, what travels the network."
   - **Troubleshooting** (orange muted) — "Common gotchas, per OS."

### Welcome / What is Budgeteer? (`what-is-budgeteer.mdx`)

**New page.**

Short essay-style page (≈300 words) covering:

- The project's premise: Israeli banks export poorly, YNAB doesn't speak ILS, and cloud finance apps want your bank password.
- The trade-off: you self-host, you trust the scraper, you accept that automation may violate some banks' terms.
- The architecture in one sentence: Next.js app + SQLite + headless Chromium + your choice of AI.
- Project status (Beta, MIT, single-maintainer with contributors welcome).
- Link to the repo and the disclaimer.

This page is for people who clicked Docs before installing and want a quick orientation.

### Install / On macOS (`install/mac.mdx`)

**Replaces:** the existing 7-step page.

**Layout:**

1. `<DocsHero eyebrow="INSTALL · MACOS" titleBold="Install Budgeteer" titleItalic="on your Mac." lede="Three commands, about ten minutes." />`
2. "What you'll need" — macOS 12+, ~500 MB disk, bank credentials.
3. `<StepList>` with three steps:
   - **01 Install Node.js** — same content as today (nodejs.org LTS / `brew install node@20`).
   - **02 Get Budgeteer** — `git clone` OR download source-code zip from releases.
   - **03 Run setup** — `npm install` then `npm run setup`.
4. `<ForDevelopers>` accordion expands to show **what `npm run setup` actually does** (the bullet list from `scripts/setup.mjs` comments: build Next, install LaunchAgent, hosts entry, build menubar, register login item, open browser).
5. A note that setup will offer to install Xcode Command Line Tools if missing (1 GB, 5-15 min). Mention what happens if the user declines: web app installs and runs, menubar is skipped, can re-run setup later to add it.
6. A `<Callout variant="gotcha">` for the macOS Gatekeeper warning on first menubar launch.
7. "Day-to-day commands" — `npm run service:status / start / stop / reload / logs / open` and what each does.
8. `<NextStepCard>` → Connect your bank.

### Install / On Windows (`install/windows.mdx`)

**Replaces:** the existing 8-step page that includes Visual Studio Build Tools.

**Layout:** mirrors the macOS page structure.

1. Hero.
2. "What you'll need" — Windows 10/11, ~500 MB disk, bank credentials, Administrator for the first run (hosts file edit).
3. `<StepList>` with three steps:
   - **01 Install Node.js** — nodejs.org Windows installer; leave "Automatically install necessary tools" unchecked.
   - **02 Get Budgeteer** — git clone or download zip.
   - **03 Run setup** — `npm install` then `npm run setup` from an elevated PowerShell.
4. `<ForDevelopers>` accordion: what `npm run setup` does on Windows (build Next, register Task Scheduler logon trigger, hosts edit, build `.NET 8` tray, copy to `%LOCALAPPDATA%\Programs\Budgeteer`, place startup `.lnk`).
5. Note: setup will offer to install **.NET 8 SDK via winget** if missing (~200 MB). This replaces the old Visual Studio Build Tools instruction.
6. Note: non-elevated runs work but skip the hosts entry (`budgeteer.local` won't resolve; `127.0.0.1:41234` still works).
7. `<Callout variant="gotcha">` for Windows Defender flagging the unsigned `.exe` on first run.
8. "Day-to-day commands" — same set as macOS.
9. `<NextStepCard>` → Connect your bank.

### Install / On Linux (`install/linux.mdx`)

**New page.**

Linux gets a shorter, dedicated page reflecting the README ("Linux is service-only; no native tray").

1. Hero (eyebrow `INSTALL · LINUX`).
2. "What you'll need" — modern systemd-based distro, Node 20+, bank credentials.
3. `<StepList>`:
   - **01 Install Node.js** — distro-package or nvm.
   - **02 Get Budgeteer** — git clone.
   - **03 Run setup** — `npm install` then `npm run setup`. Creates a `--user` systemd unit.
4. Note: no menubar/tray. Dashboard at `http://127.0.0.1:41234` (or `http://budgeteer.local:41234` if you added the hosts entry).
5. "Day-to-day commands" — same `service:*` set; mention that they shell out to `systemctl --user`.
6. `<NextStepCard>` → Connect your bank.

### Using / Connect your bank (`connect-bank.mdx`)

**Rewrite** of existing page.

**Layout:**

1. Hero (`USING SPENT`).
2. Intro: setup wizard walks you through the first one; subsequent banks via *Settings → Banks*.
3. `<BankFormFragment />` showing the credential entry UI as an in-doc component (drop-in replacement for one of the screenshots).
4. "How credentials are stored" — same content, plus a tightened mention of AES-256-GCM linking to Security & privacy.
5. "A note about 2FA" — most banks don't support; One Zero does.
6. Per-bank credential reference — kept as today, but each bank gets a small inline component showing the field labels (matches what the wizard renders), not full screenshots.
7. "Managing connected banks" — short, with a single screenshot of the settings page.
8. "What happens when you click Sync" — animated `<SyncProgressFragment />` in place of one screenshot.
9. `<NextStepCard>` → Categorize with AI.

### Using / Categorize with AI (`ai-categorization.mdx`)

**Rewrite** of existing page.

**Layout:**

1. Hero.
2. Intro: 1 paragraph.
3. `<ProviderCard>` three-up: Claude (paid, excellent), Ollama (free, local), Manual (free, slow). Each card has cost / privacy / quality lines and a "Setup" link.
4. Below the cards: a detail section per provider with the full setup steps (anchors `#claude`, `#ollama`, `#manual`).
5. "How batching works" — same content.
6. "Switching providers" — same content.
7. `<NextStepCard>` → Sync & dashboard.

### Using / Sync & dashboard (`sync-and-dashboard.mdx`)

**Rewrite + scope shrink** (categories content split out to its own page).

**Layout:**

1. Hero.
2. Dashboard screenshot (real, fake-data).
3. "The dashboard" — short tour: Overview, Transactions, Categories link (now points to Categories & budgets page), Settings.
4. "Syncing" — schedule (default 03:00), manual trigger, what a sync does (scrape → dedupe → categorize). `<SyncProgressFragment />` as the visual.
5. "The menubar / tray app" — what the four actions do.
6. "Re-categorizing" — click any badge.
7. "Dark mode" — toggle, two screenshots side-by-side (real, fake-data).
8. "Backups" — copy `data/budgeteer.db` + `data/.encryption-key`.
9. `<NextStepCard>` → Categories & budgets.

### Using / Categories & budgets (`categories-and-budgets.mdx`)

**New page** (content split out of sync-and-dashboard).

1. Hero (`USING SPENT`).
2. The category set (parent + child).
3. Re-categorizing.
4. Merchant memory.
5. Budget pacing — the "ahead of pace" hero card and how it's calculated.
6. Auto-detected transfers.

Mostly content from the README's Features section, expanded.

### Using / Hebrew & RTL (`hebrew-and-rtl.mdx`)

**New page** for the recent i18n feature.

1. Hero.
2. How to switch language (Settings → Preferences).
3. What flips: layout direction, dates, numbers.
4. What does *not* flip: bank logos, screenshots in this docs.
5. Known limitations (if any).

### Reference / Troubleshooting (`troubleshooting.md`)

**Rewrite** of existing page.

Same content, but:

- Re-grouped into three top-level sections with anchor links so a deep-link from an error message lands you in the right spot: **During install** (per-OS sub-anchors), **During sync**, **With the dashboard / data**.
- Each entry is a `<Callout variant="gotcha">` for the error, then plain prose for the fix.
- New entry: "Setup script aborted partway." — covers what `npm run service:status` will show and how to re-run setup safely (idempotent).
- New entry: "`budgeteer.local` doesn't resolve." — covers the non-elevated Windows case.

### Reference / Security & privacy (`security-and-privacy.md`)

**Style-pass only.** Existing content is good. Tighten:

- Wrap the intro in `<DocsHero>`.
- Move the threat model into a two-column callout layout (protects against | does not protect against).
- Add a `<NextStepCard>` at the end → Disclaimer.

### Reference / Disclaimer (`disclaimer.md`)

**Style-pass only.** Existing content is good. Add the `<DocsHero>` and tighten the trailing "By installing Budgeteer…" into a final callout.

## Screenshot strategy

A new script: `scripts/capture-docs-screenshots.mjs`.

### Behavior

1. Spins up a temporary SQLite database in a tmp dir (does NOT touch the user's `data/`).
2. Seeds it with a curated fake dataset:
   - 3 fake bank connections (Isracard, Hapoalim, Max), all with `is_demo=true` flag.
   - About 80 fake transactions across 3 months — Hebrew + English merchant names of common Israeli vendors (Aroma, Shufersal, Tnuva, Rav-Kav, Cofix, Super-Pharm, Wolt, Cellcom, etc.).
   - Each transaction pre-categorized with a sensible category and one of the 16 seeded category colors.
   - One budget with realistic numbers (₪3,154 spent of ₪4,500 target — matches the homepage hero).
3. Boots the Next.js dev server pointing at this fake DB.
4. Walks the UI with Puppeteer (already a transitive dep via `israeli-bank-scrapers`).
5. Captures into `website/src/assets/screenshots/`:
   - `dashboard-light.png`, `dashboard-dark.png`
   - `transactions-light.png`
   - `settings-banks-light.png`, `settings-ai-light.png`, `settings-categories-light.png`
   - `setup-bank-light.png` (the wizard step shown today)
   - `home-light.png` (the hero shot used on the landing)
6. Cleans up the tmp DB.

### Where dates come from

The fake data uses dates relative to "today" so screenshots don't age. Re-running the script the next month produces equivalent screenshots without code changes.

### Idempotency

The script is safe to re-run any time. It always wipes and re-seeds the tmp DB. The output PNGs are checked into the repo; the script is not run in CI.

## Voice & "tech vs non-tech"

Every page leads with plain English. Three patterns for adding depth:

1. **`<ForDevelopers>` accordion** — collapsed by default, expands to the technical version of whatever was just explained. Used for: install internals, encryption mechanics, dedup hash composition, dataset schema.
2. **`<Callout variant="for-developers">`** — inline, never collapsed, for short technical tangents that beginners can also benefit from seeing (e.g., "Budgeteer's server binds to 127.0.0.1 only — it isn't reachable from your LAN even if you wanted it to be.").
3. **Footnoted code blocks** — code blocks are kept short and always preceded by a sentence in prose explaining what they do.

No page should require terminal experience to follow the **main** path. Terminal commands appear inside Step cards with one-sentence prose context.

## Implementation order

Sketched here for the implementation plan; not part of the spec contract.

1. Build the shared component library under `website/src/components/docs/`.
2. Wire the new sidebar in `astro.config.mjs`.
3. Build `scripts/capture-docs-screenshots.mjs` and run it to populate `assets/screenshots/`.
4. Rewrite pages in dependency order: `getting-started → install/*  → connect-bank → ai-categorization → sync-and-dashboard → categories-and-budgets → hebrew-and-rtl → troubleshooting → security-and-privacy → disclaimer → what-is-budgeteer`.
5. Update internal cross-links (any page that links to a renamed slug).
6. Verify in dev (`npm run dev` inside `website/`) that every page renders, every link works, and dark mode is consistent.

## Open questions

None — all clarifying questions were answered before this spec was written.

## Out of scope

- Translating docs to Hebrew.
- Versioned docs (only one live version).
- A search override beyond Starlight's built-in pagefind.
- Generating screenshots in CI.
- A new docs landing page that exists outside Starlight (Starlight's `getting-started.mdx` IS the landing).
