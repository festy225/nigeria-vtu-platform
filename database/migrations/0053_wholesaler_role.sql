INSERT INTO roles (code, name, description)
VALUES ('WHOLESALER', 'Wholesaler', 'Approved wholesaler membership role.')
ON CONFLICT (code) DO NOTHING;