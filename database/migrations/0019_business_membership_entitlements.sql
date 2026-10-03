CREATE TYPE business_membership_entitlement_status AS ENUM (
  'ACTIVE',
  'EXPIRED',
  'REVOKED'
);

ALTER TABLE payments
  ADD CONSTRAINT payments_entitlement_reference_key
    UNIQUE (id, user_id, membership_program_id);

CREATE TABLE business_membership_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  membership_program_id uuid NOT NULL
    REFERENCES business_membership_programs(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL UNIQUE,
  status business_membership_entitlement_status NOT NULL DEFAULT 'ACTIVE',
  starts_at timestamptz NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_membership_entitlements_payment_fk
    FOREIGN KEY (payment_id, user_id, membership_program_id)
    REFERENCES payments(id, user_id, membership_program_id)
    ON DELETE RESTRICT,
  CONSTRAINT business_membership_entitlements_expiry_check
    CHECK (expires_at IS NULL OR expires_at > starts_at)
);

CREATE INDEX business_membership_entitlements_user_status_idx
  ON business_membership_entitlements(user_id, status, starts_at DESC);
