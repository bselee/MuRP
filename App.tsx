


import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import AiAssistant from './components/AiAssistant';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
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
import InventoryIntelligence from './pages/InventoryIntelligence';
import ProjectsPage from './pages/ProjectsPage';
import LoginScreen from './pages/LoginScreen';
import Toast from './components/Toast';
import ApiDocs from './pages/ApiDocs';
import ArtworkPage from './pages/Artwork';
import EnhancedNewUserSetup from './pages/EnhancedNewUserSetup';
import ManualLabelScanner from './components/ManualLabelScanner';
import QuickRequestDrawer from './components/QuickRequestDrawer';
import FeatureSpotlightReminder from './components/FeatureSpotlightReminder';
import OnboardingChecklist from './components/OnboardingChecklist';
import LoadingOverlay from './components/LoadingOverlay';
import ProductPage from './pages/ProductPage';
// import BuildBlockerModal from './components/BuildBlockerModal';
import { supabase } from './lib/supabase/client';
import { ThemeProvider, useTheme } from './components/ThemeProvider';
import { UserPreferencesProvider } from './components/UserPreferencesProvider';
import { useAuth } from './lib/auth/AuthContext';
import AuthCallback from './pages/AuthCallback';
import ResetPassword from './pages/ResetPassword';
import usePersistentState from './hooks/usePersistentState';
import useModalState from './hooks/useModalState';
import { usePermissions } from './hooks/usePermissions';
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
  updatePurchaseOrderStatus,
  approveBomRevision,
  revertBomToRevision,
  appendPurchaseOrderNote,
} from './hooks/useSupabaseMutations';
import { checkBuildBlockers } from './services/approvalService';
import {
    mockHistoricalSales,
    mockWatchlist,
    defaultAiConfig,
    mockArtworkFolders,
    mockVendors,
    mockInventory,
    mockBOMs,
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
    POTrackingStatus,
    RequisitionRequestOptions,
    QuickRequestDefaults,
    BomRevisionRequestOptions,
    GuidedLaunchState,
    ArtworkShareEvent,
    CompanyEmailSettings,
} from './types';
import { getDefaultAiSettings } from './services/tokenCounter';
import { getGoogleAuthService } from './services/googleAuthService';
import { getGoogleGmailService } from './services/googleGmailService';
import { GOOGLE_SCOPES } from './lib/google/scopes';
import { ShipmentAlertBanner } from './components/ShipmentAlertBanner';
import { ShipmentReviewModal } from './components/ShipmentReviewModal';
import { isE2ETesting } from './lib/auth/guards';
import {
  SystemAlertProvider,
  useSystemAlerts,
} from './lib/systemAlerts/SystemAlertContext';
import type { SyncHealthRow } from './lib/sync/healthUtils';
import { extractAmazonMetadata, DEFAULT_AMAZON_TRACKING_EMAIL } from './lib/amazonTracking';
import { enqueuePoDrafts } from './lib/poDraftBridge';

export type ToastInfo = {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
};

const CHECKLIST_DISMISS_SNOOZE_MS = 6 * 60 * 60 * 1000; // 6 hours

