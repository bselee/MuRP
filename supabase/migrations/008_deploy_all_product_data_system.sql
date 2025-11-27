-- ============================================================================
-- COMBINED MIGRATION: Product Data & Compliance Management System
-- ============================================================================
-- This migration deploys all Phase 1 infrastructure in a single transaction
-- Run this instead of 004-007 if you want to deploy everything at once
--
-- Tables Created:
--   - labels
--   - product_data_sheets
--   - compliance_records
--   - Enhanced boms table
--
-- Author: MuRP Team
-- Date: 2025-11-06
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. LABELS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  barcode TEXT,
  product_name TEXT,
  net_weight TEXT,
  revision NUMERIC DEFAULT 1.0,
  bom_id UUID,
  scan_status TEXT DEFAULT 'pending',
  scan_completed_at TIMESTAMPTZ,
  scan_error TEXT,
  extracted_data JSONB,
  ingredient_comparison JSONB,
  verified BOOLEAN DEFAULT false,
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  file_type TEXT DEFAULT 'label',
  status TEXT DEFAULT 'draft',
  approved_by UUID,
  approved_date TIMESTAMPTZ,
  notes TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_labels_bom_id ON labels(bom_id) WHERE bom_id IS NOT NULL;
CREATE INDEX idx_labels_barcode ON labels(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_labels_scan_status ON labels(scan_status);
CREATE INDEX idx_labels_status ON labels(status);
CREATE INDEX idx_labels_verified ON labels(verified);
CREATE INDEX idx_labels_created_at ON labels(created_at DESC);
CREATE INDEX idx_labels_uploaded_by ON labels(uploaded_by);
CREATE INDEX idx_labels_extracted_data ON labels USING GIN (extracted_data);
CREATE INDEX idx_labels_ingredient_comparison ON labels USING GIN (ingredient_comparison);

ALTER TABLE labels ADD CONSTRAINT labels_scan_status_check
  CHECK (scan_status IN ('pending', 'scanning', 'completed', 'failed'));
ALTER TABLE labels ADD CONSTRAINT labels_status_check
  CHECK (status IN ('draft', 'approved', 'archived'));
ALTER TABLE labels ADD CONSTRAINT labels_file_type_check
  CHECK (file_type IN ('label', 'regulatory', 'other'));

ALTER TABLE labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY labels_select_policy ON labels FOR SELECT TO authenticated USING (true);
CREATE POLICY labels_insert_policy ON labels FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by OR uploaded_by IS NULL);
CREATE POLICY labels_update_policy ON labels FOR UPDATE TO authenticated USING (auth.uid() = uploaded_by OR uploaded_by IS NULL);
CREATE POLICY labels_delete_policy ON labels FOR DELETE TO authenticated USING (auth.uid() = uploaded_by);

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

COMMENT ON TABLE labels IS 'Stores all uploaded and scanned product labels with AI-extracted data';

-- ============================================================================
-- 2. PRODUCT DATA SHEETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_data_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id UUID NOT NULL,
  label_id UUID,
  document_type TEXT NOT NULL,
  title TEXT NOT NULL,
  version NUMERIC DEFAULT 1.0,
  description TEXT,
  content JSONB NOT NULL,
  pdf_url TEXT,
  pdf_generated_at TIMESTAMPTZ,
  pdf_file_size BIGINT,
  status TEXT DEFAULT 'draft',
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  approval_notes TEXT,
  is_ai_generated BOOLEAN DEFAULT true,
  ai_model_used TEXT,
  generation_prompt TEXT,
  last_edited_by UUID,
  edit_count INTEGER DEFAULT 0,
  edit_history JSONB,
  published_at TIMESTAMPTZ,
  published_version NUMERIC,
  tags TEXT[],
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pds_bom_id ON product_data_sheets(bom_id);
CREATE INDEX idx_pds_label_id ON product_data_sheets(label_id) WHERE label_id IS NOT NULL;
CREATE INDEX idx_pds_document_type ON product_data_sheets(document_type);
CREATE INDEX idx_pds_status ON product_data_sheets(status);
CREATE INDEX idx_pds_created_at ON product_data_sheets(created_at DESC);
CREATE INDEX idx_pds_created_by ON product_data_sheets(created_by);
CREATE INDEX idx_pds_version ON product_data_sheets(bom_id, version DESC);
CREATE INDEX idx_pds_content ON product_data_sheets USING GIN (content);
CREATE INDEX idx_pds_edit_history ON product_data_sheets USING GIN (edit_history);
CREATE INDEX idx_pds_title_search ON product_data_sheets USING GIN (to_tsvector('english', title));
CREATE INDEX idx_pds_tags ON product_data_sheets USING GIN (tags);

ALTER TABLE product_data_sheets ADD CONSTRAINT pds_document_type_check
  CHECK (document_type IN ('sds', 'spec_sheet', 'product_info', 'compliance_doc', 'custom'));
