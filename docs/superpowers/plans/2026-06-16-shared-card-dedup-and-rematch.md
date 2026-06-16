# Shared-Card Dedup and Card-Bill Rematch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a credit-card account shared by two credentials from producing duplicate account rows, and make a per-card bill match its purchase cycle after the purchases sync in.

**Architecture:** A card's identity is `(workspace_id, provider, account_number)`; the oldest `bank_accounts` row owns it. At ingest, transactions for a shared card are attributed to the owner credential and the duplicate account row is skipped. After a sync that brings in new card data, the card-event matcher is rebuilt so stuck "counted as spend" bills are re-evaluated. A one-time migration collapses pre-existing duplicates.

**Tech Stack:** Next.js 16 (App Router, server-only modules), TypeScript strict, better-sqlite3 + drizzle-orm, Bun test runner (`--conditions react-server`), SQLite migrations via `db.exec`.

**Spec:** `docs/superpowers/specs/2026-06-16-shared-card-dedup-and-rematch-design.md`

**Constraints from CLAUDE.md / AGENTS.md:**
- No comments in code. No `any` without justification. No em dashes.
- `import "server-only"` at the top of every `src/server/` file.
- Tests are pure-logic only (better-sqlite3 will not load under `bun test`). DB-touching code is verified via the dev server, not unit tests.
- Conventional commits; commit message footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- Create: `src/server/sync/card-ownership.ts` — pure helpers (no DB imports): `classifyScrapedCards`, `isCardIssuerProvider`, `hasCardDataChange`.
- Create: `src/server/sync/card-ownership.test.ts` — unit tests for the pure helpers.
- Modify: `src/server/db/queries/bank-accounts.ts` — add `getCardOwners` bulk read.
- Modify: `src/server/db/queries/transactions.ts` — `insertTransactions` gains an optional per-card owner map.
- Modify: `src/server/sync/orchestrator.ts` — resolve owners, attribute shared-card transactions to the owner, skip duplicate account upserts, report shared/new cards, and run the gated post-sync card rematch.
- Modify: `src/server/db/queries/financial-events.ts` — `reclassifyCardPayments` resets only bill members, preserving purchase categories.
- Modify: `src/server/lib/matching.test.ts` — add a regression test for the stuck-bill-then-purchases case.
- Create: `src/server/db/migrations/028_dedup_shared_card_accounts.sql` — collapse existing duplicate card accounts.
- Modify: `src/components/dashboard/sync-button.tsx` — surface the shared/new card summary.

---

## Task 1: Pure card-ownership helpers

