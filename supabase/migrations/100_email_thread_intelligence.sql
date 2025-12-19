-- Migration 100: Email Thread Intelligence
--
-- Enables deep thread understanding by tracking entire email conversations.
-- Aggregates intelligence across all messages in a thread for better
-- PO correlation, ETA tracking, and status updates.
--
-- Part of: Email Tracking Agent Expansion
-- Goal: NEVER BE OUT OF STOCK

-- ============================================================================
-- EMAIL THREADS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Gmail Identity
    gmail_thread_id TEXT UNIQUE NOT NULL,
    inbox_config_id UUID REFERENCES email_inbox_configs(id) ON DELETE SET NULL,

    -- PO Correlation
    po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    correlation_confidence DECIMAL(3,2),
    correlation_method TEXT CHECK (correlation_method IN (
        'thread_history',      -- Inherited from earlier message in thread
        'subject_match',       -- PO number found in subject
        'body_match',          -- PO number found in body
        'sender_domain',       -- Matched sender domain to vendor
        'ai_inference',        -- AI determined the correlation
        'manual'               -- User manually linked
    )),
    correlation_details JSONB,                             -- Additional context about correlation

    -- Thread Identity
    subject TEXT,
    participants TEXT[],                                   -- All email addresses in thread
    primary_vendor_email TEXT,                             -- The vendor's email in the thread

    -- Thread State
    message_count INTEGER DEFAULT 0,
    inbound_count INTEGER DEFAULT 0,                       -- Messages from vendor
    outbound_count INTEGER DEFAULT 0,                      -- Messages to vendor
    first_message_at TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ,
    last_inbound_at TIMESTAMPTZ,                          -- Last message FROM vendor
    last_outbound_at TIMESTAMPTZ,                         -- Last message TO vendor

    -- Extracted Intelligence (aggregated from all messages)
    tracking_numbers TEXT[],
    carriers TEXT[],
    latest_tracking_status TEXT CHECK (latest_tracking_status IN (
        'pending', 'label_created', 'picked_up', 'in_transit',
        'out_for_delivery', 'delivered', 'exception', 'returned'
    )),
    latest_eta DATE,
    eta_confidence TEXT CHECK (eta_confidence IN ('high', 'medium', 'low')),
    eta_source TEXT,                                       -- Which message provided the ETA

    -- Document Flags
    has_invoice BOOLEAN DEFAULT false,
    invoice_message_id TEXT,                               -- Which message had the invoice
    has_pricelist BOOLEAN DEFAULT false,
    pricelist_message_id TEXT,
    has_packing_slip BOOLEAN DEFAULT false,
    has_tracking_info BOOLEAN DEFAULT false,

    -- Conversation State
    requires_response BOOLEAN DEFAULT false,
    response_due_by TIMESTAMPTZ,
    awaiting_info TEXT,                                    -- What we're waiting for
    last_action_item TEXT,

    -- Urgency & Priority
    urgency_level TEXT DEFAULT 'normal' CHECK (urgency_level IN (
        'low', 'normal', 'high', 'critical'
    )),
    urgency_reason TEXT,
    escalated BOOLEAN DEFAULT false,
    escalated_at TIMESTAMPTZ,
    escalated_to TEXT,                                     -- Agent or user

    -- AI-Generated Summary
    thread_summary TEXT,                                   -- AI summary of conversation
    summary_updated_at TIMESTAMPTZ,
    key_dates JSONB,                                       -- {confirmed: date, shipped: date, eta: date, delivered: date}
    key_amounts JSONB,                                     -- {subtotal: X, shipping: Y, total: Z}
    action_items JSONB,                                    -- [{action: "respond", reason: "...", due: date}]
    sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative', 'urgent')),

    -- Timeline Events (denormalized for quick access)
    timeline JSONB DEFAULT '[]'::jsonb,                    -- [{event, timestamp, message_id, details}]

    -- Resolution
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    resolution_type TEXT CHECK (resolution_type IN (
        'delivered', 'cancelled', 'merged', 'no_action_needed', 'manual_close'
    )),
    resolution_notes TEXT,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- EMAIL THREAD MESSAGES TABLE
