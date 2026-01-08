import Button from '@/components/ui/Button';
/**
 * Filter Preset Manager
 * 
 * Create and manage saved filter combinations for quick access
 */

import React, { useState } from 'react';
import { BookmarkIcon, PlusIcon, TrashIcon, CheckIcon } from './icons';
import Modal from './Modal';

export interface FilterPreset {
  id: string;
  name: string;
  description?: string;
  filters: {
    categories: string[];
    vendors: string[];
    bomFilter: 'all' | 'with-bom' | 'without-bom';
    riskFilter: 'all' | 'needs-order';
  };
  createdAt: string;
}

interface FilterPresetManagerProps {
  isOpen: boolean;
  onClose: () => void;
  presets: FilterPreset[];
  currentFilters: {
    categories: Set<string>;
    vendors: Set<string>;
    bomFilter: 'all' | 'with-bom' | 'without-bom';
    riskFilter: 'all' | 'needs-order';
  };
  availableCategories: string[];
  availableVendors: Array<{ id: string; name: string }>;
  onSavePreset: (preset: Omit<FilterPreset, 'id' | 'createdAt'>) => void;
  onDeletePreset: (id: string) => void;
  onApplyPreset: (preset: FilterPreset) => void;
}

const FilterPresetManager: React.FC<FilterPresetManagerProps> = ({
  isOpen,
  onClose,
  presets,
  currentFilters,
  availableCategories,
  availableVendors,
  onSavePreset,
  onDeletePreset,
  onApplyPreset,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDescription, setNewPresetDescription] = useState('');

  // Internal filter state for creating/editing presets
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedVendors, setSelectedVendors] = useState<Set<string>>(new Set());
  const [bomFilter, setBomFilter] = useState<'all' | 'with-bom' | 'without-bom'>('all');
  const [riskFilter, setRiskFilter] = useState<'all' | 'needs-order'>('all');

  const [categorySearch, setCategorySearch] = useState('');
  const [vendorSearch, setVendorSearch] = useState('');

  // Initialize filters when starting to create
  const startCreating = () => {
    setSelectedCategories(new Set(currentFilters.categories));
    setSelectedVendors(new Set(currentFilters.vendors));
    setBomFilter(currentFilters.bomFilter);
    setRiskFilter(currentFilters.riskFilter);
    setIsCreating(true);
  };

  const handleCreatePreset = () => {
    if (!newPresetName.trim()) return;

    onSavePreset({
      name: newPresetName.trim(),
      description: newPresetDescription.trim() || undefined,
      filters: {
        categories: Array.from(selectedCategories),
        vendors: Array.from(selectedVendors),
        bomFilter,
        riskFilter,
      },
    });

    setNewPresetName('');
    setNewPresetDescription('');
    setCategorySearch('');
    setVendorSearch('');
    setIsCreating(false);
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const toggleVendor = (vendorId: string) => {
    setSelectedVendors(prev => {
      const next = new Set(prev);
      if (next.has(vendorId)) {
        next.delete(vendorId);
      } else {
        next.add(vendorId);
      }
      return next;
    });
  };

  const selectAllCategories = () => setSelectedCategories(new Set(availableCategories));
  const clearAllCategories = () => setSelectedCategories(new Set());
  const selectAllVendors = () => setSelectedVendors(new Set(availableVendors.map(v => v.id)));
  const clearAllVendors = () => setSelectedVendors(new Set());

  // Filtered lists for search
  const filteredCategories = availableCategories.filter(cat =>
    cat.toLowerCase().includes(categorySearch.toLowerCase())
  );
  const filteredVendors = availableVendors.filter(vendor =>
    vendor.name.toLowerCase().includes(vendorSearch.toLowerCase())
  );

  const handleApply = (preset: FilterPreset) => {
    onApplyPreset(preset);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Filter Presets"
      size="lg"
    >
      <div className="space-y-4">
        {/* Create New Preset */}
        {isCreating ? (
          <div className="bg-accent-500/10 border border-accent-500/30 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-semibold text-accent-200">Save Current Filters</h4>
            
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Preset Name *
              </label>
              <input
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="e.g., Production Materials"
                className="w-full bg-gray-700 text-white rounded-md p-2 text-sm border border-gray-600 focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Description (optional)
              </label>
              <input
                type="text"
                value={newPresetDescription}
                onChange={(e) => setNewPresetDescription(e.target.value)}
                placeholder="e.g., Shows only materials needed for production"
                className="w-full bg-gray-700 text-white rounded-md p-2 text-sm border border-gray-600 focus:ring-2 focus:ring-accent-500 focus:border-transparent"
              />
            </div>

            {/* Interactive Filter Controls */}
            <div className="bg-gray-800/50 rounded-lg p-4 space-y-4">
              <h5 className="text-sm font-semibold text-gray-200">Configure Filters</h5>

              {/* Categories Multi-Select */}
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-2">
                  Categories
                  {selectedCategories.size > 0 && (
                    <span className="text-accent-400 ml-1">({selectedCategories.size} selected)</span>
                  )}
                </label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button
                      onClick={selectAllCategories}
                      className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
                    >
                      Select All
                    </Button>
                    <Button
                      onClick={clearAllCategories}
                      className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
                    >
                      Clear
                    </Button>
                  </div>
                  <input
                    type="text"
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    placeholder="Search categories..."
                    className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1.5 border border-gray-600 focus:ring-2 focus:ring-accent-500 focus:outline-none"
                  />
                  <div className="max-h-40 overflow-y-auto bg-gray-700/50 rounded border border-gray-600">
                    {filteredCategories.length === 0 ? (
                      <div className="p-2 text-center text-gray-400 text-xs">No categories found</div>
                    ) : (
                      filteredCategories.map(category => (
                        <label
                          key={category}
                          className="flex items-center p-2 hover:bg-gray-600/50 cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={selectedCategories.has(category)}
                            onChange={() => toggleCategory(category)}
                            className="w-3 h-3 mr-2 rounded border-gray-500 text-accent-500 focus:ring-accent-500"
                          />
                          <span className="text-white">{category}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Vendors Multi-Select */}
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-2">
                  Vendors
                  {selectedVendors.size > 0 && (
                    <span className="text-accent-400 ml-1">({selectedVendors.size} selected)</span>
                  )}
                </label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button
                      onClick={selectAllVendors}
                      className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
                    >
                      Select All
                    </Button>
                    <Button
                      onClick={clearAllVendors}
                      className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
                    >
                      Clear
                    </Button>
                  </div>
                  <input
                    type="text"
                    value={vendorSearch}
                    onChange={(e) => setVendorSearch(e.target.value)}
                    placeholder="Search vendors..."
                    className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1.5 border border-gray-600 focus:ring-2 focus:ring-accent-500 focus:outline-none"
                  />
                  <div className="max-h-40 overflow-y-auto bg-gray-700/50 rounded border border-gray-600">
                    {filteredVendors.length === 0 ? (
                      <div className="p-2 text-center text-gray-400 text-xs">No vendors found</div>
                    ) : (
                      filteredVendors.map(vendor => (
                        <label
                          key={vendor.id}
                          className="flex items-center p-2 hover:bg-gray-600/50 cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={selectedVendors.has(vendor.id)}
                            onChange={() => toggleVendor(vendor.id)}
                            className="w-3 h-3 mr-2 rounded border-gray-500 text-accent-500 focus:ring-accent-500"
                          />
                          <span className="text-white">{vendor.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* BOM Filter Select */}
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-2">BOM Status</label>
                <select
                  value={bomFilter}
                  onChange={(e) => setBomFilter(e.target.value as any)}
                  className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 border border-gray-600 focus:ring-2 focus:ring-accent-500 focus:outline-none"
                >
                  <option value="all">All Items</option>
                  <option value="with-bom">Has Constituents (BOM)</option>
                  <option value="without-bom">No BOM</option>
                </select>
              </div>

              {/* Risk Filter Toggle - Optional */}
              {false && (
                <div>
                  <label className="flex items-center text-xs text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={riskFilter === 'needs-order'}
                      onChange={(e) => setRiskFilter(e.target.checked ? 'needs-order' : 'all')}
                      className="w-3 h-3 mr-2 rounded border-gray-500 text-accent-500 focus:ring-accent-500"
                    />
                    <span>Show only items that need ordering</span>
                  </label>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setIsCreating(false);
                  setNewPresetName('');
                  setNewPresetDescription('');
                }}
                className="px-3 py-1.5 bg-gray-700 text-white rounded text-sm hover:bg-gray-600 transition-colors"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreatePreset}
                disabled={!newPresetName.trim()}
                className="px-3 py-1.5 bg-accent-500 text-white rounded text-sm hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <CheckIcon className="w-4 h-4 inline mr-1" />
                Save Preset
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={startCreating}
            className="w-full bg-accent-500 text-white rounded-lg p-3 hover:bg-accent-600 transition-colors flex items-center justify-center gap-2"
          >
            <PlusIcon className="w-5 h-5" />
            <span className="font-medium">Create New Preset with Custom Filters</span>
          </Button>
        )}

        {/* Saved Presets List */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-300">Saved Presets</h4>
          
          {presets.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <BookmarkIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No saved presets yet</p>
              <p className="text-xs mt-1">Create one to quickly apply common filter combinations</p>
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h5 className="text-sm font-semibold text-white flex items-center gap-2">
                        <BookmarkIcon className="w-4 h-4 text-accent-400" />
                        {preset.name}
                      </h5>
                      {preset.description && (
                        <p className="text-xs text-gray-400 mt-1">{preset.description}</p>
                      )}
                    </div>
                    
                    <Button
                      onClick={() => onDeletePreset(preset.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-300 transition-all"
                      title="Delete preset"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="space-y-1 text-xs text-gray-400 mb-3">
                    {preset.filters.categories.length > 0 && (
                      <p>{preset.filters.categories.length} categories selected</p>
                    )}
                    {preset.filters.vendors.length > 0 && (
                      <p>{preset.filters.vendors.length} vendors selected</p>
                    )}
                    {preset.filters.bomFilter !== 'all' && (
                      <p>BOM filter: {preset.filters.bomFilter}</p>
                    )}
                    {preset.filters.riskFilter !== 'all' && (
                      <p>Risk filter: {preset.filters.riskFilter}</p>
                    )}
                  </div>

                  <Button
                    onClick={() => handleApply(preset)}
                    className="w-full bg-accent-500/20 text-accent-300 rounded py-2 text-sm font-medium hover:bg-accent-500/30 transition-colors"
                  >
                    Apply Preset
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-700">
          <Button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
          >
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default FilterPresetManager;