**Files:**
- Create: `src/server/sync/card-ownership.ts`
- Test: `src/server/sync/card-ownership.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/sync/card-ownership.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";

import {
  classifyScrapedCards,
  hasCardDataChange,
  isCardIssuerProvider,
} from "@/server/sync/card-ownership";

describe("isCardIssuerProvider", () => {
  test("true for card issuers, false for banks", () => {
    expect(isCardIssuerProvider("cal")).toBe(true);
    expect(isCardIssuerProvider("isracard")).toBe(true);
    expect(isCardIssuerProvider("leumi")).toBe(false);
    expect(isCardIssuerProvider("unknown")).toBe(false);
  });
});

describe("classifyScrapedCards", () => {
  test("new card (no prior owner) is owned by the syncing credential", () => {
    const c = classifyScrapedCards(7, ["4384"], new Map());
    expect(c.newlyAdded).toEqual(["4384"]);
    expect(c.shared).toEqual([]);
    expect(c.existingOwn).toEqual([]);
    expect(c.ownerByAccount.get("4384")).toBe(7);
  });

  test("card owned by another credential is shared and keeps its owner", () => {
    const c = classifyScrapedCards(7, ["3307"], new Map([["3307", 3]]));
    expect(c.shared).toEqual(["3307"]);
    expect(c.newlyAdded).toEqual([]);
    expect(c.ownerByAccount.get("3307")).toBe(3);
  });

  test("card already owned by the syncing credential is existingOwn", () => {
    const c = classifyScrapedCards(7, ["8682"], new Map([["8682", 7]]));
    expect(c.existingOwn).toEqual(["8682"]);
    expect(c.shared).toEqual([]);
    expect(c.newlyAdded).toEqual([]);
    expect(c.ownerByAccount.get("8682")).toBe(7);
  });

  test("mixed batch is partitioned and duplicates are ignored", () => {
    const c = classifyScrapedCards(
      7,
      ["3307", "4384", "8682", "4384"],
      new Map([
        ["3307", 3],
        ["8682", 7],
      ]),
    );
    expect(c.shared).toEqual(["3307"]);
    expect(c.newlyAdded).toEqual(["4384"]);
    expect(c.existingOwn).toEqual(["8682"]);
    expect(c.ownerByAccount.get("4384")).toBe(7);
  });
});

describe("hasCardDataChange", () => {
  test("true when a card issuer added rows", () => {
    expect(
      hasCardDataChange([{ ok: true, provider: "cal", added: 3, updated: 0 }]),
    ).toBe(true);
  });

  test("true when a card issuer only updated rows", () => {
    expect(
      hasCardDataChange([{ ok: true, provider: "cal", added: 0, updated: 2 }]),
    ).toBe(true);
  });

  test("false for a bank provider", () => {
    expect(
      hasCardDataChange([{ ok: true, provider: "leumi", added: 9, updated: 9 }]),
    ).toBe(false);
  });

  test("false when the card sync failed or had no changes", () => {
    expect(
      hasCardDataChange([{ ok: false, provider: "cal", added: 5, updated: 5 }]),
    ).toBe(false);
    expect(
      hasCardDataChange([{ ok: true, provider: "cal", added: 0, updated: 0 }]),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/server/sync/card-ownership.test.ts`
Expected: FAIL with a module-not-found / `classifyScrapedCards is not a function` error.

- [ ] **Step 3: Write the implementation**

Create `src/server/sync/card-ownership.ts`:

