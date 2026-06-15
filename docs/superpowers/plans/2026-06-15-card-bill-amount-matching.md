# Card-bill amount matching (Phase 1: engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decide whether a bank credit-card bill is covered by a connected card by matching the bill's amount and date to that card's billing-cycle total (grouped by `processed_date`), so covered bills become transfers and only genuinely uncovered bills are counted as Credit Card costs.

**Architecture:** Extend the pure matcher in `matching.ts`: build per-card "billing groups" from the connected cards' purchases (group by Israel-day of `processed_date`, sum), then for each bank card-bill find a group with equal amount and near-equal date. A match emits a `credit_card_statement` event (bill leg flipped to `transfer`, the card purchases attached as `purchase` legs that stay `expense`). No match emits the existing single-leg `credit_card_payment` event flipped to `expense` (Credit Card cost), flagged for review when the issuer is ambiguous or connected-but-unmatched. The re-derivation path (`reclassifyCardPayments`) must feed the purchases through so groups can be built.

**Tech Stack:** TypeScript (strict), bun test (`--conditions react-server`), drizzle-orm, better-sqlite3 (Node-only).

**Scope:** This plan is Phase 1 of the approved spec `docs/superpowers/specs/2026-06-15-card-bill-amount-matching-design.md`. Phase 2 (stateful badge UI) and Phase 3 (manual mapping) are separate plans, written after this lands so they reflect the real event shapes.

---

### Task 1: Expose `processedDate` on match candidates

**Files:**
- Modify: `src/server/lib/matching.ts` (the `MatchCandidate` interface, ~line 15-27)
- Modify: `src/server/db/queries/transactions.ts` (`getMatchCandidates`, ~line 371-396)

- [ ] **Step 1: Add the field to the type**

In `src/server/lib/matching.ts`, add `processedDate` to `MatchCandidate`:

```ts
export interface MatchCandidate {
  id: number;
  credentialId: number | null;
  accountNumber: string;
  provider: string;
  date: string;
  processedDate: string;
  chargedAmount: number;
  chargedCurrency: string | null;
  description: string;
  kind: TransactionKind;
  dedupHash: string;
  dedupSequence: number;
}
```

- [ ] **Step 2: Select it in the query**

In `src/server/db/queries/transactions.ts` `getMatchCandidates`, add to the `.select({...})` object (after `date:`):

```ts
      processedDate: transactionsTable.processedDate,
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS (no other call sites construct `MatchCandidate` from the DB).

- [ ] **Step 4: Commit**

```bash
git add src/server/lib/matching.ts src/server/db/queries/transactions.ts
git commit -m "feat: expose processed_date on match candidates"
```

---

### Task 2: Pure billing-group builder

A billing group is one connected card's purchases that share an Israel-day `processed_date`, with their summed amount and member ids. This is the unit that a bank bill is matched against.

**Files:**
- Modify: `src/server/lib/matching.ts` (add exported helpers near the other top-level helpers, ~after line 70)
- Test: `src/server/lib/matching.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/server/lib/matching.test.ts`:

```ts
import { buildCardBillingGroups } from "@/server/lib/matching";

const purchase = (over: Partial<MatchCandidate>): MatchCandidate => ({
  id: 0,
  credentialId: 8,
  accountNumber: "8682",
  provider: "cal",
  date: "2026-05-12T00:00:00.000Z",
  processedDate: "2026-06-09T00:00:00.000Z",
  chargedAmount: -100,
  chargedCurrency: "ILS",
  description: "x",
  kind: "expense",
  dedupHash: "h",
  dedupSequence: 0,
  ...over,
});

