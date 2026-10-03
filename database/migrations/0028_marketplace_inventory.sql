CREATE TABLE marketplace_product_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL
    REFERENCES marketplace_products(id) ON DELETE CASCADE,
  variant_id uuid,
  on_hand_quantity integer NOT NULL DEFAULT 0
    CHECK (on_hand_quantity >= 0),
  reserved_quantity integer NOT NULL DEFAULT 0
    CHECK (
      reserved_quantity >= 0
      AND reserved_quantity <= on_hand_quantity
    ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (variant_id, product_id)
    REFERENCES marketplace_product_variants(id, product_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX marketplace_product_inventory_simple_product_uq
  ON marketplace_product_inventory(product_id)
  WHERE variant_id IS NULL;

CREATE UNIQUE INDEX marketplace_product_inventory_variant_uq
  ON marketplace_product_inventory(variant_id)
  WHERE variant_id IS NOT NULL;

CREATE FUNCTION enforce_marketplace_inventory_target()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
  FROM marketplace_products
  WHERE id = NEW.product_id
  FOR UPDATE;

  IF NEW.variant_id IS NULL
     AND EXISTS (
       SELECT 1
       FROM marketplace_product_variants
       WHERE product_id = NEW.product_id
     ) THEN
    RAISE EXCEPTION
      'Variant products must use variant-level inventory'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER marketplace_product_inventory_target_trg
BEFORE INSERT OR UPDATE OF product_id, variant_id
ON marketplace_product_inventory
FOR EACH ROW
EXECUTE FUNCTION enforce_marketplace_inventory_target();

CREATE FUNCTION prevent_variant_with_simple_product_inventory()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
  FROM marketplace_products
  WHERE id = NEW.product_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM marketplace_product_inventory
    WHERE product_id = NEW.product_id
      AND variant_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Remove product-level inventory before adding product variants'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER marketplace_product_variant_inventory_guard_trg
BEFORE INSERT OR UPDATE OF product_id
ON marketplace_product_variants
FOR EACH ROW
EXECUTE FUNCTION prevent_variant_with_simple_product_inventory();
