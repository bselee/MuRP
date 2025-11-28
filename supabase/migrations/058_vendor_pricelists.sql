-- Migration: 058_vendor_pricelists.sql
-- Description: Add vendor pricelist management with versioning, extraction, and change tracking
-- Date: November 28, 2025

-- =====================================================
-- VENDOR PRICELIST MANAGEMENT SYSTEM
-- =====================================================

begin;

-- Create enums for pricelist system
CREATE TYPE pricelist_status AS ENUM ('pending', 'extracted', 'error');
CREATE TYPE pricelist_source AS ENUM ('upload', 'email', 'google_docs', 'api');

-- Create vendor_pricelists table
CREATE TABLE vendor_pricelists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  items JSONB DEFAULT '[]'::jsonb,
  is_current BOOLEAN DEFAULT TRUE,
  archived_at TIMESTAMPTZ,
  source_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT,

  -- Ensure only one current pricelist per vendor
  UNIQUE(vendor_id, is_current) DEFERRABLE INITIALLY DEFERRED
);

-- Create indexes for vendor_pricelists
CREATE INDEX idx_vendor_pricelists_vendor ON vendor_pricelists(vendor_id);
CREATE INDEX idx_vendor_pricelists_current ON vendor_pricelists(vendor_id, is_current) WHERE is_current = TRUE;
CREATE INDEX idx_vendor_pricelists_version ON vendor_pricelists(vendor_id, version DESC);

-- Enhance existing vendor_pricelists table
ALTER TABLE vendor_pricelists
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS source pricelist_source DEFAULT 'upload',
ADD COLUMN IF NOT EXISTS extraction_status pricelist_status DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC(3,2),
ADD COLUMN IF NOT EXISTS extraction_error TEXT,
ADD COLUMN IF NOT EXISTS extracted_items_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS changes_summary JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS previous_version_id UUID REFERENCES vendor_pricelists(id);

-- Update existing records to use new enum
UPDATE vendor_pricelists
SET extraction_status = 'extracted'::pricelist_status
WHERE extraction_status IS NOT NULL AND extraction_status != 'pending' AND extraction_status != 'error';

UPDATE vendor_pricelists
SET extraction_status = 'pending'::pricelist_status
WHERE extraction_status NOT IN ('pending', 'extracted', 'error');

-- Pricelist change details table
CREATE TABLE IF NOT EXISTS pricelist_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pricelist_id UUID REFERENCES vendor_pricelists(id) ON DELETE CASCADE,
  previous_pricelist_id UUID REFERENCES vendor_pricelists(id),

  -- Change details
  change_type TEXT NOT NULL, -- 'price_increase', 'price_decrease', 'new_product', 'removed_product', 'variant_change'
  sku TEXT,
  product_description TEXT,
  old_value JSONB,  -- {price, unit, moq, etc.}
  new_value JSONB,  -- {price, unit, moq, etc.}
  percentage_change NUMERIC(7,2), -- for price changes
  absolute_change NUMERIC(10,2),  -- for price changes

  -- Categorization
  category TEXT,    -- product category
  severity TEXT,    -- 'low', 'medium', 'high', 'critical'

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Main lookups
CREATE INDEX IF NOT EXISTS idx_vendor_pricelists_status ON vendor_pricelists(extraction_status);
CREATE INDEX IF NOT EXISTS idx_vendor_pricelists_source ON vendor_pricelists(source);

-- Change tracking
CREATE INDEX IF NOT EXISTS idx_pricelist_changes_pricelist ON pricelist_changes(pricelist_id);
CREATE INDEX IF NOT EXISTS idx_pricelist_changes_type ON pricelist_changes(change_type);
CREATE INDEX IF NOT EXISTS idx_pricelist_changes_severity ON pricelist_changes(severity);

-- JSONB indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_vendor_pricelists_items ON vendor_pricelists USING gin(items);
CREATE INDEX IF NOT EXISTS idx_pricelist_changes_old_value ON pricelist_changes USING gin(old_value);
CREATE INDEX IF NOT EXISTS idx_pricelist_changes_new_value ON pricelist_changes USING gin(new_value);

-- =====================================================
-- FUNCTIONS FOR PRICELIST MANAGEMENT
-- =====================================================

-- Calculate pricelist changes when new version is extracted
CREATE OR REPLACE FUNCTION calculate_pricelist_changes(new_pricelist_id UUID)
RETURNS INTEGER AS $$
DECLARE
  new_pricelist RECORD;
  old_pricelist RECORD;
  new_item RECORD;
  old_item RECORD;
  changes_count INTEGER := 0;
  price_change_threshold NUMERIC := 0.03; -- 3% threshold for alerts
