ALTER TABLE marketplace_products
  ADD COLUMN image_url text;

ALTER TABLE marketplace_products
  ADD CONSTRAINT marketplace_products_image_url_http_check
  CHECK (
    image_url IS NULL
    OR image_url ~* '^https?://[^[:space:]]+$'
  );
