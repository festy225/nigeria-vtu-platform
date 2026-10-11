CREATE TABLE marketplace_fulfillment_tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id uuid NOT NULL
    REFERENCES marketplace_fulfillments(id) ON DELETE RESTRICT,
  provider_event_id varchar(200),
  status varchar(32) NOT NULL
    CHECK (status IN (
      'BOOKED',
      'PICKED_UP',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'FAILED',
      'RETURNED',
      'UNKNOWN'
    )),
  provider_status varchar(120),
  description text,
  location text,
  occurred_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX marketplace_fulfillment_tracking_events_history_idx
  ON marketplace_fulfillment_tracking_events(fulfillment_id, occurred_at DESC, id);

CREATE UNIQUE INDEX marketplace_fulfillment_tracking_events_provider_event_idx
  ON marketplace_fulfillment_tracking_events(fulfillment_id, provider_event_id)
  WHERE provider_event_id IS NOT NULL;
