ALTER TABLE wallets ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS wallet_kind varchar(20) NOT NULL DEFAULT 'USER' CHECK (wallet_kind IN ('USER','SYSTEM'));
CREATE INDEX IF NOT EXISTS wallets_user_currency_idx ON wallets(user_id, currency);
CREATE UNIQUE INDEX IF NOT EXISTS wallets_system_currency_idx ON wallets(currency) WHERE wallet_kind = 'SYSTEM';
CREATE TABLE IF NOT EXISTS wallet_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key varchar(160) NOT NULL,
  operation varchar(40) NOT NULL,
  request_hash varchar(128) NOT NULL,
  ledger_transaction_id uuid REFERENCES ledger_transactions(id),
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS wallet_idempotency_lookup_idx ON wallet_idempotency(user_id, idempotency_key);
