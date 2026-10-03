CREATE TYPE marketplace_product_status AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'LIVE',
  'REJECTED',
  'SUSPENDED'
);

CREATE TABLE marketplace_product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES marketplace_product_categories(id) ON DELETE RESTRICT,
  slug varchar(160) NOT NULL UNIQUE CHECK (btrim(slug) <> ''),
  name varchar(160) NOT NULL CHECK (btrim(name) <> ''),
  description text,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX marketplace_product_categories_parent_idx
  ON marketplace_product_categories(parent_id, sort_order, name);

CREATE TABLE marketplace_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL
    REFERENCES marketplace_sellers(id) ON DELETE RESTRICT,
  category_id uuid NOT NULL
    REFERENCES marketplace_product_categories(id) ON DELETE RESTRICT,
  name varchar(200) NOT NULL CHECK (btrim(name) <> ''),
  description text NOT NULL CHECK (btrim(description) <> ''),
  status marketplace_product_status NOT NULL DEFAULT 'DRAFT',
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX marketplace_products_seller_idx
  ON marketplace_products(seller_id, created_at DESC);

CREATE INDEX marketplace_products_category_status_idx
  ON marketplace_products(category_id, status, created_at DESC);