-- ============================================================================
-- Individual messages within a thread for detailed analysis

CREATE TABLE IF NOT EXISTS email_thread_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    thread_id UUID REFERENCES email_threads(id) ON DELETE CASCADE,
    gmail_message_id TEXT UNIQUE NOT NULL,

    -- Message Details
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    sender_email TEXT NOT NULL,
    recipient_emails TEXT[],
    cc_emails TEXT[],
    subject TEXT,
    body_preview TEXT,                                     -- First 500 chars
    body_hash TEXT,                                        -- For deduplication

    -- Timestamps
    sent_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ DEFAULT now(),

    -- Attachments
    has_attachments BOOLEAN DEFAULT false,
    attachment_count INTEGER DEFAULT 0,
    attachments JSONB,                                     -- [{filename, mime_type, size}]

    -- AI Extraction
    ai_extracted BOOLEAN DEFAULT false,
    ai_confidence DECIMAL(3,2),
    ai_cost_usd DECIMAL(10,4),
    extracted_data JSONB,                                  -- Full AI extraction result
    response_category TEXT,                                -- Classification result

    -- Extracted Fields (denormalized for queries)
    extracted_tracking_number TEXT,
    extracted_carrier TEXT,
    extracted_eta DATE,
    extracted_status TEXT,
    is_confirmation BOOLEAN DEFAULT false,
    is_delay_notice BOOLEAN DEFAULT false,
    is_backorder_notice BOOLEAN DEFAULT false,
    mentions_price_change BOOLEAN DEFAULT false,

    -- Processing
    processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN (
        'pending', 'processed', 'skipped', 'error'
    )),
    processing_error TEXT,
    routed_to_agent TEXT,

    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Thread indexes
