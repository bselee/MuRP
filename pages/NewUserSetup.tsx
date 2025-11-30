import React, { useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import type { User } from '../types';
import { KeyIcon, MailIcon, GmailIcon, LightBulbIcon } from '../components/icons';
import { supabase } from '../lib/supabase/client';
import { useTheme, type ThemePreference } from '../components/ThemeProvider';
import { useUserPreferences, type RowDensity } from '../components/UserPreferencesProvider';

interface NewUserSetupProps {
    user: User;
    onSetupComplete: () => void;
}

const roleCopy: Record<User['role'], { headline: string; blurb: string }> = {
  Admin: {
    headline: 'You keep the whole orchestra in sync.',
    blurb: 'Invite your team, wire up integrations, and keep MuRP humming across purchasing, production, and compliance.',
  },
  Manager: {
    headline: 'You steer the day-to-day.',
    blurb: 'Review requisitions, monitor builds, and make sure nothing slips through the cracks.',
  },
  Staff: {
    headline: 'You make the magic tangible.',
    blurb: 'Log builds, receive goods, and keep the floor informed with real-time data.',
  },
};

const departmentPlaybooks: Record<User['department'], { title: string; highlights: string[] }> = {
  Purchasing: {
    title: 'Your day starts in Requisitions + PO Tracking.',
    highlights: [
      'Review incoming requests, approve or clarify',
      'Keep vendors honest with automated follow-ups',
      'Watch shipments via the PO Tracking timeline',
    ],
  },
  Operations: {
    title: 'Ops keeps every team unblocked.',
    highlights: [
      'Scan dashboards for blockers',
      'Balance demand between production + purchasing',
      'Coordinate with receiving on urgent inbound freight',
    ],
  },
  'MFG 1': {
    title: 'Production is your canvas.',
    highlights: [
      'Check today’s build schedule',
      'Verify inventory sufficiency before batching',
      'Log completions so fulfillment stays ahead',
    ],
  },
  'MFG 2': {
    title: 'Production is your canvas.',
    highlights: [
      'Monitor component health from Inventory',
      'Coordinate with Purchasing when stocks dip',
      'Feed status updates back to Ops',
    ],
  },
  Fulfillment: {
    title: 'Turn finished goods into customer delight.',
    highlights: [
      'Peek at Inventory to reserve units',
      'Use Label Scanner to keep paperwork airtight',
      'Flag shortages early so Purchasing can react',
    ],
  },
  'SHP/RCV': {
    title: 'You are the gatekeeper of inbound & outbound.',
    highlights: [
      'Use the Receiving view + Label Scanner',
      'Validate paperwork before anything hits shelves',
      'Log exceptions right away for Ops & Purchasing',
    ],
  },
};

const themeOptions: Array<{ label: string; value: ThemePreference; description: string }> = [
  { label: 'System', value: 'system', description: 'Match OS setting automatically' },
  { label: 'Light', value: 'light', description: 'Bright and warm for airy spaces' },
  { label: 'Dark', value: 'dark', description: 'Stealth mode for late nights' },
];

const densityOptions: Array<{ label: string; value: RowDensity; blurb: string }> = [
  { label: 'Comfortable', value: 'comfortable', blurb: 'Tall rows, extra breathing room' },
  { label: 'Compact', value: 'compact', blurb: 'Balanced density (default)' },
  { label: 'Ultra', value: 'ultra', blurb: 'Tight rows, max data per screen' },
];

const NewUserSetup: React.FC<NewUserSetupProps> = ({ user, onSetupComplete }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(0);
    const totalSteps = 3;
    const { theme, setTheme, resolvedTheme } = useTheme();
    const { rowDensity, setRowDensity } = useUserPreferences();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!password || !confirmPassword) {
            setError('Please fill out both password fields.');
            return;
        }
        if (password.length < 12) {
            setError('Password must be at least 12 characters long for compliance.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        try {
            setLoading(true);
            const { error: updateError } = await supabase.auth.updateUser({ password });
            if (updateError) throw updateError;
            onSetupComplete();
        } catch (err: any) {
            setError(err.message ?? 'Failed to set password.');
        } finally {
            setLoading(false);
        }
    };

    const roleMessaging = roleCopy[user.role] ?? roleCopy.Staff;
    const departmentGuide = departmentPlaybooks[user.department] ?? {
      title: 'Your workflow lives inside MuRP.',
      highlights: [
        'Track what matters from the dashboard',
        'Communicate with your team in-context',
        'Automate the boring things',
      ],
    };

    const handleNext = () => setStep((prev) => Math.min(prev + 1, totalSteps - 1));
    const handleBack = () => setStep((prev) => Math.max(prev - 1, 0));

    const renderStep = () => {
      if (step === 0) {
        return (
          <div className="space-y-6">
            <div className="text-center space-y-3">
              <h1 className="text-3xl font-bold text-white">Hey {user.name.split(' ')[0]}, welcome to MuRP.</h1>
              <p className="text-sm text-gray-400">{roleMessaging.headline}</p>
              <p className="text-sm text-gray-400">{roleMessaging.blurb}</p>
            </div>
            <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-gray-200 font-semibold">
                <LightBulbIcon className="w-5 h-5 text-amber-300" />
                Make it feel like home
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {themeOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant={theme === option.value ? 'primary' : 'ghost'}
                    className="h-full flex flex-col items-start gap-1"
                    onClick={() => setTheme(option.value)}
                  >
                    <span className="text-sm font-semibold">
                      {option.label}
                      {theme === option.value && <span className="ml-2 text-xs text-emerald-300">Active</span>}
                    </span>
                    <span className="text-xs text-gray-400">{option.description}</span>
                  </Button>
                ))}
              </div>
              <div>
                <p className="text-xs uppercase text-gray-500 font-semibold mb-2">Table density</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {densityOptions.map((option) => (
                    <label
                      key={option.value}
                      className={`rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                        rowDensity === option.value
                          ? 'border-accent-400 bg-accent-500/10 text-white'
                          : 'border-gray-700 bg-gray-900/40 text-gray-300 hover:border-gray-500'
                      }`}
                    >
                      <input
                        type="radio"
                        name="density"
                        className="hidden"
                        checked={rowDensity === option.value}
                        onChange={() => setRowDensity(option.value)}
                      />
                      <span className="block font-semibold">{option.label}</span>
                      <span className="text-xs text-gray-400">{option.blurb}</span>
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Current theme: <span className="text-gray-200">{resolvedTheme}</span> · Row density:{' '}
                <span className="text-gray-200 capitalize">{rowDensity}</span>
              </p>
            </div>
          </div>
        );
      }

      if (step === 1) {
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-white">Your team’s playbook</h2>
              <p className="text-gray-400 text-sm">
                We tuned the home screen to what {user.department} needs most. Here’s where you’ll live day-to-day.
              </p>
            </div>
            <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-5 space-y-3">
              <p className="text-sm font-semibold text-white">{departmentGuide.title}</p>
              <ul className="list-disc list-inside text-sm text-gray-300 space-y-1">
                {departmentGuide.highlights.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="bg-gray-900/30 border border-gray-700 rounded-xl p-5 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-gray-500">Creature comforts</p>
                <p className="text-sm text-gray-300 mt-1">Go light or dark, tighten tables, and pin your favorite modules.</p>
              </div>
              <div>
                <p className="text-xs uppercase text-gray-500">What’s next</p>
                <p className="text-sm text-gray-300 mt-1">
                  After password setup we’ll drop you into a guided checklist so you can hit the ground running.
                </p>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white">Secure your account</h2>
            <p className="text-sm text-gray-400 mt-1">Use a strong passphrase (12+ characters) to unlock MuRP.</p>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MailIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="email"
              value={user.email}
              readOnly
              className="w-full bg-gray-700/50 text-gray-300 rounded-md p-3 pl-10 cursor-not-allowed"
            />
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <KeyIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="password"
                placeholder="Create Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-700 text-white rounded-md p-3 pl-10"
                required
              />
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <KeyIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-gray-700 text-white rounded-md p-3 pl-10"
                required
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button
              type="submit"
              className="w-full bg-accent-500 text-white font-semibold py-3 px-4 rounded-md hover:bg-accent-600 transition-colors"
            >
              {loading ? 'Saving…' : 'Complete Setup'}
            </Button>
          </form>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-gray-600" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-gray-800 px-2 text-sm text-gray-400">Or link a Google account</span>
            </div>
          </div>
          <div>
            <Button
              onClick={onSetupComplete}
              className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-semibold py-3 px-4 rounded-md hover:bg-gray-200 transition-colors"
            >
              <GmailIcon className="w-5 h-5 text-[#DB4437]" />
              Sign in with Google (mock)
            </Button>
          </div>
        </div>
      );
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900/95 p-4">
        <div className="w-full max-w-3xl bg-gray-800/70 border border-gray-700 rounded-3xl shadow-2xl p-8 space-y-6">
          <div className="flex items-center justify-between text-gray-400 text-sm">
            <span>Step {step + 1} of {totalSteps}</span>
            <div className="flex gap-1">
              {Array.from({ length: totalSteps }).map((_, index) => (
                <span
                  key={index}
                  className={`h-1.5 w-10 rounded-full ${
                    index <= step ? 'bg-accent-400' : 'bg-gray-700'
                  }`}
                />
              ))}
            </div>
          </div>
          {renderStep()}
          <div className="flex flex-wrap gap-3 justify-between pt-4 border-t border-gray-700/60">
            <Button
              onClick={handleBack}
              disabled={step === 0}
              className="text-sm text-gray-300 hover:text-white disabled:opacity-40"
            >
              Back
            </Button>
            {step < totalSteps - 1 && (
              <Button
                onClick={handleNext}
                className="bg-accent-500 text-white px-6 py-2 rounded-md hover:bg-accent-500"
              >
                Continue
              </Button>
            )}
          </div>
        </div>
      </div>
    );
};

export default NewUserSetup;