ALTER TABLE product_data_sheets ADD CONSTRAINT pds_status_check
  CHECK (status IN ('draft', 'review', 'approved', 'published', 'archived'));
ALTER TABLE product_data_sheets ADD CONSTRAINT pds_version_positive
  CHECK (version > 0);

ALTER TABLE product_data_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY pds_select_policy ON product_data_sheets FOR SELECT TO authenticated USING (true);
CREATE POLICY pds_insert_policy ON product_data_sheets FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by OR created_by IS NULL);
CREATE POLICY pds_update_policy ON product_data_sheets FOR UPDATE TO authenticated USING (auth.uid() = created_by OR auth.uid() = last_edited_by OR status = 'draft');
CREATE POLICY pds_delete_policy ON product_data_sheets FOR DELETE TO authenticated USING (auth.uid() = created_by AND status = 'draft');

CREATE OR REPLACE FUNCTION update_pds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.edit_count = OLD.edit_count + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_pds_updated_at
  BEFORE UPDATE ON product_data_sheets
  FOR EACH ROW
  EXECUTE FUNCTION update_pds_updated_at();

COMMENT ON TABLE product_data_sheets IS 'Stores AI-generated and editable product documentation (SDS, spec sheets, etc.)';

-- ============================================================================
-- 3. COMPLIANCE RECORDS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id UUID NOT NULL,
  label_id UUID,
  compliance_type TEXT NOT NULL,
  category TEXT,
  issuing_authority TEXT,
  state_code TEXT,
  state_name TEXT,
  registration_number TEXT NOT NULL,
  license_number TEXT,
  registered_date DATE,
  effective_date DATE,
  expiration_date DATE,
  renewal_date DATE,
  last_renewed_date DATE,
  status TEXT DEFAULT 'current',
  days_until_expiration INTEGER,
  registration_fee NUMERIC(10, 2),
  renewal_fee NUMERIC(10, 2),
  late_fee NUMERIC(10, 2),
  currency TEXT DEFAULT 'USD',
  payment_status TEXT,
  certificate_url TEXT,
  certificate_file_name TEXT,
  certificate_file_size BIGINT,
  additional_documents JSONB,
  due_soon_alert_sent BOOLEAN DEFAULT false,
  urgent_alert_sent BOOLEAN DEFAULT false,
  expiration_alert_sent BOOLEAN DEFAULT false,
  alert_email_addresses TEXT[],
  requirements TEXT,
  restrictions TEXT,
  conditions JSONB,
  contact_person TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  authority_website TEXT,
  assigned_to UUID,
  priority TEXT DEFAULT 'normal',
  notes TEXT,
  internal_notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ,
  last_verified_by UUID
);

CREATE INDEX idx_compliance_bom_id ON compliance_records(bom_id);
CREATE INDEX idx_compliance_label_id ON compliance_records(label_id) WHERE label_id IS NOT NULL;
CREATE INDEX idx_compliance_type ON compliance_records(compliance_type);
CREATE INDEX idx_compliance_status ON compliance_records(status);
CREATE INDEX idx_compliance_state_code ON compliance_records(state_code) WHERE state_code IS NOT NULL;
CREATE INDEX idx_compliance_expiration_date ON compliance_records(expiration_date) WHERE expiration_date IS NOT NULL;
CREATE INDEX idx_compliance_renewal_date ON compliance_records(renewal_date) WHERE renewal_date IS NOT NULL;
CREATE INDEX idx_compliance_registration_number ON compliance_records(registration_number);
CREATE INDEX idx_compliance_assigned_to ON compliance_records(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_compliance_priority ON compliance_records(priority);
CREATE INDEX idx_compliance_created_at ON compliance_records(created_at DESC);
CREATE INDEX idx_compliance_conditions ON compliance_records USING GIN (conditions);
CREATE INDEX idx_compliance_additional_docs ON compliance_records USING GIN (additional_documents);
CREATE INDEX idx_compliance_expiring_soon ON compliance_records(status, expiration_date) WHERE status IN ('due_soon', 'urgent');

ALTER TABLE compliance_records ADD CONSTRAINT compliance_type_check
  CHECK (compliance_type IN ('state_registration', 'organic_cert', 'omri', 'epa', 'wsda', 'cdfa', 'custom'));
ALTER TABLE compliance_records ADD CONSTRAINT compliance_status_check
  CHECK (status IN ('current', 'due_soon', 'urgent', 'expired', 'pending', 'suspended', 'cancelled', 'renewed'));
ALTER TABLE compliance_records ADD CONSTRAINT compliance_priority_check
  CHECK (priority IN ('low', 'normal', 'high', 'critical'));
ALTER TABLE compliance_records ADD CONSTRAINT compliance_payment_status_check
  CHECK (payment_status IS NULL OR payment_status IN ('paid', 'pending', 'overdue'));

ALTER TABLE compliance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY compliance_select_policy ON compliance_records FOR SELECT TO authenticated USING (true);
CREATE POLICY compliance_insert_policy ON compliance_records FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by OR created_by IS NULL);
CREATE POLICY compliance_update_policy ON compliance_records FOR UPDATE TO authenticated USING (true);
CREATE POLICY compliance_delete_policy ON compliance_records FOR DELETE TO authenticated USING (auth.uid() = created_by);

