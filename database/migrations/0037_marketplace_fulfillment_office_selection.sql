ALTER TABLE marketplace_fulfillments
  ADD COLUMN selected_office_id varchar(160),
  ADD COLUMN selected_office_snapshot jsonb;

ALTER TABLE marketplace_fulfillments
  ADD CONSTRAINT marketplace_fulfillments_selected_office_snapshot_object_chk
  CHECK (
    selected_office_snapshot IS NULL
    OR jsonb_typeof(selected_office_snapshot) = 'object'
  );
