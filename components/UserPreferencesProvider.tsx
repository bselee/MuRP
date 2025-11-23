import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type RowDensity = 'comfortable' | 'compact' | 'ultra';
export type FontScale = 'small' | 'medium' | 'large';

interface UserPreferencesContextValue {
  rowDensity: RowDensity;
  fontScale: FontScale;
  setRowDensity: (density: RowDensity) => void;
  setFontScale: (scale: FontScale) => void;
}

const STORAGE_KEY = 'murp-user-preferences';

const defaultPreferences: UserPreferencesContextValue = {
  rowDensity: 'compact',
  fontScale: 'medium',
  setRowDensity: () => {},
  setFontScale: () => {},
};

const UserPreferencesContext = createContext<UserPreferencesContextValue | undefined>(undefined);

export const UserPreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rowDensity, setRowDensity] = useState<RowDensity>('compact');
  const [fontScale, setFontScale] = useState<FontScale>('medium');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<UserPreferencesContextValue>;
      if (parsed.rowDensity) setRowDensity(parsed.rowDensity);
      if (parsed.fontScale) setFontScale(parsed.fontScale);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = JSON.stringify({ rowDensity, fontScale });
    window.localStorage.setItem(STORAGE_KEY, payload);
  }, [rowDensity, fontScale]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.rowDensity = rowDensity;
    document.documentElement.dataset.fontScale = fontScale;
  }, [rowDensity, fontScale]);

  const value = useMemo<UserPreferencesContextValue>(
    () => ({
      rowDensity,
      fontScale,
      setRowDensity,
      setFontScale,
    }),
    [rowDensity, fontScale],
  );

  return <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>;
};

export const useUserPreferences = (): UserPreferencesContextValue => {
  const context = useContext(UserPreferencesContext);
  if (!context) {
    throw new Error('useUserPreferences must be used within UserPreferencesProvider');
  }
  return context;
};
