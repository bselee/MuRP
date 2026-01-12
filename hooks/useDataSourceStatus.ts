/**
 * Hook for Data Source Status
 *
 * Provides reactive access to data source configuration and connection status.
 * Use this to show appropriate empty states and onboarding guidance.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getDataSourceSummary,
  DataSourceSummary,
  SETUP_STEP_INFO,
} from '../services/dataSourceStatusService';

export interface UseDataSourceStatusResult {
  status: DataSourceSummary | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  stepInfo: typeof SETUP_STEP_INFO;
}

export function useDataSourceStatus(userId: string | undefined): UseDataSourceStatusResult {
  const [status, setStatus] = useState<DataSourceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setStatus(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const summary = await getDataSourceSummary(userId);
      setStatus(summary);
    } catch (err) {
      console.error('[useDataSourceStatus] Failed to get status:', err);
      setError(err instanceof Error ? err : new Error('Failed to check data source status'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    status,
    loading,
    error,
    refresh,
    stepInfo: SETUP_STEP_INFO,
  };
}

export default useDataSourceStatus;
