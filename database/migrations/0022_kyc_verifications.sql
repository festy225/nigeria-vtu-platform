CREATE TYPE kyc_verification_status AS ENUM (
  'PENDING',
  'IN_REVIEW',
  'VERIFIED',
  'REJECTED',
  'MORE_INFORMATION_REQUIRED'
);

ALTER TABLE marketplace_sellers
  ADD CONSTRAINT marketplace_sellers_id_user_id_key UNIQUE (id, user_id);

CREATE TABLE kyc_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status kyc_verification_status NOT NULL DEFAULT 'PENDING',
  provider_configuration_id uuid
    REFERENCES provider_configurations(id) ON DELETE RESTRICT,
  provider_reference varchar(180),
  submitted_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kyc_verifications_seller_user_fk
    FOREIGN KEY (seller_id, user_id)
    REFERENCES marketplace_sellers(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT kyc_verifications_seller_key UNIQUE (seller_id),
  CONSTRAINT kyc_verifications_verified_at_check
    CHECK ((status = 'VERIFIED') = (verified_at IS NOT NULL))
);

CREATE INDEX kyc_verifications_user_status_idx
  ON kyc_verifications(user_id, status, created_at DESC);

INSERT INTO services (code, name, description, enabled)
VALUES (
  'KYC',
  'Identity verification',
  'Configuration slot for identity verification providers',
  false
)
ON CONFLICT (code) DO NOTHING;
