/**
 * Google OAuth API Endpoints
 *
 * Handles OAuth 2.0 flow for Google APIs:
 * - /api/google-auth/authorize - Initiates OAuth flow
 * - /api/google-auth/callback - Handles OAuth callback
 * - /api/google-auth/status - Returns authentication status
 * - /api/google-auth/revoke - Revokes OAuth access
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createGoogleOAuthClient, getAuthUrl, getTokensFromCode, DEFAULT_SCOPES } from '../lib/google/client';
import { generateCodeVerifier, generateCodeChallenge, generateState } from '../lib/google/pkce';

// OAuth configuration from environment
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || '';

/**
 * Parse cookies from cookie header
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    if (key && value) acc[key] = value;
    return acc;
  }, {} as Record<string, string>);
}

/**
 * Main handler for Google Auth endpoints
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { pathname } = new URL(req.url!, `https://${req.headers.host}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Route to appropriate handler
    if (pathname.endsWith('/authorize') || pathname.includes('/authorize')) {
      return handleAuthorize(req, res);
    } else if (pathname.endsWith('/callback') || pathname.includes('/callback')) {
      return handleCallback(req, res);
    } else if (pathname.endsWith('/status') || pathname.includes('/status')) {
      return handleStatus(req, res);
    } else if (pathname.endsWith('/revoke') || pathname.includes('/revoke')) {
      return handleRevoke(req, res);
    } else if (pathname.endsWith('/refresh') || pathname.includes('/refresh')) {
      return handleRefresh(req, res);
    } else {
      return res.status(404).json({ error: 'Endpoint not found' });
    }
  } catch (error) {
    console.error('[GoogleAuth] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * GET /api/google-auth/authorize
 * Initiates OAuth flow by redirecting to Google consent screen
 */
async function handleAuthorize(req: VercelRequest, res: VercelResponse) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({
      error: 'Google OAuth not configured',
      message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required',
    });
  }

  try {
    // Generate PKCE verifier and challenge
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = generateState();

    // Store PKCE verifier and state in secure httpOnly cookies
    res.setHeader('Set-Cookie', [
      `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      `pkce_verifier=${verifier}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    ]);

    const oauth2Client = createGoogleOAuthClient({
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      redirectUri: GOOGLE_REDIRECT_URI || `https://${req.headers.host}/api/google-auth/callback`,
    });

    // Generate auth URL with PKCE and state
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [...DEFAULT_SCOPES], // Convert readonly array to mutable array
      prompt: 'consent',
      state: state,
      code_challenge: challenge,
      code_challenge_method: 'S256' as const,
    });

    // Return auth URL as JSON for client-side redirect
    return res.status(200).json({
      authUrl,
      scopes: DEFAULT_SCOPES,
    });
  } catch (error) {
    console.error('[GoogleAuth] Authorize error:', error);
    return res.status(500).json({
      error: 'Failed to generate authorization URL',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * GET /api/google-auth/callback
 * Handles OAuth callback from Google
 */
async function handleCallback(req: VercelRequest, res: VercelResponse) {
  const { code, error, state: receivedState } = req.query;

  if (error) {
    return res.status(400).send(`
      <html>
        <head><title>Google OAuth Error</title></head>
        <body>
          <h1>Authentication Failed</h1>
          <p>Error: ${error}</p>
          <p><a href="/">Return to app</a></p>
        </body>
      </html>
    `);
  }

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  // Parse cookies for PKCE verifier and state
  const cookies = parseCookies(req.headers.cookie || '');
  const expectedState = cookies.oauth_state;
  const verifier = cookies.pkce_verifier;

  // Validate state parameter (CSRF protection)
  if (!receivedState || receivedState !== expectedState) {
    return res.status(400).send(`
      <html>
        <head><title>Security Error</title></head>
        <body>
          <h1>Security Error</h1>
          <p>Invalid state parameter. This may indicate a CSRF attack.</p>
          <p><a href="/">Return to app</a></p>
        </body>
      </html>
    `);
  }

  // Clear cookies after use
  res.setHeader('Set-Cookie', [
    `oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    `pkce_verifier=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  ]);

  try {
    const oauth2Client = createGoogleOAuthClient({
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      redirectUri: GOOGLE_REDIRECT_URI || `https://${req.headers.host}/api/google-auth/callback`,
    });

    // Exchange code for tokens with PKCE verifier
    const { tokens } = await oauth2Client.getToken({
      code: code,
      codeVerifier: verifier,
    });

    // Return success page with tokens (client will save to database)
    const tokensJson = JSON.stringify(tokens);

    return res.status(200).send(`
      <html>
        <head>
          <title>Google OAuth Success</title>
          <script>
            // Send tokens to parent window (if opened in popup)
            if (window.opener) {
              window.opener.postMessage({
                type: 'GOOGLE_AUTH_SUCCESS',
                tokens: ${tokensJson}
              }, '*');
              window.close();
            } else {
              // No popup - show error message
              document.body.innerHTML = \`
                <h1>Authentication Successful</h1>
                <p>Please close this window and try connecting again.</p>
                <p>If you see this repeatedly, please enable popups for this site.</p>
              \`;
            }
          </script>
        </head>
        <body>
          <h1>Authentication Successful!</h1>
          <p>You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('[GoogleAuth] Callback error:', error);
    return res.status(500).send(`
      <html>
        <head><title>Google OAuth Error</title></head>
        <body>
          <h1>Authentication Failed</h1>
          <p>Error: ${error instanceof Error ? error.message : String(error)}</p>
          <p><a href="/">Return to app</a></p>
        </body>
      </html>
    `);
  }
}

/**
 * GET /api/google-auth/status
 * Returns current authentication status
 */
async function handleStatus(req: VercelRequest, res: VercelResponse) {
  // This endpoint is primarily handled client-side
  // Server-side, we can only check if credentials exist in database
  return res.status(200).json({
    configured: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
    message: 'Check authentication status client-side using GoogleAuthService',
  });
}

/**
 * POST /api/google-auth/revoke
 * Revokes OAuth access
 */
async function handleRevoke(req: VercelRequest, res: VercelResponse) {
  // Token revocation is handled client-side through GoogleAuthService
  return res.status(200).json({
    message: 'Use GoogleAuthService.revokeAccess() client-side to revoke tokens',
  });
}

/**
 * POST /api/google-auth/refresh
 * Refreshes an access token using a refresh token
 */
async function handleRefresh(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: 'Google OAuth not configured' });
  }

  const { refreshToken } = req.body ?? {};

  if (!refreshToken || typeof refreshToken !== 'string') {
    return res.status(400).json({ error: 'refreshToken is required' });
  }

  try {
    const body = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Failed to refresh token');
    }

    const data = await response.json();
    const expiresAt = data.expires_in
      ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
      : null;

    return res.status(200).json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expiresAt,
      scope: data.scope,
      token_type: data.token_type,
    });
  } catch (error) {
    console.error('[GoogleAuth] Refresh error:', error);
    return res.status(500).json({
      error: 'Failed to refresh token',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
