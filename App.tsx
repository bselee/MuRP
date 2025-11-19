


import React, { useState, useMemo, useEffect } from 'react';
import AiAssistant from './components/AiAssistant';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ErrorBoundary from './components/ErrorBoundary';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import PurchaseOrders from './pages/PurchaseOrders';
import Vendors from './pages/Vendors';
import Production from './pages/Production';
import BOMs from './pages/BOMs';
import Settings from './pages/Settings';
import StockIntelligence from './pages/StockIntelligence';
import LoginScreen from './pages/LoginScreen';
import Toast from './components/Toast';
import ApiDocs from './pages/ApiDocs';
import ArtworkPage from './pages/Artwork';
import NewUserSetup from './pages/NewUserSetup';
import ManualLabelScanner from './components/ManualLabelScanner';
import AuthCallback from './pages/AuthCallback';
import ResetPassword from './pages/ResetPassword';
import usePersistentState from './hooks/usePersistentState';
import useModalState from './hooks/useModalState';
import {
  useSupabaseInventory,
  useSupabaseVendors,
  useSupabaseBOMs,
  useSupabasePurchaseOrders,
  useSupabaseBuildOrders,
  useSupabaseRequisitions,
  useSupabaseUserProfiles,
} from './hooks/useSupabaseData';
import {
  createPurchaseOrder,
  createBuildOrder,
  updateBuildOrder,
  updateBuildOrderStatus,
  updateBOM,
  updateInventoryStock,
  createInventoryItem,
  batchUpdateInventory,
  updateMultipleRequisitions,
  createRequisition,
  updateRequisitionStatus,
} from './hooks/useSupabaseMutations';
import {
    mockHistoricalSales,
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
    AiSettings,
    CreatePurchaseOrderInput,
} from './types';
import { getDefaultAiSettings } from './services/tokenCounter';
import LoadingOverlay from './components/LoadingOverlay';
import { supabase } from './lib/supabase/client';
import { useAuth } from './lib/auth/AuthContext';
import { usePermissions } from './hooks/usePermissions';

export type Page = 'Dashboard' | 'Inventory' | 'Purchase Orders' | 'Vendors' | 'Production' | 'BOMs' | 'Stock Intelligence' | 'Settings' | 'API Documentation' | 'Artwork' | 'Label Scanner';

export type ToastInfo = {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
};