BEGIN
  -- Get the new pricelist
  SELECT * INTO new_pricelist FROM vendor_pricelists WHERE id = new_pricelist_id;

  -- Find the previous version
  SELECT * INTO old_pricelist
  FROM vendor_pricelists
  WHERE vendor_id = new_pricelist.vendor_id
    AND is_current = FALSE
    AND id != new_pricelist_id
  ORDER BY version DESC
  LIMIT 1;

  -- If no previous version, just count new products
  IF old_pricelist IS NULL THEN
    -- Count new products
    FOR new_item IN SELECT * FROM jsonb_array_elements(new_pricelist.items) LOOP
      INSERT INTO pricelist_changes (
        pricelist_id,
        change_type,
        sku,
        product_description,
        new_value,
        category,
        severity
      ) VALUES (
        new_pricelist_id,
        'new_product',
        new_item->>'sku',
        new_item->>'description',
        new_item,
        new_item->>'category',
        'low'
      );
      changes_count := changes_count + 1;
    END LOOP;

    -- Update changes summary
    UPDATE vendor_pricelists
    SET changes_summary = jsonb_build_object(
      'new_products', changes_count,
      'price_changes', 0,
      'removed_products', 0,
      'total_changes', changes_count
    )
    WHERE id = new_pricelist_id;

    RETURN changes_count;
  END IF;

  -- Compare with previous version
  FOR new_item IN SELECT * FROM jsonb_array_elements(new_pricelist.items) LOOP
    -- Find matching item in old pricelist
    SELECT * INTO old_item
    FROM jsonb_array_elements(old_pricelist.items)
    WHERE value->>'sku' = new_item->>'sku';

    IF old_item IS NULL THEN
      -- New product
      INSERT INTO pricelist_changes (
        pricelist_id,
        previous_pricelist_id,
        change_type,
        sku,
        product_description,
        new_value,
        category,
        severity
      ) VALUES (
        new_pricelist_id,
        old_pricelist.id,
        'new_product',
        new_item->>'sku',
        new_item->>'description',
        new_item,
        new_item->>'category',
        'low'
      );
      changes_count := changes_count + 1;
    ELSE
      -- Check for price changes
      IF (new_item->>'price')::NUMERIC != (old_item->>'price')::NUMERIC THEN
        DECLARE
          old_price NUMERIC := (old_item->>'price')::NUMERIC;
          new_price NUMERIC := (new_item->>'price')::NUMERIC;
          pct_change NUMERIC := CASE
            WHEN old_price > 0 THEN ((new_price - old_price) / old_price) * 100
            ELSE 0
          END;
          abs_change NUMERIC := new_price - old_price;
          change_severity TEXT := CASE
            WHEN abs(pct_change) >= 20 THEN 'critical'
            WHEN abs(pct_change) >= 10 THEN 'high'
            WHEN abs(pct_change) >= 5 THEN 'medium'
            ELSE 'low'
          END;
        BEGIN
          INSERT INTO pricelist_changes (
            pricelist_id,
            previous_pricelist_id,
            change_type,
            sku,
            product_description,
            old_value,
            new_value,
            percentage_change,
            absolute_change,
            category,
            severity
          ) VALUES (
            new_pricelist_id,
            old_pricelist.id,
            CASE WHEN pct_change > 0 THEN 'price_increase' ELSE 'price_decrease' END,
            new_item->>'sku',
            new_item->>'description',
            old_item,
            new_item,
            pct_change,
            abs_change,
            new_item->>'category',
            change_severity
          );
          changes_count := changes_count + 1;
        END;
      END IF;

      -- Check for other changes (MOQ, unit, etc.)
      IF (new_item->>'moq')::INTEGER != (old_item->>'moq')::INTEGER THEN
        INSERT INTO pricelist_changes (
          pricelist_id,
          previous_pricelist_id,
          change_type,
          sku,
          product_description,
          old_value,
          new_value,
          category,
          severity
        ) VALUES (
          new_pricelist_id,
          old_pricelist.id,
          'variant_change',
          new_item->>'sku',
          new_item->>'description',
          old_item,
          new_item,
          new_item->>'category',
          'low'
        );
        changes_count := changes_count + 1;
      END IF;
    END IF;
  END LOOP;

  -- Check for removed products
  FOR old_item IN SELECT * FROM jsonb_array_elements(old_pricelist.items) LOOP
    SELECT * INTO new_item
    FROM jsonb_array_elements(new_pricelist.items)
    WHERE value->>'sku' = old_item->>'sku';

    IF new_item IS NULL THEN
      -- Product removed
      INSERT INTO pricelist_changes (
        pricelist_id,
        previous_pricelist_id,
        change_type,
        sku,
        product_description,
        old_value,
        category,
        severity
      ) VALUES (
        new_pricelist_id,
        old_pricelist.id,
        'removed_product',
        old_item->>'sku',
        old_item->>'description',
        old_item,
        old_item->>'category',
        'medium'
      );
      changes_count := changes_count + 1;
    END IF;
  END LOOP;

  -- Update changes summary
  UPDATE vendor_pricelists
  SET changes_summary = jsonb_build_object(
    'new_products', (SELECT count(*) FROM pricelist_changes WHERE pricelist_id = new_pricelist_id AND change_type = 'new_product'),
    'price_changes', (SELECT count(*) FROM pricelist_changes WHERE pricelist_id = new_pricelist_id AND change_type IN ('price_increase', 'price_decrease')),
    'removed_products', (SELECT count(*) FROM pricelist_changes WHERE pricelist_id = new_pricelist_id AND change_type = 'removed_product'),
    'variant_changes', (SELECT count(*) FROM pricelist_changes WHERE pricelist_id = new_pricelist_id AND change_type = 'variant_change'),
    'total_changes', changes_count,
    'significant_changes', (SELECT count(*) FROM pricelist_changes WHERE pricelist_id = new_pricelist_id AND severity IN ('high', 'critical'))
  )
  WHERE id = new_pricelist_id;

  RETURN changes_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Trigger to calculate changes when extraction completes
