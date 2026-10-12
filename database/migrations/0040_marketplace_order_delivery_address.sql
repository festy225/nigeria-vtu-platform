-- Preserve the selected delivery address on marketplace orders.
-- The JSON snapshot remains available if the saved address is later disabled
-- or deleted.

ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS customer_address_id uuid
    REFERENCES marketplace_customer_addresses(id)
    ON DELETE SET NULL;

ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS delivery_address_snapshot jsonb;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'marketplace_orders'::regclass
      AND conname = 'marketplace_orders_delivery_snapshot_object_check'
  ) THEN
    ALTER TABLE marketplace_orders
      ADD CONSTRAINT marketplace_orders_delivery_snapshot_object_check
      CHECK (
        delivery_address_snapshot IS NULL
        OR jsonb_typeof(delivery_address_snapshot) = 'object'
      );
  END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS marketplace_orders_customer_address_idx
  ON marketplace_orders(customer_address_id)
  WHERE customer_address_id IS NOT NULL;
