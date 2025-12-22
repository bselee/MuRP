/**
 * GlobalDataFilterPanel
 * 
 * Settings panel for managing globally excluded categories.
 * Items in excluded categories will NEVER appear anywhere in the app:
 * - Not in Inventory
 * - Not in BOMs  
 * - Not in Stock Intelligence
 * - Not in page-level category filters (they won't even be choices)
 * 
 * This is the "I never want to see these" setting.
 */

import React, { useState, useMemo } from 'react';
import { useTheme } from '../ThemeProvider';
import { useGlobalCategoryFilter, DEFAULT_EXCLUDED_CATEGORIES } from '../../hooks/useGlobalCategoryFilter';
import { 
  EyeSlashIcon, 
  EyeIcon, 
  XMarkIcon, 
  PlusIcon,
  ArrowPathIcon,
  CheckIcon,
  ExclamationTriangleIcon
} from '../icons';
import Button from '../ui/Button';

interface GlobalDataFilterPanelProps {
  /** All categories found in the database (from inventory/BOMs) */
  allCategories: string[];
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const GlobalDataFilterPanel: React.FC<GlobalDataFilterPanelProps> = ({
  allCategories,
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
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  // Sort categories: excluded first, then alphabetically
  const sortedCategories = useMemo(() => {
    const uniqueCategories = [...new Set(allCategories.filter(Boolean))];
    return uniqueCategories.sort((a, b) => {
      const aExcluded = excludedCategories.has(a.toLowerCase().trim());
      const bExcluded = excludedCategories.has(b.toLowerCase().trim());
      if (aExcluded && !bExcluded) return -1;
      if (!aExcluded && bExcluded) return 1;
      return a.localeCompare(b);
    });
  }, [allCategories, excludedCategories]);

  // Count of excluded
  const excludedCount = sortedCategories.filter(
    cat => excludedCategories.has(cat.toLowerCase().trim())
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

  const handleAddCustom = () => {
    const trimmed = customCategory.trim();
    if (!trimmed) return;
    
    addExcludedCategory(trimmed);
    setCustomCategory('');
    addToast?.(`Added "${trimmed}" to global exclusions`, 'success');
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

  // Styles
  const cardClass = isDark 
    ? "bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"
    : "bg-white rounded-xl p-6 border border-gray-200 shadow-sm";
  
  const labelClass = isDark 
    ? "text-xs font-semibold text-gray-400 uppercase tracking-wide"
    : "text-xs font-semibold text-gray-500 uppercase tracking-wide";

  const inputClass = isDark 
    ? "flex-1 bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-accent-400 focus:ring-1 focus:ring-accent-400 transition-colors"
    : "flex-1 bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:border-accent-400 focus:ring-1 focus:ring-accent-400 transition-colors";

  const checkboxContainerClass = isDark
    ? "flex items-center gap-3 p-3 rounded-lg hover:bg-gray-700/50 transition-colors cursor-pointer group"
    : "flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer group";

  const isDefaultExclusion = (cat: string) => 
    DEFAULT_EXCLUDED_CATEGORIES.map(c => c.toLowerCase()).includes(cat.toLowerCase().trim());

  return (
    <div className="space-y-6">
      {/* Explanation Card */}
      <div className={`${cardClass} border-l-4 border-l-amber-500`}>
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className={`font-semibold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Global Category Exclusions
            </h4>
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Categories marked as excluded will be <strong>completely hidden</strong> throughout the app. 
              They won't appear in Inventory, BOMs, Stock Intelligence, or even as filter options on those pages.
              Use this for categories like "Deprecating" that you never want to see.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Excluded Categories
            </h3>
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {excludedCount} of {sortedCategories.length} categories hidden
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetDefaults}
              title="Reset to defaults (Deprecating, Deprecated, Discontinued)"
            >
              <ArrowPathIcon className="w-4 h-4 mr-1" />
              Defaults
            </Button>
            {excludedCount > 0 && (
              showConfirmClear ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleClearAll}
                  >
                    <CheckIcon className="w-4 h-4 mr-1" />
                    Confirm
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowConfirmClear(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowConfirmClear(true)}
                >
                  <EyeIcon className="w-4 h-4 mr-1" />
                  Show All
                </Button>
              )
            )}
          </div>
        </div>

        {/* Add Custom Category */}
        <div className="mb-4">
          <label className={labelClass}>Add Custom Exclusion</label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="text"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
              placeholder="Enter category name..."
              className={inputClass}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAddCustom}
              disabled={!customCategory.trim()}
            >
              <PlusIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Category List */}
        <div className={`max-h-80 overflow-y-auto rounded-lg border ${isDark ? 'border-gray-700 bg-gray-900/30' : 'border-gray-200 bg-gray-50'}`}>
          {sortedCategories.length === 0 ? (
            <div className={`p-4 text-center ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              No categories found. Import inventory data to see categories.
            </div>
          ) : (
            sortedCategories.map((category) => {
              const isExcluded = excludedCategories.has(category.toLowerCase().trim());
              const isDefault = isDefaultExclusion(category);
              
              return (
                <label
                  key={category}
                  className={checkboxContainerClass}
                >
                  <input
                    type="checkbox"
                    checked={isExcluded}
                    onChange={() => handleToggleCategory(category)}
                    className="w-4 h-4 rounded border-gray-500 text-red-500 focus:ring-red-500 focus:ring-offset-0"
                  />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {isExcluded ? (
                      <EyeSlashIcon className="w-4 h-4 text-red-400 flex-shrink-0" />
                    ) : (
                      <EyeIcon className="w-4 h-4 text-green-400 flex-shrink-0" />
                    )}
                    <span className={`truncate ${
                      isExcluded 
                        ? (isDark ? 'text-red-300 line-through' : 'text-red-600 line-through')
                        : (isDark ? 'text-white' : 'text-gray-900')
                    }`}>
                      {category}
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

        {/* Currently Excluded Summary */}
        {excludedCount > 0 && (
          <div className={`mt-4 p-3 rounded-lg ${isDark ? 'bg-red-900/20 border border-red-800' : 'bg-red-50 border border-red-200'}`}>
            <p className={`text-sm font-medium ${isDark ? 'text-red-300' : 'text-red-700'}`}>
              Currently Hidden:
            </p>
            <div className="flex flex-wrap gap-1 mt-1">
              {sortedCategories
                .filter(cat => excludedCategories.has(cat.toLowerCase().trim()))
                .map(cat => (
                  <button
                    key={cat}
                    onClick={() => handleToggleCategory(cat)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                      isDark 
                        ? 'bg-red-900/50 text-red-200 hover:bg-red-800/50' 
                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                    } transition-colors`}
                    title={`Click to show "${cat}"`}
                  >
                    {cat}
                    <XMarkIcon className="w-3 h-3" />
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GlobalDataFilterPanel;
