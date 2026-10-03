ALTER TABLE marketplace_products
  ADD COLUMN price_minor bigint CHECK (price_minor >= 0),
  ADD COLUMN currency currency_code,
  ADD CONSTRAINT marketplace_products_price_currency_pair
    CHECK ((price_minor IS NULL) = (currency IS NULL));
