-- Migration: 098_unified_active_filtering.sql
-- Description: Enforce active-only filtering across ALL data tables
-- Date: 2025-12-15
-- ============================================================================
-- This migration:
-- 1. Ensures all major tables have a consistent is_active column
-- 2. Creates filtered views for active-only data
-- 3. Cleans up any inactive records
-- 4. Adds indexes for performance
-- ============================================================================

BEGIN;

-- ============================================================================
-- PHASE 1: Add is_active columns where missing
-- ============================================================================

-- Vendors table (add is_active if missing)
ALTER TABLE vendors
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Update existing vendors to active (only if column was just added)
UPDATE vendors SET is_active = TRUE WHERE is_active IS NULL;

-- BOMs table (add is_active if missing)
ALTER TABLE boms
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Update existing BOMs to active
UPDATE boms SET is_active = TRUE WHERE is_active IS NULL;

-- Purchase orders (add is_active if missing)
ALTER TABLE finale_purchase_orders
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

UPDATE finale_purchase_orders SET is_active = TRUE WHERE is_active IS NULL;

-- ============================================================================
-- PHASE 2: Sync is_active from status columns where applicable
-- ============================================================================

-- Inventory items: sync is_active from status column
-- Status 'active' = is_active true, others = false
DO $$
BEGIN
  -- Add is_active column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_items' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE inventory_items ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
  END IF;
END$$;

-- Update is_active based on status
UPDATE inventory_items 
SET is_active = (LOWER(TRIM(COALESCE(status, 'active'))) = 'active')
WHERE is_active IS NULL OR is_active != (LOWER(TRIM(COALESCE(status, 'active'))) = 'active');

-- ============================================================================
-- PHASE 3: Create Active-Only Views
-- ============================================================================

-- Active inventory view
CREATE OR REPLACE VIEW active_inventory_items AS
SELECT * FROM inventory_items
WHERE is_active = TRUE 
  AND (LOWER(TRIM(COALESCE(status, 'active'))) = 'active');

COMMENT ON VIEW active_inventory_items IS 'Only active inventory items - use this view for all UI queries';

-- Active vendors view
CREATE OR REPLACE VIEW active_vendors AS
SELECT * FROM vendors
WHERE is_active = TRUE;

COMMENT ON VIEW active_vendors IS 'Only active vendors - use this view for all UI queries';

-- Active BOMs view
CREATE OR REPLACE VIEW active_boms AS
SELECT * FROM boms
WHERE is_active = TRUE;

COMMENT ON VIEW active_boms IS 'Only active BOMs - use this view for all UI queries';

-- Active Finale products view
CREATE OR REPLACE VIEW active_finale_products AS
SELECT * FROM finale_products
WHERE LOWER(TRIM(COALESCE(status, 'Active'))) = 'active'
  AND NOT (
    COALESCE(user_field_data->>'Dropshipped', '') ILIKE 'yes'
    OR COALESCE(user_field_data->>'dropshipped', '') ILIKE 'yes'
    OR COALESCE(user_field_data->>'Drop Shipped', '') ILIKE 'yes'
    OR COALESCE(user_field_data->>'drop_shipped', '') ILIKE 'yes'
  );

COMMENT ON VIEW active_finale_products IS 'Only active, non-dropshipped Finale products';

-- Active Finale BOMs view
CREATE OR REPLACE VIEW active_finale_boms AS
SELECT * FROM finale_boms
WHERE LOWER(TRIM(COALESCE(status, 'Active'))) = 'active';

COMMENT ON VIEW active_finale_boms IS 'Only active Finale BOMs';

-- Active Finale vendors view  
CREATE OR REPLACE VIEW active_finale_vendors AS
SELECT * FROM finale_vendors
WHERE LOWER(TRIM(COALESCE(status, 'Active'))) = 'active';

COMMENT ON VIEW active_finale_vendors IS 'Only active Finale vendors';

-- ============================================================================
-- PHASE 4: Create Indexes for Performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_inventory_items_is_active 
ON inventory_items(is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_vendors_is_active 
ON vendors(is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_boms_is_active 
ON boms(is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_inventory_items_status_active
ON inventory_items(status) WHERE LOWER(status) = 'active';

-- ============================================================================
-- PHASE 5: Clean up inactive data (SOFT DELETE - mark as inactive)
-- ============================================================================

-- Mark inventory items as inactive if status is not 'active'
UPDATE inventory_items
SET is_active = FALSE
WHERE LOWER(TRIM(COALESCE(status, ''))) IN ('inactive', 'discontinued', 'archived', 'deleted');

-- Mark dropshipped items as inactive
UPDATE inventory_items
SET is_active = FALSE
WHERE custom_fields IS NOT NULL AND (
  COALESCE(custom_fields->>'Dropshipped', '') ILIKE 'yes'
  OR COALESCE(custom_fields->>'dropshipped', '') ILIKE 'yes'
  OR COALESCE(custom_fields->>'Drop Shipped', '') ILIKE 'yes'
  OR COALESCE(custom_fields->>'drop_shipped', '') ILIKE 'yes'
  OR COALESCE(custom_fields->>'dropship', '') ILIKE 'yes'
  OR COALESCE(custom_fields->>'Dropship', '') ILIKE 'yes'
);

-- ============================================================================
-- PHASE 6: Log cleanup results
-- ============================================================================

DO $$
DECLARE
  inactive_inventory INTEGER;
  inactive_vendors INTEGER;
  inactive_boms INTEGER;
  active_inventory INTEGER;
  active_vendors INTEGER;
  active_boms INTEGER;
BEGIN
  SELECT COUNT(*) INTO inactive_inventory FROM inventory_items WHERE is_active = FALSE;
  SELECT COUNT(*) INTO inactive_vendors FROM vendors WHERE is_active = FALSE;
  SELECT COUNT(*) INTO inactive_boms FROM boms WHERE is_active = FALSE;
  
  SELECT COUNT(*) INTO active_inventory FROM inventory_items WHERE is_active = TRUE;
  SELECT COUNT(*) INTO active_vendors FROM vendors WHERE is_active = TRUE;
  SELECT COUNT(*) INTO active_boms FROM boms WHERE is_active = TRUE;
  
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'ACTIVE DATA FILTERING APPLIED:';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'Inventory: % active, % inactive', active_inventory, inactive_inventory;
  RAISE NOTICE 'Vendors: % active, % inactive', active_vendors, inactive_vendors;
  RAISE NOTICE 'BOMs: % active, % inactive', active_boms, inactive_boms;
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'Views created: active_inventory_items, active_vendors, active_boms';
  RAISE NOTICE 'Views created: active_finale_products, active_finale_boms, active_finale_vendors';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
END$$;

COMMIT;
