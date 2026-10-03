ALTER TABLE marketplace_orders
  ADD CONSTRAINT marketplace_orders_id_customer_uq
  UNIQUE (id, customer_id);

ALTER TABLE payments
  ADD COLUMN marketplace_order_id uuid,
  ADD COLUMN provider_configuration_id uuid,
  ADD CONSTRAINT payments_marketplace_order_fk
    FOREIGN KEY (marketplace_order_id, user_id)
    REFERENCES marketplace_orders(id, customer_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT payments_provider_configuration_fk
    FOREIGN KEY (provider_configuration_id)
    REFERENCES provider_configurations(id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT payments_marketplace_order_purpose_check
    CHECK (
      (
        purpose = 'MARKETPLACE_ORDER'
        AND marketplace_order_id IS NOT NULL
        AND membership_program_id IS NULL
        AND membership_billing_period IS NULL
      )
      OR
      (
        purpose <> 'MARKETPLACE_ORDER'
        AND marketplace_order_id IS NULL
      )
    );

ALTER TABLE payments
  DROP CONSTRAINT payments_purpose_membership_program_check,
  ADD CONSTRAINT payments_purpose_membership_program_check
    CHECK (
      (purpose = 'WALLET_FUNDING' AND membership_program_id IS NULL)
      OR
      (purpose = 'BUSINESS_MEMBERSHIP' AND membership_program_id IS NOT NULL)
      OR
      (purpose = 'MARKETPLACE_ORDER' AND membership_program_id IS NULL)
    ),
  DROP CONSTRAINT payments_membership_billing_period_check,
  ADD CONSTRAINT payments_membership_billing_period_check
    CHECK (
      (purpose = 'WALLET_FUNDING' AND membership_billing_period IS NULL)
      OR
      (
        purpose = 'BUSINESS_MEMBERSHIP'
        AND membership_billing_period IS NOT NULL
      )
      OR
      (
        purpose = 'MARKETPLACE_ORDER'
        AND membership_billing_period IS NULL
      )
    );

CREATE UNIQUE INDEX payments_marketplace_order_uq
  ON payments(marketplace_order_id)
  WHERE marketplace_order_id IS NOT NULL;

CREATE INDEX payments_provider_configuration_idx
  ON payments(provider_configuration_id)
  WHERE provider_configuration_id IS NOT NULL;
