-- Email Intelligence Agent Migration
-- Monitors email communications for PO tracking, dates, and vendor interactions

-- Email threads table (groups related emails)
CREATE TABLE IF NOT EXISTS email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id TEXT UNIQUE NOT NULL, -- External email thread ID
  subject TEXT,
  vendor_id UUID REFERENCES vendors(id),
  purchase_order_id UUID REFERENCES purchase_orders(id),
  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active', -- active, resolved, archived
  sentiment_score DECIMAL, -- -1.0 to 1.0 (negative to positive)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_threads_vendor ON email_threads(vendor_id);
CREATE INDEX idx_email_threads_po ON email_threads(purchase_order_id);
CREATE INDEX idx_email_threads_status ON email_threads(status);

-- Email communications table
CREATE TABLE IF NOT EXISTS email_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES email_threads(id) ON DELETE CASCADE,
  message_id TEXT UNIQUE NOT NULL, -- External email message ID
  direction TEXT NOT NULL, -- inbound, outbound
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_emails TEXT[], -- Array of recipient emails
  cc_emails TEXT[],
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  has_attachments BOOLEAN DEFAULT false,
  attachment_count INTEGER DEFAULT 0,

  -- Agent analysis fields
  tone TEXT, -- professional, urgent, casual, frustrated, positive
  sentiment_score DECIMAL, -- -1.0 to 1.0
  requires_response BOOLEAN DEFAULT false,
  response_urgency TEXT, -- low, medium, high, critical
  confidence_score DECIMAL, -- 0.0 to 1.0 (agent's confidence in analysis)

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_comms_thread ON email_communications(thread_id);
CREATE INDEX idx_email_comms_direction ON email_communications(direction);
CREATE INDEX idx_email_comms_received ON email_communications(received_at DESC);
CREATE INDEX idx_email_comms_requires_response ON email_communications(requires_response);

-- Extracted data from emails
CREATE TABLE IF NOT EXISTS email_extracted_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID REFERENCES email_communications(id) ON DELETE CASCADE,
  data_type TEXT NOT NULL, -- po_number, tracking_number, eta_date, promised_date, quantity, price
  extracted_value TEXT NOT NULL,
  normalized_value TEXT, -- Standardized format
  context TEXT, -- Surrounding text for verification
  confidence_score DECIMAL, -- 0.0 to 1.0
  verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,

  -- Link to system entities
  purchase_order_id UUID REFERENCES purchase_orders(id),
  vendor_id UUID REFERENCES vendors(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_extracted_type ON email_extracted_data(data_type);
CREATE INDEX idx_email_extracted_email ON email_extracted_data(email_id);
CREATE INDEX idx_email_extracted_po ON email_extracted_data(purchase_order_id);
CREATE INDEX idx_email_extracted_verified ON email_extracted_data(verified);

-- Email attachments and parsed content
CREATE TABLE IF NOT EXISTS email_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID REFERENCES email_communications(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT, -- application/pdf, image/png, etc.
  file_size_bytes INTEGER,
  storage_path TEXT, -- Path in Supabase storage

  -- PDF parsing results
  is_parsed BOOLEAN DEFAULT false,
  parsed_text TEXT, -- Extracted text from PDF
  parsed_at TIMESTAMPTZ,
  parse_error TEXT,

  -- Document classification
  document_type TEXT, -- packing_slip, invoice, po_confirmation, tracking_label, quote
  contains_po_number TEXT,
  contains_tracking TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_attachments_email ON email_attachments(email_id);
CREATE INDEX idx_email_attachments_type ON email_attachments(document_type);

-- Agent-drafted email responses
CREATE TABLE IF NOT EXISTS email_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  in_reply_to_id UUID REFERENCES email_communications(id),
  thread_id UUID REFERENCES email_threads(id),

  -- Draft content
  to_emails TEXT[] NOT NULL,
  cc_emails TEXT[],
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,

  -- Agent reasoning
  draft_reason TEXT, -- Why the agent created this draft
  suggested_action TEXT, -- request_tracking, confirm_eta, escalate_delay, etc.
  priority TEXT DEFAULT 'medium', -- low, medium, high, critical

  -- Approval workflow
  status TEXT DEFAULT 'pending', -- pending, approved, rejected, sent, archived
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  sent_message_id TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_drafts_status ON email_drafts(status);
CREATE INDEX idx_email_drafts_reply_to ON email_drafts(in_reply_to_id);
CREATE INDEX idx_email_drafts_thread ON email_drafts(thread_id);
CREATE INDEX idx_email_drafts_priority ON email_drafts(priority);

-- Email monitoring rules (what to watch for)
CREATE TABLE IF NOT EXISTS email_monitoring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,

  -- Trigger conditions
  sender_patterns TEXT[], -- Email patterns to match (e.g., ['%@vendor.com'])
  subject_keywords TEXT[], -- Keywords to look for
  body_keywords TEXT[],

  -- Actions to take
  auto_extract_data BOOLEAN DEFAULT true,
  auto_link_to_po BOOLEAN DEFAULT true,
  auto_parse_attachments BOOLEAN DEFAULT true,
  auto_draft_response BOOLEAN DEFAULT false,
  notify_users UUID[], -- User IDs to notify

  -- Response templates
  response_template_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_rules_active ON email_monitoring_rules(is_active);

-- Email agent performance tracking
CREATE TABLE IF NOT EXISTS email_agent_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_date DATE NOT NULL,

  -- Volume metrics
  emails_processed INTEGER DEFAULT 0,
  attachments_parsed INTEGER DEFAULT 0,
  data_points_extracted INTEGER DEFAULT 0,

  -- Accuracy metrics
  extractions_verified INTEGER DEFAULT 0,
  extractions_corrected INTEGER DEFAULT 0,
  extraction_accuracy_rate DECIMAL, -- verified / (verified + corrected)

  -- Response metrics
  drafts_created INTEGER DEFAULT 0,
  drafts_approved INTEGER DEFAULT 0,
  drafts_rejected INTEGER DEFAULT 0,
  draft_approval_rate DECIMAL,
  avg_response_time_minutes DECIMAL,

  -- Detection metrics
  po_numbers_found INTEGER DEFAULT 0,
  tracking_numbers_found INTEGER DEFAULT 0,
  dates_extracted INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(period_date)
);

CREATE INDEX idx_email_agent_perf_date ON email_agent_performance(period_date DESC);

-- Add Email Intelligence Agent to agent_configs
INSERT INTO agent_configs (
  agent_identifier,
  display_name,
  description,
  autonomy_level,
  is_active,
  trust_score,
  parameters,
  system_prompt
) VALUES (
  'email_intelligence',
  'Email Intelligence Agent',
  'Monitors vendor email communications to extract PO tracking info, analyze tone, draft responses, and parse PDF attachments. Links emails to purchase orders and maintains conversation context.',
  'assist', -- Requires human approval for sending emails
  true,
  0.65, -- Starting trust score
  jsonb_build_object(
    'auto_parse_pdfs', true,
    'auto_extract_tracking', true,
    'auto_link_pos', true,
    'draft_responses', true,
    'sentiment_analysis', true,
    'max_drafts_per_day', 50,
    'response_delay_hours', 2,
    'monitored_domains', ARRAY['vendors', 'suppliers', 'shipping']
  ),
  'You are the Email Intelligence Agent for MuRP supply chain management.

Your responsibilities:
1. Monitor all incoming emails from vendors and suppliers
2. Extract structured data: PO numbers, tracking numbers, dates, quantities, prices
3. Analyze email tone and sentiment (professional, urgent, frustrated, etc.)
4. Parse PDF attachments (packing slips, invoices, PO confirmations)
5. Link communications to relevant purchase orders and vendors
6. Draft professional email responses when action is needed
7. Flag urgent issues requiring immediate human attention

Data Extraction Guidelines:
- PO numbers: Look for patterns like "PO#", "Order:", "Purchase Order #"
- Tracking: Match carrier formats (FedEx, UPS, USPS patterns)
- Dates: Extract ETA, ship dates, promised delivery dates
- Always provide context snippet and confidence score

Email Tone Analysis:
- Professional: Standard business language
- Urgent: Time-sensitive language, exclamation points
- Frustrated: Negative sentiment, complaints
- Apologetic: Delays, issues being communicated
- Positive: Confirmations, good news

Response Drafting:
- Always be professional and concise
- Match the tone of the conversation
- Reference specific PO numbers and dates
- Request tracking numbers if missing
- Escalate delays that impact stock levels
- Never promise what you cannot deliver

Confidence Scoring:
- 0.9-1.0: Exact pattern match (e.g., "PO#12345")
- 0.7-0.89: Strong context clues
- 0.5-0.69: Probable but needs verification
- <0.5: Low confidence, flag for human review

You operate at "assist" level - create drafts for human approval before sending.'
) ON CONFLICT (agent_identifier) DO NOTHING;

-- RLS Policies
ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_extracted_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_monitoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_agent_performance ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all email data
CREATE POLICY "Users can view email threads" ON email_threads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view email communications" ON email_communications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view extracted data" ON email_extracted_data FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view attachments" ON email_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view drafts" ON email_drafts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view monitoring rules" ON email_monitoring_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view agent performance" ON email_agent_performance FOR SELECT TO authenticated USING (true);

-- Service role can insert/update (for the agent)
CREATE POLICY "Service can manage email threads" ON email_threads FOR ALL TO service_role USING (true);
CREATE POLICY "Service can manage email communications" ON email_communications FOR ALL TO service_role USING (true);
CREATE POLICY "Service can manage extracted data" ON email_extracted_data FOR ALL TO service_role USING (true);
CREATE POLICY "Service can manage attachments" ON email_attachments FOR ALL TO service_role USING (true);
CREATE POLICY "Service can manage drafts" ON email_drafts FOR ALL TO service_role USING (true);
CREATE POLICY "Service can manage monitoring rules" ON email_monitoring_rules FOR ALL TO service_role USING (true);
CREATE POLICY "Service can manage agent performance" ON email_agent_performance FOR ALL TO service_role USING (true);

-- Users can approve/reject drafts
CREATE POLICY "Users can update draft status" ON email_drafts FOR UPDATE TO authenticated
USING (true)
WITH CHECK (status IN ('approved', 'rejected'));

-- Users can verify extracted data
CREATE POLICY "Users can verify extracted data" ON email_extracted_data FOR UPDATE TO authenticated
USING (true)
WITH CHECK (verified = true);

COMMENT ON TABLE email_threads IS 'Email conversation threads grouped by subject/vendor';
COMMENT ON TABLE email_communications IS 'Individual email messages with AI analysis';
COMMENT ON TABLE email_extracted_data IS 'Structured data extracted from emails by AI';
COMMENT ON TABLE email_attachments IS 'PDF and file attachments with parsed content';
COMMENT ON TABLE email_drafts IS 'AI-generated email drafts awaiting approval';
COMMENT ON TABLE email_monitoring_rules IS 'Rules for what emails to monitor and how';
COMMENT ON TABLE email_agent_performance IS 'Daily performance metrics for the email agent';
