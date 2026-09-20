-- Create the platform settlement wallets used by the wallet ledger.
INSERT INTO wallets (user_id, currency, wallet_kind, status)
VALUES
  (NULL, 'NGN', 'SYSTEM', 'ACTIVE'),
  (NULL, 'USD', 'SYSTEM', 'ACTIVE')
ON CONFLICT (currency) WHERE wallet_kind = 'SYSTEM' DO NOTHING;

-- Ensure every system wallet has a balance record.
INSERT INTO wallet_balances (wallet_id, available_minor, held_minor)
SELECT id, 0, 0
FROM wallets
WHERE wallet_kind = 'SYSTEM'
ON CONFLICT (wallet_id) DO NOTHING;
