# MuRP Pricing & Billing Rollout Checklist

This document captures the switches required to ship the redesigned pricing / landing experience
and the new Stripe-backed billing flow. Keep it close so we can stage → prod with zero surprises.

## 1. Feature Flags

| Flag | Location | Default | Purpose |
| --- | --- | --- | --- |
| `VITE_SHOW_NEW_PRICING` | `.env.local` / Vercel env | `false` | Renders the new landing page + pricing table when `true`. Use `false` to keep the legacy login hero live. |
| `VITE_BILLING_LIVE` | `.env.local` / Vercel env | `false` | Enables live Stripe checkout CTAs. Keep `false` until Stripe secrets, webhook, and migrations are deployed. |

**Preview workflow**

1. Set `VITE_SHOW_NEW_PRICING=true` in your local `.env.local`.
2. Leave `VITE_BILLING_LIVE=false` — CTAs will display “Preview checkout”.
3. Deploy to staging for design review without exposing real purchase flows.

## 2. Stripe Secrets

Configure the following secrets via `supabase secrets set` (or the Vercel dashboard):

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `BILLING_PORTAL_RETURN_URL` (e.g., `https://app.murp.io/settings`)
- Price ID env vars (match plan IDs):
  - `STRIPE_PRICE_BASIC_MONTHLY`, `STRIPE_PRICE_BASIC_YEARLY`
  - `STRIPE_PRICE_OPS_POD_MONTHLY`, `STRIPE_PRICE_OPS_POD_YEARLY`
  - `STRIPE_PRICE_FULL_AI_MONTHLY`, `STRIPE_PRICE_FULL_AI_YEARLY`
  - `STRIPE_PRICE_ENTERPRISE_MONTHLY`, `STRIPE_PRICE_ENTERPRISE_YEARLY` (optional / placeholder)

> **Tip:** use Stripe test keys in staging. Prod keys should only be stored in the prod Supabase project + Vercel env.

## 3. Database + Supabase Checklist

1. Apply migration `045_billing_infrastructure.sql` (creates `billing_plans`, `user_subscriptions`, `subscription_events`).
2. Seed `billing_plans` with seat minimums, price metadata, and env-variable-backed price keys (migration handles defaults).
3. Deploy edge functions:
   - `billing-checkout`
   - `billing-portal`
   - `billing-webhook`
4. Expose webhook URL to Stripe and verify signature with `STRIPE_WEBHOOK_SECRET`.
5. Confirm RLS policies:
   - `user_subscriptions`: users can `SELECT` their own row.
   - `billing_plans`: readable by `anon` for plan metadata.

## 4. Go-Live Steps

1. ✅ Secrets + migrations deployed and smoke-tested in staging.
2. ✅ Stripe webhook receiving `checkout.session.completed` + `customer.subscription.updated` events.
3. ✅ Billing portal opens successfully for an active subscription.
4. Flip `VITE_SHOW_NEW_PRICING=true` on production.
5. After final Stripe validation, set `VITE_BILLING_LIVE=true`.
6. Monitor `subscription_events` + Stripe dashboard for first production checkout.

## 5. Rollback Plan

If anything misbehaves:

1. Set `VITE_BILLING_LIVE=false` → disables checkout CTAs instantly.
2. Optionally set `VITE_SHOW_NEW_PRICING=false` → revert to legacy login hero.
3. Pause Stripe webhook endpoint in the dashboard while investigating.
4. Use Supabase logs (`subscription_events`) to trace the failure.

---

Keep this doc updated as we add more add-ons (read-only seats, onboarding packages, etc.). The goal is that anyone on the team can flip the right switches without hunting through commits.
