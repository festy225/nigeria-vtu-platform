CREATE TABLE finance_currencies (
  code VARCHAR(3) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  minor_unit SMALLINT NOT NULL DEFAULT 2
    CHECK (minor_unit BETWEEN 0 AND 6),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_reporting_currency BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (code ~ '^[A-Z]{3}$')
);

-- Preserve compatibility with the existing NGN/USD payment enum.
INSERT INTO finance_currencies (code, name, minor_unit)
VALUES ('NGN', 'Nigerian Naira', 2),
       ('USD', 'United States Dollar', 2)
ON CONFLICT (code) DO NOTHING;

CREATE UNIQUE INDEX finance_one_reporting_currency
  ON finance_currencies (is_reporting_currency)
  WHERE is_reporting_currency = TRUE;

CREATE TABLE finance_exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency VARCHAR(3) NOT NULL
    REFERENCES finance_currencies(code),
  quote_currency VARCHAR(3) NOT NULL
    REFERENCES finance_currencies(code),
  rate NUMERIC(24, 12) NOT NULL CHECK (rate > 0),
  source VARCHAR(120) NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT,
  CHECK (base_currency <> quote_currency)
);

CREATE INDEX finance_exchange_rates_lookup
  ON finance_exchange_rates
    (base_currency, quote_currency, effective_at DESC, recorded_at DESC);
