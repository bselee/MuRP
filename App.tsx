


import React, { useState, useMemo } from 'react';
import AiAssistant from './components/AiAssistant';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import PurchaseOrders from './pages/PurchaseOrders';
import Vendors from './pages/Vendors';
import Production from './pages/Production';
import BOMs from './pages/BOMs';
import Settings from './pages/Settings';
import LoginScreen from './pages/LoginScreen';
import Toast from './components/Toast';
import ApiDocs from './pages/ApiDocs';
import ArtworkPage from './pages/Artwork';
import NewUserSetup from './pages/NewUserSetup';
import { 
    mockBOMs, 
    mockInventory, 
    mockVendors, 
    mockPurchaseOrders, 
    mockHistoricalSales, 
    mockBuildOrders,
    mockUsers,
    mockInternalRequisitions,
    mockWatchlist,
    defaultAiConfig,
    mockArtworkFolders,
} from './types';
import type { 
    BillOfMaterials, 
    InventoryItem, 
    Vendor, 
    PurchaseOrder, 
    HistoricalSale, 
    BuildOrder,
    User,
    InternalRequisition,
    RequisitionItem,
    ExternalConnection,
    GmailConnection,
    Artwork,
    WatchlistItem,
    AiConfig,
    ArtworkFolder,
} from './types';

export type Page = 'Dashboard' | 'Inventory' | 'Purchase Orders' | 'Vendors' | 'Production' | 'BOMs' | 'Settings' | 'API Documentation' | 'Artwork';

