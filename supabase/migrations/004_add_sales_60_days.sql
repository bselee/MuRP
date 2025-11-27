-- Migration: Add missing sales_last_60_days column
-- Date: November 12, 2025
-- Purpose: Fix missing 60-day sales tracking column

-- Add the missing sales_last_60_days column
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS sales_last_60_days INTEGER DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN inventory_items.sales_last_60_days IS 'Sales units in last 60 days (from Finale)';

-- ============================================================================
-- BEGIN LABELS TABLE MIGRATION (merged from former 004a)
-- ============================================================================

-- Migration: Create Labels Table
-- Description: Dedicated table for storing scanned labels with AI-extracted data
-- Author: MuRP Team
-- Date: 2025-11-06
-- Phase: 1.2 - Core Infrastructure

-- ============================================================================
-- Labels Table
-- ============================================================================
-- Stores all uploaded and scanned product labels
-- Supports standalone label scanning (not necessarily tied to a BOM)
-- Contains AI-extracted data from label images/PDFs

CREATE TABLE IF NOT EXISTS labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- File information
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,                    -- Supabase storage URL or base64 data
  file_size BIGINT,                          -- bytes
  mime_type TEXT,                            -- 'application/pdf', 'image/png', etc.

  -- Label metadata
  barcode TEXT,
  product_name TEXT,
  net_weight TEXT,
  revision NUMERIC DEFAULT 1.0,

  -- Associations
  bom_id UUID,                               -- Can be NULL for standalone scans
  -- Foreign key will be added after boms table is enhanced

  -- AI Scanning status
  scan_status TEXT DEFAULT 'pending',        -- 'pending', 'scanning', 'completed', 'failed'
  scan_completed_at TIMESTAMPTZ,
  scan_error TEXT,

  -- Extracted data from AI (JSONB for flexible structure)
  extracted_data JSONB,
  /*
    Example structure:
    {
      "productName": "Organic Fertilizer 10-5-8",
      "netWeight": "50 lbs",
      "barcode": "123456789012",
      "ingredients": [
        {
          "name": "Blood Meal",
          "percentage": "15%",
          "order": 1,
          "confidence": 0.95
        },
        {
          "name": "Bone Meal",
          "percentage": "10%",
          "order": 2,
          "confidence": 0.92
        }
      ],
      "guaranteedAnalysis": {
        "nitrogen": "10.0%",
        "phosphate": "5.0%",
        "potassium": "8.0%",
        "otherNutrients": {
          "calcium": "2.0%",
          "sulfur": "1.5%"
        }
      },
      "claims": ["OMRI Listed", "100% Organic", "Non-GMO"],
      "warnings": ["Keep out of reach of children", "May cause skin irritation"],
      "directions": "Apply 1-2 cups per plant, water thoroughly...",
      "otherText": ["Made in USA", "Net Wt 50 lbs (22.7 kg)"]
    }
  */

  -- Ingredient comparison with BOM (JSONB)
  ingredient_comparison JSONB,
  /*
    Example structure:
    {
      "comparedAt": "2025-11-06T10:30:00Z",
      "matchedIngredients": 8,
      "missingFromLabel": ["Trace mineral mix"],
      "missingFromBOM": ["Kelp powder"],
      "orderMatches": true,
      "percentageVariances": [
        {
          "ingredient": "Blood Meal",
          "labelValue": "15%",
          "bomValue": "14.5%",
          "variance": 0.5
        }
      ]
    }
  */

  -- Verification tracking
  verified BOOLEAN DEFAULT false,
  verified_by UUID,                          -- References users(id)
  verified_at TIMESTAMPTZ,

  -- File type and status
  file_type TEXT DEFAULT 'label',            -- 'label', 'regulatory', 'other'
  status TEXT DEFAULT 'draft',               -- 'draft', 'approved', 'archived'

  -- Approval tracking
  approved_by UUID,                          -- References users(id)
  approved_date TIMESTAMPTZ,

  -- Notes and comments
  notes TEXT,

  -- Audit trail
  uploaded_by UUID,                          -- References users(id)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

