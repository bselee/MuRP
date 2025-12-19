-- Migration: 103_stock_intel_exclusion_system.sql
-- Description: Add manual exclusion controls for Stock Intelligence
-- Purpose: Allow both global rules and per-item overrides for what appears in Stock Intelligence
-- Date: 2025-12-19

-- ============================================================================
-- PHASE 1: Add per-item exclusion fields to inventory_items
-- ============================================================================

-- Add exclusion control fields to inventory_items
ALTER TABLE inventory_items
ADD COLUMN IF NOT EXISTS stock_intel_exclude BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS stock_intel_exclusion_reason TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS stock_intel_override BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS item_flow_type VARCHAR(50) DEFAULT 'standard';

COMMENT ON COLUMN inventory_items.stock_intel_exclude IS 'Manually exclude this item from Stock Intelligence views';
COMMENT ON COLUMN inventory_items.stock_intel_exclusion_reason IS 'Reason for exclusion (dropship, special_order, consignment, etc.)';
COMMENT ON COLUMN inventory_items.stock_intel_override IS 'If true, per-item settings override global rules (force include/exclude)';
COMMENT ON COLUMN inventory_items.item_flow_type IS 'Workflow type: standard, dropship, special_order, consignment, made_to_order';

-- Add constraint for valid flow types
ALTER TABLE inventory_items
DROP CONSTRAINT IF EXISTS check_item_flow_type;

ALTER TABLE inventory_items
ADD CONSTRAINT check_item_flow_type
CHECK (item_flow_type IN ('standard', 'dropship', 'special_order', 'consignment', 'made_to_order', 'discontinued'));

-- ============================================================================
-- PHASE 2: Create global Stock Intelligence settings table
-- ============================================================================

CREATE TABLE IF NOT EXISTS stock_intel_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

COMMENT ON TABLE stock_intel_settings IS 'Global settings for Stock Intelligence filtering and behavior';

-- Insert default global exclusion rules
INSERT INTO stock_intel_settings (setting_key, setting_value, description)
VALUES
  ('excluded_categories', '["Deprecating", "Deprecated", "Discontinued", "Dropship", "Drop Ship"]',
   'Categories that are globally excluded from Stock Intelligence'),
  ('excluded_flow_types', '["dropship", "consignment", "made_to_order"]',
   'Item flow types that are globally excluded from Stock Intelligence'),
  ('excluded_status', '["inactive", "discontinued"]',
   'Item statuses that are globally excluded from Stock Intelligence'),
  ('dropship_sop', '{"enabled": false, "separate_dashboard": true, "alert_lead_time_days": 7}',
   'SOP settings for dropship items (separate workflow)'),
  ('special_order_sop', '{"enabled": false, "min_quantity_alert": true, "customer_notification": true}',
   'SOP settings for special order items')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================================
-- PHASE 3: Create exclusion audit log
-- ============================================================================

CREATE TABLE IF NOT EXISTS stock_intel_exclusion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'exclude', 'include', 'flow_type_change'
  previous_value JSONB,
  new_value JSONB,
  reason TEXT,
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE stock_intel_exclusion_log IS 'Audit log for Stock Intelligence exclusion changes';

CREATE INDEX IF NOT EXISTS idx_stock_intel_exclusion_log_sku ON stock_intel_exclusion_log(sku);
CREATE INDEX IF NOT EXISTS idx_stock_intel_exclusion_log_changed_at ON stock_intel_exclusion_log(changed_at DESC);

-- ============================================================================
-- PHASE 4: Create function to check if item should be in Stock Intelligence
-- ============================================================================

CREATE OR REPLACE FUNCTION is_stock_intel_visible(p_sku VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
  v_item RECORD;
  v_excluded_categories JSONB;
  v_excluded_flow_types JSONB;
  v_excluded_status JSONB;
  v_category_lower TEXT;
BEGIN
  -- Get item details
  SELECT
    category, status, is_dropship, stock_intel_exclude,
    stock_intel_override, item_flow_type
  INTO v_item
  FROM inventory_items
  WHERE sku = p_sku;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Check per-item override first (highest priority)
  IF v_item.stock_intel_override = true THEN
    -- If override is set, use the per-item exclude setting directly
    RETURN NOT COALESCE(v_item.stock_intel_exclude, false);
  END IF;

  -- Check per-item exclusion (if not overridden by global)
  IF v_item.stock_intel_exclude = true THEN
    RETURN false;
  END IF;

  -- Check is_dropship flag
  IF v_item.is_dropship = true THEN
    RETURN false;
  END IF;

  -- Get global exclusion rules
  SELECT setting_value INTO v_excluded_categories
  FROM stock_intel_settings WHERE setting_key = 'excluded_categories';

  SELECT setting_value INTO v_excluded_flow_types
  FROM stock_intel_settings WHERE setting_key = 'excluded_flow_types';

  SELECT setting_value INTO v_excluded_status
  FROM stock_intel_settings WHERE setting_key = 'excluded_status';

  -- Check category against global rules
  v_category_lower := LOWER(TRIM(COALESCE(v_item.category, '')));
  IF v_excluded_categories IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_excluded_categories) AS cat
      WHERE LOWER(cat) = v_category_lower
    ) THEN
      RETURN false;
    END IF;
  END IF;

  -- Check flow type against global rules
  IF v_excluded_flow_types IS NOT NULL AND v_item.item_flow_type IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_excluded_flow_types) AS ft
      WHERE LOWER(ft) = LOWER(v_item.item_flow_type)
    ) THEN
      RETURN false;
    END IF;
  END IF;

  -- Check status against global rules
  IF v_excluded_status IS NOT NULL AND v_item.status IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_excluded_status) AS st
      WHERE LOWER(st) = LOWER(v_item.status)
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION is_stock_intel_visible IS 'Check if an item should be visible in Stock Intelligence (respects global rules and per-item overrides)';

