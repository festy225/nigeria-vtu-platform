CREATE TABLE marketplace_product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL
    REFERENCES marketplace_products(id) ON DELETE CASCADE,
  sku varchar(160) NOT NULL CHECK (btrim(sku) <> ''),
  combination_key text NOT NULL CHECK (btrim(combination_key) <> ''),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, product_id),
  UNIQUE (product_id, combination_key)
);

CREATE UNIQUE INDEX marketplace_product_variants_product_sku_uq
  ON marketplace_product_variants(product_id, lower(sku));

CREATE INDEX marketplace_product_variants_product_idx
  ON marketplace_product_variants(product_id, created_at, id);

CREATE TABLE marketplace_product_variant_attribute_values (
  variant_id uuid NOT NULL,
  product_id uuid NOT NULL,
  attribute_id uuid NOT NULL,
  attribute_value_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (variant_id, attribute_id),
  FOREIGN KEY (variant_id, product_id)
    REFERENCES marketplace_product_variants(id, product_id)
    ON DELETE CASCADE,
  FOREIGN KEY (product_id, attribute_id)
    REFERENCES marketplace_product_attribute_assignments(product_id, attribute_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (product_id, attribute_id, attribute_value_id)
    REFERENCES marketplace_product_attribute_assignment_values(
      product_id, attribute_id, attribute_value_id
    )
    ON DELETE RESTRICT
);

CREATE INDEX marketplace_product_variant_attribute_values_product_idx
  ON marketplace_product_variant_attribute_values(product_id, attribute_id);

CREATE INDEX marketplace_product_variant_attribute_values_value_idx
  ON marketplace_product_variant_attribute_values(attribute_value_id);
