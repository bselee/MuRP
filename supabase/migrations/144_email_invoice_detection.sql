-- ============================================================================
-- Migration 144: Email Invoice Detection & Processing
-- ============================================================================
--
-- Adds invoice detection to email processing flow:
-- 1. Detect invoice attachments (PDF, images)
-- 2. Extract invoice data (number, amounts, line items)
-- 3. Match to PO and detect variances
-- 4. Deduplication across purchasing/accounting inboxes
-- 5. Separate handling for invoices vs statements
--
-- Flow: Email arrives -> Detect attachment type -> Extract data ->
--       Match to PO -> Calculate variances -> Create review task
-- ============================================================================

-- ============================================================================
-- ADD INBOX_PURPOSE TO INBOX CONFIG IF MISSING
-- ============================================================================

-- Ensure inbox_purpose column exists (may already exist from 109)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'email_inbox_configs' AND column_name = 'inbox_purpose'
    ) THEN
        ALTER TABLE email_inbox_configs
            ADD COLUMN inbox_purpose TEXT DEFAULT 'purchasing'
            CHECK (inbox_purpose IN ('purchasing', 'accounting', 'general'));
    END IF;
END $$;

-- ============================================================================
-- EMAIL ATTACHMENTS TABLE
-- Track attachments for deduplication and processing
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to message
    message_id UUID REFERENCES email_thread_messages(id) ON DELETE CASCADE,
    thread_id UUID REFERENCES email_threads(id) ON DELETE CASCADE,
    gmail_attachment_id TEXT,

    -- Attachment metadata
    filename TEXT NOT NULL,
    mime_type TEXT,
    file_size INTEGER,

    -- Content hash for deduplication
    content_hash TEXT,  -- SHA-256 of attachment content

    -- Classification
    attachment_type TEXT CHECK (attachment_type IN (
        'invoice',      -- Vendor invoice
        'statement',    -- Account statement
        'packing_slip', -- Shipping packing slip
        'pod',          -- Proof of delivery
        'quote',        -- Price quote
        'credit_memo',  -- Credit/refund document
        'other'         -- Unclassified
    )),
    classification_confidence DECIMAL(3,2),

    -- Processing status
    processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN (
        'pending',      -- Not yet processed
        'processing',   -- Currently being processed
        'extracted',    -- Data extracted successfully
        'failed',       -- Extraction failed
        'skipped',      -- Skipped (duplicate, irrelevant)
        'manual'        -- Requires manual processing
    )),
    processing_error TEXT,

    -- Storage (if we download)
    storage_path TEXT,  -- Path in Supabase storage

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_attachments_message ON email_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_email_attachments_thread ON email_attachments(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_attachments_hash ON email_attachments(content_hash);
CREATE INDEX IF NOT EXISTS idx_email_attachments_type ON email_attachments(attachment_type);
CREATE INDEX IF NOT EXISTS idx_email_attachments_status ON email_attachments(processing_status);

-- ============================================================================
-- INVOICE DOCUMENT TABLE (distinct from po_invoice_data which is PO-linked)
-- Stores raw invoice documents before PO matching
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendor_invoice_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Source tracking
    attachment_id UUID REFERENCES email_attachments(id),
    email_thread_id UUID REFERENCES email_threads(id),
    source_inbox_id UUID REFERENCES email_inbox_configs(id),
    source_inbox_purpose TEXT,  -- 'purchasing' or 'accounting'

    -- Deduplication
    invoice_hash TEXT,  -- Hash of invoice# + vendor + amount for dedup
    is_duplicate BOOLEAN DEFAULT FALSE,
    duplicate_of UUID REFERENCES vendor_invoice_documents(id),

    -- Extracted invoice data
    invoice_number TEXT,
    invoice_date DATE,
    due_date DATE,

    -- Vendor (as appears on invoice)
    vendor_name_on_invoice TEXT,
    vendor_address TEXT,
    vendor_id UUID REFERENCES vendors(id),  -- Matched vendor

    -- Amounts
    subtotal DECIMAL(12,2),
    tax_amount DECIMAL(12,2),
    shipping_amount DECIMAL(12,2),
    total_amount DECIMAL(12,2),
    currency TEXT DEFAULT 'USD',

    -- Line items (JSONB array)
    line_items JSONB DEFAULT '[]'::jsonb,

    -- PO matching
    matched_po_id UUID,  -- Can be purchase_orders or finale_purchase_orders
    po_match_confidence DECIMAL(3,2),
    po_match_method TEXT,  -- 'invoice_ref', 'po_number', 'vendor_date', 'ai'

    -- Processing
    extraction_method TEXT DEFAULT 'pending',  -- 'pending', 'ai', 'ocr', 'manual'
    extraction_confidence DECIMAL(3,2),
    raw_extraction JSONB,  -- Full extraction response

    -- Review workflow
    status TEXT DEFAULT 'pending_extraction' CHECK (status IN (
        'pending_extraction',  -- Awaiting data extraction
        'pending_match',       -- Extracted, awaiting PO match
        'pending_review',      -- Matched, awaiting human review
        'variance_detected',   -- Has variances needing resolution
        'approved',            -- Approved for payment
        'rejected',            -- Rejected (duplicate, invalid, etc.)
        'forwarded_to_ap'      -- Sent to AP system
    )),

    -- Variance summary
    has_variances BOOLEAN DEFAULT FALSE,
    variance_summary JSONB,  -- Quick summary of variances

    -- Resolution
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,

    -- AP forwarding
    ap_forwarded_at TIMESTAMPTZ,
    ap_reference TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_invoice_hash ON vendor_invoice_documents(invoice_hash);
CREATE INDEX IF NOT EXISTS idx_vendor_invoice_thread ON vendor_invoice_documents(email_thread_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invoice_vendor ON vendor_invoice_documents(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invoice_status ON vendor_invoice_documents(status);
CREATE INDEX IF NOT EXISTS idx_vendor_invoice_po ON vendor_invoice_documents(matched_po_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invoice_date ON vendor_invoice_documents(invoice_date DESC);

-- ============================================================================
-- STATEMENT DOCUMENTS TABLE (separate from invoices)
-- Account statements are handled differently - for reference only
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendor_statement_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Source
    attachment_id UUID REFERENCES email_attachments(id),
    email_thread_id UUID REFERENCES email_threads(id),

    -- Vendor
    vendor_name_on_statement TEXT,
    vendor_id UUID REFERENCES vendors(id),

    -- Statement data
    statement_date DATE,
    period_start DATE,
    period_end DATE,

    -- Amounts
    opening_balance DECIMAL(12,2),
    total_invoices DECIMAL(12,2),
    total_payments DECIMAL(12,2),
    total_credits DECIMAL(12,2),
    closing_balance DECIMAL(12,2),

    -- Line items (invoices listed)
    invoice_references JSONB DEFAULT '[]'::jsonb,

    -- Processing
    extraction_method TEXT,
    extraction_confidence DECIMAL(3,2),

    -- Status (statements are informational)
    status TEXT DEFAULT 'received' CHECK (status IN (
        'received',
        'reviewed',
        'reconciled',
        'discrepancy_found'
    )),

    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_statement_vendor ON vendor_statement_documents(vendor_id);

-- ============================================================================
-- FUNCTION: Check for duplicate invoice
-- ============================================================================

CREATE OR REPLACE FUNCTION check_invoice_duplicate(
    p_invoice_number TEXT,
    p_vendor_name TEXT,
    p_total_amount DECIMAL,
    p_invoice_date DATE
)
RETURNS TABLE (
    is_duplicate BOOLEAN,
    existing_id UUID,
    match_type TEXT
) AS $$
DECLARE
    v_hash TEXT;
    v_existing UUID;
BEGIN
    -- Create hash for comparison
    v_hash := encode(
        sha256(
            (COALESCE(p_invoice_number, '') || '|' ||
             LOWER(COALESCE(p_vendor_name, '')) || '|' ||
             COALESCE(p_total_amount::TEXT, '') || '|' ||
             COALESCE(p_invoice_date::TEXT, ''))::bytea
        ),
        'hex'
    );

    -- Check by exact hash match
    SELECT id INTO v_existing
    FROM vendor_invoice_documents
    WHERE invoice_hash = v_hash
      AND is_duplicate = FALSE
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
        RETURN QUERY SELECT TRUE, v_existing, 'exact_hash'::TEXT;
        RETURN;
    END IF;

    -- Check by invoice number + vendor (fuzzy)
    IF p_invoice_number IS NOT NULL AND p_invoice_number != '' THEN
        SELECT id INTO v_existing
        FROM vendor_invoice_documents
        WHERE invoice_number = p_invoice_number
          AND (vendor_name_on_invoice ILIKE '%' || p_vendor_name || '%'
               OR p_vendor_name ILIKE '%' || vendor_name_on_invoice || '%')
          AND is_duplicate = FALSE
        LIMIT 1;

        IF v_existing IS NOT NULL THEN
            RETURN QUERY SELECT TRUE, v_existing, 'invoice_vendor_match'::TEXT;
            RETURN;
        END IF;
    END IF;

    -- No duplicate found
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Match invoice to PO
-- ============================================================================

CREATE OR REPLACE FUNCTION match_invoice_to_po(
    p_invoice_id UUID
)
RETURNS TABLE (
    po_id UUID,
    po_table TEXT,
    confidence DECIMAL,
    match_method TEXT
) AS $$
DECLARE
    v_invoice RECORD;
    v_po_id UUID;
    v_confidence DECIMAL;
    v_method TEXT;
BEGIN
    -- Get invoice details
    SELECT * INTO v_invoice FROM vendor_invoice_documents WHERE id = p_invoice_id;

    IF v_invoice IS NULL THEN
        RETURN;
    END IF;

    -- Method 1: Check if PO# is in invoice reference field (common)
    -- Look for patterns like "PO-12345" or "PO #12345" in line items or raw data

    -- Method 2: Match by vendor + date range + approximate amount
    -- Try finale_purchase_orders first
    SELECT fpo.id, 0.85::DECIMAL
    INTO v_po_id, v_confidence
    FROM finale_purchase_orders fpo
    WHERE (
        -- Vendor name match
        fpo.vendor_name ILIKE '%' || v_invoice.vendor_name_on_invoice || '%'
        OR v_invoice.vendor_name_on_invoice ILIKE '%' || fpo.vendor_name || '%'
    )
    AND (
        -- Date within reasonable range (30 days before invoice date)
        fpo.order_date BETWEEN (v_invoice.invoice_date - INTERVAL '45 days') AND v_invoice.invoice_date
    )
    AND (
        -- Amount within 10% tolerance
        ABS(fpo.total - v_invoice.total_amount) / GREATEST(fpo.total, 0.01) < 0.10
    )
    AND fpo.status NOT IN ('RECEIVED', 'COMPLETED', 'CANCELED')
    ORDER BY
        ABS(fpo.total - v_invoice.total_amount) ASC,
        fpo.order_date DESC
    LIMIT 1;

    IF v_po_id IS NOT NULL THEN
        RETURN QUERY SELECT v_po_id, 'finale_purchase_orders'::TEXT, v_confidence, 'vendor_date_amount'::TEXT;
        RETURN;
    END IF;

    -- Try purchase_orders
    SELECT po.id, 0.80::DECIMAL
    INTO v_po_id, v_confidence
    FROM purchase_orders po
    WHERE (
        po.supplier_name ILIKE '%' || v_invoice.vendor_name_on_invoice || '%'
        OR v_invoice.vendor_name_on_invoice ILIKE '%' || po.supplier_name || '%'
    )
    AND (
        po.created_at BETWEEN (v_invoice.invoice_date - INTERVAL '45 days') AND (v_invoice.invoice_date + INTERVAL '1 day')
    )
    AND (
        ABS(po.total_amount - v_invoice.total_amount) / GREATEST(po.total_amount, 0.01) < 0.10
    )
    AND po.status NOT IN ('received', 'completed', 'cancelled')
    ORDER BY
        ABS(po.total_amount - v_invoice.total_amount) ASC
    LIMIT 1;

    IF v_po_id IS NOT NULL THEN
        RETURN QUERY SELECT v_po_id, 'purchase_orders'::TEXT, v_confidence, 'vendor_date_amount'::TEXT;
        RETURN;
    END IF;

    -- No match found
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Process invoice variances
-- ============================================================================

CREATE OR REPLACE FUNCTION process_invoice_variances(
    p_invoice_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_invoice RECORD;
    v_po RECORD;
    v_variances JSONB := '[]'::jsonb;
    v_has_variances BOOLEAN := FALSE;
    v_shipping_diff DECIMAL;
    v_tax_diff DECIMAL;
    v_total_diff DECIMAL;
BEGIN
    -- Get invoice
    SELECT * INTO v_invoice FROM vendor_invoice_documents WHERE id = p_invoice_id;

    IF v_invoice.matched_po_id IS NULL THEN
        RETURN jsonb_build_object('error', 'No matched PO');
    END IF;

    -- Try to get PO from finale_purchase_orders first
    SELECT * INTO v_po FROM finale_purchase_orders WHERE id = v_invoice.matched_po_id;

    IF v_po IS NULL THEN
        SELECT * INTO v_po FROM purchase_orders WHERE id = v_invoice.matched_po_id;
    END IF;

    IF v_po IS NULL THEN
        RETURN jsonb_build_object('error', 'PO not found');
    END IF;

    -- Check shipping variance
    v_shipping_diff := COALESCE(v_invoice.shipping_amount, 0) - COALESCE(v_po.shipping_cost, 0);
    IF ABS(v_shipping_diff) > 0.01 THEN
        v_has_variances := TRUE;
        v_variances := v_variances || jsonb_build_object(
            'type', 'shipping',
            'po_amount', COALESCE(v_po.shipping_cost, 0),
            'invoice_amount', COALESCE(v_invoice.shipping_amount, 0),
            'difference', v_shipping_diff,
            'severity', CASE
                WHEN v_shipping_diff > 50 THEN 'warning'
                ELSE 'info'
            END
        );
    END IF;

    -- Check tax variance
    v_tax_diff := COALESCE(v_invoice.tax_amount, 0) - COALESCE(v_po.tax_amount, 0);
    IF ABS(v_tax_diff) > 0.01 THEN
        v_has_variances := TRUE;
        v_variances := v_variances || jsonb_build_object(
            'type', 'tax',
            'po_amount', COALESCE(v_po.tax_amount, 0),
            'invoice_amount', COALESCE(v_invoice.tax_amount, 0),
            'difference', v_tax_diff,
            'severity', 'info'
        );
    END IF;

    -- Check total variance
    v_total_diff := v_invoice.total_amount - COALESCE(v_po.total, v_po.total_amount);
    IF ABS(v_total_diff) / GREATEST(COALESCE(v_po.total, v_po.total_amount), 0.01) > 0.02 THEN
        v_has_variances := TRUE;
        v_variances := v_variances || jsonb_build_object(
            'type', 'total',
            'po_amount', COALESCE(v_po.total, v_po.total_amount),
            'invoice_amount', v_invoice.total_amount,
            'difference', v_total_diff,
            'percentage', ROUND((v_total_diff / GREATEST(COALESCE(v_po.total, v_po.total_amount), 0.01) * 100)::NUMERIC, 2),
            'severity', CASE
                WHEN ABS(v_total_diff) / GREATEST(COALESCE(v_po.total, v_po.total_amount), 0.01) > 0.05 THEN 'critical'
                ELSE 'warning'
            END
        );
    END IF;

    -- Update invoice record
    UPDATE vendor_invoice_documents
    SET has_variances = v_has_variances,
        variance_summary = v_variances,
        status = CASE
            WHEN v_has_variances THEN 'variance_detected'
            ELSE 'pending_review'
        END,
        updated_at = NOW()
    WHERE id = p_invoice_id;

    RETURN jsonb_build_object(
        'has_variances', v_has_variances,
        'variances', v_variances
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEW: Invoices needing review
-- ============================================================================

CREATE OR REPLACE VIEW invoices_pending_review AS
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
-- RLS POLICIES
-- ============================================================================

ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_invoice_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_statement_documents ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "Allow authenticated read email_attachments"
    ON email_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read vendor_invoice_documents"
    ON vendor_invoice_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read vendor_statement_documents"
    ON vendor_statement_documents FOR SELECT TO authenticated USING (true);

-- Service role has full access
CREATE POLICY "Allow service role all email_attachments"
    ON email_attachments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role all vendor_invoice_documents"
    ON vendor_invoice_documents FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role all vendor_statement_documents"
    ON vendor_statement_documents FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE email_attachments IS
    'Tracks email attachments with content hash for deduplication across inboxes';

COMMENT ON TABLE vendor_invoice_documents IS
    'Invoice documents extracted from emails, matched to POs for 3-way verification';

COMMENT ON TABLE vendor_statement_documents IS
    'Account statements from vendors - informational, separate from invoices';

COMMENT ON FUNCTION check_invoice_duplicate IS
    'Checks if an invoice already exists to prevent duplicate processing from multiple inboxes';

COMMENT ON FUNCTION match_invoice_to_po IS
    'Attempts to match an invoice to a PO using vendor, date, and amount heuristics';

COMMENT ON FUNCTION process_invoice_variances IS
    'Calculates variances between invoice and matched PO for shipping, tax, and total';

-- ============================================================================
-- FLEXIBLE INBOX ROUTING: Cross-Inbox Invoice-PO Correlation
-- ============================================================================
--
-- User requirements:
-- - Single inbox (purchasing): All flows through one inbox
-- - Dual inbox (purchasing + AP): AP handles invoices/statements only
-- - Invoices MUST correlate with POs regardless of which inbox they came from
-- ============================================================================

-- ============================================================================
-- VIEW: All invoices with their PO correlation status
-- Shows invoices from BOTH purchasing and AP inboxes with PO match info
-- ============================================================================

CREATE OR REPLACE VIEW invoice_po_correlation_status AS
SELECT
    vid.id as invoice_id,
    vid.invoice_number,
    vid.invoice_date,
    vid.vendor_name_on_invoice,
    vid.total_amount as invoice_total,
    vid.source_inbox_purpose,
    eic.inbox_name as source_inbox_name,
    vid.status as invoice_status,
    vid.matched_po_id,
    vid.po_match_confidence,
    vid.po_match_method,
    -- PO details (try both tables)
    COALESCE(fpo.order_id, po.order_id) as po_number,
    COALESCE(fpo.vendor_name, po.supplier_name) as po_vendor_name,
    COALESCE(fpo.total, po.total_amount) as po_total,
    COALESCE(fpo.status, po.status) as po_status,
    -- Variance indicators
    vid.has_variances,
    vid.variance_summary,
    -- Deduplication
    vid.is_duplicate,
    vid.duplicate_of,
    -- Timestamps
    vid.created_at,
    vid.updated_at
FROM vendor_invoice_documents vid
LEFT JOIN email_inbox_configs eic ON vid.source_inbox_id = eic.id
LEFT JOIN finale_purchase_orders fpo ON vid.matched_po_id = fpo.id
LEFT JOIN purchase_orders po ON vid.matched_po_id = po.id AND fpo.id IS NULL
ORDER BY vid.created_at DESC;

COMMENT ON VIEW invoice_po_correlation_status IS
    'Shows all invoices with their PO correlation status, regardless of source inbox (purchasing or AP)';

-- ============================================================================
-- FUNCTION: Auto-match unmatched invoices to POs
-- Called periodically to match AP invoices to POs from purchasing
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_match_invoices_to_pos()
RETURNS INTEGER AS $$
DECLARE
    v_matched INTEGER := 0;
    v_invoice RECORD;
    v_match RECORD;
BEGIN
    -- Find invoices pending PO match (typically from AP inbox)
    FOR v_invoice IN
        SELECT id
        FROM vendor_invoice_documents
        WHERE status = 'pending_match'
          AND matched_po_id IS NULL
          AND is_duplicate = FALSE
    LOOP
        -- Try to match using the existing function
        SELECT * INTO v_match FROM match_invoice_to_po(v_invoice.id) LIMIT 1;

        IF v_match.po_id IS NOT NULL THEN
            -- Update invoice with match
            UPDATE vendor_invoice_documents
            SET matched_po_id = v_match.po_id,
                po_match_confidence = v_match.confidence,
                po_match_method = v_match.match_method,
                status = 'pending_review',
                updated_at = NOW()
            WHERE id = v_invoice.id;

            -- Calculate variances
            PERFORM process_invoice_variances(v_invoice.id);

            v_matched := v_matched + 1;
        END IF;
    END LOOP;

    RETURN v_matched;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_match_invoices_to_pos IS
    'Automatically matches invoices (especially from AP inbox) to POs. Run periodically.';

-- ============================================================================
-- VIEW: Inbox Configuration Summary
-- Shows what each inbox is configured to handle
-- ============================================================================

CREATE OR REPLACE VIEW inbox_routing_summary AS
SELECT
    eic.id,
    eic.inbox_name,
    eic.email_address,
    eic.inbox_purpose,
    eic.is_active,
    eic.status,
    eic.total_emails_processed,
    eic.total_pos_correlated,
    -- Count invoices from this inbox
    (SELECT COUNT(*) FROM vendor_invoice_documents vid WHERE vid.source_inbox_id = eic.id) as invoices_detected,
    -- Count statements from this inbox
    (SELECT COUNT(*) FROM vendor_statement_documents vsd
     JOIN email_attachments ea ON vsd.attachment_id = ea.id
     JOIN email_thread_messages etm ON ea.message_id = etm.id
     JOIN email_threads et ON etm.thread_id = et.id
     WHERE et.inbox_config_id = eic.id) as statements_detected,
    -- Routing description
    CASE eic.inbox_purpose
        WHEN 'purchasing' THEN 'Handles: PO correspondence, invoices, tracking, statements'
        WHEN 'accounting' THEN 'Handles: Invoices and statements only (no PO creation)'
        ELSE 'Handles: All email types'
    END as routing_description
FROM email_inbox_configs eic
ORDER BY eic.inbox_purpose, eic.inbox_name;
