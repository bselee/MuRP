/**
 * Supabase Client
 *
 * Initialized Supabase client for frontend use with TypeScript types.
 * Fails fast if environment variables are missing.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database';

const supabaseUrl = (
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  ''
).trim();
const supabaseAnonKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ''
).trim();

/**
 * Configuration status for the app to check
 */
export const supabaseConfigStatus = {
  isConfigured: !!(supabaseUrl && supabaseAnonKey),
  missingUrl: !supabaseUrl,
  missingKey: !supabaseAnonKey,
};

// Log configuration issues in development only
if (!supabaseConfigStatus.isConfigured && import.meta.env.DEV) {
  console.error(
    '[Supabase] Missing environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  );
}

// In production, fail fast with a clear error
if (!supabaseConfigStatus.isConfigured && import.meta.env.PROD) {
  throw new Error(
    'Supabase configuration missing. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.'
  );
}

// Create client - in dev mode, allow placeholder for component rendering tests
// CRITICAL: Only create ONE client instance to avoid "Multiple GoTrueClient instances" warning
export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: supabaseConfigStatus.isConfigured,
      autoRefreshToken: supabaseConfigStatus.isConfigured,
    },
  }
);

export type Tables<T extends keyof Database['public']['Tables']> = 
  Database['public']['Tables'][T]['Row'];
