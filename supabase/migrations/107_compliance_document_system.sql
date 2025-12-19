-- Migration: 107_compliance_document_system.sql
-- Description: Comprehensive compliance document management with state selection and product correlation
-- Purpose: Store artwork, compliance docs, letters, certifications, statutes and link to products
-- Date: 2025-12-19

-- ============================================================================
-- PHASE 1: COMPLIANCE DOCUMENT TYPES ENUM
-- ============================================================================

-- Create enum for document types if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'compliance_document_type') THEN
    CREATE TYPE compliance_document_type AS ENUM (
      'artwork',           -- Product label artwork, packaging designs
      'label_proof',       -- Label proofs for approval
      'certificate',       -- Certifications (OMRI, USDA Organic, etc.)
      'registration',      -- State registration documents
      'test_report',       -- Lab test results, COAs
      'statute',           -- Official regulatory statutes
      'guidance',          -- Agency guidance documents
      'letter',            -- Agency correspondence, approval letters
      'sds',               -- Safety Data Sheets
      'specification',     -- Product specifications
      'approval',          -- Formal approval documents
      'amendment',         -- Regulatory amendments
      'renewal',           -- Registration renewal docs
      'audit_report',      -- Compliance audit reports
      'other'              -- Miscellaneous documents
    );
  END IF;
END $$;

-- Create enum for document status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'compliance_document_status') THEN
    CREATE TYPE compliance_document_status AS ENUM (
      'draft',             -- Initial upload, not finalized
      'pending_review',    -- Awaiting internal review
      'pending_approval',  -- Awaiting external approval
      'approved',          -- Active and approved
      'expired',           -- Past expiration date
      'superseded',        -- Replaced by newer version
      'rejected',          -- Failed review/approval
      'archived'           -- No longer active but retained
    );
  END IF;
END $$;

-- ============================================================================
-- PHASE 2: COMPLIANCE DOCUMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Document identification
  document_name TEXT NOT NULL,
  document_type compliance_document_type NOT NULL DEFAULT 'other',
  document_number TEXT,                    -- Registration number, certificate number, etc.
  description TEXT,

  -- File storage
  file_path TEXT,                          -- Path in Supabase Storage
  file_url TEXT,                           -- Public or signed URL
  file_name TEXT NOT NULL,                 -- Original filename
  file_size INTEGER,                       -- Size in bytes
  file_mime_type TEXT,                     -- MIME type (application/pdf, image/png, etc.)
  file_hash TEXT,                          -- SHA256 hash for integrity
  thumbnail_url TEXT,                      -- Preview thumbnail for images/PDFs

  -- Geographic scope
  applicable_states TEXT[] DEFAULT '{}',   -- State codes this doc applies to (empty = all states)
  is_national BOOLEAN DEFAULT FALSE,       -- Federal/national document
  jurisdiction_level TEXT DEFAULT 'state'  -- 'federal', 'state', 'local', 'international'
    CHECK (jurisdiction_level IN ('federal', 'state', 'local', 'international')),

  -- Regulatory context
  regulatory_category TEXT,                -- 'fertilizer', 'organic', 'soil_amendment', etc.
  agency_name TEXT,                        -- Issuing agency
  agency_contact_email TEXT,
  agency_contact_phone TEXT,
  regulation_code TEXT,                    -- Legal citation (e.g., "CFR 205.301")

  -- Validity period
  effective_date DATE,                     -- When document becomes effective
  expiration_date DATE,                    -- When document expires
  renewal_reminder_days INTEGER DEFAULT 30,-- Days before expiration to alert

  -- Status tracking
  status compliance_document_status NOT NULL DEFAULT 'draft',
  status_changed_at TIMESTAMPTZ DEFAULT NOW(),
  status_changed_by TEXT,
  status_notes TEXT,

  -- Version control
  version INTEGER DEFAULT 1,
  supersedes_id UUID REFERENCES compliance_documents(id),
  superseded_by_id UUID REFERENCES compliance_documents(id),

  -- Content extraction (AI/OCR)
  extracted_text TEXT,                     -- OCR/AI extracted text content
  extracted_data JSONB,                    -- Structured data extracted from document
  extraction_method TEXT,                  -- 'manual', 'ocr', 'ai', 'mcp'
  extraction_date TIMESTAMPTZ,

  -- Tags and search
  tags TEXT[] DEFAULT '{}',
  keywords TEXT[] DEFAULT '{}',
  search_vector tsvector,

  -- Ownership
  uploaded_by TEXT,
  owned_by TEXT,                           -- User or department responsible

  -- Metadata
  custom_fields JSONB DEFAULT '{}',        -- Flexible additional fields
  notes TEXT,
  internal_notes TEXT,                     -- Notes not shown to external parties

  -- Audit trail
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,

  -- Constraints
  CONSTRAINT valid_file_size CHECK (file_size IS NULL OR file_size > 0),
  CONSTRAINT valid_version CHECK (version > 0)
);

