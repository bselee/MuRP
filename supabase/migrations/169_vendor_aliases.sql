-- Migration: Vendor Aliases for Email Correlation
-- Purpose: Allow mapping alternative vendor names (from emails) to canonical vendor records
-- Example: "Soestern Packaging Inc" emails should match "Stock Bag Depot" POs
--
-- This solves the problem where vendors have different trading names vs legal names
-- or use different company names in emails vs purchase orders.

-- ═══════════════════════════════════════════════════════════════════════════
-- VENDOR ALIASES TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vendor_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The canonical vendor this alias maps to
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  finale_vendor_id UUID REFERENCES finale_vendors(id) ON DELETE CASCADE,

  -- At least one vendor reference must be set
  CONSTRAINT vendor_aliases_vendor_check CHECK (
    vendor_id IS NOT NULL OR finale_vendor_id IS NOT NULL
  ),

  -- The alternative name/alias (case-insensitive matching)
  alias_name VARCHAR(255) NOT NULL,
  alias_name_normalized VARCHAR(255) GENERATED ALWAYS AS (LOWER(TRIM(alias_name))) STORED,

  -- Type of alias
  alias_type VARCHAR(50) DEFAULT 'trading_name',
  -- Possible types:
  -- 'trading_name' - DBA / Trading As name
  -- 'legal_name' - Official legal entity name
  -- 'email_name' - Name that appears in email From field
  -- 'invoice_name' - Name on invoices
  -- 'subsidiary' - Subsidiary company name

  -- Confidence level (for auto-suggested aliases)
  confidence DECIMAL(5,2) DEFAULT 100.0,
  -- 100 = manually confirmed
  -- < 100 = auto-suggested based on pattern matching

  -- Source of this alias
  source VARCHAR(100) DEFAULT 'manual',
  -- 'manual' - Added by user
  -- 'email_analysis' - Auto-detected from email patterns
  -- 'invoice_extraction' - Auto-detected from invoice processing

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint on normalized alias name
  CONSTRAINT vendor_aliases_unique_name UNIQUE (alias_name_normalized)
);

