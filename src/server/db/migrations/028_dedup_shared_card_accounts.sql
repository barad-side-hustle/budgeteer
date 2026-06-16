CREATE TEMP TABLE _card_dupes AS
SELECT ba.workspace_id AS workspace_id,
       bc.provider AS provider,
       ba.account_number AS account_number,
       ba.credential_id AS credential_id,
       ba.id AS account_id,
       ROW_NUMBER() OVER (
         PARTITION BY ba.workspace_id, bc.provider, ba.account_number
         ORDER BY ba.created_at ASC, ba.id ASC
       ) AS rn
FROM bank_accounts ba
JOIN bank_credentials bc ON ba.credential_id = bc.id;

CREATE TEMP TABLE _card_owner AS
SELECT workspace_id, provider, account_number, credential_id AS owner_credential_id
FROM _card_dupes
WHERE rn = 1;

UPDATE transactions
SET credential_id = (
  SELECT co.owner_credential_id
  FROM _card_owner co
  JOIN bank_credentials bc ON bc.provider = co.provider
  WHERE co.workspace_id = transactions.workspace_id
    AND co.account_number = transactions.account_number
    AND bc.id = transactions.credential_id
)
WHERE transactions.id IN (
  SELECT t.id
  FROM transactions t
  JOIN bank_credentials bc ON bc.id = t.credential_id
  JOIN _card_dupes d
    ON d.workspace_id = t.workspace_id
   AND d.provider = bc.provider
   AND d.account_number = t.account_number
   AND d.credential_id = t.credential_id
  WHERE d.rn > 1
);

DELETE FROM bank_accounts
WHERE id IN (SELECT account_id FROM _card_dupes WHERE rn > 1);

DROP TABLE _card_dupes;
DROP TABLE _card_owner;
