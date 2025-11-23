import React, { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import type { User } from '../types';
import {
  SparklesIcon,
} from './icons';
import { isFeatureEnabled } from '../lib/featureFlags';
import { getSpotlightsNeedingAttention, spotlightDefinitions } from '../lib/featureSpotlights';
import { useFeatureEngagement } from '../hooks/useFeatureEngagement';

type ChecklistItem = {
  id: string;
  title: string;
  description: string;
  ctaLabel?: string;
  onAction?: () => void;
};

interface OnboardingChecklistProps {
  user: User;
  onClose: () => void;
  onComplete: () => void;
  onSnooze: (durationMs: number) => void;
  navigateTo: (page: string) => void;
}

const generalItems: ChecklistItem[] = [
  {
    id: 'preferences',
    title: 'Dial in your tables',
    description:
      'Choose row density and typography in Settings → Data Table Preferences so every view feels intentional.',
    ctaLabel: 'Settings',
  },
  {
    id: 'theme',
    title: 'Pick your vibe',
    description: 'Light, Dark, or System. Hop into Settings → Appearance to lock in your glass preset.',
    ctaLabel: 'Appearance',
  },
];

const roleSpecific: Partial<Record<User['role'], ChecklistItem[]>> = {
  Admin: [
    {
      id: 'invite-team',
      title: 'Invite your team',
      description: 'Add managers and staff from Settings → User Management. Everyone gets their own nudges.',
      ctaLabel: 'User mgmt',
    },
    {
      id: 'integrations',
      title: 'Connect Gmail & AfterShip',
      description: 'Wire up purchasing automations under API Integrations so reminders hit inbox + Slack.',
      ctaLabel: 'Integrations',
    },
    {
      id: 'shopify-beta',
      title: 'Preview Shopify setup',
      description:
        'Walk through the new sales-channel wizard under Settings → Sales Channels (still gated until credentials).',
      ctaLabel: 'Sales Channel',
    },
  ],
  Manager: [
    {
      id: 'review-requisitions',
      title: 'Review pending requisitions',
      description: 'Hop into Purchase Orders to approve or clarify requests.',
    },
  ],
  Staff: [
    {
      id: 'tour-dashboard',
      title: 'Tour your dashboard',
      description: 'Use filters to focus on builds, inventory, or receiving queues.',
    },
  ],
};

const departmentSpecific: Partial<Record<User['department'], ChecklistItem[]>> = {
  Purchasing: [
    {
      id: 'po-tracking',
      title: 'Open PO Tracking',
      description: 'Watch shipments on the new timeline and set Slack alerts later.',
    },
  ],
  Operations: [
    {
      id: 'ops-dashboard',
      title: 'Pin your command center',
      description: 'Use the Dashboard filters to focus on priority signals.',
    },
  ],
  'SHP/RCV': [
    {
      id: 'label-scanner',
      title: 'Launch Label Scanner',
      description: 'Keep inbound docs squeaky clean with quick scans.',
    },
  ],
};

const ChecklistItemRow: React.FC<{
  item: ChecklistItem;
  completed: boolean;
  toggle: () => void;
}> = ({ item, completed, toggle }) => (
  <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5/50 bg-gradient-to-br from-gray-900/80 via-gray-900/60 to-gray-950/70 p-4 shadow-[0_15px_40px_rgba(2,6,23,0.35)]">
    <input
      type="checkbox"
      checked={completed}
      onChange={toggle}
      className="mt-1.5 h-4 w-4 rounded border-gray-500 text-indigo-500 focus:ring-indigo-500"
    />
    <div className="flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-white">{item.title}</p>
        {item.ctaLabel && (
          <span className="text-[11px] uppercase text-indigo-300 bg-indigo-500/10 border border-indigo-500/40 rounded-full px-2 py-0.5">
            {item.ctaLabel}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
      {item.onAction && (
        <Button
          onClick={item.onAction}
          className="mt-2 text-xs text-indigo-200 border border-indigo-500/40 rounded-md px-2 py-1 hover:bg-indigo-500/10"
        >
          Go
        </Button>
      )}
    </div>
  </div>
);

const SNOOZE_OPTIONS = [
  { label: 'Later today (4h)', value: 4 * 60 * 60 * 1000 },
  { label: 'Tomorrow (24h)', value: 24 * 60 * 60 * 1000 },
  { label: 'In 3 days', value: 72 * 60 * 60 * 1000 },
];

const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({
  user,
  onClose,
  onComplete,
  onSnooze,
  navigateTo,
}) => {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [selectedSnooze, setSelectedSnooze] = useState<number>(SNOOZE_OPTIONS[0].value);
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const shopifyEnabled = isFeatureEnabled('shopify');
  const { engagement, markEngaged, snooze: snoozeFeature } = useFeatureEngagement();

  const mergedItems = useMemo<ChecklistItem[]>(() => {
    const items: ChecklistItem[] = [];
    items.push(...generalItems);
    if (roleSpecific[user.role]) items.push(...roleSpecific[user.role]!);
    if (departmentSpecific[user.department]) items.push(...departmentSpecific[user.department]!);
    const filtered = items.filter((item) => (item.id === 'shopify-beta' ? shopifyEnabled : true));
    return filtered.map((item) => {
      if (item.id === 'invite-team') {
        return {
          ...item,
          onAction: () => navigateTo('Settings'),
        };
      }
      if (item.id === 'integrations') {
        return {
          ...item,
          onAction: () => navigateTo('Settings'),
        };
      }
      if (item.id === 'review-requisitions' || item.id === 'po-tracking') {
        return {
          ...item,
          onAction: () => navigateTo('Purchase Orders'),
        };
      }
      if (item.id === 'label-scanner') {
        return {
          ...item,
          onAction: () => navigateTo('Label Scanner'),
        };
      }
      if (item.id === 'ops-dashboard' || item.id === 'tour-dashboard') {
        return {
          ...item,
          onAction: () => navigateTo('Dashboard'),
        };
      }
      return item;
    });
  }, [navigateTo, shopifyEnabled, user.department, user.role]);

  const availableSpotlights = useMemo(() => {
    const now = Date.now();
    const needsAttention = getSpotlightsNeedingAttention();
    const attentionFiltered = needsAttention.filter((spot) => {
      const record = engagement[spot.id];
      if (record?.dismissed) return false;
      if (record?.snoozedUntil && new Date(record.snoozedUntil).getTime() > now) return false;
      return true;
    });
    if (attentionFiltered.length > 0) {
      return attentionFiltered;
    }
    return spotlightDefinitions.filter((spot) => {
      if (spot.requiresFlag && !isFeatureEnabled(spot.requiresFlag)) return false;
      const record = engagement[spot.id];
      if (record?.snoozedUntil && new Date(record.snoozedUntil).getTime() > now) return false;
      return true;
    });
  }, [engagement]);

  const spotlight =
    availableSpotlights.length > 0
      ? availableSpotlights[spotlightIndex % availableSpotlights.length]
      : null;

  const allComplete = mergedItems.length > 0 && mergedItems.every((item) => checked[item.id]);

  useEffect(() => {
    const initialState: Record<string, boolean> = {};
    mergedItems.forEach((item) => {
      initialState[item.id] = false;
    });
    setChecked(initialState);
  }, [mergedItems]);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  useEffect(() => {
    setSpotlightIndex(0);
  }, [availableSpotlights.length]);

  useEffect(() => {
    if (availableSpotlights.length <= 1) return;
    const interval = window.setInterval(() => {
      setSpotlightIndex((idx) => (idx + 1) % availableSpotlights.length);
    }, 6500);
    return () => {
      window.clearInterval(interval);
    };
  }, [availableSpotlights.length]);

  const handleSpotlightPrimary = () => {
    if (!spotlight) return;
    markEngaged(spotlight.id);
    const target = spotlight.ctaPage ?? 'Settings';
    navigateTo(target);
    onClose();
  };

  const handleSpotlightLater = () => {
    if (!spotlight) return;
    snoozeFeature(spotlight.id, 1);
    setSpotlightIndex((idx) => (idx + 1) % Math.max(availableSpotlights.length, 1));
  };

  const toggle = (id: string) => {
    setChecked((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div
      className={`fixed inset-0 z-[120] flex items-center justify-center bg-gray-950/80 backdrop-blur-xl p-4 transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="w-full max-w-4xl overflow-hidden rounded-[32px] border border-white/15 bg-gray-950/80 shadow-[0_50px_140px_rgba(0,0,0,0.55)]">
        <div className="grid gap-6 p-6 md:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-300/80">
                  Guided launch
                </p>
                <h2 className="text-3xl font-bold text-white">
                  Hey {user.name.split(' ')[0]}, let’s unlock the good stuff
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  These reminders open Settings in the background so you can keep vibing while MuRP handles the
                  heavy lifting.
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 text-right">
                <span className="text-sm text-gray-400">
                  {Object.values(checked).filter(Boolean).length} / {mergedItems.length} complete
                </span>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>Remind me in</span>
                  <select
                    value={selectedSnooze}
                    onChange={(e) => setSelectedSnooze(Number(e.target.value))}
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-gray-100"
                  >
                    {SNOOZE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    onClick={() => {
                      onSnooze(selectedSnooze);
                      onClose();
                    }}
                    className="rounded-lg border border-amber-400/50 bg-amber-400/10 px-3 py-1 text-xs text-amber-100 hover:bg-amber-400/20"
                  >
                    Snooze
                  </Button>
                  <Button
                    onClick={onClose}
                    className="text-xs text-gray-400 underline-offset-2 hover:text-white hover:underline"
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
              {mergedItems.map((item) => (
                <ChecklistItemRow
                  key={item.id}
                  item={item}
                  completed={checked[item.id]}
                  toggle={() => toggle(item.id)}
                />
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                onClick={() => {
                  if (allComplete) {
                    onComplete();
                  } else {
                    onClose();
                  }
                }}
                className={`rounded-full px-6 py-2 text-sm font-semibold shadow-inner transition-colors ${
                  allComplete
                    ? 'bg-emerald-500 text-white hover:bg-emerald-400'
                    : 'bg-white/5 text-gray-200 hover:bg-white/10'
                }`}
              >
                {allComplete ? 'All set — close' : 'I’ll circle back'}
              </Button>
            </div>
          </div>

          <aside className="relative rounded-3xl border border-white/10 bg-gradient-to-b from-white/5 via-white/0 to-white/0 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.35)]">
            <div className="absolute inset-x-6 top-0 h-32 rounded-full bg-white/10 blur-3xl" />
            <div className="relative rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur">
              {spotlight ? (
                <>
                  <div className={`rounded-2xl border border-white/10 bg-gradient-to-br ${spotlight.accent} p-4`}>
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
                      <SparklesIcon className="h-3.5 w-3.5 text-amber-200" />
                      {spotlight.pill}
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl border border-white/20 bg-black/40 p-2">
                        {spotlight.icon}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white">{spotlight.title}</h3>
                        <p className="mt-1 text-sm text-gray-300">{spotlight.description}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Need a tour?</p>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-gray-200">
                      Settings stays open in another tab so you can keep context here. Every action in this list deep-links
                      you exactly where configuration lives.
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button
                      onClick={handleSpotlightPrimary}
                      className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400"
                    >
                      Jump to Settings
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={handleSpotlightLater}
                      className="border border-white/10 bg-transparent px-4 py-2 text-sm text-gray-200 hover:bg-white/5"
                    >
                      Remind me later
                    </Button>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/10 to-transparent p-4 text-sm text-gray-200">
                  <p className="text-base font-semibold text-white">You’re fully dialed in</p>
                  <p className="mt-1 text-gray-400">We’ll surface new spotlights as soon as fresh features unlock.</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default OnboardingChecklist;
