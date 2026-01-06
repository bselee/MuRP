-- Migration 160: Multi-Invoice Document Extraction Support
--
-- Enhances the invoice extraction system to handle documents containing
-- multiple invoices (e.g., freight carrier statements, vendor monthly statements).
--
-- Changes:
-- 1. Add source_document_id to link split invoices to parent document
-- 2. Add page_reference to track where invoice appears in multi-page docs
-- 3. Add document_type to classify extraction source
-- 4. Update views for multi-invoice visibility

-- ============================================================================
-- ADD COLUMNS FOR MULTI-INVOICE DOCUMENTS
-- ============================================================================

-- source_document_id: Links split invoices back to the original document
ALTER TABLE vendor_invoice_documents
ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES vendor_invoice_documents(id);

-- page_reference: Tracks which page(s) the invoice appears on
ALTER TABLE vendor_invoice_documents
ADD COLUMN IF NOT EXISTS page_reference TEXT;

-- document_type: Classification of the source document type
ALTER TABLE vendor_invoice_documents
ADD COLUMN IF NOT EXISTS document_type TEXT CHECK (document_type IN (
    'single_invoice',           -- Standard single invoice
    'multi_invoice_statement',  -- Consolidated statement with multiple invoices
    'freight_statement',        -- Freight carrier statement (AAA Cooper, FedEx, etc.)
    'unknown'                   -- Unclassified
));

-- vendor_name: Normalized vendor name field (extracted directly)
ALTER TABLE vendor_invoice_documents
ADD COLUMN IF NOT EXISTS vendor_name TEXT;

-- extraction_status: Track extraction pipeline status
ALTER TABLE vendor_invoice_documents
ADD COLUMN IF NOT EXISTS extraction_status TEXT DEFAULT 'pending' CHECK (extraction_status IN (
    'pending',      -- Awaiting extraction
    'processing',   -- Currently being processed
    'extracted',    -- Successfully extracted
    'failed',       -- Extraction failed
    'manual'        -- Requires manual processing
));

-- extracted_data: Full extraction response JSON
ALTER TABLE vendor_invoice_documents
ADD COLUMN IF NOT EXISTS extracted_data JSONB;

-- Create index for split invoice lookups
CREATE INDEX IF NOT EXISTS idx_vendor_invoice_source_doc
ON vendor_invoice_documents(source_document_id)
WHERE source_document_id IS NOT NULL;

-- Create index for document type queries
CREATE INDEX IF NOT EXISTS idx_vendor_invoice_doc_type
ON vendor_invoice_documents(document_type);

-- ============================================================================
-- VIEW: Multi-Invoice Document Summary
-- Shows parent documents with their split invoice children
-- ============================================================================

CREATE OR REPLACE VIEW multi_invoice_documents AS
SELECT
    parent.id as parent_document_id,
    parent.document_type,
    parent.vendor_name as statement_vendor,
    parent.invoice_date as statement_date,
    parent.total_amount as statement_total,
    parent.created_at,
    -- Count of split invoices from this document
    COUNT(child.id) as split_invoice_count,
    -- Sum of split invoice totals
    SUM(child.total_amount) as split_invoices_total,
    -- Array of split invoice IDs
    ARRAY_AGG(child.id ORDER BY child.page_reference) FILTER (WHERE child.id IS NOT NULL) as child_invoice_ids,
    -- Extraction status
    parent.extraction_status,
    -- Source email info
    et.subject as email_subject,
    ea.filename as attachment_filename
FROM vendor_invoice_documents parent
LEFT JOIN vendor_invoice_documents child ON child.source_document_id = parent.id
LEFT JOIN email_attachments ea ON parent.attachment_id = ea.id
LEFT JOIN email_threads et ON parent.email_thread_id = et.id
WHERE parent.source_document_id IS NULL  -- Only parent documents
  AND parent.document_type IN ('multi_invoice_statement', 'freight_statement')
