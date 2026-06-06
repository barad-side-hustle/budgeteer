# Budgeteer design system

This is the single source of truth for how Budgeteer looks and feels. Every screen,
component, and pull request follows it. If a component disagrees with this document,
the component is wrong, fix the component.

The target feeling is a **modern, clean, data-focused SaaS dashboard**, grounded in the
[Efferd dashboard blocks](https://efferd.com/blocks/dashboard): a calm neutral canvas,
hairline-bordered cards, dense KPI grids, restrained monochrome charts, and a single
confident **indigo** brand accent. The data does the talking; the chrome stays quiet.
Nothing should ever look rough.

All tokens live in [`globals.css`](../src/app/globals.css) under `@theme inline`
and `:root` / `.dark`. Tailwind v4 exposes them as utilities (`bg-card`,
`text-muted-foreground`, `rounded-xl`, `text-status-over`, and so on). **Never
hardcode a hex / rgb / oklch value in a component** unless it is genuinely dynamic
data (a per-category color from the DB, a bank brand color). Reach for the token
instead.

---

## 1. Color

Always use the semantic token, never a raw color. Light and dark are each defined once
in `globals.css`, so using the token means dark mode and any future re-tint "just
work".

| Token (utility)                     | Use for                                            |
| ----------------------------------- | -------------------------------------------------- |
| `bg-background` / `text-foreground` | App canvas + primary text                          |
| `bg-card` / `text-card-foreground`  | Card and panel surfaces                            |
| `bg-popover`                        | Dialogs, sheets, dropdowns, tooltips               |
| `bg-muted` / `text-muted-foreground`| Subtle fills, secondary/meta text                  |
| `bg-secondary` / `bg-accent`        | Hover fills, quiet buttons, chips                  |
| `bg-primary` / `text-primary`       | Primary actions, brand indigo, active nav, focus   |
| `bg-destructive`                    | Destructive actions only                           |
| `border-border` / `border-input`    | All borders and input outlines                     |
| `ring-ring`                         | Focus rings (indigo, see Accessibility)            |

### The brand accent: indigo

Budgeteer's signature is a single indigo accent (`--primary`). Use it with Efferd-style
restraint: primary buttons, the active sidebar item, focus rings, links, and the primary
chart series (e.g. the hero burndown line). Do **not** flood screens with it; large
surfaces stay neutral so the accent reads as a deliberate highlight.

### Status colors (pace / health)

Four semantic status tokens, registered as color utilities. Use `text-status-*`,
`bg-status-*`, and `border-status-*`, including opacity modifiers like `bg-status-over/10`:

| Token                | Meaning                              |
| -------------------- | ------------------------------------ |
| `status-on-track`    | Good / income / under budget / OK    |
| `status-plenty-left` | Comfortably under                    |
| `status-heads-up`    | Warning / approaching limit / review |
| `status-over`        | Over budget / expense / error        |

Soft tinted backgrounds (banners, badges, the `DeltaBadge` pill) use `color-mix` against
the token so they adapt per theme, for example
`color-mix(in oklch, var(--status-over) 12%, var(--card))`. Prefer the helpers in
[`colors.ts`](../src/lib/colors.ts) or the status utilities over re-deriving the mix
inline.

### Charts & categories

`chart-1`..`chart-5` make up the chart palette, anchored on the brand indigo
(`chart-1`). Category swatches come from the database (`category.color`) and are the one
place where inline color is correct. When a category color is missing, fall back to
`var(--muted-foreground)`, never a hardcoded grey hex.

---

## 2. Typography

Budgeteer ships **one typeface: Geist** (with **Geist Mono** for the rare mono need),
loaded via `next/font` in [`layout.tsx`](../src/app/[locale]/layout.tsx). It is mapped to
`--font-sans` and used everywhere. The legacy `font-serif` utility and `--font-serif`
token are kept as aliases that resolve to Geist, so any stray reference still renders
correctly, but new code should not use them.

Rules:

- **Money and any aligned number gets `tabular-nums`** so columns line up and values
  don't jitter as they change.
- Page title: `text-xl font-semibold tracking-tight` (see `PageHeader`).
- KPI / hero amounts: `font-semibold` at `text-2xl`..`text-3xl` with `tabular-nums`.
- **Eyebrow / section label**: the small uppercase muted label is a single component,
  `CardLabel` ([`card-label.tsx`](../src/components/ui/card-label.tsx)):
  `text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground`. Do not
  hand-roll `text-[10px]/[11px]` uppercase spans, use `<CardLabel>`.
- Card / section titles are `text-sm font-semibold` foreground, with an optional muted
  one-line description beneath (Efferd section-header pattern, see `CardShell`).
- De-emphasized text is `text-muted-foreground`, not `text-foreground/60`.

---

## 3. Radius

Everything is driven by `--radius: 0.5rem` (crisper than the old soft scale). The scale
(`rounded-sm`..`rounded-4xl`) lives in `@theme`.

- **Cards / panels / sheets / dialogs: `rounded-xl`.** This is the canonical surface
  radius.
- Buttons, inputs, dropdown items, and rect-style badges: `rounded-md` / `rounded-lg`.
- Pills, status chips, the `DeltaBadge`, and fully-round toggles: `rounded-full`.
- **Cells inside a bordered KPI grid are square** (`rounded-none`): the Efferd "bordered
  grid" is a set of hairline-divided cells inside one rounded container.

Do not mix `rounded-2xl` / `rounded-3xl` for cards. There is one surface radius.

---

## 4. Surfaces & elevation

The canonical card is:

```
rounded-xl border border-border bg-card
```

That is a **border**, not a ring, and not a shadow. The `Card` primitive
([`card.tsx`](../src/components/ui/card.tsx)), `CardShell` (home), `HeroCard`, the KPI
cards, settings sections, and chat surfaces all resolve to this. Reserve `shadow` and
`ring` for transient layers (open dropdowns, popovers, the dragged thumb), never for
resting cards.

**Bordered grids (Efferd signature).** Group related stats in one rounded card and divide
them with hairlines instead of gaps: a `grid` with `gap-px bg-border` and `bg-card` cells
renders as crisp 1px dividers. The hero KPI strip uses exactly this.

Padding: cards use `p-5`; hero/feature cards use `p-5 md:p-6`. KPI grid cells use `p-5`.

---

## 5. Spacing & layout

- **Page padding**: `p-4 md:p-6 lg:p-8`.
- **Section gap** within a page: `space-y-6` (or `gap-4 md:gap-5 lg:gap-6` in the home
  grid).
- Content max width for reading/forms: `max-w-4xl` (settings), `max-w-3xl` (chat column).
- Every flex child that can shrink and truncate needs `min-w-0`.
- The home grid is 12 columns (`grid-cols-12`) with responsive `col-span-*`.

---

## 6. Components

- **PageHeader** ([`app-shell.tsx`](../src/components/layout/app-shell.tsx)) is sticky,
  uses `backdrop-blur`, a bold title, and optional meta + actions. Every top-level screen
  uses it. Actions wrap on mobile.
- **Card / CardShell** is the section container; see section 4. `CardShell` takes an
  optional `icon` and `description` for the Efferd section-header look.
- **CardLabel** is the eyebrow; see section 2.
- **DeltaBadge** ([`delta-badge.tsx`](../src/components/ui/delta-badge.tsx)) is the tinted
  green/red percentage pill. Pass `goodWhen="down"` for spending (a rise is bad/red) or
  `goodWhen="up"` for income.
- **ProgressBar** is the budget/pace meter. It clamps 0-100, supports an optional elapsed
  marker, and takes a `tone` from status.
- **Button** ([`button.tsx`](../src/components/ui/button.tsx)) has variants
  `default | outline | secondary | ghost | destructive | link` and sizes. The default
  variant is the indigo brand button. Icon-only buttons MUST have `aria-label`.
- **Charts** ([`charts/`](../src/components/charts)) are pure-SVG and inherit color via
  `currentColor`: the primary series uses `text-primary` (indigo), baselines use dashed
  `text-muted-foreground`. The donut uses category colors.
- **Status pill / dot**: derive color from the status token, never from amber/emerald
  literals.

---

## 7. Iconography

- Icons come from **`lucide-react`** at a default size of `size-4` (16px). No hand-drawn
  inline SVGs.
- Section headers lead with a small lucide icon in a muted rounded square (Efferd).
- Spinners are `Loader2` with `animate-spin`.
- Decorative icons get `aria-hidden`; meaningful icon-only controls get `aria-label`.

---

## 8. Motion

Keyframes live in `globals.css` (`fadeIn`, `countIn`, `pop`, `checkPop`, `dotPulse`).
Framer Motion drives the setup wizard step transitions. Keep durations short
(150-280ms) and easing gentle. Respect `prefers-reduced-motion` wherever feasible.

---

## 9. RTL & internationalization (hard rules)

Budgeteer ships English (LTR) and Hebrew (RTL); `<html dir>` flips between them. Because
of that:

- **Use logical properties, never physical.** Use `ms-/me-` not `ml-/mr-`; `ps-/pe-`
  not `pl-/pr-`; `start-/end-` not `left-/right-`; `text-start/text-end` not
  `text-left/text-right`; `border-s/border-e`; `rounded-s/rounded-e`. The only physical
  exception is true visual centering (`left-1/2 -translate-x-1/2`).
- Directional icons (chevrons, arrows) flip with `rtl:rotate-180`.
- Popover/sheet/menu sides use logical `inline-start`/`inline-end`.
- **All user-facing copy goes through `next-intl`** (`useTranslations` /
  `getTranslations`). No hardcoded strings in components. Keep `en.json` and `he.json`
  at full key parity (`bun run i18n:check`).
- Format money via `formatCurrency(amount, currency, locale)` and dates via the
  `formatters.ts` helpers. Respect `chargedCurrency`; do not assume ILS per transaction.

---

## 10. Accessibility

- Visible focus: `focus-visible:ring-2 focus-visible:ring-ring` (indigo, built into
  Button).
- Every icon-only control has an accessible name; decorative glyphs are `aria-hidden`.
- Active nav exposes `aria-current="page"`.
- Inputs have associated labels; validation errors link via `aria-describedby`.
- Don't encode meaning in color alone; pair status color with text or an icon.
- Touch targets are comfortable (~40px+) on coarse pointers.

---

## 11. Conventions

- No em dashes anywhere (copy, comments, commits). Use commas, parentheses, or "to".
- `import "server-only"` at the top of every `src/server/` file.
- Comments only where the "why" isn't obvious.
- The full gate is `bun run ci` (format, typecheck, i18n, knip, react-doctor, test).
