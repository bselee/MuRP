-- Migration: Create Compliance Records Table
-- Description: Comprehensive tracking of state registrations, certifications, and compliance
-- Author: TGF MRP Team
-- Date: 2025-11-06
-- Phase: 1.4 - Core Infrastructure

-- ============================================================================
-- Compliance Records Table
-- ============================================================================
-- Stores all compliance-related records: state registrations, certifications, EPA, OMRI, etc.
-- Tracks expiration dates, renewal alerts, and compliance status

CREATE TABLE IF NOT EXISTS compliance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Associations
  bom_id UUID NOT NULL,                      -- Always linked to a BOM
  label_id UUID,                             -- Optional link to label
  -- Foreign keys will be added after tables exist

  -- Compliance type and category
  compliance_type TEXT NOT NULL,             -- 'state_registration', 'organic_cert', 'omri', 'epa', 'custom'
  category TEXT,                             -- Additional categorization: 'fertilizer', 'pesticide', 'soil_amendment'

  -- Registration/certification details
  issuing_authority TEXT,                    -- "State of California", "OMRI", "EPA", etc.
  state_code TEXT,                           -- For state registrations: "CA", "OR", "WA", etc.
  state_name TEXT,                           -- "California", "Oregon", "Washington"
  registration_number TEXT NOT NULL,         -- The actual registration/certification number
  license_number TEXT,                       -- Some states have separate license numbers

  -- Important dates
  registered_date DATE,                      -- When initially registered/certified
  effective_date DATE,                       -- When registration becomes effective
  expiration_date DATE,                      -- When it expires
  renewal_date DATE,                         -- Renewal deadline (may differ from expiration)
  last_renewed_date DATE,                    -- Last renewal date

  -- Status tracking
  status TEXT DEFAULT 'current',             -- 'current', 'due_soon', 'urgent', 'expired', 'pending', 'suspended', 'cancelled'
  days_until_expiration INTEGER,             -- Calculated field, updated by trigger

  -- Financial information
  registration_fee NUMERIC(10, 2),
  renewal_fee NUMERIC(10, 2),
  late_fee NUMERIC(10, 2),
  currency TEXT DEFAULT 'USD',
  payment_status TEXT,                       -- 'paid', 'pending', 'overdue'

  -- Documents and certificates
  certificate_url TEXT,                      -- PDF of registration certificate
  certificate_file_name TEXT,
  certificate_file_size BIGINT,
  additional_documents JSONB,
  /*
    Example:
    [
      {
        "name": "Label Approval Letter",
        "url": "https://...",
        "uploadedAt": "2025-11-06T10:00:00Z"
      }
    ]
  */

  -- Alert tracking
  due_soon_alert_sent BOOLEAN DEFAULT false,     -- 90-day alert
  urgent_alert_sent BOOLEAN DEFAULT false,       -- 30-day alert
  expiration_alert_sent BOOLEAN DEFAULT false,   -- Expired alert
  alert_email_addresses TEXT[],                  -- Who to notify

  -- Requirements and conditions
  requirements TEXT,                         -- What's required to maintain compliance
  restrictions TEXT,                         -- Any restrictions or limitations
  conditions JSONB,                          -- Structured conditions
  /*
    Example:
    {
      "annualReportRequired": true,
      "reportDueDate": "2026-03-31",
      "inspectionRequired": false,
      "labelApprovalRequired": true
    }
  */

  -- Contact information at issuing authority
  contact_person TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  authority_website TEXT,

  -- Internal tracking
  assigned_to UUID,                          -- References users(id) - who's responsible
  priority TEXT DEFAULT 'normal',            -- 'low', 'normal', 'high', 'critical'
  notes TEXT,
  internal_notes TEXT,                       -- Private notes not shared in exports

  -- Audit trail
  created_by UUID,                           -- References users(id)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ,             -- When someone last verified this is still valid
  last_verified_by UUID                      -- References users(id)
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

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

-- GIN index for JSONB fields
CREATE INDEX idx_compliance_conditions ON compliance_records USING GIN (conditions);
CREATE INDEX idx_compliance_additional_docs ON compliance_records USING GIN (additional_documents);

-- Composite indexes for common queries
CREATE INDEX idx_compliance_expiring_soon ON compliance_records(status, expiration_date)
  WHERE status IN ('due_soon', 'urgent');

-- ============================================================================
-- Constraints
-- ============================================================================

ALTER TABLE compliance_records ADD CONSTRAINT compliance_type_check
  CHECK (compliance_type IN ('state_registration', 'organic_cert', 'omri', 'epa', 'wsda', 'cdfa', 'custom'));

ALTER TABLE compliance_records ADD CONSTRAINT compliance_status_check
  CHECK (status IN ('current', 'due_soon', 'urgent', 'expired', 'pending', 'suspended', 'cancelled', 'renewed'));

ALTER TABLE compliance_records ADD CONSTRAINT compliance_priority_check
  CHECK (priority IN ('low', 'normal', 'high', 'critical'));

