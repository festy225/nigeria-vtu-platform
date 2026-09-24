INSERT INTO feature_toggles (key, enabled, metadata)
VALUES
  (
    'NIGERIA_TO_NIGERIA_MARKETPLACE_ENABLED',
    false,
    '{"service":"MARKETPLACE","region":"NIGERIA_TO_NIGERIA"}'
  ),
  (
    'NIGERIA_TO_INTERNATIONAL_MARKETPLACE_ENABLED',
    false,
    '{"service":"MARKETPLACE","region":"NIGERIA_TO_INTERNATIONAL"}'
  ),
  (
    'GLOBAL_MARKETPLACE_ENABLED',
    false,
    '{"service":"MARKETPLACE","region":"GLOBAL"}'
  )
ON CONFLICT (key) DO NOTHING;