const App: React.FC = () => {
  const { user: currentUser, loading: authLoading, signOut: authSignOut, refreshProfile } = useAuth();
  const permissions = usePermissions();

  // 🔥 LIVE DATA FROM SUPABASE (Real-time subscriptions enabled)
  const { data: inventory, loading: inventoryLoading, error: inventoryError, refetch: refetchInventory } = useSupabaseInventory();
  const { data: vendors, loading: vendorsLoading, error: vendorsError, refetch: refetchVendors } = useSupabaseVendors();
  const { data: boms, loading: bomsLoading, error: bomsError, refetch: refetchBOMs } = useSupabaseBOMs();
  const { data: purchaseOrders, loading: posLoading, error: posError, refetch: refetchPOs } = useSupabasePurchaseOrders();
  const { data: buildOrders, loading: buildOrdersLoading, error: buildOrdersError, refetch: refetchBuildOrders } = useSupabaseBuildOrders();
  const { data: requisitions, loading: requisitionsLoading, error: requisitionsError, refetch: refetchRequisitions } = useSupabaseRequisitions();
  const { data: userProfiles, loading: userProfilesLoading, refetch: refetchUserProfiles } = useSupabaseUserProfiles();

  // UI/Config state (keep in localStorage - not business data)
  const [historicalSales] = usePersistentState<HistoricalSale[]>('historicalSales', mockHistoricalSales);
  const [watchlist] = usePersistentState<WatchlistItem[]>('watchlist', mockWatchlist);
  const [aiConfig, setAiConfig] = usePersistentState<AiConfig>('aiConfig', defaultAiConfig);
  const [aiSettings, setAiSettings] = usePersistentState<AiSettings>('aiSettings', getDefaultAiSettings());
  const [artworkFolders, setArtworkFolders] = usePersistentState<ArtworkFolder[]>('artworkFolders', mockArtworkFolders);
  
  const {
    isOpen: isAiAssistantOpen,
    open: openAiAssistant,
    close: closeAiAssistant,
  } = useModalState();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = usePersistentState<boolean>('sidebarCollapsed', false);
  const [currentPage, setCurrentPage] = usePersistentState<Page>('currentPage', 'Dashboard');
  const [toasts, setToasts] = useState<ToastInfo[]>([]);
  const [gmailConnection, setGmailConnection] = usePersistentState<GmailConnection>('gmailConnection', { isConnected: false, email: null });
  const [apiKey, setApiKey] = usePersistentState<string | null>('apiKey', null);
  const [externalConnections, setExternalConnections] = usePersistentState<ExternalConnection[]>('externalConnections', []);
  const [artworkFilter, setArtworkFilter] = useState<string>('');
  const [hasInitialDataLoaded, setHasInitialDataLoaded] = useState(false);
  const users = userProfiles;

  const isDataLoading =
    inventoryLoading ||
    vendorsLoading ||
    bomsLoading ||
    posLoading ||
    buildOrdersLoading ||
    requisitionsLoading ||
    userProfilesLoading;

  useEffect(() => {
    if (!isDataLoading) {
      setHasInitialDataLoaded(true);
    }
  }, [isDataLoading]);

  // Lightweight URL-based routing for deep links
  useEffect(() => {
    try {
      const { pathname, search } = window.location;
      // Basic path-to-page mapping so tests can hit deep links like /vendors
      const params = new URLSearchParams(search);
      const path = pathname.replace(/\/$/, '');
      const map: Record<string, Page> = {
        '': 'Dashboard',
        '/': 'Dashboard',
        '/dashboard': 'Dashboard',
        '/inventory': 'Inventory',
        '/purchase-orders': 'Purchase Orders',
        '/purchaseorders': 'Purchase Orders',
        '/vendors': 'Vendors',
        '/production': 'Production',
        '/boms': 'BOMs',
        '/settings': 'Settings',
        '/api': 'API Documentation',
        '/artwork': 'Artwork',
        '/label-scanner': 'Label Scanner',
        '/labels': 'Label Scanner',
      };
      const nextPage = map[path] ?? 'Dashboard';
      if (nextPage !== currentPage) {
        setCurrentPage(nextPage);
      }

      // Auto-sync now handled exclusively by backend cron + Edge functions.
      // Frontend simply consumes fresh Supabase data.
    } catch (err) {
      // No-op: best-effort only for e2e/dev
      console.warn('[App] URL routing init skipped:', err);
    }
  }, [currentUser, setCurrentPage]);


  const addToast = (message: string, type: ToastInfo['type'] = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const handleLogout = async () => {
    addToast(`Goodbye, ${currentUser?.name ?? 'MuRP user'}.`, 'info');
    await authSignOut();
  };
  
  const generateOrderId = () => {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const randomPart = Math.floor(100 + Math.random() * 900);
    return `PO-${datePart}-${randomPart}`;
  };

  const handleCreatePo = async (poDetails: CreatePurchaseOrderInput) => {
    const { vendorId, items, expectedDate, notes, requisitionIds } = poDetails;
    const vendor = vendors.find(v => v.id === vendorId);
    if (!vendor) {
      addToast("Failed to create PO: Vendor not found.", "error");
      return;
    }

    const normalizedItems = items.map(item => ({
      sku: item.sku,
      description: item.name,
      quantity: item.quantity,
      unitCost: item.unitCost ?? 0,
    }));

    const total = normalizedItems.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    const orderId = generateOrderId();

    // 🔥 Save to Supabase
    const result = await createPurchaseOrder({
      orderId,
      vendorId,
      supplier: vendor.name,
      status: 'draft',
      orderDate: new Date().toISOString().split('T')[0],
      estimatedReceiveDate: expectedDate,
      total,
      vendorNotes: notes,
      requisitionIds,
      items: normalizedItems,
    });
    if (!result.success) {
      addToast(`Failed to create PO: ${result.error}`, 'error');
      return;
    }

    // Update inventory on_order quantities
    const inventoryUpdates = items.map(item => ({
      sku: item.sku,
      stockDelta: 0,
      onOrderDelta: item.quantity,
    }));
    await batchUpdateInventory(inventoryUpdates);
    
    // Update requisitions if linked
    if (requisitionIds && requisitionIds.length > 0) {
      await updateMultipleRequisitions(requisitionIds, 'Fulfilled');
    }

    // Refetch data to get real-time updates
    refetchPOs();
    refetchInventory();
    refetchRequisitions();

    addToast(`Successfully created ${orderId} for ${vendor.name}.`, 'success');
    setCurrentPage('Purchase Orders');
  };

  const handleGeneratePosFromRequisitions = (
    posToCreate: { vendorId: string; items: { sku: string; name: string; quantity: number; unitCost: number; }[]; requisitionIds: string[]; }[]
  ) => {
    posToCreate.forEach(poData => {
        handleCreatePo(poData);
    });
    addToast(`Generated ${posToCreate.length} new Purchase Orders from requisitions.`, 'success');
  };


  const handleCreateBuildOrder = async (
    sku: string, 
    name: string, 
    quantity: number, 
    scheduledDate?: string, 
    dueDate?: string
  ) => {
    const newBuildOrder: BuildOrder = {
      id: `BO-${new Date().getFullYear()}-${(buildOrders.length + 1).toString().padStart(3, '0')}`,
      finishedSku: sku,
      name,
      quantity,
      status: 'Pending',
      createdAt: new Date().toISOString(),
      scheduledDate,
      dueDate,
      estimatedDurationHours: 2, // Default 2 hours
    };

    // 🔥 Save to Supabase
    const result = await createBuildOrder(newBuildOrder);
    if (!result.success) {
      addToast(`Failed to create Build Order: ${result.error}`, 'error');
      return;
    }

    refetchBuildOrders();
    addToast(`Successfully created Build Order ${newBuildOrder.id} for ${quantity}x ${name}.`, 'success');
    setCurrentPage('Production');
  };

  const handleUpdateBuildOrder = async (buildOrder: BuildOrder) => {
    const result = await updateBuildOrder(buildOrder);
    if (!result.success) {
      addToast(`Failed to update build order: ${result.error}`, 'error');
      return;
    }

    refetchBuildOrders();
    addToast(`Build order ${buildOrder.id} updated successfully.`, 'success');
  };

  const handleCompleteBuildOrder = async (buildOrderId: string) => {
    const order = buildOrders.find(bo => bo.id === buildOrderId);
    if (!order || order.status === 'Completed') {
      return;
    }

    const bom = boms.find(b => b.finishedSku === order.finishedSku);
    if (!bom) {
      addToast(`Could not complete ${order.id}: BOM not found.`, 'error');
      return;
    }

    // 🔥 Update build order status in Supabase
    const result = await updateBuildOrderStatus(buildOrderId, 'Completed');
    if (!result.success) {
      addToast(`Failed to complete build order: ${result.error}`, 'error');
      return;
    }

    // Update inventory: deduct components, add finished goods
    const inventoryUpdates = bom.components.map(component => ({
      sku: component.sku,
      stockDelta: -(component.quantity * order.quantity),
      onOrderDelta: 0,
    }));

    // Check if finished good exists, if not create it
    const finishedGood = inventory.find(item => item.sku === order.finishedSku);
    if (!finishedGood) {
      await createInventoryItem({
        sku: order.finishedSku,
        name: order.name,
        category: 'Finished Goods',
        stock: order.quantity,
        onOrder: 0,
        reorderPoint: 0,
        vendorId: 'N/A',
        moq: 1,
      });
    } else {
      inventoryUpdates.push({
        sku: order.finishedSku,
        stockDelta: order.quantity,
        onOrderDelta: 0,
      });
    }

    await batchUpdateInventory(inventoryUpdates);

    // Refetch data
    refetchBuildOrders();
    refetchInventory();

    addToast(`${order.id} marked as completed. Inventory updated.`, 'success');
  };

  const handleUpdateBom = async (updatedBom: BillOfMaterials) => {
    // 🔥 Update in Supabase
    const result = await updateBOM(updatedBom);
    if (!result.success) {
      addToast(`Failed to update BOM: ${result.error}`, 'error');
      return;
    }

    refetchBOMs();
    addToast(`Successfully updated BOM for ${updatedBom.name}.`, 'success');
  };

  const handleAddArtworkToBom = async (finishedSku: string, fileName: string) => {
    const bom = boms.find(b => b.finishedSku === finishedSku);
    if (!bom) {
      addToast(`Could not add artwork: BOM with SKU ${finishedSku} not found.`, 'error');
      return;
    }

    const highestRevision = bom.artwork.reduce((max, art) => Math.max(max, art.revision), 0);

    const newArtwork: Artwork = {
      id: `art-${Date.now()}`,
      fileName,
      revision: highestRevision + 1,
      url: `/art/${fileName.replace(/\s+/g, '-').toLowerCase()}-v${highestRevision + 1}.pdf`, // Mock URL
      verified: false,
      fileType: 'artwork',
      uploadedBy: currentUser?.id,
      uploadedAt: new Date().toISOString(),
    };
    
    const updatedBom = {
      ...bom,
      artwork: [...bom.artwork, newArtwork],
    };

    // 🔥 Update in Supabase
    const result = await updateBOM(updatedBom);
    if (!result.success) {
      addToast(`Failed to add artwork: ${result.error}`, 'error');
      return;
    }

    refetchBOMs();
    addToast(`Added artwork '${fileName}' (Rev ${newArtwork.revision}) to ${bom.name}.`, 'success');
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

    const itemsByVendor = new Map<string, { sku: string; name: string; quantity: number; unitCost: number }[]>();

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
                    vendorItems.push({ sku: pc.sku, name: pc.name, quantity: 1, unitCost: pc.unitCost ?? 0 });
                }
                itemsByVendor.set(pc.vendorId, vendorItems);
            });
        }
    });

    const posToCreate: { vendorId: string; items: { sku: string; name: string; quantity: number; unitCost: number }[] }[] = [];
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

  const handleUpdateArtwork = async (artworkId: string, bomId: string, updates: Partial<Artwork>) => {
    const bom = boms.find(b => b.id === bomId);
    if (!bom) {
      addToast('BOM not found.', 'error');
      return;
    }

    const artworkIndex = bom.artwork.findIndex(a => a.id === artworkId);
    if (artworkIndex === -1) {
      addToast('Artwork not found.', 'error');
      return;
    }

    const updatedArtwork = [...bom.artwork];
    updatedArtwork[artworkIndex] = {
      ...updatedArtwork[artworkIndex],
      ...updates,
    };

    const updatedBom = {
      ...bom,
      artwork: updatedArtwork,
    };

    // 🔥 Update in Supabase
    const result = await updateBOM(updatedBom);
    if (!result.success) {
      addToast(`Failed to update artwork: ${result.error}`, 'error');
      return;
    }

    refetchBOMs();
    addToast('Artwork updated.', 'success');
  };
  
  const handleCreateArtworkFolder = (name: string) => {
    const newFolder: ArtworkFolder = { id: `folder-${Date.now()}`, name };
    setArtworkFolders(prev => [...prev, newFolder]);
    addToast(`Folder "${name}" created successfully.`, 'success');
  };

  const handleCreateRequisition = async (items: RequisitionItem[], source: 'Manual' | 'System' = 'Manual') => {
    const newReq: InternalRequisition = {
      id: `REQ-${new Date().getFullYear()}-${(requisitions.length + 1).toString().padStart(3, '0')}`,
      requesterId: source === 'Manual' ? currentUser!.id : 'SYSTEM',
      department: source === 'Manual' ? currentUser!.department : 'Purchasing',
      createdAt: new Date().toISOString(),
      status: 'Pending',
      source,
      items,
    };

    // 🔥 Save to Supabase
    const result = await createRequisition(newReq);
    if (!result.success) {
      addToast(`Failed to create requisition: ${result.error}`, 'error');
      return;
    }

    refetchRequisitions();
    
    if (source === 'System') {
      addToast(`⚡ AI-Generated Requisition ${newReq.id} created! Auto-generated based on demand forecast. Pending approval.`, 'success');
    } else {
      addToast(`Requisition ${newReq.id} submitted for approval.`, 'success');
    }
  };

  const handleApproveRequisition = async (reqId: string) => {
    const req = requisitions.find(r => r.id === reqId);
    if (!req || !currentUser) return;

    if (currentUser.role === 'Admin' || (currentUser.role === 'Manager' && currentUser.department === req.department)) {
        const result = await updateRequisitionStatus(reqId, 'Approved');
        if (!result.success) {
          addToast(`Failed to approve requisition: ${result.error}`, 'error');
          return;
        }
        refetchRequisitions();
        addToast(`Requisition ${reqId} approved.`, 'success');
    } else {
        addToast('You do not have permission to approve this requisition.', 'error');
    }
  };

  const handleRejectRequisition = async (reqId: string) => {
    const req = requisitions.find(r => r.id === reqId);
    if (!req || !currentUser) return;

    if (currentUser.role === 'Admin' || (currentUser.role === 'Manager' && currentUser.department === req.department)) {
        const result = await updateRequisitionStatus(reqId, 'Rejected');
        if (!result.success) {
          addToast(`Failed to reject requisition: ${result.error}`, 'error');
          return;
        }
        refetchRequisitions();
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

  const handleUpdateAiSettings = (settings: AiSettings) => {
    setAiSettings(settings);
    addToast('AI settings updated successfully.', 'success');
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
  
  const handleInviteUser = async (email: string, role: User['role'], department: User['department']) => {
    try {
      const { error } = await supabase.functions.invoke('admin-invite', {
        body: { email, role, department },
      });
      if (error) throw error;
      addToast(`Invite sent to ${email}.`, 'success');
      await refetchUserProfiles();
    } catch (error: any) {
      console.error('[Users] invite error', error);
      addToast(error.message ?? 'Failed to send invite.', 'error');
    }
  };

  const handleUpdateUser = async (updatedUser: User) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          full_name: updatedUser.name,
          role: updatedUser.role,
          department: updatedUser.department,
          onboarding_complete: updatedUser.onboardingComplete ?? false,
          agreements: updatedUser.agreements ?? {},
          is_active: true,
        })
        .eq('id', updatedUser.id);
      if (error) throw error;
      addToast(`User ${updatedUser.name} has been updated.`, 'success');
      await refetchUserProfiles();
    } catch (error: any) {
      console.error('[Users] update error', error);
      addToast(error.message ?? 'Failed to update user.', 'error');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ is_active: false })
        .eq('id', userId);
      if (error) throw error;
      addToast('User has been deactivated.', 'info');
      await refetchUserProfiles();
    } catch (error: any) {
      console.error('[Users] delete error', error);
      addToast(error.message ?? 'Failed to deactivate user.', 'error');
    }
  };

  const handleCompleteOnboarding = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ onboarding_complete: true })
        .eq('id', userId);
      if (error) throw error;
      await refreshProfile();
      addToast('Welcome aboard! Your account is now active.', 'success');
      await refetchUserProfiles();
    } catch (error: any) {
      console.error('[Users] onboarding error', error);
      addToast(error.message ?? 'Failed to finalize onboarding.', 'error');
    }
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
    if (!currentUser || !permissions.canManagePurchaseOrders) return [];
    if (currentUser.role === 'Admin') {
        return requisitions.filter(r => r.status === 'Approved');
    }
    if (currentUser.role === 'Manager') {
        return requisitions.filter(r => r.status === 'Approved' && r.department === currentUser.department);
    }
    return [];
  }, [requisitions, currentUser, permissions.canManagePurchaseOrders]);

  const navigateToArtwork = (filter: string) => {
    setArtworkFilter(filter);
    setCurrentPage('Artwork');
  };

  const handleNavigateToInventory = (sku: string) => {
    localStorage.setItem('selectedInventorySku', sku);
    setCurrentPage('Inventory');
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
        return <Inventory 
          inventory={inventory} 
          vendors={vendors} 
          boms={boms}
          onNavigateToBom={(bomSku) => {
            setCurrentPage('BOMs');
            if (bomSku) {
              localStorage.setItem('selectedBomSku', bomSku);
            } else {
              localStorage.removeItem('selectedBomSku');
            }
          }}
        />;
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
      case 'Stock Intelligence':
        return <StockIntelligence 
          inventory={inventory}
          vendors={vendors}
          purchaseOrders={purchaseOrders}
        />;
      case 'Production':
        return <Production 
          buildOrders={buildOrders} 
          boms={boms}
          inventory={inventory}
          vendors={vendors}
          onCompleteBuildOrder={handleCompleteBuildOrder} 
          onCreateBuildOrder={handleCreateBuildOrder}
          onUpdateBuildOrder={handleUpdateBuildOrder}
          addToast={addToast}
        />;
      case 'BOMs':
        return <BOMs
          boms={boms}
          inventory={inventory}
          currentUser={currentUser}
          watchlist={watchlist}
          onUpdateBom={handleUpdateBom}
          onNavigateToArtwork={navigateToArtwork}
          onNavigateToInventory={handleNavigateToInventory}
          onUploadArtwork={handleAddArtworkToBom}
          onCreateRequisition={(items) => handleCreateRequisition(items, 'Manual')}
        />;
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
            currentUser={currentUser}
        />;
      case 'API Documentation':
          return <ApiDocs />;
      case 'Label Scanner':
        return <ManualLabelScanner
          boms={boms}
          currentUser={currentUser}
        />;
      case 'Settings':
        return <Settings
            currentUser={currentUser}
            aiConfig={aiConfig}
            setAiConfig={setAiConfig}
            aiSettings={aiSettings}
            onUpdateAiSettings={handleUpdateAiSettings}
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
            inventory={inventory}
            boms={boms}
            vendors={vendors}
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

  // Handle auth routes (email confirmation, password reset) before auth checks
  const currentPath = window.location.pathname;
  if (currentPath === '/auth/callback') {
    return (
      <>
        <AuthCallback addToast={addToast} />
        <div className="fixed top-20 right-4 z-[60] w-full max-w-sm">
          {toasts.map(toast => (
            <Toast key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />
          ))}
        </div>
      </>
    );
  }

  if (currentPath === '/reset-password') {
    return (
      <>
        <ResetPassword addToast={addToast} />
        <div className="fixed top-20 right-4 z-[60] w-full max-w-sm">
          {toasts.map(toast => (
            <Toast key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />
          ))}
        </div>
      </>
    );
  }

  if (authLoading) {
    return <LoadingOverlay />;
  }

  if (!currentUser) {
    return (
      <>
        <LoginScreen addToast={addToast} />
        <div className="fixed top-20 right-4 z-[60] w-full max-w-sm">
          {toasts.map(toast => (
            <Toast key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />
          ))}
        </div>
      </>
    );
  }

  if (!currentUser.onboardingComplete) {
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
        onOpenAiAssistant={openAiAssistant}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          currentUser={currentUser}
          onLogout={handleLogout}
          isGlobalLoading={isDataLoading}
          showLogo={isSidebarCollapsed}
          devModeActive={permissions.isGodMode}
        />
        
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-900 p-4 sm:p-6 lg:p-8">
          <ErrorBoundary
            key={currentPage}
            fallback={(
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-6 text-red-100">
                <h2 className="text-lg font-semibold">We hit a snag loading this page.</h2>
                <p className="mt-2 text-sm text-red-100/80">Try navigating to a different section or refreshing the browser.</p>
              </div>
            )}
          >
            {renderPage()}
          </ErrorBoundary>
        </main>
      </div>

      <div className="fixed top-20 right-4 z-[60] w-full max-w-sm">
        {toasts.map(toast => (
          <Toast key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
      
      <AiAssistant
        isOpen={isAiAssistantOpen}
        onClose={closeAiAssistant}
        boms={boms}
        inventory={inventory}
        vendors={vendors}
        purchaseOrders={purchaseOrders}
        aiConfig={aiConfig}
        aiSettings={aiSettings}
        onUpdateAiSettings={handleUpdateAiSettings}
      />

      {!hasInitialDataLoaded && <LoadingOverlay />}
    </div>
  );
};

export default App;
