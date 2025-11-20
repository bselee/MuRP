


import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
import { getGoogleAuthService } from './services/googleAuthService';
import { getGoogleGmailService } from './services/googleGmailService';
import { GOOGLE_SCOPES } from './lib/google/scopes';
import LoadingOverlay from './components/LoadingOverlay';
import { supabase } from './lib/supabase/client';
import { useAuth } from './lib/auth/AuthContext';
import { enqueuePoDrafts } from './lib/poDraftBridge';
import { usePermissions } from './hooks/usePermissions';
import {
  SystemAlertProvider,
  useSystemAlerts,
} from './lib/systemAlerts/SystemAlertContext';
import type { SyncHealthRow } from './lib/sync/healthUtils';

export type Page = 'Dashboard' | 'Inventory' | 'Purchase Orders' | 'Vendors' | 'Production' | 'BOMs' | 'Stock Intelligence' | 'Settings' | 'API Documentation' | 'Artwork' | 'Label Scanner';

export type ToastInfo = {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
};

const AppShell: React.FC = () => {
  const { user: currentUser, loading: authLoading, signOut: authSignOut, refreshProfile } = useAuth();
  const permissions = usePermissions();
  const {
    alerts: systemAlerts,
    upsertAlert,
    resolveAlert,
    dismissAlert,
  } = useSystemAlerts();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

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
  const googleAuthService = useMemo(() => getGoogleAuthService(), []);
  const gmailService = useMemo(() => getGoogleGmailService(), []);

  const refreshGmailConnection = useCallback(async () => {
    try {
      const status = await googleAuthService.getAuthStatus();
      const hasGmailScope = status.scopes?.includes(GOOGLE_SCOPES.GMAIL_SEND);

      if (status.isAuthenticated && status.hasValidToken && hasGmailScope) {
        const profile = await gmailService.getProfile();
        setGmailConnection({
          isConnected: true,
          email: profile.emailAddress || status.email || null,
        });
      } else {
        setGmailConnection({ isConnected: false, email: null });
      }
    } catch (error) {
      console.error('[App] Failed to refresh Gmail connection:', error);
      setGmailConnection({ isConnected: false, email: null });
    }
  }, [googleAuthService, gmailService, setGmailConnection]);

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

  useEffect(() => {
    if (!currentUser) {
      resolveAlert('sync:inventory');
      resolveAlert('sync:vendors');
      resolveAlert('sync:boms');
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const sources = ['inventory', 'vendors', 'boms'] as const;

    const evaluateRows = (rows: SyncHealthRow[] | null) => {
      (rows || []).forEach((row) => {
        const sourceKey = `sync:${row.data_type}`;
        if (row.last_sync_time && row.success === false) {
          upsertAlert({
            source: sourceKey,
            message: `Unable to reach Finale ${row.data_type} report. Last attempt ${new Date(row.last_sync_time).toLocaleTimeString()}.`,
          });
        } else if (sources.some((source) => `sync:${source}` === sourceKey)) {
          resolveAlert(sourceKey);
        }
      });
    };

    const fetchHealth = async () => {
      try {
        const { data, error } = await supabase.rpc<SyncHealthRow[]>('get_sync_health');
        if (error) throw error;
        evaluateRows(data || []);
      } catch (error) {
        console.error('[App] Failed to refresh sync health alerts:', error);
      }
    };

    fetchHealth();
    const intervalId = window.setInterval(fetchHealth, 60000);
    const channel = supabase
      .channel('system_alert_sync_metadata')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sync_metadata',
        },
        () => {
          fetchHealth();
        },
      )
      .subscribe();

    return () => {
      window.clearInterval(intervalId);
      channel.unsubscribe();
    };
  }, [currentUser, resolveAlert, upsertAlert]);

  useEffect(() => {
    if (currentUser) {
      refreshGmailConnection();
    } else {
      setGmailConnection({ isConnected: false, email: null });
    }
    // We intentionally exclude setGmailConnection from deps to avoid unnecessary re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, refreshGmailConnection]);

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

  // Auto-complete onboarding for users who confirmed email (preventing flash of setup screen)
  useEffect(() => {
    const autoCompleteOnboarding = async () => {
      if (!currentUser || currentUser.onboardingComplete) {
        setCheckingOnboarding(false);
        return;
      }

      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        
        // If email is confirmed, user already set password during signup
        if (authUser?.email_confirmed_at) {
          await supabase
            .from('user_profiles')
            .update({ onboarding_complete: true })
            .eq('id', currentUser.id);
          
          await refreshProfile();
        }
      } catch (err) {
        console.error('[App] Error auto-completing onboarding:', err);
      } finally {
        setCheckingOnboarding(false);
      }
    };

    autoCompleteOnboarding();
  }, [currentUser, refreshProfile]);

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
    const { vendorId, items, expectedDate, notes, requisitionIds, trackingNumber, trackingCarrier } = poDetails;
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
      trackingNumber,
      trackingCarrier,
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

    if (!posToCreate.length) {
      addToast('No packaging components found for the selected artwork.', 'info');
      return;
    }

    const drafts = posToCreate
      .filter(po => po.items.length > 0 && po.vendorId)
      .map(po => ({
        vendorId: po.vendorId,
        vendorLocked: true,
        items: po.items,
        sourceLabel: `Artwork packaging (${po.items.length} item${po.items.length === 1 ? '' : 's'})`,
        notes: 'Generated from artwork selection',
      }));

    if (!drafts.length) {
      addToast('Unable to map packaging to vendors for the selected artwork.', 'error');
      return;
    }

    enqueuePoDrafts(drafts);
    addToast(`Loaded ${drafts.length} draft PO${drafts.length === 1 ? '' : 's'} for review.`, 'success');
    setCurrentPage('Purchase Orders');
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

  const queueShortagesForBuild = useCallback(async (buildOrder: BuildOrder) => {
    const LEAD_WINDOW_DAYS = 21;
    const SUGGESTION_BUFFER_DAYS = 5;

    const getDailyDemand = (item?: InventoryItem | null) => {
      if (!item) return 0;
      if (item.salesVelocity && item.salesVelocity > 0) return item.salesVelocity;
      if (item.sales90Days && item.sales90Days > 0) return item.sales90Days / 90;
      if (item.sales30Days && item.sales30Days > 0) return item.sales30Days / 30;
      return 0;
    };

    const upsertQueueEntry = async (
      sku: string,
      payload: Record<string, any>,
      quantity: number,
      options?: { allowUpdate?: boolean }
    ) => {
      const { data: existing } = await supabase
        .from('reorder_queue')
        .select('id,recommended_quantity')
        .eq('inventory_sku', sku)
        .in('status', ['pending', 'po_created'])
        .maybeSingle();

      if (existing) {
        if (options?.allowUpdate === false) {
          return { inserted: false, updated: false, skipped: true };
        }
        const unitCost = quantity > 0 ? (payload.estimated_cost ?? 0) / quantity : 0;
        const { error } = await supabase
          .from('reorder_queue')
          .update({
            ...payload,
            recommended_quantity: existing.recommended_quantity + quantity,
            estimated_cost: unitCost
              ? unitCost * (existing.recommended_quantity + quantity)
              : payload.estimated_cost,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (error) throw error;
        return { inserted: false, updated: true, skipped: false };
      }

      const { error } = await supabase
        .from('reorder_queue')
        .insert({
          ...payload,
          recommended_quantity: quantity,
          status: 'pending',
        });
      if (error) throw error;
      return { inserted: true, updated: false, skipped: false };
    };

    const bom = bomMap.get(buildOrder.finishedSku);
    if (!bom || !bom.components?.length) {
      return;
    }

    const touchedSkus = new Set<string>();
    const vendorIdsToReview = new Set<string>();
    const shortages = bom.components
      .map(component => {
        const required = (component.quantity || 0) * buildOrder.quantity;
        if (!required) return null;
        const inventoryItem = inventoryMap.get(component.sku);
        const stock = inventoryItem?.stock ?? 0;
        const onOrder = inventoryItem?.onOrder ?? 0;
        const available = stock + onOrder;
        const dailyUsage = getDailyDemand(inventoryItem);
        const bufferDemand = Math.ceil(dailyUsage * LEAD_WINDOW_DAYS);
        const safety = inventoryItem?.safetyStock ?? 0;
        const coverageTarget = required + bufferDemand + safety;
        const coverageShortfall = Math.ceil(Math.max(0, coverageTarget - available));
        const requiredShortfall = Math.max(0, required - available);
        if (coverageShortfall <= 0 && requiredShortfall <= 0) return null;
        return { component, inventoryItem, coverageShortfall, requiredShortfall, required };
      })
      .filter((item): item is { component: BillOfMaterials['components'][number]; inventoryItem?: InventoryItem; coverageShortfall: number; requiredShortfall: number; required: number } => Boolean(item));

    if (!shortages.length) {
      return;
    }

    let queued = 0;
    let updated = 0;
    let suggested = 0;
    const requisitionItems: RequisitionItem[] = [];

    for (const shortage of shortages) {
      try {
        const inventoryItem = shortage.inventoryItem;
        const vendorId = inventoryItem?.vendorId || null;
        const vendorName = vendorId ? vendorMap.get(vendorId)?.name || 'Unknown Vendor' : null;
        const recommendedQuantity = Math.max(
          shortage.coverageShortfall > 0 ? shortage.coverageShortfall : shortage.requiredShortfall,
          inventoryItem?.moq || 1
        );

        touchedSkus.add(shortage.component.sku);
        if (vendorId) vendorIdsToReview.add(vendorId);

        const basePayload: Record<string, any> = {
          inventory_sku: shortage.component.sku,
          item_name: shortage.component.name || inventoryItem?.name || shortage.component.sku,
          vendor_id: vendorId,
          vendor_name: vendorName,
          current_stock: inventoryItem?.stock ?? 0,
          on_order: inventoryItem?.onOrder ?? 0,
          reorder_point: inventoryItem?.reorderPoint ?? 0,
          safety_stock: inventoryItem?.safetyStock ?? 0,
          moq: inventoryItem?.moq ?? 1,
          consumption_daily: getDailyDemand(inventoryItem),
          consumption_30day: inventoryItem?.sales30Days ?? null,
          consumption_90day: inventoryItem?.sales90Days ?? null,
          lead_time_days: vendorId ? vendorMap.get(vendorId)?.leadTimeDays ?? 14 : 14,
          days_until_stockout: null,
          urgency: 'critical',
          priority_score: 90,
          estimated_cost: (inventoryItem?.unitCost ?? 0) * recommendedQuantity,
          notes: `Triggered by build ${buildOrder.id} (${buildOrder.quantity} units scheduled)`,
          ai_recommendation: 'Auto-queued from production scheduling',
        };

        if (!vendorId) {
          requisitionItems.push({
            sku: shortage.component.sku,
            name: basePayload.item_name,
            quantity: recommendedQuantity,
            reason: `Missing vendor on file. Needed for build ${buildOrder.id}`,
          });
          continue;
        }

        const result = await upsertQueueEntry(shortage.component.sku, basePayload, recommendedQuantity);
        if (result.inserted) queued += 1;
        if (result.updated) updated += 1;
      } catch (error) {
        console.error('[BuildOrder] Failed to queue purchase need', error);
      }
    }

    for (const vendorId of vendorIdsToReview) {
      if (!vendorId) continue;
      const vendorItems = Array.from(inventoryMap.values()).filter(item => item.vendorId === vendorId);
      for (const item of vendorItems) {
        if (!item || touchedSkus.has(item.sku)) continue;
        const daily = getDailyDemand(item);
        const safety = item.safetyStock ?? 0;
        const reorderPoint = item.reorderPoint ?? 0;
        const coverageTarget = Math.ceil(daily * LEAD_WINDOW_DAYS + safety + reorderPoint);
        const available = (item.stock ?? 0) + (item.onOrder ?? 0);
        const shortfall = coverageTarget - available;
        const suggestionThreshold = Math.max(item.moq || 1, Math.ceil(daily * SUGGESTION_BUFFER_DAYS));
        const vendorName = vendorMap.get(vendorId)?.name || 'Unknown Vendor';

        if (shortfall > 0) {
          const result = await upsertQueueEntry(
            item.sku,
            {
              inventory_sku: item.sku,
              item_name: item.name,
              vendor_id: vendorId,
              vendor_name: vendorName,
              current_stock: item.stock ?? 0,
              on_order: item.onOrder ?? 0,
              reorder_point: item.reorderPoint ?? 0,
              safety_stock: item.safetyStock ?? 0,
              moq: item.moq ?? 1,
              consumption_daily: daily,
              consumption_30day: item.sales30Days ?? null,
              consumption_90day: item.sales90Days ?? null,
              lead_time_days: item.leadTimeDays ?? vendorMap.get(vendorId)?.leadTimeDays ?? 14,
              days_until_stockout: null,
              urgency: 'high',
              priority_score: 75,
              estimated_cost: (item.unitCost ?? 0) * Math.max(shortfall, item.moq || 1),
              notes: `Must-have add-on while ordering for build ${buildOrder.id}`,
              ai_recommendation: 'Auto-added due to lead window gap',
            },
            Math.max(shortfall, item.moq || 1),
          );
          if (result.inserted) queued += 1;
          if (result.updated) updated += 1;
          touchedSkus.add(item.sku);
        } else {
          const headroom = available - coverageTarget;
          if (headroom <= suggestionThreshold) {
            const result = await upsertQueueEntry(
              item.sku,
              {
                inventory_sku: item.sku,
                item_name: item.name,
                vendor_id: vendorId,
                vendor_name: vendorName,
                current_stock: item.stock ?? 0,
                on_order: item.onOrder ?? 0,
                reorder_point: item.reorderPoint ?? 0,
                safety_stock: item.safetyStock ?? 0,
                moq: item.moq ?? 1,
                consumption_daily: daily,
                consumption_30day: item.sales30Days ?? null,
                consumption_90day: item.sales90Days ?? null,
                lead_time_days: item.leadTimeDays ?? vendorMap.get(vendorId)?.leadTimeDays ?? 14,
                days_until_stockout: null,
                urgency: 'normal',
                priority_score: 55,
                estimated_cost: (item.unitCost ?? 0) * Math.max(item.moq || 1, Math.ceil(daily * LEAD_WINDOW_DAYS / 2)),
                notes: `Suggested add-on while ordering for build ${buildOrder.id}`,
                ai_recommendation: 'Suggested due to limited headroom',
              },
              Math.max(item.moq || 1, Math.ceil(daily * LEAD_WINDOW_DAYS / 2)),
              { allowUpdate: false },
            );
            if (!result.skipped && result.inserted) {
              suggested += 1;
              touchedSkus.add(item.sku);
            }
          }
        }
      }
    }

    if (queued || updated || suggested) {
      addToast(
        `Materials queued for purchasing (${queued} new, ${updated} updated${suggested ? `, ${suggested} suggested` : ''})`,
        'success'
      );
    }

    if (requisitionItems.length) {
      await handleCreateRequisition(requisitionItems, 'System');
    }
  }, [bomMap, inventoryMap, vendorMap, handleCreateRequisition, addToast]);

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
      estimatedDurationHours: 2,
    };

    const result = await createBuildOrder(newBuildOrder);
    if (!result.success) {
      addToast(`Failed to create Build Order: ${result.error}`, 'error');
      return;
    }

    await queueShortagesForBuild(newBuildOrder);
    refetchBuildOrders();
    addToast(`Successfully created Build Order ${newBuildOrder.id} for ${quantity}x ${name}.`, 'success');
    setCurrentPage('Production');
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

  const handleGmailConnect = async () => {
    try {
      await googleAuthService.startOAuthFlow();
      await refreshGmailConnection();
      addToast('Google Workspace account connected successfully!', 'success');
    } catch (error) {
      console.error('[App] Gmail connect error:', error);
      addToast(`Failed to connect Gmail: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

  const handleGmailDisconnect = async () => {
    try {
      await googleAuthService.revokeAccess();
      await refreshGmailConnection();
      addToast('Google Workspace account disconnected.', 'info');
    } catch (error) {
      console.error('[App] Gmail disconnect error:', error);
      addToast(`Failed to disconnect Gmail: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

  const handleSendPoEmail = (poId: string, sentViaGmail: boolean) => {
    if (sentViaGmail) {
      addToast(`Email for ${poId} sent via ${gmailConnection.email ?? 'Gmail'}.`, 'success');
    } else {
      addToast(`Simulated email send for ${poId}.`, 'info');
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

  const inventoryMap = useMemo(() => new Map(inventory.map(item => [item.sku, item])), [inventory]);
  const vendorMap = useMemo(() => new Map(vendors.map(vendor => [vendor.id, vendor])), [vendors]);
  const bomMap = useMemo(() => new Map(boms.map(bom => [bom.finishedSku, bom])), [boms]);

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
          onCreateBuildOrder={handleCreateBuildOrder}
          addToast={addToast}
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

  if (authLoading || checkingOnboarding) {
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
          systemAlerts={systemAlerts}
          onDismissAlert={dismissAlert}
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

const App: React.FC = () => (
  <SystemAlertProvider>
    <AppShell />
  </SystemAlertProvider>
);

export default App;
