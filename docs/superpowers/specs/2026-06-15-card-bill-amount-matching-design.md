# Card-bill amount matching, mapping visibility, and manual mapping

Date: 2026-06-15
Branch: feat/card-payment-issuer-awareness

## Problem

When a credit card is connected, its individual purchases are the real spend, and
the bank-side "bill payment" line that settles it must be excluded (a transfer) to
avoid double counting. When the card is not connected, the bank bill is the only
record of that spend and must be counted (a Credit Card cost).

Today the connected-or-not decision is made by reading the issuer name in the bill
description. That fails for bills the bank labels generically (`כרטיסי אשראי`):

- `לאומי ויזה(כא)` 1,025.58 -> name says Cal -> transfer (correct).
- `כרטיסי אשראי` 119.90 -> no name -> guessed as a cost (WRONG; it is connected
  Cal card 8682, whose purchases already counted -> double count).

So 119.90 and 1,025.58 are both connected cards yet behave differently, purely
because of the bill label. Two more gaps: the user cannot see whether a given bill
was mapped to a connected card, and there is no way to correct a wrong/missing
match by hand.

## Key insight

Cal stamps every purchase with `processed_date` = its billing (charge) date.
Grouping a connected card's purchases by `processed_date` reproduces the bank bills
exactly:

| card | processed_date | sum | bank bill |
|------|----------------|-----|-----------|
| 2315 | 2026-06-14 (=15/06 IL) | 1,025.58 | `לאומי ויזה(כא)` 15/06 |
| 8682 | 2026-06-09 (=10/06 IL) | 119.90 | `כרטיסי אשראי` 10/06 |
| 8682 | 2026-05-09 | 218.78 | `כרטיסי אשראי` 09/05 |

Matching is therefore exact and deterministic (amount + date), not fuzzy.

## Design

### 1. Matching engine (amount + billing-date)

- The card-payment name patterns remain only as the **gate**: "is this row a card
  bill at all?" They no longer decide connected-vs-not.
- Build, per connected card, the set of billing groups: group that card's purchases
  by the Israel day of `processed_date` -> `{ credentialId, accountNumber,
  billingDay, sum, purchaseTransactionIds[] }`.
- For each bank card-bill candidate (a card-payment-gated transaction), look for a
  connected card's billing group where `abs(sum) == abs(billAmount)` and
  `billingDay` is within +/-2 days of the bill's Israel day (boundary tolerance).
  - **Match** -> the bill is covered: flip it to `transfer`, and link it to the
    matched card's purchases (see data model).
  - **No match** -> the bill is a cost: keep/flip to `expense`, category
    `Credit Card`, flagged `needs_review`.
- Ambiguity guard: if more than one connected card's group matches the same
  (amount, day), do not auto-pick; treat as no-match (cost + review) so the user
  maps it by hand.

This subsumes the issuer-connected check: `לאומי ויזה(כא)` matches card 2315's
group; `כרטיסי אשראי` 119.90 matches card 8682's group; `מקס`/`מאסטרקרד`/large
generic bills match no connected group and stay costs.

### 2. Data model

Reuse the existing, purpose-built event type rather than adding columns:

- **Covered bill** -> a `credit_card_statement` event (already in the schema:
  "one bank bill <-> N card purchases, N:1"):
  - `bill_payment` member = the bank bill, `flipKindTo = "transfer"`.
  - `purchase` members = the matched card's billing-group purchases, kept as
    `expense` (they remain the spend).
- **Uncovered bill** -> a single-leg `credit_card_payment` event with the bill
  flipped to `expense` and categorized `Credit Card`, `needsReview = true`
  (unchanged from current behavior).

The matched card shown in the badge is derived from the `purchase` members'
`account_number`; no new column is required. Matched/unmatched is derived from the
bill's event type (`credit_card_statement` = matched, `credit_card_payment` with an
expense flip = unmatched).

`event_key` continues to be derived from member dedup hashes, so re-syncs over an
overlapping window re-derive the same event idempotently, and a user `rejected`
event stays a tombstone.

### 3. Visibility (stateful badge)

The existing "card payment" chip on a bill row becomes stateful, shown wherever the
chip appears today (transactions table, review page, flagged-transactions):

- `מותאם · 8682` (mapped, card last-4) -> covered, it is a transfer.
- `ללא התאמה` (no match) -> counted as a Credit Card cost; amber; opens the manual
  mapping action.

The transaction list/review queries must surface, per bill, whether it is a covered
statement and the matched card's last-4 (from the linked `purchase` members). A
pure helper derives the badge state from that data so it can be unit-tested.

### 4. Manual mapping (fallback)

On an unmatched (`ללא התאמה`) bill, a row action lets the user:

- **Map to a connected card** -> create/confirm a `credit_card_statement` event for
  that card's billing group (bill -> transfer), `source = "user"`, `status =
  "confirmed"`.
- **Confirm as external** -> keep it a Credit Card cost, `status = "confirmed"`,
  clear the review flag.

Manual decisions are `source = "user"` / `confirmed`, so re-derivation
(`reclassifyCardPayments`, sync matching) must not override them. No separate
"remember this mapping" rule is added: exact amount+date matching already
re-catches recurring bills (e.g. the monthly 119.90) automatically, so a rule
engine is YAGNI for now.

### 5. Re-derivation and triggers

- `proposeEvents` / the sync matching step gain the connected-card billing groups
  as input and emit `credit_card_statement` events for matches.
- `reclassifyCardPayments` (run on card connect/disconnect) is extended to rebuild
  statement matches too, while preserving `user`/`confirmed` events.
- Existing data is re-derived once via the same reclassify path.

## Out of scope

- A persistent manual-mapping rule engine (covered by exact auto-match).
- Splitting a single generic bill across multiple connected cards automatically
  (manual mapping handles bundled bills).
- Non-Cal issuers that do not expose a usable `processed_date` (they simply fall to
  the cost + manual-mapping path).

## Testing

- Pure matcher unit tests: exact match, +/-2 day tolerance, amount mismatch ->
  cost, multi-card ambiguity -> cost+review, generic-name bill still matches by
  amount.
- Badge-state helper unit tests: matched (with last-4) vs unmatched.
- Manual-mapping query tests: map -> transfer + statement event; external ->
  cost+confirmed; both survive a re-derivation pass.
- Verify on the live ws3 data: 119.90 and 1,025.58 both become covered transfers;
  1,501.69 / 8,411.42 remain flagged costs.
