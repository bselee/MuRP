/**
 * Authentication utilities for Supabase
 */

import { supabase } from './client'
import type { Database } from '../../types/database'

export type User = Database['public']['Tables']['users']['Row']
export type UserRole = User['role']
export type UserDepartment = User['department']

/**
 * Get the current authenticated user
 */
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    return null
  }
  
  // Get user profile from users table
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .eq('is_deleted', false)
    .single()
  
  if (profileError || !profile) {
    return null
  }
  
  return profile
}

/**
 * Check if user has a specific role
 */
export async function hasRole(requiredRole: UserRole | UserRole[]): Promise<boolean> {
  const user = await getCurrentUser()
  
  if (!user) return false
  
  const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
  return roles.includes(user.role)
}

/**
 * Check if user is Admin
 */
export async function isAdmin(): Promise<boolean> {
  return hasRole('Admin')
}

/**
 * Check if user is Manager or Admin
 */
export async function isManagerOrAdmin(): Promise<boolean> {
  return hasRole(['Admin', 'Manager'])
}

/**
 * Check if user belongs to a specific department
 */
export async function hasDepartment(requiredDepartment: UserDepartment): Promise<boolean> {
  const user = await getCurrentUser()
  
  if (!user) return false
  
  return user.department === requiredDepartment
}

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  
  if (error) {
    throw new Error(error.message)
  }
  
  return data
}

/**
 * Sign out current user
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  
  if (error) {
    throw new Error(error.message)
  }
}

/**
 * Sign up new user (creates auth user only, profile created separately)
 */
export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  })
  
  if (error) {
    throw new Error(error.message)
  }
  
  return data
}

/**
 * Reset password
 */
export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  
  if (error) {
    throw new Error(error.message)
  }
}

/**
 * Update password
 */
export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  })
  
  if (error) {
    throw new Error(error.message)
  }
}

/**
 * Listen to auth state changes
 */
export function onAuthStateChange(callback: (user: User | null) => void) {
  return supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      const profile = await getCurrentUser()
      callback(profile)
    } else {
      callback(null)
    }
  })
}
