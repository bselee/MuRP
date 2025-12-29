/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GOOGLE AUTH - OAuth Flow Edge Function
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Handles Google OAuth authorization flow for:
 * - Email monitoring (Gmail API)
 * - Google Sheets integration
 * - Google Calendar integration
 *
 * Endpoints:
 * - GET /authorize - Returns OAuth URL for consent screen
 * - POST /callback - Exchanges auth code for tokens
 * - POST /refresh - Refreshes access token
 * - POST /revoke - Revokes Google access
 *
 * Mission: NEVER BE OUT OF STOCK
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

// OAuth redirect URL - should match Google Cloud Console configuration
const getRedirectUri = () => {
  const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)/)?.[1];
  if (projectRef) {
    return `https://${projectRef}.supabase.co/functions/v1/google-auth/callback`;
  }
  // Fallback for local development
  return Deno.env.get('GOOGLE_REDIRECT_URI') || 'http://localhost:54321/functions/v1/google-auth/callback';
};

// Scopes for different purposes
// CRITICAL: Always include userinfo.email and userinfo.profile to get the user's email address
const SCOPES = {
  email_monitoring: [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://www.googleapis.com/auth/gmail.send',
  ],
  sheets: [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
  ],
  calendar: [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/calendar',
  ],
  default: [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/gmail.send',
  ],
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.split('/').pop();

  try {
    switch (path) {
      case 'authorize':
        return handleAuthorize(req, url);
      case 'callback':
        return handleCallback(req, url);
      case 'refresh':
        return handleRefresh(req);
      case 'revoke':
        return handleRevoke(req);
      case 'status':
        return handleStatus(req);
      default:
        // If no path, treat as authorize for backward compatibility
        if (req.method === 'GET') {
          return handleAuthorize(req, url);
        }
        return new Response(
          JSON.stringify({ error: 'Unknown endpoint' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[google-auth] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * GET /authorize - Generate OAuth consent URL
 */
async function handleAuthorize(req: Request, url: URL): Promise<Response> {
  // Get purpose from query params (email_monitoring, sheets, calendar, default)
  const purpose = url.searchParams.get('purpose') || 'default';
  // inbox_purpose for email: 'purchasing' | 'accounting' | 'general'
  const inboxPurpose = url.searchParams.get('inbox_purpose') || 'purchasing';
  const state = url.searchParams.get('state') || crypto.randomUUID();

  // Get user from auth header (optional - for linking state to user)
  const authHeader = req.headers.get('authorization');
  let userId: string | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const { data: { user } } = await supabase.auth.getUser(token);
    userId = user?.id || null;
  }

  // Store state for CSRF protection with inbox purpose
  if (userId) {
    await supabase.from('oauth_states').insert({
      state,
      user_id: userId,
      purpose,
      inbox_purpose: purpose === 'email_monitoring' ? inboxPurpose : null,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min expiry
    });
  }

  // Build scopes based on purpose
  const scopeList = SCOPES[purpose as keyof typeof SCOPES] || SCOPES.default;
  const scope = scopeList.join(' ');

  // Build OAuth URL - encode inbox_purpose in state so we get it back
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', getRedirectUri());
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent'); // Force consent to get refresh token
  // Encode purpose:inbox_purpose:state in the state param
  authUrl.searchParams.set('state', `${purpose}:${inboxPurpose}:${state}`);

  console.log(`[google-auth] Generated auth URL for purpose: ${purpose}, inbox: ${inboxPurpose}`);

  return new Response(
    JSON.stringify({
      authUrl: authUrl.toString(),
      state,
      purpose,
      inboxPurpose,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * GET/POST /callback - Handle OAuth callback from Google
 */
async function handleCallback(req: Request, url: URL): Promise<Response> {
  // Get code and state from query params (GET) or body (POST)
  let code: string | null = null;
  let state: string | null = null;
  let error: string | null = null;

  if (req.method === 'GET') {
    code = url.searchParams.get('code');
    state = url.searchParams.get('state');
    error = url.searchParams.get('error');
  } else {
    const body = await req.json();
    code = body.code;
    state = body.state;
    error = body.error;
  }

  if (error) {
    console.error('[google-auth] OAuth error:', error);
    return redirectWithError(error);
  }

  if (!code) {
    return redirectWithError('No authorization code received');
  }

  // Parse state to get purpose:inbox_purpose:state_token
  const stateParts = (state || '').split(':');
  const purpose = stateParts[0] || 'default';
  const inboxPurpose = stateParts[1] || 'purchasing';
  const stateToken = stateParts[2] || stateParts[1] || ''; // Handle old format too

  // Verify state token (CSRF protection)
  const { data: stateRecord } = await supabase
    .from('oauth_states')
    .select('user_id, purpose, inbox_purpose')
    .eq('state', stateToken)
    .single();

  // Even if state verification fails, we'll continue but log a warning
  if (!stateRecord) {
    console.warn('[google-auth] State token not found or expired');
  }

  const userId = stateRecord?.user_id;
  // Prefer inbox_purpose from database (more reliable) over URL state
  const finalInboxPurpose = stateRecord?.inbox_purpose || inboxPurpose;

  // Exchange code for tokens
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: getRedirectUri(),
    }).toString(),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('[google-auth] Token exchange failed:', errorText);
    return redirectWithError('Failed to exchange authorization code');
  }

  const tokens = await tokenResponse.json();

  // Get user info from Google
  const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  let googleEmail = '';
  if (userInfoResponse.ok) {
    const userInfo = await userInfoResponse.json();
    googleEmail = userInfo.email || '';
  }

  // Store tokens - ALWAYS save to email_inbox_configs for email monitoring
  // This ensures the connection persists even if user session wasn't available

  // If we have a userId, also store in user_oauth_tokens
  if (userId) {
    const tokenData = {
      user_id: userId,
      provider: 'google',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      scopes: tokens.scope?.split(' ') || [],
      token_metadata: { google_email: googleEmail },
      updated_at: new Date().toISOString(),
    };

    await supabase
      .from('user_oauth_tokens')
      .upsert(tokenData, { onConflict: 'user_id,provider' });
  }

  // ALWAYS save to email_inbox_configs for email monitoring (with or without userId)
  // This ensures the OAuth tokens are stored and the inbox shows as connected
  if (purpose === 'email_monitoring' && googleEmail) {
    console.log(`[google-auth] Saving email config for ${googleEmail}, purpose: ${finalInboxPurpose}, userId: ${userId || 'none'}`);

    const purposeLabels: Record<string, string> = {
      purchasing: 'Purchasing',
      accounting: 'Accounting',
      general: 'General',
    };
    const inboxLabel = purposeLabels[finalInboxPurpose] || 'Email';

    // Try to find existing inbox: first by email+purpose, then just by purpose (for placeholder emails)
    let existingInbox = null;

    // Try exact email match first
    const { data: exactMatch } = await supabase
      .from('email_inbox_configs')
      .select('id, email_address')
      .eq('email_address', googleEmail)
      .eq('inbox_purpose', finalInboxPurpose)
      .maybeSingle();

    if (exactMatch) {
      existingInbox = exactMatch;
      console.log(`[google-auth] Found exact email match: ${exactMatch.id}`);
    } else {
      // Try to find any inbox with this purpose (could be a placeholder like purchasing@murp.io)
      const { data: purposeMatch } = await supabase
        .from('email_inbox_configs')
        .select('id, email_address')
        .eq('inbox_purpose', finalInboxPurpose)
        .limit(1)
        .maybeSingle();

      if (purposeMatch) {
        existingInbox = purposeMatch;
        console.log(`[google-auth] Found purpose match: ${purposeMatch.id} (was: ${purposeMatch.email_address})`);
      }
    }

    if (existingInbox) {
      // Update existing inbox with new tokens AND update the email address
      console.log(`[google-auth] Updating inbox ${existingInbox.id} with new tokens and email`);
      const { error: updateError } = await supabase
        .from('email_inbox_configs')
        .update({
          user_id: userId || undefined,
          email_address: googleEmail, // Update to actual Google email
          inbox_name: `${inboxLabel} - ${googleEmail}`,
          gmail_refresh_token: tokens.refresh_token,
          oauth_expires_at: tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
            : null,
          is_active: true,
          poll_enabled: true,
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingInbox.id);

      if (updateError) {
        console.error(`[google-auth] Failed to update inbox: ${updateError.message}`);
      } else {
        console.log(`[google-auth] Successfully updated inbox ${existingInbox.id}`);
      }
    } else {
      // Create new inbox config
      console.log(`[google-auth] Creating new inbox config for ${googleEmail}`);
      const { error: insertError } = await supabase
        .from('email_inbox_configs')
        .insert({
          user_id: userId || null,
          email_address: googleEmail,
          inbox_name: `${inboxLabel} - ${googleEmail}`,
          inbox_type: 'gmail',
          inbox_purpose: finalInboxPurpose,
          gmail_refresh_token: tokens.refresh_token,
          oauth_expires_at: tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
            : null,
          is_active: true,
          poll_enabled: true,
          status: 'active',
        });

      if (insertError) {
        console.error(`[google-auth] Failed to create inbox: ${insertError.message}`);
      } else {
        console.log(`[google-auth] Successfully created new inbox`);
      }
    }
  } else {
    console.log(`[google-auth] Not saving email config: purpose=${purpose}, googleEmail=${googleEmail || 'empty'}`);
  }

  // Clean up state token if it exists
  if (stateToken) {
    await supabase
      .from('oauth_states')
      .delete()
      .eq('state', stateToken);
  }

  console.log(`[google-auth] Successfully exchanged tokens for ${googleEmail}`);

  // For browser-based flow, redirect to success page
  if (req.method === 'GET') {
    // Redirect to frontend with success message
    const frontendUrl = Deno.env.get('FRONTEND_URL') || 'http://localhost:5173';
    const successUrl = new URL('/settings', frontendUrl);
    successUrl.searchParams.set('oauth', 'success');
    successUrl.searchParams.set('email', googleEmail);
    successUrl.searchParams.set('purpose', purpose);

    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': successUrl.toString(),
      },
    });
  }

  // For API-based flow, return tokens
  return new Response(
    JSON.stringify({
      success: true,
      email: googleEmail,
      access_token: tokens.access_token,
      expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      scopes: tokens.scope?.split(' ') || [],
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * POST /refresh - Refresh access token
 */
async function handleRefresh(req: Request): Promise<Response> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const token = authHeader.substring(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Invalid session' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get stored refresh token
  const { data: tokenRecord, error: tokenError } = await supabase
    .from('user_oauth_tokens')
    .select('refresh_token')
    .eq('user_id', user.id)
    .eq('provider', 'google')
    .single();

  if (tokenError || !tokenRecord?.refresh_token) {
    return new Response(
      JSON.stringify({ error: 'No refresh token available' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Refresh the token
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: tokenRecord.refresh_token,
      grant_type: 'refresh_token',
    }).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[google-auth] Token refresh failed:', errorText);
    return new Response(
      JSON.stringify({ error: 'Failed to refresh token' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const tokens = await response.json();

  // Update stored tokens
  await supabase
    .from('user_oauth_tokens')
    .update({
      access_token: tokens.access_token,
      expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('provider', 'google');

  console.log(`[google-auth] Refreshed token for user ${user.id}`);

  return new Response(
    JSON.stringify({
      access_token: tokens.access_token,
      expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * POST /revoke - Revoke Google access
 */
async function handleRevoke(req: Request): Promise<Response> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const token = authHeader.substring(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Invalid session' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get stored access token
  const { data: tokenRecord } = await supabase
    .from('user_oauth_tokens')
    .select('access_token')
    .eq('user_id', user.id)
    .eq('provider', 'google')
    .single();

  // Revoke with Google
  if (tokenRecord?.access_token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${tokenRecord.access_token}`, {
      method: 'POST',
    });
  }

  // Delete from database
  await supabase
    .from('user_oauth_tokens')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', 'google');

  // Deactivate email inbox configs
  await supabase
    .from('email_inbox_configs')
    .update({
      is_active: false,
      status: 'disconnected',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id);

  console.log(`[google-auth] Revoked access for user ${user.id}`);

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * GET /status - Get current OAuth status
 */
async function handleStatus(req: Request): Promise<Response> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const token = authHeader.substring(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Invalid session' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get stored token info
  const { data: tokenRecord } = await supabase
    .from('user_oauth_tokens')
    .select('google_email, scopes, expires_at, updated_at')
    .eq('user_id', user.id)
    .eq('provider', 'google')
    .single();

  if (!tokenRecord) {
    return new Response(
      JSON.stringify({
        connected: false,
        email: null,
        scopes: [],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get email inbox config for more details
  const { data: inboxConfig } = await supabase
    .from('email_inbox_configs')
    .select('is_active, status, last_sync_at, total_emails_processed')
    .eq('user_id', user.id)
    .single();

  return new Response(
    JSON.stringify({
      connected: true,
      email: tokenRecord.google_email,
      scopes: tokenRecord.scopes || [],
      expiresAt: tokenRecord.expires_at,
      lastUpdated: tokenRecord.updated_at,
      emailMonitoring: inboxConfig ? {
        active: inboxConfig.is_active,
        status: inboxConfig.status,
        lastSyncAt: inboxConfig.last_sync_at,
        emailsProcessed: inboxConfig.total_emails_processed || 0,
      } : null,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * Redirect with error for browser-based flow
 */
function redirectWithError(error: string): Response {
  const frontendUrl = Deno.env.get('FRONTEND_URL') || 'http://localhost:5173';
  const errorUrl = new URL('/settings', frontendUrl);
  errorUrl.searchParams.set('oauth', 'error');
  errorUrl.searchParams.set('error', error);

  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      'Location': errorUrl.toString(),
    },
  });
}
