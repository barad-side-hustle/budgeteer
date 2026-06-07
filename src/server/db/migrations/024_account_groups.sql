-- Aggregate cards under their real billing account.
--
-- One bank login can expose several cards that all debit from the same billing
-- account (a חשבון). Cal, for example, returns one entry per card, but several
-- cards can belong to a single billing account - which is itself the user's
-- bank account at Hapoalim/etc. The scraper now surfaces that billing account
-- per card; we store it here so the UI can show a card under its account
-- instead of listing every card as its own standalone account.
--
-- group_key is a stable id for the billing account, formatted to match the bank
-- scrapers' own account_number ("{bankCode}-{branch}-{number}", e.g.
-- "12-640-490192") so a credit-card account lines up with the matching bank
-- account. group_name is a human label. Both are nullable: accounts with no
-- known billing account (most providers) keep group_key NULL and are treated as
-- their own group (effective group = account_number).

ALTER TABLE bank_accounts ADD COLUMN group_key TEXT;
ALTER TABLE bank_accounts ADD COLUMN group_name TEXT;
