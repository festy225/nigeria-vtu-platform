-- A seller may have at most one fulfillment record per marketplace order.
-- Fail safely if historical data violates the intended invariant.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM marketplace_fulfillments
    GROUP BY order_id, seller_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce fulfillment uniqueness: duplicate order_id/seller_id pairs exist';
  END IF;
END
$$;

CREATE UNIQUE INDEX marketplace_fulfillments_order_seller_uidx
  ON marketplace_fulfillments(order_id, seller_id);
