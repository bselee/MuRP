/**
 * Sync Error Notifications Hook
 *
 * Monitors for recent sync errors from:
 * - Email tracking runs
 * - Agent executions
 * - Workflow executions
 *
 * Surfaces errors as toast notifications for admin visibility.
 */

import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase/client';

interface SyncError {
  id: string;
  source: 'email' | 'agent' | 'workflow';
  message: string;
  timestamp: string;
  identifier?: string;
}

interface UseSyncErrorNotificationsOptions {
  /** Only show errors newer than this many minutes */
  maxAgeMinutes?: number;
  /** How often to check for new errors (ms) */
  pollIntervalMs?: number;
  /** Toast function to call when errors are found */
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  /** Only enable for admin users */
  isAdmin: boolean;
  /** Whether the hook is enabled */
  enabled?: boolean;
}

/**
 * Hook that monitors for sync errors and shows toast notifications
 */
export function useSyncErrorNotifications({
  maxAgeMinutes = 15,
  pollIntervalMs = 60000, // Check every 60 seconds
  addToast,
  isAdmin,
  enabled = true,
}: UseSyncErrorNotificationsOptions) {
  // Track which errors we've already shown to avoid duplicates
  const shownErrorsRef = useRef<Set<string>>(new Set());
  const lastCheckRef = useRef<Date>(new Date());

  const checkForErrors = useCallback(async () => {
    if (!isAdmin || !enabled) return;

    const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();
    const errors: SyncError[] = [];

    try {
      // Check email tracking runs for errors
      const { data: emailErrors } = await supabase
        .from('email_tracking_runs')
        .select('id, status, errors, started_at')
        .eq('status', 'error')
        .gt('started_at', cutoffTime)
        .order('started_at', { ascending: false })
        .limit(5);

      if (emailErrors) {
        for (const run of emailErrors) {
          const errorMessages = run.errors as string[] | null;
          if (errorMessages && errorMessages.length > 0) {
            errors.push({
              id: `email-${run.id}`,
              source: 'email',
              message: `Email sync failed: ${errorMessages[0]}`,
              timestamp: run.started_at,
            });
          }
        }
      }

      // Check agent execution log for failures
      const { data: agentErrors } = await supabase
        .from('agent_execution_log')
        .select('id, agent_identifier, outcome, error_message, started_at')
        .eq('outcome', 'failed')
        .gt('started_at', cutoffTime)
        .order('started_at', { ascending: false })
        .limit(5);

      if (agentErrors) {
        for (const run of agentErrors) {
          if (run.error_message) {
            const agentName = run.agent_identifier
              ?.replace(/_/g, ' ')
              .replace(/-/g, ' ')
              .split(' ')
              .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' ');
            errors.push({
              id: `agent-${run.id}`,
              source: 'agent',
              message: `Agent "${agentName}" failed: ${run.error_message}`,
              timestamp: run.started_at,
              identifier: run.agent_identifier,
            });
          }
        }
      }

      // Check workflow executions for failures
      const { data: workflowErrors } = await supabase
        .from('workflow_executions')
        .select('id, workflow_id, status, error_message, started_at')
        .eq('status', 'failed')
        .gt('started_at', cutoffTime)
        .order('started_at', { ascending: false })
        .limit(5);

      if (workflowErrors) {
        for (const run of workflowErrors) {
          if (run.error_message) {
            errors.push({
              id: `workflow-${run.id}`,
              source: 'workflow',
              message: `Workflow failed: ${run.error_message}`,
              timestamp: run.started_at,
            });
          }
        }
      }

      // Show toasts for new errors we haven't seen before
      for (const error of errors) {
        if (!shownErrorsRef.current.has(error.id)) {
          shownErrorsRef.current.add(error.id);

          // Format the toast message
          const icon = error.source === 'email' ? '[Email]' :
                       error.source === 'agent' ? '[Agent]' : '[Workflow]';
          addToast(`${icon} ${error.message}`, 'error');
        }
      }

      // Clean up old tracked errors (older than 1 hour)
      if (shownErrorsRef.current.size > 100) {
        shownErrorsRef.current.clear();
      }

      lastCheckRef.current = new Date();
    } catch (err) {
      console.error('[useSyncErrorNotifications] Error checking for sync errors:', err);
    }
  }, [isAdmin, enabled, maxAgeMinutes, addToast]);

  // Initial check on mount
  useEffect(() => {
    if (isAdmin && enabled) {
      // Small delay to let the app settle
      const timeout = setTimeout(checkForErrors, 2000);
      return () => clearTimeout(timeout);
    }
  }, [isAdmin, enabled, checkForErrors]);

  // Periodic polling
  useEffect(() => {
    if (!isAdmin || !enabled) return;

    const interval = setInterval(checkForErrors, pollIntervalMs);
    return () => clearInterval(interval);
  }, [isAdmin, enabled, pollIntervalMs, checkForErrors]);

  // Return manual trigger function
  return { checkForErrors };
}

export default useSyncErrorNotifications;
