import React, { useState, useMemo } from 'react';
import type { InventoryItem, BillOfMaterials, PurchaseOrder, Vendor } from '../types';
import { PackageIcon, BeakerIcon, DocumentTextIcon, ChartBarIcon, BotIcon, ChevronDoubleLeftIcon, ChevronDownIcon, ChevronUpIcon } from '../components/icons';
import Button from '../components/ui/Button';

interface ProductPageProps {
  inventory: InventoryItem[];
  boms: BillOfMaterials[];
  purchaseOrders: PurchaseOrder[];
  vendors: Vendor[];
  currentUser: any;
  onNavigateToBom: (bomSku: string) => void;
  onNavigateToInventory: (sku: string) => void;
  onCreateRequisition: (items: any[], options?: any) => void;
  onCreateBuildOrder: (sku: string, name: string, quantity: number) => void;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onQuickRequest: () => void;
}

const ProductPage: React.FC<ProductPageProps> = ({
  inventory,
  boms,
  purchaseOrders,
  vendors,
  currentUser,
  onNavigateToBom,
  onNavigateToInventory,
  onCreateRequisition,
  onCreateBuildOrder,
  addToast,
  onQuickRequest,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'bom' | 'purchases' | 'analytics' | 'ai'>('overview');
  const [overviewExpanded, setOverviewExpanded] = useState(false);

  // Get the selected product SKU from localStorage
  const selectedSku = localStorage.getItem('selectedProductSku');
  const product = inventory.find(item => item.sku === selectedSku);

  const relatedBOMs = useMemo(() => {
    if (!product) return [];
    return boms.filter(bom =>
      bom.finishedSku === product.sku ||
      bom.components.some(comp => comp.sku === product.sku)
    );
  }, [product, boms]);

  const isFinishedGood = relatedBOMs.some(bom => bom.finishedSku === product?.sku);

  const purchaseHistory = useMemo(() => {
    if (!product) return [];
    return purchaseOrders.filter(po =>
      po.items.some(item => item.sku === product.sku)
    );
  }, [product, purchaseOrders]);

  // Determine user access level based on department
  const getUserAccessLevel = () => {
    if (!currentUser) return 'basic';
    if (currentUser.role === 'Admin') return 'full';
    if (currentUser.department === 'Purchasing') return 'full';
    if (currentUser.role === 'Manager') return 'detailed';
    return 'basic';
  };

  const userAccessLevel = getUserAccessLevel();

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center shadow-sm">
            <PackageIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Product Not Found</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">The selected product could not be found in inventory.</p>
            <Button
              onClick={() => window.history.back()}
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-full font-medium"
            >
              <ChevronDoubleLeftIcon className="w-4 h-4 mr-2" />
              Back to Inventory
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: PackageIcon },
    { id: 'bom' as const, label: 'BOM Usage', icon: BeakerIcon },
    { id: 'purchases' as const, label: 'Purchase History', icon: DocumentTextIcon },
    { id: 'analytics' as const, label: 'Analytics', icon: ChartBarIcon },
    { id: 'ai' as const, label: 'AI Assistant', icon: BotIcon },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header - Inventory Context */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <Button
              onClick={() => {
                // Navigate back to inventory
                if (window.history.length > 1) {
                  window.history.back();
                } else {
                  onNavigateToInventory?.(product.sku);
                }
              }}
              className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 px-4 py-2 rounded-full transition-colors"
            >
              <ChevronDoubleLeftIcon className="w-4 h-4" />
              Back to Inventory
            </Button>
          </div>

          {/* Product Header Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                    <PackageIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{product.name}</h1>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-mono text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-lg">
                        {product.sku}
                      </span>
                      {isFinishedGood && (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700">
                          Finished Good
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-gray-600 dark:text-gray-400">Category: {product.category}</p>
              </div>

              <div className="text-right">
                <div className="text-3xl font-bold text-gray-900 dark:text-white">
                  ${product.unitCost?.toFixed(2) || 'N/A'}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Unit Cost</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="mb-8">
          <nav className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    isActive
                      ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Quick Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    Stock Status
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 dark:text-gray-400">Current:</span>
                      <span className={`font-semibold ${product.stock <= product.reorderPoint ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        {product.stock.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 dark:text-gray-400">On Order:</span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">{product.onOrder.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 dark:text-gray-400">Reorder Point:</span>
                      <span className="font-semibold text-gray-900 dark:text-white">{product.reorderPoint.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    Supplier
                  </h4>
                  <div className="space-y-3">
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">
                      {vendors.find(v => v.id === product.vendorId)?.name || 'N/A'}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Lead Time: {vendors.find(v => v.id === product.vendorId)?.leadTimeDays || 'N/A'} days
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    Pricing
                  </h4>
                  <div className="space-y-3">
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">
                      ${product.unitCost?.toFixed(2) || 'N/A'}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Unit Cost
                    </div>
                    {product.unitPrice && (
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Sale Price: ${product.unitPrice.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* BOM Status Card */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${relatedBOMs.length > 0 ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {relatedBOMs.length > 0 ? 'Bill of Materials' : 'No Bill of Materials'}
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {relatedBOMs.length > 0
                          ? `${relatedBOMs.length} BOM${relatedBOMs.length > 1 ? 's' : ''} found for this product`
                          : 'This product does not have a bill of materials defined'
                        }
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    {relatedBOMs.length > 0 ? (
                      relatedBOMs.slice(0, 2).map((bom) => (
                        <Button
                          key={bom.id}
                          onClick={() => onNavigateToBom(bom.finishedSku)}
                          className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-full font-medium"
                        >
                          View BOM
                        </Button>
                      ))
                    ) : (
                      <Button
                        onClick={() => {
                          addToast('Create BOM functionality coming soon', 'info');
                        }}
                        className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-full font-medium"
                      >
                        Create BOM
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => onQuickRequest?.({ sku: product.sku, requestType: 'consumable' })}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-full font-medium"
                  disabled={!onQuickRequest}
                >
                  Create Requisition
                </Button>
                <Button
                  onClick={() => onQuickRequest?.({ sku: product.sku, requestType: 'product_alert', alertOnly: true })}
                  className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-2 rounded-full font-medium"
                  disabled={!onQuickRequest}
                >
                  Set Alert
                </Button>
                {userAccessLevel === 'full' && (
                  <Button
                    onClick={() => {
                      addToast('Edit functionality coming soon', 'info');
                    }}
                    className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-full font-medium"
                  >
                    Edit Product
                  </Button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'bom' && (
            <div className="space-y-6">
              {isFinishedGood && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-2xl p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                        <BeakerIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">Finished Good with BOM</h3>
                        <p className="text-green-700 dark:text-green-300">This product has a bill of materials that can be edited.</p>
                      </div>
                    </div>
                    <Button
                      onClick={() => onNavigateToBom(product.sku)}
                      className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-full font-medium"
                    >
                      Edit BOM
                    </Button>
                  </div>
                </div>
              )}

              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">BOM Relationships</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Products that use or produce this item</p>
                </div>
                <div className="p-6">
                  {relatedBOMs.length === 0 ? (
                    <div className="text-center py-8">
                      <BeakerIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500 dark:text-gray-400">No BOM relationships found for this product.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {relatedBOMs.map((bom) => (
                        <div key={bom.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                              <BeakerIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                              <h4 className="font-semibold text-gray-900 dark:text-white">{bom.name}</h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {bom.finishedSku === product.sku ? 'Produces this product' : 'Uses this product as component'}
                              </p>
                            </div>
                          </div>
                          <Button
                            onClick={() => onNavigateToBom(bom.finishedSku)}
                            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-full font-medium text-sm"
                          >
                            View BOM
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'purchases' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Purchase History</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Recent orders and procurement activity</p>
              </div>
              <div className="p-6">
                {purchaseHistory.length === 0 ? (
                  <div className="text-center py-8">
                    <DocumentTextIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">No purchase history found for this product.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {purchaseHistory.slice(0, 10).map((po) => {
                      const poItem = po.items.find(item => item.sku === product.sku);
                      return (
                        <div key={po.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                              <DocumentTextIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                              <h4 className="font-semibold text-gray-900 dark:text-white">PO {po.orderId}</h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                Ordered: {po.orderDate} • Quantity: {poItem?.quantity} • Cost: ${poItem?.unitCost?.toFixed(2)}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-500">Status: {po.status}</p>
                            </div>
                          </div>
                          <Button
                            onClick={() => {/* Navigate to PO detail */}}
                            className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-full font-medium text-sm"
                          >
                            View PO
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 shadow-sm text-center">
              <ChartBarIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Analytics Dashboard</h3>
              <p className="text-gray-500 dark:text-gray-400">Analytics dashboard coming soon...</p>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 shadow-sm text-center">
              <BotIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">AI Assistant</h3>
              <p className="text-gray-500 dark:text-gray-400">AI insights for this product coming soon...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductPage;