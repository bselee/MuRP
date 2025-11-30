import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase/client';

import Button from '@/components/ui/Button';
interface ResetPasswordProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ResetPassword: React.FC<ResetPasswordProps> = ({ addToast }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if we have a valid recovery session
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      setIsValidSession(!!data.session);
    };
    checkSession();
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      addToast("Passwords don't match.", 'error');
      return;
    }

    if (newPassword.length < 6) {
      addToast('Password must be at least 6 characters long.', 'error');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      addToast('Password reset successfully!', 'success');

      // Redirect to login page after a short delay
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
    } catch (error: any) {
      console.error('[ResetPassword] Error:', error);
      addToast(error.message || 'Failed to reset password', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (isValidSession === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-accent-900 to-slate-900">
        <p className="text-gray-300">Checking session...</p>
      </div>
    );
  }

  if (isValidSession === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-accent-900 to-slate-900 p-4">
        <div className="max-w-md w-full rounded-3xl border border-red-500/30 bg-red-500/10 backdrop-blur-xl p-8 shadow-2xl">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Invalid or Expired Link</h2>
            <p className="text-red-200 mb-6">
              This password reset link is invalid or has expired. Please request a new one.
            </p>
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
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-white/10 bg-gray-900/70 backdrop-blur-xl p-8 shadow-xl">
          <div className="mb-8">
            <p className="text-sm uppercase tracking-[0.3em] text-accent-400">Password Reset</p>
            <h2 className="text-2xl font-semibold text-white mt-1">Set New Password</h2>
            <p className="text-gray-400 text-sm mt-2">
              Enter your new password below. Make it strong and memorable.
            </p>
          </div>

          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="text-sm text-gray-400">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-800/80 p-3 text-white focus:border-accent-500 focus:ring-accent-500"
                placeholder="••••••••••"
                required
                minLength={6}
              />
            </div>

            <div>
              <label className="text-sm text-gray-400">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-800/80 p-3 text-white focus:border-accent-500 focus:ring-accent-500"
                placeholder="••••••••••"
                required
                minLength={6}
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-accent-500 py-3 font-semibold text-white shadow-lg shadow-accent-500/30 transition-all hover:bg-accent-500 disabled:bg-gray-700"
            >
              {loading ? 'Resetting Password...' : 'Reset Password'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <a href="/" className="text-sm text-accent-400 hover:text-accent-300">
              Back to Login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
