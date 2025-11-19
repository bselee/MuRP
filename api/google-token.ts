/**
 * Google Token Proxy API
 * 
 * Secure server-side token management
 * Handles refresh, revocation, and status checks
 * 
 * SECURITY: Client secret never exposed to browser
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface TokenRefreshResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

/**
 * Retry helper with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on client errors (400-499)
      if (error instanceof Error && 'status' in error) {
        const status = (error as any).status;
        if (status >= 400 && status < 500) {
          throw error;
        }
      }
      
      if (attempt < maxRetries - 1) {
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw lastError!;
}

/**
 * Refresh Google OAuth token (server-side)
 */
async function refreshGoogleToken(refreshToken: string): Promise<TokenRefreshResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured on server');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret, // ✅ Secure - server-side only
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    const error: any = new Error(
      `Google token refresh failed: ${errorData.error_description || errorData.error || 'Unknown error'}`
    );
    error.status = response.status;
    error.googleError = errorData;
    throw error;
  }

  return response.json();
}

/**
 * Revoke Google OAuth token
 */
async function revokeGoogleToken(token: string): Promise<void> {
  const response = await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  });

  if (!response.ok) {
    throw new Error(`Failed to revoke token: ${response.statusText}`);
  }
}

/**
 * Main handler
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get Supabase auth token from request
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized - No token provided' });
  }

  const supabaseToken = authHeader.replace('Bearer ', '');

  // Create Supabase client with user's JWT
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    global: {
      headers: {
        Authorization: `Bearer ${supabaseToken}`,
      },
    },
  });

  // Verify user session
  const { data: { user }, error: userError } = await supabase.auth.getUser(supabaseToken);
  
  if (userError || !user) {
    return res.status(401).json({ error: 'Unauthorized - Invalid token' });
  }

  const { action } = req.body;

  try {
    switch (action) {
      case 'refresh':
        return await handleRefresh(user.id, supabase, res);
      
      case 'revoke':
        return await handleRevoke(user.id, supabase, res);
      
      case 'status':
        return await handleStatus(user.id, supabase, res);
      
      default:
        return res.status(400).json({ error: 'Invalid action. Use: refresh, revoke, or status' });
    }
  } catch (error) {
    console.error('[google-token] Error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
}

/**
 * Handle token refresh
 */
async function handleRefresh(userId: string, supabase: any, res: VercelResponse) {
  // Fetch tokens from database
  const { data: tokenData, error: fetchError } = await supabase
    .from('user_oauth_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single();

  if (fetchError || !tokenData) {
    return res.status(404).json({ error: 'No Google account connected' });
  }

  if (!tokenData.refresh_token) {
    return res.status(400).json({ error: 'No refresh token available. Please reconnect Google account.' });
  }

  // Check if current token is still valid (5-minute buffer)
  const expiryDate = tokenData.expires_at ? new Date(tokenData.expires_at) : null;
  const bufferMs = 5 * 60 * 1000;
  const isValid = expiryDate && expiryDate.getTime() > Date.now() + bufferMs;

  if (isValid) {
    // Return cached token
    return res.json({
      access_token: tokenData.access_token,
      expires_at: tokenData.expires_at,
      cached: true,
    });
  }

  // Refresh token with retry logic
  const newTokens = await retryWithBackoff(
    () => refreshGoogleToken(tokenData.refresh_token),
    3,
    1000
  );

  const expiresAt = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();

  // Update database (refresh token may rotate)
  const { error: updateError } = await supabase
    .from('user_oauth_tokens')
    .update({
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token || tokenData.refresh_token,
      expires_at: expiresAt,
      scope: newTokens.scope,
    })
    .eq('user_id', userId)
    .eq('provider', 'google');

  if (updateError) {
    console.error('[google-token] Failed to update tokens:', updateError);
    // Continue anyway - token is valid even if DB update fails
  }

  return res.json({
    access_token: newTokens.access_token,
    expires_at: expiresAt,
    cached: false,
  });
}

/**
 * Handle token revocation
 */
async function handleRevoke(userId: string, supabase: any, res: VercelResponse) {
  // Fetch tokens
  const { data: tokenData } = await supabase
    .from('user_oauth_tokens')
    .select('access_token, refresh_token')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single();

  if (!tokenData) {
    return res.status(404).json({ error: 'No Google account connected' });
  }

  // Revoke with Google (use refresh token if available, otherwise access token)
  const tokenToRevoke = tokenData.refresh_token || tokenData.access_token;
  
  try {
    await revokeGoogleToken(tokenToRevoke);
  } catch (error) {
    console.error('[google-token] Revocation failed:', error);
    // Continue to delete from DB even if Google revocation fails
  }

  // Delete from database
  await supabase
    .from('user_oauth_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'google');

  return res.json({ success: true });
}

/**
 * Handle status check
 */
async function handleStatus(userId: string, supabase: any, res: VercelResponse) {
  const { data: tokenData } = await supabase
    .from('user_oauth_tokens')
    .select('access_token, expires_at, scope')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single();

  if (!tokenData) {
    return res.json({
      isAuthenticated: false,
      hasValidToken: false,
    });
  }

  const expiryDate = tokenData.expires_at ? new Date(tokenData.expires_at) : null;
  const hasValidToken = expiryDate ? expiryDate.getTime() > Date.now() : false;

  return res.json({
    isAuthenticated: true,
    hasValidToken,
    expiresAt: tokenData.expires_at,
    scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
  });
}
