-- Migration: Enhance BOMs Table
-- Description: Add foreign key references to labels, product_data_sheets, and compliance_records
-- Author: MuRP Team
-- Date: 2025-11-06
-- Phase: 1.5 - Core Infrastructure

-- ============================================================================
-- Add Foreign Key Columns to BOMs Table
-- ============================================================================

-- Add reference to primary label for this BOM
ALTER TABLE boms ADD COLUMN IF NOT EXISTS
  primary_label_id UUID REFERENCES labels(id) ON DELETE SET NULL;

-- Add reference to primary product data sheet (latest published SDS/spec sheet)
ALTER TABLE boms ADD COLUMN IF NOT EXISTS
  primary_data_sheet_id UUID REFERENCES product_data_sheets(id) ON DELETE SET NULL;

-- Add compliance summary fields for quick dashboard access
ALTER TABLE boms ADD COLUMN IF NOT EXISTS
  compliance_status TEXT DEFAULT 'unknown';
  -- 'compliant', 'due_soon', 'urgent', 'non_compliant', 'unknown'

ALTER TABLE boms ADD COLUMN IF NOT EXISTS
  total_state_registrations INTEGER DEFAULT 0;

ALTER TABLE boms ADD COLUMN IF NOT EXISTS
  expiring_registrations_count INTEGER DEFAULT 0;

ALTER TABLE boms ADD COLUMN IF NOT EXISTS
  compliance_last_checked TIMESTAMPTZ;

-- ============================================================================
-- Add Foreign Keys to Other Tables (Complete the Relationships)
-- ============================================================================

-- Add foreign key constraint from labels to boms
ALTER TABLE labels ADD CONSTRAINT fk_labels_bom_id
  FOREIGN KEY (bom_id) REFERENCES boms(id) ON DELETE SET NULL;

