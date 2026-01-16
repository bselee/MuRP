/**
 * GlobalDataFilterPanel
 *
 * Settings panel for managing globally excluded categories, vendors, and SKUs.
 * Items marked as excluded will NEVER appear anywhere in the app.
 */

import React, { useState, useMemo } from 'react';
import { useTheme } from '../ThemeProvider';
import { useGlobalCategoryFilter, DEFAULT_EXCLUDED_CATEGORIES } from '../../hooks/useGlobalCategoryFilter';
import {
  EyeSlashIcon,
  EyeIcon,
  PlusIcon,
  ArrowPathIcon,
  CheckIcon,
} from '../icons';
import Button from '../ui/Button';
import SettingsSubNav from './SettingsSubNav';
import {
  SettingsCard,
  SettingsInput,
  SettingsAlert,
  SettingsCheckbox,
} from './ui';

interface GlobalDataFilterPanelProps {
  /** All categories found in the database (from inventory/BOMs) */
  allCategories: string[];
  /** All vendor names */
  allVendors?: string[];
  /** All SKUs */
  allSkus?: string[];
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

// Storage keys for vendors and SKUs
const VENDOR_STORAGE_KEY = 'global-excluded-vendors';
const SKU_STORAGE_KEY = 'global-excluded-skus';

const GlobalDataFilterPanel: React.FC<GlobalDataFilterPanelProps> = ({
  allCategories,
  allVendors = [],
  allSkus = [],
  addToast
}) => {
  const { isDark } = useTheme();
  const {
    excludedCategories,
    addExcludedCategory,
    removeExcludedCategory,
    resetToDefaults,
    clearAll
  } = useGlobalCategoryFilter();

  const [customCategory, setCustomCategory] = useState('');
  const [customVendor, setCustomVendor] = useState('');
  const [customSku, setCustomSku] = useState('');
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  // Vendor exclusions (local state + localStorage)
  const [excludedVendors, setExcludedVendors] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(VENDOR_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return new Set(parsed.map((v: string) => v.toLowerCase().trim()));
        }
      }
    } catch {}
    return new Set();
  });

  // SKU exclusions (local state + localStorage)
  const [excludedSkus, setExcludedSkus] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(SKU_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return new Set(parsed.map((s: string) => s.toUpperCase().trim()));
        }
      }
    } catch {}
    return new Set();
  });

  // Persist vendors to localStorage
  const saveVendors = (vendors: Set<string>) => {
    setExcludedVendors(vendors);
    localStorage.setItem(VENDOR_STORAGE_KEY, JSON.stringify(Array.from(vendors)));
    window.dispatchEvent(new CustomEvent('global-vendor-filter-changed'));
  };

  // Persist SKUs to localStorage
  const saveSkus = (skus: Set<string>) => {
    setExcludedSkus(skus);
    localStorage.setItem(SKU_STORAGE_KEY, JSON.stringify(Array.from(skus)));
    window.dispatchEvent(new CustomEvent('global-sku-filter-changed'));
  };

  // Sort categories alphabetically only (keep position stable)
  const sortedCategories = useMemo(() => {
    const uniqueCategories = [...new Set(allCategories.filter(Boolean))];
    return uniqueCategories.sort((a, b) => a.localeCompare(b));
  }, [allCategories]);

  // Helper: check if string is purely numeric (likely PO number clutter)
  const isNumericOnly = (str: string) => /^\d+$/.test(str.trim());

  // Sort vendors alphabetically, filtering out numeric-only entries (PO number clutter)
  const sortedVendors = useMemo(() => {
    const uniqueVendors = [...new Set(allVendors.filter(Boolean))];
    // Filter out numeric-only items (likely PO numbers polluting vendor data)
    const realVendors = uniqueVendors.filter(v => !isNumericOnly(v));
    return realVendors.sort((a, b) => a.localeCompare(b));
  }, [allVendors]);

  // Sort SKUs alphabetically, filtering out numeric-only entries (PO number clutter)
  const sortedSkus = useMemo(() => {
    const uniqueSkus = [...new Set(allSkus.filter(Boolean))];
    // Filter out numeric-only items (likely PO numbers polluting SKU data)
    // Real SKUs typically start with letters (e.g., ARC01, BAS100)
    const realSkus = uniqueSkus.filter(s => !isNumericOnly(s));
    return realSkus.sort((a, b) => a.localeCompare(b));
  }, [allSkus]);

  // Count of excluded
  const excludedCategoryCount = sortedCategories.filter(
    cat => excludedCategories.has(cat.toLowerCase().trim())
  ).length;

  const excludedVendorCount = sortedVendors.filter(
    v => excludedVendors.has(v.toLowerCase().trim())
  ).length;

  const excludedSkuCount = sortedSkus.filter(
    s => excludedSkus.has(s.toUpperCase().trim())
  ).length;

  const handleToggleCategory = (category: string) => {
    const normalizedCat = category.toLowerCase().trim();
    if (excludedCategories.has(normalizedCat)) {
      removeExcludedCategory(category);
      addToast?.(`"${category}" will now appear in the app`, 'info');
    } else {
      addExcludedCategory(category);
      addToast?.(`"${category}" will be hidden everywhere`, 'success');
    }
  };

  const handleToggleVendor = (vendor: string) => {
    const normalized = vendor.toLowerCase().trim();
    const next = new Set(excludedVendors);
    if (next.has(normalized)) {
      next.delete(normalized);
      addToast?.(`"${vendor}" will now appear in the app`, 'info');
    } else {
      next.add(normalized);
      addToast?.(`"${vendor}" will be hidden everywhere`, 'success');
    }
    saveVendors(next);
  };

  const handleToggleSku = (sku: string) => {
    const normalized = sku.toUpperCase().trim();
    const next = new Set(excludedSkus);
    if (next.has(normalized)) {
      next.delete(normalized);
      addToast?.(`"${sku}" will now appear in the app`, 'info');
    } else {
      next.add(normalized);
      addToast?.(`"${sku}" will be hidden everywhere`, 'success');
    }
    saveSkus(next);
  };

  const handleAddCustomCategory = () => {
    const trimmed = customCategory.trim();
    if (!trimmed) return;
    addExcludedCategory(trimmed);
    setCustomCategory('');
    addToast?.(`Added "${trimmed}" to category exclusions`, 'success');
  };

  const handleAddCustomVendor = () => {
    const trimmed = customVendor.trim();
    if (!trimmed) return;
    const next = new Set(excludedVendors);
    next.add(trimmed.toLowerCase());
    saveVendors(next);
    setCustomVendor('');
    addToast?.(`Added "${trimmed}" to vendor exclusions`, 'success');
  };

  const handleAddCustomSku = () => {
    const trimmed = customSku.trim();
    if (!trimmed) return;
    const next = new Set(excludedSkus);
    next.add(trimmed.toUpperCase());
    saveSkus(next);
    setCustomSku('');
    addToast?.(`Added "${trimmed}" to SKU exclusions`, 'success');
  };

  const handleResetDefaults = () => {
    resetToDefaults();
    addToast?.('Reset to default exclusions (Deprecating, Deprecated, Discontinued)', 'info');
  };

  const handleClearAll = () => {
    clearAll();
    setShowConfirmClear(false);
    addToast?.('All categories are now visible', 'info');
  };

  const isDefaultExclusion = (cat: string) =>
    DEFAULT_EXCLUDED_CATEGORIES.map(c => c.toLowerCase()).includes(cat.toLowerCase().trim());

  // Render an exclusion list
  const renderExclusionList = (
    items: string[],
    excludedSet: Set<string>,
    onToggle: (item: string) => void,
    normalize: (item: string) => string,
    type: 'category' | 'vendor' | 'sku'
  ) => (
    <div className={`max-h-64 overflow-y-auto rounded-lg border ${isDark ? 'border-gray-700 bg-gray-900/30' : 'border-gray-200 bg-gray-50'}`}>
      {items.length === 0 ? (
        <div className={`p-4 text-center ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          No {type}s found. Import data to see {type}s.
        </div>
      ) : (
        items.map((item) => {
          const isExcluded = excludedSet.has(normalize(item));
          const isDefault = type === 'category' && isDefaultExclusion(item);

          return (
            <label
              key={item}
              className={`flex items-center gap-3 p-3 rounded-lg transition-colors cursor-pointer ${
                isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-100'
              }`}
            >
              <SettingsCheckbox
                checked={isExcluded}
                onChange={() => onToggle(item)}
              />
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {isExcluded ? (
                  <EyeSlashIcon className="w-4 h-4 text-red-400 flex-shrink-0" />
                ) : (
                  <EyeIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                )}
                <span className={`truncate ${
                  isExcluded
                    ? (isDark ? 'text-red-300' : 'text-red-600')
                    : (isDark ? 'text-white' : 'text-gray-900')
                }`}>
                  {item}
                </span>
                {isDefault && isExcluded && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    isDark ? 'bg-amber-900/50 text-amber-300' : 'bg-amber-100 text-amber-700'
                  }`}>
                    default
                  </span>
                )}
              </div>
            </label>
          );
        })
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Explanation Alert */}
      <SettingsAlert variant="warning" title="Global Data Exclusions">
        Items marked as excluded will be <strong>completely hidden</strong> throughout the app.
        They won't appear in Inventory, BOMs, Stock Intelligence, or even as filter options.
      </SettingsAlert>

      {/* Three-section layout with sidebar */}
      <SettingsSubNav
        items={[
          { id: 'categories', label: `Categories (${excludedCategoryCount})` },
          { id: 'vendors', label: `Vendors (${excludedVendorCount})` },
          { id: 'skus', label: `SKUs (${excludedSkuCount})` },
        ]}
      >
        <div className="space-y-6">
          {/* Categories Section */}
          <div id="subsection-categories">
            <SettingsCard>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Excluded Categories
                  </h3>
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {excludedCategoryCount} of {sortedCategories.length} categories hidden
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetDefaults}
                    title="Reset to defaults"
                  >
                    <ArrowPathIcon className="w-4 h-4 mr-1" />
                    Defaults
                  </Button>
                  {excludedCategoryCount > 0 && (
                    showConfirmClear ? (
                      <div className="flex items-center gap-1">
                        <Button variant="danger" size="sm" onClick={handleClearAll}>
                          <CheckIcon className="w-4 h-4 mr-1" />
                          Confirm
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setShowConfirmClear(false)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setShowConfirmClear(true)}>
                        <EyeIcon className="w-4 h-4 mr-1" />
                        Show All
                      </Button>
                    )
                  )}
                </div>
              </div>

              <div className="mb-4">
                <div className="flex items-center gap-2">
                  <SettingsInput
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustomCategory()}
                    placeholder="Enter category name..."
                  />
                  <Button variant="secondary" size="sm" onClick={handleAddCustomCategory} disabled={!customCategory.trim()}>
                    <PlusIcon className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {renderExclusionList(
                sortedCategories,
                excludedCategories,
                handleToggleCategory,
                (s) => s.toLowerCase().trim(),
                'category'
              )}
            </SettingsCard>
          </div>

          {/* Vendors Section */}
          <div id="subsection-vendors">
            <SettingsCard>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Excluded Vendors
                  </h3>
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {excludedVendorCount} of {sortedVendors.length} vendors hidden
                  </p>
                </div>
                {excludedVendorCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      saveVendors(new Set());
                      addToast?.('All vendors are now visible', 'info');
                    }}
                  >
                    <EyeIcon className="w-4 h-4 mr-1" />
                    Show All
                  </Button>
                )}
              </div>

              <div className="mb-4">
                <div className="flex items-center gap-2">
                  <SettingsInput
                    value={customVendor}
                    onChange={(e) => setCustomVendor(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustomVendor()}
                    placeholder="Enter vendor name..."
                  />
                  <Button variant="secondary" size="sm" onClick={handleAddCustomVendor} disabled={!customVendor.trim()}>
                    <PlusIcon className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {renderExclusionList(
                sortedVendors,
                excludedVendors,
                handleToggleVendor,
                (s) => s.toLowerCase().trim(),
                'vendor'
              )}
            </SettingsCard>
          </div>

          {/* SKUs Section */}
          <div id="subsection-skus">
            <SettingsCard>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Excluded SKUs
                  </h3>
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {excludedSkuCount} of {sortedSkus.length} SKUs hidden
                  </p>
                </div>
                {excludedSkuCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      saveSkus(new Set());
                      addToast?.('All SKUs are now visible', 'info');
                    }}
                  >
                    <EyeIcon className="w-4 h-4 mr-1" />
                    Show All
                  </Button>
                )}
              </div>

              <div className="mb-4">
                <div className="flex items-center gap-2">
                  <SettingsInput
                    value={customSku}
                    onChange={(e) => setCustomSku(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustomSku()}
                    placeholder="Enter SKU..."
                  />
                  <Button variant="secondary" size="sm" onClick={handleAddCustomSku} disabled={!customSku.trim()}>
                    <PlusIcon className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {renderExclusionList(
                sortedSkus,
                excludedSkus,
                handleToggleSku,
                (s) => s.toUpperCase().trim(),
                'sku'
              )}
            </SettingsCard>
          </div>
        </div>
      </SettingsSubNav>
    </div>
  );
};

export default GlobalDataFilterPanel;
