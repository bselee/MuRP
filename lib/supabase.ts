/**
 * Supabase Server Client
 * Use this in API routes and server-side code where SERVICE_ROLE_KEY is needed
 * DO NOT use in browser/client components - use lib/supabase/client.ts instead
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

// Server environment variables (not exposed to client)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

/**
 * Lazily create a Supabase admin client. Avoid throwing at module import time
 * so unauthenticated requests can still 401 instead of 500.
 */
export function getSupabaseAdmin() {
  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL environment variable for server client')
  }
  if (!supabaseServiceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable for server client')
  }
  const client = createClient<Database>(
    supabaseUrl,
    supabaseServiceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
  return client
}

/**
 * Create a Supabase client with user context (for API routes)
 * This respects RLS policies based on the user's JWT token
 */
export function createServerClient(accessToken?: string) {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL environment variable for server client')
  }
  if (!anonKey) {
    throw new Error('Missing SUPABASE_ANON_KEY for server client')
  }

  const client = createClient<Database>(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: accessToken
        ? {
            Authorization: `Bearer ${accessToken}`,
          }
        : {},
    },
  })

  return client
}

// Type exports for convenience
export type ServerSupabaseClient = ReturnType<typeof createClient<Database>>
export type Tables<T extends keyof Database['public']['Tables']> = 
  Database['public']['Tables'][T]['Row']
export type Inserts<T extends keyof Database['public']['Tables']> = 
  Database['public']['Tables'][T]['Insert']
export type Updates<T extends keyof Database['public']['Tables']> = 
  Database['public']['Tables'][T]['Update']
