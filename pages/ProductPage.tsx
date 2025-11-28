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
      <div className="p-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Product Not Found</h2>
          <p className="text-gray-600">The selected product could not be found.</p>
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
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <Button
            onClick={() => {
              // Try to go back in history, but if that doesn't work (e.g., direct navigation),
              // fall back to navigating to the Inventory page
              if (window.history.length > 1) {
                window.history.back();
              } else {
                // If no history, navigate to inventory page
                window.location.href = '/inventory';
              }
            }}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ChevronDoubleLeftIcon className="w-4 h-4" />
            Back
          </Button>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-gray-900">{product.name}</h1>
              {isFinishedGood && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Finished Good
                </span>
              )}
            </div>
            <p className="text-lg text-gray-600 font-mono">{product.sku}</p>
            <p className="text-sm text-gray-500 mt-1">Category: {product.category}</p>
          </div>

          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">${product.unitCost?.toFixed(2) || 'N/A'}</div>
            <p className="text-sm text-gray-500">Unit Cost</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
      <div className="min-h-[400px]">
        {activeTab === 'overview' && (
          <div className="max-w-4xl">
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Product Overview</h3>
                  <div className="flex items-center gap-2">
                    {/* Import/Export functionality */}
                    <Button
                      onClick={() => {
                        // Export product data as JSON
                        const exportData = {
                          product,
                          relatedBOMs,
                          purchaseHistory,
                          vendor: vendors.find(v => v.id === product.vendorId),
                          exportDate: new Date().toISOString(),
                        };
                        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${product.sku}-product-data.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        addToast('Product data exported successfully', 'success');
                      }}
                      className="flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm"
                      title="Export product data"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export
                    </Button>

                    {/* Edit Inventory Parameters - only for full access users */}
                    {userAccessLevel === 'full' && (
                      <Button
                        onClick={() => {
                          // TODO: Open edit modal for inventory parameters
                          addToast('Edit functionality coming soon', 'info');
                        }}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-3 py-1.5"
                        title="Edit inventory parameters"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </Button>
                    )}

                    {/* Expand/Collapse button */}
                    <Button
                      onClick={() => setOverviewExpanded(!overviewExpanded)}
                      className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
                    >
                      {overviewExpanded ? (
                        <>
                          <ChevronUpIcon className="w-4 h-4" />
                          Show Less
                        </>
                      ) : (
                        <>
                          <ChevronDownIcon className="w-4 h-4" />
                          Show More
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Basic Information - Always Visible */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-2">Stock Status</h4>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Current:</span>
                        <span className={`font-semibold ${product.stock <= product.reorderPoint ? 'text-red-600' : 'text-green-600'}`}>
                          {product.stock}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">On Order:</span>
                        <span className="font-semibold text-blue-600">{product.onOrder}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-2">Supplier</h4>
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-gray-900">
                        {vendors.find(v => v.id === product.vendorId)?.name || 'N/A'}
                      </div>
                      <div className="text-sm text-gray-600">
                        Lead Time: {vendors.find(v => v.id === product.vendorId)?.leadTimeDays || 'N/A'} days
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-2">Pricing</h4>
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-gray-900">
                        ${product.unitCost?.toFixed(2) || 'N/A'}
                      </div>
                      <div className="text-sm text-gray-600">
                        Unit Cost
                      </div>
                    </div>
                  </div>
                </div>

                {/* BOM Status Section */}
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${relatedBOMs.length > 0 ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">
                          {relatedBOMs.length > 0 ? 'Has Bill of Materials' : 'No Bill of Materials'}
                        </h4>
                        <p className="text-xs text-gray-600">
                          {relatedBOMs.length > 0
                            ? `${relatedBOMs.length} BOM${relatedBOMs.length > 1 ? 's' : ''} found`
                            : 'This product does not have a bill of materials defined'
                          }
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {relatedBOMs.length > 0 ? (
                        relatedBOMs.map((bom) => (
                          <Button
                            key={bom.id}
                            onClick={() => onNavigateToBom(bom.finishedSku)}
                            className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1"
                            title={`View BOM: ${bom.name}`}
                          >
                            View BOM
                          </Button>
                        ))
                      ) : (
                        <Button
                          onClick={() => {
                            // TODO: Create new BOM for this product
                            addToast('Create BOM functionality coming soon', 'info');
                          }}
                          className="text-xs bg-gray-600 hover:bg-gray-700 text-white px-3 py-1"
                          title="Create a new BOM for this product"
                        >
                          Create BOM
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Detailed Information - Expanded or for privileged users */}
                {(overviewExpanded || userAccessLevel === 'full') && (
                  <div className="border-t border-gray-200 pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 mb-3">Inventory Details</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Reorder Point:</span>
                            <span className="font-semibold">{product.reorderPoint}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Safety Stock:</span>
                            <span className="font-semibold">{product.safetyStock || 0}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">MOQ:</span>
                            <span className="font-semibold">{product.moq || 1}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Status:</span>
                            <span className={`font-semibold ${
                              product.status === 'active' ? 'text-green-600' :
                              product.status === 'inactive' ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {product.status || 'active'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-medium text-gray-500 mb-3">Sales Performance</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">30 Day Sales:</span>
                            <span className="font-semibold">{product.sales30Days || 0}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">90 Day Sales:</span>
                            <span className="font-semibold">{product.sales90Days || 0}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Velocity:</span>
                            <span className="font-semibold">{product.salesVelocity?.toFixed(1) || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Unit Price:</span>
                            <span className="font-semibold">${product.unitPrice?.toFixed(2) || 'N/A'}</span>
                          </div>
                        </div>
                      </div>

                      {userAccessLevel === 'full' && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-500 mb-3">Purchasing Intelligence</h4>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Days of Stock:</span>
                              <span className="font-semibold">
                                {product.salesVelocity && product.salesVelocity > 0 
                                  ? Math.round(product.stock / product.salesVelocity) 
                                  : '∞'}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Est. Out of Stock:</span>
                              <span className="font-semibold text-red-600">
                                {product.salesVelocity && product.salesVelocity > 0 
                                  ? `${Math.round(product.stock / product.salesVelocity)} days`
                                  : 'Never'}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Suggested Order:</span>
                              <span className="font-semibold text-blue-600">
                                {Math.max(product.reorderPoint - product.stock, 0)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Show expand hint for non-privileged users */}
                {!overviewExpanded && userAccessLevel !== 'full' && (
                  <div className="text-center mt-4">
                    <p className="text-sm text-gray-500">
                      Click "Show More" for additional details
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'bom' && (
          <div className="space-y-6">
            {isFinishedGood && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-green-800">Finished Good with BOM</h3>
                    <p className="text-green-700">This product has a bill of materials that can be edited.</p>
                  </div>
                  <Button
                    onClick={() => onNavigateToBom(product.sku)}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    Edit BOM
                  </Button>
                </div>
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">BOM Relationships</h3>
              </div>
              <div className="p-6">
                {relatedBOMs.length === 0 ? (
                  <p className="text-gray-500">No BOM relationships found for this product.</p>
                ) : (
                  <div className="space-y-4">
                    {relatedBOMs.map((bom) => (
                      <div key={bom.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                        <div>
                          <h4 className="font-semibold text-gray-900">{bom.name}</h4>
                          <p className="text-sm text-gray-600">
                            {bom.finishedSku === product.sku ? 'Produces this product' : 'Uses this product as component'}
                          </p>
                        </div>
                        <Button
                          onClick={() => onNavigateToBom(bom.finishedSku)}
                          className="text-indigo-600 hover:text-indigo-800"
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
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Purchase History</h3>
            </div>
            <div className="p-6">
              {purchaseHistory.length === 0 ? (
                <p className="text-gray-500">No purchase history found for this product.</p>
              ) : (
                <div className="space-y-4">
                  {purchaseHistory.map((po) => {
                    const poItem = po.items.find(item => item.sku === product.sku);
                    return (
                      <div key={po.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                        <div>
                          <h4 className="font-semibold text-gray-900">PO {po.orderId}</h4>
                          <p className="text-sm text-gray-600">
                            Ordered: {po.orderDate} • Quantity: {poItem?.quantity} • Cost: ${poItem?.unitCost?.toFixed(2)}
                          </p>
                          <p className="text-sm text-gray-500">Status: {po.status}</p>
                        </div>
                        <Button
                          onClick={() => {/* Navigate to PO detail */}}
                          className="text-indigo-600 hover:text-indigo-800"
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
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Analytics</h3>
            <p className="text-gray-500">Analytics dashboard coming soon...</p>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Assistant</h3>
            <p className="text-gray-500">AI insights for this product coming soon...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductPage;