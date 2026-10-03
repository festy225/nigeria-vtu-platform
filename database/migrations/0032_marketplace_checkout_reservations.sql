ALTER TYPE marketplace_order_status
  ADD VALUE 'PENDING_PAYMENT';

ALTER TABLE marketplace_carts
  ADD COLUMN pending_order_id uuid UNIQUE
    REFERENCES marketplace_orders(id) ON DELETE RESTRICT;

ALTER TABLE marketplace_order_items
  ADD CONSTRAINT marketplace_order_items_id_order_uq
  UNIQUE (id, order_id);

CREATE TABLE marketplace_order_inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL
    REFERENCES marketplace_orders(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL UNIQUE,
  inventory_id uuid NOT NULL
    REFERENCES marketplace_product_inventory(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  status varchar(16) NOT NULL DEFAULT 'RESERVED'
    CHECK (status IN ('RESERVED', 'RELEASED', 'CONSUMED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE marketplace_order_inventory_reservations
  ADD CONSTRAINT marketplace_order_inventory_reservations_item_order_fk
  FOREIGN KEY (order_item_id, order_id)
  REFERENCES marketplace_order_items(id, order_id) ON DELETE RESTRICT;

CREATE INDEX marketplace_order_inventory_reservations_order_idx
  ON marketplace_order_inventory_reservations(order_id, status);
