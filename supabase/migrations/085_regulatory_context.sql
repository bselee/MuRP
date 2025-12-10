-- Migration: 081_regulatory_context.sql
-- Description: Add flexible regulatory taxonomy for multi-industry compliance
-- Part of: MuRP 2.0 Compliance Atlas System
-- Date: 2025-12-09

-- ============================================================================
-- EXTEND STATE_REGULATIONS FOR JURISDICTION TYPES
-- ============================================================================

-- Add jurisdiction_type to distinguish between different regulatory bodies
ALTER TABLE state_regulations
ADD COLUMN IF NOT EXISTS jurisdiction_type text CHECK (jurisdiction_type IN (
  'agriculture',
  'food_safety',
  'dietary_supplements',
  'cosmetics',
  'packaging',
  'environmental',
  'pesticides',
  'fertilizers',
  'general'
));

-- Set default for existing records
UPDATE state_regulations
SET jurisdiction_type = 'general'
WHERE jurisdiction_type IS NULL;

-- Add index for jurisdiction filtering
CREATE INDEX IF NOT EXISTS idx_state_regulations_jurisdiction ON state_regulations(jurisdiction_type);

-- ============================================================================
-- EXTEND BOMS FOR REGULATORY CATEGORIZATION
-- ============================================================================

-- Add regulatory_category to BOMs for product-specific compliance
ALTER TABLE boms
ADD COLUMN IF NOT EXISTS regulatory_category text CHECK (regulatory_category IN (
  'soil_amendment',
  'fertilizer_organic',
  'fertilizer_synthetic',
  'pesticide',
  'dietary_supplement',
  'food_product',
  'cosmetic',
  'packaging_material',
  'raw_material',
  'general'
));

-- Add target_states for BOM-level compliance tracking
ALTER TABLE boms
ADD COLUMN IF NOT EXISTS target_states text[];

-- Add compliance_notes for BOM-specific requirements
ALTER TABLE boms
ADD COLUMN IF NOT EXISTS compliance_notes text;

-- Add index for category filtering
CREATE INDEX IF NOT EXISTS idx_boms_regulatory_category ON boms(regulatory_category);

-- ============================================================================
-- COMPLIANCE MAPPING TABLE
-- ============================================================================

-- Create a mapping table for jurisdiction type to product category
CREATE TABLE IF NOT EXISTS regulatory_jurisdiction_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  product_category text NOT NULL,
  jurisdiction_type text NOT NULL,
  applicable_states text[],

  -- Requirements
  registration_required boolean DEFAULT false,
  label_requirements jsonb,
  testing_requirements jsonb,
  renewal_frequency_months integer,

  -- Agency information
  agency_name text,
  agency_url text,
  contact_info jsonb,

  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(product_category, jurisdiction_type)
);

CREATE INDEX idx_regulatory_jurisdiction_category ON regulatory_jurisdiction_map(product_category);
CREATE INDEX idx_regulatory_jurisdiction_type ON regulatory_jurisdiction_map(jurisdiction_type);

-- Insert common mappings
INSERT INTO regulatory_jurisdiction_map (
  product_category,
  jurisdiction_type,
  registration_required,
  label_requirements,
  agency_name
) VALUES
  ('soil_amendment', 'agriculture', true,
   '{"guaranteed_analysis": true, "net_weight": true, "manufacturer_info": true}'::jsonb,
   'Department of Agriculture'),
  ('fertilizer_organic', 'agriculture', true,
   '{"guaranteed_analysis": true, "omri_certification": true, "net_weight": true}'::jsonb,
   'Department of Agriculture'),
  ('dietary_supplement', 'food_safety', true,
   '{"supplement_facts": true, "disclaimers": true, "gmp_compliance": true}'::jsonb,
   'Department of Health'),
  ('food_product', 'food_safety', true,
   '{"nutrition_facts": true, "allergen_warnings": true, "expiration_date": true}'::jsonb,
   'Department of Health')
ON CONFLICT (product_category, jurisdiction_type) DO NOTHING;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get applicable regulations for a BOM
CREATE OR REPLACE FUNCTION get_applicable_regulations(
  p_bom_id uuid
)
RETURNS TABLE (
  regulation_id uuid,
  state text,
  jurisdiction_type text,
  category text,
  rule_title text,
  rule_summary text,
  source_url text,
  last_updated timestamptz
) AS $$
DECLARE
  v_bom record;
BEGIN
  -- Get BOM details
  SELECT
    regulatory_category,
    target_states
  INTO v_bom
  FROM boms
  WHERE id = p_bom_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOM not found: %', p_bom_id;
  END IF;

  -- Get matching regulations
  RETURN QUERY
  SELECT
    sr.id as regulation_id,
    sr.state,
    sr.jurisdiction_type,
    sr.category,
    sr.rule_title,
    sr.rule_summary,
    sr.source_url,
    sr.last_updated_date as last_updated
  FROM state_regulations sr
  JOIN regulatory_jurisdiction_map rjm
    ON rjm.jurisdiction_type = sr.jurisdiction_type
    AND rjm.product_category = v_bom.regulatory_category
  WHERE
    -- Match target states
    sr.state = ANY(v_bom.target_states)
    -- Only active regulations
    AND sr.status = 'active'
  ORDER BY sr.state, sr.category;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check BOM compliance status
