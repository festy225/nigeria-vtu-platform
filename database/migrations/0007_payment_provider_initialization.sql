ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS provider_name varchar(160),
  ADD COLUMN IF NOT EXISTS provider_status varchar(20),
  ADD COLUMN IF NOT EXISTS provider_checkout_url text,
  ADD COLUMN IF NOT EXISTS provider_metadata jsonb;

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_provider_status_check;

ALTER TABLE payments
  ADD CONSTRAINT payments_provider_status_check
  CHECK (provider_status IS NULL OR provider_status IN ('INITIALIZING','PENDING','SUCCESS','FAILED'));