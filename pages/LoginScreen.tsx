import { useEffect, useMemo, useState, type FC, type FormEvent } from 'react';
import { useAuth } from '../lib/auth/AuthContext';
import {
  GmailIcon,
  GoogleCalendarIcon,
  GoogleSheetsIcon,
  SparklesIcon,
  ShieldCheckIcon,
  TimelineIcon,
  ChartBarIcon,
} from '../components/icons';
import { supabase } from '../lib/supabase/client';
import Button from '@/components/ui/Button';
import TermsOfServiceModal from '../components/TermsOfServiceModal';
import {
  PRICING_PLANS,
  PRICING_PLAN_MAP,
  type BillingInterval,
  type BillingPlanId,
  type PricingPlan,
} from '../lib/pricing/plans';
import billingService from '../services/billingService';

const SHOW_NEW_PRICING = (import.meta.env.VITE_SHOW_NEW_PRICING ?? 'false').toLowerCase() === 'true';
const BILLING_LIVE = (import.meta.env.VITE_BILLING_LIVE ?? 'false').toLowerCase() === 'true';

interface LoginScreenProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const LOGIN_SPOTLIGHTS = [
  {
    id: 'timeline',
    title: 'Tall Timeline View',
    description:
      'Slide into the department timeline to see build orders, incoming POs, and tracking notes stacked vertically with glass rails.',
    icon: <TimelineIcon className="h-5 w-5 text-emerald-200" />,
    stat: 'Gantt-style',
    accent: 'from-emerald-500/20 via-cyan-500/10 to-transparent',
  },
  {
    id: 'spotlights',
    title: 'Auto feature spotlights',
    description:
      'MuRP rotates tips for unused features so onboarding stays light-touch and human. Snooze or jump straight to Settings.',
    icon: <SparklesIcon className="h-5 w-5 text-amber-200" />,
    stat: 'Adaptive',
    accent: 'from-amber-500/20 via-pink-500/10 to-transparent',
  },
  {
    id: 'security',
    title: 'Glass-secure workspace',
    description: 'SOC2-ready controls, MFA reminders, and masked secrets keep purchasing workflows safe without killing the vibe.',
    icon: <ShieldCheckIcon className="h-5 w-5 text-sky-200" />,
    stat: 'SOC2 ready',
    accent: 'from-sky-500/20 via-indigo-500/10 to-transparent',
  },
  {
    id: 'analytics',
    title: 'Tall view analytics',
    description:
      'Card stacks stretch vertically with density controls so managers see velocity deltas, compliance badges, and AI calls-to-action.',
    icon: <ChartBarIcon className="h-5 w-5 text-violet-200" />,
    stat: 'Live metrics',
    accent: 'from-violet-500/20 via-purple-500/10 to-transparent',
  },
];