export type ToastInfo = {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [boms, setBoms] = useState<BillOfMaterials[]>(mockBOMs);
  const [inventory, setInventory] = useState<InventoryItem[]>(mockInventory);
  const [vendors] = useState<Vendor[]>(mockVendors);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(mockPurchaseOrders);
  const [historicalSales] = useState<HistoricalSale[]>(mockHistoricalSales);
  const [buildOrders, setBuildOrders] = useState<BuildOrder[]>(mockBuildOrders);
  const [requisitions, setRequisitions] = useState<InternalRequisition[]>(mockInternalRequisitions);
  const [users, setUsers] = useState<User[]>(mockUsers);
  const [watchlist] = useState<WatchlistItem[]>(mockWatchlist);
  const [aiConfig, setAiConfig] = useState<AiConfig>(defaultAiConfig);
  const [artworkFolders, setArtworkFolders] = useState<ArtworkFolder[]>(mockArtworkFolders);
  
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [currentPage, setCurrentPage] = useState<Page>('Dashboard');
  const [toasts, setToasts] = useState<ToastInfo[]>([]);
  const [gmailConnection, setGmailConnection] = useState<GmailConnection>({ isConnected: false, email: null });
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [externalConnections, setExternalConnections] = useState<ExternalConnection[]>([]);
  const [artworkFilter, setArtworkFilter] = useState<string>('');


  const addToast = (message: string, type: ToastInfo['type'] = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    // Onboarding check happens in the main render logic.
    // If onboarding is not complete, the setup screen will be shown.
    // If it is complete, this toast will show as they enter the dashboard.
    if (user.onboardingComplete) {
        addToast(`Welcome back, ${user.name}!`, 'success');
    }
  };

  const handleLogout = () => {
    addToast(`Goodbye, ${currentUser?.name}.`, 'info');
    setCurrentUser(null);
  };
  
  const handleCreatePo = (
    poDetails: Omit<PurchaseOrder, 'id' | 'status' | 'createdAt' | 'items'> & { items: { sku: string; name: string; quantity: number }[] }
  ) => {
    const { vendorId, items, expectedDate, notes, requisitionIds } = poDetails;
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
      expectedDate,
      notes,
      requisitionIds,
    };

    setPurchaseOrders(prev => [newPo, ...prev]);

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
    
    if (requisitionIds && requisitionIds.length > 0) {
        setRequisitions(prevReqs => prevReqs.map(req => requisitionIds.includes(req.id) ? { ...req, status: 'Ordered' } : req));
    }

    addToast(`Successfully created ${newPo.id} for ${vendor.name}.`, 'success');
    setCurrentPage('Purchase Orders');
  };

  const handleGeneratePosFromRequisitions = (
    posToCreate: { vendorId: string; items: { sku: string; name: string; quantity: number; }[]; requisitionIds: string[]; }[]
  ) => {
    posToCreate.forEach(poData => {
        handleCreatePo(poData);
    });
    addToast(`Generated ${posToCreate.length} new Purchase Orders from requisitions.`, 'success');
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

      setInventory(prevInventory => {
        const newInventory = [...prevInventory];
        bom.components.forEach(component => {
          const itemIndex = newInventory.findIndex(invItem => invItem.sku === component.sku);
          if (itemIndex !== -1) {
            newInventory[itemIndex] = {
              ...newInventory[itemIndex],
              stock: newInventory[itemIndex].stock - (component.quantity * completedOrder!.quantity),
            };
          }
        });

        const finishedGoodIndex = newInventory.findIndex(invItem => invItem.sku === completedOrder!.finishedSku);
        if (finishedGoodIndex !== -1) {
           newInventory[finishedGoodIndex] = {
              ...newInventory[finishedGoodIndex],
              stock: newInventory[finishedGoodIndex].stock + completedOrder!.quantity,
            };
        } else {
            newInventory.push({
                sku: completedOrder!.finishedSku,
                name: completedOrder!.name,
                category: 'Finished Goods',
                stock: completedOrder!.quantity,
                onOrder: 0,
                reorderPoint: 0,
                vendorId: 'N/A'
            });
        }
        return newInventory;
      });

      addToast(`${completedOrder.id} marked as completed. Inventory updated.`, 'success');
    }
  };

  const handleUpdateBom = (updatedBom: BillOfMaterials) => {
    setBoms(prevBoms => {
      const index = prevBoms.findIndex(b => b.id === updatedBom.id);
      if (index === -1) return prevBoms;
      const newBoms = [...prevBoms];
      newBoms[index] = updatedBom;
      return newBoms;
    });
    addToast(`Successfully updated BOM for ${updatedBom.name}.`, 'success');
  };

  const handleAddArtworkToBom = (finishedSku: string, fileName: string) => {
    setBoms(prevBoms => {
        const newBoms = [...prevBoms];
        const bomIndex = newBoms.findIndex(b => b.finishedSku === finishedSku);
        if (bomIndex !== -1) {
            const bomToUpdate = newBoms[bomIndex];
            const highestRevision = bomToUpdate.artwork.reduce((max, art) => Math.max(max, art.revision), 0);
            
            const newArtwork: Artwork = {
                id: `art-${Date.now()}`,
                fileName,
                revision: highestRevision + 1,
                url: `/art/${fileName.replace(/\s+/g, '-').toLowerCase()}-v${highestRevision + 1}.pdf`, // Mock URL
            };
            
            bomToUpdate.artwork.push(newArtwork);
            addToast(`Added artwork '${fileName}' (Rev ${newArtwork.revision}) to ${bomToUpdate.name}.`, 'success');
        } else {
            addToast(`Could not add artwork: BOM with SKU ${finishedSku} not found.`, 'error');
        }
        return newBoms;
    });
    setCurrentPage('Artwork');
  };

  const handleCreatePoFromArtwork = (artworkIds: string[]) => {
    const artworkToBomMap = new Map<string, BillOfMaterials>();
    boms.forEach(bom => {
        bom.artwork.forEach(art => {
            if (artworkIds.includes(art.id)) {
                artworkToBomMap.set(art.id, bom);
            }
        });
    });

    const itemsByVendor = new Map<string, { sku: string; name: string; quantity: number }[]>();

    artworkIds.forEach(artId => {
        const bom = artworkToBomMap.get(artId);
        if (bom) {
            const packagingComponents = bom.components.map(c => inventory.find(i => i.sku === c.sku)).filter(Boolean) as InventoryItem[];
            packagingComponents.filter(pc => pc.category === 'Packaging').forEach(pc => {
                const vendorItems = itemsByVendor.get(pc.vendorId) || [];
                const existingItem = vendorItems.find(item => item.sku === pc.sku);
                if(existingItem) {
                    existingItem.quantity += 1; // Assume 1 unit of packaging per artwork selection for simplicity
                } else {
                    vendorItems.push({ sku: pc.sku, name: pc.name, quantity: 1 });
                }
                itemsByVendor.set(pc.vendorId, vendorItems);
            });
        }
    });

    const posToCreate: { vendorId: string; items: { sku: string; name: string; quantity: number }[] }[] = [];
    itemsByVendor.forEach((items, vendorId) => {
        posToCreate.push({ vendorId, items });
    });

    if (posToCreate.length > 0) {
        posToCreate.forEach(poData => handleCreatePo(poData));
        addToast(`Successfully created ${posToCreate.length} PO(s) from artwork selection.`, 'success');
    } else {
        addToast('No packaging components found for the selected artwork.', 'info');
    }
  };

  const handleUpdateArtwork = (artworkId: string, bomId: string, updates: Partial<Artwork>) => {
    setBoms(prevBoms => {
        const newBoms = JSON.parse(JSON.stringify(prevBoms)); // Deep copy
        const bomIndex = newBoms.findIndex((b: BillOfMaterials) => b.id === bomId);
        if (bomIndex !== -1) {
            const artworkIndex = newBoms[bomIndex].artwork.findIndex((a: Artwork) => a.id === artworkId);
            if (artworkIndex !== -1) {
                newBoms[bomIndex].artwork[artworkIndex] = {
                    ...newBoms[bomIndex].artwork[artworkIndex],
                    ...updates,
                };
            }
        }
        return newBoms;
    });
    addToast('Artwork updated.', 'success');
  };
  
  const handleCreateArtworkFolder = (name: string) => {
    const newFolder: ArtworkFolder = { id: `folder-${Date.now()}`, name };
    setArtworkFolders(prev => [...prev, newFolder]);
    addToast(`Folder "${name}" created successfully.`, 'success');
  };

  const handleCreateRequisition = (items: RequisitionItem[], source: 'Manual' | 'System' = 'Manual') => {
      const newReq: InternalRequisition = {
        id: `REQ-${new Date().getFullYear()}-${(requisitions.length + 1).toString().padStart(3, '0')}`,
        requesterId: source === 'Manual' ? currentUser!.id : null,
        department: source === 'Manual' ? currentUser!.department : 'Purchasing',
        source,
        createdAt: new Date().toISOString(),
        status: 'Pending',
        items,
    };
    setRequisitions(prev => [newReq, ...prev]);
    addToast(`Requisition ${newReq.id} submitted for approval.`, 'success');
  };

  const handleApproveRequisition = (reqId: string) => {
    const req = requisitions.find(r => r.id === reqId);
    if (!req || !currentUser) return;

    if (currentUser.role === 'Admin' || (currentUser.role === 'Manager' && currentUser.department === req.department)) {
        setRequisitions(prev => prev.map(r => r.id === reqId ? { ...r, status: 'Approved' } : r));
        addToast(`Requisition ${reqId} approved.`, 'success');
    } else {
        addToast('You do not have permission to approve this requisition.', 'error');
    }
  };

  const handleRejectRequisition = (reqId: string) => {
    const req = requisitions.find(r => r.id === reqId);
    if (!req || !currentUser) return;

    if (currentUser.role === 'Admin' || (currentUser.role === 'Manager' && currentUser.department === req.department)) {
        setRequisitions(prev => prev.map(r => r.id === reqId ? { ...r, status: 'Rejected' } : r));
        addToast(`Requisition ${reqId} rejected.`, 'info');
    } else {
        addToast('You do not have permission to reject this requisition.', 'error');
    }
  };

  const handleGmailConnect = () => {
    if (currentUser?.name) {
        // Simulate creating an email from the user's name
        const email = `${currentUser.name.toLowerCase().replace(' ', '.')}@goodestfungus.com`;
        setGmailConnection({ isConnected: true, email });
        addToast('Gmail account connected successfully!', 'success');
    }
  };

  const handleGmailDisconnect = () => {
    setGmailConnection({ isConnected: false, email: null });
    addToast('Gmail account disconnected.', 'info');
  };

  const handleSendPoEmail = (poId: string) => {
    if (gmailConnection.isConnected) {
        addToast(`Email for ${poId} sent via ${gmailConnection.email}.`, 'success');
    } else {
        addToast(`Simulating email send for ${poId}.`, 'info');
    }
  };
  
  const generateApiKey = () => {
    const newKey = `tgfmrp_live_${[...Array(32)].map(() => Math.random().toString(36)[2]).join('')}`;
    setApiKey(newKey);
    addToast('New API Key generated successfully.', 'success');
  };
  
  const revokeApiKey = () => {
    setApiKey(null);
    addToast('API Key has been revoked.', 'info');
  };
  
  const handleInviteUser = (email: string, role: User['role'], department: User['department']) => {
    const newUser: User = {
      id: `user-${Date.now()}`,
      name: email.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase()), // Generate name from email
      email,
      role,
      department,
      onboardingComplete: false,
    };
    setUsers(prev => [...prev, newUser]);
    addToast(`User ${email} has been invited as a ${role}.`, 'success');
  };

  const handleUpdateUser = (updatedUser: User) => {
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    addToast(`User ${updatedUser.name} has been updated.`, 'success');
  };

  const handleDeleteUser = (userId: string) => {
    setUsers(prev => prev.filter(u => u.id !== userId));
    addToast('User has been removed.', 'info');
  };

  const handleCompleteOnboarding = (userId: string) => {
    setUsers(prevUsers => prevUsers.map(user => 
        user.id === userId ? { ...user, onboardingComplete: true } : user
    ));
    setCurrentUser(prev => prev ? { ...prev, onboardingComplete: true } : null);
    addToast('Welcome aboard! Your account is now active.', 'success');
  };


  const pendingRequisitionCount = useMemo(() => {
    if (!currentUser) return 0;
    if (currentUser.role === 'Admin') {
        return requisitions.filter(r => r.status === 'Pending').length;
    }
    if (currentUser.role === 'Manager') {
        return requisitions.filter(r => r.status === 'Pending' && r.department === currentUser.department).length;
    }
    return 0;
  }, [requisitions, currentUser]);
  
  const approvedRequisitionsForPoGen = useMemo(() => {
    if (currentUser?.role !== 'Admin') return [];
    return requisitions.filter(r => r.status === 'Approved');
  }, [requisitions, currentUser]);

  const navigateToArtwork = (filter: string) => {
    setArtworkFilter(filter);
    setCurrentPage('Artwork');
  };

  const renderPage = () => {
    if (!currentUser) return null;
    
    switch (currentPage) {
      case 'Dashboard':
        return <Dashboard 
          inventory={inventory} 
          boms={boms} 
          historicalSales={historicalSales}
          vendors={vendors}
          onCreateBuildOrder={handleCreateBuildOrder}
          onCreateRequisition={handleCreateRequisition}
          requisitions={requisitions}
          users={users}
          currentUser={currentUser}
          setCurrentPage={setCurrentPage}
          aiConfig={aiConfig}
        />;
      case 'Inventory':
        return <Inventory inventory={inventory} vendorMap={new Map(vendors.map(v => [v.id, v.name]))} boms={boms} />;
      case 'Purchase Orders':
        return <PurchaseOrders 
                    purchaseOrders={purchaseOrders} 
                    vendors={vendors}
                    inventory={inventory}
                    onCreatePo={handleCreatePo}
                    addToast={addToast}
                    currentUser={currentUser}
                    approvedRequisitions={approvedRequisitionsForPoGen}
                    onGeneratePos={handleGeneratePosFromRequisitions}
                    gmailConnection={gmailConnection}
                    onSendEmail={handleSendPoEmail}
                    requisitions={requisitions}
                    users={users}
                    onApproveRequisition={handleApproveRequisition}
                    onRejectRequisition={handleRejectRequisition}
                    onCreateRequisition={(items) => handleCreateRequisition(items, 'Manual')}
                />;
      case 'Vendors':
        return <Vendors vendors={vendors} />;
      case 'Production':
        return <Production buildOrders={buildOrders} onCompleteBuildOrder={handleCompleteBuildOrder} />;
      case 'BOMs':
        return <BOMs boms={boms} currentUser={currentUser} onUpdateBom={handleUpdateBom} onNavigateToArtwork={navigateToArtwork}/>;
      case 'Artwork':
        return <ArtworkPage 
            boms={boms}
            onAddArtwork={handleAddArtworkToBom}
            onCreatePoFromArtwork={handleCreatePoFromArtwork}
            onUpdateArtwork={handleUpdateArtwork}
            initialFilter={artworkFilter}
            onClearFilter={() => setArtworkFilter('')}
            watchlist={watchlist}
            aiConfig={aiConfig}
            artworkFolders={artworkFolders}
            onCreateArtworkFolder={handleCreateArtworkFolder}
        />;
      case 'API Documentation':
          return <ApiDocs />;
      case 'Settings':
        return <Settings 
            currentUser={currentUser}
            aiConfig={aiConfig}
            setAiConfig={setAiConfig}
            gmailConnection={gmailConnection}
            onGmailConnect={handleGmailConnect}
            onGmailDisconnect={handleGmailDisconnect}
            apiKey={apiKey}
            onGenerateApiKey={generateApiKey}
            onRevokeApiKey={revokeApiKey}
            addToast={addToast}
            setCurrentPage={setCurrentPage}
            externalConnections={externalConnections}
            onSetExternalConnections={setExternalConnections}
            users={users}
            onInviteUser={handleInviteUser}
            onUpdateUser={handleUpdateUser}
            onDeleteUser={handleDeleteUser}
        />;
      default:
        return <Dashboard 
          inventory={inventory} 
          boms={boms} 
          historicalSales={historicalSales}
          vendors={vendors}
          onCreateBuildOrder={handleCreateBuildOrder}
          onCreateRequisition={handleCreateRequisition}
          requisitions={requisitions}
          users={users}
          currentUser={currentUser}
          setCurrentPage={setCurrentPage}
          aiConfig={aiConfig}
        />;
    }
  };

  if (!currentUser) {
    return <LoginScreen users={users} onLogin={handleLogin} />;
  }

  if (currentUser && !currentUser.onboardingComplete) {
      return <NewUserSetup user={currentUser} onSetupComplete={() => handleCompleteOnboarding(currentUser.id)} />;
  }

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <Sidebar 
        currentPage={currentPage} 
        setCurrentPage={setCurrentPage} 
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        currentUser={currentUser}
        pendingRequisitionCount={pendingRequisitionCount}
        onOpenAiAssistant={() => setIsAiAssistantOpen(true)}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header currentUser={currentUser} onLogout={handleLogout} />
        
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-900 p-4 sm:p-6 lg:p-8">
          {renderPage()}
        </main>
      </div>

      <div className="fixed top-20 right-4 z-[60] w-full max-w-sm">
        {toasts.map(toast => (
          <Toast key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
      
      <AiAssistant
        isOpen={isAiAssistantOpen}
        onClose={() => setIsAiAssistantOpen(false)}
        boms={boms}
        inventory={inventory}
        vendors={vendors}
        purchaseOrders={purchaseOrders}
        aiConfig={aiConfig}
      />
    </div>
  );
};

export default App;