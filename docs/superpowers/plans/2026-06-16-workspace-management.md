# Workspace Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user delete any workspace (and all its data) from a single list on Settings -> Data, instead of only the currently active one.

**Architecture:** UI-only change. The backend already deletes a workspace and cascades away all its data via `ON DELETE CASCADE` (verified), and `DELETE /api/workspaces/[id]` already works for any id. We rework `WorkspaceDangerCard` from an active-only card into a list of all workspaces, each row with its own confirm dialog and delete mutation. No backend, API, migration, or schema changes.

**Tech Stack:** Next.js 16 App Router (client component), React Query (`@tanstack/react-query`), next-intl, shadcn/ui v4 (base-ui) `Dialog`/`Button`/`Badge`, `sonner` toasts, `workspace-store`.

---

## File Structure

- `src/components/settings/workspace-controls.tsx` — `WorkspaceDangerCard` becomes a list. Extract a `WorkspaceDeleteRow` (one row: name, "Current" badge, delete button + confirm dialog + delete mutation). `WorkspaceNameCard`/`WorkspaceNameCardInner` are untouched.
- `src/i18n/messages/en.json` and `src/i18n/messages/he.json` — add a list section title/description and a "Current" badge label under `settings.workspace`. Reuse existing confirm/toast/hint strings.
- `README.md` + `public/screenshots/*.png` — update the Settings -> Data screenshot/copy if that screen is shown in the README (verify in Task 4).

No other files change.

---

## Task 1: Add i18n strings for the workspace list

**Files:**
- Modify: `src/i18n/messages/en.json` (under `settings.workspace`)
- Modify: `src/i18n/messages/he.json` (under `settings.workspace`)

The current `settings.workspace` block (en) is:

```json
"dangerTitle": "Delete this workspace",
"dangerDescription": "Permanently removes this workspace and every bank connection, transaction, category, and budget inside it. The other workspaces are untouched.",
```

- [ ] **Step 1: Add three keys to `settings.workspace` in `en.json`**

Add these keys inside the existing `settings.workspace` object (next to `dangerTitle`):

```json
"listTitle": "Workspaces",
"listDescription": "Each workspace keeps its own transactions, categories, budgets, and bank connections. Deleting one permanently removes everything inside it. Your other workspaces are untouched.",
"currentBadge": "Current",
```

Keep the existing `dangerTitle`, `dangerDescription`, `deleteButton`, `lastOneHint`, `confirmTitle`, `confirmDescription`, `deletedToast`, `deleteFailed` keys as-is.

- [ ] **Step 2: Add the same three keys to `settings.workspace` in `he.json`**

```json
"listTitle": "סביבות עבודה",
"listDescription": "לכל סביבת עבודה יש עסקאות, קטגוריות, תקציבים וחיבורי בנק משלה. מחיקה מסירה לצמיתות את כל מה שבתוכה. שאר סביבות העבודה לא יושפעו.",
"currentBadge": "נוכחית",
```

- [ ] **Step 3: Verify i18n parity**