-- ============================================================================
-- PHASE 5: Update stock_intelligence_items view to use new rules
-- ============================================================================

DROP VIEW IF EXISTS stock_intelligence_items;

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
      -- Active status
      AND LOWER(COALESCE(i.status, 'active')) = 'active'
      -- Not excluded flow type
      AND COALESCE(i.item_flow_type, 'standard') NOT IN ('dropship', 'consignment', 'made_to_order')
      -- Not excluded category (case-insensitive)
      AND LOWER(TRIM(COALESCE(i.category, ''))) NOT IN ('deprecating', 'deprecated', 'discontinued', 'dropship', 'drop ship')
    )
  END;

COMMENT ON VIEW stock_intelligence_items IS 'Items visible in Stock Intelligence, respecting global rules and per-item overrides';

-- ============================================================================
-- PHASE 6: Create view for dropship items (separate workflow)
-- ============================================================================

CREATE OR REPLACE VIEW dropship_workflow_items AS
SELECT i.*
FROM inventory_items i
WHERE
  i.is_dropship = true
  OR i.item_flow_type = 'dropship'
  OR LOWER(TRIM(COALESCE(i.category, ''))) IN ('dropship', 'drop ship', 'dropshipped')
  OR LOWER(i.name) LIKE '%dropship%'
  OR LOWER(i.name) LIKE '%drop ship%';

COMMENT ON VIEW dropship_workflow_items IS 'Items that follow the dropship workflow (separate from standard Stock Intelligence)';

-- ============================================================================
-- PHASE 7: Create trigger for audit logging
-- ============================================================================

CREATE OR REPLACE FUNCTION log_stock_intel_exclusion_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Log changes to exclusion settings
  IF OLD.stock_intel_exclude IS DISTINCT FROM NEW.stock_intel_exclude
     OR OLD.item_flow_type IS DISTINCT FROM NEW.item_flow_type
     OR OLD.stock_intel_override IS DISTINCT FROM NEW.stock_intel_override THEN

    INSERT INTO stock_intel_exclusion_log (
      sku, action, previous_value, new_value, reason, changed_by
    ) VALUES (
      NEW.sku,
      CASE
        WHEN NEW.stock_intel_exclude = true THEN 'exclude'
        WHEN OLD.stock_intel_exclude = true AND NEW.stock_intel_exclude = false THEN 'include'
        WHEN OLD.item_flow_type IS DISTINCT FROM NEW.item_flow_type THEN 'flow_type_change'
        ELSE 'settings_change'
      END,
      jsonb_build_object(
        'stock_intel_exclude', OLD.stock_intel_exclude,
        'item_flow_type', OLD.item_flow_type,
        'stock_intel_override', OLD.stock_intel_override
      ),
      jsonb_build_object(
        'stock_intel_exclude', NEW.stock_intel_exclude,
        'item_flow_type', NEW.item_flow_type,
        'stock_intel_override', NEW.stock_intel_override
      ),
      NEW.stock_intel_exclusion_reason,
      COALESCE(current_setting('app.current_user', true), 'system')
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_stock_intel_exclusion ON inventory_items;
CREATE TRIGGER trg_log_stock_intel_exclusion
  AFTER UPDATE ON inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION log_stock_intel_exclusion_change();

-- ============================================================================
-- PHASE 8: Create indexes for efficient filtering
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_inventory_items_stock_intel_exclude
ON inventory_items (stock_intel_exclude)
WHERE stock_intel_exclude = true;

CREATE INDEX IF NOT EXISTS idx_inventory_items_item_flow_type
ON inventory_items (item_flow_type);

CREATE INDEX IF NOT EXISTS idx_inventory_items_stock_intel_full
ON inventory_items (status, is_dropship, item_flow_type, stock_intel_exclude, stock_intel_override);

-- ============================================================================
-- PHASE 9: Populate item_flow_type for existing dropship items
-- ============================================================================

UPDATE inventory_items
SET item_flow_type = 'dropship'
WHERE item_flow_type = 'standard'
  AND (
    is_dropship = true
    OR LOWER(TRIM(COALESCE(category, ''))) IN ('dropship', 'drop ship', 'dropshipped', 'drop shipped')
    OR LOWER(name) LIKE '%dropship%'
    OR LOWER(name) LIKE '%drop ship%'
  );

-- ============================================================================
-- PHASE 10: Verification
-- ============================================================================

DO $$
DECLARE
  v_total INTEGER;
  v_stock_intel INTEGER;
  v_dropship INTEGER;
  v_manually_excluded INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM inventory_items;
  SELECT COUNT(*) INTO v_stock_intel FROM stock_intelligence_items;
  SELECT COUNT(*) INTO v_dropship FROM dropship_workflow_items;
  SELECT COUNT(*) INTO v_manually_excluded FROM inventory_items WHERE stock_intel_exclude = true;

  RAISE NOTICE 'Migration 103 completed successfully!';
  RAISE NOTICE 'Total inventory items: %', v_total;
  RAISE NOTICE 'Items in Stock Intelligence: %', v_stock_intel;
  RAISE NOTICE 'Items in Dropship Workflow: %', v_dropship;
  RAISE NOTICE 'Manually excluded items: %', v_manually_excluded;
END $$;
