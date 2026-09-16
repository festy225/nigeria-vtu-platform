-- Central service and platform feature controls.
-- Disabling a feature affects new requests only; existing transaction rows and workers are not modified.

INSERT INTO feature_toggles (key, enabled, metadata)
VALUES
  ('AIRTIME_ENABLED', false, '{"service":"AIRTIME"}'),
  ('DATA_ENABLED', false, '{"service":"DATA"}'),
  ('ELECTRICITY_ENABLED', false, '{"service":"ELECTRICITY"}'),
  ('TV_ENABLED', false, '{"service":"TV_SUBSCRIPTION"}'),
  ('BETTING_ENABLED', false, '{"service":"BETTING"}'),
  ('AIRTIME_TO_MONEY_ENABLED', false, '{"service":"AIRTIME_TO_MONEY"}'),
  ('VOUCHERS_ENABLED', false, '{"service":"VOUCHER"}'),
  ('DATA_PRINTING_ENABLED', false, '{"service":"DATA_PRINTING"}'),
  ('WALLET_FUNDING_ENABLED', false, '{"capability":"WALLET_FUNDING"}'),
  ('TRANSFERS_ENABLED', false, '{"capability":"TRANSFERS"}'),
  ('ECOMMERCE_ENABLED', false, '{"service":"ECOMMERCE"}'),
  ('AGENT_API_ENABLED', false, '{"capability":"AGENT_API"}'),
  ('VENDOR_API_ENABLED', false, '{"capability":"VENDOR_API"}'),
  ('DOLLAR_WALLET_ENABLED', false, '{"currency":"USD"}'),
  ('NOTIFICATIONS_ENABLED', true, '{"capability":"NOTIFICATIONS"}')
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS feature_toggles_enabled_idx
  ON feature_toggles(enabled, key);