Run: `bun run i18n:check`
Expected: PASS (no missing/orphan keys; en and he both have `listTitle`, `listDescription`, `currentBadge`).

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/en.json src/i18n/messages/he.json
git commit -m "feat: i18n strings for workspace management list"
```

---

## Task 2: Rework WorkspaceDangerCard into a list

**Files:**
- Modify: `src/components/settings/workspace-controls.tsx`

Current `WorkspaceDangerCard` + `DangerCard` only operate on the active workspace. Replace them with a card that lists all workspaces and a per-row delete. `WorkspaceNameCard`, `WorkspaceNameCardInner`, and `useActiveWorkspace` stay as they are.

- [ ] **Step 1: Update imports**

At the top of `src/components/settings/workspace-controls.tsx`, ensure these imports exist (add `Badge`; `useActiveWorkspaceId` and `setActiveWorkspaceId` are already imported):

```tsx
import { Badge } from "@/components/ui/badge";
```

The file already imports: `useMutation`, `useQuery`, `useQueryClient`; `Trash2`; `useTranslations`; `useState`; `toast`; `SettingCard`; `Button`; `Dialog*`; `Input`; `Label`; `deleteWorkspace`, `listWorkspaces`, `renameWorkspace`; `Workspace`; `setActiveWorkspaceId`, `useActiveWorkspaceId`. Keep them.

- [ ] **Step 2: Replace `WorkspaceDangerCard` and `DangerCard` with a list + row**

Delete the existing `WorkspaceDangerCard` and `DangerCard` functions and replace them with:

```tsx
export function WorkspaceDangerCard() {
  const t = useTranslations("settings.workspace");
  const tCommon = useTranslations("common");
  const activeId = useActiveWorkspaceId();
  const { data: workspaces = [], isLoading } = useQuery<Workspace[]>({
    queryKey: ["workspaces"],
    queryFn: listWorkspaces,
  });

  const onlyOne = workspaces.length <= 1;

  return (
    <SettingCard title={t("listTitle")} description={t("listDescription")}>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">{tCommon("loading")}</div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {workspaces.map((w) => (
            <WorkspaceDeleteRow
              key={w.id}
              workspace={w}
              isActive={w.id === activeId}
              disabled={onlyOne}
            />
          ))}
        </ul>
      )}
      {onlyOne ? <p className="mt-2 text-xs text-muted-foreground">{t("lastOneHint")}</p> : null}
    </SettingCard>
  );
}

