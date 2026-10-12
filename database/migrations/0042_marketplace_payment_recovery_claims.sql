-- Database-backed leases coordinate marketplace payment recovery
-- across multiple API instances.
--
-- Claims are temporary. Expired claims can be reclaimed after a worker
-- crashes or stops responding.

ALTER TABLE payments
  ADD COLUMN recovery_claim_token uuid,
  ADD COLUMN recovery_claim_expires_at timestamptz;

ALTER TABLE payments
  ADD CONSTRAINT payments_recovery_claim_pair_check
  CHECK (
    (recovery_claim_token IS NULL AND recovery_claim_expires_at IS NULL)
    OR
    (recovery_claim_token IS NOT NULL AND recovery_claim_expires_at IS NOT NULL)
  );

CREATE INDEX payments_marketplace_recovery_candidates_idx
  ON payments (created_at)
  WHERE purpose = 'MARKETPLACE_ORDER'
    AND state = 'PENDING'
    AND provider_status = 'INITIALIZING';
