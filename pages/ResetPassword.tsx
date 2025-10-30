import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase/client';
import { BoxIcon } from '../components/icons';

const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const initSession = async () => {
      try {
        // Parse URL parameters
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const queryParams = new URLSearchParams(window.location.search);

        const type = hashParams.get('type') || queryParams.get('type');
        const code = queryParams.get('code'); // PKCE code
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        console.log('[ResetPassword] Initializing session...', {
          type,
          hasCode: !!code,
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          url: window.location.href,
          hash: window.location.hash,
          search: window.location.search
        });

        // Verify this is a recovery link
        if (type !== 'recovery') {
          console.error('[ResetPassword] Not a recovery link, type:', type);
          setError('Invalid password reset link. Please request a new one.');
          return;
        }

        // Method 1: PKCE code exchange (preferred with flowType: 'pkce')
        if (code) {
          console.log('[ResetPassword] PKCE code detected, exchanging for session...');

          // The Supabase client will automatically exchange the code for a session
          // when detectSessionInUrl is enabled. We just need to wait for it.
          await new Promise(resolve => setTimeout(resolve, 1500));

          const { data: { session }, error: sessionError } = await supabase.auth.getSession();

          if (sessionError) {
            console.error('[ResetPassword] Session error after code exchange:', sessionError);
            setError('Failed to establish session. Please request a new password reset link.');
            return;
          }

          if (session) {
            console.log('[ResetPassword] Session established via PKCE code exchange');
            setSessionReady(true);
            return;
          }

          console.warn('[ResetPassword] Code present but no session after exchange');
        }

        // Method 2: Direct access token (legacy hash-based flow)
        if (accessToken && refreshToken) {
          console.log('[ResetPassword] Access token detected, setting session...');

          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            console.error('[ResetPassword] setSession error:', error);
            setError('Failed to verify reset link. Please request a new one.');
            return;
          }

          if (data.session) {
            console.log('[ResetPassword] Session established via access token');
            setSessionReady(true);
            return;
          }
        }

        // Method 3: Wait for automatic session detection
        console.log('[ResetPassword] Waiting for automatic session detection...');

        // Give Supabase's detectSessionInUrl more time to work
        let attempts = 0;
        const maxAttempts = 6;

        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;

          const { data: { session }, error: sessionError } = await supabase.auth.getSession();

          if (session && !sessionError) {
            console.log(`[ResetPassword] Session found on attempt ${attempts}`);
            setSessionReady(true);
            return;
          }

          console.log(`[ResetPassword] No session yet (attempt ${attempts}/${maxAttempts})`);
        }

        // If we get here, session establishment failed
        console.error('[ResetPassword] Failed to establish session after all attempts');
        setError('Could not verify password reset link. The link may have expired. Please request a new one.');

      } catch (err) {
        console.error('[ResetPassword] Unexpected error:', err);
        setError('An error occurred while verifying your reset link. Please try requesting a new one.');
      }
    };

    initSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    console.log('[ResetPassword] Attempting to update password...');

    try {
      // Add timeout to updateUser call
      const updatePromise = supabase.auth.updateUser({
        password: password,
      });
      
      const timeoutPromise = new Promise<{ data: any; error: any }>((resolve) => {
        setTimeout(() => {
          console.warn('[ResetPassword] updateUser timeout after 10 seconds');
          resolve({ data: null, error: { message: 'Request timed out. Your password may have been updated. Try logging in.' } });
        }, 10000);
      });
      
      const { error } = await Promise.race([updatePromise, timeoutPromise]);

      if (error) {
        console.error('[ResetPassword] updateUser error:', error);
        throw error;
      }

      console.log('[ResetPassword] Password updated successfully');
      setSuccess(true);
      
      // Redirect to login after 2 seconds (don't wait for signOut)
      setTimeout(() => {
        console.log('[ResetPassword] Redirecting to login...');
        // Clear URL and go to login
        window.location.href = '/';
      }, 2000);
    } catch (error: any) {
      console.error('[ResetPassword] Failed to update password:', error);
      setError(error.message || 'Failed to reset password. Please try requesting a new reset link.');
    } finally {
      setLoading(false);
    }
  };

  // Show loading while establishing session
  if (!sessionReady && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="w-full max-w-md text-center">
          <BoxIcon className="w-16 h-16 text-indigo-400 mx-auto mb-4 animate-pulse" />
          <h1 className="text-2xl font-bold text-white mb-2">Verifying reset link...</h1>
          <p className="text-gray-400">Please wait while we verify your password reset request.</p>
          <p className="text-gray-500 text-sm mt-4">This should only take a few seconds.</p>
        </div>
      </div>
    );
  }

  // Show error state with option to go back or request new link
  if (error && !sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="w-full max-w-md">
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-8 text-center">
            <BoxIcon className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Reset Link Issue</h1>
            <p className="text-red-300 mb-6">{error}</p>
            <div className="space-y-3">
              <a
                href="/"
                className="block w-full bg-indigo-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Back to Login
              </a>
              <p className="text-gray-400 text-sm">
                The password reset link may have expired or been used already.
                <br />
                Please request a new password reset from the login page.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-green-900/30 border border-green-700 rounded-lg p-8">
            <BoxIcon className="w-16 h-16 text-green-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Password Reset Successful!</h1>
            <p className="text-gray-300">
              Your password has been updated. Redirecting you to login...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <BoxIcon className="w-16 h-16 text-indigo-400 mx-auto mb-4" />
          <h1 className="text-4xl font-bold text-white">Reset Password</h1>
          <p className="text-gray-400 mt-2">Enter your new password</p>
        </div>
        
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                New Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="••••••••"
              />
              <p className="text-xs text-gray-400 mt-1">At least 6 characters</p>
            </div>
            
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors"
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>

            <div className="text-center">
              <a
                href="/"
                className="text-sm text-indigo-400 hover:text-indigo-300"
              >
                Back to Login
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
