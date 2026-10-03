CREATE TYPE payment_purpose AS ENUM ('WALLET_FUNDING', 'BUSINESS_MEMBERSHIP');

ALTER TABLE payments
  ADD COLUMN purpose payment_purpose NOT NULL DEFAULT 'WALLET_FUNDING',
  ADD COLUMN membership_program_id uuid
    REFERENCES business_membership_programs(id) ON DELETE RESTRICT,
  ADD CONSTRAINT payments_purpose_membership_program_check
    CHECK (
      (purpose = 'WALLET_FUNDING' AND membership_program_id IS NULL)
      OR
      (purpose = 'BUSINESS_MEMBERSHIP' AND membership_program_id IS NOT NULL)
    );

CREATE INDEX payments_membership_program_idx
  ON payments(membership_program_id)
  WHERE membership_program_id IS NOT NULL;
