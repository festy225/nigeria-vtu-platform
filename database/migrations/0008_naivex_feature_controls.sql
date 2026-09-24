-- Future Naivex features remain unavailable until explicitly enabled.
INSERT INTO feature_toggles (key, enabled, metadata)
VALUES
  ('DATA_TO_CASH_ENABLED', false, '{"service":"DATA_TO_CASH"}'),
  ('DATA_AIRTIME_GIFT_ENABLED', false, '{"service":"DATA_AIRTIME_GIFT"}'),
  ('SCHEDULED_RECHARGE_ENABLED', false, '{"service":"SCHEDULED_RECHARGE"}'),
  ('REWARDS_ENABLED', false, '{"service":"REWARDS"}'),
  ('REFERRALS_ENABLED', false, '{"service":"REFERRALS"}'),
  ('BULK_PURCHASE_ENABLED', false, '{"service":"BULK_PURCHASE"}'),
  ('MARKETPLACE_ENABLED', false, '{"service":"MARKETPLACE"}'),
  ('SELLER_STORES_ENABLED', false, '{"service":"SELLER_STORES"}'),
  ('MARKETPLACE_DELIVERY_ENABLED', false, '{"service":"MARKETPLACE_DELIVERY"}'),
  ('USSD_ENABLED', false, '{"service":"USSD"}'),
  ('WHATSAPP_VTU_ENABLED', false, '{"service":"WHATSAPP_VTU"}'),
  ('INTERNATIONAL_MARKETPLACE_ENABLED', false, '{"service":"INTERNATIONAL_MARKETPLACE"}')
ON CONFLICT (key) DO NOTHING;