describe("buildCardBillingGroups", () => {
  test("groups a connected card's purchases by processed-date into a summed group", () => {
    const groups = buildCardBillingGroups(
      [
        purchase({ id: 1, chargedAmount: -102 }),
        purchase({ id: 2, chargedAmount: -17.9 }),
        purchase({ id: 3, processedDate: "2026-07-09T00:00:00.000Z", chargedAmount: -50 }),
      ],
      new Set<CardIssuer>(["cal"]),
    );
    const june = groups.find((g) => g.billingDay === Math.floor(Date.parse("2026-06-09") / 86_400_000));
    expect(june?.amount).toBeCloseTo(119.9, 2);
    expect(june?.accountNumber).toBe("8682");
    expect(june?.transactionIds.sort()).toEqual([1, 2]);
  });

  test("ignores purchases from issuers that are not connected", () => {
    const groups = buildCardBillingGroups(
      [purchase({ id: 1, provider: "max", chargedAmount: -102 })],
      new Set<CardIssuer>(["cal"]),
    );
    expect(groups).toHaveLength(0);
  });

  test("keeps cards apart even on the same billing day", () => {
    const groups = buildCardBillingGroups(
      [
        purchase({ id: 1, accountNumber: "8682", chargedAmount: -100 }),
        purchase({ id: 2, accountNumber: "2315", chargedAmount: -200 }),
      ],
      new Set<CardIssuer>(["cal"]),
    );
    expect(groups).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --conditions react-server src/server/lib/matching.test.ts`
Expected: FAIL with "buildCardBillingGroups is not a function".

- [ ] **Step 3: Implement the builder**

In `src/server/lib/matching.ts`, add a `CARD_ISSUER_PROVIDERS` check and the builder. Import `CARD_ISSUERS` from transfers (extend the existing import):

```ts
import {
  CARD_ISSUERS,
  type CardIssuer,
  cardIssuerLabel,
  isAtmWithdrawal,
  isBankProvider,
  matchCardPaymentIssuer,
  matchesInternalTransfer,
  type TransactionKind,
} from "@/server/lib/transfers";

export interface CardBillingGroup {
  credentialId: number | null;
  accountNumber: string;
  issuer: CardIssuer;
  billingDay: number;
  amount: number;
  transactionIds: number[];
}

const CARD_ISSUER_SET: ReadonlySet<string> = new Set(CARD_ISSUERS);

export function buildCardBillingGroups(
  candidates: readonly MatchCandidate[],
  connectedCardIssuers: ReadonlySet<CardIssuer>,
): CardBillingGroup[] {
  const byKey = new Map<string, CardBillingGroup>();
  for (const c of candidates) {
    if (!CARD_ISSUER_SET.has(c.provider)) continue;
    const issuer = c.provider as CardIssuer;
    if (!connectedCardIssuers.has(issuer)) continue;
    const billingDay = dayNumber(c.processedDate);
    if (Number.isNaN(billingDay)) continue;
    const key = `${c.accountNumber}:${billingDay}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.amount += Math.abs(c.chargedAmount);
      existing.transactionIds.push(c.id);
    } else {
      byKey.set(key, {
        credentialId: c.credentialId,
        accountNumber: c.accountNumber,
        issuer,
        billingDay,
        amount: Math.abs(c.chargedAmount),
        transactionIds: [c.id],
      });
    }
  }
  return [...byKey.values()];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test --conditions react-server src/server/lib/matching.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/lib/matching.ts src/server/lib/matching.test.ts
git commit -m "feat: build per-card billing groups from processed_date"
```

---

### Task 3: Pure bill-to-group matcher

Given a bill amount/date and the billing groups, return the single matching group or null. Equal amount (within 0.01) and billing day within +/-2 of the bill day. More than one match -> null (ambiguous).

**Files:**
- Modify: `src/server/lib/matching.ts`
- Test: `src/server/lib/matching.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/server/lib/matching.test.ts`:

```ts
import { matchBillToGroup } from "@/server/lib/matching";

const group = (over: Partial<CardBillingGroup>): CardBillingGroup => ({
  credentialId: 8,
  accountNumber: "8682",
  issuer: "cal",
  billingDay: Math.floor(Date.parse("2026-06-09") / 86_400_000),
  amount: 119.9,
  transactionIds: [1, 2],
  ...over,
});

describe("matchBillToGroup", () => {
  const billDay = "2026-06-10T00:00:00.000Z"; // Israel 10/06 vs processed 09/06

  test("matches on equal amount within the +/-2 day window", () => {
    expect(matchBillToGroup(119.9, billDay, [group({})])?.accountNumber).toBe("8682");
  });

  test("no match when amount differs", () => {
    expect(matchBillToGroup(120.5, billDay, [group({})])).toBeNull();
  });

  test("no match when the date is too far", () => {
    expect(matchBillToGroup(119.9, "2026-06-20T00:00:00.000Z", [group({})])).toBeNull();
  });

  test("ambiguous (two groups, same amount and day) returns null", () => {
    expect(
      matchBillToGroup(119.9, billDay, [group({ accountNumber: "8682" }), group({ accountNumber: "2315" })]),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --conditions react-server src/server/lib/matching.test.ts`
Expected: FAIL with "matchBillToGroup is not a function".

- [ ] **Step 3: Implement the matcher**

In `src/server/lib/matching.ts`:

```ts
const BILL_MATCH_DAY_WINDOW = 2;

export function matchBillToGroup(
  billAmount: number,
  billDate: string,
  groups: readonly CardBillingGroup[],
): CardBillingGroup | null {
  const billDay = dayNumber(billDate);
  const target = Math.abs(billAmount);
  const hits = groups.filter(
    (g) =>
      Math.abs(g.amount - target) < 0.01 &&
      Math.abs(g.billingDay - billDay) <= BILL_MATCH_DAY_WINDOW,
  );
  return hits.length === 1 ? hits[0] : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test --conditions react-server src/server/lib/matching.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/lib/matching.ts src/server/lib/matching.test.ts
git commit -m "feat: match a bank bill to a card billing group by amount and date"
```

---

### Task 4: Emit `credit_card_statement` for matched bills, cost+review for the rest

Rewrite the card-payment branch of `proposeEvents` to: build groups once, then for each bill candidate, attempt an amount match. Match -> `credit_card_statement` (bill leg + purchase legs). No match -> single-leg `credit_card_payment` flipped to `expense`, with review when the issuer is ambiguous or a connected issuer (so the user can map it), and no review when the issuer is clearly not connected or no card is connected.

**Files:**
- Modify: `src/server/lib/matching.ts` (the `cc` block, ~line 166-212)
- Test: `src/server/lib/matching.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the existing ambiguous-bill tests (the "counts an ambiguous bill..." / "excludes a Leumi (כא)..." tests added earlier) and add statement tests. Add a helper to attach a purchase to the candidate list:

```ts
describe("card statement matching", () => {
  const billCand = (over: Partial<MatchCandidate>): MatchCandidate =>
    cand({ provider: "leumi", kind: "transfer", ...over });

  test("a generic bill that equals a connected card's cycle becomes a covered statement", () => {
    const events = proposeEvents(
      [
        billCand({ id: 10, chargedAmount: -119.9, date: "2026-06-10T00:00:00.000Z", description: "כרטיסי אשראי" }),
        purchase({ id: 1, chargedAmount: -102, processedDate: "2026-06-09T00:00:00.000Z" }),
        purchase({ id: 2, chargedAmount: -17.9, processedDate: "2026-06-09T00:00:00.000Z" }),
      ],
      SETTINGS,
      { treatAtmAsTransfers: false, connectedCardIssuers: withCal },
    );
    const ev = events.find((e) => e.eventType === "credit_card_statement");
    expect(ev).toBeTruthy();
    const bill = ev?.members.find((m) => m.role === "bill_payment");
    expect(bill?.transactionId).toBe(10);
    expect(bill?.flipKindTo).toBe("transfer");
    expect(ev?.members.filter((m) => m.role === "purchase").map((m) => m.transactionId).sort()).toEqual([1, 2]);
  });

  test("an unmatched generic bill is a Credit Card cost flagged for review", () => {
    const events = proposeEvents(
      [billCand({ id: 11, chargedAmount: -8411.42, date: "2026-06-01T00:00:00.000Z", description: "כרטיסי אשראי" })],
      SETTINGS,
      { treatAtmAsTransfers: false, connectedCardIssuers: withCal },
    );
    const ev = events.find((e) => e.eventType === "credit_card_payment");
    expect(ev?.members[0].flipKindTo).toBe("expense");
    expect(ev?.needsReview).toBe(true);
  });

  test("a named not-connected issuer is a cost without review", () => {
    const events = proposeEvents(
      [billCand({ id: 12, chargedAmount: -1759.7, description: "מקס איט פיננ" })],
      SETTINGS,
      { treatAtmAsTransfers: false, connectedCardIssuers: withCal },
    );
    const ev = events.find((e) => e.eventType === "credit_card_payment");
    expect(ev?.members[0].flipKindTo).toBe("expense");
    expect(ev?.needsReview).toBe(false);
  });
});
```

Also delete the now-obsolete tests "counts an ambiguous bill as spend and flags it for review when a card is connected" and "excludes a Leumi (כא) Visa bill when Cal is connected" (their behavior is replaced: ambiguous-with-cards now still flips to expense+review, and the (כא) bill is covered only when its amount matches a group, which those tests do not set up).

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test --conditions react-server src/server/lib/matching.test.ts`
Expected: FAIL (no `credit_card_statement` events produced yet).

- [ ] **Step 3: Rewrite the card-payment branch**

Replace the whole `const cc = settings.credit_card_payment; if (cc?.enabled) { ... }` block (matching.ts ~166-212) with:

```ts
  const cc = settings.credit_card_payment;
  if (cc?.enabled) {
    const groups = buildCardBillingGroups(candidates, opts.connectedCardIssuers);
    const hasAnyCard = opts.connectedCardIssuers.size > 0;
    for (const cand of candidates) {
      if (used.has(cand.id)) continue;
      if (cand.kind !== "transfer") continue;
      if (!isBankProvider(cand.provider)) continue;
      const match = matchCardPaymentIssuer(cand.description);
      if (!match) continue;

      const covered = matchBillToGroup(cand.chargedAmount, cand.date, groups);
      if (covered) {
        const purchases = covered.transactionIds
          .map((id) => byId.get(id))
          .filter((p): p is MatchCandidate => p != null && !used.has(p.id));
        const members: ProposedMember[] = [
          {
            transactionId: cand.id,
            role: "bill_payment",
            flipKindTo: "transfer",
            priorKind: cand.kind,
            grouping: true,
          },
          ...purchases.map((p) => ({
            transactionId: p.id,
            role: "purchase" as EventRole,
            flipKindTo: null,
            priorKind: p.kind,
            grouping: false,
          })),
        ];
        events.push({
          eventType: "credit_card_statement",
          members,
          canonicalTransactionId: null,
          confidence: 0.95,
          reasons: [
            `Bill ${Math.abs(cand.chargedAmount).toFixed(2)} matches card ${covered.accountNumber} statement`,
          ],
          eventKey: eventKeyFor("credit_card_statement", [cand, ...purchases]),
          needsReview: false,
        });
        used.add(cand.id);
        for (const p of purchases) used.add(p.id);
        continue;
      }

      const issuerConnected = match.issuer !== "ambiguous" && opts.connectedCardIssuers.has(match.issuer);
      const issuerNamedNotConnected = match.issuer !== "ambiguous" && !opts.connectedCardIssuers.has(match.issuer);
      const needsReview = hasAnyCard && !issuerNamedNotConnected;
      const reason = !hasAnyCard
        ? "No credit card connected; bill counted as spend"
        : issuerNamedNotConnected
          ? `${cardIssuerLabel(match.issuer)} not connected; bill counted as spend`
          : issuerConnected
            ? "Connected card, but no matching statement found; counted as spend - confirm"
            : "Card issuer undetermined and unmatched; counted as spend - confirm";

      events.push({
        eventType: "credit_card_payment",
        members: [
          {
            transactionId: cand.id,
            role: "bill_payment",
            flipKindTo: "expense",
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test --conditions react-server src/server/lib/matching.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `bun test --conditions react-server`
Expected: PASS (fix any other matching tests that asserted the old issuer-only behavior, updating them to the amount-match behavior).

- [ ] **Step 6: Commit**

```bash
git add src/server/lib/matching.ts src/server/lib/matching.test.ts
git commit -m "feat: cover card bills via amount-matched statements, count the rest"
```

---

### Task 5: Feed purchases through the re-derivation path

`reclassifyCardPayments` currently filters candidates to `kind === "transfer"` before calling `proposeEvents`, which removes the card purchases the group builder needs. Pass the full candidate set instead, and delete obsolete prior `credit_card_statement` events alongside `credit_card_payment` so they rebuild.

**Files:**
- Modify: `src/server/db/queries/financial-events.ts` (`reclassifyCardPayments`, ~line 280-351)
- Test: `src/server/db/queries/reclassify-card-payments.test.ts`

- [ ] **Step 1: Write/extend the failing test**

In `src/server/db/queries/reclassify-card-payments.test.ts`, follow the file's existing harness (it stubs the orm/queries). Add a case asserting that when a connected card's purchases sum to a generic bill, reclassify passes those purchases into `proposeEvents` (assert the candidate array handed to the stubbed `proposeEvents` includes the purchase ids, not only the transfer). Match the existing mocking style in that file.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --conditions react-server src/server/db/queries/reclassify-card-payments.test.ts`
Expected: FAIL (purchases filtered out).

- [ ] **Step 3: Update reclassify**

In `reclassifyCardPayments`, change the candidate selection from the filtered transfers-only list to the full set, and broaden the event-type deletion. Replace:

```ts
  const candidates = getMatchCandidates(workspaceId, ALL_TIME).filter(
    (c) => c.kind === "transfer" && matchCardPaymentIssuer(c.description) !== null,
  );
```

with:

```ts
  const candidates = getMatchCandidates(workspaceId, ALL_TIME);
```

And in the event-deletion query at the top of the function, change the `eq(financialEvents.eventType, "credit_card_payment")` filter to include statements:

```ts
          inArray(financialEvents.eventType, ["credit_card_payment", "credit_card_statement"]),
```

(add `inArray` to the drizzle import if not already present — it is). The `flippedToExpense` category step below still works because only `credit_card_payment` proposals carry an `expense` flip.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test --conditions react-server src/server/db/queries/reclassify-card-payments.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm `matchCardPaymentIssuer` import is still used**

Run: `bun run knip`
Expected: PASS. If `matchCardPaymentIssuer` is now unused in this file, remove the import.

- [ ] **Step 6: Commit**

```bash
git add src/server/db/queries/financial-events.ts src/server/db/queries/reclassify-card-payments.test.ts
git commit -m "feat: rebuild card statements during reclassification"
```

---

### Task 6: Re-derive ws3 and verify on real data

**Files:**
- Temporary: `reclassify-ws3-oneoff.ts` (project root, deleted after)

- [ ] **Step 1: Back up the dev DB**

Run: `cp data/budgeteer.db "data/budgeteer.db.bak-phase1-$(date +%H%M%S)"`
Expected: a new backup file.

- [ ] **Step 2: Run reclassify for ws3 under Node (better-sqlite3 does not load under Bun)**

Create `reclassify-ws3-oneoff.ts`:

```ts
import { getConnectedCardIssuers } from "@/server/db/queries/bank-credentials";
import { reclassifyCardPayments } from "@/server/db/queries/financial-events";

const ws = 3;
reclassifyCardPayments(ws, getConnectedCardIssuers(ws));
console.log("done");
```

Run: `node --conditions=react-server --import tsx reclassify-ws3-oneoff.ts && rm -f reclassify-ws3-oneoff.ts`
Expected: prints `done`.

- [ ] **Step 3: Verify the matched vs unmatched split**

Run:
```bash
sqlite3 -header -column data/budgeteer.db "SELECT date, description, ABS(charged_amount) amt, kind FROM transactions WHERE workspace_id=3 AND (description LIKE '%כרטיסי אשראי%' OR description LIKE '%ויזה(כא)%') AND date >= '2026-05-31T21:00:00.000Z' ORDER BY date;"
```
Expected: `לאומי ויזה(כא)` 1025.58 -> `transfer`; `כרטיסי אשראי` 119.90 -> `transfer`; `כרטיסי אשראי` 1501.69 and 8411.42 -> `expense`.

- [ ] **Step 4: Verify no double-count**

Run:
```bash
sqlite3 -column data/budgeteer.db "SELECT SUM(ABS(charged_amount)) FROM transactions WHERE workspace_id=3 AND kind='expense' AND status='completed' AND date >= '2026-05-31T21:00:00.000Z' AND date < '2026-06-30T21:00:00.000Z';"
```
Expected: card 8682's purchases (102 + 17.90) are present once and the 119.90 bill is NOT in the sum (it is now a transfer).

- [ ] **Step 5: Commit (no code change; verification only)**

No commit needed. If any discrepancy appears, return to Task 4.

---

## Self-Review

**Spec coverage:**
- Matching engine (amount + billing-date): Tasks 2-4. ✓
- Data model (`credit_card_statement` for covered, `credit_card_payment` for cost; matched card derivable from `purchase` members): Task 4. ✓
- Re-derivation/triggers: Task 5 (reclassify); sync path already passes full candidates via `matching-step.ts`. ✓
- Visibility badge: deferred to Phase 2 plan (noted in scope). 
- Manual mapping: deferred to Phase 3 plan (noted in scope).

**Placeholder scan:** Task 5 Step 1 references "the file's existing harness" rather than inlining test code, because that test file's mocking shape must be read at execution time; the engineer is told exactly what to assert. All other steps contain complete code.

**Type consistency:** `buildCardBillingGroups` returns `CardBillingGroup[]`; `matchBillToGroup` consumes `readonly CardBillingGroup[]` and returns `CardBillingGroup | null`; `ProposedMember.role` uses `EventRole` ("bill_payment"/"purchase"); `eventKeyFor` takes `MatchCandidate[]`. Consistent across tasks.
