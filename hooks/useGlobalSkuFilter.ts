/**
 * Global SKU Filter Hook
 *
 * Manages globally excluded SKUs that should NEVER appear in any view.
 * This is separate from per-page SKU selection filters.
 *
 * If a SKU is excluded here, it won't show up in:
 * - Inventory page
 * - Stock Intelligence
 * - Purchase Orders
 * - BOMs
 * - Any other page that uses inventory data
 *
 * Usage:
 * const { excludedSkus, isExcluded } = useGlobalSkuFilter();
 */

import { useState, useEffect, useCallback } from 'react';

// LocalStorage key for persisting exclusions
const STORAGE_KEY = 'global-excluded-skus';

// ============================================================================
// HOOK
// ============================================================================

export interface UseGlobalSkuFilterResult {
  /** Set of currently excluded SKUs (uppercase) */
  excludedSkus: Set<string>;

  /** Check if a SKU is excluded */
  isExcluded: (sku: string | null | undefined) => boolean;

  /** Toggle a SKU's excluded status */
  toggleExcluded: (sku: string) => void;

  /** Add a SKU to the exclusion list */
  addExcluded: (sku: string) => void;

  /** Remove a SKU from the exclusion list */
  removeExcluded: (sku: string) => void;

  /** Clear all exclusions */
  clearAll: () => void;
}

export function useGlobalSkuFilter(): UseGlobalSkuFilterResult {
  const [excludedSkus, setExcludedSkus] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return new Set(parsed.map((s: string) => s.toUpperCase().trim()));
        }
      }
    } catch (err) {
      console.warn('[useGlobalSkuFilter] Failed to load saved exclusions:', err);
    }
    return new Set();
  });

  // Listen for changes from GlobalDataFilterPanel
  useEffect(() => {
    const handleFilterChange = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setExcludedSkus(new Set(parsed.map((s: string) => s.toUpperCase().trim())));
          }
        }
      } catch {}
    };

    window.addEventListener('global-sku-filter-changed', handleFilterChange);
    return () => window.removeEventListener('global-sku-filter-changed', handleFilterChange);
  }, []);

  // Persist to localStorage whenever exclusions change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(excludedSkus)));
      window.dispatchEvent(new CustomEvent('global-sku-filter-changed', {
        detail: { excludedSkus: Array.from(excludedSkus) }
      }));
    } catch (err) {
      console.warn('[useGlobalSkuFilter] Failed to save exclusions:', err);
    }
  }, [excludedSkus]);

  const isExcluded = useCallback((sku: string | null | undefined): boolean => {
    if (!sku) return false;
    return excludedSkus.has(sku.toUpperCase().trim());
  }, [excludedSkus]);

  const toggleExcluded = useCallback((sku: string) => {
    const normalized = sku.toUpperCase().trim();
    setExcludedSkus(prev => {
      const next = new Set(prev);
      if (next.has(normalized)) {
        next.delete(normalized);
      } else {
        next.add(normalized);
      }
      return next;
    });
  }, []);

  const addExcluded = useCallback((sku: string) => {
    const normalized = sku.toUpperCase().trim();
    setExcludedSkus(prev => {
      if (prev.has(normalized)) return prev;
      const next = new Set(prev);
      next.add(normalized);
      return next;
    });
  }, []);

  const removeExcluded = useCallback((sku: string) => {
    const normalized = sku.toUpperCase().trim();
    setExcludedSkus(prev => {
      if (!prev.has(normalized)) return prev;
      const next = new Set(prev);
      next.delete(normalized);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setExcludedSkus(new Set());
  }, []);

  return {
    excludedSkus,
    isExcluded,
    toggleExcluded,
    addExcluded,
    removeExcluded,
    clearAll,
  };
}

// ============================================================================
// STANDALONE UTILITY FUNCTIONS
// ============================================================================

/**
 * Get the current excluded SKUs from localStorage (for use outside React)
 */
export function getGlobalExcludedSkus(): Set<string> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return new Set(parsed.map((s: string) => s.toUpperCase().trim()));
      }
    }
  } catch {
    // Fall through to empty set
  }
  return new Set();
}

/**
 * Check if a SKU should be filtered out globally (for use outside React)
 */
export function isGloballyExcludedSku(sku: string | null | undefined): boolean {
  if (!sku) return false;
  const excluded = getGlobalExcludedSkus();
  return excluded.has(sku.toUpperCase().trim());
}

/**
 * Filter a list of items to exclude globally excluded SKUs.
 */
export function filterByGlobalSkuExclusions<T extends { sku?: string | null }>(
  items: T[]
): T[] {
  const excluded = getGlobalExcludedSkus();
  if (excluded.size === 0) return items;
  return items.filter(item => !item.sku || !excluded.has(item.sku.toUpperCase().trim()));
}

export default useGlobalSkuFilter;
