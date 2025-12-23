-- Migration: 121_ingredient_compliance_system.sql
-- Description: Ingredient-level compliance tracking linking BOM components to SDS and state restrictions
-- Purpose: Enable dual-path compliance (ingredient composition + artwork labeling)
-- Date: 2025-12-23

-- ============================================================================
-- PHASE 1: INGREDIENT COMPLIANCE STATUS TABLE
-- ============================================================================
-- Tracks compliance status of each ingredient (BOM component SKU) per state

CREATE TABLE IF NOT EXISTS ingredient_compliance_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ingredient identification
  ingredient_sku TEXT NOT NULL,              -- SKU of the ingredient from inventory
  ingredient_name TEXT,                      -- Name for display
  cas_number TEXT,                           -- Chemical Abstracts Service number

  -- State-specific compliance
  state_code TEXT NOT NULL,                  -- Two-letter state code
  compliance_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (compliance_status IN (
      'compliant',        -- Meets all requirements for this state
      'restricted',       -- Allowed with restrictions
      'prohibited',       -- Not allowed in this state
      'conditional',      -- Allowed under specific conditions
      'pending_review',   -- Needs compliance review
      'unknown'           -- Status not yet determined
    )),

  -- Restriction details
  restriction_type TEXT,                     -- 'banned', 'limited_use', 'special_permit', 'concentration_limit'
  restriction_details TEXT,                  -- Human-readable restriction explanation
  max_concentration DECIMAL(10,4),           -- Max allowed concentration (percentage or ppm)
  concentration_unit TEXT DEFAULT 'percent'  -- 'percent', 'ppm', 'ppb'
    CHECK (concentration_unit IN ('percent', 'ppm', 'ppb')),

  -- Regulatory reference
  regulation_code TEXT,                      -- Legal citation (e.g., "CCR Title 3, Section 2303")
  regulation_source_id UUID REFERENCES state_regulatory_sources(id),
  effective_date DATE,                       -- When restriction became effective
  expiration_date DATE,                      -- If restriction is temporary

  -- SDS linkage
  sds_document_id UUID REFERENCES compliance_documents(id),
  sds_required BOOLEAN DEFAULT TRUE,
  sds_status TEXT DEFAULT 'missing'
    CHECK (sds_status IN ('current', 'expired', 'missing', 'pending')),

  -- Review tracking
  last_reviewed_at TIMESTAMPTZ,
  last_reviewed_by TEXT,
  review_notes TEXT,
  next_review_date DATE,

  -- Metadata
  notes TEXT,
  custom_fields JSONB DEFAULT '{}',

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,

  -- Unique per ingredient per state
  CONSTRAINT unique_ingredient_state UNIQUE (ingredient_sku, state_code)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ingredient_compliance_sku ON ingredient_compliance_status(ingredient_sku);
CREATE INDEX IF NOT EXISTS idx_ingredient_compliance_state ON ingredient_compliance_status(state_code);
CREATE INDEX IF NOT EXISTS idx_ingredient_compliance_status ON ingredient_compliance_status(compliance_status);
CREATE INDEX IF NOT EXISTS idx_ingredient_compliance_cas ON ingredient_compliance_status(cas_number);
CREATE INDEX IF NOT EXISTS idx_ingredient_compliance_restricted ON ingredient_compliance_status(compliance_status)
  WHERE compliance_status IN ('restricted', 'prohibited', 'conditional');

-- ============================================================================
-- PHASE 2: INGREDIENT SDS DOCUMENTS TABLE
-- ============================================================================
-- Links ingredient SKUs to their Safety Data Sheets

