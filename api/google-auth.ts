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

// OAuth configuration from environment
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || '';

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
    const oauth2Client = createGoogleOAuthClient({
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      redirectUri: GOOGLE_REDIRECT_URI || `https://${req.headers.host}/api/google-auth/callback`,
    });

    const authUrl = getAuthUrl(oauth2Client, DEFAULT_SCOPES);

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
  const { code, error } = req.query;

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

  try {
    const oauth2Client = createGoogleOAuthClient({
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      redirectUri: GOOGLE_REDIRECT_URI || `https://${req.headers.host}/api/google-auth/callback`,
    });

    const tokens = await getTokensFromCode(oauth2Client, code);

    // Return success page with tokens (client will save to database)
    const tokensJson = JSON.stringify(tokens);
    const tokensBase64 = Buffer.from(tokensJson).toString('base64');

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
              // Store in localStorage and redirect
              localStorage.setItem('google_auth_tokens', '${tokensBase64}');
              window.location.href = '/settings?google_auth=success';
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
