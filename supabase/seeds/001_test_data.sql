-- Seed Test Data
-- Insert minimal test records for development and testing
-- Run with: psql -f supabase/seeds/001_test_data.sql

-- Note: Requires that migrations 001-006 have been applied

-- =============================================================================
-- TEST USERS
-- =============================================================================

-- Admin user (password: admin123)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'admin@tgfmrp.com',
  crypt('admin123', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, email, full_name, role, department)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'admin@tgfmrp.com',
  'Admin User',
  'admin',
  'Management'
) ON CONFLICT (id) DO NOTHING;

-- Production Manager (password: production123)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000002'::uuid,
  'production@tgfmrp.com',
  crypt('production123', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, email, full_name, role, department)
VALUES (
  '00000000-0000-0000-0000-000000000002'::uuid,
  'production@tgfmrp.com',
  'Production Manager',
  'production_manager',
  'Production'
) ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- TEST VENDORS
-- =============================================================================

INSERT INTO vendors (id, name, contact_name, contact_email, contact_phone, address, lead_time_days)
VALUES
  (
    '10000000-0000-0000-0000-000000000001'::uuid,
    'Acme Supplies Inc',
    'John Smith',
    'john@acmesupplies.com',
    '+1-555-0101',
    '123 Main St, New York, NY 10001',
    7
  ),
  (
    '10000000-0000-0000-0000-000000000002'::uuid,
    'Global Components Ltd',
    'Jane Doe',
    'jane@globalcomponents.com',
    '+1-555-0202',
    '456 Commerce Ave, Los Angeles, CA 90001',
    14
  )
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- TEST INVENTORY ITEMS
-- =============================================================================

INSERT INTO inventory_items (id, sku, name, category, stock, on_order, reorder_point, vendor_id, unit_price)
VALUES
  (
    '20000000-0000-0000-0000-000000000001'::uuid,
    'SKU-001',
    'Widget A',
    'Components',
    100,
    0,
    20,
    '10000000-0000-0000-0000-000000000001'::uuid,
    5.99
  ),
  (
    '20000000-0000-0000-0000-000000000002'::uuid,
    'SKU-002',
    'Widget B',
    'Components',
    50,
    100,
    30,
    '10000000-0000-0000-0000-000000000002'::uuid,
    12.50
  ),
  (
    '20000000-0000-0000-0000-000000000003'::uuid,
    'SKU-003',
    'Assembly Kit',
    'Assemblies',
    25,
    0,
    10,
    '10000000-0000-0000-0000-000000000001'::uuid,
    45.00
  )
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- TEST BILL OF MATERIALS
-- =============================================================================

INSERT INTO boms (id, product_id, components, version)
VALUES
  (
    '30000000-0000-0000-0000-000000000001'::uuid,
    '20000000-0000-0000-0000-000000000003'::uuid,
    jsonb_build_array(
      jsonb_build_object(
        'item_id', '20000000-0000-0000-0000-000000000001',
        'sku', 'SKU-001',
        'quantity', 2
      ),
      jsonb_build_object(
        'item_id', '20000000-0000-0000-0000-000000000002',
        'sku', 'SKU-002',
        'quantity', 1
      )
    ),
    1
  )
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- TEST PURCHASE ORDERS
-- =============================================================================

INSERT INTO purchase_orders (id, vendor_id, order_number, order_date, status, line_items, total_amount)
VALUES
  (
    '40000000-0000-0000-0000-000000000001'::uuid,
    '10000000-0000-0000-0000-000000000001'::uuid,
    'PO-2025-001',
    NOW() - INTERVAL '3 days',
    'Pending',
    jsonb_build_array(
      jsonb_build_object(
        'inventory_item_id', '20000000-0000-0000-0000-000000000001',
        'sku', 'SKU-001',
        'quantity', 100,
        'unit_price', 5.99,
        'total_price', 599.00
      )
    ),
    599.00
  ),
  (
    '40000000-0000-0000-0000-000000000002'::uuid,
    '10000000-0000-0000-0000-000000000002'::uuid,
    'PO-2025-002',
    NOW() - INTERVAL '1 day',
    'Submitted',
    jsonb_build_array(
      jsonb_build_object(
        'inventory_item_id', '20000000-0000-0000-0000-000000000002',
        'sku', 'SKU-002',
        'quantity', 100,
        'unit_price', 12.50,
        'total_price', 1250.00
      )
    ),
    1250.00
  )
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- TEST EXTERNAL DATA SOURCES
-- =============================================================================

-- Note: This is a test example with dummy credentials
-- Real credentials should be added via the Settings UI
INSERT INTO external_data_sources (
  id,
  user_id,
  source_type,
  display_name,
  description,
  credentials,
  sync_enabled,
  sync_frequency,
  field_mappings
)
VALUES
  (
    '50000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'finale_inventory',
    'Finale Inventory (Test)',
    'Test connection to Finale Inventory API',
    jsonb_build_object(
      'type', 'finale_inventory',
      'apiKey', 'test_api_key_placeholder',
      'apiSecret', 'test_api_secret_placeholder',
      'baseUrl', 'https://app.finaleinventory.com'
    ),
    false, -- disabled by default for test data
    'hourly',
    jsonb_build_object(
      'inventory', jsonb_build_object(
        'sku', 'productCode',
        'quantityOnHand', 'qtyOnHand',
        'reorderPoint', 'reorderLevel'
      ),
      'vendors', jsonb_build_object(
        'name', 'supplierName',
        'contactEmail', 'email',
        'leadTimeDays', 'leadTime'
      )
    )
  )
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

\echo 'Seed data inserted successfully!'
\echo ''
\echo 'Verification:'
SELECT 'Users' AS table_name, COUNT(*) AS count FROM users
UNION ALL
SELECT 'Vendors', COUNT(*) FROM vendors
UNION ALL
SELECT 'Inventory Items', COUNT(*) FROM inventory_items
UNION ALL
SELECT 'BOMs', COUNT(*) FROM boms
UNION ALL
SELECT 'Purchase Orders', COUNT(*) FROM purchase_orders
UNION ALL
SELECT 'External Data Sources', COUNT(*) FROM external_data_sources;
