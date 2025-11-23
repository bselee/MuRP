import { useCallback } from 'react';
import usePersistentState from './usePersistentState';

export interface FeatureEngagementState {
  engagedAt?: string;
  snoozedUntil?: string | null;
  dismissed?: boolean;
}

export type FeatureEngagementMap = Record<string, FeatureEngagementState>;

const DAY_MS = 1000 * 60 * 60 * 24;

export const useFeatureEngagement = () => {
  const [engagement, setEngagement] = usePersistentState<FeatureEngagementMap>('feature-engagement', {});

  const updateEntry = useCallback(
    (id: string, partial: Partial<FeatureEngagementState>) => {
      setEngagement((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          ...partial,
        },
      }));
    },
    [setEngagement],
  );

  const markEngaged = useCallback(
    (id: string) => {
      updateEntry(id, {
        engagedAt: new Date().toISOString(),
        dismissed: true,
        snoozedUntil: null,
      });
    },
    [updateEntry],
  );

  const snooze = useCallback(
    (id: string, days = 1) => {
      const snoozeUntil = new Date(Date.now() + days * DAY_MS).toISOString();
      updateEntry(id, { snoozedUntil: snoozeUntil, dismissed: false });
    },
    [updateEntry],
  );

  const reset = useCallback(
    (id: string) => {
      updateEntry(id, { dismissed: false, snoozedUntil: null });
    },
    [updateEntry],
  );

  return {
    engagement,
    markEngaged,
    snooze,
    reset,
  };
};

export type UseFeatureEngagementReturn = ReturnType<typeof useFeatureEngagement>;
