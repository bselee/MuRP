import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import { GmailIcon, GoogleCalendarIcon, GoogleSheetsIcon } from './icons';
import { getGoogleAuthService } from '../services/googleAuthService';
import { supabase } from '../lib/supabase/client';

interface GoogleWorkspaceStatusCardProps {
  userId: string;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onNavigateToPanel?: () => void;
}

type StatusState = {
  isConnected: boolean;
  email: string | null;
  loading: boolean;
};

const GoogleWorkspaceStatusCard: React.FC<GoogleWorkspaceStatusCardProps> = ({ userId, addToast, onNavigateToPanel }) => {
  const [status, setStatus] = useState<StatusState>({ isConnected: false, email: null, loading: true });
  const [actionLoading, setActionLoading] = useState(false);
  const googleAuthService = useMemo(() => getGoogleAuthService(), []);

  const refreshStatus = useCallback(async () => {
    setStatus(prev => ({ ...prev, loading: true }));
    try {
      if (!userId) {
        setStatus({ isConnected: false, email: null, loading: false });
        return;
      }

      const { data, error } = await supabase
        .from('user_oauth_tokens')
        .select('updated_at')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .maybeSingle();

      if (error && (error as any)?.code !== 'PGRST116' && (error as any)?.code !== 'PGRST107') {
        throw error;
      }

      setStatus({
        isConnected: Boolean(data),
        email: null,
        loading: false,
      });
    } catch (error) {
      console.warn('[GoogleWorkspaceStatusCard] Unable to load Google status:', error);
      setStatus({ isConnected: false, email: null, loading: false });
    }
  }, [userId]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handlePrimaryAction = useCallback(async () => {
    if (status.isConnected) {
      onNavigateToPanel?.();
      return;
    }

    try {
      setActionLoading(true);
      await googleAuthService.startOAuthFlow();
      await refreshStatus();
      addToast('Google Workspace connected. Configure details below.', 'success');
      onNavigateToPanel?.();
    } catch (error) {
      console.error('[GoogleWorkspaceStatusCard] Failed to connect Google Workspace:', error);
      addToast(
        `Failed to connect Google Workspace: ${error instanceof Error ? error.message : 'Unexpected error'}`,
        'error',
      );
    } finally {
      setActionLoading(false);
    }
  }, [addToast, googleAuthService, onNavigateToPanel, refreshStatus, status.isConnected]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl bg-black/30 px-3 py-2">
            <GmailIcon className="h-5 w-5 text-[#EA4335]" />
            <GoogleCalendarIcon className="h-5 w-5" />
            <GoogleSheetsIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Google Workspace</p>
            <p className="text-base font-semibold text-white">
              {status.isConnected ? 'Connected' : 'Not Connected'}
            </p>
            {!status.loading && status.email && (
              <p className="text-xs text-gray-400">{status.email}</p>
            )}
          </div>
        </div>
        <Button
          size="sm"
          onClick={handlePrimaryAction}
          loading={actionLoading}
          className="whitespace-nowrap"
        >
          {status.isConnected ? 'Manage' : 'Connect'}
        </Button>
      </div>
      {!status.isConnected && !status.loading && (
        <p className="mt-3 text-xs text-gray-400">
          Launch the OAuth flow once, then reuse the token for Sheets, Calendar, Docs, and Gmail.
        </p>
      )}
    </div>
  );
};

export default GoogleWorkspaceStatusCard;
