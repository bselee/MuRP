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
        // Get the code and other params from URL
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const error = params.get('error');
        const errorDescription = params.get('error_description');

        if (error) {
          throw new Error(errorDescription || error);
        }

        if (!code) {
          throw new Error('No verification code found in URL');
        }

        // Exchange the code for a session
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          throw exchangeError;
        }

        if (data.session) {
          // Mark user as onboarded since they've confirmed their email and set a password during signup
          const { error: updateError } = await supabase
            .from('user_profiles')
            .update({ onboarding_complete: true })
            .eq('id', data.session.user.id);

          if (updateError) {
            console.error('[AuthCallback] Failed to mark onboarding complete:', updateError);
          }

          setStatus('success');
          addToast('Email confirmed successfully! Welcome to MuRP.', 'success');

          // Redirect to dashboard after a short delay
          setTimeout(() => {
            window.location.href = '/';
          }, 1500);
        } else {
          throw new Error('Failed to create session');
        }
      } catch (err: any) {
        console.error('[AuthCallback] Error:', err);
        setStatus('error');
        setErrorMessage(err.message || 'Failed to confirm email');
        addToast(`Email confirmation failed: ${err.message}`, 'error');
      }
    };

    handleCallback();
  }, [addToast]);

  if (status === 'processing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-indigo-950 to-slate-900">
        <div className="text-center">
          <LoadingOverlay />
          <p className="mt-4 text-gray-300">Confirming your email...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-indigo-950 to-slate-900 p-4">
        <div className="max-w-md w-full rounded-3xl border border-red-500/30 bg-red-500/10 backdrop-blur-xl p-8 shadow-2xl">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Email Confirmation Failed</h2>
            <p className="text-red-200 mb-6">{errorMessage}</p>
            <a
              href="/"
              className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-colors"
            >
              Return to Login
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-indigo-950 to-slate-900 p-4">
      <div className="max-w-md w-full rounded-3xl border border-green-500/30 bg-green-500/10 backdrop-blur-xl p-8 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Email Confirmed!</h2>
          <p className="text-green-200 mb-6">Redirecting you to the dashboard...</p>
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;
