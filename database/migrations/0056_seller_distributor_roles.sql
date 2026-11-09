INSERT INTO roles (code, name, description)
VALUES
  ('SELLER', 'Seller', 'Seller membership role with access to the seller workspace.'),
  ('DISTRIBUTOR', 'Distributor', 'Approved distributor membership role.')
ON CONFLICT (code) DO NOTHING;
