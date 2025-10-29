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
    // Check if we have a recovery token in the URL
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get('type');
    const accessToken = hashParams.get('access_token');
    
    if (type !== 'recovery') {
      setError('Invalid or expired password reset link. Please request a new one.');
      return;
    }

    if (!accessToken) {
      setError('No recovery token found. Please request a new password reset link.');
      return;
    }

    // Supabase automatically exchanges the URL hash for a session
    // We just need to wait for it and verify
    const initSession = async () => {
      try {
        // Give Supabase time to process the hash fragment
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if session was established
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Session error:', error);
          setError('Failed to verify recovery link. The link may have expired. Please request a new password reset.');
          return;
        }
        
        if (!data.session) {
          console.error('No session established from recovery link');
          setError('Failed to verify recovery link. Please request a new password reset.');
          return;
        }
        
        console.log('Recovery session established successfully');
        setSessionReady(true);
      } catch (err) {
        console.error('Session initialization error:', err);
        setError('Failed to initialize session. Please try the password reset link again.');
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

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      setSuccess(true);
      
      // Sign out and redirect to login after 2 seconds
      setTimeout(async () => {
        await supabase.auth.signOut();
        // Clear the hash and redirect to login
        window.location.href = '/';
      }, 2000);
    } catch (error: any) {
      setError(error.message || 'Failed to reset password');
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