function WorkspaceDeleteRow({
  workspace,
  isActive,
  disabled,
}: {
  workspace: Workspace;
  isActive: boolean;
  disabled: boolean;
}) {
  const t = useTranslations("settings.workspace");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const del = useMutation({
    mutationFn: () => deleteWorkspace(workspace.id),
    onSuccess: async () => {
      const list = await queryClient.fetchQuery<Workspace[]>({
        queryKey: ["workspaces"],
        queryFn: listWorkspaces,
      });
      if (isActive) {
        const next = list.find((w) => w.id !== workspace.id);
        if (next) setActiveWorkspaceId(next.id);
      }
      queryClient.invalidateQueries();
      setOpen(false);
      toast.success(t("deletedToast", { name: workspace.name }));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t("deleteFailed"));
    },
  });

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className="flex-1 truncate text-sm font-medium">{workspace.name}</span>
      {isActive ? <Badge variant="secondary">{t("currentBadge")}</Badge> : null}
      <Button
        variant="ghost"
        size="icon"
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label={t("deleteButton")}
      >
        <Trash2 className="size-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmTitle", { name: workspace.name })}</DialogTitle>
            <DialogDescription>{t("confirmDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => del.mutate()}
              disabled={del.isPending}
            >
              {del.isPending ? tCommon("deleting") : t("deleteButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
```

Note: `setActiveWorkspaceId` is now called directly inside the row (the old
`onDeleted` callback indirection is removed). Confirm `setActiveWorkspaceId`
remains imported and `useActiveWorkspaceId` is used in `WorkspaceDangerCard`.

- [ ] **Step 3: Typecheck and lint**

Run: `bun run format:check && bunx tsc --noEmit`
Expected: PASS. If `Button` has no `size="icon"` / `variant="ghost"` variant, check `src/components/ui/button.tsx` and use the nearest existing variant (e.g. `variant="ghost"` with default size) rather than inventing one.

- [ ] **Step 4: Knip / dead-code check**

Run: `bun run knip`
Expected: PASS. The old `DangerCard` is gone; ensure no now-unused imports remain (knip flags unused imports/exports).

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/workspace-controls.tsx
git commit -m "feat: list all workspaces with per-row delete on settings data"
```

---

## Task 3: Manual verification in the dev server

**Files:** none (verification only). better-sqlite3 cannot load under `bun test`, and this change is UI-only, so verification is manual against the running app.

- [ ] **Step 1: Start the dev server**

Run: `bun dev` (serves on `127.0.0.1:3000`). Use a throwaway/mock data dir if you don't want to touch real data: `BUDGETEER_DATA_DIR=/tmp/budgeteer-ws bun dev`.

- [ ] **Step 2: Create a second workspace**

In the sidebar workspace switcher, click "New workspace" and complete setup so at least two workspaces exist.

- [ ] **Step 3: Open Settings -> Data**

Confirm the "Workspaces" card lists every workspace, and the active one shows the "Current" badge. Confirm each non-disabled row has a trash button.

- [ ] **Step 4: Delete a non-active workspace**

Click its trash icon, confirm in the dialog. Expected: the row disappears, a success toast shows, the active workspace and its transactions are unchanged.

- [ ] **Step 5: Delete the active workspace**

Switch to a workspace, then delete it from the list. Expected: the app switches to a remaining workspace (data intact) and shows a success toast.

- [ ] **Step 6: Single-workspace guard**

With one workspace remaining, confirm every trash button is disabled and the `lastOneHint` text is shown.

- [ ] **Step 7: Stop the dev server.**

---

## Task 4: README + screenshots

**Files:**
- Modify: `README.md` (only if it references the Settings -> Data screen)
- Modify: `public/screenshots/*.png` (only the Settings -> Data screenshot, if one exists)

Project rule: any user-facing screen change updates the README and regenerates affected screenshots from synthetic/mock data only — never the real `data/budgeteer.db`.

- [ ] **Step 1: Check whether the README shows Settings -> Data**

Run: `grep -rn "screenshot\|Settings\|workspace\|Data" README.md` and list `public/screenshots/`.
Expected: determine if a Settings -> Data (or workspace) screenshot/section exists.

- [ ] **Step 2: If a relevant screenshot exists, regenerate it from a mock DB**

Point the app at a throwaway seeded DB (`BUDGETEER_DATA_DIR=/tmp/budgeteer-ws bun dev`) with two synthetic workspaces, capture the Settings -> Data screen, and overwrite only that `public/screenshots/*.png`. Do NOT use real account data.

- [ ] **Step 3: If README copy describes workspace deletion, update it**

Reflect that any workspace can be deleted (with its data) from Settings -> Data.

- [ ] **Step 4: If neither the screenshot nor copy is affected, note that and skip**

If the README does not show this screen, no README change is required; record this in the commit/PR description.

- [ ] **Step 5: Commit (only if files changed)**

```bash
git add README.md public/screenshots
git commit -m "docs: workspace management in README and screenshot"
```

---

## Task 5: Final CI gate

- [ ] **Step 1: Run the full CI gate**

Run: `bun run ci`
Expected: PASS (`format:check`, `i18n:check`, `knip`, `react:doctor`, `bun test` all green).

- [ ] **Step 2: If anything fails, fix and re-run until green.**

---

## Self-Review

- **Spec coverage:** Spec's single in-scope item (list all workspaces with per-row delete that wipes data) -> Task 2. i18n -> Task 1. Manual test plan -> Task 3. README/screenshots rule -> Task 4. CI gate -> Task 5. Out-of-scope items (reassign/export/soft-delete, data summaries, switcher delete, backend/migration changes) are correctly absent.
- **Placeholder scan:** No TBD/TODO; all code shown in full; Task 4 is conditional but each branch is concrete.
- **Type consistency:** `deleteWorkspace`, `listWorkspaces`, `renameWorkspace`, `Workspace`, `setActiveWorkspaceId`, `useActiveWorkspaceId` match existing `src/lib/api.ts` / `src/lib/workspace-store.ts` exports. Component/prop names (`WorkspaceDangerCard`, `WorkspaceDeleteRow`, `isActive`, `disabled`) are consistent across Task 2.
