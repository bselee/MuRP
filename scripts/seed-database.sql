-- Seed Data Script for TGF MRP
-- This creates sample data for testing and demonstration
-- Run after migrations are applied

-- Note: Replace USER_ID_HERE with an actual user ID from auth.users after signup

-- Sample Vendors
INSERT INTO vendors (name, contact_emails, contact_phone, address, payment_terms, lead_time_days) VALUES
('Acme Supplies Inc', ARRAY['sales@acmesupplies.com'], '555-0101', '123 Industrial Way, Los Angeles, CA 90001', 'Net 30', 14),
('Global Components Ltd', ARRAY['orders@globalcomponents.com'], '555-0102', '456 Tech Park, San Jose, CA 95110', 'Net 45', 21),
('Premium Packaging Co', ARRAY['info@premiumpack.com'], '555-0103', '789 Commerce Blvd, Dallas, TX 75201', 'Net 30', 7)
ON CONFLICT (name) DO NOTHING;

-- Sample Inventory Items
INSERT INTO inventory_items (sku, name, category, stock, on_order, reorder_point, vendor_id, moq, unit_price, unit_of_measure, location) 
SELECT 
    'RAW-001', 'Stainless Steel Sheet 24x36', 'Raw Materials', 150, 0, 50, v.id, 25, 45.99, 'EA', 'A-01'
FROM vendors v WHERE v.name = 'Acme Supplies Inc'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO inventory_items (sku, name, category, stock, on_order, reorder_point, vendor_id, moq, unit_price, unit_of_measure, location) 
SELECT 
    'RAW-002', 'Aluminum Rod 1/2" x 12ft', 'Raw Materials', 85, 50, 30, v.id, 20, 28.50, 'EA', 'A-02'
FROM vendors v WHERE v.name = 'Acme Supplies Inc'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO inventory_items (sku, name, category, stock, on_order, reorder_point, vendor_id, moq, unit_price, unit_of_measure, location) 
SELECT 
    'COMP-001', 'M6 Bolt 25mm', 'Components', 5000, 0, 1000, v.id, 500, 0.15, 'EA', 'B-10'
FROM vendors v WHERE v.name = 'Global Components Ltd'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO inventory_items (sku, name, category, stock, on_order, reorder_point, vendor_id, moq, unit_price, unit_of_measure, location) 
SELECT 
    'COMP-002', 'M6 Nut', 'Components', 4500, 0, 1000, v.id, 500, 0.08, 'EA', 'B-11'
FROM vendors v WHERE v.name = 'Global Components Ltd'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO inventory_items (sku, name, category, stock, on_order, reorder_point, vendor_id, moq, unit_price, unit_of_measure, location) 
SELECT 
    'PKG-001', 'Corrugated Box 12x12x12', 'Packaging', 200, 0, 50, v.id, 100, 1.25, 'EA', 'C-01'
FROM vendors v WHERE v.name = 'Premium Packaging Co'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO inventory_items (sku, name, category, stock, on_order, reorder_point, vendor_id, moq, unit_price, unit_of_measure, location) 
SELECT 
    'PKG-002', 'Bubble Wrap Roll 12"x100ft', 'Packaging', 45, 0, 20, v.id, 10, 8.99, 'EA', 'C-02'
FROM vendors v WHERE v.name = 'Premium Packaging Co'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO inventory_items (sku, name, category, stock, on_order, reorder_point, vendor_id, moq, unit_price, unit_of_measure, location)
VALUES 
    ('FG-001', 'Premium Widget Assembly', 'Finished Goods', 25, 0, 10, NULL, 1, 149.99, 'EA', 'FG-01'),
    ('FG-002', 'Standard Widget Assembly', 'Finished Goods', 40, 0, 15, NULL, 1, 89.99, 'EA', 'FG-02')
ON CONFLICT (sku) DO NOTHING;

-- Sample BOM for Finished Good
INSERT INTO boms (finished_sku, name, components, artwork, packaging, barcode, production_notes)
VALUES (
    'FG-001',
    'Premium Widget Assembly BOM',
    '[
        {"sku": "RAW-001", "quantity": 1},
        {"sku": "RAW-002", "quantity": 2},
        {"sku": "COMP-001", "quantity": 4},
        {"sku": "COMP-002", "quantity": 4}
    ]'::jsonb,
    '[]'::jsonb,
    '{
        "box": "PKG-001",
        "padding": "PKG-002",
        "labelType": "thermal"
    }'::jsonb,
    '123456789012',
    'Handle with care. Torque bolts to 15 Nm.'
)
ON CONFLICT (finished_sku) DO NOTHING;

INSERT INTO boms (finished_sku, name, components, artwork, packaging, barcode, production_notes)
VALUES (
    'FG-002',
    'Standard Widget Assembly BOM',
    '[
        {"sku": "RAW-002", "quantity": 1},
        {"sku": "COMP-001", "quantity": 2},
        {"sku": "COMP-002", "quantity": 2}
    ]'::jsonb,
    '[]'::jsonb,
    '{
        "box": "PKG-001",
        "labelType": "thermal"
    }'::jsonb,
    '123456789013',
    'Standard assembly process.'
)
ON CONFLICT (finished_sku) DO NOTHING;

-- Sample Artwork Folders
INSERT INTO artwork_folders (name, description) VALUES
('Product Labels', 'Label artwork for finished goods'),
('Packaging Designs', 'Box and packaging artwork'),
('Marketing Materials', 'Promotional and marketing graphics')
ON CONFLICT (name) DO NOTHING;

-- Note: To add users, purchase orders, build orders, and requisitions,
-- you'll need actual user IDs from auth.users table after users sign up.

-- Example of adding a purchase order (replace USER_ID with actual ID):
-- INSERT INTO purchase_orders (po_number, vendor_id, status, items, subtotal, total_amount, expected_delivery_date, created_by)
-- SELECT 
--     'PO-2025-1001',
--     v.id,
--     'Pending',
--     '[{"sku": "RAW-001", "quantity": 50, "price": 45.99}]'::jsonb,
--     2299.50,
--     2299.50,
--     CURRENT_DATE + INTERVAL '14 days',
--     'USER_ID_HERE'::uuid
-- FROM vendors v WHERE v.name = 'Acme Supplies Inc';

-- Success message
DO $$ 
BEGIN 
    RAISE NOTICE '✅ Seed data inserted successfully!';
    RAISE NOTICE '📦 Created: 3 vendors, 8 inventory items, 2 BOMs, 3 artwork folders';
    RAISE NOTICE '⚠️  To add purchase orders and build orders, sign up a user first and replace USER_ID in this script.';
END $$;
