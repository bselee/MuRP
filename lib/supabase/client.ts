/**
 * Supabase Client Configuration
 * 
 * This file initializes the Supabase client for browser usage.
 * It uses environment variables to connect to the live Supabase instance.
 * 
 * Environment variables required:
 * - VITE_SUPABASE_URL: Your Supabase project URL
 * - VITE_SUPABASE_ANON_KEY: Your Supabase anonymous key
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database';

// Get environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl) {
  console.warn('VITE_SUPABASE_URL is not set. Supabase features will be disabled.');
}

if (!supabaseAnonKey) {
  console.warn('VITE_SUPABASE_ANON_KEY is not set. Supabase features will be disabled.');
}

/**
 * Supabase client instance
 * 
 * This client handles:
 * - Authentication
 * - Database queries
 * - Real-time subscriptions
 * - Storage operations
 * - Row Level Security (RLS)
 */
export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
      storageKey: 'tgf-mrp-auth',
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
    global: {
      headers: {
        'x-application': 'tgf-mrp',
      },
    },
  }
);

/**
 * Check if Supabase is properly configured
 */
export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseAnonKey && 
    supabaseUrl !== 'https://placeholder.supabase.co' &&
    supabaseAnonKey !== 'placeholder-key');
}

/**
 * Get the current user session
 */
export async function getCurrentSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Error getting session:', error);
    return null;
  }
  return session;
}

/**
 * Get the current user
 */
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error('Error getting user:', error);
    return null;
  }
  return user;
}

/**
 * Sign out the current user
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Error signing out:', error);
    throw error;
  }
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  
  if (error) {
    console.error('Error signing in:', error);
    throw error;
  }
  
  return data;
}

/**
 * Sign up with email and password
 */
export async function signUpWithEmail(email: string, password: string, metadata?: Record<string, unknown>) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata,
    },
  });
  
  if (error) {
    console.error('Error signing up:', error);
    throw error;
  }
  
  return data;
}

/**
 * Reset password for a user
 */
export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  
  if (error) {
    console.error('Error resetting password:', error);
    throw error;
  }
}

/**
 * Update user password
 */
export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });
  
  if (error) {
    console.error('Error updating password:', error);
    throw error;
  }
}

/**
 * Subscribe to authentication state changes
 */
export function onAuthStateChange(callback: (session: any) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}

export default supabase;
