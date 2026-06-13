# Connected-Issuer-Aware Credit-Card-Payment Classification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Count a bank-side credit-card bill payment as spending unless the matching card issuer is connected (then keep excluding it), flagging undetermined cases for review.

**Architecture:** `detectKind` stays unchanged (still marks card-payment patterns as `transfer` at insert). A new per-issuer resolver in `transfers.ts` and a connected-issuer query feed the matching engine's existing `credit_card_payment` branch, which now decides whether to flip the bill back to `expense`, keep it excluded, or flag it for review. A `reclassifyCardPayments` pass re-derives everything when a card integration is added or removed.

**Tech Stack:** TypeScript (strict), Bun test runner, better-sqlite3 + Drizzle ORM, Next.js App Router route handlers.

**Reference spec:** `docs/superpowers/specs/2026-06-13-credit-card-payment-issuer-awareness-design.md`

---

## File Structure

- `src/server/lib/transfers.ts` — add `CardIssuer` type, per-issuer pattern groups, `matchCardPaymentIssuer`. `CREDIT_CARD_PAYMENT_PATTERNS` becomes the derived union (coverage unchanged).
- `src/server/lib/transfers.test.ts` — tests for `matchCardPaymentIssuer` and union-equals-coverage.
- `src/server/db/queries/bank-credentials.ts` — add `getConnectedCardIssuers`.
- `src/server/lib/matching.ts` — add `connectedCardIssuers` to `ProposeOptions`; rewrite the `credit_card_payment` branch.
- `src/server/lib/matching.test.ts` — update option fixtures + the existing card-payment test; add new branch tests.
- `src/server/sync/matching-step.ts` — pass connected issuers into `proposeEvents`.
- `src/server/db/migrations/025_seed_credit_card_category.sql` — seed `Credit Card` category for existing workspaces.
- `src/server/db/queries/workspaces.ts` — add `Credit Card` to the per-workspace seed list.
- `src/server/db/queries/categories.ts` — add `Credit Card` → `Money Movement` to `SEEDED_CATEGORY_PARENTS`.
- `src/server/db/queries/transactions.ts` — rename `getUncategorizedAtmExpenses` → `getUncategorizedExpenses` (generic; used by ATM and card-payment assignment).
- `src/server/sync/orchestrator.ts` — assign `Credit Card` to uncategorized card-payment expenses; update the ATM block to the renamed query.
- `src/server/db/queries/financial-events.ts` — add `reclassifyCardPayments`.
- `src/app/api/setup/bank/route.ts` — call `reclassifyCardPayments` after saving a card credential.
- `src/app/api/integrations/[id]/route.ts` — call `reclassifyCardPayments` after deleting a card credential.

---

## Task 1: Per-issuer card-payment resolver

**Files:**
- Modify: `src/server/lib/transfers.ts`
- Test: `src/server/lib/transfers.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/server/lib/transfers.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  CREDIT_CARD_PAYMENT_PATTERNS,
  matchCardPaymentIssuer,
  matchesCreditCardPayment,
} from "@/server/lib/transfers";

describe("matchCardPaymentIssuer", () => {
  test("maps issuer-specific descriptions to their issuer", () => {
    expect(matchCardPaymentIssuer("חיוב ישראכרט")).toEqual({ issuer: "isracard" });
    expect(matchCardPaymentIssuer("תשלום לכ.א.ל")).toEqual({ issuer: "cal" });
    expect(matchCardPaymentIssuer("מקסימום פיננסים")).toEqual({ issuer: "max" });
    expect(matchCardPaymentIssuer("לאומי קארד")).toEqual({ issuer: "max" });
    expect(matchCardPaymentIssuer("AMERICAN EXPRESS")).toEqual({ issuer: "amex" });
  });

  test("issuer wins over network when both appear", () => {
    expect(matchCardPaymentIssuer("ויזה כ.א.ל")).toEqual({ issuer: "cal" });
  });

  test("network-only descriptions are ambiguous", () => {
    expect(matchCardPaymentIssuer("חיוב ויזה")).toEqual({ issuer: "ambiguous" });
    expect(matchCardPaymentIssuer("מאסטרקארד")).toEqual({ issuer: "ambiguous" });
    expect(matchCardPaymentIssuer("כרטיסי אשראי")).toEqual({ issuer: "ambiguous" });
  });

  test("non-card descriptions return null", () => {
    expect(matchCardPaymentIssuer("העברת משכורת")).toBeNull();
    expect(matchCardPaymentIssuer("")).toBeNull();
  });

  test("resolver matches exactly when matchesCreditCardPayment matches", () => {
    const samples = [
      "חיוב ויזה",
      "ישראכרט",
      "כ.א.ל",
      "מקסימום",
      "מאסטרקארד",
      "אמריקן אקספרס",
      "דיינרס",
      "כרטיסי אשראי",
      "העברת משכורת",
      "סופרמרקט",
    ];
    for (const s of samples) {
      expect(matchCardPaymentIssuer(s) !== null).toBe(matchesCreditCardPayment(s));
    }
  });

  test("CREDIT_CARD_PAYMENT_PATTERNS still exposes a flat regex list", () => {
    expect(CREDIT_CARD_PAYMENT_PATTERNS.length).toBeGreaterThan(0);
    expect(CREDIT_CARD_PAYMENT_PATTERNS.every((p) => p instanceof RegExp)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test 2>&1 | grep -A3 matchCardPaymentIssuer`
