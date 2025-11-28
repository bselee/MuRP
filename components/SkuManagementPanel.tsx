import React, { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import type { InventoryItem } from '../types';
import { WhereUsedBomList } from './WhereUsedBomList';
import { PurchaseHistoryTable } from './PurchaseHistoryTable';
import { ConsumptionChart } from './ConsumptionChart';
import { SkuAiAssistant } from './SkuAiAssistant';
import {
  ChartBarIcon,
  CubeIcon,
  ShoppingBagIcon,
  ChatBubbleLeftRightIcon,
  InformationCircleIcon,
} from './icons';

interface SkuManagementPanelProps {
  sku: string;
  inventoryItem?: InventoryItem;
  onClose: () => void;
}

type TabType = 'overview' | 'bom-usage' | 'purchase-history' | 'analytics' | 'ai-assistant';

const SkuManagementPanel: React.FC<SkuManagementPanelProps> = ({
  sku,
  inventoryItem,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(false);

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: InformationCircleIcon },
    { id: 'bom-usage' as TabType, label: 'BOM Usage', icon: CubeIcon },
    { id: 'purchase-history' as TabType, label: 'Purchase History', icon: ShoppingBagIcon },
    { id: 'analytics' as TabType, label: 'Analytics', icon: ChartBarIcon },
    { id: 'ai-assistant' as TabType, label: 'AI Assistant', icon: ChatBubbleLeftRightIcon },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* SKU Information Card */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">SKU Information</h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-gray-400 text-sm">SKU:</span>
                    <p className="text-white font-mono">{sku}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">Name:</span>
                    <p className="text-white">{inventoryItem?.name || 'Unknown'}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">Category:</span>
                    <p className="text-white">{inventoryItem?.category || 'Unknown'}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">Vendor:</span>
                    <p className="text-white">{inventoryItem?.vendorId || 'Unknown'}</p>
                  </div>
                </div>
              </div>

              {/* Stock Information Card */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Stock Information</h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-gray-400 text-sm">Current Stock:</span>
                    <p className="text-white font-semibold">{inventoryItem?.stock || 0}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">On Order:</span>
                    <p className="text-white">{inventoryItem?.onOrder || 0}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">Reorder Point:</span>
                    <p className="text-white">{inventoryItem?.reorderPoint || 0}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">Status:</span>
                    <p className={`text-sm font-medium ${
                      (inventoryItem?.stock || 0) > (inventoryItem?.reorderPoint || 0)
                        ? 'text-green-400'
                        : 'text-red-400'
                    }`}>
                      {(inventoryItem?.stock || 0) > (inventoryItem?.reorderPoint || 0)
                        ? 'In Stock'
                        : 'Low Stock'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Pricing Information Card */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Pricing Information</h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-gray-400 text-sm">Unit Cost:</span>
                    <p className="text-white">${inventoryItem?.unitCost?.toFixed(2) || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">Unit Price:</span>
                    <p className="text-white">${inventoryItem?.unitPrice?.toFixed(2) || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">MOQ:</span>
                    <p className="text-white">{inventoryItem?.moq || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">Lead Time:</span>
                    <p className="text-white">{inventoryItem?.leadTimeDays ? `${inventoryItem.leadTimeDays} days` : 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'bom-usage':
        return <WhereUsedBomList sku={sku} />;

      case 'purchase-history':
        return <PurchaseHistoryTable sku={sku} />;

      case 'analytics':
        return <ConsumptionChart sku={sku} />;

      case 'ai-assistant':
        return <SkuAiAssistant sku={sku} inventoryItem={inventoryItem} />;

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white">SKU Management</h2>
            <p className="text-gray-400">{sku} - {inventoryItem?.name || 'Unknown Product'}</p>
          </div>
          <Button
            onClick={onClose}
            variant="secondary"
            size="sm"
          >
            Close
          </Button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-700">
          <nav className="flex space-x-8 px-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className="ml-3 text-gray-400">Loading...</span>
            </div>
          ) : (
            renderTabContent()
          )}
        </div>
      </div>
    </div>
  );
};

export { SkuManagementPanel };