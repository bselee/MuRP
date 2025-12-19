-- Migration: 102_add_is_dropship_to_inventory_items.sql
-- Description: Add is_dropship column to inventory_items for reliable dropship filtering
-- Purpose: Stock Intelligence should NEVER show dropship items - database-level filtering is most reliable
-- Date: 2025-12-19

-- ============================================================================
-- PHASE 1: Add is_dropship column to inventory_items
-- ============================================================================

ALTER TABLE inventory_items
ADD COLUMN IF NOT EXISTS is_dropship BOOLEAN DEFAULT false;

COMMENT ON COLUMN inventory_items.is_dropship IS 'True if item is dropship-only (not stocked). These items should be filtered from Stock Intelligence views.';

-- ============================================================================
-- PHASE 2: Populate is_dropship from custom_fields JSON
-- Uses all known field name variations from Finale API
-- ============================================================================

UPDATE inventory_items
SET is_dropship = true
WHERE is_dropship IS NOT TRUE
  AND custom_fields IS NOT NULL
  AND (
    -- Boolean true values
    (custom_fields->>'dropship')::boolean = true OR
    (custom_fields->>'Dropship')::boolean = true OR
    (custom_fields->>'dropshipped')::boolean = true OR
    (custom_fields->>'Dropshipped')::boolean = true OR
    (custom_fields->>'drop_ship')::boolean = true OR
    (custom_fields->>'drop_shipped')::boolean = true OR
    (custom_fields->>'Drop_Ship')::boolean = true OR
    (custom_fields->>'Drop_Shipped')::boolean = true OR
    (custom_fields->>'dropShip')::boolean = true OR
    (custom_fields->>'dropShipped')::boolean = true OR
    -- String 'yes'/'true' values (case-insensitive)
    LOWER(TRIM(custom_fields->>'dropship')) IN ('yes', 'y', 'true', '1', 'drop ship', 'dropship', 'dropshipped', 'drop shipped') OR
    LOWER(TRIM(custom_fields->>'Dropship')) IN ('yes', 'y', 'true', '1', 'drop ship', 'dropship', 'dropshipped', 'drop shipped') OR
    LOWER(TRIM(custom_fields->>'dropshipped')) IN ('yes', 'y', 'true', '1', 'drop ship', 'dropship', 'dropshipped', 'drop shipped') OR
    LOWER(TRIM(custom_fields->>'Dropshipped')) IN ('yes', 'y', 'true', '1', 'drop ship', 'dropship', 'dropshipped', 'drop shipped') OR
    LOWER(TRIM(custom_fields->>'drop_ship')) IN ('yes', 'y', 'true', '1', 'drop ship', 'dropship', 'dropshipped', 'drop shipped') OR
    LOWER(TRIM(custom_fields->>'drop_shipped')) IN ('yes', 'y', 'true', '1', 'drop ship', 'dropship', 'dropshipped', 'drop shipped') OR
    LOWER(TRIM(custom_fields->>'Drop_Ship')) IN ('yes', 'y', 'true', '1', 'drop ship', 'dropship', 'dropshipped', 'drop shipped') OR
    LOWER(TRIM(custom_fields->>'Drop_Shipped')) IN ('yes', 'y', 'true', '1', 'drop ship', 'dropship', 'dropshipped', 'drop shipped') OR
    LOWER(TRIM(custom_fields->>'dropShip')) IN ('yes', 'y', 'true', '1', 'drop ship', 'dropship', 'dropshipped', 'drop shipped') OR
    LOWER(TRIM(custom_fields->>'dropShipped')) IN ('yes', 'y', 'true', '1', 'drop ship', 'dropship', 'dropshipped', 'drop shipped') OR
    LOWER(TRIM(custom_fields->>'Drop Ship')) IN ('yes', 'y', 'true', '1', 'drop ship', 'dropship', 'dropshipped', 'drop shipped') OR
    LOWER(TRIM(custom_fields->>'Drop Shipped')) IN ('yes', 'y', 'true', '1', 'drop ship', 'dropship', 'dropshipped', 'drop shipped') OR
    LOWER(TRIM(custom_fields->>'drop ship')) IN ('yes', 'y', 'true', '1', 'drop ship', 'dropship', 'dropshipped', 'drop shipped') OR
    LOWER(TRIM(custom_fields->>'drop shipped')) IN ('yes', 'y', 'true', '1', 'drop ship', 'dropship', 'dropshipped', 'drop shipped')
  );

-- ============================================================================
-- PHASE 3: Also check category field for dropship indicators
-- ============================================================================

UPDATE inventory_items
SET is_dropship = true
WHERE is_dropship IS NOT TRUE
  AND LOWER(TRIM(category)) IN ('dropship', 'drop ship', 'dropshipped', 'drop shipped', 'ds', 'drop-ship');

-- ============================================================================
-- PHASE 4: Check name/description for dropship indicators (common pattern)
-- ============================================================================

UPDATE inventory_items
SET is_dropship = true
WHERE is_dropship IS NOT TRUE
  AND (
    LOWER(name) LIKE '%dropship%' OR
    LOWER(name) LIKE '%drop ship%' OR
    LOWER(name) LIKE '%drop-ship%' OR
    LOWER(description) LIKE '%dropship only%' OR
    LOWER(description) LIKE '%drop ship only%'
  );

-- ============================================================================
-- PHASE 5: Create index for efficient filtering
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_inventory_items_dropship
ON inventory_items (is_dropship)
WHERE is_dropship = false;

-- Composite index for stock intelligence queries
CREATE INDEX IF NOT EXISTS idx_inventory_items_stock_intelligence
ON inventory_items (status, category, is_dropship)
WHERE status = 'active' AND is_dropship = false;

-- ============================================================================
-- PHASE 6: Create view for stock intelligence (non-dropship, active items only)
-- ============================================================================

CREATE OR REPLACE VIEW stock_intelligence_items AS
SELECT *
FROM inventory_items
WHERE status = 'active'
  AND is_dropship = false
  AND LOWER(TRIM(COALESCE(category, ''))) NOT IN ('deprecating', 'deprecated', 'discontinued');

COMMENT ON VIEW stock_intelligence_items IS 'Filtered inventory items for Stock Intelligence dashboard. Excludes dropship, inactive, and deprecating items.';

-- ============================================================================
-- PHASE 7: Verification
-- ============================================================================

DO $$
DECLARE
  v_total INTEGER;
  v_dropship INTEGER;
  v_stock_intel INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM inventory_items;
  SELECT COUNT(*) INTO v_dropship FROM inventory_items WHERE is_dropship = true;
  SELECT COUNT(*) INTO v_stock_intel FROM stock_intelligence_items;

  RAISE NOTICE 'Migration 102 completed successfully!';
  RAISE NOTICE 'Total inventory items: %', v_total;
  RAISE NOTICE 'Dropship items flagged: %', v_dropship;
  RAISE NOTICE 'Items visible in Stock Intelligence: %', v_stock_intel;
END $$;
