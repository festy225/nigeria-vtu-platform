BEGIN;

ALTER TABLE api_providers
  ADD COLUMN adapter_key varchar(120);

UPDATE api_providers
SET adapter_key = CASE
  WHEN name IN ('Naivex Test Airtime Provider', 'Naivex Backup Airtime Provider')
    THEN 'MOCK_AIRTIME'
  ELSE NULL
END;


COMMIT;
