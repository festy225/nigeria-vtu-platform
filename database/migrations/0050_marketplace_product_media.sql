CREATE TABLE marketplace_product_media (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL
    REFERENCES marketplace_products(id) ON DELETE CASCADE,
  media_type varchar(10) NOT NULL,
  storage_key text NOT NULL UNIQUE,
  mime_type varchar(100) NOT NULL,
  file_size bigint NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  alt_text varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT marketplace_product_media_type_check
    CHECK (media_type IN ('IMAGE', 'VIDEO')),

  CONSTRAINT marketplace_product_media_size_check
    CHECK (file_size > 0),

  CONSTRAINT marketplace_product_media_order_check
    CHECK (display_order >= 0),

  CONSTRAINT marketplace_product_media_storage_key_check
    CHECK (
      storage_key <> ''
      AND storage_key !~ '(^/|\\.\\.|\\\\)'
    )
);

CREATE INDEX marketplace_product_media_product_order_idx
  ON marketplace_product_media(product_id, display_order, created_at);

CREATE INDEX marketplace_product_media_type_idx
  ON marketplace_product_media(media_type);