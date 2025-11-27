-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 052: Vendor Response Workbench
-- ═══════════════════════════════════════════════════════════════════════════
-- Description: Intelligent vendor response management system with AI triage,
--              response categorization, action recommendations, and draft replies
-- Created: 2025-11-27
--
-- Features:
-- - Response category classification (price_change, out_of_stock, etc.)
-- - AI-suggested actions and draft responses
-- - Response draft storage for human review/editing
-- - Approval workflow tracking
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- Response Category Enumeration
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_response_category') THEN
    CREATE TYPE vendor_response_category AS ENUM (
      'shipment_confirmation',    -- Tracking info, shipped notification
      'delivery_update',          -- In transit, out for delivery, delivered
      'delivery_exception',       -- Delay, damage, refused, returned
      'price_change',             -- Price increase/decrease notification
      'out_of_stock',             -- Item unavailable, backorder
      'substitution_offer',       -- Alternative product suggested
      'invoice_attached',         -- Invoice/billing document
      'order_confirmation',       -- PO acknowledged/confirmed
      'lead_time_update',         -- Expected date changed
      'general_inquiry',          -- Questions, requests for info
      'thank_you',                -- Simple acknowledgment
      'other'                     -- Uncategorized
    );
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Suggested Action Enumeration
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_suggested_action') THEN
    CREATE TYPE vendor_suggested_action AS ENUM (
      'acknowledge_receipt',      -- Simple thank you response
      'confirm_acceptance',       -- Accept pricing/terms/substitution
      'request_clarification',    -- Need more information
      'approve_pricing',          -- Approve price change
      'reject_pricing',           -- Decline price change
      'update_inventory',         -- Adjust stock levels based on info
      'escalate_to_manager',      -- Needs management decision
      'forward_to_ap',            -- Send to accounts payable
      'update_po_tracking',       -- Update PO with tracking info
      'create_backorder',         -- Handle out of stock situation
      'no_action_required',       -- Informational only
      'review_required'           -- Human review needed
    );
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Extend po_vendor_communications with response workbench fields
-- ---------------------------------------------------------------------------
ALTER TABLE public.po_vendor_communications
  ADD COLUMN IF NOT EXISTS response_category vendor_response_category,
  ADD COLUMN IF NOT EXISTS suggested_action vendor_suggested_action,
  ADD COLUMN IF NOT EXISTS action_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS requires_user_action BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS user_action_taken_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS user_action_taken_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS user_action_type TEXT,
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dismissed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS dismiss_reason TEXT;

-- Index for response queue queries
CREATE INDEX IF NOT EXISTS idx_po_vendor_comms_requires_action
  ON public.po_vendor_communications(requires_user_action)
  WHERE requires_user_action = TRUE AND dismissed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_po_vendor_comms_response_category
  ON public.po_vendor_communications(response_category)
  WHERE response_category IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Vendor Response Drafts Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendor_response_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id UUID NOT NULL REFERENCES public.po_vendor_communications(id) ON DELETE CASCADE,
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  
  -- Draft content
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  signature TEXT,
  
  -- AI generation metadata
  ai_generated BOOLEAN DEFAULT TRUE,
  ai_model TEXT,
  ai_confidence NUMERIC(5,2),
  ai_cost_usd NUMERIC(10,4),
  generation_context JSONB,
  
  -- Template reference (if based on template)
  template_id UUID REFERENCES public.email_templates(id),
  template_type TEXT,
  
  -- User edits
  user_edited BOOLEAN DEFAULT FALSE,
  edited_by UUID REFERENCES auth.users(id),
  edited_at TIMESTAMPTZ,
  original_body TEXT,
  
  -- Approval workflow
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'sent', 'discarded')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  
  -- Sending metadata
  sent_at TIMESTAMPTZ,
  sent_by UUID REFERENCES auth.users(id),
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vendor_response_drafts_communication
  ON public.vendor_response_drafts(communication_id);

CREATE INDEX IF NOT EXISTS idx_vendor_response_drafts_po
  ON public.vendor_response_drafts(po_id);

CREATE INDEX IF NOT EXISTS idx_vendor_response_drafts_status
  ON public.vendor_response_drafts(status)
  WHERE status IN ('draft', 'pending_review');

-- Comments
COMMENT ON TABLE public.vendor_response_drafts IS
  'AI-generated and user-edited draft responses to vendor communications';

COMMENT ON COLUMN public.po_vendor_communications.response_category IS
  'AI-classified category of the vendor communication';

COMMENT ON COLUMN public.po_vendor_communications.suggested_action IS
  'AI-recommended action to take for this communication';

COMMENT ON COLUMN public.po_vendor_communications.requires_user_action IS
  'Flag indicating this communication needs human review/response';

