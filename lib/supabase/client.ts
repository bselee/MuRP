/**
 * Supabase Client
 * 
 * Initialized Supabase client for frontend use with TypeScript types
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

// Don't throw during module initialization - let app render error UI instead
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase Client] Missing environment variables:', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseAnonKey,
    urlValue: supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'undefined',
    availableEnvVars: Object.keys(import.meta.env),
  });
  console.error('[Supabase Client] App will not function correctly without proper configuration');
}

// Create client only if we have valid credentials
// This prevents blank screen if env vars are missing - app can show error UI
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : createClient<Database>('https://placeholder.supabase.co', 'placeholder-key', {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

export type Tables<T extends keyof Database['public']['Tables']> = 
  Database['public']['Tables'][T]['Row'];
