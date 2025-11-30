import React, { useEffect, useState } from 'react';
import type { User } from '../types';
import Button from '@/components/ui/Button';
import billingService, { type SubscriptionSummary } from '../services/billingService';
import { PRICING_PLAN_MAP, type BillingPlanId } from '../lib/pricing/plans';

interface BillingPanelProps {
  currentUser: User;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const PLAN_ORDER: BillingPlanId[] = ['basic', 'ops_pod', 'full_ai', 'enterprise'];

const BillingPanel: React.FC<BillingPanelProps> = ({ currentUser, addToast }) => {
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);

  useEffect(() => {
    void refresh();
  }, [currentUser.id]);

  const refresh = async () => {
    try {
      setLoading(true);
      const data = await billingService.getSubscriptionSummary(currentUser.id);
      setSummary(data);
    } catch (error) {
      console.error('[BillingPanel] Failed to load subscription', error);
      addToast('Unable to load billing data. Try again in a moment.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (planId: BillingPlanId) => {
    if (!billingService.isBillingLive) {
      addToast('Billing preview is active. Stripe checkout will be enabled after go-live.', 'info');
      return;
    }
    try {
      setIsMutating(true);
      const url = await billingService.startCheckout({
        planId,
        billingInterval: 'monthly',
        seatQuantity: planId === 'ops_pod' ? 3 : 1,
        returnUrl: `${window.location.origin}/settings`,
      });
      if (url) {
        window.location.href = url;
      } else {
        addToast('Checkout created. Please check your email for confirmation.', 'success');
      }
    } catch (error) {
      console.error('[BillingPanel] Failed to start checkout', error);
      addToast(error instanceof Error ? error.message : 'Failed to start checkout', 'error');
    } finally {
      setIsMutating(false);
    }
  };

  const handlePortal = async () => {
    if (!billingService.isBillingLive) {
      addToast('Billing portal will open once Stripe webhooks are live.', 'info');
      return;
    }
    try {
      setIsMutating(true);
      const url = await billingService.openBillingPortal(`${window.location.origin}/settings`);
      window.location.href = url;
    } catch (error) {
      console.error('[BillingPanel] Failed to open billing portal', error);
      addToast(error instanceof Error ? error.message : 'Failed to open billing portal', 'error');
    } finally {
      setIsMutating(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse text-gray-400">Loading billing data…</div>;
  }

  const planId = summary?.planId ?? 'basic';
  const plan = PRICING_PLAN_MAP[planId];
  const currentIndex = PLAN_ORDER.indexOf(planId);
  const nextPlan = PLAN_ORDER[currentIndex + 1];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-inner shadow-black/20">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-gray-400">Current Plan</p>
            <h3 className="text-2xl font-bold text-white">{plan.marketingName}</h3>
            <p className="text-sm text-gray-300">{plan.description ?? plan.tagline}</p>
          </div>
          <div className="text-sm text-gray-300">
            <p>Status: <span className="font-semibold text-white">{summary?.status ?? 'active'}</span></p>
            <p>Seats: <span className="font-semibold text-white">{summary?.seatQuantity ?? plan.minSeats}</span></p>
            <p>
              Interval:{' '}
              <span className="font-semibold text-white">
                {summary?.billingInterval === 'yearly' ? 'Yearly' : 'Monthly'}
              </span>
            </p>
          </div>
        </div>
      </div>

      {nextPlan ? (
        <div className="rounded-2xl border border-accent-500/40 bg-accent-900/20 p-6">
          <p className="text-xs uppercase tracking-[0.4em] text-accent-200">Next Upgrade</p>
          <h4 className="text-xl font-semibold text-white mt-2">
            {PRICING_PLAN_MAP[nextPlan].marketingName}
          </h4>
          <p className="text-sm text-gray-300">{PRICING_PLAN_MAP[nextPlan].description}</p>
          <Button
            className="mt-4 rounded-xl bg-accent-500 px-6 py-2 font-semibold text-white hover:bg-accent-400 disabled:bg-gray-600"
            disabled={isMutating}
            onClick={() => void handleUpgrade(nextPlan)}
          >
            {isMutating ? 'Preparing checkout…' : `Upgrade to ${PRICING_PLAN_MAP[nextPlan].marketingName}`}
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-900/20 p-6 text-sm text-emerald-100">
          You&apos;re on the highest tier. Contact MuRP support if you need additional customizations.
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          variant="ghost"
          className="rounded-xl border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50"
          onClick={() => void refresh()}
          disabled={isMutating}
        >
          Refresh status
        </Button>
        <Button
          variant="ghost"
          className="rounded-xl border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50"
          onClick={() => void handlePortal()}
          disabled={isMutating}
        >
          Manage billing portal
        </Button>
      </div>
      {!billingService.isBillingLive && (
        <p className="text-xs text-amber-300">
          Billing preview is active. Stripe checkout + portal will be enabled after production verification.
        </p>
      )}
    </div>
  );
};

export default BillingPanel;
