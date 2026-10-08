CREATE TABLE marketplace_customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  label varchar(80),
  recipient_name varchar(160) NOT NULL,
  recipient_phone varchar(40) NOT NULL,
  address_line1 varchar(240) NOT NULL,
  address_line2 varchar(240),
  city varchar(120) NOT NULL,
  state_province varchar(120),
  postal_code varchar(40),
  country_code varchar(2) NOT NULL,
  latitude numeric(10,7),
  longitude numeric(10,7),
  is_default boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (char_length(country_code) = 2),
  CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR
    (latitude BETWEEN -90 AND 90
     AND longitude BETWEEN -180 AND 180)
  )
);

CREATE INDEX marketplace_customer_addresses_customer_idx
  ON marketplace_customer_addresses(customer_id, created_at DESC, id);

CREATE UNIQUE INDEX marketplace_customer_addresses_default_idx
  ON marketplace_customer_addresses(customer_id)
  WHERE is_default AND enabled;

CREATE TABLE marketplace_seller_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL
    REFERENCES marketplace_sellers(id) ON DELETE RESTRICT,
  location_name varchar(160) NOT NULL,
  contact_name varchar(160),
  contact_phone varchar(40),
  address_line1 varchar(240) NOT NULL,
  address_line2 varchar(240),
  city varchar(120) NOT NULL,
  state_province varchar(120),
  postal_code varchar(40),
  country_code varchar(2) NOT NULL,
  latitude numeric(10,7),
  longitude numeric(10,7),
  is_default boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (char_length(country_code) = 2),
  CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR
    (latitude BETWEEN -90 AND 90
     AND longitude BETWEEN -180 AND 180)
  )
);

CREATE INDEX marketplace_seller_locations_seller_idx
  ON marketplace_seller_locations(seller_id, created_at DESC, id);

CREATE UNIQUE INDEX marketplace_seller_locations_default_idx
  ON marketplace_seller_locations(seller_id)
  WHERE is_default AND enabled;
