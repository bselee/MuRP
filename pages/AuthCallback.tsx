import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase/client';
import LoadingOverlay from '../components/LoadingOverlay';

interface AuthCallbackProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const AuthCallback: React.FC<AuthCallbackProps> = ({ addToast }) => {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Check URL parameters for errors
        const params = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.substring(1));

        const error = params.get('error') || hashParams.get('error');
        const errorDescription = params.get('error_description') || hashParams.get('error_description');

        if (error) {
          throw new Error(errorDescription || error);
        }

        // Check for code (PKCE flow) or access_token (implicit flow)
        const code = params.get('code') || hashParams.get('code');
        const accessToken = hashParams.get('access_token');

        if (code) {
          // PKCE flow - exchange code for session
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            throw exchangeError;
          }

          if (!data.session) {
            throw new Error('Failed to create session from code');
          }
        } else if (accessToken) {
          // Implicit flow - Supabase processes hash automatically, wait for it
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          // No code or token - check if session already exists
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();

          if (sessionError) {
            throw sessionError;
          }

          if (!session) {
            throw new Error('No authentication data found');
          }
        }

        // Ensure profile exists using server function
        await supabase.rpc('ensure_user_profile');

        // Store OAuth tokens for Google Calendar integration
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.provider_token && session?.user) {
          // Save OAuth tokens to user_oauth_tokens table for calendar integration
          const expiresAt = session.expires_at
            ? new Date(session.expires_at * 1000).toISOString()
            : null;

          await supabase
            .from('user_oauth_tokens')
            .upsert({
              user_id: session.user.id,
              provider: 'google',
              access_token: session.provider_token,
              refresh_token: session.provider_refresh_token || null,
              expires_at: expiresAt,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'user_id,provider',
            });
        }

        setStatus('success');
        addToast('Authentication successful! Welcome to MuRP.', 'success');

        // Redirect to dashboard
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      } catch (err: any) {
        setStatus('error');
        setErrorMessage(err.message || 'Authentication failed');
        addToast(`Authentication failed: ${err.message}`, 'error');
      }
    };

    handleCallback();
  }, [addToast]);

  if (status === 'processing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-accent-900 to-slate-900">
        <div className="text-center">
          <LoadingOverlay />
          <p className="mt-4 text-gray-300">Completing authentication...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-accent-900 to-slate-900 p-4">
        <div className="max-w-md w-full rounded-3xl border border-red-500/30 bg-red-500/10 backdrop-blur-xl p-8 shadow-2xl">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Authentication Failed</h2>
            <p className="text-red-200 mb-6">{errorMessage}</p>
            <a
              href="/"
              className="inline-block px-6 py-3 bg-accent-500 text-white rounded-xl hover:bg-accent-500 transition-colors"
            >
              Return to Login
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-accent-900 to-slate-900 p-4">
      <div className="max-w-md w-full rounded-3xl border border-green-500/30 bg-green-500/10 backdrop-blur-xl p-8 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Authentication Successful!</h2>
          <p className="text-green-200 mb-6">Redirecting you to the dashboard...</p>
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;