ALTER TABLE compliance_records ADD CONSTRAINT compliance_payment_status_check
  CHECK (payment_status IS NULL OR payment_status IN ('paid', 'pending', 'overdue'));

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

ALTER TABLE compliance_records ENABLE ROW LEVEL SECURITY;

-- Users can view all compliance records (within their organization)
CREATE POLICY compliance_select_policy ON compliance_records
  FOR SELECT
  TO authenticated
  USING (true);  -- Adjust for multi-tenant

-- Users can create compliance records
CREATE POLICY compliance_insert_policy ON compliance_records
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

-- Users can update compliance records
CREATE POLICY compliance_update_policy ON compliance_records
  FOR UPDATE
  TO authenticated
  USING (true);  -- Adjust based on your needs (e.g., only assigned_to can update)

-- Users can delete compliance records they created
CREATE POLICY compliance_delete_policy ON compliance_records
  FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update updated_at timestamp and calculate days_until_expiration
CREATE OR REPLACE FUNCTION update_compliance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();

  -- Calculate days until expiration
  IF NEW.expiration_date IS NOT NULL THEN
    NEW.days_until_expiration = (NEW.expiration_date - CURRENT_DATE);

    -- Auto-update status based on days until expiration
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

-- Trigger on insert to calculate initial days_until_expiration
CREATE TRIGGER trigger_compliance_insert
  BEFORE INSERT ON compliance_records
  FOR EACH ROW
  EXECUTE FUNCTION update_compliance_updated_at();

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to get all compliance records for a BOM
CREATE OR REPLACE FUNCTION get_compliance_by_bom(p_bom_id UUID)
RETURNS TABLE (
  id UUID,
  compliance_type TEXT,
  state_name TEXT,
  registration_number TEXT,
  status TEXT,
  expiration_date DATE,
  days_until_expiration INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cr.id,
    cr.compliance_type,
    cr.state_name,
    cr.registration_number,
    cr.status,
    cr.expiration_date,
    cr.days_until_expiration
  FROM compliance_records cr
  WHERE cr.bom_id = p_bom_id
  ORDER BY cr.expiration_date ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get upcoming renewals (within N days)
CREATE OR REPLACE FUNCTION get_upcoming_renewals(p_days_ahead INTEGER DEFAULT 90)
RETURNS TABLE (
  id UUID,
  bom_id UUID,
  compliance_type TEXT,
  state_name TEXT,
  registration_number TEXT,
  expiration_date DATE,
  days_until_expiration INTEGER,
  status TEXT,
  assigned_to UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cr.id,
    cr.bom_id,
    cr.compliance_type,
    cr.state_name,
    cr.registration_number,
    cr.expiration_date,
    cr.days_until_expiration,
    cr.status,
    cr.assigned_to
  FROM compliance_records cr
  WHERE cr.expiration_date IS NOT NULL
    AND cr.days_until_expiration <= p_days_ahead
    AND cr.days_until_expiration >= 0
    AND cr.status NOT IN ('expired', 'cancelled', 'suspended')
  ORDER BY cr.days_until_expiration ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get expired compliance records
CREATE OR REPLACE FUNCTION get_expired_compliance()
RETURNS TABLE (
  id UUID,
  bom_id UUID,
  compliance_type TEXT,
  state_name TEXT,
  registration_number TEXT,
  expiration_date DATE,
  days_overdue INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cr.id,
    cr.bom_id,
    cr.compliance_type,
    cr.state_name,
    cr.registration_number,
    cr.expiration_date,
    ABS(cr.days_until_expiration) AS days_overdue
  FROM compliance_records cr
  WHERE cr.status = 'expired'
  ORDER BY cr.expiration_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update compliance status (run as scheduled job)
CREATE OR REPLACE FUNCTION update_all_compliance_statuses()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE compliance_records
  SET
    days_until_expiration = (expiration_date - CURRENT_DATE),
    status = CASE
      WHEN (expiration_date - CURRENT_DATE) < 0 THEN 'expired'
      WHEN (expiration_date - CURRENT_DATE) <= 30 THEN 'urgent'
      WHEN (expiration_date - CURRENT_DATE) <= 90 THEN 'due_soon'
      WHEN status NOT IN ('pending', 'suspended', 'cancelled') THEN 'current'
      ELSE status
    END,
    updated_at = NOW()
  WHERE expiration_date IS NOT NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE compliance_records IS 'Comprehensive tracking of state registrations, certifications, and compliance records';
COMMENT ON COLUMN compliance_records.compliance_type IS 'Type: state_registration, organic_cert, omri, epa, wsda, cdfa, custom';
COMMENT ON COLUMN compliance_records.status IS 'Status: current, due_soon (90d), urgent (30d), expired, pending, suspended, cancelled';
COMMENT ON COLUMN compliance_records.days_until_expiration IS 'Auto-calculated days until expiration (negative if expired)';
COMMENT ON FUNCTION update_all_compliance_statuses() IS 'Run daily to update all compliance statuses based on expiration dates';

-- ============================================================================
-- Grants
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON compliance_records TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
