ALTER TABLE transactions ADD COLUMN local_date TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_ws_local_date
  ON transactions(workspace_id, local_date);
