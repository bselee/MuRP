import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import Stripe from 'https://esm.sh/stripe@16.6.0?target=deno';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

if (!stripeSecret || !webhookSecret) {
  console.warn('[billing-webhook] Stripe secrets missing. Webhook will reject requests.');
}

const stripe = new Stripe(stripeSecret ?? '', {
  apiVersion: '2024-12-18.acacia',
});

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
};

type BillingPlanId = 'basic' | 'ops_pod' | 'full_ai' | 'enterprise';

type StripeSubscription = Stripe.Subscription;

type StripeCheckoutSession = Stripe.Checkout.Session;

type SupabaseClient = ReturnType<typeof createClient>;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!stripeSecret || !webhookSecret) {
    return new Response('Stripe not configured', { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? '', webhookSecret);
  } catch (err) {
    console.error('[billing-webhook] Signature verification failed', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as StripeCheckoutSession, serviceClient);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionUpdated(event.data.object as StripeSubscription, serviceClient);
        break;
      case 'invoice.payment_failed':
      case 'invoice.payment_succeeded':
        await recordEvent(serviceClient, extractUserId(event.data.object), extractPlanId(event.data.object), event.type, event.data.object);
        break;
      default:
        console.log('[billing-webhook] Unhandled event type', event.type);
    }
  } catch (err) {
    console.error('[billing-webhook] Handler error', err);
    return new Response('Handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

async function handleCheckoutCompleted(session: StripeCheckoutSession, supabase: SupabaseClient) {
  const userId = session.metadata?.user_id;
  const planId = (session.metadata?.plan_id ?? 'basic') as BillingPlanId;
  const billingInterval = (session.metadata?.billing_interval ?? 'monthly') as 'monthly' | 'yearly';
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;

  if (!userId || !customerId) {
    console.warn('[billing-webhook] Checkout session missing metadata/user.');
    return;
  }

  await supabase
    .from('user_subscriptions')
    .upsert(
      {
        user_id: userId,
        plan_id: planId,
        status: 'checkout_completed',
        billing_interval: billingInterval,
        seat_quantity: session.subscription ? getQuantityFromSession(session) : 1,
        stripe_customer_id: customerId,
        stripe_checkout_session_id: session.id,
      },
      { onConflict: 'user_id' },
    );

  await recordEvent(supabase, userId, planId, 'checkout.session.completed', session);
}

function getQuantityFromSession(session: StripeCheckoutSession) {
  const lineItems = session?.line_items as Stripe.ApiList<Stripe.LineItem> | undefined;
  const firstItem = lineItems?.data?.[0];
  return firstItem?.quantity ?? 1;
}

async function handleSubscriptionUpdated(subscription: StripeSubscription, supabase: SupabaseClient) {
  let userId = subscription.metadata?.user_id ?? null;
  let planId = (subscription.metadata?.plan_id ?? 'basic') as BillingPlanId;

  if (!userId) {
    const { data } = await supabase
      .from('user_subscriptions')
      .select('user_id, plan_id')
      .eq('stripe_subscription_id', subscription.id)
      .maybeSingle();
    userId = data?.user_id ?? null;
    planId = (data?.plan_id ?? planId) as BillingPlanId;
  }

  if (!userId) {
    console.warn('[billing-webhook] Subscription event missing user metadata');
    return;
  }

  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id ?? null;
  const seatQuantity = subscription.items?.data?.[0]?.quantity ?? 1;
  const interval = subscription.items?.data?.[0]?.plan?.interval === 'year' ? 'yearly' : 'monthly';
  const status = subscription.status;

  await supabase
    .from('user_subscriptions')
    .upsert(
      {
        user_id: userId,
        plan_id: planId,
        status,
        billing_interval: interval,
        seat_quantity: seatQuantity,
        stripe_customer_id: customerId ?? undefined,
        stripe_subscription_id: subscription.id,
        current_period_start: subscription.current_period_start
          ? new Date(subscription.current_period_start * 1000).toISOString()
          : null,
        current_period_end: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null,
        trial_ends_at: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
        cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      },
      { onConflict: 'user_id' },
    );

  const nextTier: BillingPlanId = ['active', 'trialing', 'past_due'].includes(status) ? planId : 'basic';

  await supabase
    .from('user_compliance_profiles')
    .upsert(
      {
        user_id: userId,
        email: subscription.customer_email ?? '',
        compliance_tier: nextTier,
        subscription_status: status,
        stripe_customer_id: customerId,
        subscription_start_date: subscription.start_date
          ? new Date(subscription.start_date * 1000).toISOString()
          : null,
        subscription_renewal_date: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null,
      },
      { onConflict: 'user_id' },
    );

  await recordEvent(supabase, userId, planId, `subscription.${status}`, subscription);
}

async function recordEvent(
  supabase: SupabaseClient,
  userId: string | null,
  planId: BillingPlanId,
  eventType: string,
  payload: unknown,
) {
  if (!userId) return;
  await supabase
    .from('subscription_events')
    .insert({
      user_id: userId,
      plan_id: planId,
      event_type: eventType,
      payload,
    });
}

function extractUserId(object: any): string | null {
  return object?.metadata?.user_id ?? null;
}

function extractPlanId(object: any): BillingPlanId {
  return (object?.metadata?.plan_id ?? 'basic') as BillingPlanId;
}
