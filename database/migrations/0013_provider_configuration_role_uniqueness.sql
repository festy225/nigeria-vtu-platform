BEGIN;

DROP INDEX IF EXISTS provider_configurations_provider_id_service_id_key;

CREATE UNIQUE INDEX provider_configurations_provider_id_service_id_role_key
  ON provider_configurations (
    provider_id,
    service_id,
    is_primary,
    is_backup
  )
  NULLS NOT DISTINCT;

COMMIT;