GROUP BY
    parent.id,
    parent.document_type,
    parent.vendor_name,
    parent.invoice_date,
    parent.total_amount,
    parent.created_at,
    parent.extraction_status,
    et.subject,
    ea.filename
ORDER BY parent.created_at DESC;

COMMENT ON VIEW multi_invoice_documents IS
    'Shows documents that contain multiple invoices with their split children';

-- ============================================================================
-- VIEW: Update invoices_pending_review to show split info
-- Must drop and recreate because adding columns to existing view
-- ============================================================================

DROP VIEW IF EXISTS invoices_pending_review;

CREATE VIEW invoices_pending_review AS
SELECT
    vid.id,
    vid.invoice_number,
    vid.invoice_date,
    vid.vendor_name_on_invoice,
    v.name as matched_vendor_name,
    vid.total_amount,
    vid.status,
    vid.has_variances,
    vid.variance_summary,
    vid.matched_po_id,
    vid.po_match_confidence,
    vid.source_inbox_purpose,
    -- Multi-invoice info
    vid.document_type,
    vid.page_reference,
    vid.source_document_id,
    (SELECT COUNT(*) FROM vendor_invoice_documents child WHERE child.source_document_id = vid.id) as child_count,
    -- Email info
    et.subject as email_subject,
    vid.created_at,
    CASE
        WHEN vid.has_variances THEN 'variance'
        WHEN vid.matched_po_id IS NULL THEN 'unmatched'
        ELSE 'review'
    END as review_priority
FROM vendor_invoice_documents vid
LEFT JOIN vendors v ON vid.vendor_id = v.id
LEFT JOIN email_threads et ON vid.email_thread_id = et.id
WHERE vid.status IN ('pending_review', 'variance_detected', 'pending_match')
  AND vid.is_duplicate = FALSE
ORDER BY
    CASE vid.status
        WHEN 'variance_detected' THEN 1
        WHEN 'pending_match' THEN 2
        ELSE 3
    END,
    vid.created_at DESC;

-- ============================================================================
-- FUNCTION: Get invoice extraction summary
-- Returns extraction statistics for monitoring
-- ============================================================================

CREATE OR REPLACE FUNCTION get_invoice_extraction_stats()
RETURNS TABLE (
    total_documents INTEGER,
    single_invoices INTEGER,
    multi_invoice_statements INTEGER,
    freight_statements INTEGER,
    total_split_invoices INTEGER,
    pending_extraction INTEGER,
    extracted_today INTEGER,
    extraction_errors INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*)::INTEGER FROM vendor_invoice_documents),
        (SELECT COUNT(*)::INTEGER FROM vendor_invoice_documents WHERE document_type = 'single_invoice'),
        (SELECT COUNT(*)::INTEGER FROM vendor_invoice_documents WHERE document_type = 'multi_invoice_statement'),
        (SELECT COUNT(*)::INTEGER FROM vendor_invoice_documents WHERE document_type = 'freight_statement'),
        (SELECT COUNT(*)::INTEGER FROM vendor_invoice_documents WHERE source_document_id IS NOT NULL),
        (SELECT COUNT(*)::INTEGER FROM vendor_invoice_documents WHERE extraction_status = 'pending'),
        (SELECT COUNT(*)::INTEGER FROM vendor_invoice_documents WHERE created_at > NOW() - INTERVAL '24 hours' AND extraction_status = 'extracted'),
        (SELECT COUNT(*)::INTEGER FROM vendor_invoice_documents WHERE extraction_status = 'failed');
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_invoice_extraction_stats IS
    'Returns summary statistics for invoice extraction monitoring';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN vendor_invoice_documents.source_document_id IS
    'For split invoices, references the parent document that was split';

COMMENT ON COLUMN vendor_invoice_documents.page_reference IS
    'Page or section reference where this invoice appears in a multi-page document';

COMMENT ON COLUMN vendor_invoice_documents.document_type IS
    'Classification of the source document (single_invoice, multi_invoice_statement, freight_statement)';
