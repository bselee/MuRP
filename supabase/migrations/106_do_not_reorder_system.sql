-- Migration: 106_do_not_reorder_system.sql
-- Description: Add reorder_method column and auto-detect "Do Not Reorder" items from Finale
-- Purpose: Filter out non-reorderable items (books, clothing, dropship, etc.) from Stock Intelligence alerts
-- Date: 2025-12-19

-- ============================================================================
-- PHASE 1: Add reorder_method column to inventory_items
-- ============================================================================

-- Add column to store Finale's reorder calculation method
ALTER TABLE inventory_items
ADD COLUMN IF NOT EXISTS reorder_method VARCHAR(50) DEFAULT 'default';

COMMENT ON COLUMN inventory_items.reorder_method IS 'Finale reorder calculation method: default, manual, sales_velocity, do_not_reorder';

-- Add constraint for valid reorder methods
ALTER TABLE inventory_items
DROP CONSTRAINT IF EXISTS check_reorder_method;

ALTER TABLE inventory_items
ADD CONSTRAINT check_reorder_method
CHECK (reorder_method IN ('default', 'manual', 'sales_velocity', 'do_not_reorder', 'unknown'));

-- Index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_inventory_items_reorder_method
ON inventory_items (reorder_method)
WHERE reorder_method = 'do_not_reorder';

-- ============================================================================
-- PHASE 2: Populate reorder_method from custom_fields (Finale sync data)
-- ============================================================================

-- Check various possible field names that Finale might use for reorder method
UPDATE inventory_items
SET reorder_method =
  CASE
    -- Check for explicit "do not reorder" values in custom_fields
    WHEN LOWER(COALESCE(
      custom_fields->>'reorderCalculationMethod',
      custom_fields->>'reorder_calculation_method',
      custom_fields->>'reorderMethod',
      custom_fields->>'reorder_method',
      custom_fields->>'ReorderMethod',
      custom_fields->>'Reorder Method',
      ''
    )) IN ('do not reorder', 'do_not_reorder', 'donotreorder', 'none', 'no reorder', 'no_reorder')
    THEN 'do_not_reorder'

    -- Check for sales velocity
    WHEN LOWER(COALESCE(
      custom_fields->>'reorderCalculationMethod',
      custom_fields->>'reorder_calculation_method',
      custom_fields->>'reorderMethod',
      custom_fields->>'reorder_method',
      ''
    )) IN ('sales velocity', 'sales_velocity', 'salesvelocity', 'velocity')
    THEN 'sales_velocity'

    -- Check for manual
    WHEN LOWER(COALESCE(
      custom_fields->>'reorderCalculationMethod',
      custom_fields->>'reorder_calculation_method',
      custom_fields->>'reorderMethod',
      custom_fields->>'reorder_method',
      ''
    )) IN ('manual', 'manual reorder point entry', 'manual_entry')
    THEN 'manual'

    -- Default remains default
    ELSE 'default'
  END
WHERE custom_fields IS NOT NULL
  AND custom_fields != '{}'::jsonb;

-- ============================================================================
-- PHASE 3: Auto-detect "Do Not Reorder" items by category/name patterns
-- ============================================================================

-- Categories that typically should not be reordered
-- Books, clothing, promotional items, samples, etc.
UPDATE inventory_items
SET
  reorder_method = 'do_not_reorder',
  stock_intel_exclude = true,
  stock_intel_exclusion_reason = COALESCE(stock_intel_exclusion_reason, 'auto_detected_non_reorderable_category')
WHERE
  reorder_method != 'do_not_reorder'
  AND stock_intel_exclude = false
  AND (
    -- Books
    LOWER(TRIM(COALESCE(category, ''))) IN ('books', 'book', 'publications', 'literature', 'reading material')
    OR LOWER(name) LIKE '%book%'
    OR LOWER(name) LIKE '%manual%'
    OR LOWER(name) LIKE '%guide%'

    -- Clothing/Apparel
    OR LOWER(TRIM(COALESCE(category, ''))) IN ('clothing', 'apparel', 'shirts', 'hats', 'merchandise', 'merch', 'swag', 'wearables')
    OR LOWER(name) LIKE '%shirt%'
    OR LOWER(name) LIKE '%hat%'
    OR LOWER(name) LIKE '%hoodie%'
    OR LOWER(name) LIKE '% tee %'
    OR LOWER(name) LIKE '%t-shirt%'
    OR LOWER(name) LIKE '%cap %'

    -- Promotional/Samples
    OR LOWER(TRIM(COALESCE(category, ''))) IN ('promotional', 'promo', 'samples', 'sample', 'giveaway', 'giveaways', 'marketing')
    OR LOWER(name) LIKE '%sample%'
    OR LOWER(name) LIKE '%promo%'
    OR LOWER(name) LIKE '%giveaway%'

    -- Gift cards / Non-physical
    OR LOWER(TRIM(COALESCE(category, ''))) IN ('gift cards', 'gift card', 'digital', 'virtual', 'service', 'services')
    OR LOWER(name) LIKE '%gift card%'
    OR LOWER(name) LIKE '%e-gift%'
  );

