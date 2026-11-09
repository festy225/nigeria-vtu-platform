ALTER TABLE business_membership_programs
  ADD COLUMN IF NOT EXISTS terms_and_conditions text,
  ADD COLUMN IF NOT EXISTS updated_by_user_id uuid
    REFERENCES users(id) ON DELETE SET NULL;
