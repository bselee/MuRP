/**
 * Dark Mode Utility - Context7 Pattern
 * 
 * Client-side script to toggle dark mode with localStorage persistence
 * and OS preference detection
 * 
 * Usage:
 * - Call initializeDarkMode() on app startup
 * - Use setDarkMode('light' | 'dark' | 'auto') to change theme
 * - Theme persists across sessions
 */

export type Theme = 'light' | 'dark' | 'auto';

/**
 * Initialize dark mode on page load
 * Call this early in your app (e.g., in main.tsx or App.tsx)
 * to avoid flash of incorrect theme (FOUC)
 */
export function initializeDarkMode(): void {
  // On page load or when changing themes, best to add inline in `head` to avoid FOUC
  document.documentElement.classList.toggle(
    'dark',
    localStorage.theme === 'dark' ||
      (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches),
  );
}

/**
 * Set the dark mode theme
 * @param theme - 'light', 'dark', or 'auto' to respect OS preference
 */
export function setDarkMode(theme: Theme): void {
  if (theme === 'light') {
    localStorage.theme = 'light';
    document.documentElement.classList.remove('dark');
  } else if (theme === 'dark') {
    localStorage.theme = 'dark';
    document.documentElement.classList.add('dark');
  } else {
    // Auto mode - respect OS preference
    localStorage.removeItem('theme');
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', isDark);
  }
}

/**
 * Get the current theme setting
 * @returns Current theme ('light', 'dark', or 'auto')
 */
export function getCurrentTheme(): Theme {
  if (!('theme' in localStorage)) return 'auto';
  return localStorage.theme === 'dark' ? 'dark' : 'light';
}

/**
 * Toggle between light and dark mode
 * (Does not support auto mode, only explicit light/dark)
 */
export function toggleDarkMode(): void {
  const current = getCurrentTheme();
  setDarkMode(current === 'dark' ? 'light' : 'dark');
}

/**
 * Listen for OS-level dark mode changes
 * Useful when user is in 'auto' mode
 */
export function watchSystemThemeChanges(callback: (isDark: boolean) => void): () => void {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  const handler = (e: MediaQueryListEvent) => {
    if (!('theme' in localStorage)) {
      // Only apply if in auto mode
      document.documentElement.classList.toggle('dark', e.matches);
      callback(e.matches);
    }
  };

  mediaQuery.addEventListener('change', handler);
  
  // Return cleanup function
  return () => mediaQuery.removeEventListener('change', handler);
}
