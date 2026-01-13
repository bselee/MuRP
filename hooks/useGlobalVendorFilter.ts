/**
 * Global Vendor Filter Hook
 *
 * Manages globally excluded vendors that should NEVER appear in any view.
 * This is separate from per-page vendor selection filters.
 *
 * If a vendor is excluded here, it won't show up in:
 * - Vendors page
 * - Inventory page (items from that vendor)
 * - Purchase Orders
 * - Any other page that uses vendor data
 *
 * Usage:
 * const { excludedVendors, isExcluded } = useGlobalVendorFilter();
 */

import { useState, useEffect, useCallback } from 'react';

// LocalStorage key for persisting exclusions (matches GlobalDataFilterPanel)
const STORAGE_KEY = 'global-excluded-vendors';

// ============================================================================
// HOOK
// ============================================================================

export interface UseGlobalVendorFilterResult {
  /** Set of currently excluded vendor names (lowercase) */
  excludedVendors: Set<string>;

  /** Check if a vendor is excluded (by name or ID) */
  isExcluded: (vendorNameOrId: string | null | undefined) => boolean;

  /** Toggle a vendor's excluded status */
  toggleExcluded: (vendorName: string) => void;

  /** Add a vendor to the exclusion list */
  addExcluded: (vendorName: string) => void;

  /** Remove a vendor from the exclusion list */
  removeExcluded: (vendorName: string) => void;

  /** Clear all exclusions */
  clearAll: () => void;
}

export function useGlobalVendorFilter(): UseGlobalVendorFilterResult {
  const [excludedVendors, setExcludedVendors] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return new Set(parsed.map((v: string) => v.toLowerCase().trim()));
        }
      }
    } catch (err) {
      console.warn('[useGlobalVendorFilter] Failed to load saved exclusions:', err);
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
            setExcludedVendors(new Set(parsed.map((v: string) => v.toLowerCase().trim())));
          }
        } else {
          setExcludedVendors(new Set());
        }
      } catch {}
    };

    window.addEventListener('global-vendor-filter-changed', handleFilterChange);
    return () => window.removeEventListener('global-vendor-filter-changed', handleFilterChange);
  }, []);

  // Persist to localStorage whenever exclusions change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(excludedVendors)));
      window.dispatchEvent(new CustomEvent('global-vendor-filter-changed', {
        detail: { excludedVendors: Array.from(excludedVendors) }
      }));
    } catch (err) {
      console.warn('[useGlobalVendorFilter] Failed to save exclusions:', err);
    }
  }, [excludedVendors]);

  const isExcluded = useCallback((vendorNameOrId: string | null | undefined): boolean => {
    if (!vendorNameOrId) return false;
    return excludedVendors.has(vendorNameOrId.toLowerCase().trim());
  }, [excludedVendors]);

  const toggleExcluded = useCallback((vendorName: string) => {
    const normalized = vendorName.toLowerCase().trim();
    setExcludedVendors(prev => {
      const next = new Set(prev);
      if (next.has(normalized)) {
        next.delete(normalized);
      } else {
        next.add(normalized);
      }
      return next;
    });
  }, []);

  const addExcluded = useCallback((vendorName: string) => {
    const normalized = vendorName.toLowerCase().trim();
    setExcludedVendors(prev => {
      if (prev.has(normalized)) return prev;
      const next = new Set(prev);
      next.add(normalized);
      return next;
    });
  }, []);

  const removeExcluded = useCallback((vendorName: string) => {
    const normalized = vendorName.toLowerCase().trim();
    setExcludedVendors(prev => {
      if (!prev.has(normalized)) return prev;
      const next = new Set(prev);
      next.delete(normalized);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setExcludedVendors(new Set());
  }, []);

  return {
    excludedVendors,
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
 * Get the current excluded vendors from localStorage (for use outside React)
 */
export function getGlobalExcludedVendors(): Set<string> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return new Set(parsed.map((v: string) => v.toLowerCase().trim()));
      }
    }
  } catch {
    // Fall through to empty set
  }
  return new Set();
}

/**
 * Check if a vendor should be filtered out globally (for use outside React)
 */
export function isGloballyExcludedVendor(vendorName: string | null | undefined): boolean {
  if (!vendorName) return false;
  const excluded = getGlobalExcludedVendors();
  return excluded.has(vendorName.toLowerCase().trim());
}

/**
 * Filter a list of vendors to exclude globally excluded ones.
 */
export function filterByGlobalVendorExclusions<T extends { name?: string | null }>(
  vendors: T[]
): T[] {
  const excluded = getGlobalExcludedVendors();
  if (excluded.size === 0) return vendors;
  return vendors.filter(vendor => !vendor.name || !excluded.has(vendor.name.toLowerCase().trim()));
}

export default useGlobalVendorFilter;
