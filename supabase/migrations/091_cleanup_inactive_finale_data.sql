-- Migration: 091_cleanup_inactive_finale_data.sql
-- Description: Remove inactive items and dropshipped products from Finale sync tables
-- Author: System
-- Date: 2025-12-11

-- This migration enforces strict filtering of active items only.
-- Items with status != 'Active' or Dropshipped = 'yes' will be removed.

BEGIN;

-- ============================================================================
-- BACKUP CHECK: Verify tables exist before cleanup
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'finale_products') THEN
    RAISE EXCEPTION 'Table finale_products does not exist. Migration aborted.';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'finale_boms') THEN
    RAISE EXCEPTION 'Table finale_boms does not exist. Migration aborted.';
  END IF;
END$$;

-- ============================================================================
-- LOG: Record counts before cleanup
-- ============================================================================
DO $$
DECLARE
  inactive_products_count INTEGER;
  inactive_boms_count INTEGER;
  dropshipped_count INTEGER;
BEGIN
  -- Count inactive products
  SELECT COUNT(*) INTO inactive_products_count
  FROM finale_products
  WHERE LOWER(TRIM(status)) != 'active';
  
  -- Count inactive BOMs
  SELECT COUNT(*) INTO inactive_boms_count
  FROM finale_boms
  WHERE LOWER(TRIM(status)) != 'active';
  
  -- Count dropshipped products (check user_field_data JSONB)
  SELECT COUNT(*) INTO dropshipped_count
  FROM finale_products
  WHERE (user_field_data->>'Dropshipped')::TEXT = 'yes'
    OR (user_field_data->>'dropshipped')::TEXT = 'yes'
    OR (user_field_data->>'Drop Shipped')::TEXT = 'yes'
    OR (user_field_data->>'drop_shipped')::TEXT = 'yes';
  
  RAISE NOTICE 'CLEANUP SUMMARY:';
  RAISE NOTICE '  - Inactive products to remove: %', inactive_products_count;
  RAISE NOTICE '  - Inactive BOMs to remove: %', inactive_boms_count;
  RAISE NOTICE '  - Dropshipped products to remove: %', dropshipped_count;
END$$;

-- ============================================================================
-- CLEANUP 1: Remove inactive products
-- ============================================================================
DELETE FROM finale_products
WHERE LOWER(TRIM(status)) != 'active';

-- ============================================================================
-- CLEANUP 2: Remove dropshipped products
-- ============================================================================
DELETE FROM finale_products
WHERE (user_field_data->>'Dropshipped')::TEXT = 'yes'
  OR (user_field_data->>'dropshipped')::TEXT = 'yes'
  OR (user_field_data->>'Drop Shipped')::TEXT = 'yes'
  OR (user_field_data->>'drop_shipped')::TEXT = 'yes';

-- ============================================================================
-- CLEANUP 3: Remove inactive BOMs
-- ============================================================================
DELETE FROM finale_boms
WHERE LOWER(TRIM(status)) != 'active';

-- ============================================================================
-- CLEANUP 4: Remove orphaned BOMs (parent product no longer exists)
-- ============================================================================
DELETE FROM finale_boms
WHERE finished_sku NOT IN (
  SELECT sku FROM finale_products WHERE LOWER(TRIM(status)) = 'active'
);

-- ============================================================================
-- CLEANUP 5: Also clean up inventory_items table (if it uses finale data)
-- ============================================================================
-- Check if inventory_items table has status column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_items' AND column_name = 'status'
  ) THEN
    -- Remove inactive items
    DELETE FROM inventory_items
    WHERE LOWER(TRIM(status)) != 'active' AND status IS NOT NULL;
    
    RAISE NOTICE 'Cleaned up inventory_items table (removed inactive items)';
  END IF;
END$$;

-- ============================================================================
-- CLEANUP 6: Remove dropshipped items from inventory_items (check custom_fields)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_items' AND column_name = 'custom_fields'
  ) THEN
    -- Remove dropshipped items
    DELETE FROM inventory_items
    WHERE (custom_fields->>'Dropshipped')::TEXT = 'yes'
      OR (custom_fields->>'dropshipped')::TEXT = 'yes'
      OR (custom_fields->>'Drop Shipped')::TEXT = 'yes'
      OR (custom_fields->>'drop_shipped')::TEXT = 'yes';
    
    RAISE NOTICE 'Cleaned up inventory_items table (removed dropshipped items)';
  END IF;
END$$;

-- ============================================================================
-- VERIFICATION: Log final counts
-- ============================================================================
DO $$
DECLARE
  remaining_products INTEGER;
  remaining_boms INTEGER;
  remaining_inventory INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_products FROM finale_products;
  SELECT COUNT(*) INTO remaining_boms FROM finale_boms;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_items') THEN
    SELECT COUNT(*) INTO remaining_inventory FROM inventory_items;
  ELSE
    remaining_inventory := 0;
  END IF;
  
  RAISE NOTICE 'CLEANUP COMPLETE:';
  RAISE NOTICE '  - Remaining active products: %', remaining_products;
  RAISE NOTICE '  - Remaining active BOMs: %', remaining_boms;
  RAISE NOTICE '  - Remaining inventory items: %', remaining_inventory;
  RAISE NOTICE '  - All inactive and dropshipped items have been removed';
END$$;

-- ============================================================================
-- ADD INDEX: Speed up future active-only queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_finale_products_active_status 
ON finale_products (status) 
WHERE LOWER(TRIM(status)) = 'active';

CREATE INDEX IF NOT EXISTS idx_finale_boms_active_status 
ON finale_boms (status) 
WHERE LOWER(TRIM(status)) = 'active';

-- Add index for custom_fields dropshipped check (if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_items' AND column_name = 'custom_fields'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_inventory_items_dropshipped 
    ON inventory_items ((custom_fields->>'Dropshipped'))
    WHERE (custom_fields->>'Dropshipped') IS NOT NULL;
  END IF;
END$$;

COMMIT;

-- ============================================================================
-- USAGE NOTES
-- ============================================================================
-- This migration:
-- 1. Removes all products where status != 'Active' (case-insensitive)
-- 2. Removes all products where Dropshipped field = 'yes' (various case formats)
-- 3. Removes all BOMs where status != 'Active'
-- 4. Removes orphaned BOMs (parent SKU no longer exists)
-- 5. Cleans up inventory_items table if it exists
-- 6. Adds indexes for better query performance
--
-- To verify cleanup was successful, run:
--   SELECT COUNT(*) FROM finale_products WHERE LOWER(TRIM(status)) != 'active';
--   -- Should return 0
--
-- To see remaining active products:
--   SELECT COUNT(*) FROM finale_products WHERE LOWER(TRIM(status)) = 'active';
