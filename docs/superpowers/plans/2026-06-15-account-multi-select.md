# Account Multi-Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user filter every surface (dashboard, transactions, insights, chat) by any subset of accounts/cards, show the active filter in chat, and label the recurring-charges amount column as a median.

**Architecture:** The server filter layer already resolves an arbitrary `accountKeys[]`, so this is mostly a client-state change. The single selection token becomes a comma-joined set of `a:<id>` tokens in localStorage and the `x-account-sel` header; the server unions them. The dropdown becomes multi-select (checkboxes, stays open), and the same filter is made visible on `/chat`.

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, shadcn/ui + base-ui, next-intl, bun test.

---

## Spec

See `docs/superpowers/specs/2026-06-15-account-multi-select-design.md`.

## File Structure

- `src/lib/account-group.ts` — add `selectionStringToKeys` (union + dedupe of comma list).
- `src/lib/account-group.test.ts` — tests for `selectionStringToKeys`.
- `src/lib/account-store.ts` — token-list helpers (`getAccountTokensSync`, `toggleAccountToken`, `setAccountTokens`).
- `src/lib/account-store.test.ts` — new pure-logic tests for the helpers.
- `src/server/lib/account-context.ts` — use `selectionStringToKeys`.
- `src/i18n/messages/en.json`, `he.json` — `accountFilter.accountsCount`, change `recurringColAmount`.
- `src/components/layout/global-account-filter.tsx` — multi-select UI + remove `/chat` from hidden prefixes.

---

### Task 1: `selectionStringToKeys` union helper

