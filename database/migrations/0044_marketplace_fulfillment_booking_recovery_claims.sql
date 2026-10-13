-- Prevent overlapping recovery attempts for uncertain provider bookings.
ALTER TABLE marketplace_fulfillments
  ADD COLUMN booking_recovery_token uuid,
  ADD COLUMN booking_recovery_claimed_at timestamptz;

CREATE INDEX marketplace_fulfillments_booking_recovery_claimed_at_idx
  ON marketplace_fulfillments (booking_recovery_claimed_at)
  WHERE booking_recovery_token IS NOT NULL;
