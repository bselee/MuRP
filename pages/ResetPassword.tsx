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
        const token = hashParams.get('token') || queryParams.get('token');
        const accessToken = hashParams.get('access_token') || queryParams.get('access_token');
        
        console.log('[ResetPassword] Initializing...', { 
          type,
          hasToken: !!token,
          hasAccessToken: !!accessToken,
          url: window.location.href,
          hash: window.location.hash,
          search: window.location.search
        });
        
        if (type !== 'recovery') {
          console.error('[ResetPassword] Not a recovery link, type:', type);
          setError('Invalid password reset link. Please request a new one.');
          return;
        }

        // If we have an access_token in the URL, proceed with password reset
        // We'll attempt to set session in the background but won't wait for it
        if (accessToken) {
          console.log('[ResetPassword] Found access_token, setting session in background...');
          
          // Fire and forget - don't wait for this
          supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: hashParams.get('refresh_token') || queryParams.get('refresh_token') || '',
          }).then((result) => {
            if (result.error) {
              console.error('[ResetPassword] Background setSession error:', result.error);
            } else {
              console.log('[ResetPassword] Background setSession succeeded');
            }
          }).catch((err) => {
            console.error('[ResetPassword] Background setSession exception:', err);
          });
          
          // Proceed immediately to show password form
          console.log('[ResetPassword] Proceeding to show password reset form');
          setSessionReady(true);
          return;
        }
        
        // If we have a token parameter, verify it
        if (token) {
          console.log('[ResetPassword] Found token, verifying OTP...');
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: 'recovery',
          });
          
          if (error) {
            console.error('[ResetPassword] verifyOtp error:', error);
            setError('Failed to verify reset token. Link may have expired. Please request a new password reset.');
            return;
          }
          
          if (data.session) {
            console.log('[ResetPassword] Session established via verifyOtp');
            setSessionReady(true);
            return;
          }
        }
        
        // Last resort: wait briefly and check if session exists
        console.log('[ResetPassword] No direct tokens found, checking for existing session...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (!sessionError && session) {
          console.log('[ResetPassword] Found existing session');
          setSessionReady(true);
          return;
        }
        
        console.error('[ResetPassword] No valid session or tokens found');
        setError('Could not verify password reset link. Please request a new one.');
        
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

  // Show error state with option to go back
  if (error && !sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="w-full max-w-md">
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-8 text-center">
            <BoxIcon className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Reset Link Issue</h1>
            <p className="text-red-300 mb-6">{error}</p>
            <a
              href="/"
              className="inline-block bg-indigo-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Back to Login
            </a>
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
