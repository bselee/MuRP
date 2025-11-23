import React, { useState } from 'react';
import { useAuth } from '../lib/auth/AuthContext';
import { GmailIcon, GoogleCalendarIcon, GoogleSheetsIcon } from '../components/icons';
import { supabase } from '../lib/supabase/client';
import termsUrl from '../docs/TERMS_OF_SERVICE.md?url';

import Button from '@/components/ui/Button';
interface LoginScreenProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ addToast }) => {
  const { signIn, signUp, resetPassword, godMode } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState<'Purchasing' | 'Operations' | 'MFG 1' | 'MFG 2' | 'Fulfillment' | 'SHP/RCV'>('Purchasing');
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(true);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    const result = await signIn({ email, password });
    if (result.error) {
      addToast(`${result.error} You can also try Google Workspace SSO if your inbox is managed there.`, 'error');
    } else {
      addToast('Signed in successfully.', 'success');
    }
    setLoading(false);
  };

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      addToast("Passwords don't match.", 'error');
      return;
    }
    setLoading(true);
    const result = await signUp({ email, password, name: fullName, role: 'Staff', department });
    if (result.error) {
      addToast(result.error, 'error');
    } else {
      addToast('Check your inbox to confirm your account.', 'success');
      setMode('login');
    }
    setLoading(false);
  };

  const handleResetPassword = async () => {
    if (!email) {
      addToast('Enter your email to reset password.', 'info');
      return;
    }
    const result = await resetPassword(email);
    if (result.error) {
      addToast(result.error, 'error');
    } else {
      addToast('Reset instructions sent. Google Workspace SSO remains available if email is federated.', 'success');
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets',
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        addToast(error.message, 'error');
      }
    } catch (error: any) {
      addToast('Failed to sign in with Google', 'error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-indigo-950 to-slate-900 p-4">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-2xl">
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-indigo-500/10 via-fuchsia-500/10 to-cyan-500/10" />
          <div className="relative z-10 flex flex-col h-full justify-between space-y-6">
            <div>
              <p className="text-sm uppercase tracking-widest text-indigo-300">MuRP Access</p>
              <h1 className="mt-2 text-4xl font-bold text-white">Manufacturing Resource Portal</h1>
              <p className="mt-3 text-gray-300 text-sm">
                Securely connect to purchasing intelligence, BOM visibility, and AI copilots.
              </p>
            </div>
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-2xl font-semibold text-white">#1</p>
                  <p className="text-xs text-gray-400 mt-1">Purchase Assurance</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-2xl font-semibold text-white">24/7</p>
                  <p className="text-xs text-gray-400 mt-1">AI Coverage</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-2xl font-semibold text-white">SOC2</p>
                  <p className="text-xs text-gray-400 mt-1">Ready Controls</p>
                </div>
              </div>
              {godMode && (
                <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-3 text-sm text-yellow-200">
                  Dev God Mode enabled — production safeguards bypassed for this session.
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-gray-900/70 backdrop-blur-xl p-8 shadow-xl">
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-indigo-400">Access Portal</p>
              <h2 className="text-2xl font-semibold text-white mt-1">{mode === 'login' ? 'Welcome back' : 'Create account'}</h2>
            </div>
            <div className="flex space-x-2 rounded-full bg-gray-800 p-1">
              <Button
                className={`px-4 py-1 text-sm rounded-full ${mode === 'login' ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}
                onClick={() => setMode('login')}
              >
                Login
              </Button>
              <Button
                className={`px-4 py-1 text-sm rounded-full ${mode === 'signup' ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}
                onClick={() => setMode('signup')}
              >
                Sign Up
              </Button>
            </div>
          </div>

          <form onSubmit={mode === 'login' ? handleLogin : handleSignup} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="text-sm text-gray-400">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-800/80 p-3 text-white focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="Jamie Operations"
                  required
                />
              </div>
            )}
            <div>
              <label className="text-sm text-gray-400">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-800/80 p-3 text-white focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="you@company.com"
                required
              />
            </div>
            <div>
              <label className="text-sm text-gray-400">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-800/80 p-3 text-white focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="••••••••••"
                required
              />
            </div>
            {mode === 'signup' && (
              <>
                <div>
                  <label className="text-sm text-gray-400">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-800/80 p-3 text-white focus:border-indigo-500 focus:ring-indigo-500"
                    placeholder="Repeat password"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400">Department</label>
                  <select
                    value={department}
                    onChange={e => setDepartment(e.target.value as typeof department)}
                    className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-800/80 p-3 text-white focus:border-indigo-500 focus:ring-indigo-500"
                  >
                    <option>Purchasing</option>
                    <option>Operations</option>
                    <option>MFG 1</option>
                    <option>MFG 2</option>
                    <option>Fulfillment</option>
                    <option>SHP/RCV</option>
                  </select>
                </div>
              </>
            )}
            {mode === 'login' && (
              <div className="flex items-center justify-between text-sm text-gray-400">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={() => setRemember(!remember)}
                    className="rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500"
                  />
                  Remember me
                </label>
                <Button type="button" onClick={handleResetPassword} className="text-indigo-400 hover:text-indigo-300">
                  Forgot password?
                </Button>
              </div>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-500 disabled:bg-gray-700"
            >
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          <p className="text-xs text-gray-500 text-center mt-4">
            By continuing you agree to our{' '}
            <a
              href={termsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-300 hover:text-indigo-100 underline decoration-dotted"
            >
              Terms of Service
            </a>.
          </p>

          <div className="mt-6">
            <div className="flex items-center gap-2">
              <span className="w-full border-t border-gray-700" />
              <span className="text-xs uppercase tracking-widest text-gray-500">or continue with</span>
              <span className="w-full border-t border-gray-700" />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3">
              <Button
                type="button"
                className="flex items-center justify-between gap-4 rounded-xl border border-gray-700 bg-gray-800/60 p-4 text-white hover:border-indigo-500 hover:bg-gray-800 transition-colors text-left"
                onClick={handleGoogleSignIn}
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <GmailIcon className="h-5 w-5 text-[#EA4335]" />
                    <GoogleCalendarIcon className="h-5 w-5" />
                    <GoogleSheetsIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold leading-tight">Sign in with Google Workspace</p>
                    <p className="text-xs text-gray-400">Unlock Gmail, Calendar, Sheets & Docs sync</p>
                  </div>
                </div>
                <span className="text-xs uppercase tracking-[0.2em] text-gray-400">SSO</span>
              </Button>
              <Button
                type="button"
                className="flex items-center justify-center gap-2 rounded-xl border border-gray-700 bg-gray-800/60 p-3 text-white hover:border-indigo-500 transition-colors opacity-50 cursor-not-allowed"
                onClick={() => addToast('Microsoft OAuth coming soon.', 'info')}
                disabled
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 4H11.5V11.5H4V4ZM12.5 4H20V11.5H12.5V4ZM4 12.5H11.5V20H4V12.5ZM12.5 12.5H20V20H12.5V12.5Z" />
                </svg>
                Microsoft
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