Expected: FAIL — `matchCardPaymentIssuer` is not exported.

- [ ] **Step 3: Implement the resolver**

In `src/server/lib/transfers.ts`, replace the existing `CREDIT_CARD_PAYMENT_PATTERNS` declaration (lines 22-46) with the issuer-grouped version below, and add the resolver. Keep every other export untouched.

```ts
export type CardIssuer = "isracard" | "cal" | "max" | "amex";
export type CardPaymentMatch = { issuer: CardIssuer } | { issuer: "ambiguous" } | null;

export const CARD_ISSUERS: readonly CardIssuer[] = ["isracard", "cal", "max", "amex"];

const ISSUER_PATTERNS: Record<CardIssuer, readonly RegExp[]> = {
  isracard: [/ישראכרט/i, /ישרא[\s־-]?כארד/i, /\bISRACARD\b/i],
  cal: [/כ[\s.\-־]?א[\s.\-־]?ל/i, /\bCAL\b/i],
  max: [/מקסימום/i, /לאומי\s*קארד/i, /\bMAX\b/i, /\bLEUMI\s+CARD\b/i],
  amex: [/אמריקן\s*אקספרס/i, /אמקס/i, /\bAMEX\b/i, /\bAMERICAN\s+EXPRESS\b/i],
};

const AMBIGUOUS_CARD_PATTERNS: readonly RegExp[] = [
  /ויזה/i,
  /מאסטרקארד/i,
  /דיינרס/i,
  /תשלום\s*אשראי/i,
  /כרטיסי?\s*אשראי/i,
  /חיוב\s*כרטיס/i,
  /חיוב\s*לכרטיס/i,
  /\bVISA\b/i,
  /\bMASTERCARD\b/i,
  /\bDINERS\b/i,
];

export const CREDIT_CARD_PAYMENT_PATTERNS: readonly RegExp[] = [
  ...CARD_ISSUERS.flatMap((issuer) => ISSUER_PATTERNS[issuer]),
  ...AMBIGUOUS_CARD_PATTERNS,
];

export function matchCardPaymentIssuer(description: string): CardPaymentMatch {
  const normalized = description.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  for (const issuer of CARD_ISSUERS) {
    if (ISSUER_PATTERNS[issuer].some((pattern) => pattern.test(normalized))) {
      return { issuer };
    }
  }
  if (AMBIGUOUS_CARD_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { issuer: "ambiguous" };
  }
  return null;
}
```

`matchesCreditCardPayment` and `detectKind` already reference `CREDIT_CARD_PAYMENT_PATTERNS`, so they keep working with identical coverage.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test 2>&1 | grep -E "transfers.test|matchCardPaymentIssuer|pass|fail"`
Expected: PASS for the new `matchCardPaymentIssuer` block; all prior `transfers.test.ts` tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/lib/transfers.ts src/server/lib/transfers.test.ts
git commit -m "feat: resolve credit-card bill payments to a specific issuer"
```

---

## Task 2: Connected card issuers query