CREATE INDEX IF NOT EXISTS idx_email_threads_gmail ON email_threads(gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_po ON email_threads(po_id) WHERE po_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_threads_vendor ON email_threads(vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_threads_unresolved ON email_threads(is_resolved, last_message_at)
    WHERE is_resolved = false;
CREATE INDEX IF NOT EXISTS idx_email_threads_requires_response ON email_threads(requires_response, response_due_by)
    WHERE requires_response = true;
CREATE INDEX IF NOT EXISTS idx_email_threads_urgency ON email_threads(urgency_level)
    WHERE urgency_level IN ('high', 'critical');
CREATE INDEX IF NOT EXISTS idx_email_threads_inbox ON email_threads(inbox_config_id);

-- Message indexes
CREATE INDEX IF NOT EXISTS idx_thread_messages_thread ON email_thread_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_messages_gmail ON email_thread_messages(gmail_message_id);
CREATE INDEX IF NOT EXISTS idx_thread_messages_sender ON email_thread_messages(sender_email);
CREATE INDEX IF NOT EXISTS idx_thread_messages_pending ON email_thread_messages(processing_status)
    WHERE processing_status = 'pending';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_thread_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read email threads" ON email_threads;
DROP POLICY IF EXISTS "Allow authenticated users to manage email threads" ON email_threads;
DROP POLICY IF EXISTS "Allow authenticated users to read thread messages" ON email_thread_messages;
DROP POLICY IF EXISTS "Allow authenticated users to manage thread messages" ON email_thread_messages;

CREATE POLICY "Allow authenticated users to read email threads"
    ON email_threads FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage email threads"
    ON email_threads FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read thread messages"
    ON email_thread_messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage thread messages"
    ON email_thread_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update thread stats when a message is added
CREATE OR REPLACE FUNCTION update_thread_on_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE email_threads SET
        message_count = message_count + 1,
        inbound_count = inbound_count + CASE WHEN NEW.direction = 'inbound' THEN 1 ELSE 0 END,
        outbound_count = outbound_count + CASE WHEN NEW.direction = 'outbound' THEN 1 ELSE 0 END,
        last_message_at = COALESCE(NEW.sent_at, NEW.received_at, now()),
        last_inbound_at = CASE
            WHEN NEW.direction = 'inbound'
            THEN COALESCE(NEW.received_at, NEW.sent_at, now())
            ELSE last_inbound_at
        END,
        last_outbound_at = CASE
            WHEN NEW.direction = 'outbound'
            THEN COALESCE(NEW.sent_at, now())
            ELSE last_outbound_at
        END,
        first_message_at = COALESCE(
            first_message_at,
            NEW.sent_at,
            NEW.received_at,
            now()
        ),
        -- Update tracking info if extracted
        tracking_numbers = CASE
            WHEN NEW.extracted_tracking_number IS NOT NULL
                AND NOT (tracking_numbers @> ARRAY[NEW.extracted_tracking_number])
            THEN array_append(COALESCE(tracking_numbers, ARRAY[]::TEXT[]), NEW.extracted_tracking_number)
            ELSE tracking_numbers
        END,
        carriers = CASE
            WHEN NEW.extracted_carrier IS NOT NULL
                AND NOT (carriers @> ARRAY[NEW.extracted_carrier])
            THEN array_append(COALESCE(carriers, ARRAY[]::TEXT[]), NEW.extracted_carrier)
            ELSE carriers
        END,
        latest_eta = COALESCE(NEW.extracted_eta, latest_eta),
        latest_tracking_status = COALESCE(NEW.extracted_status, latest_tracking_status),
        has_tracking_info = has_tracking_info OR (NEW.extracted_tracking_number IS NOT NULL),
        updated_at = now()
    WHERE id = NEW.thread_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS thread_message_insert ON email_thread_messages;
CREATE TRIGGER thread_message_insert
    AFTER INSERT ON email_thread_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_thread_on_message();

-- Function to find or create thread for a Gmail message
CREATE OR REPLACE FUNCTION find_or_create_email_thread(
    p_gmail_thread_id TEXT,
    p_inbox_config_id UUID DEFAULT NULL,
    p_subject TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_thread_id UUID;
BEGIN
    -- Try to find existing thread
    SELECT id INTO v_thread_id
    FROM email_threads
    WHERE gmail_thread_id = p_gmail_thread_id;

    IF v_thread_id IS NOT NULL THEN
        RETURN v_thread_id;
    END IF;

    -- Create new thread
    INSERT INTO email_threads (
        gmail_thread_id,
        inbox_config_id,
        subject
    ) VALUES (
        p_gmail_thread_id,
        p_inbox_config_id,
        p_subject
    )
    RETURNING id INTO v_thread_id;

    RETURN v_thread_id;
END;
$$ LANGUAGE plpgsql;

-- Function to correlate thread to PO
CREATE OR REPLACE FUNCTION correlate_thread_to_po(
    p_thread_id UUID,
    p_po_id UUID,
    p_confidence DECIMAL,
    p_method TEXT,
    p_details JSONB DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_vendor_id UUID;
BEGIN
    -- Get vendor from PO
    SELECT vendor_id INTO v_vendor_id
    FROM purchase_orders
    WHERE id = p_po_id;

    -- Update thread
    UPDATE email_threads SET
        po_id = p_po_id,
        vendor_id = v_vendor_id,
        correlation_confidence = p_confidence,
        correlation_method = p_method,
        correlation_details = COALESCE(p_details, correlation_details),
        updated_at = now()
    WHERE id = p_thread_id;

    -- Update inbox stats
    UPDATE email_inbox_configs SET
        total_pos_correlated = total_pos_correlated + 1,
        updated_at = now()
    WHERE id = (SELECT inbox_config_id FROM email_threads WHERE id = p_thread_id);
END;
$$ LANGUAGE plpgsql;

-- Function to add timeline event to thread
CREATE OR REPLACE FUNCTION add_thread_timeline_event(
    p_thread_id UUID,
    p_event TEXT,
    p_message_id TEXT DEFAULT NULL,
    p_details JSONB DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    UPDATE email_threads SET
        timeline = timeline || jsonb_build_object(
            'event', p_event,
            'timestamp', now(),
            'message_id', p_message_id,
            'details', p_details
        ),
        updated_at = now()
    WHERE id = p_thread_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get threads requiring attention
CREATE OR REPLACE FUNCTION get_threads_requiring_attention()
RETURNS TABLE (
    thread_id UUID,
    po_id UUID,
    po_number TEXT,
    vendor_name TEXT,
    subject TEXT,
    urgency_level TEXT,
    requires_response BOOLEAN,
    response_due_by TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ,
    days_waiting INTEGER,
    action_needed TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        et.id as thread_id,
        et.po_id,
        po.order_id as po_number,
        v.name as vendor_name,
        et.subject,
        et.urgency_level,
        et.requires_response,
        et.response_due_by,
        et.last_message_at,
        EXTRACT(DAY FROM now() - et.last_inbound_at)::INTEGER as days_waiting,
        CASE
            WHEN et.urgency_level = 'critical' THEN 'CRITICAL: Immediate attention required'
            WHEN et.requires_response AND et.response_due_by < now() THEN 'OVERDUE: Response required'
            WHEN et.requires_response THEN 'Response required by ' || to_char(et.response_due_by, 'Mon DD')
            WHEN et.is_delay_notice THEN 'Review delay notice'
            WHEN et.is_backorder_notice THEN 'Review backorder notice'
            ELSE 'Review thread'
        END as action_needed
    FROM email_threads et
    LEFT JOIN purchase_orders po ON po.id = et.po_id
    LEFT JOIN vendors v ON v.id = et.vendor_id
    WHERE et.is_resolved = false
      AND (
          et.urgency_level IN ('high', 'critical')
          OR et.requires_response = true
          OR et.is_delay_notice = true
          OR et.is_backorder_notice = true
      )
    ORDER BY
        CASE et.urgency_level
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 3
            ELSE 4
        END,
        et.response_due_by NULLS LAST,
        et.last_message_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEW: Thread Summary for Dashboard
-- ============================================================================

CREATE OR REPLACE VIEW email_thread_summary AS
SELECT
    et.id,
    et.gmail_thread_id,
    et.subject,
    et.po_id,
    po.order_id as po_number,
    et.vendor_id,
    v.name as vendor_name,
    et.message_count,
    et.last_message_at,
    et.latest_tracking_status,
    et.latest_eta,
    et.has_invoice,
    et.has_tracking_info,
    et.requires_response,
    et.urgency_level,
    et.is_resolved,
    et.thread_summary,
    et.correlation_confidence,
    CASE
        WHEN et.is_resolved THEN 'resolved'
        WHEN et.urgency_level = 'critical' THEN 'critical'
        WHEN et.requires_response AND et.response_due_by < now() THEN 'overdue'
        WHEN et.requires_response THEN 'awaiting_response'
        WHEN et.latest_tracking_status IN ('in_transit', 'out_for_delivery') THEN 'in_transit'
        WHEN et.latest_tracking_status = 'delivered' THEN 'delivered'
        ELSE 'active'
    END as thread_status
FROM email_threads et
LEFT JOIN purchase_orders po ON po.id = et.po_id
LEFT JOIN vendors v ON v.id = et.vendor_id;

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_email_thread_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS email_threads_updated_at ON email_threads;
CREATE TRIGGER email_threads_updated_at
    BEFORE UPDATE ON email_threads
    FOR EACH ROW
    EXECUTE FUNCTION update_email_thread_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE email_threads IS
    'Tracks entire email conversations (threads) for deep intelligence extraction and PO correlation.';

COMMENT ON TABLE email_thread_messages IS
    'Individual messages within a thread, with AI extraction results.';

COMMENT ON COLUMN email_threads.timeline IS
    'Denormalized timeline of events in the thread for quick rendering: [{event, timestamp, message_id, details}]';

COMMENT ON COLUMN email_threads.key_dates IS
    'Important dates extracted from thread: {confirmed, shipped, eta, delivered}';

COMMENT ON FUNCTION find_or_create_email_thread IS
    'Idempotent function to get or create a thread record for a Gmail thread ID';

COMMENT ON FUNCTION correlate_thread_to_po IS
    'Links a thread to a PO with confidence and method tracking';

COMMENT ON FUNCTION get_threads_requiring_attention IS
    'Returns threads needing human attention, sorted by urgency';
