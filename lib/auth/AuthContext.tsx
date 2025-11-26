import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import type { User } from '../../types';
import { supabase } from '../supabase/client';
import { isDevelopment, shouldEnableGodModeFromUrl, loadGodModeFlag, persistGodModeFlag, isE2ETesting } from './guards';
import { mockUsers } from '../../types';

type AuthContextValue = {
  session: Session | null;
  authUser: SupabaseUser | null;
  user: User | null;
  loading: boolean;
  godMode: boolean;
  signIn: (args: { email: string; password: string }) => Promise<{ error?: string }>;
  signUp: (args: { email: string; password: string; name?: string; role?: User['role']; department?: User['department'] }) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  refreshProfile: () => Promise<void>;
  setGodMode: (enabled: boolean) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const DEV_DEFAULT_USER: User = mockUsers[0] ?? {
  id: 'dev-admin',
  name: 'Dev Admin',
  email: 'dev.admin@example.com',
  role: 'Admin',
  department: 'Purchasing',
  onboardingComplete: true,
};

const transformProfile = (row: any): User => ({
  id: row.id,
  name: row.full_name ?? row.email,
  email: row.email,
  role: row.role,
  department: row.department,
  onboardingComplete: row.onboarding_complete,
  agreements: row.agreements ?? {},
  regulatoryAgreement: row.agreements?.regulatory,
  metadata: row.metadata ?? null,
  guidedLaunchState: row.metadata?.guided_launch ?? null,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [authUser, setAuthUser] = useState<SupabaseUser | null>(null);
  const [user, setUser] = useState<User | null>(() =>
    isE2ETesting() ? { ...DEV_DEFAULT_USER, name: `${DEV_DEFAULT_USER.name} (E2E)` } : null
  );
  const [loading, setLoading] = useState(() => !isE2ETesting());
  const [godMode, setGodMode] = useState(() => shouldEnableGodModeFromUrl() || loadGodModeFlag());
  const [isE2EMode] = useState(() => isE2ETesting());

  const applyGodMode = useCallback((enabled: boolean) => {
    if (!isDevelopment()) return;
    setGodMode(enabled);
    persistGodModeFlag(enabled);
    if (enabled && !user) {
      setUser({ ...DEV_DEFAULT_USER, name: `${DEV_DEFAULT_USER.name} (Dev)` });
    }
  }, [user]);

  useEffect(() => {
    if (!isDevelopment()) return;

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'g' && event.ctrlKey && event.shiftKey) {
        event.preventDefault();
        applyGodMode(!godMode);
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [applyGodMode, godMode]);

  const fetchProfile = useCallback(async (userId?: string | null) => {
    if (!userId) {
      setUser(null);
      return;
    }

    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (data) {
      setUser(transformProfile(data));
    } else {
      // Profile doesn't exist, create it via server function
      const { data: profile } = await supabase.rpc('ensure_user_profile');
      setUser(profile ? transformProfile(profile) : null);
    }
  }, []);

  useEffect(() => {
    if (isE2EMode) {
      setSession(null);
      setAuthUser(null);
      setUser(prev => prev ?? { ...DEV_DEFAULT_USER, name: `${DEV_DEFAULT_USER.name} (E2E)` });
      setLoading(false);
      return;
    }

    let mounted = true;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthUser(nextSession?.user ?? null);
      if (nextSession?.user?.id) {
        fetchProfile(nextSession.user.id);
      } else {
        setUser(null);
      }
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        setLoading(false);
        return;
      }
      setSession(data.session);
      setAuthUser(data.session?.user ?? null);
      if (data.session?.user?.id) {
        fetchProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [fetchProfile, isE2EMode]);

  useEffect(() => {
    if (session?.user?.id) return;
    if (godMode || isE2EMode) {
      setUser(prev => prev ?? {
        ...DEV_DEFAULT_USER,
        name: godMode
          ? `${DEV_DEFAULT_USER.name} (God Mode)`
          : isE2EMode
            ? `${DEV_DEFAULT_USER.name} (E2E)`
            : DEV_DEFAULT_USER.name,
      });
      if (isE2EMode) {
        setLoading(false);
      }
    }
  }, [session, godMode, isE2EMode]);

  const signIn = useCallback(async ({ email, password }: { email: string; password: string }) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  }, []);

  const signUp = useCallback(async ({ email, password, name, role, department }: { email: string; password: string; name?: string; role?: User['role']; department?: User['department'] }) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name ?? email,
          role: role ?? 'Staff',
          department: department ?? 'Purchasing',
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) return { error: error.message };
    return {};
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    if (godMode) {
      setUser({ ...DEV_DEFAULT_USER, name: `${DEV_DEFAULT_USER.name} (God Mode)` });
    } else {
      setUser(null);
    }
  }, [godMode]);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      return { error: error.message };
    }
    return {};
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) {
      await fetchProfile(session.user.id);
    }
  }, [fetchProfile, session?.user?.id]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    authUser,
    user,
    loading,
    godMode,
    signIn,
    signUp,
    signOut,
    resetPassword,
    refreshProfile,
    setGodMode: applyGodMode,
  }), [session, authUser, user, loading, godMode, signIn, signUp, signOut, resetPassword, refreshProfile, applyGodMode]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
