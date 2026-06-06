-- First-class accounts within a bank connection.
--
-- A single bank_credentials row models a login/connection, but one login can
-- expose several real accounts (e.g. a personal and a joint Bank Hapoalim
-- account). The scraper already returns one entry per real account and every
-- transactions row already carries (credential_id, account_number) - but an
-- account has never existed as its own entity. This table makes accounts
-- first-class metadata so the user can name them, set an ownership type, and
-- see/filter per-account balances and summaries.
--
-- Design: transactions stay keyed by (credential_id, account_number); we do NOT
-- add an account_id FK. bank_accounts is a pure metadata/lookup table. Account
-- filters resolve a bank_accounts.id to its (credential_id, account_number) pair
-- and filter on those columns, exactly like the existing credential filter. The
-- dedup hash (src/server/lib/dedup.ts) is intentionally untouched.
--
-- ON DELETE behavior is intentionally asymmetric with transactions:
-- - bank_accounts.credential_id CASCADE: account metadata is meaningless once
--   the connection is gone, so it is removed with the credential.
-- - transactions.credential_id SET NULL (unchanged): historical rows survive a
--   disconnect. Orphaned (NULL credential) rows get no bank_accounts row and
--   won't appear under an account filter - same blind spot as today's credential
--   filter. Acceptable.

CREATE TABLE bank_accounts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id    INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  credential_id   INTEGER NOT NULL REFERENCES bank_credentials(id) ON DELETE CASCADE,
  account_number  TEXT NOT NULL,
  name            TEXT NOT NULL DEFAULT '' CHECK(length(name) <= 128),
  ownership_type  TEXT NOT NULL DEFAULT 'personal'
                    CHECK(ownership_type IN ('personal', 'joint', 'shared')),
  balance         REAL,
  balance_currency TEXT,
  balance_updated_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, credential_id, account_number)
);

CREATE INDEX idx_bank_accounts_workspace ON bank_accounts(workspace_id);
CREATE INDEX idx_bank_accounts_credential ON bank_accounts(credential_id);

-- Backfill accounts implied by existing transactions. Default name is the
-- account number; the user renames later and balances fill in on next sync.
INSERT INTO bank_accounts (workspace_id, credential_id, account_number, name)
SELECT DISTINCT workspace_id, credential_id, account_number, account_number
FROM transactions
WHERE credential_id IS NOT NULL
ON CONFLICT(workspace_id, credential_id, account_number) DO NOTHING;