const AppShell: React.FC = () => {
  const { user: currentUser, loading: authLoading, signOut: authSignOut, refreshProfile } = useAuth();
  const permissions = usePermissions();
  const { resolvedTheme } = useTheme();
  const {
    alerts: systemAlerts,
    upsertAlert,
    resolveAlert,
    dismissAlert,
  } = useSystemAlerts();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  // 🔥 LIVE DATA FROM SUPABASE (Real-time subscriptions enabled)
  const { data: inventoryData, loading: inventoryLoading, error: inventoryError, refetch: refetchInventory } = useSupabaseInventory();
  const { data: vendorsData, loading: vendorsLoading, error: vendorsError, refetch: refetchVendors } = useSupabaseVendors();
  const { data: bomsData, loading: bomsLoading, error: bomsError, refetch: refetchBOMs } = useSupabaseBOMs();
  const { data: purchaseOrdersData, loading: posLoading, error: posError, refetch: refetchPOs } = useSupabasePurchaseOrders();
  const { data: buildOrders, loading: buildOrdersLoading, error: buildOrdersError, refetch: refetchBuildOrders } = useSupabaseBuildOrders();
  const { data: requisitions, loading: requisitionsLoading, error: requisitionsError, refetch: refetchRequisitions } = useSupabaseRequisitions();
  const { data: userProfiles, loading: userProfilesLoading, refetch: refetchUserProfiles } = useSupabaseUserProfiles();

  // UI/Config state (keep in localStorage - not business data)
  const [historicalSales] = usePersistentState<HistoricalSale[]>('historicalSales', mockHistoricalSales);
  const [watchlist] = usePersistentState<WatchlistItem[]>('watchlist', mockWatchlist);
  const [aiConfig, setAiConfig] = usePersistentState<AiConfig>('aiConfig', defaultAiConfig);
  const [aiSettings, setAiSettings] = usePersistentState<AiSettings>('aiSettings', getDefaultAiSettings());
  const [artworkFolders, setArtworkFolders] = usePersistentState<ArtworkFolder[]>('artworkFolders', []);
  const [artworkShareHistory, setArtworkShareHistory] = usePersistentState<ArtworkShareEvent[]>('artworkShareHistory', []);
  const [companyEmailSettings, setCompanyEmailSettings] = usePersistentState<CompanyEmailSettings>('companyEmailSettings', {
    fromAddress: '',
    enforceCompanySender: false,
    provider: 'resend',
    workspaceMailbox: undefined,
  });
  
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
  const isE2ETestMode = isE2ETesting();
  const [hasInitialDataLoaded, setHasInitialDataLoaded] = useState(isE2ETestMode);
  const trackingSignalRef = useRef<Map<string, { status?: POTrackingStatus | null; invoiceNotified?: boolean }>>(new Map());
  const notificationsPrimedRef = useRef(false);
  const [isQuickRequestOpen, setIsQuickRequestOpen] = useState(false);
  const [quickRequestDefaults, setQuickRequestDefaults] = useState<QuickRequestDefaults | null>(null);
  const [showOnboardingChecklist, setShowOnboardingChecklist] = useState(false);
  const [guidedLaunchState, setGuidedLaunchState] = useState<GuidedLaunchState | null>(null);
  const [isShipmentReviewModalOpen, setIsShipmentReviewModalOpen] = useState(false);
  const [shipmentReviewPoId, setShipmentReviewPoId] = useState<string | null>(null);
  
  // Build blocker state
  const [showBuildBlockerModal, setShowBuildBlockerModal] = useState(false);
  const [pendingBuildBlockReason, setPendingBuildBlockReason] = useState<any>(null);
  const [pendingBuildOrder, setPendingBuildOrder] = useState<any>(null);
  
  const navigateToPage = useCallback((nextPage: Page) => {
    setCurrentPage(nextPage);

    // Update browser URL to match the page change, preserving query parameters
    const pageToPath: Record<Page, string> = {
      'Dashboard': '/',
      'Inventory': '/inventory',
      'Purchase Orders': '/purchase-orders',
      'Vendors': '/vendors',
      'Production': '/production',
      'BOMs': '/boms',
      'Stock Intelligence': '/stock-intelligence',
      'Settings': '/settings',
      'API Documentation': '/api',
      'Artwork': '/artwork',
      'Projects': '/projects',
      'Label Scanner': '/label-scanner',
      'Product Page': '/product',
    };

    const path = pageToPath[nextPage] || '/';
    if (typeof window !== 'undefined' && window.history) {
      const currentSearch = window.location.search;
      window.history.pushState({ page: nextPage }, '', path + currentSearch);
    }
  }, [setCurrentPage]);

  const handleRecordArtworkShare = useCallback(
    (event: ArtworkShareEvent) => {
      setArtworkShareHistory(prev => {
        const next = [event, ...prev];
        return next.length > 200 ? next.slice(0, 200) : next;
      });
    },
    [setArtworkShareHistory],
  );

  const users = userProfiles;
  const googleAuthService = useMemo(() => getGoogleAuthService(), []);
  const gmailService = useMemo(() => getGoogleGmailService(), []);
  const inventory = useMemo(() => (isE2ETestMode ? mockInventory : inventoryData) ?? [], [isE2ETestMode, inventoryData]);
  const boms = useMemo(() => (isE2ETestMode ? mockBOMs : bomsData) ?? [], [isE2ETestMode, bomsData]);
  const purchaseOrders = useMemo(() => purchaseOrdersData ?? [], [purchaseOrdersData]);
  const vendors = isE2ETestMode ? mockVendors : vendorsData;
  const inventoryMap = useMemo(() => new Map((inventory || []).map(item => [item.sku, item])), [inventory]);
  const vendorMap = useMemo(() => new Map((vendors || []).map(vendor => [vendor.id, vendor])), [vendors]);
  const bomMap = useMemo(() => new Map((boms || []).map(bom => [bom.finishedSku, bom])), [boms]);
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

  useEffect(() => {
    if (!isE2ETestMode || typeof window === 'undefined') return;
    (window as any).__murpE2E = { boms: boms.length, inventory: inventory.length };
  }, [isE2ETestMode, boms.length, inventory.length]);

  const effectiveVendorsLoading = isE2ETestMode ? false : vendorsLoading;

  const isDataLoading =
    inventoryLoading ||
    effectiveVendorsLoading ||
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

  // Initialize Finale auto-sync if credentials are configured
  useEffect(() => {
    // Import and initialize auto-sync
    import('./services/finaleAutoSync').then(({ initializeFinaleAutoSync }) => {
      initializeFinaleAutoSync();
    }).catch(error => {
      console.error('[App] Failed to load Finale auto-sync:', error);
    });

    // Cleanup on unmount
    return () => {
      import('./services/finaleAutoSync').then(({ stopFinaleAutoSync }) => {
        stopFinaleAutoSync();
      }).catch(() => {});
    };
  }, []); // Run once on mount

  useEffect(() => {
    if (!currentUser?.guidedLaunchState) {
      setGuidedLaunchState(null);
      return;
    }
    setGuidedLaunchState(currentUser.guidedLaunchState);
  }, [currentUser?.guidedLaunchState]);

  const persistGuidedLaunchState = useCallback(
    async (update: Partial<GuidedLaunchState>) => {
      if (!currentUser?.id) return;

      const next: GuidedLaunchState = {
        completed: update.completed ?? guidedLaunchState?.completed ?? false,
        snoozeUntil: update.snoozeUntil ?? guidedLaunchState?.snoozeUntil ?? null,
        updatedAt: new Date().toISOString(),
      };

      setGuidedLaunchState(next);

      if (isE2ETestMode) {
        return;
      }

      try {
        const metadata = {
          ...(currentUser.metadata ?? {}),
          guided_launch: next,
        };

        await supabase
          .from('user_profiles')
          .update({ metadata })
          .eq('id', currentUser.id);
      } catch (error) {
        console.error('[App] Failed to persist guided launch state:', error);
      }
    },
    [currentUser, guidedLaunchState, isE2ETestMode],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!currentUser?.id || !currentUser.onboardingComplete || isE2ETestMode) {
      setShowOnboardingChecklist(false);
      return;
    }
    if (!guidedLaunchState) {
      setShowOnboardingChecklist(true);
      return;
    }
    if (guidedLaunchState.completed) {
      setShowOnboardingChecklist(false);
      return;
    }
    const snoozeUntil = guidedLaunchState.snoozeUntil ? new Date(guidedLaunchState.snoozeUntil).getTime() : null;
    if (snoozeUntil && snoozeUntil > Date.now()) {
      setShowOnboardingChecklist(false);
      return;
    }
    setShowOnboardingChecklist(true);
  }, [currentUser, guidedLaunchState, isE2ETestMode]);

  const handleChecklistComplete = useCallback(() => {
    persistGuidedLaunchState({ completed: true, snoozeUntil: null });
    setShowOnboardingChecklist(false);
  }, [persistGuidedLaunchState]);

  const handleChecklistSnooze = useCallback(
    (durationMs: number) => {
      persistGuidedLaunchState({
        completed: false,
        snoozeUntil: new Date(Date.now() + durationMs).toISOString(),
      });
      setShowOnboardingChecklist(false);
    },
    [persistGuidedLaunchState],
  );

  const handleChecklistDismiss = useCallback(() => {
    persistGuidedLaunchState({
      completed: false,
      snoozeUntil: new Date(Date.now() + CHECKLIST_DISMISS_SNOOZE_MS).toISOString(),
    });
    setShowOnboardingChecklist(false);
  }, [persistGuidedLaunchState]);

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

  // Initialize URL state on app load
  useEffect(() => {
    try {
      const { pathname, search } = window.location;
      const path = pathname.replace(/\/$/, '');
      const pathToPage: Record<string, Page> = {
        '': 'Dashboard',
        '/': 'Dashboard',
        '/dashboard': 'Dashboard',
        '/inventory': 'Inventory',
        '/purchase-orders': 'Purchase Orders',
        '/purchaseorders': 'Purchase Orders',
        '/vendors': 'Vendors',
        '/production': 'Production',
        '/boms': 'BOMs',
        '/stock-intelligence': 'Stock Intelligence',
        '/settings': 'Settings',
        '/api': 'API Documentation',
        '/artwork': 'Artwork',
        '/label-scanner': 'Label Scanner',
        '/labels': 'Label Scanner',
        '/projects': 'Projects',
        '/product': 'Product Page',
      };
      const initialPage = pathToPage[path] ?? 'Dashboard';
      setCurrentPage(initialPage);

      // Push initial state to history, preserving query parameters
      const pageToPath: Record<Page, string> = {
        'Dashboard': '/',
        'Inventory': '/inventory',
        'Purchase Orders': '/purchase-orders',
        'Vendors': '/vendors',
        'Production': '/production',
        'BOMs': '/boms',
        'Stock Intelligence': '/stock-intelligence',
        'Settings': '/settings',
        'API Documentation': '/api',
        'Artwork': '/artwork',
        'Projects': '/projects',
        'Label Scanner': '/label-scanner',
        'Product Page': '/product',
      };
      const initialPath = pageToPath[initialPage] || '/';
      window.history.replaceState({ page: initialPage }, '', initialPath + search);
    } catch (err) {
      // No-op: best-effort only for e2e/dev
      console.warn('[App] URL init skipped:', err);
    }
  }, [setCurrentPage]);

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

  const addToast = useCallback((message: string, type: ToastInfo['type'] = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isDataLoading || hasInitialDataLoaded) return;

    const timeoutId = window.setTimeout(() => {
      console.warn('[App] Initial data load timed out; releasing UI fallback.');
      setHasInitialDataLoaded(true);
      addToast('Still syncing live data. Showing last known values.', 'info');
    }, 12000);

    return () => window.clearTimeout(timeoutId);
  }, [isDataLoading, hasInitialDataLoaded, addToast]);

  useEffect(() => {
    if (!hasInitialDataLoaded) return;
    if (!purchaseOrders || purchaseOrders.length === 0) {
      resolveAlert('po:missing-details');
      return;
    }

    const now = Date.now();
    const staleOrders = purchaseOrders.filter(po => {
      const baseline = po.sentAt ?? po.orderDate ?? po.createdAt;
      if (!baseline) return false;
      const ageHours = (now - new Date(baseline).getTime()) / (1000 * 60 * 60);
      return (
        ageHours >= 48 &&
        (po.followUpRequired ?? true) &&
        !po.trackingNumber &&
        ['sent', 'pending', 'committed', 'confirmed'].includes(po.status)
      );
    });

    if (staleOrders.length > 0) {
      upsertAlert({
        source: 'po:missing-details',
        severity: 'warning',
        message: `${staleOrders.length} PO${staleOrders.length === 1 ? '' : 's'} still lack vendor tracking after 48h.`,
        details: staleOrders
          .slice(0, 3)
          .map(po => po.orderId ?? po.id)
          .join(', '),
      });
    } else {
      resolveAlert('po:missing-details');
    }

    purchaseOrders.forEach(po => {
      const entry = trackingSignalRef.current.get(po.id) ?? {};

      if (notificationsPrimedRef.current && po.trackingStatus && po.trackingStatus !== entry.status) {
        if (po.trackingStatus === 'shipped') {
          addToast(`PO ${po.orderId ?? po.id} shipped. Expect tracking soon.`, 'info');
        } else if (po.trackingStatus === 'delivered') {
          addToast(`PO ${po.orderId ?? po.id} delivered. Close the loop once inventory is received.`, 'success');
        }
      }

      if (po.trackingStatus) {
        entry.status = po.trackingStatus;
      }

      if (po.invoiceDetectedAt && !entry.invoiceNotified) {
        if (notificationsPrimedRef.current) {
          addToast(`Invoice captured for ${po.orderId ?? po.id}.`, 'success');
        }
        entry.invoiceNotified = true;
      }

      trackingSignalRef.current.set(po.id, entry);
    });

    notificationsPrimedRef.current = true;
  }, [purchaseOrders, hasInitialDataLoaded, upsertAlert, resolveAlert, addToast]);

  const openQuickRequestDrawer = useCallback((defaults?: QuickRequestDefaults) => {
    setQuickRequestDefaults(defaults ?? null);
    setIsQuickRequestOpen(true);
  }, []);

  const closeQuickRequestDrawer = useCallback(() => {
    setIsQuickRequestOpen(false);
  }, []);

  const handleLogout = async () => {
    addToast(`Goodbye, ${currentUser?.name ?? 'MuRP user'}.`, 'info');
    await authSignOut();
  };
  
  const generateOrderId = () => {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const randomSegment =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().split('-')[0].toUpperCase()
        : Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
    return `PO-${datePart}-${randomSegment}`;
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
    const inventoryResult = await batchUpdateInventory(inventoryUpdates);
    
    // Update requisitions if linked
    if (requisitionIds && requisitionIds.length > 0) {
      await updateMultipleRequisitions(requisitionIds, 'Fulfilled');
    }

    // Refetch data to get real-time updates
    refetchPOs();
    refetchInventory();
    refetchRequisitions();

    if (!inventoryResult.success) {
      addToast(`Created ${orderId}, but inventory update failed: ${inventoryResult.error ?? 'Unknown error'}`, 'error');
    } else {
      addToast(`Successfully created ${orderId} for ${vendor.name}.`, 'success');
    }
    navigateToPage('Purchase Orders');
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

  const handleUpdateBom = async (
    updatedBom: BillOfMaterials,
    options: BomRevisionRequestOptions = {}
  ): Promise<boolean> => {
    if (!currentUser) {
      addToast('You must be signed in to update BOMs.', 'error');
      return false;
    }

    const result = await updateBOM(updatedBom, {
      ...options,
      requestedBy: currentUser.id,
    });

    if (!result.success) {
      addToast(`Failed to update BOM: ${result.error}`, 'error');
      return false;
    }

    refetchBOMs();
    addToast(
      options.autoApprove
        ? `BOM for ${updatedBom.name} updated and auto-approved.`
        : `BOM update for ${updatedBom.name} submitted for Ops approval.`,
      options.autoApprove ? 'success' : 'info'
    );
    return true;
  };

  const handleAddArtworkToBom = async (targetId: string, artworkData: Omit<Artwork, 'id'>) => {
    const bom = boms.find(b => b.id === targetId) ?? boms.find(b => b.finishedSku === targetId);
    if (!bom) {
      addToast('Could not add artwork: product not found.', 'error');
      return;
    }

    const highestRevision = bom.artwork.reduce((max, art) => Math.max(max, art.revision ?? 0), 0);
    const newArtwork: Artwork = {
      id: `art-${Date.now()}`,
      ...artworkData,
      revision: artworkData.revision ?? highestRevision + 1,
    };

    const updatedBom = {
      ...bom,
      artwork: [...bom.artwork, newArtwork],
    };

    const success = await handleUpdateBom(updatedBom, {
      summary: `Attached artwork ${artworkData.fileName}`,
      changeType: 'artwork',
      autoApprove: true,
    });
    if (success) {
      navigateToPage('Artwork');
    }
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
    navigateToPage('Purchase Orders');
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

    const success = await handleUpdateBom(updatedBom, {
      summary: 'Artwork metadata updated',
      changeType: 'artwork',
    });
    if (success) {
      addToast('Artwork updated.', 'success');
    }
  };

  const handleApproveBom = async (bom: BillOfMaterials) => {
    if (!currentUser) {
      addToast('You must be signed in to approve revisions.', 'error');
      return;
    }
    const result = await approveBomRevision(bom, currentUser.id);
    if (!result.success) {
      addToast(`Failed to approve revision: ${result.error}`, 'error');
      return;
    }
    refetchBOMs();
    addToast(`Revision ${bom.revisionNumber ?? ''} approved.`, 'success');
  };

  const handleRevertBom = async (bom: BillOfMaterials, targetRevision: number) => {
    if (!currentUser) {
      addToast('You must be signed in to revert revisions.', 'error');
      return;
    }
    const result = await revertBomToRevision(bom, targetRevision, currentUser.id);
    if (!result.success) {
      addToast(`Failed to revert BOM: ${result.error}`, 'error');
      return;
    }
    refetchBOMs();
    addToast(`Reverted ${bom.finishedSku} to REV ${targetRevision}.`, 'success');
  };
  
  const handleCreateArtworkFolder = (name: string) => {
    const newFolder: ArtworkFolder = { id: `folder-${Date.now()}`, name };
    setArtworkFolders(prev => [...prev, newFolder]);
    addToast(`Folder "${name}" created successfully.`, 'success');
  };

  const handleCreateRequisition = async (
    items: RequisitionItem[],
    source: 'Manual' | 'System' = 'Manual',
    options: RequisitionRequestOptions = {}
  ) => {
    const requiresOpsApproval =
      options.opsApprovalRequired ??
      Boolean(options.priority === 'high' || options.autoPo || options.requestType === 'finished_good');
    const createdAt = new Date().toISOString();

    const normalizedItems = items.map(item => {
      const trimmedLink = typeof item.externalUrl === 'string' ? item.externalUrl.trim() : '';
      const externalUrl = trimmedLink
        ? trimmedLink.startsWith('http')
          ? trimmedLink
          : `https://${trimmedLink}`
        : undefined;

      const existingAmazonMeta = item.metadata?.amazon;
      const derivedAmazonMeta = existingAmazonMeta ?? extractAmazonMetadata(externalUrl);
      const metadata = {
        ...(item.metadata ?? {}),
        ...(derivedAmazonMeta
          ? {
              amazon: derivedAmazonMeta,
              trackingEmail:
                item.metadata?.trackingEmail ?? DEFAULT_AMAZON_TRACKING_EMAIL,
            }
          : {}),
      };

      return {
        ...item,
        externalUrl,
        externalSource: derivedAmazonMeta
          ? 'amazon'
          : item.externalSource ?? (externalUrl ? 'external_link' : null),
        metadata: Object.keys(metadata).length ? metadata : undefined,
      };
    });

    const amazonTrackingEmails = new Set<string>();

    const amazonItems = normalizedItems
      .map((item, idx) => {
        const amazonMeta = item.metadata?.amazon;
        if (!amazonMeta) return null;
        const trackingEmail = item.metadata?.trackingEmail ?? DEFAULT_AMAZON_TRACKING_EMAIL;
        if (trackingEmail) {
          amazonTrackingEmails.add(trackingEmail);
        }
        return {
          index: idx,
          sku: item.sku,
          asin: amazonMeta.asin ?? null,
          marketplace: amazonMeta.marketplace ?? 'amazon.com',
          canonicalUrl: amazonMeta.canonicalUrl,
          trackingEmail: trackingEmail ?? null,
        };
      })
      .filter(Boolean);

    const metadata = { ...(options.metadata ?? {}), requiresOpsApproval } as Record<string, any>;
    if (amazonItems.length > 0) {
      metadata.amazonTracking = {
        capturedAt: createdAt,
        items: amazonItems,
        trackingEmails: Array.from(amazonTrackingEmails),
      };
      if (!metadata.trackingEmail && amazonTrackingEmails.size > 0) {
        metadata.trackingEmail = Array.from(amazonTrackingEmails)[0];
      }
    }

    const newReq: InternalRequisition = {
      id: `REQ-${new Date().getFullYear()}-${(requisitions.length + 1).toString().padStart(3, '0')}`,
      requesterId: source === 'Manual' ? currentUser!.id : 'SYSTEM',
      department: source === 'Manual' ? currentUser!.department : 'Purchasing',
      createdAt,
      status: 'Pending',
      source,
      items: normalizedItems,
      requestType: options.requestType ?? 'consumable',
      priority: options.priority ?? 'medium',
      needByDate: options.needByDate ?? null,
      alertOnly: options.alertOnly ?? false,
      autoPo: options.autoPo ?? false,
      notifyRequester: options.notifyRequester ?? true,
      context: options.context ?? null,
      metadata,
      notes: options.notes ?? undefined,
      managerApprovedBy: null,
      managerApprovedAt: null,
      opsApprovalRequired: requiresOpsApproval,
      opsApprovedBy: null,
      opsApprovedAt: null,
      forwardedToPurchasingAt: null,
    };

    // 🔥 Save to Supabase
    const result = await createRequisition(newReq);
    if (!result.success) {
      addToast(`Failed to create requisition: ${result.error}`, 'error');
      return;
    }

    refetchRequisitions();
    
    const label = newReq.alertOnly ? 'Alert' : 'Requisition';
    if (source === 'System') {
      addToast(`⚡ AI-Generated ${label} ${newReq.id} created! Auto-generated based on demand forecast. Pending approval.`, 'success');
    } else {
      addToast(`${label} ${newReq.id} submitted for approval.`, 'success');
    }
  };

  const handleQuickRequestSubmit = async (items: RequisitionItem[], options: RequisitionRequestOptions) => {
    await handleCreateRequisition(items, 'Manual', options);
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
    try {
      // Get BOM for this product
      const bom = bomMap.get(sku);
      if (!bom) {
        addToast(`Product ${sku} not found in BOM database`, 'error');
        return;
      }

      // Check for build blockers (respects configurable settings)
      const blockReason = await checkBuildBlockers(bom);
      if (blockReason.blocked) {
        // Store block reason for modal display
        setPendingBuildBlockReason(blockReason);
        setPendingBuildOrder({
          sku,
          name,
          quantity,
          scheduledDate,
          dueDate,
        });
        setShowBuildBlockerModal(true);
        return;
      }

      // No blockers - proceed with build order creation
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
      navigateToPage('Production');
    } catch (error) {
      console.error('[handleCreateBuildOrder] Error:', error);
      addToast(`Error creating build order: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

  const handleApproveRequisition = async (reqId: string) => {
    const req = requisitions.find(r => r.id === reqId);
    if (!req || !currentUser) return;

    const canManagerApprove =
      isOpsAdmin ||
      (currentUser.role === 'Manager' && currentUser.department === req.department);

    if (!canManagerApprove) {
      addToast('You do not have permission to approve this requisition.', 'error');
      return;
    }

    if (req.status !== 'Pending') {
      addToast('This requisition has already been processed.', 'info');
      return;
    }

    const requiresOps = req.opsApprovalRequired ?? (req.priority === 'high' || req.autoPo);
    const nextStatus: InternalRequisition['status'] = requiresOps ? 'OpsPending' : 'ManagerApproved';
    const nowIso = new Date().toISOString();
    const extra: Record<string, any> = {
      manager_approved_by: currentUser.id,
      manager_approved_at: nowIso,
      ops_approval_required: requiresOps,
    };
    if (!requiresOps) {
      extra.forwarded_to_purchasing_at = nowIso;
    }

    const result = await updateRequisitionStatus(reqId, nextStatus, extra);
    if (!result.success) {
      addToast(`Failed to approve requisition: ${result.error}`, 'error');
      return;
    }
    refetchRequisitions();
    addToast(
      requiresOps
        ? `Manager approved ${reqId}. Awaiting Operations review.`
        : `Requisition ${reqId} approved and forwarded to Purchasing.`,
      'success'
    );
  };

  const handleOpsApproveRequisition = async (reqId: string) => {
    const req = requisitions.find(r => r.id === reqId);
    if (!req || !currentUser) return;

    const canOpsApprove = isOpsAdmin;

    if (!canOpsApprove) {
      addToast('Only Operations can approve this requisition.', 'error');
      return;
    }

    if (req.status !== 'OpsPending') {
      addToast('This requisition is not awaiting Operations approval.', 'info');
      return;
    }

    const nowIso = new Date().toISOString();
    const result = await updateRequisitionStatus(reqId, 'OpsApproved', {
      ops_approved_by: currentUser.id,
      ops_approved_at: nowIso,
      forwarded_to_purchasing_at: nowIso,
    });
    if (!result.success) {
      addToast(`Failed to record Operations approval: ${result.error}`, 'error');
      return;
    }
    refetchRequisitions();
    addToast(`Operations approved ${reqId}. Purchasing notified.`, 'success');
  };

  const handleRejectRequisition = async (reqId: string) => {
    const req = requisitions.find(r => r.id === reqId);
    if (!req || !currentUser) return;

    const canManagerReview =
      isOpsAdmin ||
      (currentUser.role === 'Manager' && currentUser.department === req.department);
    const canOpsReview = isOpsAdmin && req.status === 'OpsPending';

    if (!canManagerReview && !canOpsReview) {
      addToast('You do not have permission to reject this requisition.', 'error');
      return;
    }

    const result = await updateRequisitionStatus(reqId, 'Rejected', {
      forwarded_to_purchasing_at: null,
      ops_approved_by: null,
      ops_approved_at: null,
    });
    if (!result.success) {
      addToast(`Failed to reject requisition: ${result.error}`, 'error');
      return;
    }
    refetchRequisitions();
    addToast(`Requisition ${reqId} rejected.`, 'info');
  };

  const handleGmailConnect = useCallback(async () => {
    try {
      await googleAuthService.startOAuthFlow();
      await refreshGmailConnection();
      addToast('Google Workspace account connected successfully!', 'success');
      return true;
    } catch (error) {
      console.error('[App] Gmail connect error:', error);
      addToast(
        `Failed to connect Google Workspace Gmail: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        'error',
      );
      return false;
    }
  }, [googleAuthService, refreshGmailConnection, addToast]);

  const handleGmailDisconnect = async () => {
    try {
      await googleAuthService.revokeAccess();
      await refreshGmailConnection();
      addToast('Google Workspace account disconnected.', 'info');
    } catch (error) {
      console.error('[App] Gmail disconnect error:', error);
      addToast(`Failed to disconnect Google Workspace Gmail: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

  const formatPoNote = useCallback((message: string) => {
    return `[${new Date().toLocaleString()}] ${message}`;
  }, []);

  const handleSendPoEmail = async (poId: string, sentViaGmail: boolean) => {
    const senderName = currentUser?.name || currentUser?.email || 'MuRP User';
    const deliveryChannel = sentViaGmail
      ? `Gmail (${gmailConnection.email ?? 'workspace account'})`
      : 'MuRP (manual send)';

    if (sentViaGmail) {
      addToast(`Email for ${poId} sent via ${gmailConnection.email ?? 'Google Workspace Gmail'}.`, 'success');
    } else {
      addToast(`Simulated email send for ${poId}.`, 'info');
    }

    await appendPurchaseOrderNote(
      poId,
      formatPoNote(`${senderName} sent PO via ${deliveryChannel}. Awaiting vendor confirmation.`),
    );

    const submissionResult = await updatePurchaseOrderStatus(poId, 'Submitted');
    if (!submissionResult.success) {
      addToast(`Failed to update ${poId} status: ${submissionResult.error ?? 'unknown error'}`, 'error');
      refetchPOs();
      return;
    }

    let shouldMarkCommitted = false;
    if (typeof window !== 'undefined') {
      shouldMarkCommitted = window.confirm(
        'Have you marked this PO as Committed inside Finale?\n\nSelect "OK" after you confirm the vendor has acknowledged and you have updated Finale. Select "Cancel" to leave it in Submitted status until the vendor confirms.',
      );
    }

    if (shouldMarkCommitted) {
      await appendPurchaseOrderNote(
        poId,
        formatPoNote(`${senderName} confirmed Finale commit and marked this PO as Committed.`),
      );
      const commitResult = await updatePurchaseOrderStatus(poId, 'Committed');
      if (!commitResult.success) {
        addToast(`Failed to mark ${poId} as committed: ${commitResult.error ?? 'unknown error'}`, 'error');
      } else {
        addToast(`PO ${poId} marked as Committed. Finale should now reflect the same status.`, 'success');
      }
    } else {
      addToast(`PO ${poId} left in Submitted state until vendor confirmation.`, 'info');
    }

    refetchPOs();
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

  const handleUpdatePoTracking = async (
    poId: string,
    updates: {
      trackingNumber?: string | null;
      trackingCarrier?: string | null;
      trackingStatus: POTrackingStatus;
      trackingEstimatedDelivery?: string | null;
      trackingLastException?: string | null;
    }
  ) => {
    try {
      await updatePurchaseOrderTrackingStatus(poId, updates.trackingStatus, {
        carrier: updates.trackingCarrier,
        trackingNumber: updates.trackingNumber ?? null,
        estimatedDelivery: updates.trackingEstimatedDelivery ?? null,
        lastException: updates.trackingLastException ?? null,
      });
      addToast('Tracking information updated.', 'success');
      refetchPOs();
    } catch (error) {
      console.error('[PO] tracking update error', error);
      addToast('Failed to update tracking information.', 'error');
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
  const isOpsAdmin = currentUser ? currentUser.role === 'Admin' || currentUser.department === 'Operations' : false;

  const pendingRequisitionCount = useMemo(() => {
    if (!currentUser) return 0;
    if (isOpsAdmin) {
        return requisitions.filter(r => r.status === 'Pending' || r.status === 'OpsPending').length;
    }
    if (currentUser.department === 'Operations') {
        return requisitions.filter(r => r.status === 'OpsPending').length;
    }
    if (currentUser.role === 'Manager') {
        return requisitions.filter(r => r.status === 'Pending' && r.department === currentUser.department).length;
    }
    return 0;
  }, [requisitions, currentUser, isOpsAdmin]);
  
  const approvedRequisitionsForPoGen = useMemo(() => {
    if (!currentUser || !permissions.canManagePurchaseOrders) return [];
    const readyStatuses: InternalRequisition['status'][] = ['ManagerApproved', 'OpsApproved'];
    if (isOpsAdmin || currentUser.department === 'Purchasing') {
        return requisitions.filter(r => readyStatuses.includes(r.status));
    }
    if (currentUser.role === 'Manager') {
        return requisitions.filter(r => readyStatuses.includes(r.status) && r.department === currentUser.department);
    }
    return [];
  }, [requisitions, currentUser, permissions.canManagePurchaseOrders, isOpsAdmin]);

  const navigateToArtwork = (filter: string) => {
    setArtworkFilter(filter);
    navigateToPage('Artwork');
  };

  const handleNavigateToInventory = (sku: string) => {
    localStorage.setItem('selectedInventorySku', sku);
    navigateToPage('Inventory');
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
          purchaseOrders={purchaseOrders}
          onCreateBuildOrder={handleCreateBuildOrder}
          onCreateRequisition={handleCreateRequisition}
          requisitions={requisitions}
          users={users}
          currentUser={currentUser}
          setCurrentPage={navigateToPage}
          aiConfig={aiConfig}
        />;
      case 'Inventory':
        return <Inventory 
          inventory={inventory} 
          vendors={vendors} 
          boms={boms}
          loading={inventoryLoading}
          onQuickRequest={openQuickRequestDrawer}
          onNavigateToBom={(bomSku) => {
            navigateToPage('BOMs');
            if (bomSku) {
              localStorage.setItem('selectedBomSku', bomSku);
            } else {
              localStorage.removeItem('selectedBomSku');
            }
          }}
          onNavigateToProduct={(sku) => {
            localStorage.setItem('selectedProductSku', sku);
            navigateToPage('Product Page');
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
                    onUpdateTracking={handleUpdatePoTracking}
                    requisitions={requisitions}
                    users={users}
                    onApproveRequisition={handleApproveRequisition}
                    onOpsApproveRequisition={handleOpsApproveRequisition}
                    onRejectRequisition={handleRejectRequisition}
                    onCreateRequisition={(items, options) => handleCreateRequisition(items, 'Manual', options)}
                    onConnectGoogle={handleGmailConnect}
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
          purchaseOrders={purchaseOrders}
          onCompleteBuildOrder={handleCompleteBuildOrder} 
          onCreateBuildOrder={handleCreateBuildOrder}
          onUpdateBuildOrder={handleUpdateBuildOrder}
          addToast={addToast}
          onQuickRequest={openQuickRequestDrawer}
        />;
      case 'BOMs':
        return <BOMs
          boms={boms}
          inventory={inventory}
          currentUser={currentUser}
          watchlist={watchlist}
          onUpdateBom={handleUpdateBom}
          onApproveRevision={handleApproveBom}
          onRevertToRevision={handleRevertBom}
          onNavigateToArtwork={navigateToArtwork}
          onNavigateToInventory={handleNavigateToInventory}
          onUploadArtwork={handleAddArtworkToBom}
          onCreateRequisition={(items, options) => handleCreateRequisition(items, 'Manual', options)}
          onCreateBuildOrder={handleCreateBuildOrder}
          addToast={addToast}
          onQuickRequest={openQuickRequestDrawer}
          users={userProfiles}
        />;
      case 'Artwork':
        return <ArtworkPage 
            boms={boms}
            inventory={inventory}
            vendors={vendors}
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
            gmailConnection={gmailConnection}
            addToast={addToast}
            artworkShareHistory={artworkShareHistory}
            onRecordArtworkShare={handleRecordArtworkShare}
            onConnectGoogle={handleGmailConnect}
            companyEmailSettings={companyEmailSettings}
        />;
      case 'API Documentation':
          return <ApiDocs />;
      case 'Inventory Intelligence':
        return <InventoryIntelligence />;
      case 'Label Scanner':
        return <ManualLabelScanner
          boms={boms}
          currentUser={currentUser}
        />;
      case 'Projects':
        return <ProjectsPage
          currentUser={currentUser}
          users={users}
          addToast={addToast}
        />;
      case 'Product Page':
        return <ProductPage
          inventory={inventory}
          boms={boms}
          purchaseOrders={purchaseOrders}
          vendors={vendors}
          currentUser={currentUser}
          onNavigateToBom={(bomSku) => {
            navigateToPage('BOMs');
            if (bomSku) {
              localStorage.setItem('selectedBomSku', bomSku);
            } else {
              localStorage.removeItem('selectedBomSku');
            }
          }}
          onNavigateToInventory={handleNavigateToInventory}
          onCreateRequisition={(items, options) => handleCreateRequisition(items, 'Manual', options)}
          onCreateBuildOrder={handleCreateBuildOrder}
          addToast={addToast}
          onQuickRequest={openQuickRequestDrawer}
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
            setCurrentPage={navigateToPage}
            externalConnections={externalConnections}
            onSetExternalConnections={setExternalConnections}
            users={users}
            onInviteUser={handleInviteUser}
            onUpdateUser={handleUpdateUser}
            onDeleteUser={handleDeleteUser}
            inventory={inventory}
            boms={boms}
            vendors={vendors}
            companyEmailSettings={companyEmailSettings}
            onUpdateCompanyEmailSettings={setCompanyEmailSettings}
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
          setCurrentPage={navigateToPage}
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
      return <EnhancedNewUserSetup user={currentUser} onSetupComplete={() => handleCompleteOnboarding(currentUser.id)} />;
  }

  const shellBackground = resolvedTheme === 'light'
    ? 'bg-[#f5f1e8]'
    : 'bg-gray-900';

  const mainBackground = resolvedTheme === 'light'
    ? 'bg-white/80 shadow-[0_20px_60px_rgba(15,23,42,0.12)] border border-amber-900/10'
    : 'bg-gray-900';

  return (
    <div className={`flex h-screen ${shellBackground} text-[var(--text-color)] transition-colors duration-300`}>
      <Sidebar 
        currentPage={currentPage} 
        setCurrentPage={navigateToPage} 
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        currentUser={currentUser}
        pendingRequisitionCount={pendingRequisitionCount}
        onOpenAiAssistant={openAiAssistant}
        onSignOut={handleLogout}
        onOpenSettings={() => navigateToPage('Settings')}
        systemAlerts={systemAlerts}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          currentUser={currentUser}
          onLogout={handleLogout}
          isGlobalLoading={isDataLoading}
          showLogo={isSidebarCollapsed}
          devModeActive={permissions.isGodMode}
        />
        
        <main
          data-surface="workspace"
          className={`workspace-surface flex-1 overflow-x-hidden overflow-y-auto ${mainBackground} p-4 sm:p-6 lg:p-8 pb-20 md:pb-8 transition-colors duration-300`}
        >
          <ShipmentAlertBanner
            onReviewShipment={(poId) => {
              setShipmentReviewPoId(poId);
              setIsShipmentReviewModalOpen(true);
            }}
          />
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

      {/* Mobile bottom navigation - hidden on md+ screens */}
      <MobileNav
        currentPage={currentPage}
        setCurrentPage={navigateToPage}
      />

      <div className="fixed top-20 right-4 z-[60] w-full max-w-sm">
        {toasts.map(toast => (
          <Toast key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>

      <QuickRequestDrawer
        isOpen={isQuickRequestOpen}
        inventory={inventory || []}
        purchaseOrders={purchaseOrders || []}
        defaults={quickRequestDefaults ?? undefined}
        onClose={closeQuickRequestDrawer}
        onSubmit={handleQuickRequestSubmit}
      />

      {showOnboardingChecklist && currentUser && (
        <OnboardingChecklist
          user={currentUser}
          onClose={handleChecklistDismiss}
          onComplete={handleChecklistComplete}
          onSnooze={handleChecklistSnooze}
          navigateTo={(pageName) => {
            navigateToPage(pageName as Page);
            handleChecklistDismiss();
          }}
        />
      )}

      {!showOnboardingChecklist && (
        <FeatureSpotlightReminder currentUser={currentUser ?? null} navigateTo={(pageName) => navigateToPage(pageName as Page)} />
      )}

      <AiAssistant
        isOpen={isAiAssistantOpen}
        onClose={closeAiAssistant}
        boms={boms || []}
        inventory={inventory || []}
        vendors={vendors || []}
        purchaseOrders={purchaseOrders || []}
        aiConfig={aiConfig}
        aiSettings={aiSettings}
        onUpdateAiSettings={handleUpdateAiSettings}
        userId={currentUser?.id || ''}
      />

      <ShipmentReviewModal
        isOpen={isShipmentReviewModalOpen}
        onClose={() => {
          setIsShipmentReviewModalOpen(false);
          setShipmentReviewPoId(null);
        }}
        poId={shipmentReviewPoId}
        addToast={addToast}
      />

      {/* <BuildBlockerModal
        isOpen={showBuildBlockerModal}
        onClose={() => {
          setShowBuildBlockerModal(false);
          setPendingBuildBlockReason(null);
          setPendingBuildOrder(null);
        }}
        blockReason={pendingBuildBlockReason}
        pendingBuildOrder={pendingBuildOrder}
        onViewApprovalFlow={() => navigateToPage('BOMs')}
      /> */}

      {/* {!hasInitialDataLoaded && <LoadingOverlay />} */}
    </div>
  );
};

const App: React.FC = () => (
  <ThemeProvider>
    <UserPreferencesProvider>
      <SystemAlertProvider>
        <AppShell />
      </SystemAlertProvider>
    </UserPreferencesProvider>
  </ThemeProvider>
);

export default App;
