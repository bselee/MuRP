-- Migration: Enhance Vendor Schema
-- Description: Adds missing fields to vendors table for complete data storage
-- Date: 2025-11-04
-- Purpose: Support complete vendor data from CSV imports without data loss

-- ============================================================================
-- Add Missing Vendor Fields
-- ============================================================================

-- Add structured address fields (in addition to composite address field)
ALTER TABLE vendors
ADD COLUMN IF NOT EXISTS address_line1 TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS address_line2 TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS city TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS state TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS postal_code TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS country TEXT DEFAULT '';

-- Add notes field for internal vendor information
ALTER TABLE vendors
ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- Add metadata fields for tracking data source and quality
ALTER TABLE vendors
ADD COLUMN IF NOT EXISTS data_source VARCHAR(20) DEFAULT 'manual' CHECK (data_source IN ('manual', 'csv', 'api')),
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'error'));

-- ============================================================================
-- Update Indexes for Performance
-- ============================================================================

-- Index for name searches (already exists, but ensure it's there)
CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(name);

-- Index for email searches
CREATE INDEX IF NOT EXISTS idx_vendors_emails ON vendors USING GIN(contact_emails);

-- Index for city searches (common filter)
CREATE INDEX IF NOT EXISTS idx_vendors_city ON vendors(city);

-- Index for state searches (common filter)
CREATE INDEX IF NOT EXISTS idx_vendors_state ON vendors(state);

-- Index for sync status monitoring
CREATE INDEX IF NOT EXISTS idx_vendors_sync_status ON vendors(sync_status) WHERE sync_status != 'synced';

-- ============================================================================
-- Add Comments for Documentation
-- ============================================================================

COMMENT ON COLUMN vendors.address IS 'Composite address for display purposes (auto-generated from components)';
COMMENT ON COLUMN vendors.address_line1 IS 'Street address line 1';
COMMENT ON COLUMN vendors.address_line2 IS 'Street address line 2 (optional)';
COMMENT ON COLUMN vendors.city IS 'City name';
COMMENT ON COLUMN vendors.state IS 'State or region';
COMMENT ON COLUMN vendors.postal_code IS 'Postal/ZIP code';
COMMENT ON COLUMN vendors.country IS 'Country name or code';
COMMENT ON COLUMN vendors.notes IS 'Internal notes about vendor';
COMMENT ON COLUMN vendors.data_source IS 'Source of vendor data: manual, csv, or api';
COMMENT ON COLUMN vendors.last_sync_at IS 'Timestamp of last successful sync from external source';
COMMENT ON COLUMN vendors.sync_status IS 'Current sync status: synced, pending, or error';

-- ============================================================================
-- Create Helper Function to Rebuild Composite Address
-- ============================================================================

CREATE OR REPLACE FUNCTION rebuild_vendor_address()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-generate composite address from components when they change
  NEW.address := CONCAT_WS(', ',
    NULLIF(NEW.address_line1, ''),
    NULLIF(NEW.address_line2, ''),
    NULLIF(NEW.city, ''),
    NULLIF(NEW.state, ''),
    NULLIF(NEW.postal_code, ''),
    NULLIF(NEW.country, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update composite address
DROP TRIGGER IF EXISTS trg_rebuild_vendor_address ON vendors;
CREATE TRIGGER trg_rebuild_vendor_address
  BEFORE INSERT OR UPDATE OF address_line1, address_line2, city, state, postal_code, country
  ON vendors
  FOR EACH ROW
  EXECUTE FUNCTION rebuild_vendor_address();

-- ============================================================================
-- Backfill existing data (if needed)
-- ============================================================================

-- If you have existing vendors with only composite address,
-- you can manually parse them here or leave them as-is.
-- New imports will populate the structured fields.

-- Example backfill (commented out - customize as needed):
-- UPDATE vendors
-- SET
--   data_source = 'manual',
--   last_sync_at = NOW()
-- WHERE data_source IS NULL;

-- ============================================================================
-- Create View for Complete Vendor Information
-- ============================================================================

CREATE OR REPLACE VIEW vendor_details AS
SELECT
  v.id,
  v.name,
  v.contact_emails,
  v.phone,
  -- Structured address
  v.address_line1,
  v.address_line2,
  v.city,
  v.state,
  v.postal_code,
  v.country,
  -- Composite address for display
  v.address AS address_display,
  -- Business info
  v.website,
  v.lead_time_days,
  v.notes,
  -- Metadata
  v.data_source,
  v.last_sync_at,
  v.sync_status,
  v.created_at,
  v.updated_at,
  -- Computed fields
  COALESCE(array_length(v.contact_emails, 1), 0) AS email_count,
  CASE
    WHEN v.address_line1 != '' AND v.city != '' AND v.state != '' THEN true
    ELSE false
  END AS has_complete_address
FROM vendors v;

COMMENT ON VIEW vendor_details IS 'Enhanced vendor view with computed fields for UI display';

-- Grant access to view
GRANT SELECT ON vendor_details TO authenticated;
