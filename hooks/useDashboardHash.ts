import { useState, useEffect, useCallback } from 'react';
import type { DashboardTabId } from '../components/dashboard/dashboardConfig';

/**
 * Hook to sync Dashboard tab with URL hash fragment
 * Enables bookmarkable/shareable URLs like /#stock-intelligence
 */
export function useDashboardHash(defaultTab: DashboardTabId): [DashboardTabId, (tab: DashboardTabId) => void] {
  // Parse initial hash from URL
  const getHashTab = (): DashboardTabId => {
    if (typeof window === 'undefined') return defaultTab;
    const hash = window.location.hash.slice(1); // Remove #
    // Only return if it's a valid tab ID
    if (hash === 'overview' || hash === 'stock-intelligence') {
      return hash as DashboardTabId;
    }
    return defaultTab;
  };

  const [activeTab, setActiveTab] = useState<DashboardTabId>(getHashTab);

  // Update URL hash when tab changes
  const setTab = useCallback((tab: DashboardTabId) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      // Only add hash for non-default tabs
      const hash = tab === 'overview' ? '' : `#${tab}`;
      const newUrl = `${window.location.pathname}${window.location.search}${hash}`;
      window.history.replaceState(null, '', newUrl);
    }
  }, []);

  // Listen for browser back/forward navigation
  useEffect(() => {
    const handleHashChange = () => {
      const tab = getHashTab();
      setActiveTab(tab);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [defaultTab]);

  return [activeTab, setTab];
}

export default useDashboardHash;