-- ============================================================================
-- PHASE 4: Mark items with reorder_point = 0 as potentially do_not_reorder
-- ============================================================================

-- Items where Finale has set reorder point to 0 are likely "Do Not Reorder"
-- But only if they're not already categorized and have stock (not just new items)
UPDATE inventory_items
SET
  reorder_method = 'do_not_reorder',
  stock_intel_exclude = true,
  stock_intel_exclusion_reason = COALESCE(stock_intel_exclusion_reason, 'reorder_point_zero')
WHERE
  reorder_method = 'default'
  AND stock_intel_exclude = false
  AND COALESCE(reorder_point, 0) = 0
  AND COALESCE(min_stock, 0) = 0
  AND stock > 0  -- Has stock, so not a new/placeholder item
  AND item_flow_type = 'standard';  -- Not already categorized as special

-- ============================================================================
-- PHASE 5: Update stock_intelligence_items view to exclude do_not_reorder
-- ============================================================================

DROP VIEW IF EXISTS stock_intelligence_items CASCADE;

CREATE VIEW stock_intelligence_items AS
SELECT i.*
FROM inventory_items i
WHERE
  -- Per-item override takes highest priority
  CASE
    WHEN i.stock_intel_override = true THEN NOT COALESCE(i.stock_intel_exclude, false)
    ELSE (
      -- Not manually excluded
      COALESCE(i.stock_intel_exclude, false) = false
      -- Not dropship
      AND COALESCE(i.is_dropship, false) = false
      -- Not "do not reorder" method
      AND COALESCE(i.reorder_method, 'default') != 'do_not_reorder'
      -- Active status
      AND LOWER(COALESCE(i.status, 'active')) = 'active'
      -- Not excluded flow type
      AND COALESCE(i.item_flow_type, 'standard') NOT IN ('dropship', 'consignment', 'made_to_order', 'discontinued')
      -- Not excluded category (case-insensitive)
      AND LOWER(TRIM(COALESCE(i.category, ''))) NOT IN ('deprecating', 'deprecated', 'discontinued', 'dropship', 'drop ship')
    )
  END;

COMMENT ON VIEW stock_intelligence_items IS 'Items visible in Stock Intelligence - excludes dropship, do_not_reorder, and manually excluded items';

-- ============================================================================
-- PHASE 6: Add "do_not_reorder" to global exclusion settings
-- ============================================================================

-- Update global settings to include reorder_method exclusions
INSERT INTO stock_intel_settings (setting_key, setting_value, description)
VALUES
  ('excluded_reorder_methods', '["do_not_reorder"]',
   'Reorder methods that are globally excluded from Stock Intelligence'),
  ('auto_exclude_categories', '["books", "clothing", "apparel", "promotional", "samples", "gift cards"]',
   'Categories that should auto-set do_not_reorder on sync')
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value,
    updated_at = NOW();

-- ============================================================================
-- PHASE 7: Create function to check reorder eligibility
-- ============================================================================

