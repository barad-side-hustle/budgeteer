# Workspace management: delete any workspace (and its data)

Date: 2026-06-16
Branch: `feat/workspace-management`

## Problem

A user can keep multiple workspaces (e.g. Personal, Business) to isolate their
finances. Today the only way to delete a workspace is the `WorkspaceDangerCard`
on Settings -> Data, which acts **only on the currently active workspace** and
only when more than one workspace exists. To delete a workspace you must first
switch into it. There is no single place to manage workspaces as a set.

## What already works (no change needed)

- `deleteWorkspace(id)` in `src/server/db/queries/workspaces.ts` removes the
  workspace row. Every workspace-scoped table declares
  `workspace_id ... ON DELETE CASCADE`, and the DB runs with
  `PRAGMA foreign_keys = ON`, so all data (transactions, categories, budgets,
  bank credentials, merchant memory, chat sessions, sync runs, financial events,
  excluded merchants, bank accounts, workspace settings) is wiped with the
  workspace. Verified end-to-end against a throwaway migrated DB: the delete
  succeeds and `foreign_key_check` is clean.
- `deleteWorkspace` already refuses to delete the only remaining workspace
  ("Cannot delete the only workspace").
- `DELETE /api/workspaces/[id]` already deletes any workspace by id.
- The confirm-dialog copy already states data is permanently removed.

So "delete a workspace including its data" is fully implemented server-side.
The gap is purely UI: you cannot delete a *non-active* workspace from one place.

## Scope

In scope:
- Turn the active-only delete card into a **list of all workspaces** with a
  per-row delete action, so any workspace can be deleted (with its data) from
  one place.

Out of scope (declined during brainstorming):
- "Excluding data" / reassign / export / soft-delete modes. Delete always wipes
  the data.
- Per-workspace data summaries (transaction counts, size, date range).
- Sidebar-switcher delete affordance and other switcher improvements.
- Any backend, API, migration, or schema change.

## Design

Rework `src/components/settings/workspace-controls.tsx` so the
`WorkspaceDangerCard` renders a list of all workspaces instead of just the
active one. Each row shows:

- Workspace name.
- A "Current" badge on the active workspace.
- A destructive Delete button.

Behavior per row:

- Delete opens the existing confirm dialog, parameterized with that row's
  workspace name, then calls `deleteWorkspace(id)` (existing
  `DELETE /api/workspaces/[id]`).
- After a successful delete: invalidate the `workspaces` query and all queries.
  If the deleted workspace was the active one, switch the active workspace to a
  remaining workspace (existing post-delete behavior via `setActiveWorkspaceId`).
- The delete button is **disabled for every row when only one workspace exists**
  (you cannot delete your only workspace), with the existing `lastOneHint`.
- Success and error toasts reuse the existing `deletedToast` / `deleteFailed`
  strings.

`WorkspaceNameCard` (rename, on Settings -> General) is unchanged.

### Data flow

1. Component reads `listWorkspaces()` and the active id from `workspace-store`.
2. User clicks Delete on a row -> confirm dialog -> `deleteWorkspace(id)`.
3. On success -> refetch workspaces, switch active if needed, toast.

### Components / files touched

- `src/components/settings/workspace-controls.tsx` - `WorkspaceDangerCard`
  becomes a list; extract a `WorkspaceRow` with its own confirm dialog and
  delete mutation. `WorkspaceNameCard` untouched.
- `src/i18n/messages/en.json` and `he.json` - add any new strings (e.g. a
  list/section title, a "Current" badge label). Reuse existing confirm/toast
  strings where possible.

No other files change.

## Error handling

- API/network failure -> `deleteFailed` error toast; the list stays as-is.
- Attempt to delete the only workspace -> button disabled in the UI; the server
  also rejects it (409) as a backstop.

## Testing

- Manual via dev server (better-sqlite3 cannot load under `bun test`; logic here
  is UI-only so no pure-logic unit test applies):
  1. Create a second workspace from the switcher.
  2. On Settings -> Data, confirm both workspaces are listed with the active one
     badged "Current".
  3. Delete the **non-active** workspace; confirm it disappears, the active
     workspace and its data are untouched, and a success toast shows.
  4. Delete the **active** workspace; confirm the app switches to the remaining
     workspace and its data is intact.
  5. With one workspace left, confirm all delete buttons are disabled with the
     last-one hint.
- `bun run ci` (format, i18n, knip, react-doctor, tests) must pass.

## README / screenshots

Settings -> Data is a user-facing screen that changes, so per project rules
update the README and regenerate the affected `public/screenshots/*.png` from a
synthetic mock DB (never real data) in the same PR.
