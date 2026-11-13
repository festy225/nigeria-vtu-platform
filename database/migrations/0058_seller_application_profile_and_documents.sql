ALTER TABLE marketplace_sellers
  ADD COLUMN IF NOT EXISTS business_description text,
  ADD COLUMN IF NOT EXISTS business_registration_status varchar(30),
  ADD COLUMN IF NOT EXISTS cac_registration_number varchar(100),
  ADD COLUMN IF NOT EXISTS business_email varchar(254),
  ADD COLUMN IF NOT EXISTS business_phone varchar(40),
  ADD COLUMN IF NOT EXISTS business_address text,
  ADD COLUMN IF NOT EXISTS products_services_description text,
  ADD COLUMN IF NOT EXISTS product_categories text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'marketplace_sellers_registration_status_check'
      AND conrelid = 'marketplace_sellers'::regclass
  ) THEN
    ALTER TABLE marketplace_sellers
      ADD CONSTRAINT marketplace_sellers_registration_status_check
      CHECK (
        business_registration_status IS NULL OR
        business_registration_status IN ('REGISTERED', 'UNREGISTERED', 'IN_PROGRESS')
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS seller_application_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES marketplace_sellers(id) ON DELETE CASCADE,
  document_type varchar(40) NOT NULL CHECK (
    document_type IN (
      'IDENTITY_DOCUMENT',
      'CAC_CERTIFICATE',
      'BUSINESS_PROOF',
      'ADDRESS_PROOF',
      'OTHER'
    )
  ),
  original_filename varchar(255) NOT NULL,
  storage_key varchar(500) NOT NULL UNIQUE,
  mime_type varchar(100) NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  verification_status varchar(20) NOT NULL DEFAULT 'PENDING'
    CHECK (verification_status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
  reviewer_note text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seller_application_documents_seller_idx
  ON seller_application_documents(seller_id, uploaded_at);

CREATE TABLE IF NOT EXISTS seller_application_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES marketplace_sellers(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES users(id),
  decision varchar(40) NOT NULL CHECK (
    decision IN ('START_REVIEW', 'APPROVE', 'REJECT', 'MORE_INFORMATION_REQUIRED')
  ),
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seller_application_reviews_seller_idx
  ON seller_application_reviews(seller_id, created_at DESC);
