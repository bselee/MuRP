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
  onSavePreset: (preset: Omit<FilterPreset, 'id' | 'createdAt'>) => void;
  onDeletePreset: (id: string) => void;
  onApplyPreset: (preset: FilterPreset) => void;
}

const FilterPresetManager: React.FC<FilterPresetManagerProps> = ({
  isOpen,
  onClose,
  presets,
  currentFilters,
  onSavePreset,
  onDeletePreset,
  onApplyPreset,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDescription, setNewPresetDescription] = useState('');

  const handleCreatePreset = () => {
    if (!newPresetName.trim()) return;

    onSavePreset({
      name: newPresetName.trim(),
      description: newPresetDescription.trim() || undefined,
      filters: {
        categories: Array.from(currentFilters.categories),
        vendors: Array.from(currentFilters.vendors),
        bomFilter: currentFilters.bomFilter,
        riskFilter: currentFilters.riskFilter,
      },
    });

    setNewPresetName('');
    setNewPresetDescription('');
    setIsCreating(false);
  };

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
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-semibold text-indigo-200">Save Current Filters</h4>
            
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Preset Name *
              </label>
              <input
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="e.g., Production Materials"
                className="w-full bg-gray-700 text-white rounded-md p-2 text-sm border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                className="w-full bg-gray-700 text-white rounded-md p-2 text-sm border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div className="bg-gray-800/50 rounded p-3 space-y-1 text-xs text-gray-300">
              <p className="font-medium text-gray-200">Current Filters:</p>
              <p>• Categories: {currentFilters.categories.size > 0 ? Array.from(currentFilters.categories).join(', ') : 'All'}</p>
              <p>• Vendors: {currentFilters.vendors.size > 0 ? Array.from(currentFilters.vendors).join(', ') : 'All'}</p>
              <p>• BOM Filter: {currentFilters.bomFilter}</p>
              <p>• Risk Filter: {currentFilters.riskFilter}</p>
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
                className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <CheckIcon className="w-4 h-4 inline mr-1" />
                Save Preset
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={() => setIsCreating(true)}
            className="w-full bg-indigo-600 text-white rounded-lg p-3 hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
          >
            <PlusIcon className="w-5 h-5" />
            <span className="font-medium">Create New Preset from Current Filters</span>
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
                        <BookmarkIcon className="w-4 h-4 text-indigo-400" />
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
                      <p>📂 {preset.filters.categories.length} categories selected</p>
                    )}
                    {preset.filters.vendors.length > 0 && (
                      <p>🏢 {preset.filters.vendors.length} vendors selected</p>
                    )}
                    {preset.filters.bomFilter !== 'all' && (
                      <p>📋 BOM filter: {preset.filters.bomFilter}</p>
                    )}
                    {preset.filters.riskFilter !== 'all' && (
                      <p>⚠️ Risk filter: {preset.filters.riskFilter}</p>
                    )}
                  </div>

                  <Button
                    onClick={() => handleApply(preset)}
                    className="w-full bg-indigo-600/20 text-indigo-300 rounded py-2 text-sm font-medium hover:bg-indigo-600/30 transition-colors"
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