**Files:**
- Modify: `src/server/db/queries/bank-credentials.ts`
- Test: `src/server/db/queries/bank-credentials.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/server/db/queries/bank-credentials.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { cardIssuersFromProviders } from "@/server/db/queries/bank-credentials";

describe("cardIssuersFromProviders", () => {
  test("keeps only providers whose BANK_PROVIDERS kind is card", () => {
    const result = cardIssuersFromProviders(["leumi", "isracard", "max", "hapoalim"]);
    expect([...result].sort()).toEqual(["isracard", "max"]);
  });

  test("ignores unknown providers and dedups", () => {
    const result = cardIssuersFromProviders(["cal", "cal", "nope"]);
    expect([...result]).toEqual(["cal"]);
  });

  test("returns an empty set when no card providers present", () => {
    expect(cardIssuersFromProviders(["leumi", "hapoalim"]).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test 2>&1 | grep -A3 cardIssuersFromProviders`
Expected: FAIL — `cardIssuersFromProviders` is not exported.

- [ ] **Step 3: Implement the pure helper and the workspace query**

In `src/server/db/queries/bank-credentials.ts`, add the import and two functions. Add `BANK_PROVIDERS` and the `CardIssuer` type to the imports at the top of the file.

```ts
import { BANK_PROVIDERS } from "@/lib/types";
import { CARD_ISSUERS, type CardIssuer } from "@/server/lib/transfers";

const CARD_PROVIDER_IDS = new Set<string>(
  BANK_PROVIDERS.filter((b) => b.kind === "card").map((b) => b.id),
);

export function cardIssuersFromProviders(providers: readonly string[]): Set<CardIssuer> {
  const issuers = new Set<CardIssuer>();
  for (const provider of providers) {
    if (CARD_PROVIDER_IDS.has(provider) && (CARD_ISSUERS as readonly string[]).includes(provider)) {
      issuers.add(provider as CardIssuer);
    }
  }
  return issuers;
}

export function getConnectedCardIssuers(workspaceId: number): Set<CardIssuer> {
  return cardIssuersFromProviders(listBankCredentials(workspaceId).map((c) => c.provider));
}
```