CREATE TABLE IF NOT EXISTS ingredient_sds_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ingredient identification
  ingredient_sku TEXT NOT NULL,
  ingredient_name TEXT,
  cas_number TEXT,

  -- SDS document reference
  compliance_document_id UUID REFERENCES compliance_documents(id) ON DELETE SET NULL,

  -- Alternative SDS storage (for external SDS not in compliance_documents)
  sds_file_url TEXT,
  sds_file_path TEXT,
  sds_source TEXT,                           -- 'uploaded', 'scraped', 'api', 'manual_entry'
  sds_source_url TEXT,                       -- Original source URL if scraped

  -- Manufacturer/Supplier info
  manufacturer_name TEXT,
  supplier_name TEXT,
  supplier_sku TEXT,                         -- Supplier's product code

  -- SDS metadata
  sds_revision_date DATE,
  sds_expiration_date DATE,
  sds_language TEXT DEFAULT 'en',
  sds_format TEXT DEFAULT 'ghs'              -- 'ghs', 'osha', 'ansi', 'other'
    CHECK (sds_format IN ('ghs', 'osha', 'ansi', 'other')),

  -- GHS hazard classification (extracted from SDS)
  ghs_hazard_codes TEXT[],                   -- H-codes (e.g., 'H302', 'H315')
  ghs_precautionary_codes TEXT[],            -- P-codes (e.g., 'P264', 'P280')
  signal_word TEXT,                          -- 'Danger', 'Warning', or null
  hazard_statements TEXT[],                  -- Human-readable hazard statements

  -- Physical/chemical properties (from SDS Section 9)
  physical_state TEXT,                       -- 'solid', 'liquid', 'gas'
  appearance TEXT,
  odor TEXT,
  ph DECIMAL(4,2),
  flash_point DECIMAL(6,2),
  flash_point_unit TEXT DEFAULT 'C'
    CHECK (flash_point_unit IN ('C', 'F')),

  -- Extracted content
  extracted_ingredients JSONB,               -- Parsed ingredient list with concentrations
  extracted_hazards JSONB,                   -- Structured hazard information
  full_extracted_text TEXT,                  -- Complete OCR/AI extracted text
  extraction_method TEXT,                    -- 'ocr', 'ai', 'manual', 'api'
  extraction_date TIMESTAMPTZ,

  -- Status
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'superseded', 'archived', 'pending_review')),
  is_primary BOOLEAN DEFAULT TRUE,           -- Primary SDS for this ingredient

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,

  -- Note: Unique constraint for primary SDS created as partial index below
  CONSTRAINT ingredient_sds_check CHECK (status IS NOT NULL)
);

-- Partial unique index for primary SDS per ingredient
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_primary_sds
  ON ingredient_sds_documents(ingredient_sku)
  WHERE is_primary = TRUE;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ingredient_sds_sku ON ingredient_sds_documents(ingredient_sku);
CREATE INDEX IF NOT EXISTS idx_ingredient_sds_cas ON ingredient_sds_documents(cas_number);
CREATE INDEX IF NOT EXISTS idx_ingredient_sds_status ON ingredient_sds_documents(status);
CREATE INDEX IF NOT EXISTS idx_ingredient_sds_expiration ON ingredient_sds_documents(sds_expiration_date)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_ingredient_sds_hazards ON ingredient_sds_documents USING GIN(ghs_hazard_codes);
CREATE INDEX IF NOT EXISTS idx_ingredient_sds_manufacturer ON ingredient_sds_documents(manufacturer_name);

-- ============================================================================
-- PHASE 3: BOM INGREDIENT COMPLIANCE VIEW
-- ============================================================================
-- Aggregates compliance status for all ingredients in a BOM

CREATE OR REPLACE VIEW bom_ingredient_compliance AS
WITH bom_components AS (
  SELECT
    b.id AS bom_id,
    b.finished_sku,
    b.name AS bom_name,
    jsonb_array_elements(b.components) AS component
  FROM boms b
  WHERE b.components IS NOT NULL AND jsonb_array_length(b.components) > 0
),
component_expanded AS (
  SELECT
    bc.bom_id,
    bc.finished_sku,
    bc.bom_name,
    bc.component->>'sku' AS ingredient_sku,
    bc.component->>'name' AS ingredient_name,
    (bc.component->>'quantity')::DECIMAL AS quantity
  FROM bom_components bc
),
compliance_joined AS (
  SELECT
    ce.bom_id,
    ce.finished_sku,
    ce.bom_name,
    ce.ingredient_sku,
    ce.ingredient_name,
    ce.quantity,
    ics.state_code,
    ics.compliance_status,
    ics.restriction_type,
    ics.restriction_details,
    isd.sds_revision_date,
    isd.sds_expiration_date,
    isd.status AS sds_status,
    isd.ghs_hazard_codes,
    isd.signal_word
  FROM component_expanded ce
  LEFT JOIN ingredient_compliance_status ics ON ce.ingredient_sku = ics.ingredient_sku
  LEFT JOIN ingredient_sds_documents isd ON ce.ingredient_sku = isd.ingredient_sku AND isd.is_primary = TRUE
)
SELECT
  bom_id,
  finished_sku,
  bom_name,
  ingredient_sku,
  ingredient_name,
  quantity,
  state_code,
  COALESCE(compliance_status, 'unknown') AS compliance_status,
  restriction_type,
  restriction_details,
  sds_revision_date,
  sds_expiration_date,
  sds_status,
  ghs_hazard_codes,
  signal_word,
  CASE
    WHEN sds_status IS NULL OR sds_status = 'missing' THEN TRUE
    ELSE FALSE
  END AS sds_missing,
  CASE
    WHEN sds_expiration_date < CURRENT_DATE THEN TRUE
    ELSE FALSE
  END AS sds_expired
