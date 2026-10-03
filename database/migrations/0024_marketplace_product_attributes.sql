CREATE TABLE marketplace_product_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL
    REFERENCES marketplace_product_categories(id) ON DELETE RESTRICT,
  code varchar(120) NOT NULL CHECK (btrim(code) <> ''),
  name varchar(160) NOT NULL CHECK (btrim(name) <> ''),
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, category_id)
);

CREATE UNIQUE INDEX marketplace_product_attributes_category_code_uq
  ON marketplace_product_attributes(category_id, lower(code));

CREATE UNIQUE INDEX marketplace_product_attributes_category_name_uq
  ON marketplace_product_attributes(category_id, lower(name));

CREATE INDEX marketplace_product_attributes_category_idx
  ON marketplace_product_attributes(category_id, enabled, sort_order, name);

CREATE TABLE marketplace_product_attribute_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id uuid NOT NULL
    REFERENCES marketplace_product_attributes(id) ON DELETE RESTRICT,
  code varchar(120) NOT NULL CHECK (btrim(code) <> ''),
  value varchar(160) NOT NULL CHECK (btrim(value) <> ''),
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, attribute_id)
);

CREATE UNIQUE INDEX marketplace_product_attribute_values_attribute_code_uq
  ON marketplace_product_attribute_values(attribute_id, lower(code));

CREATE UNIQUE INDEX marketplace_product_attribute_values_attribute_value_uq
  ON marketplace_product_attribute_values(attribute_id, lower(value));

CREATE INDEX marketplace_product_attribute_values_attribute_idx
  ON marketplace_product_attribute_values(
    attribute_id, enabled, sort_order, value
  );