```typescript
import "server-only";

import { BANK_PROVIDERS } from "@/lib/types";

export interface CardClassification {
  ownerByAccount: Map<string, number>;
  shared: string[];
  newlyAdded: string[];
  existingOwn: string[];
}

export interface SyncCountResult {
  ok: boolean;
  provider: string;
  added: number;
  updated: number;
}

export function isCardIssuerProvider(provider: string): boolean {
  return BANK_PROVIDERS.find((b) => b.id === provider)?.kind === "card";
}

export function classifyScrapedCards(
  syncingCredentialId: number,
  scrapedAccountNumbers: readonly string[],
  priorOwnerByAccount: ReadonlyMap<string, number>,
): CardClassification {
  const result: CardClassification = {
    ownerByAccount: new Map<string, number>(),
    shared: [],
    newlyAdded: [],
    existingOwn: [],
  };
  const seen = new Set<string>();
  for (const accountNumber of scrapedAccountNumbers) {
    if (seen.has(accountNumber)) continue;
    seen.add(accountNumber);
    const priorOwner = priorOwnerByAccount.get(accountNumber);
    const owner = priorOwner ?? syncingCredentialId;
    result.ownerByAccount.set(accountNumber, owner);
    if (priorOwner === undefined) {
      result.newlyAdded.push(accountNumber);
    } else if (priorOwner === syncingCredentialId) {
      result.existingOwn.push(accountNumber);
    } else {
      result.shared.push(accountNumber);
    }
  }
  return result;
}

export function hasCardDataChange(results: readonly SyncCountResult[]): boolean {
  return results.some(
    (r) => r.ok && isCardIssuerProvider(r.provider) && r.added + r.updated > 0,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/server/sync/card-ownership.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/server/sync/card-ownership.ts src/server/sync/card-ownership.test.ts
git commit -m "feat: pure card-ownership classification helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: getCardOwners bulk read

**Files:**
- Modify: `src/server/db/queries/bank-accounts.ts` (append a new exported function near the bottom)

This is a DB read; it is verified via the dev server in Task 8, not a unit test.

- [ ] **Step 1: Add the query**

Append to `src/server/db/queries/bank-accounts.ts`:

```typescript
export function getCardOwners(
  workspaceId: number,
  provider: string,
  accountNumbers: readonly string[],
): Map<string, number> {
  const owners = new Map<string, number>();
  if (accountNumbers.length === 0) return owners;
  const placeholders = accountNumbers.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT ba.account_number AS account_number, ba.credential_id AS credential_id
       FROM bank_accounts ba
       JOIN bank_credentials bc ON ba.credential_id = bc.id
       WHERE ba.workspace_id = ? AND bc.provider = ?
         AND ba.account_number IN (${placeholders})
       ORDER BY ba.created_at ASC, ba.id ASC`,
    )
    .all(workspaceId, provider, ...accountNumbers) as {
    account_number: string;
    credential_id: number;
  }[];
  for (const r of rows) {
    if (!owners.has(r.account_number)) owners.set(r.account_number, r.credential_id);
  }
  return owners;
}
```

The `ORDER BY created_at ASC, id ASC` plus first-wins map insertion makes the oldest row the owner. `getDb` is already imported at the top of this file.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git add src/server/db/queries/bank-accounts.ts
git commit -m "feat: getCardOwners resolves the owning credential per card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Per-card owner attribution in insertTransactions

**Files:**
- Modify: `src/server/db/queries/transactions.ts:43-145` (`insertTransactions`)

DB-touching; verified via the dev server in Task 8. The default behavior (no map) is unchanged, so existing callers and tests are unaffected.

- [ ] **Step 1: Add the optional parameter to the signature**

In `src/server/db/queries/transactions.ts`, change the `insertTransactions` signature from:

```typescript
export function insertTransactions(
  workspaceId: number,
  transactions: RawTransaction[],
  provider: string,
  credentialId: number,
  syncRunId: number,
): InsertResult {
```

to:

```typescript
export function insertTransactions(
  workspaceId: number,
  transactions: RawTransaction[],
  provider: string,
  credentialId: number,
  syncRunId: number,
  ownerByAccount?: ReadonlyMap<string, number>,
): InsertResult {
```

- [ ] **Step 2: Resolve the owner per row**

Inside the `for (const txn of transactions)` loop, immediately before the `const params = {` line, add:

```typescript
      const rowCredentialId = ownerByAccount?.get(txn.accountNumber) ?? credentialId;
```

Then change the `params` object's `credentialId` field from:

```typescript
        credentialId,
```

to:

```typescript
        credentialId: rowCredentialId,
```

Leave everything else (dedup hash, sequence, kind detection) unchanged. The dedup hash already excludes `credentialId`, so attribution does not affect dedup.

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/db/queries/transactions.ts
git commit -m "feat: attribute shared-card transactions to the owning credential

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Wire ownership into the sync orchestrator

**Files:**
- Modify: `src/server/sync/orchestrator.ts` (imports; `ProviderResult` interface ~45-54; `syncOneCredential` ingest ~232-268)

DB/flow change; verified via the dev server in Task 8.

- [ ] **Step 1: Add imports**

In `src/server/sync/orchestrator.ts`, change the bank-accounts import line:

```typescript
import { upsertBankAccount } from "@/server/db/queries/bank-accounts";
```

to:

```typescript
import { getCardOwners, upsertBankAccount } from "@/server/db/queries/bank-accounts";
```

Add this import alongside the other `@/server/sync/*` imports (near the `runMatchingStep` import):

```typescript
import { classifyScrapedCards } from "@/server/sync/card-ownership";
```

- [ ] **Step 2: Extend ProviderResult**

Change the `ProviderResult` interface from:

```typescript
export interface ProviderResult {
  provider: BankProvider;
  credentialId: number;
  label: string;
  ok: boolean;
  added: number;
  updated: number;
  errorMessage?: string;
  syncRunId?: number;
}
```

to:

```typescript
export interface ProviderResult {
  provider: BankProvider;
  credentialId: number;
  label: string;
  ok: boolean;
  added: number;
  updated: number;
  errorMessage?: string;
  syncRunId?: number;
  sharedCards?: string[];
  newCards?: string[];
}
```

- [ ] **Step 3: Resolve owners and attribute at ingest**

In `syncOneCredential`, replace this block (currently around lines 241-255):

```typescript
  const { added, updated } = insertTransactions(
    workspaceId,
    allTransactions,
    provider,
    meta.id,
    syncRunId,
  );

  for (const account of result.accounts) {
    upsertBankAccount(workspaceId, meta.id, account.accountNumber, {
      balance: account.balance,
      groupKey: account.groupKey,
      groupName: account.groupName,
    });
  }
```

with:

```typescript
  const scrapedAccountNumbers = result.accounts.map((a) => a.accountNumber);
  const priorOwners = getCardOwners(workspaceId, provider, scrapedAccountNumbers);
  const classification = classifyScrapedCards(meta.id, scrapedAccountNumbers, priorOwners);

  const { added, updated } = insertTransactions(
    workspaceId,
    allTransactions,
    provider,
    meta.id,
    syncRunId,
    classification.ownerByAccount,
  );

  for (const account of result.accounts) {
    if (classification.ownerByAccount.get(account.accountNumber) !== meta.id) continue;
    upsertBankAccount(workspaceId, meta.id, account.accountNumber, {
      balance: account.balance,
      groupKey: account.groupKey,
      groupName: account.groupName,
    });
  }
```

This skips the duplicate `bank_accounts` upsert for cards owned by another credential and attributes their transactions to the owner.

- [ ] **Step 4: Return the shared/new report**

In the same function, change the success return (currently around lines 260-268) from:

```typescript
  return {
    provider,
    credentialId: meta.id,
    label: meta.label,
    ok: true,
    added,
    updated,
    syncRunId,
  };
```

to:

```typescript
  return {
    provider,
    credentialId: meta.id,
    label: meta.label,
    ok: true,
    added,
    updated,
    syncRunId,
    sharedCards: classification.shared,
    newCards: classification.newlyAdded,
  };
```

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/sync/orchestrator.ts
git commit -m "feat: skip duplicate card accounts and report shared vs new cards on sync

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Preserve purchase categories in reclassifyCardPayments and run the post-sync rematch

**Files:**
- Modify: `src/server/db/queries/financial-events.ts:280-352` (`reclassifyCardPayments`)
- Modify: `src/server/sync/orchestrator.ts` (imports; `syncWorkspace` after `runMatchingStep`, ~line 412)

DB/flow change; verified via the dev server in Task 8.

- [ ] **Step 1: Reset only bill members**

In `reclassifyCardPayments`, the inner loop currently selects `transactionId` and `priorKind` and resets every member. Change the member select from:

```typescript
      const members = tx
        .select({ transactionId: eventMembers.transactionId, priorKind: eventMembers.priorKind })
        .from(eventMembers)
        .where(and(eq(eventMembers.workspaceId, workspaceId), eq(eventMembers.eventId, ev.id)))
        .all();
      for (const m of members) {
        const restoreKind: "expense" | "income" | "transfer" = m.priorKind ?? "transfer";
        tx.update(transactions)
```

to:

```typescript
      const members = tx
        .select({
          transactionId: eventMembers.transactionId,
          priorKind: eventMembers.priorKind,
          role: eventMembers.role,
        })
        .from(eventMembers)
        .where(and(eq(eventMembers.workspaceId, workspaceId), eq(eventMembers.eventId, ev.id)))
        .all();
      for (const m of members) {
        if (m.role !== "bill_payment") continue;
        const restoreKind: "expense" | "income" | "transfer" = m.priorKind ?? "transfer";
        tx.update(transactions)
```

Leave the rest of the loop body (the `.set({...})` with `categoryId: null` etc., the `eventMembers` delete, and the `financialEvents` delete) unchanged. Only grouping bills were ever modified by the matcher; purchases keep their category and kind.

- [ ] **Step 2: Add post-sync rematch imports to the orchestrator**

In `src/server/sync/orchestrator.ts`, change the bank-credentials import block to include `getConnectedCardIssuers`:

```typescript
import {
  type BankCredentialMeta,
  getBankCredentials,
  getConnectedCardIssuers,
  getRequiresManualTwoFactor,
  listBankCredentials,
  updateCredentialField,
} from "@/server/db/queries/bank-credentials";
```

Add a `reclassifyCardPayments` import (new line near the other `@/server/db/queries/*` imports):

```typescript
import { reclassifyCardPayments } from "@/server/db/queries/financial-events";
```

Change the card-ownership import added in Task 4 from:

```typescript
import { classifyScrapedCards } from "@/server/sync/card-ownership";
```

to:

```typescript
import { classifyScrapedCards, hasCardDataChange } from "@/server/sync/card-ownership";
```

- [ ] **Step 3: Run the rematch after matching when card data changed**

In `syncWorkspace`, find:

```typescript
  runMatchingStep(workspaceId, fromDate, settings.treatAtmAsTransfers);
```

and insert immediately after it:

```typescript
  if (hasCardDataChange(results)) {
    reclassifyCardPayments(workspaceId, getConnectedCardIssuers(workspaceId));
  }
```

`runMatchingStep` settles transfer/ATM events first; `reclassifyCardPayments` then rebuilds card events over all time and re-evaluates bills previously counted as spend. Re-proposed transfer events collide on `event_key` and are skipped, so no duplicates form.

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/queries/financial-events.ts src/server/sync/orchestrator.ts
git commit -m "feat: rematch card bills after sync and preserve purchase categories

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Regression test for stuck bill then later purchases

**Files:**
- Modify: `src/server/lib/matching.test.ts` (add a test in the `describe("card statement matching", ...)` block)

This proves that once a per-card bill and its cycle purchases are both present and unclaimed, `proposeEvents` forms the covered statement (the state the post-sync rematch produces by releasing the stuck bill).

- [ ] **Step 1: Write the failing test**

Inside the existing `describe("card statement matching", () => {` block in `src/server/lib/matching.test.ts`, add this test (the `billCand` and `purchase` helpers already exist in that file):

```typescript
  test("a released per-card bill matches its cycle once purchases are present", () => {
    const events = proposeEvents(
      [
        billCand({
          id: 20,
          chargedAmount: -8411.42,
          date: "2026-06-02T00:00:00.000Z",
          description: "כרטיסי אשראי",
        }),
        purchase({
          id: 21,
          accountNumber: "4384",
          chargedAmount: -8000,
          processedDate: "2026-06-02T00:00:00.000Z",
        }),
        purchase({
          id: 22,
          accountNumber: "4384",
          chargedAmount: -411.42,
          processedDate: "2026-06-02T00:00:00.000Z",
        }),
      ],
      SETTINGS,
      { treatAtmAsTransfers: false, connectedCardIssuers: withCal },
    );
    const ev = events.find((e) => e.eventType === "credit_card_statement");
    expect(ev).toBeTruthy();
    expect(ev?.members.find((m) => m.role === "bill_payment")?.transactionId).toBe(20);
    expect(
      ev?.members
        .filter((m) => m.role === "purchase")
        .map((m) => m.transactionId)
        .sort(),
    ).toEqual([21, 22]);
  });
```

- [ ] **Step 2: Run the test**

Run: `bun test src/server/lib/matching.test.ts`
Expected: PASS. (The matcher already supports this; the test locks in the behavior the rematch relies on. If it fails, do not weaken it — investigate the matcher.)

- [ ] **Step 3: Commit**

```bash
git add src/server/lib/matching.test.ts
git commit -m "test: per-card bill matches its cycle when purchases are present

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Cleanup migration for existing duplicate card accounts

**Files:**
- Create: `src/server/db/migrations/028_dedup_shared_card_accounts.sql`

Migrations run via `db.exec` (whole-file, multi-statement) in `src/server/db/migrate.ts`. Verified via the dev server in Task 8.

- [ ] **Step 1: Write the migration**

Create `src/server/db/migrations/028_dedup_shared_card_accounts.sql`:

```sql
-- Collapse duplicate card accounts created when two credentials of the same
-- issuer both expose a shared card. A card's identity is
-- (workspace_id, provider, account_number); the oldest bank_accounts row owns
-- it. Losing rows have their transactions reattributed to the owner credential
-- and are then removed. The dedup hash excludes credential_id, so reattributing
-- transactions cannot create a uniqueness conflict.

CREATE TEMP TABLE _card_dupes AS
SELECT ba.workspace_id AS workspace_id,
       bc.provider AS provider,
       ba.account_number AS account_number,
       ba.credential_id AS credential_id,
       ba.id AS account_id,
       ROW_NUMBER() OVER (
         PARTITION BY ba.workspace_id, bc.provider, ba.account_number
         ORDER BY ba.created_at ASC, ba.id ASC
       ) AS rn
FROM bank_accounts ba
JOIN bank_credentials bc ON ba.credential_id = bc.id;

CREATE TEMP TABLE _card_owner AS
SELECT workspace_id, provider, account_number, credential_id AS owner_credential_id
FROM _card_dupes
WHERE rn = 1;

UPDATE transactions
SET credential_id = (
  SELECT co.owner_credential_id
  FROM _card_owner co
  JOIN bank_credentials bc ON bc.provider = co.provider
  WHERE co.workspace_id = transactions.workspace_id
    AND co.account_number = transactions.account_number
    AND bc.id = transactions.credential_id
)
WHERE transactions.id IN (
  SELECT t.id
  FROM transactions t
  JOIN bank_credentials bc ON bc.id = t.credential_id
  JOIN _card_dupes d
    ON d.workspace_id = t.workspace_id
   AND d.provider = bc.provider
   AND d.account_number = t.account_number
   AND d.credential_id = t.credential_id
  WHERE d.rn > 1
);

DELETE FROM bank_accounts
WHERE id IN (SELECT account_id FROM _card_dupes WHERE rn > 1);

DROP TABLE _card_dupes;
DROP TABLE _card_owner;
```

- [ ] **Step 2: Commit**

```bash
git add src/server/db/migrations/028_dedup_shared_card_accounts.sql
git commit -m "feat: migration to collapse duplicate shared-card accounts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Surface the shared/new card summary in the sync UI

**Files:**
- Modify: `src/server/sync/orchestrator.ts` (the success-path `provider-done` send, ~line 365)
- Modify: `src/components/dashboard/sync-button.tsx:89-114` (the `provider-done` handler)

- [ ] **Step 1: Include the card report on the provider-done event**

In `src/server/sync/orchestrator.ts`, the success `provider-done` send currently looks like:

```typescript
      send("provider-done", {
        workspaceId,
        workspaceName,
        provider,
        credentialId: meta.id,
        label: meta.label,
        ok: result.ok,
        added: result.added,
        updated: result.updated,
        errorMessage: result.errorMessage,
      });
```

Change it to include the card report:

```typescript
      send("provider-done", {
        workspaceId,
        workspaceName,
        provider,
        credentialId: meta.id,
        label: meta.label,
        ok: result.ok,
        added: result.added,
        updated: result.updated,
        errorMessage: result.errorMessage,
        sharedCards: result.sharedCards ?? [],
        newCards: result.newCards ?? [],
      });
```

Leave the two failure-path `provider-done` sends (the `No credentials` case and the `catch` block) unchanged; they have no card report.

- [ ] **Step 2: Toast the summary in the UI**

In `src/components/dashboard/sync-button.tsx`, the `provider-done` handler ends with the error toast:

```typescript
        if (!ok && errorMessage) {
          toast.error(`${provider}: ${errorMessage}`, {
            duration: 8000,
            closeButton: true,
          });
        }
```

Immediately after that `if` block, add:

```typescript
        const sharedCards = (event.data.sharedCards as string[]) ?? [];
        if (ok && sharedCards.length > 0) {
          toast.info(t("sharedCardsSkipped", { count: sharedCards.length }), {
            duration: 8000,
            closeButton: true,
          });
        }
```

- [ ] **Step 3: Add the i18n string**

Find the translation namespace used by `sync-button.tsx` (the `t` function in scope). Open the message catalogs under `messages/` (e.g. `messages/en.json` and `messages/he.json`) and add a `sharedCardsSkipped` key to the same namespace that already holds this component's keys (such as `aiCategorizationIssue`). Use:

- English: `"sharedCardsSkipped": "{count, plural, one {# shared card was already connected and skipped} other {# shared cards were already connected and skipped}}"`
- Hebrew: `"sharedCardsSkipped": "{count, plural, one {כרטיס משותף אחד כבר מחובר ולכן דולג} other {# כרטיסים משותפים כבר מחוברים ולכן דולגו}}"`

If unsure which namespace, run `grep -rn "aiCategorizationIssue" messages/` and add the key in the same object.

- [ ] **Step 4: Verify i18n and types**

Run: `bun run i18n:check && bun run typecheck`
Expected: PASS (no missing/orphan keys, no type errors).

- [ ] **Step 5: Commit**

```bash
git add src/server/sync/orchestrator.ts src/components/dashboard/sync-button.tsx messages/
git commit -m "feat: notify when shared cards are skipped during sync

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full CI gate**

Run: `bun run ci`
Expected: PASS (format:check, i18n:check, knip, react:doctor, and `bun test` all green).

If `knip` flags `getCardOwners`, `classifyScrapedCards`, `hasCardDataChange`, or `isCardIssuerProvider` as unused, confirm they are imported by the orchestrator/tests as described; an exported-but-unused helper means a wiring step was missed.

- [ ] **Step 2: Verify against a seeded mock database via the dev server**

Per CLAUDE.md, never use real bank data. Seed a throwaway mock DB and point the app at it with `BUDGETEER_DATA_DIR`.

Verification scenario (reproduces the reported bug):
1. Start the dev server (`bun dev`) against the mock data dir.
2. Confirm the migration ran: the connected-accounts settings list shows each shared card once (no `0.00` phantom duplicates).
3. Simulate two `cal` credentials sharing some cards plus a unique card whose bill (e.g. `4384` = 8,411.42) was previously counted as spend.
4. Sync. Confirm:
   - the shared-card "skipped" toast appears,
   - the previously-unmatched bill now shows as matched (no "ללא התאמה"),
   - the account list still shows each card once,
   - card purchases retained their categories (no mass re-categorization).

- [ ] **Step 3: Update the README/screenshots if the UI changed**

Per CLAUDE.md PR rules: if the connected-accounts screen or sync UI changed visibly, regenerate the affected `public/screenshots/*.png` from the mock database and update README copy in this branch. The new sync toast is transient and likely needs no screenshot; the de-duplicated accounts list may. Use judgement and only commit screenshots generated from synthetic data.

- [ ] **Step 4: Commit any verification-driven fixes**

If verification surfaced issues, fix them, re-run `bun run ci`, and commit with a `fix:` message and the standard co-author footer.

---

## Self-Review Notes

- **Spec coverage:** ownership at ingest (Tasks 2-4), cleanup migration (Task 7), post-sync rematch (Task 5), purchase-category preservation (Task 5), notify summary (Task 8). All spec sections map to a task.
- **Type consistency:** `classifyScrapedCards` returns `CardClassification` with `ownerByAccount` / `shared` / `newlyAdded` / `existingOwn`; `ProviderResult` exposes `sharedCards` / `newCards` (from `classification.shared` / `classification.newlyAdded`); `insertTransactions`' `ownerByAccount` is the same `Map<string, number>` `classification.ownerByAccount` returns; `hasCardDataChange` consumes the `results: ProviderResult[]` array (structurally `SyncCountResult`).
- **No placeholders:** every code step shows full code; the only lookup steps (i18n namespace, screenshot regeneration) include the exact grep/command to resolve them.
