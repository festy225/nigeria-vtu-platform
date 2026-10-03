ALTER TABLE marketplace_product_variants
  ADD COLUMN price_minor bigint NOT NULL CHECK (price_minor >= 0),
  ADD COLUMN currency currency_code NOT NULL;
