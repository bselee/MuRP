import { useState, useCallback, useEffect } from 'react';
import type { Page } from '../App';

/**
 * Modules that can be toggled on/off in the sidebar
 * These are future SaaS modules that can be enabled/disabled by admins
 */
export type ToggleableModule =
  | 'Projects'
  | 'Agent Command Center'
  | 'Artwork'
  | 'Compliance'
  | 'Production';

export const TOGGLEABLE_MODULES: ToggleableModule[] = [
  'Projects',
  'Production',
  'Artwork',
  'Compliance',
  'Agent Command Center',
];

export interface ModuleConfig {
  id: ToggleableModule;
  label: string;
  description: string;
  enabled: boolean;
}

const MODULE_METADATA: Record<ToggleableModule, { label: string; description: string }> = {
  'Projects': {
    label: 'Projects',
    description: 'Project management and tracking for manufacturing workflows',
  },
  'Production': {
    label: 'Production',
    description: 'Production planning, build orders, and manufacturing schedules',
  },
  'Artwork': {
    label: 'Artwork',
    description: 'Digital asset management for labels, packaging, and marketing materials',
  },
  'Compliance': {
    label: 'Compliance',
    description: 'Regulatory compliance tracking, state requirements, and documentation',
  },
  'Agent Command Center': {
    label: 'Agent Command Center',
    description: 'AI agent management, automation workflows, and autonomous operations',
  },
};

const STORAGE_KEY = 'murp-module-visibility';

// Default all modules to enabled
const getDefaultVisibility = (): Record<ToggleableModule, boolean> => {
  return TOGGLEABLE_MODULES.reduce((acc, mod) => {
    acc[mod] = true;
    return acc;
  }, {} as Record<ToggleableModule, boolean>);
};

/**
 * Hook to manage module visibility settings
 * Persists to localStorage and provides toggle functionality
 */
export function useModuleVisibility() {
  const [visibility, setVisibility] = useState<Record<ToggleableModule, boolean>>(() => {
    if (typeof window === 'undefined') return getDefaultVisibility();

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge with defaults to handle new modules
        return { ...getDefaultVisibility(), ...parsed };
      }
    } catch (e) {
      console.warn('[useModuleVisibility] Failed to parse stored visibility:', e);
    }
    return getDefaultVisibility();
  });

  // Persist to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility));
    } catch (e) {
      console.warn('[useModuleVisibility] Failed to save visibility:', e);
    }
  }, [visibility]);

  const isModuleEnabled = useCallback((module: ToggleableModule): boolean => {
    return visibility[module] ?? true;
  }, [visibility]);

  const toggleModule = useCallback((module: ToggleableModule) => {
    setVisibility(prev => ({
      ...prev,
      [module]: !prev[module],
    }));
  }, []);

  const setModuleEnabled = useCallback((module: ToggleableModule, enabled: boolean) => {
    setVisibility(prev => ({
      ...prev,
      [module]: enabled,
    }));
  }, []);

  const getModuleConfigs = useCallback((): ModuleConfig[] => {
    return TOGGLEABLE_MODULES.map(mod => ({
      id: mod,
      label: MODULE_METADATA[mod].label,
      description: MODULE_METADATA[mod].description,
      enabled: visibility[mod] ?? true,
    }));
  }, [visibility]);

  // Check if a Page should be visible in sidebar
  const isPageVisibleInSidebar = useCallback((page: Page): boolean => {
    if (TOGGLEABLE_MODULES.includes(page as ToggleableModule)) {
      return isModuleEnabled(page as ToggleableModule);
    }
    return true; // Non-toggleable pages are always visible
  }, [isModuleEnabled]);

  return {
    visibility,
    isModuleEnabled,
    toggleModule,
    setModuleEnabled,
    getModuleConfigs,
    isPageVisibleInSidebar,
  };
}

export default useModuleVisibility;
