-- Preserve a stable booking identity across retries and interrupted requests.
-- Provider adapters must pass this key through to provider-side idempotency support.
ALTER TYPE marketplace_fulfillment_status
  ADD VALUE IF NOT EXISTS 'BOOKING_IN_PROGRESS';

ALTER TABLE marketplace_fulfillments
  ADD COLUMN booking_idempotency_key varchar(200),
  ADD COLUMN booking_started_at timestamptz;

CREATE UNIQUE INDEX marketplace_fulfillments_booking_idempotency_key_idx
  ON marketplace_fulfillments(booking_idempotency_key)
  WHERE booking_idempotency_key IS NOT NULL;