FROM compliance_joined;

-- ============================================================================
-- PHASE 4: BOM COMPLIANCE SUMMARY FUNCTION
-- ============================================================================
-- Returns overall compliance status for a BOM across specified states

CREATE OR REPLACE FUNCTION get_bom_ingredient_compliance_summary(
  p_bom_id UUID,
  p_state_codes TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  state_code TEXT,
  total_ingredients INTEGER,
  compliant_count INTEGER,
  restricted_count INTEGER,
  prohibited_count INTEGER,
  unknown_count INTEGER,
  sds_missing_count INTEGER,
  sds_expired_count INTEGER,
  overall_status TEXT,
  blocking_ingredients JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH bom_data AS (
    SELECT * FROM bom_ingredient_compliance
    WHERE bom_id = p_bom_id
    AND (p_state_codes IS NULL OR state_code = ANY(p_state_codes))
  ),
  state_summary AS (
    SELECT
      bd.state_code,
      COUNT(DISTINCT bd.ingredient_sku)::INTEGER AS total_ingredients,
      COUNT(DISTINCT CASE WHEN bd.compliance_status = 'compliant' THEN bd.ingredient_sku END)::INTEGER AS compliant_count,
      COUNT(DISTINCT CASE WHEN bd.compliance_status = 'restricted' THEN bd.ingredient_sku END)::INTEGER AS restricted_count,
      COUNT(DISTINCT CASE WHEN bd.compliance_status = 'prohibited' THEN bd.ingredient_sku END)::INTEGER AS prohibited_count,
      COUNT(DISTINCT CASE WHEN bd.compliance_status = 'unknown' THEN bd.ingredient_sku END)::INTEGER AS unknown_count,
      COUNT(DISTINCT CASE WHEN bd.sds_missing THEN bd.ingredient_sku END)::INTEGER AS sds_missing_count,
      COUNT(DISTINCT CASE WHEN bd.sds_expired THEN bd.ingredient_sku END)::INTEGER AS sds_expired_count,
      jsonb_agg(DISTINCT jsonb_build_object(
        'sku', bd.ingredient_sku,
        'name', bd.ingredient_name,
        'status', bd.compliance_status,
        'restriction', bd.restriction_details
      )) FILTER (WHERE bd.compliance_status IN ('prohibited', 'restricted')) AS blocking_ingredients
    FROM bom_data bd
    GROUP BY bd.state_code
  )
  SELECT
    ss.state_code,
    ss.total_ingredients,
    ss.compliant_count,
    ss.restricted_count,
    ss.prohibited_count,
    ss.unknown_count,
    ss.sds_missing_count,
    ss.sds_expired_count,
    CASE
      WHEN ss.prohibited_count > 0 THEN 'non_compliant'
      WHEN ss.restricted_count > 0 THEN 'needs_attention'
      WHEN ss.unknown_count > 0 OR ss.sds_missing_count > 0 THEN 'pending_review'
      ELSE 'compliant'
    END AS overall_status,
    COALESCE(ss.blocking_ingredients, '[]'::JSONB)
  FROM state_summary ss;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- PHASE 5: ARTWORK INGREDIENT EXTRACTION TABLE
-- ============================================================================
-- Stores ingredients extracted from artwork/labels for comparison

CREATE TABLE IF NOT EXISTS artwork_extracted_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source reference
  bom_id UUID REFERENCES boms(id) ON DELETE CASCADE,
  artwork_asset_id UUID,                     -- Reference to artwork_assets if normalized
  compliance_document_id UUID REFERENCES compliance_documents(id), -- If from label doc

  -- Extraction source
  source_type TEXT NOT NULL DEFAULT 'artwork'
    CHECK (source_type IN ('artwork', 'label', 'product_sheet', 'manual')),
  source_file_url TEXT,

  -- Extracted ingredient data
  raw_ingredient_list TEXT,                  -- Raw text as extracted
  parsed_ingredients JSONB NOT NULL DEFAULT '[]', -- Structured: [{name, percentage, cas}]
  extraction_confidence DECIMAL(3,2),        -- AI confidence score 0-1

  -- Extraction metadata
  extraction_method TEXT NOT NULL            -- 'ocr', 'ai', 'manual'
    CHECK (extraction_method IN ('ocr', 'ai', 'manual', 'hybrid')),
  extraction_date TIMESTAMPTZ DEFAULT NOW(),
  extracted_by TEXT,

  -- Verification
  is_verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  verified_by TEXT,
  verification_notes TEXT,

  -- Discrepancy tracking (vs BOM components)
  has_discrepancy BOOLEAN DEFAULT FALSE,
  discrepancy_details JSONB,                 -- Details of mismatches found
  discrepancy_severity TEXT
    CHECK (discrepancy_severity IS NULL OR discrepancy_severity IN ('critical', 'high', 'medium', 'low')),

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_artwork_ingredients_bom ON artwork_extracted_ingredients(bom_id);
CREATE INDEX IF NOT EXISTS idx_artwork_ingredients_discrepancy ON artwork_extracted_ingredients(has_discrepancy)
  WHERE has_discrepancy = TRUE;
CREATE INDEX IF NOT EXISTS idx_artwork_ingredients_verified ON artwork_extracted_ingredients(is_verified);

-- ============================================================================
-- PHASE 6: REGULATION SYNC SCHEDULE TABLE
-- ============================================================================
-- Configures automated regulation scraping schedule

CREATE TABLE IF NOT EXISTS regulation_sync_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source reference
  regulatory_source_id UUID REFERENCES state_regulatory_sources(id) ON DELETE CASCADE,
  state_code TEXT NOT NULL,

  -- Schedule configuration
  sync_frequency TEXT NOT NULL DEFAULT 'weekly'
    CHECK (sync_frequency IN ('hourly', 'daily', 'weekly', 'biweekly', 'monthly', 'quarterly')),
  cron_expression TEXT,                      -- Custom cron if needed
  next_scheduled_run TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT
    CHECK (last_run_status IS NULL OR last_run_status IN ('success', 'partial', 'failed', 'skipped')),
  last_run_duration_ms INTEGER,

  -- Sync configuration
  sync_type TEXT NOT NULL DEFAULT 'incremental'
    CHECK (sync_type IN ('full', 'incremental', 'differential')),
  priority INTEGER DEFAULT 5,                -- 1-10, higher = more important

  -- Error handling
  consecutive_failures INTEGER DEFAULT 0,
  last_error_message TEXT,
  retry_count INTEGER DEFAULT 3,
  backoff_minutes INTEGER DEFAULT 60,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_paused BOOLEAN DEFAULT FALSE,
  pause_reason TEXT,

  -- Notifications
  notify_on_change BOOLEAN DEFAULT TRUE,
  notify_on_failure BOOLEAN DEFAULT TRUE,
  notification_emails TEXT[],

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,

  CONSTRAINT unique_source_schedule UNIQUE (regulatory_source_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reg_sync_next_run ON regulation_sync_schedule(next_scheduled_run)
  WHERE is_active = TRUE AND is_paused = FALSE;
CREATE INDEX IF NOT EXISTS idx_reg_sync_state ON regulation_sync_schedule(state_code);
CREATE INDEX IF NOT EXISTS idx_reg_sync_status ON regulation_sync_schedule(last_run_status);

-- ============================================================================
-- PHASE 7: COMPLIANCE TASK QUEUE INTEGRATION
-- ============================================================================
-- Add new action types for compliance tasks in pending_actions

-- Extend action_type enum if it exists, or add check constraint
DO $$
BEGIN
  -- Check if pending_action_type enum exists and add new values
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pending_action_type') THEN
    -- Add new compliance-related action types
    ALTER TYPE pending_action_type ADD VALUE IF NOT EXISTS 'sds_review';
    ALTER TYPE pending_action_type ADD VALUE IF NOT EXISTS 'ingredient_flagged';
    ALTER TYPE pending_action_type ADD VALUE IF NOT EXISTS 'regulation_update';
    ALTER TYPE pending_action_type ADD VALUE IF NOT EXISTS 'artwork_discrepancy';
    ALTER TYPE pending_action_type ADD VALUE IF NOT EXISTS 'compliance_expiring';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Enum doesn't exist or already has values, continue
  NULL;
END $$;

-- ============================================================================
-- PHASE 8: EVENT TRIGGERS FOR COMPLIANCE
-- ============================================================================

-- First, update the event_triggers check constraint to allow new compliance event types
ALTER TABLE event_triggers DROP CONSTRAINT IF EXISTS event_triggers_event_type_check;

ALTER TABLE event_triggers ADD CONSTRAINT event_triggers_event_type_check CHECK (
  event_type = ANY (ARRAY[
    'email.received'::text, 'email.processed'::text,
    'stock.low'::text, 'stock.critical'::text, 'stock.out'::text,
    'po.created'::text, 'po.sent'::text, 'po.overdue'::text, 'po.received'::text, 'po.tracking_updated'::text,
    'compliance.alert'::text, 'compliance.expiring'::text,
    'compliance.sds_expiring'::text, 'compliance.ingredient_flagged'::text, 'compliance.regulation_changed'::text,
    'vendor.issue'::text,
    'schedule.cron'::text, 'workflow.step'::text, 'agent.completed'::text, 'manual'::text
  ])
);

-- Add comment documenting the new event types
COMMENT ON CONSTRAINT event_triggers_event_type_check ON event_triggers IS
  'Valid event types for triggering agents. Includes ingredient compliance events (sds_expiring, ingredient_flagged, regulation_changed)';

-- ============================================================================
-- PHASE 9: UPDATE TRIGGER FOR TIMESTAMPS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_ingredient_compliance_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ingredient_compliance_updated
  BEFORE UPDATE ON ingredient_compliance_status
  FOR EACH ROW
  EXECUTE FUNCTION update_ingredient_compliance_timestamp();

CREATE TRIGGER trg_ingredient_sds_updated
  BEFORE UPDATE ON ingredient_sds_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_ingredient_compliance_timestamp();

CREATE TRIGGER trg_artwork_ingredients_updated
  BEFORE UPDATE ON artwork_extracted_ingredients
  FOR EACH ROW
  EXECUTE FUNCTION update_ingredient_compliance_timestamp();

CREATE TRIGGER trg_regulation_sync_updated
  BEFORE UPDATE ON regulation_sync_schedule
  FOR EACH ROW
  EXECUTE FUNCTION update_ingredient_compliance_timestamp();

-- ============================================================================
-- PHASE 10: RLS POLICIES
-- ============================================================================

ALTER TABLE ingredient_compliance_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_sds_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE artwork_extracted_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulation_sync_schedule ENABLE ROW LEVEL SECURITY;

-- Permissive read access for authenticated users
CREATE POLICY "ingredient_compliance_read" ON ingredient_compliance_status
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ingredient_sds_read" ON ingredient_sds_documents
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "artwork_ingredients_read" ON artwork_extracted_ingredients
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "regulation_sync_read" ON regulation_sync_schedule
  FOR SELECT TO authenticated USING (true);

-- Write access for authenticated users
CREATE POLICY "ingredient_compliance_write" ON ingredient_compliance_status
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ingredient_sds_write" ON ingredient_sds_documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "artwork_ingredients_write" ON artwork_extracted_ingredients
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "regulation_sync_write" ON regulation_sync_schedule
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon read access for public views
CREATE POLICY "ingredient_compliance_anon_read" ON ingredient_compliance_status
  FOR SELECT TO anon USING (true);
CREATE POLICY "ingredient_sds_anon_read" ON ingredient_sds_documents
  FOR SELECT TO anon USING (true);

-- ============================================================================
-- PHASE 11: HELPFUL COMMENTS
-- ============================================================================

COMMENT ON TABLE ingredient_compliance_status IS 'Tracks compliance status of each ingredient SKU per state';
COMMENT ON TABLE ingredient_sds_documents IS 'Links ingredient SKUs to Safety Data Sheets with extracted hazard data';
COMMENT ON TABLE artwork_extracted_ingredients IS 'Stores ingredients extracted from artwork/labels for BOM comparison';
COMMENT ON TABLE regulation_sync_schedule IS 'Configures automated regulation scraping schedule per source';

COMMENT ON VIEW bom_ingredient_compliance IS 'Aggregates compliance status for all ingredients in each BOM';

COMMENT ON FUNCTION get_bom_ingredient_compliance_summary IS
  'Returns overall compliance summary for a BOM across specified states';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 121 completed successfully!';
  RAISE NOTICE '📊 Tables created:';
  RAISE NOTICE '  - ingredient_compliance_status (per-ingredient, per-state compliance)';
  RAISE NOTICE '  - ingredient_sds_documents (SDS linkage with hazard extraction)';
  RAISE NOTICE '  - artwork_extracted_ingredients (label ingredient comparison)';
  RAISE NOTICE '  - regulation_sync_schedule (automated scraping config)';
  RAISE NOTICE '🔍 Views created:';
  RAISE NOTICE '  - bom_ingredient_compliance (aggregated view)';
  RAISE NOTICE '🔧 Functions created:';
  RAISE NOTICE '  - get_bom_ingredient_compliance_summary()';
  RAISE NOTICE '🎯 Ready for dual-path compliance checking!';
END $$;
