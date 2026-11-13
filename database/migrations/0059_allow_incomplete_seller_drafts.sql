ALTER TABLE marketplace_sellers
  ALTER COLUMN business_name DROP NOT NULL,
  ALTER COLUMN store_name DROP NOT NULL,
  ALTER COLUMN store_slug DROP NOT NULL;
