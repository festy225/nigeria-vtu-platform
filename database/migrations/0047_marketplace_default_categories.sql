INSERT INTO marketplace_product_categories
    (slug, name, description, enabled, sort_order)
VALUES
    ('electronics', 'Electronics', 'Electronic devices and equipment.', true, 10),
    ('fashion', 'Fashion', 'Clothing, footwear, and fashion accessories.', true, 20),
    ('phones-accessories', 'Phones & Accessories', 'Mobile phones and compatible accessories.', true, 30),
    ('home-living', 'Home & Living', 'Furniture, household goods, and home essentials.', true, 40),
    ('beauty-personal-care', 'Beauty & Personal Care', 'Beauty, grooming, and personal care products.', true, 50),
    ('grocery-essentials', 'Grocery & Essentials', 'Groceries and everyday household essentials.', true, 60)
ON CONFLICT (slug) DO NOTHING;
