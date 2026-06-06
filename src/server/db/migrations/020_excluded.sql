ALTER TABLE transactions
  ADD COLUMN is_excluded INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_transactions_workspace_excluded
  ON transactions(workspace_id, is_excluded);

CREATE TABLE excluded_merchants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  merchant_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, provider, merchant_key)
);

CREATE INDEX idx_excluded_merchants_lookup
  ON excluded_merchants(workspace_id, provider, merchant_key);
