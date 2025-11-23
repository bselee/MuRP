import React, { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import type { User } from '../types';
import { SparklesIcon } from './icons';
import { getSpotlightsNeedingAttention, spotlightDefinitions } from '../lib/featureSpotlights';
import { useFeatureEngagement } from '../hooks/useFeatureEngagement';
import { isFeatureEnabled } from '../lib/featureFlags';

interface FeatureSpotlightReminderProps {
  currentUser: User | null;
  navigateTo: (page: string) => void;
  suppressed?: boolean;
}

const FeatureSpotlightReminder: React.FC<FeatureSpotlightReminderProps> = ({
  currentUser,
  navigateTo,
  suppressed = false,
}) => {
  const { engagement, markEngaged, snooze } = useFeatureEngagement();
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShouldRender(true), 2500);
    return () => window.clearTimeout(timer);
  }, []);

  const spotlight = useMemo(() => {
    if (!currentUser) return null;
    const now = Date.now();
    const attention = getSpotlightsNeedingAttention().filter((spot) => {
      const record = engagement[spot.id];
      if (record?.dismissed) return false;
      if (record?.snoozedUntil && new Date(record.snoozedUntil).getTime() > now) return false;
      return true;
    });
    const nextList =
      attention.length > 0
        ? attention
        : spotlightDefinitions.filter((spot) => {
            if (spot.requiresFlag && !isFeatureEnabled(spot.requiresFlag)) return false;
            const record = engagement[spot.id];
            if (record?.snoozedUntil && new Date(record.snoozedUntil).getTime() > now) return false;
            return true;
          });
    return nextList[0] ?? null;
  }, [currentUser, engagement]);

  if (!shouldRender || suppressed || !spotlight) {
    return null;
  }

  const handleExplore = () => {
    markEngaged(spotlight.id);
    navigateTo(spotlight.ctaPage ?? 'Settings');
  };

  const handleLater = () => {
    snooze(spotlight.id, 2);
  };

  return (
    <div className="fixed bottom-6 left-6 z-[70] max-w-sm rounded-3xl border border-white/10 bg-slate-950/80 p-4 text-sm text-white shadow-[0_20px_60px_rgba(1,5,20,0.55)] backdrop-blur-xl">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-amber-200">
        <SparklesIcon className="h-4 w-4" />
        Spotlight
      </div>
      <h3 className="mt-2 text-lg font-semibold">{spotlight.title}</h3>
      <p className="mt-1 text-gray-300">{spotlight.description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          onClick={handleExplore}
          className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-black hover:bg-emerald-400"
        >
          Explore
        </Button>
        <Button
          variant="ghost"
          onClick={handleLater}
          className="border border-white/10 px-4 py-2 text-xs text-gray-200 hover:bg-white/5"
        >
          Later
        </Button>
      </div>
    </div>
  );
};

export default FeatureSpotlightReminder;
