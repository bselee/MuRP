/**
 * Configuration Gate
 *
 * Displays a user-friendly error when required configuration is missing.
 * Wraps the app to prevent rendering with invalid config.
 */

import React from 'react';
import { supabaseConfigStatus } from '../lib/supabase/client';

interface ConfigurationGateProps {
  children: React.ReactNode;
}

const ConfigurationGate: React.FC<ConfigurationGateProps> = ({ children }) => {
  // In production, the client will throw before this renders
  // This is for development mode where we want to show a helpful UI
  if (!supabaseConfigStatus.isConfigured) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 border border-red-500/30 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Configuration Required</h1>
              <p className="text-sm text-gray-400">MuRP cannot connect to the database</p>
            </div>
          </div>

          <div className="bg-gray-900/50 rounded-lg p-4 space-y-2">
            <p className="text-sm text-gray-300">Missing environment variables:</p>
            <ul className="text-sm text-gray-400 space-y-1">
              {supabaseConfigStatus.missingUrl && (
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-400"></span>
                  <code className="text-red-300">VITE_SUPABASE_URL</code>
                </li>
              )}
              {supabaseConfigStatus.missingKey && (
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-400"></span>
                  <code className="text-red-300">VITE_SUPABASE_ANON_KEY</code>
                </li>
              )}
            </ul>
          </div>

          <div className="text-sm text-gray-400 space-y-2">
            <p className="font-medium text-gray-300">To fix this:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Create a <code className="text-blue-300">.env</code> file in the project root</li>
              <li>Add your Supabase credentials:</li>
            </ol>
            <pre className="bg-gray-900 rounded p-3 text-xs overflow-x-auto">
              <code className="text-green-300">
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
              </code>
            </pre>
            <li className="list-decimal list-inside">Restart the dev server</li>
          </div>

          <div className="pt-2 border-t border-gray-700">
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              Get credentials from Supabase Dashboard →
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ConfigurationGate;
