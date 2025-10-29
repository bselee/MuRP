// lib/supabase/server.ts
// Server-side Supabase client for API routes and server components

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'

/**
 * Create a Supabase client for server-side use (API routes, Server Components)
 * This client respects user sessions via cookies
 */
export async function createClient() {
  const cookieStore = cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // The `delete` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  )
}

/**
 * Create a Supabase admin client with service role key
 * ⚠️ USE WITH CAUTION - Bypasses RLS policies
 * Only use for admin operations that need to bypass row-level security
 */
export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      cookies: {
        get: () => undefined,
        set: () => {},
        remove: () => {},
      },
    }
  )
}

/**
 * Get the current authenticated user from the server
 */
export async function getCurrentUser() {
  const supabase = await createClient()
  
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error) {
    console.error('Error fetching user:', error)
    return null
  }
  
  return user
}

/**
 * Get the current user's role from the users table
 */
export async function getCurrentUserRole() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return null
  }
  
  const { data, error } = await supabase
    .from('users')
    .select('role, department')
    .eq('id', user.id)
    .single()
  
  if (error) {
    console.error('Error fetching user role:', error)
    return null
  }
  
  return data
}

/**
 * Verify user has required role
 */
export async function requireRole(allowedRoles: string[]) {
  const userRole = await getCurrentUserRole()
  
  if (!userRole) {
    throw new Error('Unauthorized: No user session')
  }
  
  if (!allowedRoles.includes(userRole.role)) {
    throw new Error(`Unauthorized: Required role is one of [${allowedRoles.join(', ')}]`)
  }
  
  return userRole
}

/**
 * Verify user is Admin
 */
export async function requireAdmin() {
  return requireRole(['Admin'])
}

/**
 * Verify user is Admin or Manager
 */
export async function requireManagerOrAdmin() {
  return requireRole(['Admin', 'Manager'])
}