CREATE OR REPLACE FUNCTION trigger_pricelist_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Only calculate changes when extraction status changes to 'extracted'
  IF NEW.extraction_status = 'extracted' AND OLD.extraction_status != 'extracted' THEN
    PERFORM calculate_pricelist_changes(NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_pricelist_changes ON vendor_pricelists;
CREATE TRIGGER trg_calculate_pricelist_changes
  AFTER UPDATE ON vendor_pricelists
  FOR EACH ROW EXECUTE FUNCTION trigger_pricelist_changes();

-- =====================================================
-- UTILITY FUNCTIONS
-- =====================================================

-- Get current pricelist for vendor
CREATE OR REPLACE FUNCTION get_current_pricelist(vendor_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  effective_date DATE,
  items JSONB,
  extracted_items_count INTEGER,
  changes_summary JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    vp.id,
    vp.name,
    vp.effective_date,
    vp.items,
    vp.extracted_items_count,
    vp.changes_summary
  FROM vendor_pricelists vp
  WHERE vp.vendor_id = $1
    AND vp.is_current = TRUE
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Get pricelist insights for dashboard
CREATE OR REPLACE FUNCTION get_pricelist_insights(vendor_id UUID)
RETURNS TABLE (
  current_version INTEGER,
  total_versions INTEGER,
  last_updated TIMESTAMPTZ,
  total_products INTEGER,
  price_changes_last_version INTEGER,
  significant_changes INTEGER,
  avg_price_change_percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH current_pl AS (
    SELECT * FROM vendor_pricelists
    WHERE vendor_pricelists.vendor_id = $1 AND is_current = TRUE
  ),
  stats AS (
    SELECT
      COUNT(*) as total_versions,
      MAX(updated_at) as last_updated
    FROM vendor_pricelists
    WHERE vendor_pricelists.vendor_id = $1
  )
  SELECT
    current_pl.version,
    stats.total_versions,
    stats.last_updated,
    current_pl.extracted_items_count,
    (current_pl.changes_summary->>'price_changes')::INTEGER,
    (current_pl.changes_summary->>'significant_changes')::INTEGER,
    ROUND(AVG(CASE WHEN pc.percentage_change IS NOT NULL THEN abs(pc.percentage_change) END), 2)
  FROM current_pl, stats
  LEFT JOIN pricelist_changes pc ON pc.pricelist_id = current_pl.id
    AND pc.change_type IN ('price_increase', 'price_decrease')
  GROUP BY current_pl.version, stats.total_versions, stats.last_updated,
           current_pl.extracted_items_count, current_pl.changes_summary;
END;
$$ LANGUAGE plpgsql;

-- Process vendor pricelist from email/webhook data
CREATE OR REPLACE FUNCTION process_vendor_pricelist(
  p_vendor_id UUID,
  p_pricelist_data JSONB,
  p_source TEXT DEFAULT 'manual',
  p_source_message_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  version INTEGER,
  is_current BOOLEAN
) AS $$
DECLARE
  v_current_pricelist_id UUID;
  v_new_version INTEGER := 1;
  v_new_pricelist_id UUID;
  v_items_count INTEGER;
BEGIN
  -- Get current pricelist to determine version
  SELECT id, version INTO v_current_pricelist_id, v_new_version
  FROM vendor_pricelists
  WHERE vendor_id = p_vendor_id AND is_current = TRUE
  ORDER BY version DESC
  LIMIT 1;

  -- Increment version if current exists
  IF v_current_pricelist_id IS NOT NULL THEN
    v_new_version := v_new_version + 1;
  END IF;

  -- Count items
  v_items_count := jsonb_array_length(COALESCE(p_pricelist_data->'items', '[]'::jsonb));

  -- Generate name if not provided
  IF p_pricelist_data->>'name' IS NULL THEN
    p_pricelist_data := jsonb_set(
      p_pricelist_data,
      '{name}',
      to_jsonb(format('Pricelist v%d - %s', v_new_version, p_source))
    );
  END IF;

  -- Set default effective date if not provided
  IF p_pricelist_data->>'effective_date' IS NULL THEN
    p_pricelist_data := jsonb_set(
      p_pricelist_data,
      '{effective_date}',
      to_jsonb(CURRENT_DATE::text)
    );
  END IF;

  -- Archive current pricelist
  IF v_current_pricelist_id IS NOT NULL THEN
    UPDATE vendor_pricelists
    SET is_current = FALSE, archived_at = NOW()
    WHERE id = v_current_pricelist_id;
  END IF;

  -- Insert new pricelist
  INSERT INTO vendor_pricelists (
    vendor_id,
    name,
    version,
    effective_date,
    items,
    extracted_items_count,
    source,
    source_message_id,
    is_current,
    created_at,
    updated_at
  ) VALUES (
    p_vendor_id,
    p_pricelist_data->>'name',
    v_new_version,
    (p_pricelist_data->>'effective_date')::date,
    p_pricelist_data->'items',
    v_items_count,
    p_source,
    p_source_message_id,
    TRUE,
    NOW(),
    NOW()
  ) RETURNING id INTO v_new_pricelist_id;

  -- Calculate changes if we have a previous version
  IF v_current_pricelist_id IS NOT NULL THEN
    PERFORM calculate_pricelist_changes(v_new_pricelist_id);
  END IF;

  -- Return the new pricelist info
  RETURN QUERY SELECT v_new_pricelist_id, v_new_version, TRUE::BOOLEAN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add pricelist tracking columns to purchase_orders
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS pricelist_gmail_message_id TEXT,
  ADD COLUMN IF NOT EXISTS pricelist_received_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_pricelist_received
  ON public.purchase_orders(pricelist_received_at DESC NULLS LAST);

-- =====================================================
-- RLS POLICIES
-- =====================================================

ALTER TABLE vendor_pricelists ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricelist_changes ENABLE ROW LEVEL SECURITY;

-- Pricelists: Staff can read all, managers can create/update
DROP POLICY IF EXISTS "Staff can view vendor pricelists" ON vendor_pricelists;
CREATE POLICY "Staff can view vendor pricelists"
  ON vendor_pricelists FOR SELECT
  USING (auth.jwt() ->> 'role' IN ('staff', 'manager', 'admin'));

DROP POLICY IF EXISTS "Managers can manage vendor pricelists" ON vendor_pricelists;
CREATE POLICY "Managers can manage vendor pricelists"
  ON vendor_pricelists FOR ALL
  USING (auth.jwt() ->> 'role' IN ('manager', 'admin'));

-- Changes: Read-only for all authenticated users
DROP POLICY IF EXISTS "Authenticated users can view pricelist changes" ON pricelist_changes;
CREATE POLICY "Authenticated users can view pricelist changes"
  ON pricelist_changes FOR SELECT
  USING (auth.role() = 'authenticated');

-- =====================================================
-- CONFIGURATION SETTINGS
-- =====================================================

-- Add pricelist settings to app_settings
INSERT INTO app_settings (setting_key, setting_category, setting_value, display_name, description)
VALUES
  ('pricelist_config', 'general', '{
    "price_change_alert_threshold": 0.05,
    "significant_change_threshold": 0.10,
    "critical_change_threshold": 0.20,
    "auto_archive_days": 365,
    "max_file_size_mb": 50,
    "supported_formats": ["pdf", "xlsx", "csv", "google_doc"]
  }', 'Pricelist Processing Configuration', 'Pricelist processing configuration'),
  ('pricelist_notifications', 'general', '{
    "notify_on_significant_changes": true,
    "notify_managers_only": true,
    "email_summary_frequency": "weekly",
    "alert_channels": ["email", "dashboard"]
  }', 'Pricelist Change Notifications', 'Pricelist change notification settings')
ON CONFLICT (setting_key) DO NOTHING;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Add comments
COMMENT ON TABLE vendor_pricelists IS 'Vendor pricelist storage with versioning and change tracking';
COMMENT ON TABLE pricelist_changes IS 'Detailed change tracking between pricelist versions';
COMMENT ON FUNCTION calculate_pricelist_changes(UUID) IS 'Calculates and stores changes between pricelist versions';
COMMENT ON FUNCTION get_pricelist_insights(UUID) IS 'Returns dashboard insights for vendor pricelists';

commit;