CREATE INDEX idx_labels_bom_id ON labels(bom_id) WHERE bom_id IS NOT NULL;
CREATE INDEX idx_labels_barcode ON labels(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_labels_scan_status ON labels(scan_status);
CREATE INDEX idx_labels_status ON labels(status);
CREATE INDEX idx_labels_verified ON labels(verified);
CREATE INDEX idx_labels_created_at ON labels(created_at DESC);
CREATE INDEX idx_labels_uploaded_by ON labels(uploaded_by);

-- GIN index for JSONB extracted_data (enables fast queries on JSON fields)
CREATE INDEX idx_labels_extracted_data ON labels USING GIN (extracted_data);
CREATE INDEX idx_labels_ingredient_comparison ON labels USING GIN (ingredient_comparison);

-- ============================================================================
-- Constraints
-- ============================================================================

ALTER TABLE labels ADD CONSTRAINT labels_scan_status_check
  CHECK (scan_status IN ('pending', 'scanning', 'completed', 'failed'));

ALTER TABLE labels ADD CONSTRAINT labels_status_check
  CHECK (status IN ('draft', 'approved', 'archived'));

ALTER TABLE labels ADD CONSTRAINT labels_file_type_check
  CHECK (file_type IN ('label', 'regulatory', 'other'));

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

ALTER TABLE labels ENABLE ROW LEVEL SECURITY;

-- Users can view all labels (within their organization if multi-tenant)
CREATE POLICY labels_select_policy ON labels
  FOR SELECT
  TO authenticated
  USING (true);  -- Adjust for multi-tenant: uploaded_by IN (SELECT id FROM users WHERE org_id = current_org_id())

-- Users can insert their own labels
CREATE POLICY labels_insert_policy ON labels
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = uploaded_by OR uploaded_by IS NULL);

-- Users can update labels they uploaded
CREATE POLICY labels_update_policy ON labels
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = uploaded_by OR uploaded_by IS NULL);

-- Users can delete labels they uploaded
CREATE POLICY labels_delete_policy ON labels
  FOR DELETE
  TO authenticated
  USING (auth.uid() = uploaded_by);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_labels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_labels_updated_at
  BEFORE UPDATE ON labels
  FOR EACH ROW
  EXECUTE FUNCTION update_labels_updated_at();

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to get all labels for a BOM
CREATE OR REPLACE FUNCTION get_labels_by_bom(p_bom_id UUID)
RETURNS TABLE (
  id UUID,
  file_name TEXT,
  barcode TEXT,
  product_name TEXT,
  scan_status TEXT,
  verified BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.file_name,
    l.barcode,
    l.product_name,
    l.scan_status,
    l.verified,
    l.created_at
  FROM labels l
  WHERE l.bom_id = p_bom_id
  ORDER BY l.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to search labels by barcode
CREATE OR REPLACE FUNCTION search_labels_by_barcode(p_barcode TEXT)
RETURNS TABLE (
  id UUID,
  file_name TEXT,
  product_name TEXT,
  bom_id UUID,
  scan_status TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.file_name,
    l.product_name,
    l.bom_id,
    l.scan_status,
    l.created_at
  FROM labels l
  WHERE l.barcode = p_barcode
  ORDER BY l.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE labels IS 'Stores all uploaded and scanned product labels with AI-extracted data';
COMMENT ON COLUMN labels.extracted_data IS 'JSONB structure containing AI-extracted ingredients, NPK, claims, warnings, etc.';
COMMENT ON COLUMN labels.ingredient_comparison IS 'JSONB structure containing comparison results between label and BOM ingredients';
COMMENT ON COLUMN labels.scan_status IS 'Status of AI scanning: pending, scanning, completed, failed';
COMMENT ON COLUMN labels.verified IS 'Whether a human has verified the AI extraction is accurate';

-- ============================================================================
-- Grants
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON labels TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
