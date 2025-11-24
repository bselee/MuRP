-- 043_po_followup_campaigns.sql
-- Introduce campaign-based PO follow-up flows so we can run different email sequences per scenario.

CREATE TABLE IF NOT EXISTS public.po_followup_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('tracking_missing', 'invoice_missing', 'custom')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_po_followup_campaigns_name
  ON public.po_followup_campaigns(name);

ALTER TABLE public.po_followup_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_followup_campaigns_select"
  ON public.po_followup_campaigns FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "po_followup_campaigns_admin_insert"
  ON public.po_followup_campaigns FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.role = 'Admin'
    )
  );

CREATE POLICY "po_followup_campaigns_admin_update"
  ON public.po_followup_campaigns FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.role = 'Admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.role = 'Admin'
    )
  );

-- Seed the two core campaigns (tracking + invoice) if they do not already exist.
INSERT INTO public.po_followup_campaigns (name, description, trigger_type)
VALUES
  (
    'Tracking / No Response',
    'Escalate vendors who have not provided tracking numbers after a PO is sent.',
    'tracking_missing'
  ),
  (
    'Invoice Collection',
    'Nudge vendors for invoices after goods are received so accounting can close the PO.',
    'invoice_missing'
  )
ON CONFLICT (name) DO NOTHING;

-- Extend follow-up rules so each stage belongs to a campaign.
ALTER TABLE public.po_followup_rules
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.po_followup_campaigns(id) ON DELETE CASCADE;

DO $$
DECLARE
  tracking_id UUID;
BEGIN
  SELECT id INTO tracking_id
  FROM public.po_followup_campaigns
  WHERE trigger_type = 'tracking_missing'
  ORDER BY created_at
  LIMIT 1;

  UPDATE public.po_followup_rules
  SET campaign_id = tracking_id
  WHERE campaign_id IS NULL;
END $$;

ALTER TABLE public.po_followup_rules
  ALTER COLUMN campaign_id SET NOT NULL;

-- Remove the global unique constraint on stage and scope it to campaign instead.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'po_followup_rules_stage_key'
  ) THEN
    ALTER TABLE public.po_followup_rules
      DROP CONSTRAINT po_followup_rules_stage_key;
  END IF;
END $$;

ALTER TABLE public.po_followup_rules
  ADD CONSTRAINT po_followup_rules_campaign_stage_key
  UNIQUE (campaign_id, stage);

-- Campaign-specific status tracker per PO
CREATE TABLE IF NOT EXISTS public.po_followup_campaign_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.po_followup_campaigns(id) ON DELETE CASCADE,
  last_stage INTEGER NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (po_id, campaign_id)
);

ALTER TABLE public.po_followup_campaign_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_followup_campaign_state_select"
  ON public.po_followup_campaign_state FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "po_followup_campaign_state_service_write"
  ON public.po_followup_campaign_state FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Track which campaign generated each follow-up event
ALTER TABLE public.vendor_followup_events
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.po_followup_campaigns(id) ON DELETE SET NULL;

-- Backfill campaign state using the legacy columns on purchase_orders for the tracking campaign.
WITH tracking AS (
  SELECT id FROM public.po_followup_campaigns
  WHERE trigger_type = 'tracking_missing'
  ORDER BY created_at
  LIMIT 1
)
INSERT INTO public.po_followup_campaign_state (po_id, campaign_id, last_stage, last_sent_at, status)
SELECT
  po.id,
  tracking.id,
  COALESCE(po.last_follow_up_stage, 0),
  po.last_follow_up_sent_at,
  po.follow_up_status
FROM public.purchase_orders po
CROSS JOIN tracking
ON CONFLICT (po_id, campaign_id) DO NOTHING;

-- Provide default invoice-reminder stages if they do not exist yet.
WITH invoice_campaign AS (
  SELECT id FROM public.po_followup_campaigns
  WHERE trigger_type = 'invoice_missing'
  ORDER BY created_at
  LIMIT 1
)
INSERT INTO public.po_followup_rules (campaign_id, stage, wait_hours, subject_template, body_template, instructions, active)
SELECT
  invoice_campaign.id,
  rules.stage,
  rules.wait_hours,
  rules.subject_template,
  rules.body_template,
  rules.instructions,
  TRUE
FROM invoice_campaign,
LATERAL (
  VALUES
    (
      1,
      48,
      'Invoice request for PO #{{po_number}}',
      'Hi {{vendor_name}},\n\nThanks again for fulfilling PO #{{po_number}}. We have received the goods and just need the invoice to close out accounting.\n\nCould you reply with the invoice PDF or confirm when it will be available?',
      'Reply on this thread with the invoice or send it to ap@murp.app and mention the PO number so we can auto-match it.'
    ),
    (
      2,
      120,
      'Reminder: invoice needed for PO #{{po_number}}',
      'Following up on our prior request for the invoice on PO #{{po_number}}. The materials landed {{order_age_days}} days ago and we still need paperwork to close our books.',
      'If there was a change in amount or ship quantities include that note so we can reconcile quickly.'
    )
) AS rules(stage, wait_hours, subject_template, body_template, instructions)
ON CONFLICT (campaign_id, stage) DO NOTHING;
