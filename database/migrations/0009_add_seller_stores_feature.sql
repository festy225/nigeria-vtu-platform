INSERT INTO feature_toggles (key, enabled, metadata)
VALUES (
  'SELLER_STORES_ENABLED',
  false,
  '{"service":"SELLER_STORES"}'
)
ON CONFLICT (key) DO NOTHING;
