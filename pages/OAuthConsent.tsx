/**
 * OAuth Consent Page
 *
 * Handles OAuth authorization consent for Supabase OAuth Server.
 * Third-party applications requesting access to MuRP will be shown this page
 * where users can approve or deny the authorization request.
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase/client';
import LoadingOverlay from '../components/LoadingOverlay';
import Button from '../components/ui/Button';

interface OAuthConsentProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

interface OAuthRequest {
  client_id: string;
  client_name?: string;
  redirect_uri: string;
  response_type: string;
  scope: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
}

interface ClientInfo {
  name: string;
  icon_url?: string;
  description?: string;
}

// Human-readable scope descriptions
const SCOPE_DESCRIPTIONS: Record<string, { name: string; description: string }> = {
  openid: {
    name: 'OpenID',
    description: 'Verify your identity',
  },
  profile: {
    name: 'Profile',
    description: 'View your basic profile information (name, avatar)',
  },
  email: {
    name: 'Email',
    description: 'View your email address',
  },
  offline_access: {
    name: 'Offline Access',
    description: 'Access your data when you\'re not using the app',
  },
  // Add MuRP-specific scopes as needed
  'read:inventory': {
    name: 'Read Inventory',
    description: 'View your inventory items and stock levels',
  },
  'write:inventory': {
    name: 'Write Inventory',
    description: 'Create and update inventory items',
  },
  'read:orders': {
    name: 'Read Orders',
    description: 'View purchase orders and requisitions',
  },
  'write:orders': {
    name: 'Write Orders',
    description: 'Create and manage purchase orders',
  },
  'read:vendors': {
    name: 'Read Vendors',
    description: 'View vendor information',
  },
};

const OAuthConsent: React.FC<OAuthConsentProps> = ({ addToast }) => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthRequest, setOauthRequest] = useState<OAuthRequest | null>(null);
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const parseOAuthRequest = async () => {
      try {
        // Check if user is authenticated
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          // Redirect to login with return URL
          const returnUrl = window.location.href;
          window.location.href = `/?returnTo=${encodeURIComponent(returnUrl)}`;
          return;
        }
        setIsAuthenticated(true);

        // Parse OAuth parameters from URL
        const params = new URLSearchParams(window.location.search);

        const clientId = params.get('client_id');
        const redirectUri = params.get('redirect_uri');
        const responseType = params.get('response_type') || 'code';
        const scope = params.get('scope') || 'openid';
        const state = params.get('state') || undefined;
        const codeChallenge = params.get('code_challenge') || undefined;
        const codeChallengeMethod = params.get('code_challenge_method') || undefined;

        if (!clientId) {
          throw new Error('Missing client_id parameter');
        }

        if (!redirectUri) {
          throw new Error('Missing redirect_uri parameter');
        }

        const request: OAuthRequest = {
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: responseType,
          scope,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
        };

        setOauthRequest(request);

        // Try to fetch client info from Supabase
        // For dynamic OAuth apps, this might be stored in a table
        const { data: clientData } = await supabase
          .from('oauth_clients')
          .select('name, icon_url, description')
          .eq('client_id', clientId)
          .single();

        if (clientData) {
          setClientInfo(clientData);
          request.client_name = clientData.name;
        } else {
          // Use client_id as fallback name
          setClientInfo({
            name: clientId,
            description: 'A third-party application',
          });
        }

        setLoading(false);
      } catch (err: any) {
        console.error('[OAuthConsent] Error:', err);
        setError(err.message || 'Failed to process authorization request');
        setLoading(false);
      }
    };

    parseOAuthRequest();
  }, []);

  const handleApprove = async () => {
    if (!oauthRequest) return;

    setSubmitting(true);
    try {
      // Call Supabase OAuth Server authorize endpoint with approval
      const params = new URLSearchParams({
        client_id: oauthRequest.client_id,
        redirect_uri: oauthRequest.redirect_uri,
        response_type: oauthRequest.response_type,
        scope: oauthRequest.scope,
        consent: 'true',
      });

      if (oauthRequest.state) {
        params.set('state', oauthRequest.state);
      }
      if (oauthRequest.code_challenge) {
        params.set('code_challenge', oauthRequest.code_challenge);
      }
      if (oauthRequest.code_challenge_method) {
        params.set('code_challenge_method', oauthRequest.code_challenge_method);
      }

      // Redirect to Supabase OAuth authorize endpoint with consent=true
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      window.location.href = `${supabaseUrl}/auth/v1/authorize?${params.toString()}`;
    } catch (err: any) {
      console.error('[OAuthConsent] Approval error:', err);
      addToast(`Authorization failed: ${err.message}`, 'error');
      setSubmitting(false);
    }
  };

  const handleDeny = () => {
    if (!oauthRequest) return;

    // Redirect back to client with error
    const redirectUrl = new URL(oauthRequest.redirect_uri);
    redirectUrl.searchParams.set('error', 'access_denied');
    redirectUrl.searchParams.set('error_description', 'The user denied the authorization request');
    if (oauthRequest.state) {
      redirectUrl.searchParams.set('state', oauthRequest.state);
    }

    window.location.href = redirectUrl.toString();
  };

  const parsedScopes = (oauthRequest?.scope || '').split(' ').filter(Boolean);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-accent-900 to-slate-900">
        <div className="text-center">
          <LoadingOverlay />
          <p className="mt-4 text-gray-300">Loading authorization request...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-accent-900 to-slate-900 p-4">
        <div className="max-w-md w-full rounded-3xl border border-red-500/30 bg-red-500/10 backdrop-blur-xl p-8 shadow-2xl">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Authorization Error</h2>
            <p className="text-red-200 mb-6">{error}</p>
            <a
              href="/"
              className="inline-block px-6 py-3 bg-accent-500 text-white rounded-xl hover:bg-accent-600 transition-colors"
            >
              Return to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-accent-900 to-slate-900 p-4">
      <div className="max-w-lg w-full rounded-3xl border border-accent-500/30 bg-gray-800/80 backdrop-blur-xl p-8 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-accent-500/20 flex items-center justify-center mb-4">
            {clientInfo?.icon_url ? (
              <img
                src={clientInfo.icon_url}
                alt={clientInfo.name}
                className="w-12 h-12 rounded-lg"
              />
            ) : (
              <svg className="w-10 h-10 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Authorize {clientInfo?.name || 'Application'}
          </h1>
          <p className="text-gray-400">
            {clientInfo?.description || 'This application wants to access your MuRP account'}
          </p>
        </div>

        {/* Scopes */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wide mb-4">
            This app would like to:
          </h2>
          <div className="space-y-3">
            {parsedScopes.map((scope) => {
              const scopeInfo = SCOPE_DESCRIPTIONS[scope] || {
                name: scope,
                description: `Access to ${scope}`,
              };
              return (
                <div
                  key={scope}
                  className="flex items-start gap-3 p-3 rounded-xl bg-gray-700/50 border border-gray-600/50"
                >
                  <div className="w-8 h-8 rounded-lg bg-accent-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-medium">{scopeInfo.name}</p>
                    <p className="text-sm text-gray-400">{scopeInfo.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Security notice */}
        <div className="mb-8 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm text-amber-200">
              Make sure you trust <strong>{clientInfo?.name || 'this application'}</strong>.
              Authorizing will allow it to access your data according to the permissions listed above.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <Button
            onClick={handleDeny}
            disabled={submitting}
            className="flex-1 px-6 py-3 bg-gray-700 text-white rounded-xl hover:bg-gray-600 transition-colors border border-gray-600"
          >
            Deny
          </Button>
          <Button
            onClick={handleApprove}
            disabled={submitting}
            className="flex-1 px-6 py-3 bg-accent-500 text-white rounded-xl hover:bg-accent-600 transition-colors"
          >
            {submitting ? 'Authorizing...' : 'Authorize'}
          </Button>
        </div>

        {/* Footer links */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <a href="/privacy" className="hover:text-gray-300 transition-colors">
            Privacy Policy
          </a>
          <span className="mx-2">|</span>
          <a href="/terms" className="hover:text-gray-300 transition-colors">
            Terms of Service
          </a>
        </div>
      </div>
    </div>
  );
};

export default OAuthConsent;