(`listBankCredentials` is already defined in this file.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test 2>&1 | grep -E "bank-credentials.test|cardIssuersFromProviders|pass|fail"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/queries/bank-credentials.ts src/server/db/queries/bank-credentials.test.ts
git commit -m "feat: expose connected credit-card issuers for a workspace"
```

---

## Task 3: Connected-issuer logic in the matching engine

**Files:**
- Modify: `src/server/lib/matching.ts:47-49` (`ProposeOptions`), `src/server/lib/matching.ts:163-191` (cc branch)
- Test: `src/server/lib/matching.test.ts`

- [ ] **Step 1: Update test fixtures and rewrite the card-payment tests**

In `src/server/lib/matching.test.ts`, add the import and a `CardIssuer` set helper, and replace the option fixtures (lines 40-41) and the two card-payment tests (lines 80-101).

Add near the top imports:

```ts
import type { CardIssuer } from "@/server/lib/transfers";

const noCards = new Set<CardIssuer>();
const withCal = new Set<CardIssuer>(["cal"]);
```

Replace the `NO_ATM` / `WITH_ATM` constants:

```ts
const NO_ATM = { treatAtmAsTransfers: false, connectedCardIssuers: noCards };
const WITH_ATM = { treatAtmAsTransfers: true, connectedCardIssuers: noCards };
```

Replace the test `"wraps a bank-side credit card bill payment as a single-leg event"` and `"does not wrap card payments from a non-bank provider"` with:

```ts
test("counts a bank card bill as spend when no card is connected", () => {
  const events = proposeEvents(
    [cand({ id: 5, provider: "hapoalim", kind: "transfer", description: "חיוב ויזה" })],
    SETTINGS,
    { treatAtmAsTransfers: false, connectedCardIssuers: noCards },
  );
  expect(events).toHaveLength(1);
  expect(events[0].eventType).toBe("credit_card_payment");
  expect(events[0].members[0].role).toBe("bill_payment");
  expect(events[0].members[0].flipKindTo).toBe("expense");
  expect(events[0].needsReview).toBe(false);
});

test("excludes a bill payment when its issuer is connected", () => {
  const events = proposeEvents(
    [cand({ id: 5, provider: "leumi", kind: "transfer", description: "תשלום לכ.א.ל" })],
    SETTINGS,
    { treatAtmAsTransfers: false, connectedCardIssuers: withCal },
  );
  expect(events).toHaveLength(1);
  expect(events[0].members[0].flipKindTo).toBeNull();
  expect(events[0].needsReview).toBe(false);
});

test("counts a bill payment when a different issuer is connected", () => {
  const events = proposeEvents(
    [cand({ id: 5, provider: "leumi", kind: "transfer", description: "מקסימום" })],
    SETTINGS,
    { treatAtmAsTransfers: false, connectedCardIssuers: withCal },
  );
  expect(events[0].members[0].flipKindTo).toBe("expense");
});

test("flags an ambiguous bill payment for review when a card is connected", () => {
  const events = proposeEvents(
    [cand({ id: 5, provider: "leumi", kind: "transfer", description: "חיוב ויזה" })],
    SETTINGS,
    { treatAtmAsTransfers: false, connectedCardIssuers: withCal },
  );
  expect(events[0].members[0].flipKindTo).toBeNull();
  expect(events[0].needsReview).toBe(true);
});

test("does not wrap card payments from a non-bank provider", () => {
  const events = proposeEvents(
    [cand({ id: 5, provider: "isracard", kind: "transfer", description: "ויזה" })],
    SETTINGS,
    { treatAtmAsTransfers: false, connectedCardIssuers: noCards },
  );
  expect(events).toHaveLength(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test 2>&1 | grep -E "matching.test|connectedCardIssuers|pass|fail"`
Expected: FAIL — `ProposeOptions` has no `connectedCardIssuers`, branch behavior not implemented.

- [ ] **Step 3: Implement the option and rewrite the cc branch**

In `src/server/lib/matching.ts`, update the import on lines 5-11 to bring in the resolver and drop the now-unused `matchesCreditCardPayment`:

```ts
import {
  isAtmWithdrawal,
  isBankProvider,
  matchCardPaymentIssuer,
  matchesInternalTransfer,
  type CardIssuer,
  type TransactionKind,
} from "@/server/lib/transfers";
```

Extend `ProposeOptions` (lines 47-49):

```ts
export interface ProposeOptions {
  treatAtmAsTransfers: boolean;
  connectedCardIssuers: ReadonlySet<CardIssuer>;
}
```

Replace the entire `const cc = settings.credit_card_payment;` block (lines 163-191) with:

```ts
  const cc = settings.credit_card_payment;
  if (cc?.enabled) {
    const hasAnyCard = opts.connectedCardIssuers.size > 0;
    for (const cand of candidates) {
      if (used.has(cand.id)) continue;
      if (cand.kind !== "transfer") continue;
      if (!isBankProvider(cand.provider)) continue;
      const match = matchCardPaymentIssuer(cand.description);
      if (!match) continue;

      let flipKindTo: TransactionKind | null = null;
      let needsReview = false;
      let reason: string;
      if (!hasAnyCard) {
        flipKindTo = "expense";
        reason = "No credit card connected; bill counted as spend";
      } else if (match.issuer === "ambiguous") {
        reason = "Card issuer undetermined; assumed covered by a connected card — confirm";
        needsReview = true;
      } else if (opts.connectedCardIssuers.has(match.issuer)) {
        reason =
          "Bank-side credit card bill payment (the individual card purchases are counted instead)";
      } else {
        flipKindTo = "expense";
        reason = `${match.issuer} not connected; bill counted as spend`;
      }

      events.push({
        eventType: "credit_card_payment",
        members: [
          {
            transactionId: cand.id,
            role: "bill_payment",
            flipKindTo,
            priorKind: cand.kind,
            grouping: true,
          },
        ],
        canonicalTransactionId: null,
        confidence: 0.9,
        reasons: [reason],
        eventKey: eventKeyFor("credit_card_payment", [cand]),
        needsReview,
      });
      used.add(cand.id);
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test 2>&1 | grep -E "matching.test|pass|fail"`
Expected: PASS for all `matching.test.ts` tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/lib/matching.ts src/server/lib/matching.test.ts
git commit -m "feat: classify card bill payments by connected-issuer coverage"
```

---

## Task 4: Wire connected issuers into the sync matching step

**Files:**
- Modify: `src/server/sync/matching-step.ts`

- [ ] **Step 1: Update the matching step to pass connected issuers**

Replace the contents of `src/server/sync/matching-step.ts` with:

```ts
import "server-only";

import { getConnectedCardIssuers } from "@/server/db/queries/bank-credentials";
import { applyProposedEvents, getMatchSettingsMap } from "@/server/db/queries/financial-events";
import { getMatchCandidates } from "@/server/db/queries/transactions";
import { proposeEvents } from "@/server/lib/matching";

export function runMatchingStep(
  workspaceId: number,
  fromDate: string,
  treatAtmAsTransfers: boolean,
): void {
  const candidates = getMatchCandidates(workspaceId, fromDate);
  if (candidates.length === 0) return;
  const settings = getMatchSettingsMap(workspaceId);
  const connectedCardIssuers = getConnectedCardIssuers(workspaceId);
  const proposals = proposeEvents(candidates, settings, {
    treatAtmAsTransfers,
    connectedCardIssuers,
  });
  applyProposedEvents(workspaceId, proposals);
}
```

- [ ] **Step 2: Run typecheck to verify the call compiles**

Run: `bunx tsc --noEmit 2>&1 | head`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/sync/matching-step.ts
git commit -m "feat: feed connected card issuers into the sync matching step"
```

---

## Task 5: Seed the "Credit Card" expense category

**Files:**
- Create: `src/server/db/migrations/025_seed_credit_card_category.sql`
- Modify: `src/server/db/queries/workspaces.ts` (seed list, after `Cash & ATM` at ~line 160)
- Modify: `src/server/db/queries/categories.ts:264` (`SEEDED_CATEGORY_PARENTS`)

- [ ] **Step 1: Write the migration**

Create `src/server/db/migrations/025_seed_credit_card_category.sql`:

```sql
-- Seed a dedicated "Credit Card" expense category so bank-side card bill
-- payments that count as spend (no matching card connected) have a clear home,
-- mirroring "Cash & ATM". Parented under "Money Movement" like other money-flow
-- categories. Idempotent: INSERT OR IGNORE relies on the per-workspace unique
-- name constraint.

INSERT OR IGNORE INTO categories
  (workspace_id, parent_id, name, color, icon, kind, budget_mode, description)
SELECT w.id, NULL, 'Credit Card', '#C7B27A', 'credit-card', 'expense', 'tracking',
       'Lump credit-card bill payments from a bank when the card itself is not connected.'
FROM workspaces w;

UPDATE categories
SET parent_id = (
  SELECT p.id FROM categories p
  WHERE p.workspace_id = categories.workspace_id
    AND p.parent_id IS NULL
    AND p.name = 'Money Movement'
)
WHERE name = 'Credit Card' AND kind = 'expense';
```

- [ ] **Step 2: Add the category to the per-workspace seed list**

In `src/server/db/queries/workspaces.ts`, immediately after the `Cash & ATM` object (ends at line ~160), insert:

```ts
  {
    name: "Credit Card",
    color: "#C7B27A",
    icon: "credit-card",
    kind: "expense",
    description:
      "Lump credit-card bill payments from a bank when the card itself is not connected.",
  },
```

- [ ] **Step 3: Add the parent mapping**

In `src/server/db/queries/categories.ts`, inside `SEEDED_CATEGORY_PARENTS` (the object ending at line 268), add after the `"Cash & ATM": "Money Movement",` entry:

```ts
  "Credit Card": "Money Movement",
```

- [ ] **Step 4: Run the migration and verify the category exists for a fresh DB**

Run:
```bash
BUDGETEER_DATA_DIR=$(mktemp -d) bun run test 2>&1 | grep -E "pass|fail" | tail -3
```
Expected: PASS (migrations run on DB init during tests; no migration error).

- [ ] **Step 5: Commit**

```bash
git add src/server/db/migrations/025_seed_credit_card_category.sql src/server/db/queries/workspaces.ts src/server/db/queries/categories.ts
git commit -m "feat: seed a Credit Card expense category under Money Movement"
```

---

## Task 6: Auto-categorize newly-counted card bills

**Files:**
- Modify: `src/server/db/queries/transactions.ts:398-413` (rename `getUncategorizedAtmExpenses` → `getUncategorizedExpenses`)
- Modify: `src/server/sync/orchestrator.ts:413-425` (ATM block + new Credit Card block)

- [ ] **Step 1: Rename the query to a generic name**

In `src/server/db/queries/transactions.ts`, rename `getUncategorizedAtmExpenses` to `getUncategorizedExpenses` (the body is already generic — it returns all uncategorized `kind = 'expense'` rows). The signature becomes:

```ts
export function getUncategorizedExpenses(
  workspaceId: number,
): { id: number; description: string }[] {
```

Leave the body unchanged.

- [ ] **Step 2: Update the orchestrator ATM block and add the Credit Card block**

In `src/server/sync/orchestrator.ts`, update the import of the renamed query, add `matchCardPaymentIssuer` to the `@/server/lib/transfers` import (which already imports `isAtmWithdrawal`), and replace the ATM block (lines 413-425) with:

```ts
  if (!settings.treatAtmAsTransfers) {
    const atmCategory = getCategoryByName(workspaceId, "Cash & ATM");
    if (atmCategory) {
      const atmUpdates = getUncategorizedExpenses(workspaceId).flatMap((r) =>
        isAtmWithdrawal(r.description) ? [{ id: r.id, categoryId: atmCategory.id }] : [],
      );
      if (atmUpdates.length > 0) {
        batchUpdateCategories(workspaceId, atmUpdates);
        categorized += atmUpdates.length;
      }
    }
  }

  const creditCardCategory = getCategoryByName(workspaceId, "Credit Card");
  if (creditCardCategory) {
    const cardUpdates = getUncategorizedExpenses(workspaceId).flatMap((r) =>
      matchCardPaymentIssuer(r.description) ? [{ id: r.id, categoryId: creditCardCategory.id }] : [],
    );
    if (cardUpdates.length > 0) {
      batchUpdateCategories(workspaceId, cardUpdates);
      categorized += cardUpdates.length;
    }
  }
```

Only bills that the matching step flipped to `kind = 'expense'` reach this block (excluded bills stay `transfer` and are not returned by `getUncategorizedExpenses`).

- [ ] **Step 3: Run typecheck and tests**

Run: `bunx tsc --noEmit 2>&1 | head && bun run test 2>&1 | grep -E "pass|fail" | tail -2`
Expected: no type errors; tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/server/db/queries/transactions.ts src/server/sync/orchestrator.ts
git commit -m "feat: file uncovered card bill payments under the Credit Card category"
```

---

## Task 7: Re-derive on card connect/disconnect

**Files:**
- Modify: `src/server/db/queries/financial-events.ts` (add `reclassifyCardPayments`)
- Test: `src/server/db/queries/reclassify-card-payments.test.ts` (create)
- Modify: `src/app/api/setup/bank/route.ts`
- Modify: `src/app/api/integrations/[id]/route.ts`

- [ ] **Step 1: Write the failing integration test**

Create `src/server/db/queries/reclassify-card-payments.test.ts`. It seeds a workspace, inserts a Leumi `כ.א.ל` bill payment as `transfer`, runs reclassify with no cards (expects flip to `expense` + `Credit Card` category) and then with `cal` connected (expects flip back to `transfer`).

```ts
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { getOrm } from "@/server/db/orm";
import { transactions } from "@/server/db/schema";
import { reclassifyCardPayments } from "@/server/db/queries/financial-events";
import { getCategoryByName } from "@/server/db/queries/categories";
import { listAllWorkspaceIds } from "@/server/lib/workspace-context";
import type { CardIssuer } from "@/server/lib/transfers";

function seedBill(workspaceId: number): number {
  const row = getOrm()
    .insert(transactions)
    .values({
      workspaceId,
      provider: "leumi",
      accountNumber: "A1",
      date: "2026-05-10",
      description: "תשלום לכ.א.ל",
      chargedAmount: -2000,
      chargedCurrency: "ILS",
      originalAmount: -2000,
      originalCurrency: "ILS",
      kind: "transfer",
      status: "completed",
      dedupHash: `cc-${Date.now()}`,
      dedupSequence: 0,
    })
    .returning({ id: transactions.id })
    .get();
  return row.id;
}

function readBill(id: number): { kind: string; categoryId: number | null } {
  return getOrm()
    .select({ kind: transactions.kind, categoryId: transactions.categoryId })
    .from(transactions)
    .where(eq(transactions.id, id))
    .get()!;
}

describe("reclassifyCardPayments", () => {
  test("counts the bill as expense with no card, excludes it once the issuer connects", () => {
    const workspaceId = listAllWorkspaceIds()[0];
    const billId = seedBill(workspaceId);

    reclassifyCardPayments(workspaceId, new Set<CardIssuer>());
    const afterNoCard = readBill(billId);
    expect(afterNoCard.kind).toBe("expense");
    expect(afterNoCard.categoryId).toBe(getCategoryByName(workspaceId, "Credit Card")!.id);

    reclassifyCardPayments(workspaceId, new Set<CardIssuer>(["cal"]));
    expect(readBill(billId).kind).toBe("transfer");
  });
});
```

The schema field names (`originalAmount`, `chargedCurrency`, `dedupSequence`, etc.) must match `src/server/db/schema.ts` `transactions`; adjust any that differ when implementing (the insert just needs the NOT NULL columns populated).

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test 2>&1 | grep -A3 reclassifyCardPayments`
Expected: FAIL — `reclassifyCardPayments` not exported.

- [ ] **Step 3: Implement `reclassifyCardPayments`**

In `src/server/db/queries/financial-events.ts`, add imports for the resolver, the candidate query, the proposer, the category lookup, and batch category update, then add the function. (`getCategoryByName` lives in `categories.ts`, `getMatchCandidates`/`batchUpdateCategories` in `transactions.ts`, `proposeEvents` in `matching.ts`.)

```ts
import { matchCardPaymentIssuer, type CardIssuer } from "@/server/lib/transfers";
import { proposeEvents } from "@/server/lib/matching";
import { getMatchCandidates, batchUpdateCategories } from "@/server/db/queries/transactions";
import { getCategoryByName } from "@/server/db/queries/categories";

const ALL_TIME = "0001-01-01";

export function reclassifyCardPayments(
  workspaceId: number,
  connectedCardIssuers: ReadonlySet<CardIssuer>,
): void {
  getOrm().transaction((tx) => {
    const events = tx
      .select({ id: financialEvents.id })
      .from(financialEvents)
      .where(
        and(
          eq(financialEvents.workspaceId, workspaceId),
          eq(financialEvents.eventType, "credit_card_payment"),
          ne(financialEvents.status, "rejected"),
        ),
      )
      .all();

    for (const ev of events) {
      const members = tx
        .select({ transactionId: eventMembers.transactionId, priorKind: eventMembers.priorKind })
        .from(eventMembers)
        .where(and(eq(eventMembers.workspaceId, workspaceId), eq(eventMembers.eventId, ev.id)))
        .all();
      for (const m of members) {
        tx.update(transactions)
          .set({
            eventId: null,
            eventRole: null,
            matchConfidence: null,
            needsReview: 0,
            updatedAt: sql`datetime('now')`,
            ...(m.priorKind ? { kind: m.priorKind } : { kind: "transfer" }),
          })
          .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.id, m.transactionId)))
          .run();
      }
      tx.delete(eventMembers)
        .where(and(eq(eventMembers.workspaceId, workspaceId), eq(eventMembers.eventId, ev.id)))
        .run();
      tx.delete(financialEvents)
        .where(and(eq(financialEvents.workspaceId, workspaceId), eq(financialEvents.id, ev.id)))
        .run();
    }
  });

  const candidates = getMatchCandidates(workspaceId, ALL_TIME).filter(
    (c) => c.kind === "transfer" && matchCardPaymentIssuer(c.description) !== null,
  );
  const settings = getMatchSettingsMap(workspaceId);
  const proposals = proposeEvents(candidates, settings, {
    treatAtmAsTransfers: false,
    connectedCardIssuers,
  });
  applyProposedEvents(workspaceId, proposals);

  const creditCardCategory = getCategoryByName(workspaceId, "Credit Card");
  if (creditCardCategory) {
    const flippedToExpense = candidates.flatMap((c) => {
      const decided = proposals.find((p) => p.members.some((m) => m.transactionId === c.id));
      const flippedExpense = decided?.members.some(
        (m) => m.transactionId === c.id && m.flipKindTo === "expense",
      );
      return flippedExpense ? [{ id: c.id, categoryId: creditCardCategory.id }] : [];
    });
    if (flippedToExpense.length > 0) batchUpdateCategories(workspaceId, flippedToExpense);
  }
}
```

`getMatchCandidates` only returns rows with `eventId IS NULL`, so clearing the event links above makes the bills eligible again.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test 2>&1 | grep -E "reclassify|pass|fail" | tail -3`
Expected: PASS.

- [ ] **Step 5: Hook reclassify into the bank-setup route**

In `src/app/api/setup/bank/route.ts`, add imports and trigger reclassify after a successful save when the saved provider is a card. Add to imports:

```ts
import { BANK_PROVIDERS } from "@/lib/types";
import { getConnectedCardIssuers } from "@/server/db/queries/bank-credentials";
import { reclassifyCardPayments } from "@/server/db/queries/financial-events";
```

Replace the success branch in the `try` block:

```ts
    const id = saveBankCredentials(workspaceId, body.provider, merged, {
      credentialId,
      label,
      requiresManualTwoFactor: body.requiresManualTwoFactor,
    });
    if (info?.kind === "card") {
      reclassifyCardPayments(workspaceId, getConnectedCardIssuers(workspaceId));
    }
    return NextResponse.json({ success: true, credentialId: id });
```

(`info` is already computed earlier in the handler as `BANK_PROVIDERS.find((b) => b.id === body.provider)`.)

- [ ] **Step 6: Hook reclassify into the integration-delete route**

In `src/app/api/integrations/[id]/route.ts`, add imports:

```ts
import { BANK_PROVIDERS } from "@/lib/types";
import { getConnectedCardIssuers } from "@/server/db/queries/bank-credentials";
import { reclassifyCardPayments } from "@/server/db/queries/financial-events";
```

Replace the `DELETE` body (lines 91-101) with a version that captures the provider before deletion and reclassifies if it was a card:

```ts
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const credentialId = parseCredentialId(id);
  if (credentialId === null) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const meta = getBankCredentialMeta(workspaceId, credentialId);
  const wasCard = meta != null && BANK_PROVIDERS.find((b) => b.id === meta.provider)?.kind === "card";

  deleteBankCredentials(workspaceId, credentialId);

  if (wasCard) {
    reclassifyCardPayments(workspaceId, getConnectedCardIssuers(workspaceId));
  }
  return NextResponse.json({ success: true });
}
```

(`getBankCredentialMeta` is already imported in this route.)

- [ ] **Step 7: Run typecheck and the full test suite**

Run: `bunx tsc --noEmit 2>&1 | head && bun run test 2>&1 | grep -E "pass|fail" | tail -2`
Expected: no type errors; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/server/db/queries/financial-events.ts src/server/db/queries/reclassify-card-payments.test.ts src/app/api/setup/bank/route.ts "src/app/api/integrations/[id]/route.ts"
git commit -m "feat: re-derive card-payment classification on card connect/disconnect"
```

---

## Task 8: Full CI gate and manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full CI gate**

Run: `bun run ci`
Expected: format, lint, typecheck, i18n, knip, react:doctor, security, and tests all pass. Fix any knip "unused export" hits (e.g. if `getConnectedCardIssuers` or `reclassifyCardPayments` is reported unused, confirm the route/step wiring imports them).

- [ ] **Step 2: Manual smoke test against a mock DB**

Run:
```bash
BUDGETEER_DATA_DIR=$(mktemp -d) bun dev
```
Seed a bank-only scenario (Leumi credential + a `כ.א.ל` bill-payment transaction via the setup/transactions APIs as described in CLAUDE.md), sync, and confirm on the dashboard that the bill is included in the "where the money went" breakdown under `Credit Card`. Then connect a CAL credential and confirm the bill drops out of spend (becomes a transfer).

- [ ] **Step 3: Commit any CI fixups**

```bash
git add -A
git commit -m "chore: satisfy CI for card-payment issuer awareness"
```

---

## Notes for the implementer

- **No comments, no `any`, no suppression directives** (project rule). The code blocks above follow this.
- **No em dashes** in code, commits, or docs.
- `detectKind` and `matchesCreditCardPayment` are intentionally untouched — the conservative `transfer`-at-insert default is what `reclassifyCardPayments` and the matching step then refine.
- The migration is idempotent; re-running the suite against a fresh `BUDGETEER_DATA_DIR` must not error.
