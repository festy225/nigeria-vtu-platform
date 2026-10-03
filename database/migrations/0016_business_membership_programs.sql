CREATE TABLE business_membership_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_code varchar(30) NOT NULL UNIQUE
    CHECK (program_code IN ('SELLER', 'WHOLESALER', 'DISTRIBUTOR')),
  display_name varchar(120) NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT false,
  monthly_price_minor bigint CHECK (monthly_price_minor >= 0),
  annual_price_minor bigint CHECK (annual_price_minor >= 0),
  currency currency_code NOT NULL,
  validity_duration integer,
  validity_unit varchar(10),
  terms_version varchar(120) NOT NULL CHECK (btrim(terms_version) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (validity_duration IS NULL AND validity_unit IS NULL)
    OR (
      validity_duration IS NOT NULL
      AND validity_duration > 0
      AND validity_unit IS NOT NULL
      AND validity_unit IN ('DAY', 'WEEK', 'MONTH', 'YEAR')
    )
  )
);

COMMENT ON COLUMN business_membership_programs.validity_duration IS
  'Null duration and unit indicate that the program has no expiry.';
