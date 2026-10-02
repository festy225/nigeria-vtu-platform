CREATE TABLE marketplace_sellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  seller_type varchar(30) NOT NULL DEFAULT 'RETAILER' CHECK (seller_type IN ('RETAILER','VENDOR','WHOLESALER','DISTRIBUTOR')),
  business_name varchar(200) NOT NULL,
  store_name varchar(200) NOT NULL,
  store_slug varchar(220) NOT NULL UNIQUE,
  onboarding_status varchar(40) NOT NULL DEFAULT 'DRAFT' CHECK (onboarding_status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','MORE_INFORMATION_REQUIRED','APPROVED','SUSPENDED','REJECTED')),
  kyc_status varchar(30) NOT NULL DEFAULT 'PENDING' CHECK (kyc_status IN ('PENDING','IN_REVIEW','VERIFIED','REJECTED')),
  risk_status varchar(30) NOT NULL DEFAULT 'NORMAL' CHECK (risk_status IN ('NORMAL','WATCH','HIGH','RESTRICTED')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX marketplace_sellers_onboarding_idx ON marketplace_sellers(onboarding_status, created_at);
CREATE INDEX marketplace_sellers_kyc_idx ON marketplace_sellers(kyc_status, created_at);
CREATE INDEX marketplace_sellers_risk_idx ON marketplace_sellers(risk_status, updated_at);
