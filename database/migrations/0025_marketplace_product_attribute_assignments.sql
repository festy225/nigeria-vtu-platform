ALTER TABLE marketplace_products
  ADD CONSTRAINT marketplace_products_id_category_uq
  UNIQUE (id, category_id);

CREATE TABLE marketplace_product_attribute_assignments (
  product_id uuid NOT NULL,
  category_id uuid NOT NULL,
  attribute_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, attribute_id),
  FOREIGN KEY (product_id, category_id)
    REFERENCES marketplace_products(id, category_id) ON DELETE CASCADE,
  FOREIGN KEY (attribute_id, category_id)
    REFERENCES marketplace_product_attributes(id, category_id)
    ON DELETE RESTRICT
);

CREATE INDEX marketplace_product_attribute_assignments_attribute_idx
  ON marketplace_product_attribute_assignments(attribute_id, product_id);

CREATE TABLE marketplace_product_attribute_assignment_values (
  product_id uuid NOT NULL,
  attribute_id uuid NOT NULL,
  attribute_value_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, attribute_id, attribute_value_id),
  FOREIGN KEY (product_id, attribute_id)
    REFERENCES marketplace_product_attribute_assignments(product_id, attribute_id)
    ON DELETE CASCADE,
  FOREIGN KEY (attribute_value_id, attribute_id)
    REFERENCES marketplace_product_attribute_values(id, attribute_id)
    ON DELETE RESTRICT
);

CREATE INDEX marketplace_product_attribute_assignment_values_value_idx
  ON marketplace_product_attribute_assignment_values(
    attribute_value_id, product_id
  );
