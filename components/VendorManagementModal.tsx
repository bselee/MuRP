import Button from '@/components/ui/Button';
/**
 * Vendor Management Modal
 * 
 * Allows users to:
 * - Hide/show vendors from dropdown
 * - Exclude vendors from filtering entirely
 * - Reorder vendor display
 */

import React, { useState, useEffect } from 'react';
import { EyeIcon, EyeSlashIcon, XMarkIcon, CheckIcon } from './icons';
import Modal from './Modal';

export interface VendorConfig {
  name: string;
  visible: boolean;  // Show in dropdown
  excluded: boolean; // Never filter by this (always show items)
  order: number;     // Display order in dropdown
}

interface VendorManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendors: string[];
  config: Record<string, VendorConfig>;
  onSave: (config: Record<string, VendorConfig>) => void;
}

const VendorManagementModal: React.FC<VendorManagementModalProps> = ({
  isOpen,
  onClose,
  vendors,
  config,
  onSave,
}) => {
  const [localConfig, setLocalConfig] = useState<Record<string, VendorConfig>>({});
  const getOrCreateConfig = (vendor: string, current: Record<string, VendorConfig>) => {
    return current[vendor] || {
      name: vendor,
      visible: true,
      excluded: false,
      order: 999,
    };
  };

  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, VendorConfig> = {};
      vendors.forEach((vendor, index) => {
        const existing = config[vendor];
        initial[vendor] = existing || {
          name: vendor,
          visible: true,
          excluded: false,
          order: index,
        };
      });
      setLocalConfig(initial);
    }
  }, [isOpen, config]);

  const handleToggleVisible = (vendor: string) => {
    setLocalConfig(prev => {
      const cfg = getOrCreateConfig(vendor, prev);
      return {
        ...prev,
        [vendor]: {
          ...cfg,
          visible: !cfg.visible,
        },
      };
    });
  };

  const handleToggleExcluded = (vendor: string) => {
    setLocalConfig(prev => {
      const cfg = getOrCreateConfig(vendor, prev);
      return {
        ...prev,
        [vendor]: {
          ...cfg,
          excluded: !cfg.excluded,
        },
      };
    });
  };

  const handleSave = () => {
    onSave(localConfig);
    onClose();
  };

  const sortedVendors = [...vendors].sort((a, b) => {
    const orderA = localConfig[a]?.order ?? 999;
    const orderB = localConfig[b]?.order ?? 999;
    return orderA - orderB;
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage Vendors"
      size="md"
    >
      <div className="space-y-4">
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-sm text-blue-200">
          <p className="font-semibold mb-1">Configuration Options:</p>
          <ul className="space-y-1 text-xs">
            <li>• <strong>Visible</strong>: Show vendor in filter dropdown</li>
            <li>• <strong>Excluded</strong>: Always show items from this vendor (ignore filters)</li>
          </ul>
        </div>

        <div className="max-h-[400px] overflow-y-auto space-y-2">
          {sortedVendors.map((vendor) => {
            const cfg = localConfig[vendor] || { visible: true, excluded: false, order: 999 };
            return (
              <div
                key={vendor}
                className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 hover:border-gray-600 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{vendor}</p>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={() => handleToggleVisible(vendor)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                        cfg.visible
                          ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      {cfg.visible ? (
                        <>
                          <EyeIcon className="w-3.5 h-3.5" />
                          Visible
                        </>
                      ) : (
                        <>
                          <EyeSlashIcon className="w-3.5 h-3.5" />
                          Hidden
                        </>
                      )}
                    </Button>

                    <Button
                      onClick={() => handleToggleExcluded(vendor)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                        cfg.excluded
                          ? 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      {cfg.excluded ? (
                        <>
                          <XMarkIcon className="w-3.5 h-3.5" />
                          Excluded
                        </>
                      ) : (
                        <>
                          <CheckIcon className="w-3.5 h-3.5" />
                          Filtered
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
          <Button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="px-4 py-2 bg-accent-500 text-white rounded-md hover:bg-accent-600 transition-colors"
          >
            Save Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default VendorManagementModal;
