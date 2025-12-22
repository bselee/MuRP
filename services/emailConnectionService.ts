/**
 * Email Connection Service
 *
 * Handles Gmail OAuth flow completion and inbox configuration for PO email monitoring.
 * Creates inbox configs after successful OAuth and manages connection state.
 */

import { supabase } from '../lib/supabase/client';

export interface EmailInboxConfig {
  id: string;
  user_id: string;
  inbox_name: string;
  email_address: string;
  inbox_type: 'gmail';
  is_active: boolean;
  poll_enabled: boolean;
  poll_interval_minutes: number;
  last_sync_at: string | null;
  last_history_id: string | null;
  gmail_refresh_token: string | null;
  keyword_filters: string[];
  created_at: string;
}

export interface ConnectionResult {
  success: boolean;
  inboxId?: string;
  error?: string;
}

/**
 * Complete email connection after OAuth callback
 * Called after user returns from Google OAuth consent screen
 */
export async function completeEmailConnection(
  userId: string,
  authCode: string
): Promise<ConnectionResult> {
  try {
    // Exchange auth code for tokens via edge function
    const response = await fetch('/api/google-auth/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: authCode,
        purpose: 'email_monitoring',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to exchange auth code');
    }

    const tokens = await response.json();

    // Get user email from tokens or fetch from Google
    const email = tokens.email || await fetchUserEmail(tokens.access_token);

    if (!email) {
      throw new Error('Could not determine email address');
    }

    // Create or update inbox configuration
    const { data: existingConfig } = await supabase
      .from('email_inbox_configs')
      .select('id')
      .eq('user_id', userId)
      .eq('email_address', email)
      .maybeSingle();

    let inboxId: string;

    if (existingConfig) {
      // Update existing config
      const { error: updateError } = await supabase
        .from('email_inbox_configs')
        .update({
          is_active: true,
          gmail_refresh_token: tokens.refresh_token,
          last_sync_at: null, // Reset sync to start fresh
        })
        .eq('id', existingConfig.id);

      if (updateError) throw updateError;
      inboxId = existingConfig.id;
    } else {
      // Create new config
      const { data: newConfig, error: insertError } = await supabase
        .from('email_inbox_configs')
        .insert({
          user_id: userId,
          inbox_name: 'Primary Gmail',
          email_address: email,
          inbox_type: 'gmail',
          is_active: true,
          poll_enabled: true,
          poll_interval_minutes: 5,
          gmail_refresh_token: tokens.refresh_token,
          keyword_filters: [
            'tracking',
            'shipped',
            'shipment',
            'delivery',
            'invoice',
            'PO',
            'purchase order',
            'confirmation',
            'backorder',
            'delay',
          ],
        })
        .select()
        .single();

      if (insertError) throw insertError;
      inboxId = newConfig.id;
    }

    // Start Gmail watch for push notifications (optional enhancement)
    try {
      await startGmailWatch(tokens.access_token, email);
    } catch (watchError) {
      // Watch is optional - polling will work as fallback
      console.warn('Could not start Gmail watch:', watchError);
    }

    return { success: true, inboxId };

  } catch (err: any) {
    console.error('Failed to complete email connection:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Fetch user's email address from Google API
 */
async function fetchUserEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.email || null;
  } catch {
    return null;
  }
}

/**
 * Start Gmail push notifications (webhook-based real-time updates)
 */
async function startGmailWatch(accessToken: string, email: string): Promise<void> {
  const webhookUrl = `${window.location.origin}/api/email-webhook`;

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topicName: `projects/${import.meta.env.VITE_GOOGLE_PROJECT_ID}/topics/gmail-push`,
      labelIds: ['INBOX'],
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to start Gmail watch');
  }
}

/**
 * Disconnect email monitoring for a user
 */
export async function disconnectEmail(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('email_inbox_configs')
      .update({ is_active: false })
      .eq('user_id', userId);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Get email connection status for a user
 */
export async function getEmailConnectionStatus(userId: string): Promise<{
  isConnected: boolean;
  config?: EmailInboxConfig;
}> {
  try {
    const { data, error } = await supabase
      .from('email_inbox_configs')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return {
      isConnected: !!data,
      config: data || undefined,
    };
  } catch (err) {
    console.error('Error checking email status:', err);
    return { isConnected: false };
  }
}

/**
 * Update inbox polling settings
 */
export async function updateInboxSettings(
  inboxId: string,
  settings: {
    poll_enabled?: boolean;
    poll_interval_minutes?: number;
    keyword_filters?: string[];
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('email_inbox_configs')
      .update(settings)
      .eq('id', inboxId);

    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export default {
  completeEmailConnection,
  disconnectEmail,
  getEmailConnectionStatus,
  updateInboxSettings,
};
