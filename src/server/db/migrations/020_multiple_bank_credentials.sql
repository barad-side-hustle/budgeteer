-- Allow multiple bank connections per provider via a user-visible label.
-- Tie sync runs and transactions to a specific credential row.
--
-- Security (must stay compatible with AES-256-GCM credential storage):
-- - label is a display name only (like "Personal card"). It is stored in
--   plaintext and must never hold passwords, OTP tokens, or API keys.
--   Length is capped in DDL; the app layer rejects empty labels on save.
-- - credentials_encrypted, iv, and auth_tag are copied byte-for-byte from the
--   old table. This migration never decrypts or re-encrypts credential blobs.
-- - workspace_id scoping and ON DELETE CASCADE from workspaces are unchanged.
-- - credential_id uses ON DELETE SET NULL so disconnecting a bank removes the
--   encrypted row (and thus the secrets) while historical transactions remain
--   keyed by provider string only. No ciphertext is exposed via this FK.

-- 1. bank_credentials: add label, swap unique constraint
CREATE TABLE bank_credentials_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '' CHECK(length(label) <= 128),
  credentials_encrypted BLOB NOT NULL,
  iv BLOB NOT NULL,
  auth_tag BLOB NOT NULL,
  requires_manual_two_factor INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, provider, label)
);

INSERT INTO bank_credentials_new (
  id, workspace_id, provider, label,
  credentials_encrypted, iv, auth_tag,
  requires_manual_two_factor, created_at, updated_at
)
SELECT
  id, workspace_id, provider,
  CASE provider
    WHEN 'isracard' THEN 'Isracard'
    WHEN 'cal' THEN 'CAL'
    WHEN 'max' THEN 'Max'
    WHEN 'hapoalim' THEN 'Bank Hapoalim'
    WHEN 'leumi' THEN 'Bank Leumi'
    WHEN 'mizrahi' THEN 'Mizrahi Tefahot'
    WHEN 'discount' THEN 'Discount Bank'
    WHEN 'mercantile' THEN 'Mercantile Bank'
    WHEN 'beinleumi' THEN 'First International Bank'
    WHEN 'otsarHahayal' THEN 'Otsar Ha-Hayal'
    WHEN 'pagi' THEN 'Pagi'
    WHEN 'yahav' THEN 'Bank Yahav'
    WHEN 'massad' THEN 'Bank Massad'
    WHEN 'union' THEN 'Union Bank'
    WHEN 'amex' THEN 'American Express'
    WHEN 'beyahadBishvilha' THEN 'BeYahad Bishvilha'
    WHEN 'behatsdaa' THEN 'Behatsdaa'
    WHEN 'oneZero' THEN 'One Zero'
    ELSE provider
  END,
  credentials_encrypted, iv, auth_tag,
  requires_manual_two_factor, created_at, updated_at
FROM bank_credentials;

DROP TABLE bank_credentials;
ALTER TABLE bank_credentials_new RENAME TO bank_credentials;
CREATE INDEX idx_bank_credentials_workspace ON bank_credentials(workspace_id);

-- 2. sync_runs: credential_id (nullable link; secrets live only on bank_credentials)
ALTER TABLE sync_runs ADD COLUMN credential_id INTEGER REFERENCES bank_credentials(id) ON DELETE SET NULL;

UPDATE sync_runs
SET credential_id = (
  SELECT bc.id FROM bank_credentials bc
  WHERE bc.workspace_id = sync_runs.workspace_id
    AND bc.provider = sync_runs.provider
  LIMIT 1
)
WHERE credential_id IS NULL;

CREATE INDEX idx_sync_runs_credential ON sync_runs(credential_id);

-- 3. transactions: credential_id (nullable link; provider column unchanged)
ALTER TABLE transactions ADD COLUMN credential_id INTEGER REFERENCES bank_credentials(id) ON DELETE SET NULL;

UPDATE transactions
SET credential_id = (
  SELECT bc.id FROM bank_credentials bc
  WHERE bc.workspace_id = transactions.workspace_id
    AND bc.provider = transactions.provider
  LIMIT 1
)
WHERE credential_id IS NULL;

CREATE INDEX idx_transactions_credential ON transactions(credential_id);
