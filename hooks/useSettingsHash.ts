import { useState, useEffect, useCallback } from 'react';
import type { SettingsSectionId } from '../components/settings/settingsConfig';

/**
 * Hook to sync Settings section with URL hash fragment
 * Enables bookmarkable/shareable URLs like /settings#billing
 */
export function useSettingsHash(defaultSection: SettingsSectionId): [SettingsSectionId, (section: SettingsSectionId) => void] {
  // Parse initial hash from URL
  const getHashSection = (): SettingsSectionId => {
    if (typeof window === 'undefined') return defaultSection;
    const hash = window.location.hash.slice(1); // Remove #
    return (hash as SettingsSectionId) || defaultSection;
  };

  const [activeSection, setActiveSection] = useState<SettingsSectionId>(getHashSection);

  // Update URL hash when section changes
  const setSection = useCallback((section: SettingsSectionId) => {
    setActiveSection(section);
    if (typeof window !== 'undefined') {
      const newUrl = `${window.location.pathname}${window.location.search}#${section}`;
      window.history.replaceState(null, '', newUrl);
    }
  }, []);

  // Listen for browser back/forward navigation
  useEffect(() => {
    const handleHashChange = () => {
      const section = getHashSection();
      setActiveSection(section);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [defaultSection]);

  return [activeSection, setSection];
}

export default useSettingsHash;
