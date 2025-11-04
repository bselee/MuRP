-- Verification Queries for Supabase Migration 002
-- Run these in Supabase SQL Editor to verify the migration succeeded

-- ============================================================================
-- 1. Check all new vendor columns exist
-- ============================================================================
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'vendors'
  AND column_name IN (
    'address_line1', 'address_line2', 'city', 'state', 
    'postal_code', 'country', 'phone', 'website',
    'notes', 'data_source', 'last_sync_at', 'sync_status'
  )
ORDER BY column_name;

-- Expected: 12 rows showing all new columns

-- ============================================================================
-- 2. Check trigger exists
-- ============================================================================
SELECT 
  trigger_name, 
  event_manipulation, 
  event_object_table,
  action_timing
FROM information_schema.triggers
WHERE trigger_name = 'trg_rebuild_vendor_address';

-- Expected: 1 row showing BEFORE INSERT OR UPDATE trigger

-- ============================================================================
-- 3. Check view exists and is queryable
-- ============================================================================
SELECT 
  table_name,
  view_definition
FROM information_schema.views
WHERE table_name = 'vendor_details';

-- Expected: 1 row showing the view definition

-- ============================================================================
-- 4. Check indexes exist
-- ============================================================================
SELECT 
  indexname,
  tablename,
  indexdef
FROM pg_indexes
WHERE tablename = 'vendors'
  AND indexname IN (
    'idx_vendors_name',
    'idx_vendors_emails',
    'idx_vendors_city',
    'idx_vendors_state',
    'idx_vendors_sync_status'
  )
ORDER BY indexname;

-- Expected: 5 rows showing all indexes

-- ============================================================================
-- 5. Test the trigger by inserting a sample vendor
-- ============================================================================
INSERT INTO vendors (
  id,
  name,
  address_line1,
  city,
  state,
  postal_code,
  country,
  phone,
  website,
  contact_emails,
  data_source,
  sync_status
) VALUES (
  'test-vendor-' || gen_random_uuid()::text,
  'Test Vendor (Delete Me)',
  '123 Test Street',
  'Denver',
  'CO',
  '80202',
  'USA',
  '(555) 123-4567',
  'https://example.com',
  ARRAY['test@example.com'],
  'manual',
  'synced'
)
RETURNING 
  id,
  name,
  address, -- Should be auto-populated by trigger
  address_line1,
  city,
  state;

-- Expected: 1 row with composite address = "123 Test Street, Denver, CO, 80202, USA"

-- ============================================================================
-- 6. Test the vendor_details view
-- ============================================================================
SELECT 
  name,
  address_line1,
  city,
  state,
  email_count,
  has_complete_address
FROM vendor_details
WHERE name = 'Test Vendor (Delete Me)'
LIMIT 1;

-- Expected: 1 row with email_count=1, has_complete_address=true

-- ============================================================================
-- 7. Clean up test data
-- ============================================================================
DELETE FROM vendors 
WHERE name = 'Test Vendor (Delete Me)';

-- Expected: 1 row deleted

-- ============================================================================
-- 8. Ready for real vendor sync!
-- ============================================================================
-- Migration verified ✅
-- Next step: Run vendor sync from the UI (Settings → Finale Integration → Sync Data)
