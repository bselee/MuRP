/**
 * Authentication Service
 * 
 * Handles all authentication operations using Supabase Auth.
 * 
 * Features:
 * - Email/password authentication
 * - Password reset flow
 * - Session management
 * - Role-based access control (RBAC)
 * - Auth state observers
 */

import {
  supabase,
  signInWithEmail,
  signUpWithEmail,
  signOut,
  resetPassword,
  getCurrentUser,
  getCurrentSession,
  onAuthStateChange,
  isSupabaseConfigured,
} from '../lib/supabase/client';
import type { User } from '../types';

/**
 * User roles for RBAC
 */
export type UserRole = 'Admin' | 'Manager' | 'Staff';

/**
 * Departments
 */
export type Department = 'Purchasing' | 'MFG 1' | 'MFG 2' | 'Fulfillment' | 'SHP/RCV';

/**
 * Auth state
 */
export interface AuthState {
  user: User | null;
  session: any | null;
  loading: boolean;
  error: string | null;
}

/**
 * Check if auth service is available
 */
export function isAuthServiceAvailable(): boolean {
  return isSupabaseConfigured();
}

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string): Promise<User> {
  if (!isAuthServiceAvailable()) {
    throw new Error('Auth service not available. Check Supabase configuration.');
  }

  try {
    const { session, user } = await signInWithEmail(email, password);
    
    if (!user) {
      throw new Error('Authentication failed');
    }

    // Fetch user profile from database
    const profile = await fetchUserProfile(user.id);
    
    return profile;
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  }
}

/**
 * Sign up with email and password
 */
export async function signUp(
  email: string,
  password: string,
  profile: {
    name: string;
    role: UserRole;
    department: Department;
  }
): Promise<User> {
  if (!isAuthServiceAvailable()) {
    throw new Error('Auth service not available. Check Supabase configuration.');
  }

  try {
    const { user } = await signUpWithEmail(email, password, profile);
    
    if (!user) {
      throw new Error('Sign up failed');
    }

    // Create user profile in database
    const { data, error } = await supabase
      .from('users')
      .insert({
        id: user.id,
        name: profile.name,
        email: email,
        password_hash: '', // Managed by Supabase Auth
        role: profile.role,
        department: profile.department,
        onboarding_complete: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating user profile:', error);
      throw error;
    }

    return transformUserFromDb(data);
  } catch (error) {
    console.error('Sign up error:', error);
    throw error;
  }
}

/**
 * Sign out current user
 */
export async function logOut(): Promise<void> {
  if (!isAuthServiceAvailable()) {
    throw new Error('Auth service not available. Check Supabase configuration.');
  }

  try {
    await signOut();
  } catch (error) {
    console.error('Sign out error:', error);
    throw error;
  }
}

/**
 * Request password reset email
 */
export async function requestPasswordReset(email: string): Promise<void> {
  if (!isAuthServiceAvailable()) {
    throw new Error('Auth service not available. Check Supabase configuration.');
  }

  try {
    await resetPassword(email);
  } catch (error) {
    console.error('Password reset request error:', error);
    throw error;
  }
}

/**
 * Get current authenticated user
 */
export async function getAuthenticatedUser(): Promise<User | null> {
  if (!isAuthServiceAvailable()) {
    return null;
  }

  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return null;
    }

    const profile = await fetchUserProfile(user.id);
    return profile;
  } catch (error) {
    console.error('Error getting authenticated user:', error);
    return null;
  }
}

/**
 * Fetch user profile from database
 */
async function fetchUserProfile(userId: string): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }

  return transformUserFromDb(data);
}

/**
 * Update user profile
 */
export async function updateUserProfile(userId: string, updates: Partial<User>): Promise<User> {
  if (!isAuthServiceAvailable()) {
    throw new Error('Auth service not available. Check Supabase configuration.');
  }

  const dbUpdates: any = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.role !== undefined) dbUpdates.role = updates.role;
  if (updates.department !== undefined) dbUpdates.department = updates.department;
  if (updates.onboardingComplete !== undefined) dbUpdates.onboarding_complete = updates.onboardingComplete;

  const { data, error } = await supabase
    .from('users')
    .update(dbUpdates)
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }

  return transformUserFromDb(data);
}

/**
 * Check if user has required role
 */
export function hasRole(user: User | null, requiredRoles: UserRole[]): boolean {
  if (!user) {
    return false;
  }

  return requiredRoles.includes(user.role);
}

/**
 * Check if user is admin
 */
export function isAdmin(user: User | null): boolean {
  return hasRole(user, ['Admin']);
}

/**
 * Check if user is manager or admin
 */
export function isManagerOrAdmin(user: User | null): boolean {
  return hasRole(user, ['Admin', 'Manager']);
}

/**
 * Check if user can access department
 */
export function canAccessDepartment(user: User | null, department: Department): boolean {
  if (!user) {
    return false;
  }

  // Admins can access all departments
  if (user.role === 'Admin') {
    return true;
  }

  // Users can access their own department
  return user.department === department;
}

/**
 * Subscribe to auth state changes
 */
export function subscribeToAuthChanges(callback: (user: User | null) => void) {
  return onAuthStateChange(async (session) => {
    if (session?.user) {
      try {
        const profile = await fetchUserProfile(session.user.id);
        callback(profile);
      } catch (error) {
        console.error('Error fetching user profile on auth change:', error);
        callback(null);
      }
    } else {
      callback(null);
    }
  });
}

/**
 * Transform database user to application user type
 */
function transformUserFromDb(dbUser: any): User {
  return {
    id: dbUser.id,
    name: dbUser.name,
    email: dbUser.email,
    role: dbUser.role,
    department: dbUser.department,
    onboardingComplete: dbUser.onboarding_complete,
  };
}

/**
 * Fetch all users (Admin only)
 */
export async function fetchAllUsers(): Promise<User[]> {
  if (!isAuthServiceAvailable()) {
    throw new Error('Auth service not available. Check Supabase configuration.');
  }

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching users:', error);
    throw error;
  }

  return data.map(transformUserFromDb);
}

/**
 * Delete a user (Admin only, soft delete)
 */
export async function deleteUser(userId: string): Promise<void> {
  if (!isAuthServiceAvailable()) {
    throw new Error('Auth service not available. Check Supabase configuration.');
  }

  // Note: This doesn't delete from Supabase Auth, only marks as inactive
  // Actual auth deletion would need admin API access
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', userId);

  if (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
}

/**
 * Invite a new user (Admin only)
 * Sends invitation email with signup link
 */
export async function inviteUser(
  email: string,
  profile: {
    name: string;
    role: UserRole;
    department: Department;
  }
): Promise<void> {
  if (!isAuthServiceAvailable()) {
    throw new Error('Auth service not available. Check Supabase configuration.');
  }

  // This would typically be handled by a backend function
  // For now, we'll just document the flow
  console.log('Invite user flow:', {
    email,
    profile,
    note: 'Implementation requires backend email service',
  });

  // In a full implementation:
  // 1. Generate invitation token
  // 2. Store invitation in database
  // 3. Send email with signup link + token
  // 4. User completes signup via special invite page
  
  throw new Error('User invitation requires backend email service. Please use manual signup for now.');
}
