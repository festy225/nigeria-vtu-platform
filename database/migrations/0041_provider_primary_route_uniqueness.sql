-- Enforce one enabled primary provider configuration per routing scope.
-- NULL service_id represents the global routing scope.
-- Existing duplicates cause this migration to fail without deleting data.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM provider_configurations
    WHERE enabled = true
      AND is_primary = true
    GROUP BY service_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce primary provider uniqueness: duplicate enabled primary configurations exist';
  END IF;
END
$$;

CREATE UNIQUE INDEX provider_primary_route_unique_idx
  ON provider_configurations (service_id) NULLS NOT DISTINCT
  WHERE enabled = true AND is_primary = true;

-- The new NULLS NOT DISTINCT index enforces the same rule and also
-- covers the global NULL service_id scope. Remove the redundant index.
DROP INDEX IF EXISTS provider_primary_route_idx;