-- Add foreign key constraints from labels to auth.users
ALTER TABLE labels ADD CONSTRAINT fk_labels_uploaded_by
  FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE labels ADD CONSTRAINT fk_labels_verified_by
  FOREIGN KEY (verified_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE labels ADD CONSTRAINT fk_labels_approved_by
  FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add foreign key constraints from product_data_sheets to boms and labels
ALTER TABLE product_data_sheets ADD CONSTRAINT fk_pds_bom_id
  FOREIGN KEY (bom_id) REFERENCES boms(id) ON DELETE CASCADE;

ALTER TABLE product_data_sheets ADD CONSTRAINT fk_pds_label_id
  FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE SET NULL;

-- Add foreign key constraints from product_data_sheets to auth.users
ALTER TABLE product_data_sheets ADD CONSTRAINT fk_pds_created_by
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE product_data_sheets ADD CONSTRAINT fk_pds_last_edited_by
  FOREIGN KEY (last_edited_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE product_data_sheets ADD CONSTRAINT fk_pds_approved_by
  FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add foreign key constraints from compliance_records to boms and labels
ALTER TABLE compliance_records ADD CONSTRAINT fk_compliance_bom_id
  FOREIGN KEY (bom_id) REFERENCES boms(id) ON DELETE CASCADE;

ALTER TABLE compliance_records ADD CONSTRAINT fk_compliance_label_id
  FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE SET NULL;

-- Add foreign key constraints from compliance_records to auth.users
ALTER TABLE compliance_records ADD CONSTRAINT fk_compliance_created_by
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE compliance_records ADD CONSTRAINT fk_compliance_assigned_to
  FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE compliance_records ADD CONSTRAINT fk_compliance_last_verified_by
  FOREIGN KEY (last_verified_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================================
-- Indexes for New BOM Columns
-- ============================================================================

CREATE INDEX idx_boms_primary_label_id ON boms(primary_label_id) WHERE primary_label_id IS NOT NULL;
CREATE INDEX idx_boms_primary_data_sheet_id ON boms(primary_data_sheet_id) WHERE primary_data_sheet_id IS NOT NULL;
CREATE INDEX idx_boms_compliance_status ON boms(compliance_status);
CREATE INDEX idx_boms_expiring_registrations ON boms(expiring_registrations_count) WHERE expiring_registrations_count > 0;

-- ============================================================================
-- Constraints for BOM Compliance Status
-- ============================================================================

ALTER TABLE boms ADD CONSTRAINT boms_compliance_status_check
  CHECK (compliance_status IN ('compliant', 'due_soon', 'urgent', 'non_compliant', 'unknown'));

-- ============================================================================
-- Functions to Update BOM Compliance Summary
-- ============================================================================

-- Function to update BOM compliance summary fields
CREATE OR REPLACE FUNCTION update_bom_compliance_summary(p_bom_id UUID)
RETURNS VOID AS $$
DECLARE
  v_total_registrations INTEGER;
  v_expiring_count INTEGER;
  v_expired_count INTEGER;
  v_compliance_status TEXT;
BEGIN
  -- Count total registrations
  SELECT COUNT(*)
  INTO v_total_registrations
  FROM compliance_records
  WHERE bom_id = p_bom_id;

  -- Count expiring registrations (within 90 days)
  SELECT COUNT(*)
  INTO v_expiring_count
  FROM compliance_records
  WHERE bom_id = p_bom_id
    AND status IN ('due_soon', 'urgent');

  -- Count expired registrations
  SELECT COUNT(*)
  INTO v_expired_count
  FROM compliance_records
  WHERE bom_id = p_bom_id
    AND status = 'expired';

  -- Determine overall compliance status
  IF v_expired_count > 0 THEN
    v_compliance_status = 'non_compliant';
  ELSIF v_expiring_count > 0 THEN
    -- Further distinguish between due_soon and urgent
    IF EXISTS (
      SELECT 1 FROM compliance_records
      WHERE bom_id = p_bom_id AND status = 'urgent'
    ) THEN
      v_compliance_status = 'urgent';
    ELSE
      v_compliance_status = 'due_soon';
    END IF;
  ELSIF v_total_registrations > 0 THEN
    v_compliance_status = 'compliant';
  ELSE
    v_compliance_status = 'unknown';
  END IF;

  -- Update BOM record
  UPDATE boms
  SET
    total_state_registrations = v_total_registrations,
    expiring_registrations_count = v_expiring_count,
    compliance_status = v_compliance_status,
    compliance_last_checked = NOW()
  WHERE id = p_bom_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update all BOMs compliance summaries (run as scheduled job)
CREATE OR REPLACE FUNCTION update_all_boms_compliance()
RETURNS INTEGER AS $$
DECLARE
  v_bom_id UUID;
  v_updated_count INTEGER := 0;
BEGIN
  FOR v_bom_id IN SELECT id FROM boms LOOP
    PERFORM update_bom_compliance_summary(v_bom_id);
    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Triggers to Auto-Update BOM Compliance Summary
-- ============================================================================

-- Trigger function to update BOM compliance summary when compliance records change
CREATE OR REPLACE FUNCTION trigger_update_bom_compliance()
RETURNS TRIGGER AS $$
BEGIN
  -- Update for the affected BOM
  IF TG_OP = 'DELETE' THEN
    PERFORM update_bom_compliance_summary(OLD.bom_id);
  ELSE
    PERFORM update_bom_compliance_summary(NEW.bom_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on compliance_records table
CREATE TRIGGER trigger_compliance_update_bom
  AFTER INSERT OR UPDATE OR DELETE ON compliance_records
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_bom_compliance();

-- ============================================================================
-- Enhanced Views for Dashboard
-- ============================================================================

-- View: BOMs with Compliance Summary
CREATE OR REPLACE VIEW boms_with_compliance AS
SELECT
  b.id,
  b.finished_sku,
  b.name,
  b.barcode,
  b.compliance_status,
  b.total_state_registrations,
  b.expiring_registrations_count,
  b.compliance_last_checked,
  b.primary_label_id,
  b.primary_data_sheet_id,
  l.file_name AS primary_label_file_name,
  l.barcode AS label_barcode,
  pds.title AS primary_data_sheet_title,
  pds.document_type AS primary_data_sheet_type,
  pds.pdf_url AS primary_data_sheet_pdf_url,
  b.created_at,
  b.updated_at
FROM boms b
LEFT JOIN labels l ON b.primary_label_id = l.id
LEFT JOIN product_data_sheets pds ON b.primary_data_sheet_id = pds.id
ORDER BY b.name;

-- View: Compliance Dashboard Summary
CREATE OR REPLACE VIEW compliance_dashboard AS
SELECT
  b.id AS bom_id,
  b.finished_sku,
  b.name AS product_name,
  b.compliance_status,
  COUNT(cr.id) AS total_registrations,
  COUNT(CASE WHEN cr.status = 'current' THEN 1 END) AS current_registrations,
  COUNT(CASE WHEN cr.status = 'due_soon' THEN 1 END) AS due_soon_registrations,
  COUNT(CASE WHEN cr.status = 'urgent' THEN 1 END) AS urgent_registrations,
  COUNT(CASE WHEN cr.status = 'expired' THEN 1 END) AS expired_registrations,
  MIN(cr.days_until_expiration) FILTER (WHERE cr.days_until_expiration > 0) AS next_expiration_days,
  ARRAY_AGG(
    DISTINCT cr.state_name ORDER BY cr.state_name
  ) FILTER (WHERE cr.state_name IS NOT NULL) AS registered_states
FROM boms b
LEFT JOIN compliance_records cr ON b.id = cr.bom_id
GROUP BY b.id, b.finished_sku, b.name, b.compliance_status
ORDER BY next_expiration_days ASC NULLS LAST;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON COLUMN boms.primary_label_id IS 'Primary/current label file for this BOM';
COMMENT ON COLUMN boms.primary_data_sheet_id IS 'Primary/latest published product data sheet';
COMMENT ON COLUMN boms.compliance_status IS 'Overall compliance status: compliant, due_soon, urgent, non_compliant, unknown';
COMMENT ON COLUMN boms.total_state_registrations IS 'Total number of state registrations for this product';
COMMENT ON COLUMN boms.expiring_registrations_count IS 'Number of registrations expiring within 90 days';

COMMENT ON VIEW boms_with_compliance IS 'BOMs with compliance summary and primary documents';
COMMENT ON VIEW compliance_dashboard IS 'Dashboard view showing compliance status across all products';

COMMENT ON FUNCTION update_bom_compliance_summary(UUID) IS 'Updates compliance summary fields for a specific BOM';
COMMENT ON FUNCTION update_all_boms_compliance() IS 'Updates compliance summaries for all BOMs (run as scheduled job)';

-- ============================================================================
-- Grants
-- ============================================================================

GRANT SELECT ON boms_with_compliance TO authenticated;
GRANT SELECT ON compliance_dashboard TO authenticated;
