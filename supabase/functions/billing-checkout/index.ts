import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import Stripe from 'https://esm.sh/stripe@16.6.0?target=deno';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
if (!stripeSecret) {
  console.warn('[billing-checkout] STRIPE_SECRET_KEY not set. All checkout attempts will fail.');
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

type BillingInterval = 'monthly' | 'yearly';

type CheckoutPayload = {
  planId?: string;
  billingInterval?: BillingInterval;
  seatQuantity?: number;
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

    const body = (await req.json().catch(() => ({}))) as CheckoutPayload;
    const planId = body.planId;
    const billingInterval: BillingInterval = body.billingInterval === 'yearly' ? 'yearly' : 'monthly';
    const seatQuantity = body.seatQuantity;
    const returnUrl = body.returnUrl;

    if (!planId) {
      return jsonResponse({ error: 'planId is required' }, 400);
    }

    const { data: plan, error: planError } = await serviceClient
      .from('billing_plans')
      .select('*')
      .eq('plan_id', planId)
      .eq('is_active', true)
      .maybeSingle();

    if (planError || !plan) {
      return jsonResponse({ error: 'Plan not found or inactive' }, 404);
    }

    if ((plan.price_monthly ?? 0) === 0 && (plan.price_yearly ?? 0) === 0) {
      await Promise.all([
        serviceClient
          .from('user_compliance_profiles')
          .upsert(
            {
              user_id: user.id,
              email: user.email ?? '',
              compliance_tier: plan.plan_id,
              subscription_status: 'active',
              stripe_customer_id: null,
            },
            { onConflict: 'user_id' },
          ),
        serviceClient
          .from('user_subscriptions')
          .upsert(
            {
              user_id: user.id,
              plan_id: plan.plan_id,
              stripe_customer_id: 'free-plan',
              status: 'active',
              billing_interval: billingInterval,
              seat_quantity: 1,
            },
            { onConflict: 'user_id' },
          ),
      ]);

      return jsonResponse({ free: true, url: null }, 200);
    }

    if (!stripeSecret) {
      return jsonResponse({ error: 'Stripe not configured' }, 500);
    }

    const priceKey = billingInterval === 'monthly' ? plan.stripe_price_monthly_key : plan.stripe_price_yearly_key;
    if (!priceKey) {
      return jsonResponse({ error: `Stripe price key missing for ${billingInterval}` }, 500);
    }

    const priceId = Deno.env.get(priceKey);
    if (!priceId) {
      return jsonResponse({ error: `Environment variable ${priceKey} is not defined` }, 500);
    }

    const { data: subscriptionRow } = await serviceClient
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let stripeCustomerId = subscriptionRow?.stripe_customer_id ?? null;

    if (!stripeCustomerId || stripeCustomerId === 'free-plan') {
      const existingCustomerId = await getExistingStripeCustomerId(serviceClient, user.id);
      stripeCustomerId = existingCustomerId;

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email ?? undefined,
          metadata: {
            user_id: user.id,
          },
        });
        stripeCustomerId = customer.id;
        await serviceClient
          .from('user_compliance_profiles')
          .upsert(
            {
              user_id: user.id,
              email: user.email ?? '',
              compliance_tier: plan.plan_id === 'full_ai' ? 'full_ai' : 'basic',
              stripe_customer_id: stripeCustomerId,
            },
            { onConflict: 'user_id' },
          );
      }
    }

    const normalizedSeats = Math.max(Number(seatQuantity) || plan.seat_min || 1, plan.seat_min || 1);
    const defaultReturn =
      returnUrl ||
      Deno.env.get('BILLING_PORTAL_RETURN_URL') ||
      `${req.headers.get('Origin') ?? 'https://app.murp.io'}/settings`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      allow_promotion_codes: true,
      success_url: `${defaultReturn}?checkout=success`,
      cancel_url: `${defaultReturn}?checkout=cancelled`,
      metadata: {
        user_id: user.id,
        plan_id: plan.plan_id,
        billing_interval: billingInterval,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan_id: plan.plan_id,
        },
      },
      line_items: [
        {
          price: priceId,
          quantity: normalizedSeats,
        },
      ],
    });

    await serviceClient.from('user_subscriptions').upsert(
      {
        user_id: user.id,
        plan_id: plan.plan_id,
        status: 'pending',
        billing_interval: billingInterval,
        seat_quantity: normalizedSeats,
        stripe_customer_id: stripeCustomerId,
        stripe_checkout_session_id: session.id,
      },
      { onConflict: 'user_id' },
    );

    return jsonResponse({ url: session.url }, 200);
  } catch (error) {
    console.error('[billing-checkout] Unexpected error', error);
    return jsonResponse({ error: 'Unexpected error creating checkout session' }, 500);
  }
});

async function getExistingStripeCustomerId(serviceClient: ReturnType<typeof createClient>, userId: string) {
  const { data } = await serviceClient
    .from('user_compliance_profiles')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.stripe_customer_id ?? null;
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