**Files:**
- Modify: `src/lib/account-group.ts`
- Test: `src/lib/account-group.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to the end of `src/lib/account-group.test.ts`. Also add `selectionStringToKeys` to the existing import from `@/lib/account-group` at the top of the file (the import currently lists `accountSelectionValue, effectiveGroupKey, formatBillingAccountKey, groupAccountsForFilter, groupSelectionValue, parseAccountSelection, selectionToKeys`).

```ts
describe("selectionStringToKeys", () => {
  test("unions multiple account tokens", () => {
    expect(selectionStringToKeys(all, "a:1,a:2")).toEqual([
      { credentialId: 1, accountNumber: "4929" },
      { credentialId: 1, accountNumber: "7408" },
    ]);
  });

  test("dedupes keys shared between an account token and a group token", () => {
    expect(selectionStringToKeys(all, "a:2,g:1:12-640-490192")).toEqual([
      { credentialId: 1, accountNumber: "7408" },
      { credentialId: 1, accountNumber: "5287" },
    ]);
  });

  test("returns empty for an empty string", () => {
    expect(selectionStringToKeys(all, "")).toEqual([]);
  });

  test("ignores unknown and blank tokens", () => {
    expect(selectionStringToKeys(all, "a:999,,a:1")).toEqual([
      { credentialId: 1, accountNumber: "4929" },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/account-group.test.ts`
Expected: FAIL with `selectionStringToKeys is not a function` (or import error).

- [ ] **Step 3: Implement `selectionStringToKeys`**

Append to `src/lib/account-group.ts` (after `selectionToKeys`):

```ts
export function selectionStringToKeys(accounts: BankAccount[], raw: string): AccountKey[] {
  const tokens = raw.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
  const seen = new Set<string>();
  const result: AccountKey[] = [];
  for (const token of tokens) {
    for (const key of selectionToKeys(accounts, token)) {
      const dedupeKey = `${key.credentialId}:${key.accountNumber}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      result.push(key);
    }
  }
  return result;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/account-group.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/account-group.ts src/lib/account-group.test.ts
git commit -m "feat: add selectionStringToKeys union helper for multi-select"
```

---

### Task 2: account-store token-list helpers

**Files:**
- Modify: `src/lib/account-store.ts`
- Test: `src/lib/account-store.test.ts` (create)

The store keeps a single `string | null` in memory/localStorage (so `getAccountSelectionSync` and the header logic in `api.ts`/`chat-client.tsx` stay unchanged), but the string is now a comma-joined list of `a:<id>` tokens. Empty list serializes to `null`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/account-store.test.ts`:

```ts
import { afterEach, describe, expect, test } from "bun:test";
import {
  getAccountSelectionSync,
  getAccountTokensSync,
  setAccountTokens,
  toggleAccountToken,
} from "@/lib/account-store";

afterEach(() => {
  setAccountTokens([]);
});

describe("account-store token helpers", () => {
  test("starts empty", () => {
    expect(getAccountTokensSync()).toEqual([]);
    expect(getAccountSelectionSync()).toBeNull();
  });

  test("toggleAccountToken adds then removes a token", () => {
    toggleAccountToken("a:1");
    expect(getAccountTokensSync()).toEqual(["a:1"]);
    expect(getAccountSelectionSync()).toBe("a:1");

    toggleAccountToken("a:2");
    expect(getAccountTokensSync()).toEqual(["a:1", "a:2"]);
    expect(getAccountSelectionSync()).toBe("a:1,a:2");

    toggleAccountToken("a:1");
    expect(getAccountTokensSync()).toEqual(["a:2"]);
    expect(getAccountSelectionSync()).toBe("a:2");
  });

  test("setAccountTokens replaces the whole list and empty clears to null", () => {
    setAccountTokens(["a:3", "a:4"]);
    expect(getAccountTokensSync()).toEqual(["a:3", "a:4"]);

    setAccountTokens([]);
    expect(getAccountTokensSync()).toEqual([]);
    expect(getAccountSelectionSync()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/account-store.test.ts`
Expected: FAIL with `getAccountTokensSync is not a function` (or import error).

- [ ] **Step 3: Implement the helpers**

In `src/lib/account-store.ts`, add these exported functions (place them after `setAccountSelection`):

```ts
export function getAccountTokensSync(): string[] {
  return memValue == null
    ? []
    : memValue.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
}

export function setAccountTokens(tokens: string[]): void {
  const cleaned = tokens.map((t) => t.trim()).filter((t) => t.length > 0);
  setAccountSelection(cleaned.length === 0 ? null : cleaned.join(","));
}

export function toggleAccountToken(token: string): void {
  const tokens = getAccountTokensSync();
  const next = tokens.includes(token)
    ? tokens.filter((t) => t !== token)
    : [...tokens, token];
  setAccountTokens(next);
}
```

`setAccountSelection`, `getAccountSelectionSync`, and `useAccountSelection` are unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/account-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/account-store.ts src/lib/account-store.test.ts
git commit -m "feat: add multi-token helpers to account-store"
```

---

### Task 3: server resolves the token union

**Files:**
- Modify: `src/server/lib/account-context.ts`

- [ ] **Step 1: Update the resolver**

Replace the body of `getAccountFilterFromRequest` so it uses `selectionStringToKeys`. The file currently imports `selectionToKeys` from `@/lib/account-group`; change that import to `selectionStringToKeys`.

New file contents:

```ts
import "server-only";

import { selectionStringToKeys } from "@/lib/account-group";
import { listBankAccounts } from "@/server/db/queries/bank-accounts";
import type { AccountFilter } from "@/server/db/queries/transactions";

const HEADER = "x-account-sel";

export function getAccountFilterFromRequest(
  req: Request,
  workspaceId: number,
): AccountFilter | undefined {
  const header = req.headers.get(HEADER);
  if (!header) return undefined;
  const accountKeys = selectionStringToKeys(listBankAccounts(workspaceId), header);
  if (accountKeys.length === 0) return undefined;
  return { accountKeys };
}
```

- [ ] **Step 2: Verify typecheck + existing tests still pass**

Run: `bun run format:check && bun test`
Expected: format clean; all tests pass (166+ from earlier plus the new ones). The `selectionToKeys` symbol is still exported and used by tests, so no breakage.

- [ ] **Step 3: Commit**

```bash
git add src/server/lib/account-context.ts
git commit -m "feat: resolve multi-account selection on the server"
```

---

### Task 4: i18n keys

**Files:**
- Modify: `src/i18n/messages/en.json`
- Modify: `src/i18n/messages/he.json`

- [ ] **Step 1: Add `accountsCount` and change `recurringColAmount` (en)**

In `src/i18n/messages/en.json`, the `accountFilter` block is:

```json
  "accountFilter": {
    "allAccounts": "All accounts",
    "ariaLabel": "Filter by account"
```

Change it to:

```json
  "accountFilter": {
    "allAccounts": "All accounts",
    "ariaLabel": "Filter by account",
    "accountsCount": "{count} accounts"
```

(The closing of the block stays as-is; just ensure the comma after `ariaLabel` is added.)

Then change the recurring column header line from:

```json
    "recurringColAmount": "Per month",
```

to:

```json
    "recurringColAmount": "Median / mo",
```

- [ ] **Step 2: Mirror in he.json**

In `src/i18n/messages/he.json`, change the `accountFilter` block:

```json
  "accountFilter": {
    "allAccounts": "כל החשבונות",
    "ariaLabel": "סינון לפי חשבון"
```

to:

```json
  "accountFilter": {
    "allAccounts": "כל החשבונות",
    "ariaLabel": "סינון לפי חשבון",
    "accountsCount": "{count} חשבונות"
```

Then change `recurringColAmount` from `"לחודש"` to:

```json
    "recurringColAmount": "חציון לחודש",
```

- [ ] **Step 3: Verify i18n check passes**

Run: `bun run i18n:check`
Expected: "No missing keys", "No unused keys". Note: `accountsCount` will be reported as unused until Task 5 consumes it. To keep this task green on its own, temporarily skip the unused check by running only the missing/invalid check is not available; instead, complete Task 5 before running the full `i18n:check`. For this task, just verify the JSON is valid:

Run: `bun run format:check`
Expected: clean (Biome validates JSON formatting).

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/en.json src/i18n/messages/he.json
git commit -m "feat: add accountsCount i18n key and median recurring column label"
```

---

### Task 5: multi-select dropdown UI + chat visibility

**Files:**
- Modify: `src/components/layout/global-account-filter.tsx`

This converts the single-select dropdown to multi-select with checkboxes that keep the menu open, updates the trigger label, and makes the filter visible on `/chat`.

- [ ] **Step 1: Update imports and selection state**

At the top of `src/components/layout/global-account-filter.tsx`:

- Change the `lucide-react` import to add `Minus` (for indeterminate group state): `import { Check, ChevronsUpDown, CreditCard, Layers, Minus } from "lucide-react";`
- Change the `@/lib/account-group` import to add nothing new (we still use `accountSelectionValue`, `groupAccountsForFilter`, `parseAccountSelection`; `groupSelectionValue` is no longer needed — remove it from the import).
- Change the `@/lib/account-store` import to:
  `import { getAccountTokensSync, setAccountTokens, toggleAccountToken, useAccountSelection } from "@/lib/account-store";`
  (Remove `setAccountSelection`.)

- [ ] **Step 2: Replace `HIDDEN_PREFIXES` to show the filter in chat**

Change:

```ts
const HIDDEN_PREFIXES = ["/settings", "/setup", "/chat"];
```

to:

```ts
const HIDDEN_PREFIXES = ["/settings", "/setup"];
```

- [ ] **Step 3: Compute selected account-id set and derived label**

Inside the component, after `const selection = useAccountSelection();`, derive the selected leaf-account id set from the raw selection string (the `selection` value re-renders on change):

```ts
  const selectedIds = useMemo(() => {
    const ids = new Set<number>();
    if (!selection) return ids;
    for (const token of selection.split(",")) {
      const parsed = parseAccountSelection(token.trim());
      if (parsed?.kind === "account") ids.add(parsed.id);
    }
    return ids;
  }, [selection]);
```

Replace the existing `activeInfo` memo with a label/count memo:

```ts
  const labelInfo = useMemo(() => {
    if (selectedIds.size === 0) return { kind: "all" as const };
    if (selectedIds.size === 1) {
      const id = [...selectedIds][0];
      const account = accounts.find((candidate) => candidate.id === id);
      return account
        ? { kind: "one" as const, name: account.name, provider: account.provider }
        : { kind: "all" as const };
    }
    return { kind: "many" as const, count: selectedIds.size };
  }, [selectedIds, accounts]);
```

- [ ] **Step 4: Update the trigger render**

Replace the trigger contents. The hidden guard and `activeProvider` logic change to use `labelInfo`:

```tsx
  const hidden = HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (hidden || accounts.length < 2) return null;

  const oneProvider =
    labelInfo.kind === "one" ? BANK_PROVIDERS.find((b) => b.id === labelInfo.provider) : null;

  const triggerLabel =
    labelInfo.kind === "all"
      ? t("allAccounts")
      : labelInfo.kind === "one"
        ? labelInfo.name
        : t("accountsCount", { count: labelInfo.count });
```

Then the `<DropdownMenuTrigger>` inner markup becomes:

```tsx
        {labelInfo.kind === "one" && oneProvider ? (
          <ProviderBadge
            color={oneProvider.color}
            name={labelInfo.name}
            domain={oneProvider.domain}
            size={18}
            radius={5}
          />
        ) : (
          <Layers className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{triggerLabel}</span>
        <ChevronsUpDown className="ms-auto size-3.5 shrink-0 opacity-60" />
```

- [ ] **Step 5: Make item clicks toggle without closing the menu**

base-ui `DropdownMenuItem` dismisses the menu on click. For multi-select we keep it open by calling `event.preventDefault()` in the `onClick` handler (base-ui closes after the handler unless default is prevented). Define helpers above the return:

```ts
  const selectAll = (event: Event | { preventDefault: () => void }) => {
    event.preventDefault();
    setAccountTokens([]);
    queryClient.invalidateQueries();
  };

  const toggleAccount = (event: { preventDefault: () => void }, accountId: number) => {
    event.preventDefault();
    toggleAccountToken(accountSelectionValue(accountId));
    queryClient.invalidateQueries();
  };

  const toggleGroup = (event: { preventDefault: () => void }, group: AccountGroup) => {
    event.preventDefault();
    const memberTokens = group.members.map((m) => accountSelectionValue(m.id));
    const allSelected = group.members.every((m) => selectedIds.has(m.id));
    const current = getAccountTokensSync();
    const next = allSelected
      ? current.filter((tok) => !memberTokens.includes(tok))
      : [...new Set([...current, ...memberTokens])];
    setAccountTokens(next);
    queryClient.invalidateQueries();
  };
```

Note: `DropdownMenuItem`'s `onClick` receives a React mouse event which has `preventDefault`. Pass it through.

- [ ] **Step 6: Replace the menu body with checkbox rows**

Replace the `<DropdownMenuContent>` body. The "All accounts" row shows a check only when nothing is selected. Each leaf row shows a check when selected. Each group row shows `Check` (all), `Minus` (some), or nothing (none).

```tsx
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-[15rem]">
        <DropdownMenuItem onClick={selectAll} className="gap-2">
          <Layers className="size-4 opacity-70" />
          <span className="flex-1 truncate">{t("allAccounts")}</span>
          {selectedIds.size === 0 ? <Check className="size-4 text-primary" /> : null}
        </DropdownMenuItem>
        {groupedByProvider.map(([provider, providerGroups]) => {
          const info = BANK_PROVIDERS.find((b) => b.id === provider);
          const providerName = translateProviderName(provider, info?.name ?? provider, tBanks);
          return (
            <DropdownMenuGroup key={provider}>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{providerName}</DropdownMenuLabel>
              {providerGroups.map((group) => {
                if (!group.grouped) {
                  const account = group.members[0];
                  const checked = selectedIds.has(account.id);
                  return (
                    <DropdownMenuItem
                      key={accountSelectionValue(account.id)}
                      onClick={(e) => toggleAccount(e, account.id)}
                      className="gap-2"
                    >
                      {info ? (
                        <ProviderBadge
                          color={info.color}
                          name={group.name}
                          domain={info.domain}
                          size={18}
                          radius={5}
                        />
                      ) : (
                        <Layers className="size-4 opacity-70" />
                      )}
                      <span className="flex-1 truncate">{group.name}</span>
                      {checked ? <Check className="size-4 text-primary" /> : null}
                    </DropdownMenuItem>
                  );
                }

                const memberCount = group.members.length;
                const selectedCount = group.members.filter((m) => selectedIds.has(m.id)).length;
                const groupIcon =
                  selectedCount === memberCount ? (
                    <Check className="size-4 text-primary" />
                  ) : selectedCount > 0 ? (
                    <Minus className="size-4 text-primary" />
                  ) : null;
                return (
                  <Fragment key={`${group.credentialId}:${group.groupKey}`}>
                    <DropdownMenuItem onClick={(e) => toggleGroup(e, group)} className="gap-2">
                      {info ? (
                        <ProviderBadge
                          color={info.color}
                          name={group.name}
                          domain={info.domain}
                          size={18}
                          radius={5}
                        />
                      ) : (
                        <Layers className="size-4 opacity-70" />
                      )}
                      <span className="flex-1 truncate">{group.name}</span>
                      {groupIcon}
                    </DropdownMenuItem>
                    {group.members.map((account) => {
                      const checked = selectedIds.has(account.id);
                      return (
                        <DropdownMenuItem
                          key={accountSelectionValue(account.id)}
                          onClick={(e) => toggleAccount(e, account.id)}
                          className="gap-2 ps-9"
                        >
                          <CreditCard className="size-3.5 shrink-0 opacity-60" />
                          <span className="flex-1 truncate text-[0.8125rem]">{account.name}</span>
                          {checked ? <Check className="size-4 text-primary" /> : null}
                        </DropdownMenuItem>
                      );
                    })}
                  </Fragment>
                );
              })}
            </DropdownMenuGroup>
          );
        })}
      </DropdownMenuContent>
```

- [ ] **Step 7: Run the full CI gate**

Run: `bun run ci`
Expected: format clean; `i18n:check` reports no missing/unused/undefined keys (now that `accountsCount` is consumed); knip clean (no unused exports — note `groupSelectionValue` is still used by `account-group.test.ts`, so it remains exported and referenced); react-doctor clean; `bun test` all pass.

If knip flags `groupSelectionValue` or `selectionToKeys` as unused exports: they are still referenced by `account-group.test.ts`, so they should not be flagged. If it does flag something, do not delete a still-tested export — re-check the usage.

- [ ] **Step 8: Manual verification via dev server**

Run: `bun dev` (starts on 127.0.0.1:3000)

Verify:
1. The account filter shows checkboxes; selecting 2+ accounts updates totals on dashboard/transactions/insights to the union, and the trigger reads "N accounts" / "N חשבונות".
2. Selecting a grouped account's parent toggles all its cards; partial selection shows the `Minus` (indeterminate) icon.
3. "All accounts" clears the selection.
4. Navigate to `/chat` — the filter is now visible in the top bar and changing it re-scopes chat answers.
5. Insights -> חיובים חוזרים: the amount column header reads "חציון לחודש".

- [ ] **Step 9: Update README screenshots**

Per project PR rules, any user-facing UI change regenerates the affected `public/screenshots/*.png` from synthetic/mock data only (never real bank data), via a throwaway DB pointed at by `BUDGETEER_DATA_DIR`. Regenerate the screenshots that show the account filter and/or chat top bar, and update any README copy that describes single-account filtering to mention multi-select.

- [ ] **Step 10: Commit**

```bash
git add src/components/layout/global-account-filter.tsx public/screenshots README.md
git commit -m "feat: multi-select account filter, visible in chat"
```

---

## Self-Review

**Spec coverage:**
- Multi-select model (set of `a:` tokens, empty = all): Tasks 1, 2, 5. ✓
- Backward-compatible server union resolver: Tasks 1, 3. ✓
- Multi-select UI (checkboxes, stays open, group indeterminate, count label): Task 5. ✓
- Chat visibility (remove `/chat` from hidden prefixes): Task 5 Step 2. ✓
- Median column header (header only): Task 4. ✓
- Tests (account-group + account-store pure logic): Tasks 1, 2. ✓
- CI green + README/screenshots: Task 5 Steps 7, 9. ✓

**Type consistency:** `selectionStringToKeys(accounts, raw)` defined in Task 1, used in Task 3. `getAccountTokensSync`/`setAccountTokens`/`toggleAccountToken` defined in Task 2, used in Task 5. `accountSelectionValue(id)` (existing) used consistently to build `a:<id>` tokens. `selectedIds` is a `Set<number>` throughout Task 5. ✓

**Placeholder scan:** No TBD/TODO; all code steps show full code. Task 4 Step 3 calls out the expected transient "unused key" state and defers the full `i18n:check` to Task 5 (where the key is consumed) — this is a real ordering note, not a placeholder. ✓
