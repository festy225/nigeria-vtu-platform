BEGIN;

ALTER TABLE provider_configurations DROP CONSTRAINT IF EXISTS provider_configurations_provider_id_service_id_key;

CREATE UNIQUE INDEX provider_configurations_provider_id_service_id_key
  ON provider_configurations (provider_id, service_id) NULLS NOT DISTINCT;

COMMIT;
