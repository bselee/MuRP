import React, { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import type { User } from '../types';

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
    description: 'Choose row density and font size that feel right. Find it under Settings → Appearance.',
  },
  {
    id: 'theme',
    title: 'Pick your vibe',
    description: 'Light, Dark, or System. Toggle anytime from the header.',
  },
];

const roleSpecific: Partial<Record<User['role'], ChecklistItem[]>> = {
  Admin: [
    {
      id: 'invite-team',
      title: 'Invite your team',
      description: 'Add managers and staff from Settings → User Management.',
    },
    {
      id: 'integrations',
      title: 'Connect Gmail & AfterShip',
      description: 'Wire up purchasing automations under API Integrations.',
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
  <div className="flex items-start gap-3 rounded-xl border border-gray-700 bg-gray-900/60 p-4">
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

  const mergedItems = useMemo<ChecklistItem[]>(() => {
    const items: ChecklistItem[] = [];
    items.push(...generalItems);
    if (roleSpecific[user.role]) items.push(...roleSpecific[user.role]!);
    if (departmentSpecific[user.department]) items.push(...departmentSpecific[user.department]!);
    return items.map((item) => {
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
  }, [navigateTo, user.department, user.role]);

  const allComplete = mergedItems.length > 0 && mergedItems.every((item) => checked[item.id]);

  useEffect(() => {
    const initialState: Record<string, boolean> = {};
    mergedItems.forEach((item) => {
      initialState[item.id] = false;
    });
    setChecked(initialState);
  }, [mergedItems]);

  const toggle = (id: string) => {
    setChecked((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="fixed inset-0 z-[120] bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-gray-900/90 border border-gray-700 rounded-3xl shadow-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-indigo-300 uppercase tracking-wide">Getting started</p>
            <h2 className="text-2xl font-bold text-white">Let’s get you settled, {user.name.split(' ')[0]}</h2>
            <p className="text-sm text-gray-400 mt-1">
              Knock out these quick actions. They’re tuned for {user.department}.
            </p>
          </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Remind me in</span>
            <select
              value={selectedSnooze}
              onChange={(e) => setSelectedSnooze(Number(e.target.value))}
              className="bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-gray-100"
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
              className="text-xs text-amber-200 border border-amber-500/40 rounded-md px-3 py-1 hover:bg-amber-500/10"
            >
              Snooze
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onClose} className="text-sm text-gray-300 hover:text-white">
              Dismiss
            </Button>
            <Button
              onClick={() => {
                if (allComplete) {
                  onComplete();
                } else {
                  onClose();
                }
              }}
              className={`px-4 py-2 rounded-md ${
                allComplete ? 'bg-emerald-500 text-white' : 'bg-gray-700 text-gray-200'
              }`}
            >
              {allComplete ? 'Looks good' : 'Skip for now'}
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
      </div>
    </div>
  );
};

export default OnboardingChecklist;
