ALTER TABLE marketplace_sellers
  ADD COLUMN IF NOT EXISTS business_name varchar(200);

ALTER TABLE marketplace_sellers
  ADD COLUMN IF NOT EXISTS risk_status varchar(30) NOT NULL DEFAULT 'NORMAL';

ALTER TABLE marketplace_sellers
  ADD COLUMN IF NOT EXISTS reviewed_by uuid;

ALTER TABLE marketplace_sellers
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE marketplace_sellers
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE marketplace_sellers
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE marketplace_sellers
SET business_name = store_name
WHERE business_name IS NULL;

ALTER TABLE marketplace_sellers
  ALTER COLUMN business_name SET NOT NULL;
