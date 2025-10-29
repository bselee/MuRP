/**
 * Supabase Client for Browser/Client-Side
 * Use this in React components and client-side code
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables:', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseAnonKey,
    url: supabaseUrl,
    allEnv: import.meta.env
  })
  throw new Error('Missing Supabase environment variables. Check your .env.local file.')
}

// Create a singleton instance for the browser
let clientInstance: ReturnType<typeof createSupabaseClient<Database>> | null = null

export function createClient() {
  // Return existing instance if available
  if (clientInstance) {
    return clientInstance
  }

  // Create new client instance
  clientInstance = createSupabaseClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
      },
    }
  )

  return clientInstance
}

// Export a pre-configured client for convenience
export const supabase = createClient()

// Type exports for convenience
export type SupabaseClient = ReturnType<typeof createClient>
export type Tables<T extends keyof Database['public']['Tables']> = 
  Database['public']['Tables'][T]['Row']

// Helper function to get the current session
export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession()
  
  if (error) {
    console.error('Error fetching session:', error)
    return null
  }
  
  return session
}

// Helper function to get the current user
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error) {
    console.error('Error fetching user:', error)
    return null
  }
  
  return user
}

// Helper function to sign out
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  
  if (error) {
    console.error('Error signing out:', error)
    throw error
  }
}