CREATE OR REPLACE FUNCTION update_compliance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  IF NEW.expiration_date IS NOT NULL THEN
    NEW.days_until_expiration = (NEW.expiration_date - CURRENT_DATE);
    IF NEW.days_until_expiration < 0 THEN
      NEW.status = 'expired';
    ELSIF NEW.days_until_expiration <= 30 THEN
      NEW.status = 'urgent';
    ELSIF NEW.days_until_expiration <= 90 THEN
      NEW.status = 'due_soon';
    ELSIF NEW.status NOT IN ('pending', 'suspended', 'cancelled') THEN
      NEW.status = 'current';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_compliance_updated_at
  BEFORE UPDATE ON compliance_records
  FOR EACH ROW
  EXECUTE FUNCTION update_compliance_updated_at();

CREATE TRIGGER trigger_compliance_insert
  BEFORE INSERT ON compliance_records
  FOR EACH ROW
  EXECUTE FUNCTION update_compliance_updated_at();

COMMENT ON TABLE compliance_records IS 'Comprehensive tracking of state registrations, certifications, and compliance records';

-- ============================================================================
-- 4. ENHANCE BOMS TABLE
-- ============================================================================

ALTER TABLE boms ADD COLUMN IF NOT EXISTS primary_label_id UUID;
ALTER TABLE boms ADD COLUMN IF NOT EXISTS primary_data_sheet_id UUID;
ALTER TABLE boms ADD COLUMN IF NOT EXISTS compliance_status TEXT DEFAULT 'unknown';
ALTER TABLE boms ADD COLUMN IF NOT EXISTS total_state_registrations INTEGER DEFAULT 0;
ALTER TABLE boms ADD COLUMN IF NOT EXISTS expiring_registrations_count INTEGER DEFAULT 0;
ALTER TABLE boms ADD COLUMN IF NOT EXISTS compliance_last_checked TIMESTAMPTZ;

-- Add foreign key constraints
ALTER TABLE labels ADD CONSTRAINT fk_labels_bom_id FOREIGN KEY (bom_id) REFERENCES boms(id) ON DELETE SET NULL;
ALTER TABLE labels ADD CONSTRAINT fk_labels_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE labels ADD CONSTRAINT fk_labels_verified_by FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE labels ADD CONSTRAINT fk_labels_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE product_data_sheets ADD CONSTRAINT fk_pds_bom_id FOREIGN KEY (bom_id) REFERENCES boms(id) ON DELETE CASCADE;
ALTER TABLE product_data_sheets ADD CONSTRAINT fk_pds_label_id FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE SET NULL;
ALTER TABLE product_data_sheets ADD CONSTRAINT fk_pds_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE product_data_sheets ADD CONSTRAINT fk_pds_last_edited_by FOREIGN KEY (last_edited_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE product_data_sheets ADD CONSTRAINT fk_pds_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE compliance_records ADD CONSTRAINT fk_compliance_bom_id FOREIGN KEY (bom_id) REFERENCES boms(id) ON DELETE CASCADE;
ALTER TABLE compliance_records ADD CONSTRAINT fk_compliance_label_id FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE SET NULL;
ALTER TABLE compliance_records ADD CONSTRAINT fk_compliance_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE compliance_records ADD CONSTRAINT fk_compliance_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE compliance_records ADD CONSTRAINT fk_compliance_last_verified_by FOREIGN KEY (last_verified_by) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_boms_primary_label_id ON boms(primary_label_id) WHERE primary_label_id IS NOT NULL;
CREATE INDEX idx_boms_primary_data_sheet_id ON boms(primary_data_sheet_id) WHERE primary_data_sheet_id IS NOT NULL;
CREATE INDEX idx_boms_compliance_status ON boms(compliance_status);
CREATE INDEX idx_boms_expiring_registrations ON boms(expiring_registrations_count) WHERE expiring_registrations_count > 0;

ALTER TABLE boms ADD CONSTRAINT boms_compliance_status_check
  CHECK (compliance_status IN ('compliant', 'due_soon', 'urgent', 'non_compliant', 'unknown'));

COMMENT ON COLUMN boms.primary_label_id IS 'Primary/current label file for this BOM';
COMMENT ON COLUMN boms.compliance_status IS 'Overall compliance status: compliant, due_soon, urgent, non_compliant, unknown';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON labels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_data_sheets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON compliance_records TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

COMMIT;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Product Data & Compliance Management System deployed successfully!';
  RAISE NOTICE 'Tables created: labels, product_data_sheets, compliance_records';
  RAISE NOTICE 'BOMs table enhanced with compliance tracking fields';
  RAISE NOTICE 'All foreign keys, indexes, and triggers configured';
END $$;
