# Account Multi-Select Design

**Date:** 2026-06-15
**Status:** Approved (design)

## Goal

Let the user filter dashboards, transactions, insights, and chat by **any subset** of their accounts/cards, replacing today's "all accounts or exactly one account/group" model. Surface the active filter inside chat, and clarify the recurring-charges amount column as a median.

## Scope

In scope:

1. **Account multi-select** (priority 1) — pick any combination of accounts/cards.
2. **Chat filter visibility** (priority 2) — show and allow changing the filter on the chat page.
3. **Median column label** (priority 4) — recurring-charges amount column header.

Out of scope (separate spec): per-page help panel documenting each pane's logic (priority 3).

## Background: current architecture

The server filter layer is already set-based and needs no change:

- `AccountFilter` in `src/server/db/queries/transactions.ts` accepts `accountKeys: AccountKey[]`
  where `AccountKey = { credentialId: number; accountNumber: string }`.
- Every query (`getPeriodTotal`, `getCategorySpendInRange`, etc.) ANDs in those keys via
  `appendAccountFilter`. An arbitrary-length key list already works.

The "all or one" limitation lives entirely on the client:

- `src/lib/account-store.ts` holds a single `string | null` selection in localStorage.
- `src/lib/api.ts` sends it as the `x-account-sel` header (single token).
- `src/components/chat/chat-client.tsx` sends the same header for chat.
- `src/server/lib/account-context.ts` parses one token via `selectionToKeys`.
- `src/lib/account-group.ts` defines tokens: `a:<id>` (account), `g:<cred>:<key>` (group).
- `src/components/layout/global-account-filter.tsx` is a single-select dropdown.

## Design

### Selection model

The selection becomes a **set of leaf-account tokens** (`a:<id>`), serialized as a
comma-joined string everywhere a string is used today (localStorage value and the
`x-account-sel` header).

- **Empty set** = "All accounts" (the default; header is omitted, same as today's `null`).
- A **group** is a UI convenience only. Checking a group toggles all of its member leaf
  account IDs into/out of the set. Groups are NOT stored as `g:` tokens anymore; the UI
  writes only `a:` tokens.
- A group row's checkbox state is **derived** from its members: checked if all members are
  selected, indeterminate if some, unchecked if none.

#### Backward compatibility

The server-side resolver keeps understanding both legacy token kinds so an existing
localStorage value or an in-flight request keeps working:

- `selectionToKeys` already resolves a single `a:` or `g:` token. We add a
  `selectionStringToKeys(accounts, raw)` that splits `raw` on commas, resolves each token
  via the existing `selectionToKeys`, and unions + dedupes the resulting `AccountKey`s
  (dedupe by `credentialId + ":" + accountNumber`).
- A legacy single value (`a:5` or `g:1:abc`) is a valid one-element comma list, so no
  migration step is required.

### Files and responsibilities

**`src/lib/account-group.ts`**
- Add `selectionStringToKeys(accounts: BankAccount[], raw: string): AccountKey[]` —
  split on `,`, resolve each token with existing `selectionToKeys`, union + dedupe.
- Keep `selectionToKeys`, `accountSelectionValue`, `parseAccountSelection` unchanged.

**`src/lib/account-store.ts`**
- Continue storing a single string in localStorage/memory, but treat it as a comma-joined
  token list. Add helpers:
  - `getAccountTokensSync(): string[]` — split current value on `,`, drop empties.
  - `toggleAccountToken(token: string)` — add/remove a single `a:` token, re-serialize.
  - `setAccountTokens(tokens: string[])` — set the whole list (used by group toggles and
    "All accounts" which sets `[]`).
  - Keep `getAccountSelectionSync()` / `useAccountSelection()` returning the raw string so
    `api.ts` and `chat-client.tsx` need no change to their header logic.
- Empty list serializes to `null` (so the header stays omitted = "all").

**`src/server/lib/account-context.ts`**
- `getAccountFilterFromRequest` calls the new `selectionStringToKeys` instead of
  `selectionToKeys`. Returns `undefined` when the union is empty.

**`src/components/layout/global-account-filter.tsx`**
- Convert from single-select to multi-select:
  - Replace the `Check`-on-active pattern with a checkbox affordance per leaf account and
    per group. Selecting an item must **not close the menu** (today `DropdownMenuItem`
    dismisses on click; switch these rows to keep the menu open — e.g. by preventing the
    default dismiss in the click handler).
  - "All accounts" row clears the set (`setAccountTokens([])`).
  - Leaf account row toggles its `a:<id>` token (`toggleAccountToken`).
  - Group row toggles all member tokens at once; its checkbox renders checked /
    indeterminate / unchecked based on member membership.
  - After any change, call `queryClient.invalidateQueries()` (unchanged behavior).
  - Trigger label logic:
    - 0 selected → `t("allAccounts")` with the `Layers` icon.
    - 1 selected → that account's name + its provider badge (today's behavior).
    - N>1 selected → `t("accountsCount", { count })` (new key) with the `Layers` icon.

