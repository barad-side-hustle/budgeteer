-- Manual overrides linking a bank bill row to a specific card account.
--
-- The auto-matcher pairs a card's monthly bill (bank side) with that card's
-- purchases (card-issuer side) by amount and billing day. When a refund, fee,
-- or same-day ambiguity throws off the amount, the match fails and the bill
-- double-counts as spend. This table lets the user state the card explicitly.
-- Rebuild re-materializes the statement from this override every run, so the
-- link survives re-syncs and absorbs newly-arrived purchases in the cycle.

CREATE TABLE manual_card_bill_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  bill_transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  account_number TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_card_bill_links_bill
  ON manual_card_bill_links (workspace_id, bill_transaction_id);