CREATE OR REPLACE FUNCTION check_bom_compliance_status(
  p_bom_id uuid
)
RETURNS TABLE (
  state text,
  jurisdiction_type text,
  regulations_count int,
  last_check_date timestamptz,
  compliance_status text,
  violations_count int,
  warnings_count int
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cc.states_checked[1] as state,
    'agriculture'::text as jurisdiction_type,
    (
      SELECT COUNT(*)::int
      FROM get_applicable_regulations(p_bom_id) gar
      WHERE gar.state = cc.states_checked[1]
    ) as regulations_count,
    cc.check_date as last_check_date,
    cc.overall_status as compliance_status,
    jsonb_array_length(cc.violations) as violations_count,
    jsonb_array_length(cc.warnings) as warnings_count
  FROM compliance_checks cc
  WHERE cc.label_id::text = p_bom_id::text
  ORDER BY cc.check_date DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get BOMs needing compliance review
CREATE OR REPLACE FUNCTION get_boms_needing_compliance_review()
RETURNS TABLE (
  bom_id uuid,
  bom_name text,
  regulatory_category text,
  target_states text[],
  days_since_last_check int,
  has_active_violations boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id as bom_id,
    b.name as bom_name,
    b.regulatory_category,
    b.target_states,
    COALESCE(
      EXTRACT(DAY FROM (now() - MAX(cc.check_date)))::int,
      999
    ) as days_since_last_check,
    EXISTS(
      SELECT 1
      FROM compliance_checks cc2
      WHERE cc2.label_id::text = b.id::text
        AND cc2.overall_status = 'fail'
      ORDER BY cc2.check_date DESC
      LIMIT 1
    ) as has_active_violations
  FROM boms b
  LEFT JOIN compliance_checks cc ON cc.label_id::text = b.id::text
  WHERE
    b.regulatory_category IS NOT NULL
    AND b.target_states IS NOT NULL
    AND array_length(b.target_states, 1) > 0
  GROUP BY b.id, b.name, b.regulatory_category, b.target_states
  HAVING
    -- No check in last 90 days OR has active violations
    COALESCE(EXTRACT(DAY FROM (now() - MAX(cc.check_date)))::int, 999) > 90
    OR EXISTS(
      SELECT 1
      FROM compliance_checks cc2
      WHERE cc2.label_id::text = b.id::text
        AND cc2.overall_status = 'fail'
      ORDER BY cc2.check_date DESC
      LIMIT 1
    )
  ORDER BY has_active_violations DESC, days_since_last_check DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Compliance overview by state
CREATE OR REPLACE VIEW compliance_overview_by_state AS
SELECT
  unnest(b.target_states) as state,
  b.regulatory_category,
  COUNT(b.id) as total_boms,
  COUNT(CASE WHEN EXISTS(
    SELECT 1 FROM compliance_checks cc
    WHERE cc.label_id::text = b.id::text
      AND cc.overall_status = 'pass'
    ORDER BY cc.check_date DESC
    LIMIT 1
  ) THEN 1 END) as compliant_boms,
  COUNT(CASE WHEN EXISTS(
    SELECT 1 FROM compliance_checks cc
    WHERE cc.label_id::text = b.id::text
      AND cc.overall_status = 'fail'
    ORDER BY cc.check_date DESC
    LIMIT 1
  ) THEN 1 END) as non_compliant_boms,
  COUNT(CASE WHEN NOT EXISTS(
    SELECT 1 FROM compliance_checks cc
    WHERE cc.label_id::text = b.id::text
  ) THEN 1 END) as unchecked_boms
FROM boms b
WHERE b.regulatory_category IS NOT NULL
  AND b.target_states IS NOT NULL
GROUP BY unnest(b.target_states), b.regulatory_category;

COMMENT ON VIEW compliance_overview_by_state IS
'Overview of compliance status by state and product category for Compliance Atlas';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN state_regulations.jurisdiction_type IS
'Type of regulatory body: agriculture, food_safety, dietary_supplements, cosmetics, etc.';

COMMENT ON COLUMN boms.regulatory_category IS
'Product category for regulatory compliance (soil_amendment, fertilizer, dietary_supplement, etc.)';

COMMENT ON COLUMN boms.target_states IS
'Array of state codes where this product will be sold, used for compliance checking';

COMMENT ON TABLE regulatory_jurisdiction_map IS
'Maps product categories to jurisdiction types and requirements across states';

COMMENT ON FUNCTION get_applicable_regulations IS
'Returns all applicable regulations for a BOM based on its category and target states';

COMMENT ON FUNCTION check_bom_compliance_status IS
'Returns current compliance status for a BOM across target states';

COMMENT ON FUNCTION get_boms_needing_compliance_review IS
'Returns BOMs that need compliance review (no check in 90+ days or has violations)';
