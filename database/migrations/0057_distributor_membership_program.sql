INSERT INTO business_membership_programs (
  program_code,
  display_name,
  description,
  enabled,
  currency,
  terms_version
)
SELECT
  'DISTRIBUTOR',
  'Distributor',
  'Distributor membership.',
  false,
  COALESCE(
    (SELECT currency FROM business_membership_programs
     WHERE program_code = 'SELLER'
     LIMIT 1),
    'NGN'::currency_code
  ),
  'v1'
WHERE NOT EXISTS (
  SELECT 1
  FROM business_membership_programs
  WHERE program_code = 'DISTRIBUTOR'
)
ON CONFLICT (program_code) DO NOTHING;
