CREATE TABLE marketplace_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE
    REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE marketplace_cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL
    REFERENCES marketplace_carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL
    REFERENCES marketplace_products(id) ON DELETE CASCADE,
  variant_id uuid,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (variant_id, product_id)
    REFERENCES marketplace_product_variants(id, product_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX marketplace_cart_items_simple_product_uq
  ON marketplace_cart_items(cart_id, product_id)
  WHERE variant_id IS NULL;

CREATE UNIQUE INDEX marketplace_cart_items_variant_uq
  ON marketplace_cart_items(cart_id, product_id, variant_id)
  WHERE variant_id IS NOT NULL;

CREATE INDEX marketplace_cart_items_cart_idx
  ON marketplace_cart_items(cart_id, created_at, id);

CREATE FUNCTION enforce_marketplace_cart_item_variant()
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
      'Variant products require a selected variant in marketplace carts'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER marketplace_cart_item_variant_trg
BEFORE INSERT OR UPDATE OF product_id, variant_id
ON marketplace_cart_items
FOR EACH ROW
EXECUTE FUNCTION enforce_marketplace_cart_item_variant();
