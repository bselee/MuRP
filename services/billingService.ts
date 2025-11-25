import { supabase } from '../lib/supabase/client';
import type { BillingPlanId, BillingInterval } from '../lib/pricing/plans';
import complianceService from './complianceService';

export interface SubscriptionSummary {
  planId: BillingPlanId;
  status: string;
  billingInterval: BillingInterval;
  seatQuantity: number;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}

const isBillingLive = (import.meta.env.VITE_BILLING_LIVE ?? 'false').toLowerCase() === 'true';

async function startCheckout(options: {
  planId: BillingPlanId;
  billingInterval: BillingInterval;
  seatQuantity?: number;
  returnUrl?: string;
}): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('billing-checkout', {
    body: options,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to create checkout session');
  }

  return data?.url ?? null;
}

async function openBillingPortal(returnUrl?: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('billing-portal', {
    body: { returnUrl },
  });

  if (error || !data?.url) {
    throw new Error(error?.message ?? 'Failed to open billing portal');
  }

  return data.url;
}

async function fetchSubscriptionRow() {
  const { data, error } = await supabase.from('user_subscriptions').select('*').maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function getSubscriptionSummary(userId: string): Promise<SubscriptionSummary> {
  const [profile, subscription] = await Promise.all([
    complianceService.getUserProfile(userId),
    fetchSubscriptionRow().catch(() => null),
  ]);

  const planId = (profile?.compliance_tier ?? 'basic') as BillingPlanId;
  const status = profile?.subscription_status ?? 'active';

  return {
    planId,
    status,
    billingInterval: (subscription?.billing_interval ?? 'monthly') as BillingInterval,
    seatQuantity: subscription?.seat_quantity ?? (planId === 'ops_pod' ? 3 : 1),
    stripeCustomerId: subscription?.stripe_customer_id ?? profile?.stripe_customer_id ?? undefined,
    stripeSubscriptionId: subscription?.stripe_subscription_id ?? undefined,
  };
}

export default {
  startCheckout,
  openBillingPortal,
  getSubscriptionSummary,
  isBillingLive,
};
