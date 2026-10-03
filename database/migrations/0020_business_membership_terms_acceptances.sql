CREATE TABLE business_membership_terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  membership_program_id uuid NOT NULL
    REFERENCES business_membership_programs(id) ON DELETE RESTRICT,
  terms_version varchar(120) NOT NULL
    CHECK (btrim(terms_version) <> ''),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_membership_terms_acceptances_user_program_version_key
    UNIQUE (user_id, membership_program_id, terms_version)
);