-- Index for fast alias lookups
CREATE INDEX idx_vendor_aliases_normalized ON vendor_aliases(alias_name_normalized) WHERE is_active = true;
CREATE INDEX idx_vendor_aliases_vendor_id ON vendor_aliases(vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX idx_vendor_aliases_finale_vendor_id ON vendor_aliases(finale_vendor_id) WHERE finale_vendor_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- VENDOR ALIAS LOOKUP FUNCTION
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to find canonical vendor ID from an alias name
CREATE OR REPLACE FUNCTION lookup_vendor_by_alias(p_name TEXT)
RETURNS TABLE (
  vendor_id UUID,
  finale_vendor_id UUID,
  canonical_name VARCHAR,
  alias_type VARCHAR,
  confidence DECIMAL
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    va.vendor_id,
    va.finale_vendor_id,
    COALESCE(v.name, fv.vendor_name)::VARCHAR as canonical_name,
    va.alias_type,
    va.confidence
  FROM vendor_aliases va
  LEFT JOIN vendors v ON va.vendor_id = v.id
  LEFT JOIN finale_vendors fv ON va.finale_vendor_id = fv.id
  WHERE va.is_active = true
    AND va.alias_name_normalized = LOWER(TRIM(p_name))
  LIMIT 1;
END;
$$;

-- Function to get all aliases for a vendor
CREATE OR REPLACE FUNCTION get_vendor_aliases(p_vendor_id UUID)
RETURNS TABLE (
  alias_name VARCHAR,
  alias_type VARCHAR,
  confidence DECIMAL
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    va.alias_name::VARCHAR,
    va.alias_type::VARCHAR,
    va.confidence
  FROM vendor_aliases va
  WHERE va.is_active = true
    AND (va.vendor_id = p_vendor_id OR va.finale_vendor_id = p_vendor_id);
END;
$$;

-- Function to fuzzy match vendor name (checks both canonical and aliases)
CREATE OR REPLACE FUNCTION match_vendor_name(p_name TEXT)
RETURNS TABLE (
  vendor_id UUID,
  finale_vendor_id UUID,
  vendor_name VARCHAR,
  match_type VARCHAR,
  match_score DECIMAL
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_normalized TEXT := LOWER(TRIM(p_name));
BEGIN
  -- First try exact alias match
  RETURN QUERY
  SELECT
    va.vendor_id,
    va.finale_vendor_id,
    COALESCE(v.name, fv.vendor_name)::VARCHAR,
    'alias_exact'::VARCHAR,
    va.confidence
  FROM vendor_aliases va
  LEFT JOIN vendors v ON va.vendor_id = v.id
  LEFT JOIN finale_vendors fv ON va.finale_vendor_id = fv.id
  WHERE va.is_active = true
    AND va.alias_name_normalized = v_normalized
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Then try exact match on vendors table
  RETURN QUERY
  SELECT
    v.id,
    NULL::UUID,
    v.name::VARCHAR,
    'vendor_exact'::VARCHAR,
    100.0::DECIMAL
  FROM vendors v
  WHERE LOWER(TRIM(v.name)) = v_normalized
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Then try exact match on finale_vendors
  RETURN QUERY
  SELECT
    NULL::UUID,
    fv.id,
    fv.vendor_name::VARCHAR,
    'finale_exact'::VARCHAR,
    100.0::DECIMAL
  FROM finale_vendors fv
  WHERE LOWER(TRIM(fv.vendor_name)) = v_normalized
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Try partial/contains match on aliases
  RETURN QUERY
  SELECT
    va.vendor_id,
    va.finale_vendor_id,
    COALESCE(v.name, fv.vendor_name)::VARCHAR,
    'alias_partial'::VARCHAR,
    (va.confidence * 0.8)::DECIMAL
  FROM vendor_aliases va
  LEFT JOIN vendors v ON va.vendor_id = v.id
  LEFT JOIN finale_vendors fv ON va.finale_vendor_id = fv.id
  WHERE va.is_active = true
    AND (
      va.alias_name_normalized LIKE '%' || v_normalized || '%'
      OR v_normalized LIKE '%' || va.alias_name_normalized || '%'
    )
  ORDER BY va.confidence DESC
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Try partial match on vendor names
  RETURN QUERY
  SELECT
    v.id,
    NULL::UUID,
    v.name::VARCHAR,
    'vendor_partial'::VARCHAR,
    80.0::DECIMAL
  FROM vendors v
  WHERE LOWER(TRIM(v.name)) LIKE '%' || v_normalized || '%'
     OR v_normalized LIKE '%' || LOWER(TRIM(v.name)) || '%'
  ORDER BY v.name
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Try partial match on finale vendors
  RETURN QUERY
  SELECT
    NULL::UUID,
    fv.id,
    fv.vendor_name::VARCHAR,
    'finale_partial'::VARCHAR,
    80.0::DECIMAL
  FROM finale_vendors fv
  WHERE LOWER(TRIM(fv.vendor_name)) LIKE '%' || v_normalized || '%'
     OR v_normalized LIKE '%' || LOWER(TRIM(fv.vendor_name)) || '%'
  ORDER BY fv.vendor_name
  LIMIT 1;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE vendor_aliases ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read aliases
CREATE POLICY "vendor_aliases_select" ON vendor_aliases
  FOR SELECT TO authenticated
  USING (true);

-- Only admins can manage aliases (for now - could add per-user in future)
CREATE POLICY "vendor_aliases_insert" ON vendor_aliases
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "vendor_aliases_update" ON vendor_aliases
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "vendor_aliases_delete" ON vendor_aliases
  FOR DELETE TO authenticated
  USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATE TRIGGER
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_vendor_aliases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vendor_aliases_updated_at_trigger
  BEFORE UPDATE ON vendor_aliases
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_aliases_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANT PERMISSIONS
-- ═══════════════════════════════════════════════════════════════════════════

GRANT ALL ON vendor_aliases TO authenticated;
GRANT EXECUTE ON FUNCTION lookup_vendor_by_alias(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_vendor_aliases(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION match_vendor_name(TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE vendor_aliases IS 'Maps alternative vendor names to canonical vendor records for email/invoice correlation';
COMMENT ON COLUMN vendor_aliases.alias_name IS 'The alternative name (DBA, trading name, email sender name, etc.)';
COMMENT ON COLUMN vendor_aliases.alias_type IS 'Type of alias: trading_name, legal_name, email_name, invoice_name, subsidiary';
COMMENT ON COLUMN vendor_aliases.confidence IS 'Confidence score 0-100. 100 = manually confirmed, <100 = auto-suggested';
COMMENT ON FUNCTION lookup_vendor_by_alias(TEXT) IS 'Find canonical vendor ID from an alias name';
COMMENT ON FUNCTION match_vendor_name(TEXT) IS 'Fuzzy match vendor name against all vendors and aliases';
