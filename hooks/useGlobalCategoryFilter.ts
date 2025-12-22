/**
 * Global Category Filter Hook
 * 
 * Manages globally excluded categories that should NEVER appear in any view.
 * This is separate from per-page category selection filters.
 * 
 * If a category is excluded here, it won't show up in:
 * - Inventory page
 * - Stock Intelligence
 * - Purchase Orders
 * - BOMs
 * - Any other page that uses inventory data
 * 
 * Usage:
 * const { excludedCategories, toggleExcluded, isExcluded } = useGlobalCategoryFilter();
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

// ============================================================================
// DEFAULT EXCLUDED CATEGORIES
// ============================================================================

/**
 * Categories that are excluded by default.
 * Users can modify this list in Settings or the Inventory page.
 */
export const DEFAULT_EXCLUDED_CATEGORIES = [
  'deprecating',
  'deprecated',
  'discontinued',
] as const;

// LocalStorage key for persisting exclusions
const STORAGE_KEY = 'global-excluded-categories';

// ============================================================================
// HOOK
// ============================================================================

export interface UseGlobalCategoryFilterResult {
  /** Set of currently excluded category names (lowercase) */
  excludedCategories: Set<string>;
  
  /** Check if a category is excluded */
  isExcluded: (category: string | null | undefined) => boolean;
  
  /** Toggle a category's excluded status */
  toggleExcluded: (category: string) => void;
  
  /** Add a category to the exclusion list */
  addExcluded: (category: string) => void;
  
  /** Remove a category from the exclusion list */
  removeExcluded: (category: string) => void;
  
  /** Reset to default exclusions */
  resetToDefaults: () => void;
  
  /** Clear all exclusions */
  clearAll: () => void;
}

export function useGlobalCategoryFilter(): UseGlobalCategoryFilterResult {
  const [excludedCategories, setExcludedCategories] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return new Set(parsed.map((c: string) => c.toLowerCase().trim()));
        }
      }
    } catch (err) {
      console.warn('[useGlobalCategoryFilter] Failed to load saved exclusions:', err);
    }
    // Default exclusions
    return new Set(DEFAULT_EXCLUDED_CATEGORIES);
  });

  // Persist to localStorage whenever exclusions change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(excludedCategories)));
    } catch (err) {
      console.warn('[useGlobalCategoryFilter] Failed to save exclusions:', err);
    }
  }, [excludedCategories]);

  const isExcluded = useCallback((category: string | null | undefined): boolean => {
    if (!category) return false;
    return excludedCategories.has(category.toLowerCase().trim());
  }, [excludedCategories]);

  const toggleExcluded = useCallback((category: string) => {
    const normalized = category.toLowerCase().trim();
    setExcludedCategories(prev => {
      const next = new Set(prev);
      if (next.has(normalized)) {
        next.delete(normalized);
      } else {
        next.add(normalized);
      }
      return next;
    });
  }, []);

  const addExcluded = useCallback((category: string) => {
    const normalized = category.toLowerCase().trim();
    setExcludedCategories(prev => {
      if (prev.has(normalized)) return prev;
      const next = new Set(prev);
      next.add(normalized);
      return next;
    });
  }, []);

  const removeExcluded = useCallback((category: string) => {
    const normalized = category.toLowerCase().trim();
    setExcludedCategories(prev => {
      if (!prev.has(normalized)) return prev;
      const next = new Set(prev);
      next.delete(normalized);
      return next;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    setExcludedCategories(new Set(DEFAULT_EXCLUDED_CATEGORIES));
  }, []);

  const clearAll = useCallback(() => {
    setExcludedCategories(new Set());
  }, []);

  return {
    excludedCategories,
    isExcluded,
    toggleExcluded,
    addExcluded,
    removeExcluded,
    resetToDefaults,
    clearAll,
    // Aliases for clearer naming in UI contexts
    isExcludedCategory: isExcluded,
    toggleExcludedCategory: toggleExcluded,
    addExcludedCategory: addExcluded,
    removeExcludedCategory: removeExcluded,
  };
}

// ============================================================================
// STANDALONE UTILITY FUNCTIONS
// ============================================================================

/**
 * Get the current excluded categories from localStorage (for use outside React)
 */
export function getGlobalExcludedCategories(): Set<string> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return new Set(parsed.map((c: string) => c.toLowerCase().trim()));
      }
    }
  } catch (err) {
    // Fall through to defaults
  }
  return new Set(DEFAULT_EXCLUDED_CATEGORIES);
}

/**
 * Check if a category should be filtered out globally (for use outside React)
 */
export function isGloballyExcludedCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  const excluded = getGlobalExcludedCategories();
  return excluded.has(category.toLowerCase().trim());
}

/**
 * Filter a list of categories to only include non-excluded ones.
 * Use this in page-level category dropdowns so excluded categories don't appear as choices.
 */
export function filterVisibleCategories(categories: string[]): string[] {
  const excluded = getGlobalExcludedCategories();
  return categories.filter(cat => cat && !excluded.has(cat.toLowerCase().trim()));
}

/**
 * Get visible categories from an array of items with a category field.
 * Extracts unique categories and filters out globally excluded ones.
 */
export function getVisibleCategoriesFromItems<T extends { category?: string | null }>(
  items: T[]
): string[] {
  const excluded = getGlobalExcludedCategories();
  const uniqueCategories = new Set<string>();
  
  for (const item of items) {
    if (item.category && !excluded.has(item.category.toLowerCase().trim())) {
      uniqueCategories.add(item.category);
    }
  }
  
  return Array.from(uniqueCategories).sort();
}

export default useGlobalCategoryFilter;
