-- CHIMZO configurable membership prices and platform fee definitions.
-- Prices and rules are deliberately not seeded with invented amounts.

INSERT INTO business_membership_programs
  (program_code, display_name, description, enabled, currency, terms_version)
VALUES
  ('SELLER', 'Seller', 'Seller membership and marketplace access.', false, 'NGN', 'v1'),
  ('WHOLESALER', 'Wholesaler', 'Wholesaler membership.', false, 'NGN', 'v1'),
  ('DISTRIBUTOR', 'Distributor', 'Distributor membership.', false, 'NGN', 'v1')
ON CONFLICT (program_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS platform_fee_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_code varchar(80) NOT NULL UNIQUE,
  display_name varchar(160) NOT NULL,
  description varchar(4000),
  fee_kind varchar(12) NOT NULL CHECK (fee_kind IN ('FIXED', 'PERCENTAGE')),
  amount_minor bigint,
  rate_basis_points integer,
  currency currency_code NOT NULL DEFAULT 'NGN',
  country_code varchar(2),
  service_code varchar(80),
  membership_tier varchar(20),
  enabled boolean NOT NULL DEFAULT false,
  effective_from timestamptz,
  effective_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_fee_rules_code_format
    CHECK (fee_code ~ '^[A-Z0-9_]{2,80}$'),
  CONSTRAINT platform_fee_rules_country_format
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT platform_fee_rules_tier
    CHECK (membership_tier IS NULL OR membership_tier IN
      ('CUSTOMER', 'SELLER', 'WHOLESALER', 'DISTRIBUTOR')),
  CONSTRAINT platform_fee_rules_amount
    CHECK (
      (fee_kind = 'FIXED' AND amount_minor IS NOT NULL
        AND amount_minor >= 0 AND rate_basis_points IS NULL)
      OR
      (fee_kind = 'PERCENTAGE' AND rate_basis_points IS NOT NULL
        AND rate_basis_points BETWEEN 0 AND 10000 AND amount_minor IS NULL)
    ),
  CONSTRAINT platform_fee_rules_effective_dates
    CHECK (effective_until IS NULL OR effective_from IS NULL
      OR effective_until > effective_from)
);

CREATE INDEX IF NOT EXISTS platform_fee_rules_enabled_idx
  ON platform_fee_rules (enabled, country_code, service_code);
