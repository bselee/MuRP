import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import Stripe from 'https://esm.sh/stripe@16.6.0?target=deno';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
if (!stripeSecret) {
  console.warn('[billing-portal] STRIPE_SECRET_KEY not set. Billing portal will be disabled.');
}

const stripe = new Stripe(stripeSecret ?? '', {
  apiVersion: '2024-12-18.acacia',
});

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type PortalPayload = {
  returnUrl?: string;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as PortalPayload;
    const returnUrl =
      body.returnUrl ||
      Deno.env.get('BILLING_PORTAL_RETURN_URL') ||
      `${req.headers.get('Origin') ?? 'https://app.murp.io'}/settings`;

    const { data: subscription } = await serviceClient
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let stripeCustomerId = subscription?.stripe_customer_id ?? null;
    if (!stripeCustomerId || stripeCustomerId === 'free-plan') {
      const { data } = await serviceClient
        .from('user_compliance_profiles')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .maybeSingle();
      stripeCustomerId = data?.stripe_customer_id ?? null;
    }

    if (!stripeCustomerId || stripeCustomerId === 'free-plan') {
      return jsonResponse({ error: 'No billing profile on file' }, 400);
    }

    if (!stripeSecret) {
      return jsonResponse({ error: 'Stripe not configured' }, 500);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${returnUrl}?portal=closed`,
    });

    return jsonResponse({ url: session.url }, 200);
  } catch (error) {
    console.error('[billing-portal] Unexpected error', error);
    return jsonResponse({ error: 'Unexpected error creating billing portal session' }, 500);
  }
});

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
