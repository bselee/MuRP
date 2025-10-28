import React, { useState, useMemo } from 'react';
import AiAssistant from './components/AiAssistant';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import PurchaseOrders from './pages/PurchaseOrders';
import Vendors from './pages/Vendors';
import PlanningForecast from './pages/PlanningForecast';
import Production from './pages/Production';
import Settings from './pages/Settings';
import Toast from './components/Toast';
import { BotIcon } from './components/icons';
// FIX: Added mockHistoricalSales to the import statement to resolve reference error.
import { mockBOMs, mockInventory, mockVendors, mockPurchaseOrders, mockHistoricalSales, mockBuildOrders } from './types';
import type { BillOfMaterials, InventoryItem, Vendor, PurchaseOrder, HistoricalSale, PurchaseOrderItem, BuildOrder } from './types';

export type Page = 'Dashboard' | 'Inventory' | 'Purchase Orders' | 'Vendors' | 'Planning & Forecast' | 'Production' | 'Settings';

export type ToastInfo = {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
};

const App: React.FC = () => {
  const [boms] = useState<BillOfMaterials[]>(mockBOMs);
  const [inventory, setInventory] = useState<InventoryItem[]>(mockInventory);
  const [vendors] = useState<Vendor[]>(mockVendors);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(mockPurchaseOrders);
  const [historicalSales] = useState<HistoricalSale[]>(mockHistoricalSales);
  const [buildOrders, setBuildOrders] = useState<BuildOrder[]>(mockBuildOrders);
  
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [currentPage, setCurrentPage] = useState<Page>('Dashboard');
  const [toasts, setToasts] = useState<ToastInfo[]>([]);

  const addToast = (message: string, type: ToastInfo['type'] = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const handleCreatePo = (
    vendorId: string,
    items: { sku: string; name: string; quantity: number }[]
  ) => {
    const vendor = vendors.find(v => v.id === vendorId);
    if (!vendor) {
      addToast("Failed to create PO: Vendor not found.", "error");
      return;
    }

    const newPo: PurchaseOrder = {
      id: `PO-${new Date().getFullYear()}-${(purchaseOrders.length + 1).toString().padStart(3, '0')}`,
      vendorId,
      status: 'Pending',
      createdAt: new Date().toISOString(),
      items: items.map(item => ({
        ...item,
        price: Math.random() * 10 + 1 // Mock price for demo
      })),
    };

    setPurchaseOrders(prev => [newPo, ...prev]);

    // Also update the 'onOrder' quantity for the inventory items
    setInventory(prevInventory => {
      const newInventory = [...prevInventory];
      items.forEach(item => {
        const itemIndex = newInventory.findIndex(invItem => invItem.sku === item.sku);
        if (itemIndex !== -1) {
          newInventory[itemIndex] = {
            ...newInventory[itemIndex],
            onOrder: newInventory[itemIndex].onOrder + item.quantity,
          };
        }
      });
      return newInventory;
    });

    addToast(`Successfully created ${newPo.id} for ${vendor.name}.`, 'success');
    setCurrentPage('Purchase Orders');
  };

  const handleCreateBuildOrder = (sku: string, name: string, quantity: number) => {
    const newBuildOrder: BuildOrder = {
      id: `BO-${new Date().getFullYear()}-${(buildOrders.length + 1).toString().padStart(3, '0')}`,
      finishedSku: sku,
      name,
      quantity,
      status: 'Pending',
      createdAt: new Date().toISOString(),
    };
    setBuildOrders(prev => [newBuildOrder, ...prev]);
    addToast(`Successfully created Build Order ${newBuildOrder.id} for ${quantity}x ${name}.`, 'success');
    setCurrentPage('Production');
  };

  const handleCompleteBuildOrder = (buildOrderId: string) => {
    let completedOrder: BuildOrder | undefined;
    
    // Update build order status
    setBuildOrders(prevOrders => {
      const newOrders = [...prevOrders];
      const orderIndex = newOrders.findIndex(bo => bo.id === buildOrderId);
      if (orderIndex !== -1 && newOrders[orderIndex].status !== 'Completed') {
        completedOrder = { ...newOrders[orderIndex], status: 'Completed' };
        newOrders[orderIndex] = completedOrder;
      }
      return newOrders;
    });

    if (completedOrder) {
      const bom = boms.find(b => b.finishedSku === completedOrder!.finishedSku);
      if (!bom) {
        addToast(`Could not complete ${completedOrder.id}: BOM not found.`, 'error');
        return;
      }

      // Update inventory levels
      setInventory(prevInventory => {
        const newInventory = [...prevInventory];
        
        // Decrement components
        bom.components.forEach(component => {
          const itemIndex = newInventory.findIndex(invItem => invItem.sku === component.sku);
          if (itemIndex !== -1) {
            newInventory[itemIndex] = {
              ...newInventory[itemIndex],
              stock: newInventory[itemIndex].stock - (component.quantity * completedOrder!.quantity),
            };
          }
        });

        // Increment finished good
        const finishedGoodIndex = newInventory.findIndex(invItem => invItem.sku === completedOrder!.finishedSku);
        if (finishedGoodIndex !== -1) {
           newInventory[finishedGoodIndex] = {
              ...newInventory[finishedGoodIndex],
              stock: newInventory[finishedGoodIndex].stock + completedOrder!.quantity,
            };
        } else {
            // If FG isn't in inventory, add it (edge case)
            newInventory.push({
                sku: completedOrder!.finishedSku,
                name: completedOrder!.name,
                category: 'Finished Goods',
                stock: completedOrder!.quantity,
                onOrder: 0,
                reorderPoint: 0, // default
                vendorId: 'N/A'
            });
        }
        return newInventory;
      });

      addToast(`${completedOrder.id} marked as completed. Inventory updated.`, 'success');
    }
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'Dashboard':
        return <Dashboard inventory={inventory} boms={boms} />;
      case 'Inventory':
        return <Inventory inventory={inventory} vendorMap={new Map(vendors.map(v => [v.id, v.name]))} boms={boms} />;
      case 'Purchase Orders':
        return <PurchaseOrders purchaseOrders={purchaseOrders} vendorMap={new Map(vendors.map(v => [v.id, v.name]))} />;
      case 'Vendors':
        return <Vendors vendors={vendors} />;
      case 'Planning & Forecast':
        return <PlanningForecast 
          boms={boms} 
          inventory={inventory} 
          historicalSales={historicalSales}
          vendors={vendors}
          onCreatePo={handleCreatePo}
          onCreateBuildOrder={handleCreateBuildOrder}
        />;
      case 'Production':
        return <Production buildOrders={buildOrders} onCompleteBuildOrder={handleCompleteBuildOrder} />;
      case 'Settings':
        return <Settings />;
      default:
        return <Dashboard inventory={inventory} boms={boms} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <Sidebar 
        currentPage={currentPage} 
        setCurrentPage={setCurrentPage} 
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-900 p-4 sm:p-6 lg:p-8">
          {renderPage()}
        </main>
      </div>

      <div className="fixed top-20 right-4 z-50 w-full max-w-sm">
        {toasts.map(toast => (
          <Toast key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
      
      {!isAiAssistantOpen && (
        <button
          onClick={() => setIsAiAssistantOpen(true)}
          className="fixed bottom-6 right-6 bg-indigo-600 text-white p-4 rounded-full shadow-lg hover:bg-indigo-700 transition-transform transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500 z-40"
          aria-label="Open AI Assistant"
        >
          <BotIcon className="w-6 h-6" />
        </button>
      )}

      <AiAssistant
        isOpen={isAiAssistantOpen}
        onClose={() => setIsAiAssistantOpen(false)}
        boms={boms}
        inventory={inventory}
        vendors={vendors}
        purchaseOrders={purchaseOrders}
      />
    </div>
  );
};

export default App;