const LoginScreen: FC<LoginScreenProps> = ({ addToast }) => {
  const { signIn, signUp, resetPassword, godMode } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState<'Purchasing' | 'Operations' | 'MFG 1' | 'MFG 2' | 'Fulfillment' | 'SHP/RCV'>('Purchasing');
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(true);
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');

  useEffect(() => {
    const rotation = window.setInterval(() => {
      setSpotlightIndex((prev) => (prev + 1) % LOGIN_SPOTLIGHTS.length);
    }, 5500);
    return () => window.clearInterval(rotation);
  }, []);

  const activeSpotlight = useMemo(() => LOGIN_SPOTLIGHTS[spotlightIndex], [spotlightIndex]);
  const stackedSpotlights = useMemo(
    () => LOGIN_SPOTLIGHTS.filter((_, idx) => idx !== spotlightIndex),
    [spotlightIndex],
  );

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    const result = await signIn({ email, password });
    if (result.error) {
      addToast(
        `${result.error} You can also try Google Workspace SSO if your inbox is managed there.`,
        'error',
      );
    } else {
      addToast('Signed in successfully.', 'success');
    }
    setLoading(false);
  };

  const handleSignup = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      addToast("Passwords don't match.", 'error');
      return;
    }
    setLoading(true);
    const result = await signUp({ email, password, name: fullName, role: 'Staff', department });
    if (result.error) {
      addToast(result.error, 'error');
    } else {
      addToast('Check your inbox to confirm your account.', 'success');
      setMode('login');
    }
    setLoading(false);
  };

  const handleResetPassword = async () => {
    if (!email) {
      addToast('Enter your email to reset password.', 'info');
      return;
    }
    const result = await resetPassword(email);
    if (result.error) {
      addToast(result.error, 'error');
    } else {
      addToast('Reset instructions sent. Google Workspace SSO remains available if email is federated.', 'success');
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes:
            'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets',
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        addToast(error.message, 'error');
      }
    } catch (error: any) {
      addToast('Failed to sign in with Google', 'error');
    }
  };

  const handlePlanCta = async (planId: BillingPlanId) => {
    if (planId === 'basic') {
      setMode('signup');
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      return;
    }

    if (!BILLING_LIVE) {
      addToast('Billing is in preview — checkout links will go live after Stripe verification.', 'info');
      return;
    }

    try {
      const url = await billingService.startCheckout({
        planId,
        billingInterval,
        seatQuantity: planId === 'ops_pod' ? PRICING_PLAN_MAP[planId].minSeats : 1,
        returnUrl: `${window.location.origin}/settings`,
      });
      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error('[LoginScreen] Failed to start checkout', error);
      addToast(
        error instanceof Error ? error.message : 'Failed to start checkout. Contact support.',
        'error',
      );
    }
  };

  const renderAuthCard = (wrapperClassName = '') => (
    <div
      className={`rounded-[32px] border border-white/10 bg-gray-950/80 backdrop-blur-2xl p-8 shadow-[0_30px_100px_rgba(1,5,20,0.55)] ${wrapperClassName}`}
    >
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-indigo-400">Access Portal</p>
          <h2 className="text-2xl font-semibold text-white mt-1">
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h2>
        </div>
        <div className="flex space-x-2 rounded-full bg-gray-800 p-1">
          <Button
            className={`px-4 py-1 text-sm rounded-full ${
              mode === 'login' ? 'bg-indigo-600 text-white' : 'text-gray-400'
            }`}
            onClick={() => setMode('login')}
          >
            Login
          </Button>
          <Button
            className={`px-4 py-1 text-sm rounded-full ${
              mode === 'signup' ? 'bg-indigo-600 text-white' : 'text-gray-400'
            }`}
            onClick={() => setMode('signup')}
          >
            Sign Up
          </Button>
        </div>
      </div>

      {godMode && (
        <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-3 text-sm text-yellow-200 mb-6">
          Dev God Mode enabled — production safeguards bypassed for this session.
        </div>
      )}

      <form onSubmit={mode === 'login' ? handleLogin : handleSignup} className="space-y-4">
        {mode === 'signup' && (
          <div>
            <label className="text-sm text-gray-400">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-800/80 p-3 text-white focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="Jamie Operations"
              required
            />
          </div>
        )}
        <div>
          <label className="text-sm text-gray-400">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-800/80 p-3 text-white focus:border-indigo-500 focus:ring-indigo-500"
            placeholder="you@company.com"
            required
          />
        </div>
        <div>
          <label className="text-sm text-gray-400">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-800/80 p-3 text-white focus:border-indigo-500 focus:ring-indigo-500"
            placeholder="••••••••••"
            required
          />
        </div>
        {mode === 'signup' && (
          <>
            <div>
              <label className="text-sm text-gray-400">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-800/80 p-3 text-white focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="Repeat password"
                required
              />
            </div>
            <div>
              <label className="text-sm text-gray-400">Department</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value as typeof department)}
                className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-800/80 p-3 text-white focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option>Purchasing</option>
                <option>Operations</option>
                <option>MFG 1</option>
                <option>MFG 2</option>
                <option>Fulfillment</option>
                <option>SHP/RCV</option>
              </select>
            </div>
          </>
        )}
        {mode === 'login' && (
          <div className="flex items-center justify-between text-sm text-gray-400">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={remember}
                onChange={() => setRemember(!remember)}
                className="rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500"
              />
              Remember me
            </label>
            <Button type="button" onClick={handleResetPassword} className="text-indigo-400 hover:text-indigo-300">
              Forgot password?
            </Button>
          </div>
        )}
        <Button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-500 disabled:bg-gray-700"
        >
          {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
        </Button>
      </form>

      <p className="text-xs text-gray-500 text-center mt-4">
        By continuing you agree to our{' '}
        <button
          type="button"
          onClick={() => setIsTermsModalOpen(true)}
          className="text-indigo-300 hover:text-indigo-100 underline decoration-dotted"
        >
          Terms of Service
        </button>
        .
      </p>

      <div className="mt-6">
        <div className="flex items-center gap-2">
          <span className="w-full border-t border-gray-700" />
          <span className="text-xs uppercase tracking-widest text-gray-500">or continue with</span>
          <span className="w-full border-t border-gray-700" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3">
          <Button
            type="button"
            className="flex items-center justify-between gap-4 rounded-xl border border-gray-700 bg-gray-800/60 p-4 text-white hover:border-indigo-500 hover:bg-gray-800 transition-colors text-left"
            onClick={handleGoogleSignIn}
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <GmailIcon className="h-5 w-5 text-[#EA4335]" />
                <GoogleCalendarIcon className="h-5 w-5" />
                <GoogleSheetsIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold leading-tight">Sign in with Google Workspace</p>
                <p className="text-xs text-gray-400">Unlock Gmail, Calendar, Sheets & Docs sync</p>
              </div>
            </div>
            <span className="text-xs uppercase tracking-[0.2em] text-gray-400">SSO</span>
          </Button>
          <Button
            type="button"
            className="flex items-center justify-center gap-2 rounded-xl border border-gray-700 bg-gray-800/60 p-3 text-white hover:border-indigo-500 transition-colors opacity-50 cursor-not-allowed"
            onClick={() => addToast('Microsoft OAuth coming soon.', 'info')}
            disabled
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 4H11.5V11.5H4V4ZM12.5 4H20V11.5H12.5V4ZM4 12.5H11.5V20H4V12.5ZM12.5 12.5H20V20H12.5V12.5Z" />
            </svg>
            Microsoft
          </Button>
        </div>
      </div>
    </div>
  );

  const renderPlanCard = (plan: PricingPlan) => {
    const inherited = plan.includesFrom ? PRICING_PLAN_MAP[plan.includesFrom] : null;
    const planPrice = plan.price[billingInterval];
    const isFree = planPrice === 0 && !plan.contactSales;
    const showContact = !!plan.contactSales;

    return (
      <div
        key={plan.id}
        className={`rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_20px_80px_rgba(3,9,30,0.4)]
        ${plan.ribbon ? 'ring-2 ring-indigo-500' : ''}`}
      >
        {plan.ribbon && (
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-200">
            {plan.ribbon}
          </div>
        )}
        <div className="mt-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-gray-300">{plan.badge}</p>
            <h3 className="text-2xl font-semibold text-white">{plan.marketingName}</h3>
            <p className="text-sm text-gray-300">{plan.tagline}</p>
          </div>
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-gray-300">
            {plan.minSeats}+ seats
          </span>
        </div>
        <div className="mt-6 flex items-baseline gap-2">
          {showContact ? (
            <span className="text-2xl font-semibold text-white">Let's talk</span>
          ) : (
            <>
              <span className="text-4xl font-bold text-white">{isFree ? '$0' : `$${planPrice}`}</span>
              <span className="text-sm text-gray-400">/{plan.price.unit}</span>
            </>
          )}
        </div>
        {plan.price.footnote && <p className="text-xs text-gray-400 mt-1">{plan.price.footnote}</p>}
        <ul className="mt-6 space-y-2 text-sm text-gray-200">
          {inherited && (
            <li className="text-gray-300">
              <span className="font-semibold text-white">Everything in {inherited.marketingName}</span>, plus:
            </li>
          )}
          {plan.featureHighlights.map((feature) => (
            <li key={feature} className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        <Button
          className={`mt-6 w-full rounded-2xl py-3 font-semibold ${
            plan.id === 'full_ai'
              ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
          onClick={() => void handlePlanCta(plan.id)}
        >
          {showContact
            ? 'Book a walkthrough'
            : plan.id === 'basic'
              ? 'Start free'
              : BILLING_LIVE
                ? `Upgrade to ${plan.marketingName}`
                : 'Preview checkout'}
        </Button>
      </div>
    );
  };

  const previewLayout = (
    <div className="relative min-h-screen bg-[#030712] text-white overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-16 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-10 h-80 w-80 rounded-full bg-fuchsia-600/20 blur-3xl" />
      </div>
      <div className="relative z-10 max-w-6xl mx-auto px-4 py-12 space-y-10">
        <header className="space-y-6">
          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.3em] text-emerald-300">
            <span>MuRP pricing preview</span>
            {!BILLING_LIVE && <span className="text-amber-300 normal-case tracking-normal">Checkout paused while Stripe webhooks are finalized</span>}
          </div>
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr] items-start">
            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight">
                Ops Pod, Plant Control, and Enterprise tiers built for purchasing teams that live inside MuRP all day.
              </h1>
              <p className="text-lg text-gray-300">
                Seat-based licensing with AI copilots, auto-PO tooling, and governance baked in. Toggle billing cycles,
                preview the Ops Pod workspace, and loop your team in before we flip the live switch.
              </p>
              <div className="flex flex-wrap gap-3 text-sm text-gray-300">
                <span className="rounded-full border border-white/10 px-4 py-1">Auto-PO workspace</span>
                <span className="rounded-full border border-white/10 px-4 py-1">AI compliance copilots</span>
                <span className="rounded-full border border-white/10 px-4 py-1">Shopify ingestion</span>
                <span className="rounded-full border border-white/10 px-4 py-1">Enterprise SSO</span>
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/30 p-5 space-y-4 shadow-[0_25px_80px_rgba(2,8,20,0.6)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`rounded-2xl border border-white/10 bg-gradient-to-br ${activeSpotlight.accent} p-3`}>
                    {activeSpotlight.icon}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.4em] text-gray-400">Feature spotlight</p>
                    <h3 className="text-lg font-semibold text-white">{activeSpotlight.title}</h3>
                  </div>
                </div>
                <span className="text-xs text-gray-400">{activeSpotlight.stat}</span>
              </div>
              <p className="text-sm text-gray-300">{activeSpotlight.description}</p>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                {LOGIN_SPOTLIGHTS.map((spot, idx) => (
                  <button
                    key={spot.id}
                    type="button"
                    onClick={() => setSpotlightIndex(idx)}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      idx === spotlightIndex ? 'bg-white' : 'bg-white/20 hover:bg-white/40'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-5">
          <section className="lg:col-span-3 space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 text-sm text-gray-200">
                <button
                  type="button"
                  onClick={() => setBillingInterval('monthly')}
                  className={`rounded-full px-4 py-1 font-semibold ${
                    billingInterval === 'monthly' ? 'bg-white text-black' : 'text-gray-300'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingInterval('yearly')}
                  className={`rounded-full px-4 py-1 font-semibold ${
                    billingInterval === 'yearly' ? 'bg-white text-black' : 'text-gray-300'
                  }`}
                >
                  Yearly
                </button>
              </div>
              {!BILLING_LIVE && (
                <span className="text-xs uppercase tracking-[0.4em] text-amber-300">Preview build</span>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {PRICING_PLANS.map(renderPlanCard)}
            </div>
          </section>
          <section className="lg:col-span-2 space-y-6">
            {renderAuthCard('bg-[#050818]/80 border-white/5 shadow-[0_20px_70px_rgba(3,8,20,0.65)]')}
            <div className="rounded-3xl border border-white/5 bg-white/5 p-6">
              <p className="text-sm uppercase tracking-[0.4em] text-gray-300">Why teams switch</p>
              <ul className="mt-4 space-y-3 text-sm text-gray-100">
                <li>⚡ Auto-generates vendor-ready POs with Gmail threading.</li>
                <li>🧠 AI compliance copilots catch gaps before regulators do.</li>
                <li>🛰️ Shopify, Finale, and Google Workspace stay in sync.</li>
                <li>🛡️ SOC2-ready logging, SSO, and onboarding guardrails.</li>
              </ul>
            </div>
          </section>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
            <p className="text-2xl font-semibold text-white">#1</p>
            <p className="text-xs text-gray-400 mt-1">Purchase Assurance</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
            <p className="text-2xl font-semibold text-white">24/7</p>
            <p className="text-xs text-gray-400 mt-1">AI Coverage</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
            <p className="text-2xl font-semibold text-white">SOC2</p>
            <p className="text-xs text-gray-400 mt-1">Ready Controls</p>
          </div>
        </section>
      </div>
    </div>
  );

  const legacyLayout = (
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-[#05060d] via-[#0b1020] to-[#111b2e] p-4 overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-16 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-10 h-80 w-80 rounded-full bg-fuchsia-600/20 blur-3xl" />
      </div>
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-8 relative z-10">
        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/5 backdrop-blur-2xl p-8 shadow-[0_40px_140px_rgba(2,10,40,0.6)] space-y-8">
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-indigo-500/10 via-fuchsia-500/10 to-cyan-500/10" />
          <div className="relative z-10 space-y-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.45em] text-indigo-200/80">Manufacturing Portal</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-3">
                <h1 className="text-5xl sm:text-6xl font-black text-white leading-none tracking-tight">MuRP</h1>
                <span className="text-xs sm:text-sm font-semibold uppercase tracking-[0.5em] text-indigo-100/80">
                  Manufacturing Resource Portal
                </span>
              </div>
              <p className="mt-3 text-gray-300 text-sm">
                MuRP is the manufacturing resource portal for purchasing and ops leads—plug into intelligence, BOM visibility, AI copilots, and the tall timeline view without hunting for the brand.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-2xl font-semibold text-white">#1</p>
                <p className="text-xs text-gray-400 mt-1">Purchase Assurance</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-2xl font-semibold text-white">24/7</p>
                <p className="text-xs text-gray-400 mt-1">AI Coverage</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-2xl font-semibold text-white">SOC2</p>
                <p className="text-xs text-gray-400 mt-1">Ready Controls</p>
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/30 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`rounded-2xl border border-white/10 bg-gradient-to-br ${activeSpotlight.accent} p-3`}>
                    {activeSpotlight.icon}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.4em] text-gray-400">Feature spotlight</p>
                    <h3 className="text-lg font-semibold text-white">{activeSpotlight.title}</h3>
                  </div>
                </div>
                <span className="text-xs text-gray-400">{activeSpotlight.stat}</span>
              </div>
              <p className="text-sm text-gray-300">{activeSpotlight.description}</p>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                {LOGIN_SPOTLIGHTS.map((spot, idx) => (
                  <button
                    key={spot.id}
                    type="button"
                    onClick={() => setSpotlightIndex(idx)}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      idx === spotlightIndex ? 'bg-white' : 'bg-white/20 hover:bg-white/40'
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/20 p-4 space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Up next</p>
              <div className="flex flex-wrap gap-2">
                {stackedSpotlights.slice(0, 3).map((spot) => (
                  <div
                    key={spot.id}
                    className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-300"
                  >
                    {spot.icon}
                    {spot.title}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {renderAuthCard()}
      </div>
    </div>
  );

  return (
    <>
      {SHOW_NEW_PRICING ? previewLayout : legacyLayout}
      <TermsOfServiceModal isOpen={isTermsModalOpen} onClose={() => setIsTermsModalOpen(false)} />
    </>
  );
};

export default LoginScreen;
