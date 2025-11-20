-- 033_po_followup_automation.sql
-- Schema support for automated purchase order follow-ups and vendor performance logging.

-- Table to store follow-up rule definitions (stages, timing, templates)
CREATE TABLE IF NOT EXISTS public.po_followup_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage INTEGER NOT NULL UNIQUE CHECK (stage > 0),
  wait_hours INTEGER NOT NULL CHECK (wait_hours > 0),
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  instructions TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_followup_rules_active
  ON public.po_followup_rules(active);

ALTER TABLE public.po_followup_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_followup_rules_select"
  ON public.po_followup_rules FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "po_followup_rules_modify"
  ON public.po_followup_rules FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Table to log each follow-up send and eventual vendor response
CREATE TABLE IF NOT EXISTS public.vendor_followup_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  stage INTEGER NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  response_latency INTERVAL,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_vendor_followup_po
  ON public.vendor_followup_events(po_id);

CREATE INDEX IF NOT EXISTS idx_vendor_followup_vendor
  ON public.vendor_followup_events(vendor_id);

ALTER TABLE public.vendor_followup_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendor_followup_events_select"
  ON public.vendor_followup_events FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "vendor_followup_events_insert"
  ON public.vendor_followup_events FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "vendor_followup_events_update"
  ON public.vendor_followup_events FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Extend purchase_orders with follow-up tracking metadata
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS last_follow_up_stage INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_follow_up_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS follow_up_required BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS follow_up_status TEXT;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_follow_up
  ON public.purchase_orders(follow_up_required, last_follow_up_stage);

COMMENT ON COLUMN public.purchase_orders.follow_up_status IS 'Describes latest vendor follow-up outcome (e.g. awaiting_reply, escalated, resolved).';