-- Indexes for compliance_documents
CREATE INDEX IF NOT EXISTS idx_compliance_docs_type ON compliance_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_compliance_docs_status ON compliance_documents(status);
CREATE INDEX IF NOT EXISTS idx_compliance_docs_states ON compliance_documents USING GIN(applicable_states);
CREATE INDEX IF NOT EXISTS idx_compliance_docs_expiration ON compliance_documents(expiration_date) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_compliance_docs_category ON compliance_documents(regulatory_category);
CREATE INDEX IF NOT EXISTS idx_compliance_docs_tags ON compliance_documents USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_compliance_docs_search ON compliance_documents USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_compliance_docs_agency ON compliance_documents(agency_name);
CREATE INDEX IF NOT EXISTS idx_compliance_docs_created ON compliance_documents(created_at DESC);

-- Full-text search trigger
CREATE OR REPLACE FUNCTION update_compliance_docs_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.document_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.document_number, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.extracted_text, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.agency_name, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'B');
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_compliance_docs_search ON compliance_documents;
CREATE TRIGGER trg_update_compliance_docs_search
  BEFORE INSERT OR UPDATE ON compliance_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_compliance_docs_search_vector();

-- ============================================================================
-- PHASE 3: PRODUCT-DOCUMENT CORRELATION TABLE
-- ============================================================================

-- Links compliance documents to products (SKUs) or BOMs
CREATE TABLE IF NOT EXISTS product_compliance_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Document reference
  document_id UUID NOT NULL REFERENCES compliance_documents(id) ON DELETE CASCADE,

  -- Product references (at least one required)
  sku TEXT,                                -- Direct SKU link
  bom_id UUID,                             -- BOM/formula link
  product_group TEXT,                      -- Product group/family link

  -- Relationship type
  relationship_type TEXT NOT NULL DEFAULT 'applies_to'
    CHECK (relationship_type IN (
      'applies_to',      -- Document applies to this product
      'required_for',    -- Document is required for this product
      'supersedes_for',  -- Document supersedes another for this product
      'reference',       -- Reference/informational link
      'certification',   -- Certification for this product
      'artwork',         -- Label artwork for this product
      'test_result',     -- Test result for this product
      'registration'     -- State registration for this product
    )),

  -- State-specific applicability
  applicable_states TEXT[] DEFAULT '{}',   -- States where this relationship applies

  -- Validity
  effective_date DATE,
  expiration_date DATE,
  is_active BOOLEAN DEFAULT TRUE,

  -- Priority (for multiple docs of same type)
  priority INTEGER DEFAULT 0,              -- Higher = more important

  -- Notes
  notes TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,

  -- Ensure at least one product reference
  CONSTRAINT at_least_one_product CHECK (
    sku IS NOT NULL OR bom_id IS NOT NULL OR product_group IS NOT NULL
  )
);

