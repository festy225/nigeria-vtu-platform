CREATE TYPE marketplace_order_status AS ENUM (
  'DRAFT',
  'PLACED',
  'PROCESSING',
  'FULFILLED',
  'CANCELLED'
);

CREATE SEQUENCE marketplace_order_number_seq;

ALTER TABLE marketplace_products
  ADD CONSTRAINT marketplace_products_id_seller_uq
  UNIQUE (id, seller_id);

CREATE TABLE marketplace_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL
    REFERENCES users(id) ON DELETE RESTRICT,
  order_number bigint NOT NULL
    DEFAULT nextval('marketplace_order_number_seq'),
  status marketplace_order_status NOT NULL DEFAULT 'DRAFT',
  currency currency_code NOT NULL,
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_number),
  UNIQUE (id, currency)
);

CREATE INDEX marketplace_orders_customer_idx
  ON marketplace_orders(customer_id, created_at DESC, id);

CREATE TABLE marketplace_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  variant_id uuid,
  seller_id uuid NOT NULL
    REFERENCES marketplace_sellers(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  line_total_minor bigint NOT NULL CHECK (
    line_total_minor >= 0
    AND line_total_minor = unit_price_minor * quantity::bigint
  ),
  currency currency_code NOT NULL,
  product_name_snapshot varchar(200) NOT NULL,
  product_description_snapshot text NOT NULL,
  seller_name_snapshot varchar(200) NOT NULL,
  sku_snapshot varchar(160),
  variant_description_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(variant_description_snapshot) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (order_id, currency)
    REFERENCES marketplace_orders(id, currency) ON DELETE RESTRICT,
  FOREIGN KEY (product_id, seller_id)
    REFERENCES marketplace_products(id, seller_id) ON DELETE RESTRICT,
  FOREIGN KEY (variant_id, product_id)
    REFERENCES marketplace_product_variants(id, product_id)
    ON DELETE RESTRICT,
  CHECK (
    (variant_id IS NULL AND sku_snapshot IS NULL)
    OR
    (variant_id IS NOT NULL AND sku_snapshot IS NOT NULL)
  )
);

CREATE INDEX marketplace_order_items_order_idx
  ON marketplace_order_items(order_id, id);

CREATE INDEX marketplace_order_items_seller_idx
  ON marketplace_order_items(seller_id, created_at DESC, id);

CREATE FUNCTION enforce_marketplace_order_item_variant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
  FROM marketplace_products
  WHERE id = NEW.product_id
  FOR SHARE;

  IF NEW.variant_id IS NULL
     AND EXISTS (
       SELECT 1
       FROM marketplace_product_variants
       WHERE product_id = NEW.product_id
     ) THEN
    RAISE EXCEPTION
      'Variant products require a selected variant on marketplace order items'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER marketplace_order_item_variant_trg
BEFORE INSERT OR UPDATE OF product_id, variant_id
ON marketplace_order_items
FOR EACH ROW
EXECUTE FUNCTION enforce_marketplace_order_item_variant();
