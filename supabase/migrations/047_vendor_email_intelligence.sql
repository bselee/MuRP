-- ============================================================================
-- 047_vendor_email_intelligence.sql
-- Builds unified vendor communication history + AI controls
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_response_status') THEN
    CREATE TYPE vendor_response_status AS ENUM (
      'pending_response',
      'vendor_responded',
      'verified_confirmed',
      'verified_with_issues',
      'requires_clarification',
      'vendor_non_responsive',
      'cancelled'
    );
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Purchase Order columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchase_orders
  ALTER COLUMN follow_up_status DROP DEFAULT;

ALTER TABLE public.purchase_orders
  ALTER COLUMN follow_up_status TYPE vendor_response_status
  USING (
    CASE
      WHEN follow_up_status IS NULL THEN 'pending_response'
      WHEN follow_up_status::text = 'awaiting_vendor' THEN 'pending_response'
      WHEN follow_up_status::text = 'awaiting_invoice' THEN 'pending_response'
      WHEN follow_up_status::text = 'response_received' THEN 'vendor_responded'
      WHEN follow_up_status::text = 'resolved' THEN 'verified_confirmed'
      WHEN follow_up_status::text = 'escalated' THEN 'requires_clarification'
      ELSE 'pending_response'
    END
  );

ALTER TABLE public.purchase_orders
  ALTER COLUMN follow_up_status SET DEFAULT 'pending_response';

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS vendor_response_status vendor_response_status DEFAULT 'pending_response';

UPDATE public.purchase_orders
  SET vendor_response_status = follow_up_status
  WHERE vendor_response_status IS NULL;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS vendor_response_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vendor_response_email_id TEXT,
  ADD COLUMN IF NOT EXISTS vendor_response_thread_id TEXT,
  ADD COLUMN IF NOT EXISTS vendor_response_summary JSONB,
  ADD COLUMN IF NOT EXISTS verification_required BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_notes TEXT,
  ADD COLUMN IF NOT EXISTS escalation_level INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_follow_up_due_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_follow_up_status
  ON public.purchase_orders(follow_up_status);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor_response_received
  ON public.purchase_orders(vendor_response_received_at)
  WHERE vendor_response_received_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Vendor communications ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.po_vendor_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  communication_type TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  stage INTEGER,
  gmail_message_id TEXT UNIQUE,
  gmail_thread_id TEXT,
  subject TEXT,
  body_preview TEXT,
  sender_email TEXT,
  recipient_email TEXT,
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  attachments JSONB,
  metadata JSONB,
  extracted_data JSONB,
  ai_confidence NUMERIC(5,2),
  ai_cost_usd NUMERIC(10,4),
  ai_extracted BOOLEAN DEFAULT FALSE,
  correlation_confidence NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_vendor_comms_po
  ON public.po_vendor_communications(po_id);

CREATE INDEX IF NOT EXISTS idx_po_vendor_comms_thread
  ON public.po_vendor_communications(gmail_thread_id)
  WHERE gmail_thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_po_vendor_comms_direction
  ON public.po_vendor_communications(direction);

CREATE INDEX IF NOT EXISTS idx_po_vendor_comms_created
  ON public.po_vendor_communications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_po_vendor_comms_ai_extracted
  ON public.po_vendor_communications(ai_extracted)
  WHERE ai_extracted = TRUE;

COMMENT ON TABLE public.po_vendor_communications IS
  'Normalized inbound/outbound vendor email history with AI extraction metadata.';

ALTER TABLE public.po_vendor_communications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "po_vendor_comms_select" ON public.po_vendor_communications;
CREATE POLICY "po_vendor_comms_select"
  ON public.po_vendor_communications
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "po_vendor_comms_insert" ON public.po_vendor_communications;
CREATE POLICY "po_vendor_comms_insert"
  ON public.po_vendor_communications
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Backfill legacy timeline entries
-- ---------------------------------------------------------------------------
INSERT INTO public.po_vendor_communications (
  po_id,
  communication_type,
  direction,
  gmail_message_id,
  gmail_thread_id,
  subject,
  body_preview,
  sender_email,
  recipient_email,
  sent_at,
  attachments,
  metadata
)
SELECT
  pet.po_id,
  'historical' AS communication_type,
  'outbound' AS direction,
  pet.gmail_message_id,
  pet.gmail_thread_id,
  COALESCE(pet.metadata ->> 'subject', 'Purchase Order Update'),
  COALESCE(pet.metadata ->> 'bodyPreview', pet.metadata ->> 'notes'),
  pet.metadata ->> 'from',
  COALESCE(pet.vendor_email, pet.metadata ->> 'to'),
  pet.sent_at,
  NULL,
  pet.metadata
FROM public.po_email_tracking AS pet
WHERE pet.gmail_message_id IS NOT NULL
ON CONFLICT (gmail_message_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- AI configuration (app_settings)
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
  'vendor_email_ai_config',
  'purchasing',
  jsonb_build_object(
    'enabled', true,
    'maxEmailsPerHour', 60,
    'maxDailyCostUsd', 1.50,
    'minConfidence', 0.65,
    'keywordFilters', ARRAY['tracking','shipped','delivery','invoice','confirm'],
    'maxBodyCharacters', 16000
  ),
  'Vendor Email Intelligence',
  'Controls AI parsing for vendor replies (rate limits, budgets, keyword filters).',
  FALSE,
  FALSE
)
ON CONFLICT (setting_key) DO NOTHING;
