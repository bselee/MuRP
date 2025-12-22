-- Migration 110: Helper function for category filtering
--
-- IMPORTANT: Category filtering is now handled at the APP LEVEL via useGlobalCategoryFilter hook.
-- Users can configure which categories to exclude in Settings or Inventory page.
-- This migration only provides:
--   1. A helper function to check common excluded categories (for reference)
--   2. A safe view that excludes these by default
--
-- The actual filtering happens in the React app, stored in localStorage.
-- This allows users to customize which categories they see.

-- ============================================================================
-- STEP 1: HELPER FUNCTION (for reference/optional use)
-- ============================================================================

CREATE OR REPLACE FUNCTION is_common_excluded_category(category_value TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF category_value IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Common categories that are typically excluded
    -- Note: The actual filtering is done at app level via useGlobalCategoryFilter
    RETURN LOWER(TRIM(category_value)) IN (
        'deprecating',
        'deprecated', 
        'discontinued'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION is_common_excluded_category(TEXT) IS 
    'Returns TRUE if the category is commonly excluded (Deprecating, Deprecated, Discontinued). Actual filtering is done at app level.';

-- ============================================================================
-- STEP 2: CREATE OPTIONAL VIEW (for direct DB queries)
-- ============================================================================

-- This view provides a way to query without excluded categories directly from DB
-- The app uses its own filtering via useGlobalCategoryFilter hook
CREATE OR REPLACE VIEW active_inventory_items AS
SELECT *
FROM inventory_items
WHERE is_active = true
  AND NOT is_common_excluded_category(category)
  AND NOT is_dropship;

COMMENT ON VIEW active_inventory_items IS
    'Safe view excluding inactive, deprecated, and dropship items. App uses useGlobalCategoryFilter for filtering.';

-- ============================================================================
-- STEP 3: INDEX FOR PERFORMANCE (if filtering is ever done at DB level)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_inventory_category_lower 
    ON inventory_items (LOWER(category));

-- ============================================================================
-- NOTE ON FILTERING STRATEGY
-- ============================================================================

-- Category filtering is a USER PREFERENCE, not a hard database rule.
-- 
-- - Users can configure excluded categories in the Inventory page
-- - The setting persists to localStorage as 'global-excluded-categories'
-- - The useGlobalCategoryFilter hook provides the filtering logic
-- - Default exclusions: deprecating, deprecated, discontinued
-- - Users CAN choose to see these categories if they want
--
-- This migration does NOT:
-- - Automatically set is_active=false for any items
-- - Create triggers that force category-based deactivation
-- - Delete any data
--
-- The is_active flag should only be set manually or by the sync process
-- for items that are truly inactive in Finale.
