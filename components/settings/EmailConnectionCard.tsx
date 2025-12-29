/**
 * Email Connection Card
 *
 * User-friendly interface for connecting Gmail for PO email monitoring.
 * Supports multiple inboxes: purchasing (for PO tracking) and accounting (for invoices).
 * Handles OAuth flow, displays connection status, and provides disconnect option.
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';
import { EMAIL_MONITORING_SCOPES } from '../../lib/google/scopes';
import {
  MailIcon,
  CheckCircleIcon,
  XCircleIcon,
  RefreshIcon,
  AlertTriangleIcon,
  ShieldCheckIcon,
  PlusIcon,
} from '../icons';

type InboxPurpose = 'purchasing' | 'accounting' | 'general';

interface InboxConfig {
  id: string;
  email_address: string;
  inbox_purpose: InboxPurpose;
  is_active: boolean;
  last_sync_at: string | null;
  total_emails_processed: number;
  status: string;
}

interface EmailConnectionCardProps {
  userId: string;
  onConnectionChange?: (connected: boolean) => void;
}

const PURPOSE_INFO: Record<InboxPurpose, { title: string; description: string; benefits: string[] }> = {
  purchasing: {
    title: 'Purchasing Email',
    description: 'For vendor communications, PO updates, and tracking',
    benefits: [
      'Extract tracking numbers from vendor emails',
      'Update PO status when shipments are confirmed',
      'Get alerts for backorders and delays',
      'Draft intelligent follow-up responses',
    ],
  },
  accounting: {
    title: 'Accounting Email',
    description: 'For invoices, payment confirmations, and financial docs',
    benefits: [
      'Extract invoice data automatically',
      'Match invoices to purchase orders',
      'Track payment status updates',
      'Flag pricing discrepancies',
    ],
  },
  general: {
    title: 'General Email',
    description: 'For general vendor communications',
    benefits: [
      'Centralize vendor communications',
      'Auto-categorize incoming emails',
      'Track response times',
    ],
  },
};

export const EmailConnectionCard: React.FC<EmailConnectionCardProps> = ({
  userId,
  onConnectionChange,
}) => {
  const [inboxes, setInboxes] = useState<InboxConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<InboxPurpose | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddInbox, setShowAddInbox] = useState(false);

  useEffect(() => {
    fetchInboxes();

    // Check for OAuth callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth') === 'success') {
      // Clear the URL params and refresh
      window.history.replaceState({}, '', window.location.pathname);
      fetchInboxes();
    } else if (params.get('oauth') === 'error') {
      setError(params.get('error') || 'OAuth connection failed');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [userId]);

  const fetchInboxes = async () => {
    setLoading(true);
    try {
      // Fetch inboxes for this user OR orphaned inboxes (from OAuth before auth was set up)
      const { data, error: fetchError } = await supabase
        .from('email_inbox_configs')
        .select('id, email_address, inbox_purpose, is_active, last_sync_at, total_emails_processed, status, user_id')
        .or(`user_id.eq.${userId},user_id.is.null`)
        .order('inbox_purpose');

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.warn('Could not fetch inbox configs:', fetchError);
      }

      // Claim any orphaned inboxes (where user_id is null) for this user
      const orphanedInboxes = (data || []).filter(i => !i.user_id);
      if (orphanedInboxes.length > 0 && userId) {
        console.log(`[EmailConnectionCard] Claiming ${orphanedInboxes.length} orphaned inbox(es) for user ${userId}`);
        await supabase
          .from('email_inbox_configs')
          .update({ user_id: userId })
          .in('id', orphanedInboxes.map(i => i.id));
      }

      setInboxes(data || []);
      onConnectionChange?.((data || []).some(i => i.is_active));
    } catch (err) {
      console.error('Error fetching inboxes:', err);
    }
    setLoading(false);
  };

  const handleConnect = async (purpose: InboxPurpose) => {
    setConnecting(purpose);
    setError(null);

    try {
      // Get session token
      const { data: { session } } = await supabase.auth.getSession();

      // Call the edge function to get OAuth URL with both purpose and inbox_purpose
      const authParams = new URLSearchParams({
        purpose: 'email_monitoring',
        inbox_purpose: purpose, // 'purchasing' or 'accounting'
      });

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-auth/authorize?${authParams}`,
        {
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        }
      );

      if (!response.ok) {
        throw new Error('Failed to get authorization URL');
      }

      const { authUrl } = await response.json();

      // Redirect to Google OAuth
      window.location.href = authUrl;
    } catch (err: any) {
      console.error('Failed to start OAuth flow:', err);
      setError(err.message || 'Failed to connect to Google. Please try again.');
      setConnecting(null);
    }
  };

  const handleDisconnect = async (inboxId: string, email: string) => {
    if (!confirm(`Disconnect ${email}? Email monitoring for this inbox will be paused.`)) {
      return;
    }

    try {
      await supabase
        .from('email_inbox_configs')
        .update({ is_active: false, status: 'disconnected' })
        .eq('id', inboxId);

      await fetchInboxes();
    } catch (err: any) {
      console.error('Failed to disconnect:', err);
      setError('Failed to disconnect. Please try again.');
    }
  };

  const handleSyncNow = async (inboxId: string) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-inbox-poller`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ inboxId }),
        }
      );

      if (!response.ok) {
        throw new Error('Sync failed');
      }

      await fetchInboxes();
    } catch (err: any) {
      setError('Failed to sync emails. Please try again.');
    }
    setLoading(false);
  };

  const connectedPurposes = new Set(inboxes.filter(i => i.is_active).map(i => i.inbox_purpose));
  const availablePurposes: InboxPurpose[] = (['purchasing', 'accounting'] as InboxPurpose[])
    .filter(p => !connectedPurposes.has(p));

  if (loading && inboxes.length === 0) {
    return (
      <div className="bg-gray-800 dark:bg-gray-800 light:bg-white rounded-xl border border-gray-700 dark:border-gray-700 light:border-gray-200 p-6">
        <div className="flex items-center gap-3 text-gray-400 dark:text-gray-400 light:text-gray-600">
          <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          Checking email connections...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-900/20 dark:bg-red-900/20 light:bg-red-50 border border-red-800 dark:border-red-800 light:border-red-200 rounded-lg flex items-center gap-2 text-red-400 dark:text-red-400 light:text-red-600">
          <AlertTriangleIcon className="w-5 h-5 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-300 hover:text-red-200">
            <XCircleIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Connected Inboxes */}
      {inboxes.filter(i => i.is_active).map(inbox => (
        <InboxCard
          key={inbox.id}
          inbox={inbox}
          onDisconnect={() => handleDisconnect(inbox.id, inbox.email_address)}
          onSync={() => handleSyncNow(inbox.id)}
          loading={loading}
        />
      ))}

      {/* Add New Inbox */}
      {availablePurposes.length > 0 && (
        <div className="bg-gray-800 dark:bg-gray-800 light:bg-white rounded-xl border border-gray-700 dark:border-gray-700 light:border-gray-200 overflow-hidden">
          {!showAddInbox ? (
            <button
              onClick={() => setShowAddInbox(true)}
              className="w-full p-4 flex items-center justify-center gap-2 text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
              {inboxes.length === 0 ? 'Connect Email for Monitoring' : 'Add Another Email'}
            </button>
          ) : (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white dark:text-white light:text-gray-900">
                  Connect Email Inbox
                </h3>
                <button
                  onClick={() => setShowAddInbox(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <XCircleIcon className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-gray-400 dark:text-gray-400 light:text-gray-600">
                Choose which type of email to connect. You can have one of each type.
              </p>

              <div className="grid gap-3">
                {availablePurposes.map(purpose => (
                  <PurposeOption
                    key={purpose}
                    purpose={purpose}
                    info={PURPOSE_INFO[purpose]}
                    onConnect={() => handleConnect(purpose)}
                    connecting={connecting === purpose}
                  />
                ))}
              </div>

              {/* Security Note */}
              <div className="flex items-start gap-2 p-3 bg-blue-900/20 dark:bg-blue-900/20 light:bg-blue-50 border border-blue-800 dark:border-blue-800 light:border-blue-200 rounded-lg">
                <ShieldCheckIcon className="w-5 h-5 text-blue-400 dark:text-blue-400 light:text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-200 dark:text-blue-200 light:text-blue-700">
                  <p className="font-medium">Your data is secure</p>
                  <p className="text-blue-300/80 dark:text-blue-300/80 light:text-blue-600">
                    We only read business-related emails. Personal emails are never accessed.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* All Connected Message */}
      {availablePurposes.length === 0 && inboxes.length > 0 && (
        <div className="text-center text-gray-500 dark:text-gray-500 light:text-gray-400 py-2">
          <CheckCircleIcon className="w-5 h-5 inline-block mr-2" />
          All email types connected
        </div>
      )}
    </div>
  );
};

// Individual inbox card
const InboxCard: React.FC<{
  inbox: InboxConfig;
  onDisconnect: () => void;
  onSync: () => void;
  loading: boolean;
}> = ({ inbox, onDisconnect, onSync, loading }) => {
  const info = PURPOSE_INFO[inbox.inbox_purpose] || PURPOSE_INFO.general;

  return (
    <div className="bg-gray-800 dark:bg-gray-800 light:bg-white rounded-xl border border-gray-700 dark:border-gray-700 light:border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 dark:border-gray-700 light:border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-900/30 dark:bg-green-900/30 light:bg-green-100 rounded-lg">
              <MailIcon className="w-5 h-5 text-green-400 dark:text-green-400 light:text-green-600" />
            </div>
            <div>
              <h4 className="font-medium text-white dark:text-white light:text-gray-900">{info.title}</h4>
              <p className="text-sm text-gray-400 dark:text-gray-400 light:text-gray-600">{inbox.email_address}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="w-4 h-4 text-green-400" />
            <span className="text-sm text-green-400 dark:text-green-400 light:text-green-600">Connected</span>
          </div>
        </div>
      </div>

      {/* Stats & Actions */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-6">
            <div>
              <p className="text-xs text-gray-500 uppercase">Emails Processed</p>
              <p className="text-lg font-bold text-white dark:text-white light:text-gray-900">
                {inbox.total_emails_processed || 0}
              </p>
            </div>
            {inbox.last_sync_at && (
              <div>
                <p className="text-xs text-gray-500 uppercase">Last Sync</p>
                <p className="text-sm text-gray-300 dark:text-gray-300 light:text-gray-600">
                  {new Date(inbox.last_sync_at).toLocaleString()}
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onSync}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-700 dark:bg-gray-700 light:bg-gray-100 hover:bg-gray-600 dark:hover:bg-gray-600 light:hover:bg-gray-200 text-white dark:text-white light:text-gray-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Sync
            </button>
            <button
              onClick={onDisconnect}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors"
            >
              <XCircleIcon className="w-4 h-4" />
              Disconnect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Purpose selection option
const PurposeOption: React.FC<{
  purpose: InboxPurpose;
  info: { title: string; description: string; benefits: string[] };
  onConnect: () => void;
  connecting: boolean;
}> = ({ purpose, info, onConnect, connecting }) => {
  return (
    <div className="p-4 bg-gray-900 dark:bg-gray-900 light:bg-gray-50 rounded-lg border border-gray-700 dark:border-gray-700 light:border-gray-200">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h4 className="font-medium text-white dark:text-white light:text-gray-900 mb-1">{info.title}</h4>
          <p className="text-sm text-gray-400 dark:text-gray-400 light:text-gray-600 mb-3">{info.description}</p>
          <ul className="space-y-1">
            {info.benefits.slice(0, 2).map((benefit, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500 light:text-gray-500">
                <CheckCircleIcon className="w-3 h-3 text-green-400 dark:text-green-400 light:text-green-600" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
        <button
          onClick={onConnect}
          disabled={connecting}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all flex-shrink-0
            ${connecting
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'bg-white hover:bg-gray-100 text-gray-900'
            }
          `}
        >
          {connecting ? (
            <>
              <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <GoogleIcon />
              Connect
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// Simple Google icon component
const GoogleIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

export default EmailConnectionCard;