CREATE OR REPLACE FUNCTION should_trigger_reorder_alert(p_sku VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
  v_item RECORD;
BEGIN
  SELECT
    reorder_method, item_flow_type, is_dropship,
    stock_intel_exclude, stock_intel_override, status
  INTO v_item
  FROM inventory_items
  WHERE sku = p_sku;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Override takes priority
  IF v_item.stock_intel_override = true THEN
    RETURN NOT COALESCE(v_item.stock_intel_exclude, false);
  END IF;

  -- Check all exclusion conditions
  IF v_item.stock_intel_exclude = true THEN RETURN false; END IF;
  IF v_item.is_dropship = true THEN RETURN false; END IF;
  IF v_item.reorder_method = 'do_not_reorder' THEN RETURN false; END IF;
  IF v_item.item_flow_type IN ('dropship', 'consignment', 'made_to_order', 'discontinued') THEN RETURN false; END IF;
  IF LOWER(COALESCE(v_item.status, 'active')) != 'active' THEN RETURN false; END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION should_trigger_reorder_alert IS 'Check if an item should trigger reorder alerts (respects do_not_reorder, dropship, and exclusions)';

-- ============================================================================
-- PHASE 8: Create audit trigger for reorder_method changes
-- ============================================================================

CREATE OR REPLACE FUNCTION log_reorder_method_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.reorder_method IS DISTINCT FROM NEW.reorder_method THEN
    INSERT INTO stock_intel_exclusion_log (
      sku, action, previous_value, new_value, reason, changed_by
    ) VALUES (
      NEW.sku,
      'reorder_method_change',
      jsonb_build_object('reorder_method', OLD.reorder_method),
      jsonb_build_object('reorder_method', NEW.reorder_method),
      CASE
        WHEN NEW.reorder_method = 'do_not_reorder' THEN 'marked_do_not_reorder'
        ELSE 'reorder_method_updated'
      END,
      COALESCE(current_setting('app.current_user', true), 'system')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_reorder_method_change ON inventory_items;
CREATE TRIGGER trg_log_reorder_method_change
  AFTER UPDATE ON inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION log_reorder_method_change();

-- ============================================================================
-- PHASE 9: Update agent_classification_context view to include reorder_method
-- ============================================================================

CREATE OR REPLACE VIEW agent_classification_context AS
SELECT
  i.sku,
  i.name,
  i.category,
  i.status,
  i.is_dropship,
  i.reorder_method,
  COALESCE(i.item_flow_type, 'standard') as flow_type,
  i.stock_intel_exclude,
  i.stock_intel_exclusion_reason,
  i.stock_intel_override,
  i.stock as current_stock,
  i.on_order,
  i.reorder_point,
  i.moq,
  i.lead_time_days,
  i.sales_velocity_consolidated as daily_velocity,
  -- SOP context for agent
  sop.display_name as flow_type_display,
  sop.sop_summary,
  sop.sop_rules,
  sop.agent_actions,
  sop.include_in_stock_intel as sop_includes_in_stock_intel,
  sop.triggers_reorder_alerts as sop_triggers_reorder,
  sop.automation_level,
  -- Derived fields for agent decision-making
  -- Now includes reorder_method = 'do_not_reorder' check
  CASE
    WHEN i.stock_intel_override = true THEN
      CASE WHEN i.stock_intel_exclude = true THEN false ELSE true END
    WHEN i.stock_intel_exclude = true THEN false
    WHEN COALESCE(i.reorder_method, 'default') = 'do_not_reorder' THEN false
    WHEN COALESCE(i.item_flow_type, 'standard') IN ('dropship', 'consignment', 'made_to_order', 'discontinued') THEN false
    WHEN i.is_dropship = true THEN false
    WHEN LOWER(COALESCE(i.category, '')) IN ('dropship', 'drop ship', 'deprecating', 'deprecated') THEN false
    ELSE true
  END as visible_in_stock_intel,
  -- should_trigger_reorder_alerts: Now checks reorder_method
  CASE
    WHEN COALESCE(i.reorder_method, 'default') = 'do_not_reorder' THEN false
    WHEN COALESCE(i.item_flow_type, 'standard') IN ('standard') AND i.stock_intel_exclude != true THEN true
    ELSE false
  END as should_trigger_reorder_alerts,
  -- Agent instruction summary - includes do_not_reorder case
  CASE
    WHEN COALESCE(i.reorder_method, 'default') = 'do_not_reorder' THEN 'DO NOT reorder - Finale marked as Do Not Reorder'
    WHEN COALESCE(i.item_flow_type, 'standard') = 'standard' THEN 'Monitor stock, generate reorder alerts, can create PO drafts'
    WHEN i.item_flow_type = 'dropship' THEN 'DO NOT show in stock intel, requires customer order to generate PO'
    WHEN i.item_flow_type = 'special_order' THEN 'DO NOT auto-reorder, requires customer request and approval'
    WHEN i.item_flow_type = 'consignment' THEN 'DO NOT create POs, report sales to vendor, vendor manages stock'
    WHEN i.item_flow_type = 'made_to_order' THEN 'DO NOT stock, trigger production workflow on order'
    WHEN i.item_flow_type = 'discontinued' THEN 'DO NOT reorder, sell through remaining, suggest clearance'
    ELSE 'Unknown flow type - treat as standard with caution'
  END as agent_instruction_summary
FROM inventory_items i
LEFT JOIN item_flow_sops sop ON sop.flow_type = COALESCE(i.item_flow_type, 'standard');

COMMENT ON VIEW agent_classification_context IS 'Agent-friendly view of item classification with SOP context - includes reorder_method for Finale Do Not Reorder detection';

-- ============================================================================
-- PHASE 10: Verification and reporting
-- ============================================================================

DO $$
DECLARE
  v_total INTEGER;
  v_do_not_reorder INTEGER;
  v_stock_intel_visible INTEGER;
  v_auto_excluded INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM inventory_items;
  SELECT COUNT(*) INTO v_do_not_reorder FROM inventory_items WHERE reorder_method = 'do_not_reorder';
  SELECT COUNT(*) INTO v_stock_intel_visible FROM stock_intelligence_items;
  SELECT COUNT(*) INTO v_auto_excluded FROM inventory_items WHERE stock_intel_exclusion_reason LIKE 'auto_%';

  RAISE NOTICE 'Migration 106 completed successfully!';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Total inventory items: %', v_total;
  RAISE NOTICE 'Items marked "Do Not Reorder": %', v_do_not_reorder;
  RAISE NOTICE 'Items visible in Stock Intelligence: %', v_stock_intel_visible;
  RAISE NOTICE 'Items auto-excluded by category/pattern: %', v_auto_excluded;
  RAISE NOTICE '============================================';
END $$;
