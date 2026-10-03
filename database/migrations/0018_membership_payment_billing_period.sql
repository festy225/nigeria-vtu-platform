CREATE TYPE membership_billing_period AS ENUM ('MONTHLY', 'ANNUAL');

ALTER TABLE payments
  ADD COLUMN membership_billing_period membership_billing_period,
  ADD CONSTRAINT payments_membership_billing_period_check
    CHECK (
      (purpose = 'WALLET_FUNDING' AND membership_billing_period IS NULL)
      OR
      (purpose = 'BUSINESS_MEMBERSHIP' AND membership_billing_period IS NOT NULL)
    );