-- Indexes for product-document correlation
CREATE INDEX IF NOT EXISTS idx_prod_comp_docs_document ON product_compliance_documents(document_id);
CREATE INDEX IF NOT EXISTS idx_prod_comp_docs_sku ON product_compliance_documents(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prod_comp_docs_bom ON product_compliance_documents(bom_id) WHERE bom_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prod_comp_docs_group ON product_compliance_documents(product_group) WHERE product_group IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prod_comp_docs_type ON product_compliance_documents(relationship_type);
CREATE INDEX IF NOT EXISTS idx_prod_comp_docs_states ON product_compliance_documents USING GIN(applicable_states);
CREATE INDEX IF NOT EXISTS idx_prod_comp_docs_active ON product_compliance_documents(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- PHASE 4: COMPLIANCE ITEM STATE SELECTION TABLE
-- ============================================================================

-- Allows selection of specific states for compliance items (products/BOMs)
CREATE TABLE IF NOT EXISTS compliance_item_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Item identification (at least one required)
  sku TEXT,
  bom_id UUID,
  product_group TEXT,

  -- State selection
  state_code TEXT NOT NULL,                -- Two-letter state code

  -- Compliance status per state
  compliance_status TEXT DEFAULT 'unknown'
    CHECK (compliance_status IN (
      'unknown',          -- Not yet assessed
      'compliant',        -- Meets all requirements
      'pending',          -- Assessment in progress
      'needs_attention',  -- Minor issues to address
      'non_compliant',    -- Does not meet requirements
      'not_applicable',   -- This state's regs don't apply
      'exempt'            -- Product exempt from state regs
    )),

  -- Registration tracking
  is_registered BOOLEAN DEFAULT FALSE,
  registration_number TEXT,
  registration_date DATE,
  registration_expiry DATE,
  registration_fee_paid DECIMAL(10,2),

  -- Notes and requirements
  state_specific_notes TEXT,
  special_requirements TEXT[],             -- State-specific requirements for this item
  required_warnings TEXT[],                -- Required label warnings for this state
  prohibited_claims TEXT[],                -- Claims not allowed in this state

  -- Assessment tracking
  last_assessment_date TIMESTAMPTZ,
  last_assessment_by TEXT,
  next_review_date DATE,

  -- Active flag
  is_active BOOLEAN DEFAULT TRUE,          -- Whether we're actively selling in this state

  -- Priority
  market_priority INTEGER DEFAULT 0,       -- Higher = more important market

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,

  -- Ensure at least one item reference
  CONSTRAINT at_least_one_item CHECK (
    sku IS NOT NULL OR bom_id IS NOT NULL OR product_group IS NOT NULL
  ),

  -- Unique constraint per item-state combination
  CONSTRAINT unique_item_state UNIQUE (sku, bom_id, product_group, state_code)
);

-- Indexes for compliance item states
CREATE INDEX IF NOT EXISTS idx_comp_item_states_sku ON compliance_item_states(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comp_item_states_bom ON compliance_item_states(bom_id) WHERE bom_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comp_item_states_state ON compliance_item_states(state_code);
CREATE INDEX IF NOT EXISTS idx_comp_item_states_status ON compliance_item_states(compliance_status);
CREATE INDEX IF NOT EXISTS idx_comp_item_states_active ON compliance_item_states(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_comp_item_states_expiry ON compliance_item_states(registration_expiry) WHERE registration_expiry IS NOT NULL;

-- ============================================================================
-- PHASE 5: COMPLIANCE DOCUMENT VERSIONS TABLE
-- ============================================================================

-- Track document version history
CREATE TABLE IF NOT EXISTS compliance_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Document reference
  document_id UUID NOT NULL REFERENCES compliance_documents(id) ON DELETE CASCADE,

  -- Version info
  version_number INTEGER NOT NULL,
  file_path TEXT,
  file_url TEXT,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  file_hash TEXT,

  -- Change tracking
  change_summary TEXT,
  change_type TEXT                         -- 'minor_update', 'major_revision', 'correction', 'renewal'
    CHECK (change_type IN ('minor_update', 'major_revision', 'correction', 'renewal', 'initial')),

  -- Status at time of version
  status_at_version compliance_document_status,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,

  CONSTRAINT unique_doc_version UNIQUE (document_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_doc_versions_document ON compliance_document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_versions_created ON compliance_document_versions(created_at DESC);

-- ============================================================================
-- PHASE 6: DOCUMENT REVIEW WORKFLOW TABLE
-- ============================================================================

-- Track document review and approval workflow
CREATE TABLE IF NOT EXISTS compliance_document_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Document reference
  document_id UUID NOT NULL REFERENCES compliance_documents(id) ON DELETE CASCADE,

  -- Review details
  review_type TEXT NOT NULL                -- 'internal', 'external', 'agency', 'legal', 'final'
    CHECK (review_type IN ('internal', 'external', 'agency', 'legal', 'final')),

  -- Reviewer info
  reviewer_name TEXT NOT NULL,
  reviewer_email TEXT,
  reviewer_role TEXT,
  reviewer_organization TEXT,

  -- Review outcome
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'changes_requested', 'skipped')),

  -- Dates
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  due_date DATE,
  completed_at TIMESTAMPTZ,

  -- Feedback
  comments TEXT,
  requested_changes TEXT[],

  -- Attachments
  attachment_urls TEXT[],

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_doc_reviews_document ON compliance_document_reviews(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_reviews_status ON compliance_document_reviews(review_status);
CREATE INDEX IF NOT EXISTS idx_doc_reviews_reviewer ON compliance_document_reviews(reviewer_name);
CREATE INDEX IF NOT EXISTS idx_doc_reviews_due ON compliance_document_reviews(due_date) WHERE review_status = 'pending';

-- ============================================================================
-- PHASE 7: COMPLIANCE ALERTS TABLE
-- ============================================================================

-- Track alerts for expirations, renewals, changes
CREATE TABLE IF NOT EXISTS compliance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Alert source
  document_id UUID REFERENCES compliance_documents(id) ON DELETE SET NULL,
  item_state_id UUID REFERENCES compliance_item_states(id) ON DELETE SET NULL,
  regulation_id UUID,                      -- Reference to state_regulations if applicable

  -- Alert details
  alert_type TEXT NOT NULL
    CHECK (alert_type IN (
      'expiration_warning',     -- Document/registration expiring soon
      'expired',                -- Document/registration has expired
      'renewal_due',            -- Time to renew
      'regulation_change',      -- Underlying regulation changed
      'new_requirement',        -- New requirement added
      'review_due',             -- Periodic review needed
      'missing_document',       -- Required document not on file
      'compliance_issue',       -- Compliance problem detected
      'custom'                  -- Custom alert
    )),

  -- Priority
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),

  -- Content
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_required TEXT,
  action_deadline DATE,

  -- State scope
  applicable_states TEXT[] DEFAULT '{}',

  -- Products affected
  affected_skus TEXT[] DEFAULT '{}',
  affected_bom_ids UUID[] DEFAULT '{}',

  -- Status
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'acknowledged', 'resolved', 'snoozed', 'dismissed')),
  snoozed_until DATE,

  -- Resolution
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_notes TEXT,

  -- Notifications
  notification_sent BOOLEAN DEFAULT FALSE,
  notification_sent_at TIMESTAMPTZ,
  notification_recipients TEXT[],

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_comp_alerts_document ON compliance_alerts(document_id) WHERE document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comp_alerts_type ON compliance_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_comp_alerts_severity ON compliance_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_comp_alerts_status ON compliance_alerts(status);
CREATE INDEX IF NOT EXISTS idx_comp_alerts_deadline ON compliance_alerts(action_deadline) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_comp_alerts_states ON compliance_alerts USING GIN(applicable_states);

