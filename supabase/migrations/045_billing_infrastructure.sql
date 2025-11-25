-- ====================================================================
-- Billing Infrastructure (Plans, Subscriptions, Events)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.billing_plans (
  plan_id TEXT PRIMARY KEY,
  marketing_name TEXT NOT NULL,
  description TEXT,
  seat_min INTEGER NOT NULL DEFAULT 1,
  seat_increment INTEGER NOT NULL DEFAULT 1,
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_yearly NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_unit TEXT NOT NULL DEFAULT 'seat',
  stripe_price_monthly_key TEXT,
  stripe_price_yearly_key TEXT,
  is_addon BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.billing_plans(plan_id),
  status TEXT NOT NULL DEFAULT 'pending',
  billing_interval TEXT NOT NULL DEFAULT 'monthly',
  seat_quantity INTEGER NOT NULL DEFAULT 1,
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT,
  stripe_checkout_session_id TEXT,
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.billing_plans(plan_id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_billing_plans_active ON public.billing_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON public.user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan ON public.user_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_user ON public.subscription_events(user_id);

-- Row level security -------------------------------------------------------
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_plans are readable" ON public.billing_plans
  FOR SELECT
  USING (TRUE);

CREATE POLICY "users read own subscriptions" ON public.user_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users read own subscription events" ON public.subscription_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Seed plans ---------------------------------------------------------------
INSERT INTO public.billing_plans (plan_id, marketing_name, description, seat_min, seat_increment, price_monthly, price_yearly, price_unit, stripe_price_monthly_key, stripe_price_yearly_key, is_addon, metadata)
VALUES
  ('basic', 'Basic', 'Single-seat core workspace', 1, 1, 0, 0, 'seat', NULL, NULL, FALSE, jsonb_build_object('tagline', 'Manual compliance + inventory backbone')),
  ('ops_pod', 'Ops Pod', 'Multi-seat purchasing + ops workspace', 3, 1, 140, 95, 'seat', 'STRIPE_PRICE_OPS_POD_MONTHLY', 'STRIPE_PRICE_OPS_POD_YEARLY', FALSE, jsonb_build_object('tagline', 'Auto-POs, Shopify ingestion, calendar push')),
  ('full_ai', 'Plant Control (Full AI)', 'AI compliance + Gmail automation', 1, 1, 49, 49, 'seat', 'STRIPE_PRICE_FULL_AI_MONTHLY', 'STRIPE_PRICE_FULL_AI_YEARLY', TRUE, jsonb_build_object('tagline', '50 AI scans/month, OCR, AI copilots')),
  ('enterprise', 'Enterprise', 'Private tenant + governance package', 10, 1, 0, 0, 'org', 'STRIPE_PRICE_ENTERPRISE_MONTHLY', 'STRIPE_PRICE_ENTERPRISE_YEARLY', FALSE, jsonb_build_object('tagline', 'Custom hosting, SSO, dedicated CS'))
ON CONFLICT (plan_id) DO UPDATE SET
  marketing_name = EXCLUDED.marketing_name,
  description = EXCLUDED.description,
  seat_min = EXCLUDED.seat_min,
  seat_increment = EXCLUDED.seat_increment,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  price_unit = EXCLUDED.price_unit,
  stripe_price_monthly_key = EXCLUDED.stripe_price_monthly_key,
  stripe_price_yearly_key = EXCLUDED.stripe_price_yearly_key,
  is_addon = EXCLUDED.is_addon,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();