**`src/components/chat/chat-client.tsx`**
- No header change (still reads `getAccountSelectionSync`).

**`src/components/layout/global-account-filter.tsx` visibility**
- Remove `"/chat"` from `HIDDEN_PREFIXES` so the filter appears in the chat top bar. The
  count-style trigger now shows the active scope inside chat and lets the user change it.

**`src/i18n/messages/en.json` and `he.json`**
- Add `accountFilter.accountsCount`:
  - en: `"{count} accounts"`
  - he: `"{count} חשבונות"`
- Change `recurringColAmount`:
  - en: `"/ mo"` -> `"Median / mo"`
  - he: `"לחודש"` -> `"חציון לחודש"`
- The per-row amount (`recurringPerMonth`) and subtitle (`recurringSubtitle`) are unchanged.

### Data flow

```
User toggles account/group in GlobalAccountFilter
  -> account-store updates comma-joined token string (localStorage + memory)
  -> queryClient.invalidateQueries()
  -> api.ts / chat-client.tsx send x-account-sel: "a:1,a:4,a:7"
  -> account-context.selectionStringToKeys -> union AccountKey[]
  -> existing query layer ANDs the keys -> filtered results
```

## Error handling / edge cases

- Empty/whitespace token after split -> ignored.
- Unknown account id in a token -> `selectionToKeys` returns `[]` for it -> contributes
  nothing to the union (no crash).
- Selecting every account explicitly yields the same result set as "All accounts"; both
  are valid. The trigger still shows "N accounts" in that case (not collapsed to "All").
- `GlobalAccountFilter` still hides when `accounts.length < 2` (unchanged).

## Testing

Pure-logic unit tests (better-sqlite3 cannot load under `bun test`, so DB-touching code is
verified via the dev server, per project memory):

- `src/lib/account-group.test.ts` — add cases for `selectionStringToKeys`:
  - multiple `a:` tokens union to the right keys
  - mixed `a:` + legacy `g:` token unions and dedupes shared keys
  - empty string -> `[]`
  - unknown id token contributes nothing
- `src/lib/account-store.test.ts` (new, jsdom-free pure logic) — `getAccountTokensSync`,
  `toggleAccountToken` (add then remove), `setAccountTokens([])` clears.

Manual verification via `bun dev`:
- Select 2+ accounts; confirm dashboard/transactions/insights totals reflect the union and
  the trigger reads "N accounts".
- Open chat; confirm the filter is visible and changing it re-scopes chat answers.
- Confirm recurring-charges column header reads "חציון לחודש".

## CI

Full gate `bun run ci` must stay green: format, i18n check (new key consumed, no orphans),
knip, react-doctor, audit, `bun test`. Update README screenshots if the filter/chat UI
changes are user-visible (per project PR rules).