-- ============================================================================
-- PHASE 8: HELPER FUNCTIONS
-- ============================================================================

-- Get all documents for a product (SKU or BOM)
CREATE OR REPLACE FUNCTION get_product_compliance_documents(
  p_sku TEXT DEFAULT NULL,
  p_bom_id UUID DEFAULT NULL,
  p_state_code TEXT DEFAULT NULL,
  p_document_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  document_id UUID,
  document_name TEXT,
  document_type compliance_document_type,
  document_number TEXT,
  status compliance_document_status,
  relationship_type TEXT,
  effective_date DATE,
  expiration_date DATE,
  file_url TEXT,
  applicable_states TEXT[],
  agency_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cd.id as document_id,
    cd.document_name,
    cd.document_type,
    cd.document_number,
    cd.status,
    pcd.relationship_type,
    COALESCE(pcd.effective_date, cd.effective_date) as effective_date,
    COALESCE(pcd.expiration_date, cd.expiration_date) as expiration_date,
    cd.file_url,
    COALESCE(pcd.applicable_states, cd.applicable_states) as applicable_states,
    cd.agency_name
  FROM compliance_documents cd
  JOIN product_compliance_documents pcd ON pcd.document_id = cd.id
  WHERE
    pcd.is_active = TRUE
    AND cd.status NOT IN ('rejected', 'archived')
    AND (p_sku IS NULL OR pcd.sku = p_sku)
    AND (p_bom_id IS NULL OR pcd.bom_id = p_bom_id)
    AND (p_state_code IS NULL OR
         p_state_code = ANY(COALESCE(pcd.applicable_states, cd.applicable_states)) OR
         cd.is_national = TRUE OR
         array_length(COALESCE(pcd.applicable_states, cd.applicable_states), 1) IS NULL)
    AND (p_document_type IS NULL OR cd.document_type::text = p_document_type)
  ORDER BY pcd.priority DESC, cd.document_type, cd.document_name;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get compliance status summary for a product across states
CREATE OR REPLACE FUNCTION get_product_compliance_summary(
  p_sku TEXT DEFAULT NULL,
  p_bom_id UUID DEFAULT NULL
)
RETURNS TABLE (
  state_code TEXT,
  state_name TEXT,
  compliance_status TEXT,
  is_registered BOOLEAN,
  registration_expiry DATE,
  document_count INTEGER,
  missing_document_types TEXT[],
  alerts_count INTEGER,
  last_assessment DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cis.state_code,
    scr.state_name,
    cis.compliance_status,
    cis.is_registered,
    cis.registration_expiry,
    (SELECT COUNT(*)::integer FROM product_compliance_documents pcd
     JOIN compliance_documents cd ON cd.id = pcd.document_id
     WHERE (p_sku IS NULL OR pcd.sku = p_sku)
       AND (p_bom_id IS NULL OR pcd.bom_id = p_bom_id)
       AND (cis.state_code = ANY(COALESCE(pcd.applicable_states, cd.applicable_states)) OR cd.is_national = TRUE)
       AND pcd.is_active = TRUE)::integer as document_count,
    ARRAY[]::text[] as missing_document_types,  -- Would need business logic to determine
    (SELECT COUNT(*)::integer FROM compliance_alerts ca
     WHERE ca.status = 'active'
       AND (p_sku IS NULL OR p_sku = ANY(ca.affected_skus))
       AND (cis.state_code = ANY(ca.applicable_states) OR array_length(ca.applicable_states, 1) IS NULL))::integer as alerts_count,
    cis.last_assessment_date::date as last_assessment
  FROM compliance_item_states cis
  LEFT JOIN state_compliance_ratings scr ON scr.state_code = cis.state_code
  WHERE
    cis.is_active = TRUE
    AND (p_sku IS NULL OR cis.sku = p_sku)
    AND (p_bom_id IS NULL OR cis.bom_id = p_bom_id)
  ORDER BY cis.market_priority DESC, cis.state_code;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get expiring documents
CREATE OR REPLACE FUNCTION get_expiring_documents(
  p_days_ahead INTEGER DEFAULT 30,
  p_state_code TEXT DEFAULT NULL
)
RETURNS TABLE (
  document_id UUID,
  document_name TEXT,
  document_type compliance_document_type,
  document_number TEXT,
  expiration_date DATE,
  days_until_expiry INTEGER,
  applicable_states TEXT[],
  affected_products JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cd.id as document_id,
    cd.document_name,
    cd.document_type,
    cd.document_number,
    cd.expiration_date,
    (cd.expiration_date - CURRENT_DATE)::integer as days_until_expiry,
    cd.applicable_states,
    (SELECT jsonb_agg(jsonb_build_object(
      'sku', pcd.sku,
      'bom_id', pcd.bom_id,
      'relationship', pcd.relationship_type
    ))
    FROM product_compliance_documents pcd
    WHERE pcd.document_id = cd.id AND pcd.is_active = TRUE) as affected_products
  FROM compliance_documents cd
  WHERE
    cd.status = 'approved'
    AND cd.expiration_date IS NOT NULL
    AND cd.expiration_date <= CURRENT_DATE + p_days_ahead
    AND cd.expiration_date >= CURRENT_DATE
    AND (p_state_code IS NULL OR p_state_code = ANY(cd.applicable_states) OR cd.is_national = TRUE)
  ORDER BY cd.expiration_date ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Generate expiration alerts
CREATE OR REPLACE FUNCTION generate_expiration_alerts()
RETURNS INTEGER AS $$
DECLARE
  v_alert_count INTEGER := 0;
  v_doc RECORD;
BEGIN
  -- Documents expiring within reminder period
  FOR v_doc IN
    SELECT
      cd.id,
      cd.document_name,
      cd.document_number,
      cd.expiration_date,
      cd.renewal_reminder_days,
      cd.applicable_states,
      (cd.expiration_date - CURRENT_DATE) as days_until
    FROM compliance_documents cd
    WHERE
      cd.status = 'approved'
      AND cd.expiration_date IS NOT NULL
      AND cd.expiration_date <= CURRENT_DATE + cd.renewal_reminder_days
      AND cd.expiration_date >= CURRENT_DATE
      AND NOT EXISTS (
        SELECT 1 FROM compliance_alerts ca
        WHERE ca.document_id = cd.id
          AND ca.alert_type IN ('expiration_warning', 'renewal_due')
          AND ca.status = 'active'
      )
  LOOP
    INSERT INTO compliance_alerts (
      document_id,
      alert_type,
      severity,
      title,
      message,
      action_required,
      action_deadline,
      applicable_states,
      affected_skus,
      created_by
    )
    SELECT
      v_doc.id,
      CASE WHEN v_doc.days_until <= 7 THEN 'expiration_warning' ELSE 'renewal_due' END,
      CASE
        WHEN v_doc.days_until <= 7 THEN 'critical'
        WHEN v_doc.days_until <= 14 THEN 'high'
        ELSE 'medium'
      END,
      'Document Expiring: ' || v_doc.document_name,
      format('Document "%s" (No. %s) expires on %s (%s days remaining)',
        v_doc.document_name,
        COALESCE(v_doc.document_number, 'N/A'),
        v_doc.expiration_date,
        v_doc.days_until),
      'Review document and initiate renewal process if needed',
      v_doc.expiration_date,
      v_doc.applicable_states,
      ARRAY(SELECT pcd.sku FROM product_compliance_documents pcd WHERE pcd.document_id = v_doc.id AND pcd.sku IS NOT NULL),
      'system';

    v_alert_count := v_alert_count + 1;
  END LOOP;

  -- Mark expired documents
  UPDATE compliance_documents
  SET
    status = 'expired',
    status_changed_at = NOW(),
    status_changed_by = 'system',
    status_notes = 'Auto-expired: expiration date passed'
  WHERE
    status = 'approved'
    AND expiration_date IS NOT NULL
    AND expiration_date < CURRENT_DATE;

  RETURN v_alert_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PHASE 9: VIEWS
-- ============================================================================

-- Comprehensive document overview
CREATE OR REPLACE VIEW compliance_documents_overview AS
SELECT
  cd.id,
  cd.document_name,
  cd.document_type,
  cd.document_number,
  cd.status,
  cd.regulatory_category,
  cd.agency_name,
  cd.effective_date,
  cd.expiration_date,
  CASE
    WHEN cd.expiration_date IS NULL THEN NULL
    WHEN cd.expiration_date < CURRENT_DATE THEN 0
    ELSE cd.expiration_date - CURRENT_DATE
  END as days_until_expiry,
  cd.applicable_states,
  cd.is_national,
  cd.file_url,
  cd.version,
  cd.tags,
  cd.created_at,
  cd.updated_at,
  (SELECT COUNT(*) FROM product_compliance_documents pcd WHERE pcd.document_id = cd.id AND pcd.is_active = TRUE) as linked_products_count,
  (SELECT COUNT(*) FROM compliance_document_reviews cdr WHERE cdr.document_id = cd.id AND cdr.review_status = 'pending') as pending_reviews_count,
  (SELECT COUNT(*) FROM compliance_alerts ca WHERE ca.document_id = cd.id AND ca.status = 'active') as active_alerts_count
FROM compliance_documents cd
WHERE cd.status NOT IN ('archived');

COMMENT ON VIEW compliance_documents_overview IS 'Comprehensive view of compliance documents with related counts and expiration tracking';

-- Product compliance status overview
CREATE OR REPLACE VIEW product_compliance_overview AS
SELECT
  COALESCE(cis.sku, cis.bom_id::text, cis.product_group) as product_identifier,
  cis.sku,
  cis.bom_id,
  cis.product_group,
  COUNT(DISTINCT cis.state_code) as total_states,
  COUNT(DISTINCT CASE WHEN cis.compliance_status = 'compliant' THEN cis.state_code END) as compliant_states,
  COUNT(DISTINCT CASE WHEN cis.compliance_status = 'non_compliant' THEN cis.state_code END) as non_compliant_states,
  COUNT(DISTINCT CASE WHEN cis.compliance_status IN ('pending', 'needs_attention') THEN cis.state_code END) as attention_needed_states,
  COUNT(DISTINCT CASE WHEN cis.is_registered THEN cis.state_code END) as registered_states,
  MIN(cis.registration_expiry) as next_expiring_registration,
  array_agg(DISTINCT cis.state_code ORDER BY cis.state_code) as active_states,
  MAX(cis.last_assessment_date) as last_assessment
FROM compliance_item_states cis
WHERE cis.is_active = TRUE
GROUP BY
  COALESCE(cis.sku, cis.bom_id::text, cis.product_group),
  cis.sku,
  cis.bom_id,
  cis.product_group;

COMMENT ON VIEW product_compliance_overview IS 'Summary of compliance status across states for each product';

-- Active alerts dashboard
CREATE OR REPLACE VIEW compliance_alerts_dashboard AS
SELECT
  ca.id,
  ca.alert_type,
  ca.severity,
  ca.title,
  ca.message,
  ca.action_required,
  ca.action_deadline,
  ca.applicable_states,
  ca.affected_skus,
  ca.status,
  ca.created_at,
  cd.document_name,
  cd.document_type,
  cd.document_number
FROM compliance_alerts ca
LEFT JOIN compliance_documents cd ON cd.id = ca.document_id
WHERE ca.status = 'active'
ORDER BY
  CASE ca.severity
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
    ELSE 5
  END,
  ca.action_deadline NULLS LAST,
  ca.created_at DESC;

COMMENT ON VIEW compliance_alerts_dashboard IS 'Active compliance alerts sorted by severity and deadline';

-- State compliance matrix
CREATE OR REPLACE VIEW state_compliance_matrix AS
SELECT
  scr.state_code,
  scr.state_name,
  scr.strictness_level,
  scr.strictness_score,
  scr.registration_required,
  (SELECT COUNT(*) FROM compliance_item_states cis WHERE cis.state_code = scr.state_code AND cis.is_active = TRUE) as active_products,
  (SELECT COUNT(*) FROM compliance_item_states cis WHERE cis.state_code = scr.state_code AND cis.compliance_status = 'compliant') as compliant_products,
  (SELECT COUNT(*) FROM compliance_item_states cis WHERE cis.state_code = scr.state_code AND cis.is_registered = TRUE) as registered_products,
  (SELECT COUNT(*) FROM compliance_documents cd WHERE scr.state_code = ANY(cd.applicable_states) AND cd.status = 'approved') as document_count,
  (SELECT COUNT(*) FROM compliance_alerts ca WHERE scr.state_code = ANY(ca.applicable_states) AND ca.status = 'active') as active_alerts
FROM state_compliance_ratings scr
ORDER BY scr.strictness_score DESC, scr.state_code;

COMMENT ON VIEW state_compliance_matrix IS 'Compliance status matrix by state with document and alert counts';

-- ============================================================================
-- PHASE 10: ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE compliance_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_compliance_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_item_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_document_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_alerts ENABLE ROW LEVEL SECURITY;

-- Policies for compliance_documents
CREATE POLICY "Allow authenticated read on compliance_documents" ON compliance_documents
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated insert on compliance_documents" ON compliance_documents
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated update on compliance_documents" ON compliance_documents
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Policies for product_compliance_documents
CREATE POLICY "Allow authenticated read on product_compliance_documents" ON product_compliance_documents
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated write on product_compliance_documents" ON product_compliance_documents
  FOR ALL USING (auth.role() = 'authenticated');

-- Policies for compliance_item_states
CREATE POLICY "Allow authenticated read on compliance_item_states" ON compliance_item_states
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated write on compliance_item_states" ON compliance_item_states
  FOR ALL USING (auth.role() = 'authenticated');

-- Policies for document versions
CREATE POLICY "Allow authenticated read on compliance_document_versions" ON compliance_document_versions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated insert on compliance_document_versions" ON compliance_document_versions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Policies for reviews
CREATE POLICY "Allow authenticated read on compliance_document_reviews" ON compliance_document_reviews
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated write on compliance_document_reviews" ON compliance_document_reviews
  FOR ALL USING (auth.role() = 'authenticated');

-- Policies for alerts
CREATE POLICY "Allow authenticated read on compliance_alerts" ON compliance_alerts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated write on compliance_alerts" ON compliance_alerts
  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- PHASE 11: COMMENTS
-- ============================================================================

COMMENT ON TABLE compliance_documents IS 'Central repository for all compliance documents: artwork, certificates, registrations, test reports, statutes, letters';
COMMENT ON TABLE product_compliance_documents IS 'Links compliance documents to specific products (SKUs, BOMs, or product groups)';
COMMENT ON TABLE compliance_item_states IS 'Tracks per-product, per-state compliance status and registration details';
COMMENT ON TABLE compliance_document_versions IS 'Version history for compliance documents';
COMMENT ON TABLE compliance_document_reviews IS 'Review workflow tracking for compliance documents';
COMMENT ON TABLE compliance_alerts IS 'Alerts for expirations, renewals, compliance issues';

COMMENT ON COLUMN compliance_documents.document_type IS 'Type: artwork, certificate, registration, test_report, statute, guidance, letter, sds, etc.';
COMMENT ON COLUMN compliance_documents.applicable_states IS 'State codes where document applies (empty = all states, use is_national for federal)';
COMMENT ON COLUMN compliance_documents.extracted_text IS 'OCR or AI-extracted text content for searchability';
COMMENT ON COLUMN compliance_item_states.compliance_status IS 'Per-state compliance status: compliant, pending, needs_attention, non_compliant, exempt';
COMMENT ON COLUMN compliance_item_states.special_requirements IS 'State-specific requirements that apply to this product';
COMMENT ON COLUMN product_compliance_documents.relationship_type IS 'How document relates to product: applies_to, required_for, certification, artwork, test_result, registration';

-- ============================================================================
-- PHASE 12: VERIFICATION
-- ============================================================================

DO $$
DECLARE
  v_tables INTEGER;
  v_functions INTEGER;
  v_views INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_tables
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'compliance_documents',
      'product_compliance_documents',
      'compliance_item_states',
      'compliance_document_versions',
      'compliance_document_reviews',
      'compliance_alerts'
    );

  SELECT COUNT(*) INTO v_functions
  FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_name IN (
      'get_product_compliance_documents',
      'get_product_compliance_summary',
      'get_expiring_documents',
      'generate_expiration_alerts'
    );

  SELECT COUNT(*) INTO v_views
  FROM information_schema.views
  WHERE table_schema = 'public'
    AND table_name IN (
      'compliance_documents_overview',
      'product_compliance_overview',
      'compliance_alerts_dashboard',
      'state_compliance_matrix'
    );

  RAISE NOTICE 'Migration 107 completed successfully!';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Tables created: %/6', v_tables;
  RAISE NOTICE 'Functions created: %/4', v_functions;
  RAISE NOTICE 'Views created: %/4', v_views;
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Features:';
  RAISE NOTICE '  - Compliance document storage with versioning';
  RAISE NOTICE '  - Product-document correlation';
  RAISE NOTICE '  - Per-product state selection and tracking';
  RAISE NOTICE '  - Review workflow';
  RAISE NOTICE '  - Automated expiration alerts';
  RAISE NOTICE '  - Full-text search on documents';
  RAISE NOTICE '============================================';
END $$;
