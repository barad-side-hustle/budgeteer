ALTER TABLE transactions ADD COLUMN dedup_hash_version INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_transactions_dedup_hash_version
  ON transactions(dedup_hash_version);
