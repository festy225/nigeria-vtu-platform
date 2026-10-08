CREATE TYPE marketplace_fulfillment_status AS ENUM (
  'PENDING',
  'READY_FOR_FULFILLMENT',
  'BOOKED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
  'FAILED'
);

CREATE TABLE marketplace_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  seller_id uuid NOT NULL
    REFERENCES marketplace_sellers(id) ON DELETE RESTRICT,
  status marketplace_fulfillment_status NOT NULL DEFAULT 'PENDING',
  provider_configuration_id uuid
    REFERENCES provider_configurations(id) ON DELETE RESTRICT,
  tracking_reference varchar(160),
  origin_snapshot jsonb NOT NULL
    CHECK (jsonb_typeof(origin_snapshot) = 'object'),
  destination_snapshot jsonb NOT NULL
    CHECK (jsonb_typeof(destination_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (id, order_id),

  FOREIGN KEY (order_id)
    REFERENCES marketplace_orders(id) ON DELETE RESTRICT
);

CREATE INDEX marketplace_fulfillments_order_idx
  ON marketplace_fulfillments(order_id, created_at DESC, id);

CREATE INDEX marketplace_fulfillments_seller_idx
  ON marketplace_fulfillments(seller_id, created_at DESC, id);

CREATE INDEX marketplace_fulfillments_provider_configuration_idx
  ON marketplace_fulfillments(provider_configuration_id)
  WHERE provider_configuration_id IS NOT NULL;

CREATE TABLE marketplace_fulfillment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id uuid NOT NULL,
  order_id uuid NOT NULL,
  order_item_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (order_item_id),

  FOREIGN KEY (fulfillment_id, order_id)
    REFERENCES marketplace_fulfillments(id, order_id)
    ON DELETE RESTRICT,

  FOREIGN KEY (order_item_id, order_id)
    REFERENCES marketplace_order_items(id, order_id)
    ON DELETE RESTRICT
);

CREATE INDEX marketplace_fulfillment_items_fulfillment_idx
  ON marketplace_fulfillment_items(fulfillment_id, id);

CREATE INDEX marketplace_fulfillment_items_order_idx
  ON marketplace_fulfillment_items(order_id, id);