-- ---------------------------------------------------------------------------
-- Response Templates for Common Scenarios
-- ---------------------------------------------------------------------------
INSERT INTO public.email_templates (
  template_name,
  template_type,
  subject_line,
  body_template,
  signature,
  is_default
) VALUES 
(
  'Shipment Acknowledgment',
  'response_shipment',
  'Re: {{original_subject}}',
  'Hi {{vendor_contact}},

Thank you for the tracking information on PO #{{po_number}}.

Tracking: {{tracking_number}} via {{carrier}}
Expected Delivery: {{expected_delivery}}

We''ll monitor the shipment and reach out if any issues arise.

Best regards,',
  '{{company_name}}
{{user_name}}',
  TRUE
),
(
  'Price Change Acknowledgment',
  'response_pricing',
  'Re: {{original_subject}}',
  'Hi {{vendor_contact}},

Thank you for notifying us about the pricing update for PO #{{po_number}}.

{{#if approved}}
We have reviewed and approved the revised pricing:
- Previous: {{previous_price}}
- New: {{new_price}}

Please proceed with the order at the updated rate.
{{else}}
We need to review this internally before proceeding. Our purchasing team will follow up within 1-2 business days.
{{/if}}

Best regards,',
  '{{company_name}}
{{user_name}}',
  TRUE
),
(
  'Out of Stock Response',
  'response_backorder',
  'Re: {{original_subject}}',
  'Hi {{vendor_contact}},

Thank you for the update regarding stock availability on PO #{{po_number}}.

{{#if accept_backorder}}
We understand that {{item_name}} is currently out of stock. Please proceed with backordering and notify us when available.

New expected date: {{new_expected_date}}
{{else}}
We need to source this item elsewhere. Please remove {{item_name}} from PO #{{po_number}} and update the total accordingly.
{{/if}}

Best regards,',
  '{{company_name}}
{{user_name}}',
  TRUE
),
(
  'Simple Thank You',
  'response_thank_you',
  'Re: {{original_subject}}',
  'Hi {{vendor_contact}},

Got it, thank you for the update!

Best,',
  '{{user_name}}',
  TRUE
),
(
  'Request Clarification',
  'response_clarification',
  'Re: {{original_subject}}',
  'Hi {{vendor_contact}},

Thanks for your message regarding PO #{{po_number}}.

Could you please clarify the following:
{{clarification_points}}

This will help us process your update accurately.

Best regards,',
  '{{company_name}}
{{user_name}}',
  TRUE
)
ON CONFLICT DO NOTHING;

-- Add template variables for response templates
INSERT INTO public.template_variables (variable_name, variable_key, description, example_value, applies_to) VALUES
  ('Original Subject', '{{original_subject}}', 'Subject line of the original vendor email', 'Re: PO-12345 Shipping Confirmation', ARRAY['email']),
  ('Vendor Contact', '{{vendor_contact}}', 'Vendor contact person name', 'Sarah', ARRAY['email']),
  ('Tracking Number', '{{tracking_number}}', 'Shipment tracking number', '1Z999AA10123456784', ARRAY['email']),
  ('Carrier', '{{carrier}}', 'Shipping carrier name', 'UPS', ARRAY['email']),
  ('Expected Delivery', '{{expected_delivery}}', 'Expected delivery date', 'December 2, 2025', ARRAY['email']),
  ('Previous Price', '{{previous_price}}', 'Original quoted price', '$25.50', ARRAY['email']),
  ('New Price', '{{new_price}}', 'Updated/new price', '$27.00', ARRAY['email']),
  ('Item Name', '{{item_name}}', 'Product/item description', 'Organic Substrate Mix', ARRAY['email']),
  ('New Expected Date', '{{new_expected_date}}', 'Revised expected delivery date', 'December 15, 2025', ARRAY['email']),
  ('User Name', '{{user_name}}', 'Current user name for signature', 'John Smith', ARRAY['email']),
  ('Clarification Points', '{{clarification_points}}', 'Points needing clarification', '1. Confirm quantity\n2. Verify SKU', ARRAY['email'])
ON CONFLICT (variable_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.vendor_response_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendor_response_drafts_select" ON public.vendor_response_drafts;
CREATE POLICY "vendor_response_drafts_select"
  ON public.vendor_response_drafts
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "vendor_response_drafts_insert" ON public.vendor_response_drafts;
CREATE POLICY "vendor_response_drafts_insert"
  ON public.vendor_response_drafts
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "vendor_response_drafts_update" ON public.vendor_response_drafts;
CREATE POLICY "vendor_response_drafts_update"
  ON public.vendor_response_drafts
  FOR UPDATE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "vendor_response_drafts_delete" ON public.vendor_response_drafts;
CREATE POLICY "vendor_response_drafts_delete"
  ON public.vendor_response_drafts
  FOR DELETE
  USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Update Trigger
-- ---------------------------------------------------------------------------
CREATE TRIGGER vendor_response_drafts_updated_at
  BEFORE UPDATE ON public.vendor_response_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_template_updated_at();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.vendor_response_drafts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vendor_response_drafts TO authenticated;

-- ---------------------------------------------------------------------------
-- App Settings for Response Workbench
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (
  setting_key,
  setting_category,
  setting_value,
  display_name,
  description,
  is_secret,
  is_required
)
VALUES (
  'vendor_response_workbench_config',
  'purchasing',
  jsonb_build_object(
    'enabled', true,
    'autoGenerateDrafts', true,
    'requireApprovalForSend', true,
    'autoSendCategories', ARRAY[]::text[],
    'escalationThresholdDays', 3,
    'defaultResponseTimeHours', 24,
    'aiDraftModel', 'claude-3-5-haiku-20241022',
    'maxDraftCostUsd', 0.50
  ),
  'Vendor Response Workbench',
  'Configuration for intelligent vendor response management',
  FALSE,
  FALSE
)
ON CONFLICT (setting_key) DO NOTHING;
