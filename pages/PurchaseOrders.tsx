import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../components/ThemeProvider';
import Button from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge, { formatStatusText } from '@/components/ui/StatusBadge';
import type {
    PurchaseOrder,
    Vendor,
    InventoryItem,
    User,
    InternalRequisition,
    GmailConnection,
    RequisitionItem,
    CreatePurchaseOrderInput,
    CreatePurchaseOrderItemInput,
    POTrackingStatus,
    RequisitionRequestOptions,
} from '../types';
import { MailIcon, FileTextIcon, ChevronDownIcon, BotIcon, CheckCircleIcon, XCircleIcon, TruckIcon, DocumentTextIcon, CalendarIcon, SettingsIcon, Squares2X2Icon, ListBulletIcon, AlertTriangleIcon, ClipboardDocumentListIcon, LinkIcon, ClipboardIcon, XMarkIcon } from '../components/icons';
import PODeliveryTimeline from '../components/PODeliveryTimeline';
import CollapsibleSection from '../components/CollapsibleSection';
import CreatePoModal from '../components/CreatePoModal';
import Modal from '../components/Modal';
import EmailComposerModal from '../components/EmailComposerModal';
import GeneratePoModal from '../components/GeneratePoModal';
import CreateRequisitionModal from '../components/CreateRequisitionModal';
import PoCommunicationModal from '../components/PoCommunicationModal';
import PODetailModal from '../components/PODetailModal';
import ReorderQueueDashboard, { ReorderQueueVendorGroup } from '../components/ReorderQueueDashboard';
import DraftPOReviewSection from '../components/DraftPOReviewSection';
// POTrackingDashboard removed - consolidated into UnifiedPOList
import ThreeWayMatchReviewQueue from '../components/ThreeWayMatchReviewQueue';
import ThreeWayMatchModal from '../components/ThreeWayMatchModal';
import { InvoiceReviewModal } from '../components/InvoiceReviewModal';
import ReceivePurchaseOrderModal from '../components/ReceivePurchaseOrderModal';
import UpdateTrackingModal from '../components/UpdateTrackingModal';
import { subscribeToPoDrafts } from '../lib/poDraftBridge';
import { supabase } from '../lib/supabase/client';
import { generatePoPdf } from '../services/pdfService';
import { usePermissions } from '../hooks/usePermissions';
import { runFollowUpAutomation } from '../services/followUpService';
import { getGoogleGmailService } from '../services/googleGmailService';
import AutonomousControls from '../components/AutonomousControls';
import AutonomousApprovals from '../components/AutonomousApprovals';
import AlertFeedComponent from '../components/AlertFeedComponent';
import TrustScoreDashboard from '../components/TrustScoreDashboard';
import VendorScorecardComponent from '../components/VendorScorecardComponent';
import UnifiedPOList from '../components/UnifiedPOList';
import type { FinalePurchaseOrderRecord } from '../types';

interface PurchaseOrdersProps {
    purchaseOrders: PurchaseOrder[];
    finalePurchaseOrders?: FinalePurchaseOrderRecord[];
    vendors: Vendor[];
    inventory: InventoryItem[];
    onCreatePo: (poDetails: CreatePurchaseOrderInput) => Promise<void> | void;
    addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
    currentUser: User;
    approvedRequisitions: InternalRequisition[];
    gmailConnection: GmailConnection;
    onSendEmail: (poId: string, sentViaGmail: boolean) => Promise<void> | void;
    onUpdateTracking: (poId: string, updates: {
        trackingNumber?: string | null;
        trackingCarrier?: string | null;
        trackingStatus: POTrackingStatus;
        trackingEstimatedDelivery?: string | null;
        trackingLastException?: string | null;
    }) => Promise<void> | void;
    requisitions: InternalRequisition[];
    users: User[];
    onApproveRequisition: (reqId: string) => void;
    onOpsApproveRequisition: (reqId: string) => void;
    onRejectRequisition: (reqId: string) => void;
    onCreateRequisition: (items: RequisitionItem[], options: RequisitionRequestOptions) => void;
    onConnectGoogle: () => Promise<boolean>;
    showAllFinaleHistory: boolean;
    setShowAllFinaleHistory: (show: boolean) => void;
}

type PoDraftConfig = {
    vendorId?: string;
    vendorLocked?: boolean;
    items?: CreatePurchaseOrderItemInput[];
    expectedDate?: string;
    notes?: string;
    requisitionIds?: string[];
    sourceLabel?: string;
};

// Status badges now use shared StatusBadge component from /components/ui/StatusBadge.tsx
// Supports auto-detection via status prop and formatStatusText utility

const PurchaseOrders: React.FC<PurchaseOrdersProps> = (props) => {
    const {
        purchaseOrders, finalePurchaseOrders = [], vendors, inventory, onCreatePo, addToast, currentUser,
        approvedRequisitions, gmailConnection, onSendEmail, onUpdateTracking,
        requisitions, users, onApproveRequisition, onOpsApproveRequisition, onRejectRequisition, onCreateRequisition,
        onConnectGoogle, showAllFinaleHistory, setShowAllFinaleHistory,
    } = props;

    const [isCreatePoModalOpen, setIsCreatePoModalOpen] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
    const [isCommModalOpen, setIsCommModalOpen] = useState(false);
    const [isGeneratePoModalOpen, setIsGeneratePoModalOpen] = useState(false);
    const [isCreateReqModalOpen, setIsCreateReqModalOpen] = useState(false);
    const [isRequisitionsOpen, setIsRequisitionsOpen] = useState(false);
    const [selectedPoForEmail, setSelectedPoForEmail] = useState<PurchaseOrder | null>(null);
    const [selectedPoForTracking, setSelectedPoForTracking] = useState<PurchaseOrder | null>(null);
    const [selectedPoForComm, setSelectedPoForComm] = useState<PurchaseOrder | null>(null);
    const [selectedPoForReceive, setSelectedPoForReceive] = useState<PurchaseOrder | null>(null);
    const [selectedPoForDetail, setSelectedPoForDetail] = useState<PurchaseOrder | null>(null);
    const [selectedPoForInvoice, setSelectedPoForInvoice] = useState<string | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [activePoDraft, setActivePoDraft] = useState<PoDraftConfig | undefined>(undefined);
    const [pendingPoDrafts, setPendingPoDrafts] = useState<PoDraftConfig[]>([]);
    const [modalSession, setModalSession] = useState(0);
    const [isRunningFollowUps, setIsRunningFollowUps] = useState(false);
    const [expandedFinalePO, setExpandedFinalePO] = useState<string | null>(null);
    const [isCommandCenterOpen, setIsCommandCenterOpen] = useState(false);
    const [finalePOSortOrder, setFinalePOSortOrder] = useState<'asc' | 'desc'>('desc'); // Default newest first
    const [isAgentSettingsOpen, setIsAgentSettingsOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'unified' | 'list' | 'card'>(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem('po-view-mode') as 'unified' | 'list' | 'card') || 'unified';
        }
        return 'unified';
    });

    // Finale PO tracking modal state
    const [finaleTrackingModal, setFinaleTrackingModal] = useState<{
        isOpen: boolean;
        orderId: string;
        currentTracking?: string;
        currentCarrier?: string;
    }>({ isOpen: false, orderId: '' });
    const [finaleTrackingInput, setFinaleTrackingInput] = useState({ number: '', carrier: '', eta: '' });
    const [savingFinaleTracking, setSavingFinaleTracking] = useState(false);

    // Three-way match status for PO cards
    const [matchStatuses, setMatchStatuses] = useState<Record<string, {
        status: string;
        score: number;
        hasDiscrepancies: boolean;
    }>>({});
    // Modal state for three-way match review
    const [matchModalPO, setMatchModalPO] = useState<{ orderId: string; vendorName: string } | null>(null);

    // Modal state for requisition approval
    const [selectedReqForApproval, setSelectedReqForApproval] = useState<InternalRequisition | null>(null);
    const [approvalType, setApprovalType] = useState<'manager' | 'ops'>('manager');

    // Highlighted PO from deep link navigation
    const [highlightedPO, setHighlightedPO] = useState<string | null>(null);

    // Share link modal state
    const [shareLink, setShareLink] = useState<{
        isOpen: boolean;
        url: string;
        token: string;
        expiresAt?: string;
        loading: boolean;
        error?: string;
    }>({ isOpen: false, url: '', token: '', loading: false });

    // Generate shareable link for a Finale PO
    const generateShareLink = async (finalePoId: string) => {
        setShareLink({ isOpen: true, url: '', token: '', loading: true });

        try {
            const { data, error } = await supabase.rpc('create_po_share_link', {
                p_finale_po_id: finalePoId,
                p_expires_in_days: 30,
                p_show_pricing: true,
                p_show_notes: false,
                p_show_tracking: true,
            });

            if (error) throw error;

            const result = data?.[0];
            if (result) {
                const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
                const fullUrl = `${baseUrl}${result.share_url}`;
                setShareLink({
                    isOpen: true,
                    url: fullUrl,
                    token: result.share_token,
                    expiresAt: result.expires_at,
                    loading: false,
                });
            } else {
                throw new Error('No share link returned');
            }
        } catch (err: any) {
            console.error('[PurchaseOrders] Share link error:', err);
            setShareLink(prev => ({
                ...prev,
                loading: false,
                error: err?.message || 'Failed to generate share link',
            }));
        }
    };

    // Copy share link to clipboard
    const copyShareLink = async () => {
        if (shareLink.url) {
            try {
                await navigator.clipboard.writeText(shareLink.url);
                addToast('Share link copied to clipboard!', 'success');
            } catch {
                addToast('Failed to copy to clipboard', 'error');
            }
        }
    };

    // Check for highlighted PO from localStorage on mount
    useEffect(() => {
        const storedPO = localStorage.getItem('highlightedPO');
        if (storedPO) {
            setHighlightedPO(storedPO);
            localStorage.removeItem('highlightedPO');
            // Scroll to the PO after a short delay to allow rendering
            setTimeout(() => {
                const poElement = document.querySelector(`[data-po-id="${storedPO}"]`);
                if (poElement) {
                    poElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    poElement.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
                    // Remove highlight after 3 seconds
                    setTimeout(() => {
                        setHighlightedPO(null);
                        poElement.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2');
                    }, 3000);
                }
            }, 200);
        }
    }, []);

    // Date filter with localStorage persistence
    const [dateFilter, setDateFilter] = useState<'all' | '30days' | '90days' | '12months'>(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem('po-date-filter') as any) || 'all';
        }
        return 'all';
    });

    // Save date filter to localStorage when it changes
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('po-date-filter', dateFilter);
        }
    }, [dateFilter]);

    // Save view mode to localStorage when it changes
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('po-view-mode', viewMode);
        }
    }, [viewMode]);

    // Fetch three-way match statuses for Finale POs
    useEffect(() => {
        const fetchMatchStatuses = async () => {
            if (!finalePurchaseOrders || finalePurchaseOrders.length === 0) return;

            try {
                // Get match statuses for all Finale POs by order_id
                const orderIds = finalePurchaseOrders.map(fpo => fpo.orderId).filter(Boolean);
                if (orderIds.length === 0) return;

                const { data, error } = await supabase
                    .from('po_three_way_matches')
                    .select(`
                        po_id,
                        match_status,
                        overall_score,
                        discrepancies,
                        purchase_orders!inner(order_id)
                    `)
                    .in('purchase_orders.order_id', orderIds);

                if (error) {
                    console.error('[PurchaseOrders] Match status fetch error:', error);
                    return;
                }

                if (data) {
                    const statusMap: Record<string, { status: string; score: number; hasDiscrepancies: boolean }> = {};
                    for (const match of data) {
                        const orderId = (match.purchase_orders as any)?.order_id;
                        if (orderId) {
                            statusMap[orderId] = {
                                status: match.match_status || 'pending_data',
                                score: match.overall_score || 0,
                                hasDiscrepancies: Array.isArray(match.discrepancies) && match.discrepancies.length > 0,
                            };
                        }
                    }
                    setMatchStatuses(statusMap);
                }
            } catch (err) {
                console.error('[PurchaseOrders] Match status fetch error:', err);
            }
        };

        fetchMatchStatuses();
    }, [finalePurchaseOrders]);

    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme !== 'light';
    const permissions = usePermissions();
    const vendorMap = useMemo(() => new Map(vendors.map(v => [v.id, v])), [vendors]);
    const userMap = useMemo(() => new Map(users.map(u => [u.id, u.name])), [users]);
    const inventoryMap = useMemo(() => new Map(inventory.map(item => [item.sku, item])), [inventory]);
    const followUpBacklog = useMemo(
        () =>
            purchaseOrders.filter(
                po =>
                    (po.followUpRequired ?? true) &&
                    (!po.trackingNumber || po.trackingStatus === 'awaiting_confirmation') &&
                    ['sent', 'pending', 'confirmed', 'committed'].includes(po.status),
            ).length,
        [purchaseOrders],
    );

    const managerQueue = useMemo(
        () => requisitions.filter(r => r.status === 'Pending'),
        [requisitions]
    );

    const opsQueue = useMemo(
        () => requisitions.filter(r => r.status === 'OpsPending'),
        [requisitions]
    );

    const readyQueue = useMemo(
        () => requisitions.filter(r => r.status === 'ManagerApproved' || r.status === 'OpsApproved'),
        [requisitions]
    );

    const urgentRequests = useMemo(
        () =>
            requisitions
                .filter(r =>
                    (r.priority === 'high' || r.opsApprovalRequired) &&
                    (r.status === 'Pending' || r.status === 'OpsPending')
                )
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                .slice(0, 4),
        [requisitions]
    );

    const readyHighlights = useMemo(
        () => readyQueue.slice(0, 4),
        [readyQueue]
    );

    const trackingAlerts = useMemo(
        () =>
            purchaseOrders
                .filter(po =>
                    (!po.trackingNumber || po.trackingStatus === 'awaiting_confirmation') &&
                    ['sent', 'pending', 'committed', 'confirmed'].includes(po.status)
                )
                .slice(0, 4),
        [purchaseOrders]
    );

    const isAdminLike = permissions.isAdminLike;
    const showCommandCenter = permissions.isPurchasing || permissions.isOperations || isAdminLike;

    const canManagePOs = permissions.canManagePurchaseOrders;
    const canSubmitRequisitions = permissions.canSubmitRequisition;

    const openPoModalWithDrafts = useCallback((drafts: PoDraftConfig[]) => {
        if (!drafts.length) {
            addToast('No purchase order lines to review.', 'info');
            return;
        }
        setActivePoDraft(drafts[0]);
        setPendingPoDrafts(drafts.slice(1));
        setModalSession(prev => prev + 1);
        setIsCreatePoModalOpen(true);
    }, [addToast]);

    const resetPoModalState = () => {
        setIsCreatePoModalOpen(false);
        setActivePoDraft(undefined);
        setPendingPoDrafts([]);
    };

    const handleManualCreateClick = () => {
        openPoModalWithDrafts([{
            sourceLabel: 'Manual PO Draft',
        }]);
    };

    const handlePoModalClose = () => {
        resetPoModalState();
    };

    const handlePoModalSubmit = async (poInput: CreatePurchaseOrderInput) => {
        await onCreatePo(poInput);
        if (pendingPoDrafts.length > 0) {
            const [nextDraft, ...remaining] = pendingPoDrafts;
            setActivePoDraft(nextDraft);
            setPendingPoDrafts(remaining);
            setModalSession(prev => prev + 1);
        } else {
            resetPoModalState();
        }
    };

    const handleReorderQueueDrafts = (groups: ReorderQueueVendorGroup[]) => {
        const validGroups = groups.filter(group => group.vendorId && group.vendorId !== 'unknown');
        if (!validGroups.length) {
            addToast('Selected items are missing vendor assignments.', 'error');
            return;
        }
        const skipped = groups.length - validGroups.length;

        const drafts: PoDraftConfig[] = validGroups.map(group => ({
            vendorId: group.vendorId,
            vendorLocked: true,
            sourceLabel: `Reorder Queue • ${group.items.length} item${group.items.length === 1 ? '' : 's'}`,
            notes: 'Auto-generated from reorder queue selection',
            items: group.items.map(item => {
                const inventoryItem = inventoryMap.get(item.inventory_sku);
                const fallbackUnitCost =
                    item.recommended_quantity > 0
                        ? (item.estimated_cost ?? 0) / item.recommended_quantity
                        : 0;
                return {
                    sku: item.inventory_sku,
                    name: item.item_name,
                    quantity: item.recommended_quantity,
                    unitCost: inventoryItem?.unitCost ?? fallbackUnitCost ?? 0,
                };
            }),
        }));

        if (drafts.length) {
            openPoModalWithDrafts(drafts);
            if (skipped > 0) {
                addToast(`${skipped} vendor group(s) skipped due to missing vendor records.`, 'info');
            }
        } else {
            addToast('No vendor groups available for PO creation.', 'error');
        }
    };

    const handleRunFollowUps = useCallback(async () => {
        try {
            setIsRunningFollowUps(true);
            const result = await runFollowUpAutomation();
            if (result.success) {
                if (result.sent && result.sent > 0) {
                    addToast(`Queued ${result.sent} follow-up email${result.sent === 1 ? '' : 's'}.`, 'success');
                } else {
                    addToast('No vendors met the follow-up window right now.', 'info');
                }
            } else {
                throw new Error(result.error ?? 'Unknown follow-up error');
            }
        } catch (error) {
            console.error('[PurchaseOrders] follow-up automation failed', error);
            addToast('Failed to run follow-up automation. Check logs.', 'error');
        } finally {
            setIsRunningFollowUps(false);
        }
    }, [addToast]);

    const handleRequisitionDrafts = (drafts: { vendorId: string; items: CreatePurchaseOrderItemInput[]; requisitionIds: string[]; }[]) => {
        if (!drafts.length) {
            addToast('No approved requisitions available.', 'info');
            return;
        }

        openPoModalWithDrafts(
            drafts.map(draft => ({
                vendorId: draft.vendorId,
                vendorLocked: true,
                items: draft.items,
                requisitionIds: draft.requisitionIds,
                sourceLabel: `Requisitions • ${draft.requisitionIds.length} request${draft.requisitionIds.length === 1 ? '' : 's'}`,
                notes: 'Generated from approved requisitions',
            }))
        );
    };

    const formatPoTotal = (po: PurchaseOrder) => {
        // First try using the pre-calculated total if it's a valid number
        const directTotal = Number(po.total);
        if (!isNaN(directTotal) && directTotal > 0) {
            return directTotal.toFixed(2);
        }
        
        // Fall back to calculating from line items
        const calculatedTotal = po.items.reduce((sum, item) => {
            const lineTotal = Number(item.lineTotal);
            if (!isNaN(lineTotal)) return sum + lineTotal;
            
            const qty = Number(item.quantity) || 0;
            const price = Number(item.price) || 0;
            return sum + (qty * price);
        }, 0);
        
        return calculatedTotal.toFixed(2);
    };

    const handleDownloadPdf = (po: PurchaseOrder) => {
        if (!po.vendorId) {
            addToast(`Could not generate PDF: Vendor not linked for ${po.orderId || po.id}`, 'error');
            return;
        }
        const vendor = vendorMap.get(po.vendorId);
        if (vendor) {
            generatePoPdf(po, vendor);
            addToast(`Downloaded ${(po.orderId || po.id)}.pdf`, 'success');
        } else {
            addToast(`Could not generate PDF: Vendor not found for ${po.orderId || po.id}`, 'error');
        }
    };

    const handleSendEmailClick = (po: PurchaseOrder) => {
        if (!po.vendorId || !vendorMap.get(po.vendorId)) {
            addToast('Cannot compose email: vendor contact information is missing.', 'error');
            return;
        }
        setSelectedPoForEmail(po);
        setIsEmailModalOpen(true);
    };

    const handleSendEmail = async (sentViaGmail: boolean) => {
        if (selectedPoForEmail) {
            await onSendEmail(selectedPoForEmail.id, sentViaGmail);
        }
        setIsEmailModalOpen(false);
        setSelectedPoForEmail(null);
    };

    const getTrackingUrl = (po: PurchaseOrder): string | null => {
        if (po.trackingLink) return po.trackingLink;
        const trackingNumber = po.trackingNumber ?? '';
        if (!trackingNumber) return null;
        const carrier = (po.trackingCarrier || po.trackingLink || '').toLowerCase();
        if (carrier.includes('ups')) {
            return `https://www.ups.com/track?loc=en_US&tracknum=${trackingNumber}`;
        }
        if (carrier.includes('fedex')) {
            return `https://www.fedex.com/fedextrack/?tracknumbers=${trackingNumber}`;
        }
        if (carrier.includes('usps') || carrier.includes('postal')) {
            return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`;
        }
        if (carrier.includes('dhl')) {
            return `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${trackingNumber}`;
        }
        return null;
    };

    const handleOpenTracking = (po: PurchaseOrder) => {
        const url = getTrackingUrl(po);
        if (url && typeof window !== 'undefined') {
            window.open(url, '_blank', 'noopener,noreferrer');
        } else {
            addToast('Tracking link not available for this PO yet.', 'info');
        }
    };

    const handleOpenComm = (po: PurchaseOrder) => {
        setSelectedPoForComm(po);
        setIsCommModalOpen(true);
    };

    const handleCloseComm = () => {
        setIsCommModalOpen(false);
        setSelectedPoForComm(null);
    };

    const handleEditTracking = (po: PurchaseOrder) => {
        setSelectedPoForTracking(po);
        setIsTrackingModalOpen(true);
    };

    const handleSaveTracking = async (updates: {
        trackingNumber?: string | null;
        trackingCarrier?: string | null;
        trackingStatus: POTrackingStatus;
        trackingEstimatedDelivery?: string | null;
        trackingLastException?: string | null;
    }) => {
        if (!selectedPoForTracking) return;
        await onUpdateTracking(selectedPoForTracking.id, updates);
        setSelectedPoForTracking(null);
        setIsTrackingModalOpen(false);
    };

    // Handle Finale PO tracking update
    const handleSaveFinaleTracking = async () => {
        if (!finaleTrackingModal.orderId || !finaleTrackingInput.number) return;
        setSavingFinaleTracking(true);
        try {
            const { supabase } = await import('../lib/supabase/client');
            const { error } = await supabase.rpc('update_finale_po_tracking', {
                p_order_id: finaleTrackingModal.orderId,
                p_tracking_number: finaleTrackingInput.number,
                p_carrier: finaleTrackingInput.carrier || null,
                p_estimated_delivery: finaleTrackingInput.eta || null,
                p_source: 'manual',
            });

            if (error) {
                console.error('Failed to save tracking:', error);
                addToast('Failed to save tracking: ' + error.message, 'error');
            } else {
                addToast('Tracking updated successfully', 'success');
                setFinaleTrackingModal({ isOpen: false, orderId: '' });
                setFinaleTrackingInput({ number: '', carrier: '', eta: '' });
                // Refresh the page to show updated tracking
                window.location.reload();
            }
        } catch (err: any) {
            console.error('Error saving tracking:', err);
            addToast('Failed to save tracking', 'error');
        }
        setSavingFinaleTracking(false);
    };

    const handleReceivePO = (po: PurchaseOrder) => {
        setSelectedPoForReceive(po);
    };

    const handleViewPODetail = (po: PurchaseOrder) => {
        setSelectedPoForDetail(po);
        setIsDetailModalOpen(true);
    };

    const handleReceiveSubmit = async (poId: string, receivedItems: any[], notes?: string) => {
        try {
            // Import the receivePurchaseOrder function dynamically
            const { receivePurchaseOrder } = await import('../hooks/useSupabaseMutations');
            const result = await receivePurchaseOrder({
                poId,
                receivedItems: receivedItems.map(item => ({
                    itemId: item.poItemId,
                    receivedQuantity: item.quantityReceived,
                    backorderQuantity: Math.max(0, item.quantityOrdered - item.quantityReceived),
                    condition: item.condition,
                    notes: item.notes,
                })),
                receivedBy: currentUser.id,
                notes,
            });

            if (result.success) {
                addToast(`PO ${selectedPoForReceive?.orderId || poId} received successfully.`, 'success');
                setSelectedPoForReceive(null);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Failed to receive PO:', error);
            addToast(`Failed to receive PO: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        }
    };

    // Filter and sort purchase orders by date only
    const sortedPurchaseOrders = useMemo(() => {
        let filtered = [...purchaseOrders];

        // Exclude dropship POs - only those with "DropshipPO" in the order ID
        filtered = filtered.filter(po => {
            const orderId = (po.orderId || '').toLowerCase();
            return !orderId.includes('dropshippo');
        });

        // Sort by date (newest first)
        const sorted = filtered.sort((a, b) =>
            new Date(b.createdAt || b.orderDate || 0).getTime() - new Date(a.createdAt || a.orderDate || 0).getTime()
        );

        // Apply date range filter
        if (dateFilter === 'all') {
            return sorted;
        }

        const now = new Date();
        let cutoffDate = new Date();

        if (dateFilter === '30days') {
            cutoffDate.setDate(now.getDate() - 30);
        } else if (dateFilter === '90days') {
            cutoffDate.setDate(now.getDate() - 90);
        } else if (dateFilter === '12months') {
            cutoffDate.setMonth(now.getMonth() - 12);
        }

        return sorted.filter(po => {
            const poDate = new Date(po.createdAt || po.orderDate);
            // If we can't parse the date, hide it in date-scoped views so unknown-date legacy records don't leak.
            if (isNaN(poDate.getTime())) return false;
            return poDate >= cutoffDate;
        });
    }, [purchaseOrders, dateFilter]);

    // Count of all POs vs filtered
    const totalPOCount = purchaseOrders.length;
    const filteredPOCount = sortedPurchaseOrders.length;

    // Debug logging to understand PO visibility issues
    useEffect(() => {
        console.log('[PurchaseOrders] Data summary:', {
            internalPOs: purchaseOrders.length,
            finalePOs: finalePurchaseOrders.length,
            filteredInternalPOs: sortedPurchaseOrders.length,
            filters: {
                dateFilter,
                showAllFinaleHistory,
            },
            internalPOStatuses: [...new Set(purchaseOrders.map(po => po.status))],
            finalePOStatuses: [...new Set(finalePurchaseOrders.map(fpo => fpo.status))],
        });
    }, [purchaseOrders, finalePurchaseOrders, sortedPurchaseOrders, dateFilter, showAllFinaleHistory]);

    useEffect(() => {
        const unsubscribe = subscribeToPoDrafts(drafts => {
            openPoModalWithDrafts(drafts);
        });
        return () => {
            unsubscribe();
        };
    }, [openPoModalWithDrafts]);

    const focusRequisitionSection = useCallback(() => {
        setIsRequisitionsOpen(true);
        if (typeof window !== 'undefined') {
            requestAnimationFrame(() => {
                document.getElementById('po-requisitions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
    }, [setIsRequisitionsOpen]);

    const focusTrackingPanel = useCallback(() => {
        if (typeof window !== 'undefined') {
            document.getElementById('po-tracking')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, []);

    return (
        <>
            <div className="space-y-6">
                <PageHeader
                    title="Purchase Orders"
                    description="Manage purchase orders, requisitions, and vendor communications"
                    actions={
                        <div className="flex items-center gap-3">
                            {/* View Mode Toggle */}
                            <div className={`inline-flex rounded-lg p-0.5 ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                                <button
                                    onClick={() => setViewMode('unified')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                        viewMode === 'unified'
                                            ? isDark
                                                ? 'bg-blue-500/20 text-blue-300'
                                                : 'bg-blue-500 text-white'
                                            : isDark
                                                ? 'text-gray-400 hover:text-gray-200'
                                                : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    <ListBulletIcon className="w-4 h-4 inline mr-1" />
                                    Simple
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                        viewMode === 'list'
                                            ? isDark
                                                ? 'bg-blue-500/20 text-blue-300'
                                                : 'bg-blue-500 text-white'
                                            : isDark
                                                ? 'text-gray-400 hover:text-gray-200'
                                                : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    <Squares2X2Icon className="w-4 h-4 inline mr-1" />
                                    Detailed
                                </button>
                            </div>
                            {canManagePOs && (
                                <>
                                    {currentUser.role !== 'Staff' && readyQueue.length > 0 && (
                                        <Button
                                            onClick={() => setIsGeneratePoModalOpen(true)}
                                            className="relative"
                                            variant="secondary"
                                        >
                                            Generate from Requisitions
                                            <span className="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs">
                                                {readyQueue.length}
                                            </span>
                                        </Button>
                                    )}
                                    <Button
                                        onClick={handleManualCreateClick}
                                        variant="primary"
                                    >
                                        Create New PO
                                    </Button>
                                    {(isAdminLike || showCommandCenter) && (
                                        <Button
                                            onClick={() => setIsAgentSettingsOpen(true)}
                                            variant="secondary"
                                            className={`p-2 border w-10 h-10 flex items-center justify-center rounded-lg shadow-sm ${isDark
                                                ? 'border-gray-600 hover:border-gray-500 hover:bg-gray-700'
                                                : 'border-gray-300 hover:border-gray-400 hover:bg-gray-100'}`}
                                            aria-label="Agent Command Center & Settings"
                                        >
                                            <SettingsIcon className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                                        </Button>
                                    )}
                                </>
                            )}
                        </div>
                    }
                />
                {/* Purchasing Command Center moved to Agent Settings Modal */}

                {/* Internal Requisitions - Card-based display matching Purchase Orders style */}
                {viewMode !== 'unified' && requisitions.filter(r => !['Ordered', 'Fulfilled', 'Rejected'].includes(r.status)).length > 0 && (
                    <div id="po-requisitions" className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <h2 className={`text-xl font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Internal Requisitions</h2>
                                <StatusBadge variant="info" className="ml-2">
                                    {requisitions.filter(r => !['Ordered', 'Fulfilled', 'Rejected'].includes(r.status)).length} pending
                                </StatusBadge>
                            </div>
                            {canSubmitRequisitions && (
                                <Button
                                    onClick={() => setIsCreateReqModalOpen(true)}
                                    className={`px-3 py-1.5 text-xs rounded transition-colors ${isDark
                                        ? 'bg-blue-600 hover:bg-blue-500 text-white'
                                        : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                                >
                                    + New Requisition
                                </Button>
                            )}
                        </div>
                        <div className="space-y-3">
                            {requisitions
                                .filter(r => !['Ordered', 'Fulfilled', 'Rejected'].includes(r.status))
                                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                .map((req) => {
                                    const reqNumber = `INT-${req.id.slice(0, 5).toUpperCase()}`;
                                    const totalItems = req.items.reduce((sum, item) => sum + item.quantity, 0);
                                    const requester = userMap.get(req.requesterId || '');
                                    const canApprove = req.status === 'Pending' && (isAdminLike || (currentUser.role === 'Manager' && req.department === currentUser.department));
                                    const canOpsApprove = (req.status === 'ManagerApproved' || req.status === 'OpsPending') && (isAdminLike || currentUser.department === 'Operations');

                                    return (
                                        <div
                                            key={req.id}
                                            className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${isDark
                                                ? 'border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/80 to-slate-950 shadow-[0_15px_40px_rgba(2,6,23,0.5)] hover:border-blue-500/40'
                                                : 'border-blue-200/50 bg-gradient-to-br from-white/95 via-blue-50/30 to-white/95 shadow-[0_15px_40px_rgba(15,23,42,0.15)] hover:border-blue-300/60'
                                            }`}
                                        >
                                            {/* Card overlay effect */}
                                            <div className={`pointer-events-none absolute inset-0 ${isDark
                                                ? 'bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.1),rgba(15,23,42,0))]'
                                                : 'bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.6),rgba(219,234,254,0))]'
                                            }`} />

                                            {/* Header */}
                                            <div className={`relative p-3 ${isDark
                                                ? 'bg-gradient-to-r from-slate-900/80 via-slate-900/40 to-slate-900/70'
                                                : 'bg-gradient-to-r from-blue-50/90 via-white/80 to-blue-50/90'
                                            }`}>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div>
                                                            <div className={`text-lg font-semibold font-mono ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                                                                {reqNumber}
                                                            </div>
                                                            <div className={isDark ? 'text-sm text-gray-400' : 'text-sm text-gray-600'}>
                                                                {requester?.name || 'System'} • {req.department}
                                                            </div>
                                                        </div>
                                                        <StatusBadge status={req.status} size="sm">
                                                            {formatStatusText(req.status)}
                                                        </StatusBadge>
                                                        {req.priority && req.priority !== 'normal' && (
                                                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                                                req.priority === 'urgent'
                                                                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                                                    : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                                            }`}>
                                                                {req.priority}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-right">
                                                            <div className={`text-xs uppercase tracking-wide ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>Created</div>
                                                            <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                                {new Date(req.createdAt).toLocaleDateString()}
                                                            </div>
                                                        </div>
                                                        {req.needByDate && (
                                                            <div className="text-right">
                                                                <div className={`text-xs uppercase tracking-wide ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>Need By</div>
                                                                <div className={`text-sm ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                                                                    {new Date(req.needByDate).toLocaleDateString()}
                                                                </div>
                                                            </div>
                                                        )}
                                                        <div className="text-right">
                                                            <div className={`text-xl font-bold ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                                                                {req.items.length} items
                                                            </div>
                                                            <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                                                                {totalItems} units total
                                                            </div>
                                                        </div>
                                                        {/* Action Buttons */}
                                                        <div className="flex items-center gap-2">
                                                            {canApprove && (
                                                                <Button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedReqForApproval(req);
                                                                        setApprovalType('manager');
                                                                    }}
                                                                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-500 text-white transition-colors"
                                                                >
                                                                    Approve
                                                                </Button>
                                                            )}
                                                            {canOpsApprove && (
                                                                <Button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedReqForApproval(req);
                                                                        setApprovalType('ops');
                                                                    }}
                                                                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
                                                                >
                                                                    Ops Approve
                                                                </Button>
                                                            )}
                                                            {(canApprove || canOpsApprove) && (
                                                                <Button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onRejectRequisition(req.id);
                                                                    }}
                                                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${isDark
                                                                        ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                                                                        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                                                    }`}
                                                                >
                                                                    Reject
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Items Preview */}
                                            <div className={`px-3 py-2 border-t ${isDark ? 'border-slate-800/50' : 'border-blue-100'}`}>
                                                <div className="flex flex-wrap gap-2">
                                                    {req.items.slice(0, 4).map((item, idx) => (
                                                        <span key={idx} className={`px-2 py-1 text-xs rounded ${isDark
                                                            ? 'bg-slate-800 text-gray-300'
                                                            : 'bg-blue-50 text-blue-800'
                                                        }`}>
                                                            {item.quantity}x {item.name || item.sku}
                                                        </span>
                                                    ))}
                                                    {req.items.length > 4 && (
                                                        <span className={`px-2 py-1 text-xs rounded ${isDark
                                                            ? 'bg-slate-700 text-gray-400'
                                                            : 'bg-gray-100 text-gray-600'
                                                        }`}>
                                                            +{req.items.length - 4} more
                                                        </span>
                                                    )}
                                                </div>
                                                {req.notes && (
                                                    <p className={`mt-2 text-xs ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                                                        {req.notes}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                )}

                {/* Agent/Auto Controls moved to Modal */}
                <Modal
                    isOpen={isAgentSettingsOpen}
                    onClose={() => setIsAgentSettingsOpen(false)}
                    title="Agent Command Center"
                >
                    <div className="space-y-8 p-1">
                        {showCommandCenter && (
                            <section>
                                <h3 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${isDark ? 'text-gray-400' : 'text-blue-600'}`}>Purchasing Overview</h3>
                                <PurchasingCommandCenter
                                    stats={[
                                        {
                                            id: 'manager',
                                            label: 'Manager Review',
                                            value: managerQueue.length,
                                            description: 'Awaiting department approval',
                                            accent: managerQueue.length > 0 ? 'border-blue-400/50 text-blue-100' : 'border-gray-600 text-gray-300',
                                            onClick: () => { setIsAgentSettingsOpen(false); focusRequisitionSection(); },
                                        },
                                        {
                                            id: 'ops',
                                            label: 'Ops Review',
                                            value: opsQueue.length,
                                            description: 'Strategic buys waiting on Ops',
                                            accent: opsQueue.length > 0 ? 'border-purple-400/50 text-purple-100' : 'border-gray-600 text-gray-300',
                                            onClick: () => { setIsAgentSettingsOpen(false); focusRequisitionSection(); },
                                        },
                                        {
                                            id: 'ready',
                                            label: 'Ready for PO Build',
                                            value: readyQueue.length,
                                            description: 'Fully approved requisitions',
                                            accent: readyQueue.length > 0 ? 'border-sky-400/50 text-sky-100' : 'border-gray-600 text-gray-300',
                                            onClick: () => { setIsAgentSettingsOpen(false); focusRequisitionSection(); },
                                        },
                                        {
                                            id: 'tracking',
                                            label: 'Tracking Missing',
                                            value: trackingAlerts.length,
                                            description: `${followUpBacklog} vendor nudges queued`,
                                            accent: trackingAlerts.length > 0 ? 'border-rose-400/50 text-rose-100' : 'border-gray-600 text-gray-300',
                                            onClick: () => { setIsAgentSettingsOpen(false); focusTrackingPanel(); },
                                        },
                                    ]}
                                    highRiskRequests={urgentRequests}
                                    readyQueue={readyHighlights}
                                    trackingAlerts={trackingAlerts}
                                    followUpBacklog={followUpBacklog}
                                    onFocusRequisitions={focusRequisitionSection}
                                    onFocusTracking={focusTrackingPanel}
                                />
                            </section>
                        )}

                        {(canManagePOs || isAdminLike) && (
                            <section>
                                <h3 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${isDark ? 'text-gray-400' : 'text-blue-600'}`}>Automation Controls</h3>
                                <AutomationControlsSection
                                    canManagePOs={canManagePOs}
                                    isAdminLike={isAdminLike}
                                    followUpBacklog={followUpBacklog}
                                    isRunningFollowUps={isRunningFollowUps}
                                    handleRunFollowUps={handleRunFollowUps}
                                    addToast={addToast}
                                />
                            </section>
                        )}

                        {isAdminLike && (
                            <section>
                                <h3 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${isDark ? 'text-gray-400' : 'text-blue-600'}`}>Autonomous Signing</h3>
                                <AutonomousApprovals addToast={addToast} />
                            </section>
                        )}

                        {isAdminLike && (
                            <section>
                                <h3 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${isDark ? 'text-gray-400' : 'text-blue-600'}`}>System Intelligence</h3>
                                <div className="space-y-6">
                                    <TrustScoreDashboard />
                                    <div>
                                        <h4 className={`text-xs font-semibold mb-2 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>ACTIVE ALERTS</h4>
                                        <AlertFeedComponent limit={20} showResolved={false} />
                                    </div>
                                    <div>
                                        <h4 className={`text-xs font-semibold mb-2 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>VENDOR INTELLIGENCE</h4>
                                        <VendorScorecardComponent limit={10} />
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>
                </Modal>

                {/* VendorResponseWorkbench component removed - was causing ReferenceError */}

                {/* UNIFIED VIEW - Simple table of all POs */}
                {viewMode === 'unified' && (
                    <UnifiedPOList
                        internalPOs={purchaseOrders}
                        finalePOs={finalePurchaseOrders}
                        onViewDetails={(po) => {
                            if (po.source === 'internal') {
                                const internalPo = purchaseOrders.find(p => p.id === po.id);
                                if (internalPo) {
                                    setSelectedPoForDetail(internalPo);
                                    setIsDetailModalOpen(true);
                                }
                            } else {
                                setExpandedFinalePO(po.id);
                                // Switch to detailed view to see the expanded card
                                setViewMode('list');
                            }
                        }}
                        onUpdateTracking={(poId, source) => {
                            if (source === 'internal') {
                                const po = purchaseOrders.find(p => p.id === poId);
                                if (po) {
                                    setSelectedPoForTracking(po);
                                    setIsTrackingModalOpen(true);
                                }
                            } else {
                                const fpo = finalePurchaseOrders.find(p => p.id === poId);
                                if (fpo) {
                                    setFinaleTrackingModal({
                                        isOpen: true,
                                        orderId: fpo.orderId,
                                        currentTracking: fpo.trackingNumber || undefined,
                                        currentCarrier: fpo.trackingCarrier || undefined,
                                    });
                                    setFinaleTrackingInput({
                                        number: fpo.trackingNumber || '',
                                        carrier: fpo.trackingCarrier || '',
                                        eta: fpo.trackingEstimatedDelivery || '',
                                    });
                                }
                            }
                        }}
                        onSendEmail={(po) => {
                            if (po.source === 'internal') {
                                const internalPo = purchaseOrders.find(p => p.id === po.id);
                                if (internalPo) {
                                    setSelectedPoForEmail(internalPo);
                                    setIsEmailModalOpen(true);
                                }
                            }
                        }}
                        addToast={addToast}
                    />
                )}

                {/* DETAILED VIEW - Only ThreeWayMatchReviewQueue (POTrackingDashboard consolidated into UnifiedPOList) */}
                {viewMode !== 'unified' && (
                    <ThreeWayMatchReviewQueue
                        addToast={addToast}
                        maxItems={10}
                        compact
                    />
                )}

                {/* Finale Purchase Orders - Current/Open POs from Finale API (only in detailed view) */}
                {viewMode !== 'unified' && finalePurchaseOrders.length > 0 && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <StatusBadge variant="primary">
                                    {finalePurchaseOrders.filter(fpo => {
                                        // Exclude dropship POs - only those with "DropshipPO" in the order ID
                                        const orderId = (fpo.orderId || '').toLowerCase();
                                        return !orderId.includes('dropshippo');
                                    }).length} Finale POs
                                </StatusBadge>
                                {!showAllFinaleHistory && (
                                    <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>(Active only)</span>
                                )}
                                {showAllFinaleHistory && (
                                    <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>(Including inactive)</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Sort Order Toggle */}
                                <Button
                                    onClick={() => setFinalePOSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                                    className={`px-3 py-1.5 text-xs rounded transition-colors ${isDark 
                                        ? 'bg-gray-800/50 border border-gray-700 text-gray-300 hover:bg-gray-700' 
                                        : 'bg-white/80 border border-gray-200 text-gray-700 hover:bg-gray-100'}`}
                                >
                                    {finalePOSortOrder === 'asc' ? 'Oldest ↑' : 'Newest ↓'}
                                </Button>

                                {/* Active / All History Toggle */}
                                <Button
                                    onClick={() => setShowAllFinaleHistory(!showAllFinaleHistory)}
                                    className={`px-3 py-1.5 text-xs rounded transition-colors ${showAllFinaleHistory
                                        ? 'bg-accent-500/20 text-accent-300 border border-accent-500/50'
                                        : isDark 
                                            ? 'bg-gray-800/50 text-gray-400 border border-gray-700 hover:bg-gray-700'
                                            : 'bg-white/80 text-blue-600 border border-gray-200 hover:bg-gray-100'
                                        }`}
                                >
                                    {showAllFinaleHistory ? 'All History' : 'Active Only'}
                                </Button>

                                <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    Synced from Finale API
                                </span>
                            </div>
                        </div>

                        <div className="grid gap-4">
                            {finalePurchaseOrders
                                .filter(fpo => {
                                    // Exclude dropship POs - only those with "DropshipPO" in the order ID
                                    const orderId = (fpo.orderId || '').toLowerCase();
                                    return !orderId.includes('dropshippo');
                                })
                                .sort((a, b) => {
                                    // Primary sort: order date (newest/oldest)
                                    const aDate = new Date((a as any).orderDate ?? (a as any).order_date ?? 0).getTime();
                                    const bDate = new Date((b as any).orderDate ?? (b as any).order_date ?? 0).getTime();

                                    const aHasDate = Number.isFinite(aDate) && aDate > 0;
                                    const bHasDate = Number.isFinite(bDate) && bDate > 0;

                                    if (aHasDate && bHasDate) {
                                        return finalePOSortOrder === 'asc' ? aDate - bDate : bDate - aDate;
                                    }

                                    // Fallback: order ID
                                    const aId = a.orderId || '';
                                    const bId = b.orderId || '';
                                    return finalePOSortOrder === 'asc' ? aId.localeCompare(bId) : bId.localeCompare(aId);
                                })
                                .map((fpo) => {
                                    const isExpanded = expandedFinalePO === fpo.id;
                                    return (
                                        <div
                                            key={fpo.id}
                                            className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${isDark
                                                ? 'border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/80 to-slate-950 shadow-[0_25px_70px_rgba(2,6,23,0.65)] hover:border-blue-500/40 hover:shadow-[0_30px_90px_rgba(251,191,36,0.25)]'
                                                : 'border-stone-300/30 bg-gradient-to-br from-white/95 via-stone-100/60 to-white/95 shadow-[0_30px_90px_rgba(15,23,42,0.25)] hover:border-stone-400/50 hover:shadow-[0_32px_110px_rgba(120,113,108,0.3)]'
                                                }`}
                                        >
                                            {/* Card overlay effect */}
                                            <div className={`pointer-events-none absolute inset-0 ${isDark
                                                ? 'bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),rgba(15,23,42,0))]'
                                                : 'bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.6),rgba(253,244,223,0))]'
                                                }`} />

                                            {/* Header */}
                                            <div className={`relative p-2.5 ${isDark
                                                ? 'bg-gradient-to-r from-slate-900/80 via-slate-900/40 to-slate-900/70'
                                                : 'bg-gradient-to-r from-gray-50 via-white to-gray-50'
                                                }`}>
                                                <div className={`pointer-events-none absolute inset-x-10 top-0 h-2 blur-2xl ${isDark ? 'opacity-70 bg-white/20' : 'opacity-80 bg-blue-200/60'
                                                    }`} />
                                                <div
                                                    className="flex items-center justify-between cursor-pointer"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setExpandedFinalePO(isExpanded ? null : fpo.id);
                                                    }}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div>
                                                            <div className={`text-lg font-semibold font-mono ${isDark ? 'text-white' : 'text-gray-900'
                                                                }`}>
                                                                PO #{fpo.orderId}
                                                            </div>
                                                            <div className={isDark ? 'text-sm text-gray-400' : 'text-sm text-gray-600'}>
                                                                {fpo.vendorName || 'Unknown Vendor'}
                                                            </div>
                                                        </div>
                                                        <StatusBadge status={fpo.status} size="sm">
                                                            {formatStatusText(fpo.status)}
                                                        </StatusBadge>
                                                        {/* Tracking Status Badge */}
                                                        {fpo.trackingStatus && (
                                                            <StatusBadge status={fpo.trackingStatus} size="sm">
                                                                {formatStatusText(fpo.trackingStatus)}
                                                            </StatusBadge>
                                                        )}
                                                        {/* Three-Way Match Status Badge - Shows on ALL POs */}
                                                        {(() => {
                                                            const matchInfo = matchStatuses[fpo.orderId];
                                                            const status = matchInfo?.status || 'pending_data';
                                                            const score = matchInfo?.score;
                                                            const hasScore = score !== undefined && score !== null;
                                                            
                                                            // Color based on status
                                                            const colorClass = status === 'matched'
                                                                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                                                                : status === 'partial_match'
                                                                    ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                                                                    : status === 'mismatch'
                                                                        ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                                                        : 'bg-gray-500/20 text-gray-400 border border-gray-500/30';
                                                            
                                                            // Icon based on status
                                                            const Icon = status === 'matched'
                                                                ? CheckCircleIcon
                                                                : status === 'mismatch'
                                                                    ? XCircleIcon
                                                                    : AlertTriangleIcon;
                                                            
                                                            return (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setMatchModalPO({ orderId: fpo.orderId, vendorName: fpo.vendorName || 'Unknown Vendor' });
                                                                    }}
                                                                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all hover:scale-105 ${colorClass}`}
                                                                    title={hasScore ? `Match score: ${score}% - Tap to review` : 'Match pending - Tap for details'}
                                                                >
                                                                    <Icon className="w-3 h-3" />
                                                                    <span>{hasScore ? `${score}%` : 'Match'}</span>
                                                                </button>
                                                            );
                                                        })()}
                                                    </div>
                                                    <div className="flex items-center gap-6">
                                                        {/* Tracking Info */}
                                                        {fpo.trackingNumber && (
                                                            <div className="text-right">
                                                                <div className={`text-xs uppercase tracking-wide ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>Tracking</div>
                                                                <div className={`text-sm font-mono ${isDark ? 'text-cyan-400' : 'text-cyan-700'}`}>
                                                                    {fpo.trackingCarrier ? `${fpo.trackingCarrier}: ` : ''}{fpo.trackingNumber}
                                                                </div>
                                                            </div>
                                                        )}
                                                        <div className="text-right">
                                                            <div className={`text-xs uppercase tracking-wide ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>Order Date</div>
                                                            <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                                {fpo.orderDate ? new Date(fpo.orderDate).toLocaleDateString() : 'N/A'}
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className={`text-xs uppercase tracking-wide ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>Expected</div>
                                                            <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                                {fpo.expectedDate ? new Date(fpo.expectedDate).toLocaleDateString() : 'TBD'}
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                                                ${fpo.total?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                                                            </div>
                                                            <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                                                                {fpo.lineCount || 0} items • {Math.round(Number(fpo.totalQuantity) || 0)} units
                                                            </div>
                                                        </div>
                                                        <ChevronDownIcon
                                                            className={`w-5 h-5 transition-transform ${isDark ? 'text-gray-400' : 'text-gray-600'} ${isExpanded ? 'rotate-180' : ''}`}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Delivery Timeline - Always visible */}
                                            <div className="px-3 pb-2">
                                                <PODeliveryTimeline
                                                    status={fpo.status}
                                                    trackingStatus={fpo.trackingStatus}
                                                    orderDate={fpo.orderDate}
                                                    expectedDate={fpo.expectedDate}
                                                    shippedDate={fpo.trackingShippedDate}
                                                    deliveredDate={fpo.trackingDeliveredDate || fpo.receivedDate}
                                                    trackingNumber={fpo.trackingNumber}
                                                    carrier={fpo.trackingCarrier}
                                                    trackingException={fpo.trackingLastException}
                                                    trackingEvents={fpo.trackingEvents}
                                                    isDark={isDark}
                                                    expandable={true}
                                                />
                                            </div>

                                            {/* Expanded Details */}
                                            {isExpanded && (
                                                <div className={`relative p-4 space-y-4 border-t backdrop-blur-lg ${isDark
                                                    ? 'border-white/5 bg-slate-950/70'
                                                    : 'border-gray-200 bg-gray-50'
                                                    }`}>
                                                    {/* Summary Info */}
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className={`rounded-xl border backdrop-blur-lg p-4 space-y-3 ${isDark
                                                            ? 'border-white/10 bg-gradient-to-br from-slate-950/80 via-slate-900/60 to-slate-950/80 shadow-[0_12px_30px_rgba(2,6,23,0.45)]'
                                                            : 'border-gray-200 bg-white shadow-sm'
                                                            }`}>
                                                            <div>
                                                                <div className={`text-xs uppercase tracking-wider mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Vendor Information</div>
                                                                <div className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{fpo.vendorName || 'Unknown'}</div>
                                                                {fpo.vendorUrl && (
                                                                    <div className={`text-xs font-mono mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{fpo.vendorUrl}</div>
                                                                )}
                                                            </div>
                                                            {fpo.facilityId && (
                                                                <div>
                                                                    <div className={`text-xs uppercase tracking-wider mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Facility</div>
                                                                    <div className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{fpo.facilityId}</div>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className={`rounded-xl border backdrop-blur-lg p-4 ${isDark
                                                            ? 'border-white/10 bg-gradient-to-br from-slate-950/80 via-slate-900/60 to-slate-950/80 shadow-[0_12px_30px_rgba(2,6,23,0.45)]'
                                                            : 'border-gray-200 bg-white shadow-sm'}`}>
                                                            <div className={`text-xs uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Financial Summary</div>
                                                            {(() => {
                                                                // Parse Finale values - handles "--" placeholders
                                                                const parseFinaleNumber = (val: string | number | undefined | null): number => {
                                                                    if (val === undefined || val === null || val === '--' || val === '') return 0;
                                                                    if (typeof val === 'number') return val;
                                                                    const num = parseFloat(String(val).replace(/,/g, ''));
                                                                    return isNaN(num) ? 0 : num;
                                                                };
                                                                // Calculate subtotal from line items if stored value seems wrong
                                                                const storedSubtotal = parseFinaleNumber(fpo.subtotal);
                                                                const calcSubtotal = fpo.lineItems?.reduce((sum: number, item: any) => {
                                                                    const qty = parseFinaleNumber(item.quantity_ordered);
                                                                    const price = parseFinaleNumber(item.unit_price);
                                                                    const lineTotal = parseFinaleNumber(item.line_total) || (qty * price);
                                                                    return sum + lineTotal;
                                                                }, 0) || 0;
                                                                // Use calculated if it's higher and non-zero
                                                                const subtotal = calcSubtotal > storedSubtotal ? calcSubtotal : storedSubtotal;
                                                                const tax = parseFinaleNumber(fpo.tax);
                                                                const shipping = parseFinaleNumber(fpo.shipping);
                                                                const total = parseFinaleNumber(fpo.total) || (subtotal + tax + shipping);

                                                                return (
                                                                    <div className="space-y-1 text-sm">
                                                                        <div className={`flex justify-between ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                                            <span>Subtotal:</span>
                                                                            <span className="font-mono">${subtotal.toFixed(2)}</span>
                                                                        </div>
                                                                        {tax > 0 && (
                                                                            <div className={`flex justify-between ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                                                <span>Tax:</span>
                                                                                <span className="font-mono">${tax.toFixed(2)}</span>
                                                                            </div>
                                                                        )}
                                                                        {shipping > 0 && (
                                                                            <div className={`flex justify-between ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                                                <span>Shipping:</span>
                                                                                <span className="font-mono">${shipping.toFixed(2)}</span>
                                                                            </div>
                                                                        )}
                                                                        <div className={`flex justify-between font-semibold pt-2 border-t ${isDark ? 'text-blue-400 border-white/10' : 'text-blue-600 border-gray-200'}`}>
                                                                            <span>Total:</span>
                                                                            <span className="font-mono">${total.toFixed(2)}</span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>

                                                    {/* Tracking Information */}
                                                    {(fpo.trackingNumber || fpo.trackingStatus) && (
                                                        <div className={`rounded-xl border backdrop-blur-lg p-4 ${isDark 
                                                            ? 'border-cyan-500/30 bg-gradient-to-br from-slate-950/80 via-cyan-950/20 to-slate-950/80 shadow-[0_12px_30px_rgba(2,6,23,0.45)]'
                                                            : 'border-cyan-200 bg-gradient-to-br from-white via-cyan-50/30 to-white shadow-cyan-100/50'}`}>
                                                            <div className={`text-xs uppercase tracking-wider mb-3 ${isDark ? 'text-cyan-400' : 'text-cyan-700'}`}>
                                                                <TruckIcon className="w-4 h-4 inline mr-2" />
                                                                Shipment Tracking
                                                            </div>
                                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                                {fpo.trackingNumber && (
                                                                    <div>
                                                                        <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Tracking #</div>
                                                                        <div className={`font-mono ${isDark ? 'text-cyan-300' : 'text-cyan-700'}`}>{fpo.trackingNumber}</div>
                                                                    </div>
                                                                )}
                                                                {fpo.trackingCarrier && (
                                                                    <div>
                                                                        <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Carrier</div>
                                                                        <div className={isDark ? 'text-gray-200' : 'text-gray-800'}>{fpo.trackingCarrier.toUpperCase()}</div>
                                                                    </div>
                                                                )}
                                                                {fpo.trackingStatus && (
                                                                    <div>
                                                                        <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Status</div>
                                                                        <StatusBadge status={fpo.trackingStatus} size="sm">
                                                                            {formatStatusText(fpo.trackingStatus)}
                                                                        </StatusBadge>
                                                                    </div>
                                                                )}
                                                                {fpo.trackingEstimatedDelivery && (
                                                                    <div>
                                                                        <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Est. Delivery</div>
                                                                        <div className={isDark ? 'text-gray-200' : 'text-gray-800'}>
                                                                            {new Date(fpo.trackingEstimatedDelivery).toLocaleDateString()}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {fpo.trackingShippedDate && (
                                                                    <div>
                                                                        <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Shipped</div>
                                                                        <div className={isDark ? 'text-gray-200' : 'text-gray-800'}>
                                                                            {new Date(fpo.trackingShippedDate).toLocaleDateString()}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {fpo.trackingDeliveredDate && (
                                                                    <div>
                                                                        <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Delivered</div>
                                                                        <div className={`${isDark ? 'text-green-400' : 'text-green-700'}`}>
                                                                            {new Date(fpo.trackingDeliveredDate).toLocaleDateString()}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {fpo.trackingLastException && (
                                                                <div className={`mt-3 p-2 rounded-lg text-sm ${isDark ? 'bg-red-900/30 text-red-300 border border-red-500/30' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                                                                    <strong>Exception:</strong> {fpo.trackingLastException}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Notes */}
                                                    {(fpo.publicNotes || fpo.privateNotes) && (
                                                        <div className="space-y-2">
                                                            {fpo.publicNotes && (
                                                                <div>
                                                                    <div className={`text-xs uppercase tracking-wider mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Public Notes</div>
                                                                    <div className={`text-sm p-3 rounded-lg border ${isDark ? 'text-gray-300 bg-slate-950/50 border-white/5' : 'text-gray-700 bg-gray-50/50 border-gray-200'}`}>
                                                                        {fpo.publicNotes}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {fpo.privateNotes && (
                                                                <div>
                                                                    <div className={`text-xs uppercase tracking-wider mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Private Notes</div>
                                                                    <div className={`text-sm p-3 rounded-lg border ${isDark ? 'text-gray-300 bg-slate-950/50 border-white/5' : 'text-gray-700 bg-gray-50/50 border-gray-200'}`}>
                                                                        {fpo.privateNotes}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Line Items */}
                                                    {fpo.lineItems && fpo.lineItems.length > 0 && (
                                                        <div>
                                                            <div className={`text-xs uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Line Items</div>
                                                            <div className={`rounded-xl border backdrop-blur-lg overflow-hidden ${isDark 
                                                                ? 'border-white/10 bg-gradient-to-br from-slate-950/80 via-slate-900/60 to-slate-950/80 shadow-[0_12px_30px_rgba(2,6,23,0.45)]'
                                                                : 'border-gray-200 bg-white shadow-sm'}`}>
                                                                <table className="min-w-full">
                                                                    <thead className={isDark ? 'bg-slate-900/50' : 'bg-gray-50'}>
                                                                        <tr>
                                                                            <th className={`px-3 py-2 text-left text-xs font-medium uppercase ${isDark ? 'text-gray-400' : 'text-blue-600'}`}>#</th>
                                                                            <th className={`px-3 py-2 text-left text-xs font-medium uppercase ${isDark ? 'text-gray-400' : 'text-blue-600'}`}>Product</th>
                                                                            <th className={`px-3 py-2 text-right text-xs font-medium uppercase ${isDark ? 'text-gray-400' : 'text-blue-600'}`}>Ordered</th>
                                                                            <th className={`px-3 py-2 text-right text-xs font-medium uppercase ${isDark ? 'text-gray-400' : 'text-blue-600'}`}>Received</th>
                                                                            <th className={`px-3 py-2 text-right text-xs font-medium uppercase ${isDark ? 'text-gray-400' : 'text-blue-600'}`}>Unit Price</th>
                                                                            <th className={`px-3 py-2 text-right text-xs font-medium uppercase ${isDark ? 'text-gray-400' : 'text-blue-600'}`}>Total</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
                                                                        {fpo.lineItems.map((item: any, idx: number) => {
                                                                            // Parse Finale values - handles "--" placeholders and comma-formatted numbers
                                                                            const parseFinaleNumber = (val: string | number | undefined | null): number => {
                                                                                if (val === undefined || val === null || val === '--' || val === '') return 0;
                                                                                if (typeof val === 'number') return val;
                                                                                const num = parseFloat(String(val).replace(/,/g, ''));
                                                                                return isNaN(num) ? 0 : num;
                                                                            };
                                                                            const qtyOrdered = parseFinaleNumber(item.quantity_ordered);
                                                                            const qtyReceived = parseFinaleNumber(item.quantity_received);
                                                                            const unitPrice = parseFinaleNumber(item.unit_price);
                                                                            const lineTotal = parseFinaleNumber(item.line_total) || (qtyOrdered * unitPrice);

                                                                            return (
                                                                                <tr key={idx} className={isDark ? 'hover:bg-slate-900/30' : 'hover:bg-gray-50/50'}>
                                                                                    <td className={`px-3 py-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{item.line_number || idx + 1}</td>
                                                                                    <td className={`px-3 py-2 text-sm font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{item.product_id || 'N/A'}</td>
                                                                                    <td className={`px-3 py-2 text-sm text-right font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{qtyOrdered > 0 ? qtyOrdered.toLocaleString() : '—'}</td>
                                                                                    <td className={`px-3 py-2 text-sm text-right font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{qtyReceived > 0 ? qtyReceived.toLocaleString() : '—'}</td>
                                                                                    <td className={`px-3 py-2 text-sm text-right font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>${unitPrice.toFixed(2)}</td>
                                                                                    <td className={`px-3 py-2 text-sm text-right font-mono font-semibold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>${lineTotal.toFixed(2)}</td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Actions */}
                                                    <div className={`flex items-center gap-2 pt-3 border-t ${isDark ? 'border-white/5' : 'border-gray-200'}`}>
                                                        <Button
                                                            onClick={() => {
                                                                setFinaleTrackingModal({
                                                                    isOpen: true,
                                                                    orderId: fpo.orderId,
                                                                    currentTracking: fpo.trackingNumber,
                                                                    currentCarrier: fpo.trackingCarrier,
                                                                });
                                                                setFinaleTrackingInput({
                                                                    number: fpo.trackingNumber || '',
                                                                    carrier: fpo.trackingCarrier || '',
                                                                    eta: fpo.trackingEstimatedDelivery?.split('T')[0] || '',
                                                                });
                                                            }}
                                                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${isDark
                                                                ? 'bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30 border border-cyan-600/30'
                                                                : 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100 border border-cyan-200'
                                                            }`}
                                                        >
                                                            <TruckIcon className="w-3.5 h-3.5" />
                                                            {fpo.trackingNumber ? 'Edit Tracking' : 'Add Tracking'}
                                                        </Button>
                                                        <Button
                                                            onClick={async () => {
                                                                try {
                                                                    // Convert Finale PO to PurchaseOrder format for PDF generation
                                                                    const parseFinaleNumber = (val: string | number | undefined | null): number => {
                                                                        if (val === undefined || val === null || val === '--' || val === '') return 0;
                                                                        if (typeof val === 'number') return val;
                                                                        const num = parseFloat(String(val).replace(/,/g, ''));
                                                                        return isNaN(num) ? 0 : num;
                                                                    };
                                                                    const poForPdf: PurchaseOrder = {
                                                                        id: fpo.id,
                                                                        orderId: fpo.orderId,
                                                                        vendorId: fpo.vendorId,
                                                                        status: fpo.status?.toLowerCase() || 'pending',
                                                                        orderDate: fpo.orderDate,
                                                                        expectedDate: fpo.expectedDate,
                                                                        items: fpo.lineItems?.map((item: any) => ({
                                                                            sku: item.product_id || '',
                                                                            name: item.product_id || '',
                                                                            quantity: parseFinaleNumber(item.quantity_ordered),
                                                                            unitCost: parseFinaleNumber(item.unit_price),
                                                                        })) || [],
                                                                        total: parseFinaleNumber(fpo.total),
                                                                        notes: fpo.publicNotes || fpo.privateNotes || '',
                                                                    };
                                                                    // Find vendor by vendorId or by name match (case-insensitive)
                                                                    let vendor = fpo.vendorId ? vendorMap.get(fpo.vendorId) : undefined;
                                                                    if (!vendor && fpo.vendorName) {
                                                                        const vendorNameLower = fpo.vendorName.toLowerCase().trim();
                                                                        vendor = vendors.find(v => v.name?.toLowerCase().trim() === vendorNameLower);
                                                                    }
                                                                    if (vendor) {
                                                                        await generatePoPdf(poForPdf, vendor);
                                                                        addToast(`Downloaded ${fpo.orderId}.pdf`, 'success');
                                                                    } else {
                                                                        addToast(`Could not generate PDF: Vendor "${fpo.vendorName}" not found in system`, 'error');
                                                                    }
                                                                } catch (err) {
                                                                    console.error('PDF generation error:', err);
                                                                    addToast(`PDF generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
                                                                }
                                                            }}
                                                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${isDark
                                                                ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-600/30'
                                                                : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                                                            }`}
                                                        >
                                                            <FileTextIcon className="w-3.5 h-3.5" />
                                                            Download PDF
                                                        </Button>
                                                        <Button
                                                            onClick={() => generateShareLink(fpo.id)}
                                                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${isDark
                                                                ? 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 border border-purple-600/30'
                                                                : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                                                            }`}
                                                        >
                                                            <LinkIcon className="w-3.5 h-3.5" />
                                                            Share Link
                                                        </Button>
                                                    </div>

                                                    {/* Metadata */}
                                                    <div className={`flex items-center justify-between pt-2 text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                                        <div>Finale: <span className={`font-mono ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{fpo.finaleOrderUrl}</span></div>
                                                        <div>Modified: {fpo.finaleLastModified ? new Date(fpo.finaleLastModified).toLocaleString() : 'N/A'}</div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                )}

                {/* Internal Purchase Orders (only in detailed view) */}
                {viewMode !== 'unified' && (
                <div className={`relative overflow-hidden rounded-2xl border shadow-lg ${isDark
                    ? 'border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/80 to-slate-950 shadow-[0_25px_70px_rgba(2,6,23,0.65)]'
                    : 'border-gray-200 bg-white shadow-sm'}`}>
                    {/* Card overlay effect */}
                    <div className={`pointer-events-none absolute inset-0 ${isDark ? 'bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),rgba(15,23,42,0))]' : 'bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.1),rgba(255,255,255,0))]'}`} />

                    <div className={`relative p-4 border-b ${isDark ? 'bg-gradient-to-r from-slate-900/80 via-slate-900/40 to-slate-900/70 border-white/5' : 'bg-gradient-to-r from-gray-50 via-white to-gray-50 border-gray-200'}`}>
                        <div className={`pointer-events-none absolute inset-x-10 top-0 h-2 blur-2xl ${isDark ? 'opacity-70 bg-white/20' : 'opacity-80 bg-blue-200/60'}`} />
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Internal Purchase Orders</h2>
                                <span className={`px-3 py-1 rounded-full text-sm font-medium ${isDark ? 'bg-slate-800/50 text-gray-300 border border-slate-700' : 'bg-gray-100 text-gray-700 border border-gray-300'}`}>
                                    {filteredPOCount} total
                                    {totalPOCount !== filteredPOCount && (
                                        <span className={isDark ? 'text-gray-500 ml-1' : 'text-gray-500 ml-1'}>of {totalPOCount}</span>
                                    )}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 flex-wrap">
                                {/* Date Range Filter */}
                                <div className={`flex items-center gap-1 rounded-lg p-1 border ${isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-white/80 border-gray-200'}`}>
                                    <Button
                                        onClick={() => setDateFilter('all')}
                                        className={`px-3 py-1.5 text-xs rounded transition-colors ${dateFilter === 'all'
                                            ? 'bg-accent-500 text-white'
                                            : isDark ? 'text-gray-400 hover:text-white hover:bg-slate-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                            }`}
                                    >
                                        All Time
                                    </Button>
                                    <Button
                                        onClick={() => setDateFilter('30days')}
                                        className={`px-3 py-1.5 text-xs rounded transition-colors ${dateFilter === '30days'
                                            ? 'bg-blue-500 text-white'
                                            : isDark ? 'text-gray-400 hover:text-white hover:bg-slate-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                            }`}
                                    >
                                        30 Days
                                    </Button>
                                    <Button
                                        onClick={() => setDateFilter('90days')}
                                        className={`px-3 py-1.5 text-xs rounded transition-colors ${dateFilter === '90days'
                                            ? 'bg-purple-500 text-white'
                                            : isDark ? 'text-gray-400 hover:text-white hover:bg-slate-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                            }`}
                                    >
                                        90 Days
                                    </Button>
                                    <Button
                                        onClick={() => setDateFilter('12months')}
                                        className={`px-3 py-1.5 text-xs rounded transition-colors ${dateFilter === '12months'
                                            ? 'bg-green-500 text-white'
                                            : isDark ? 'text-gray-400 hover:text-white hover:bg-slate-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                            }`}
                                    >
                                        12 Months
                                    </Button>
                                </div>

                                <div className={`h-6 w-px mx-1 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />

                                <div className={`flex items-center gap-1 rounded-lg p-1 border ${isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-white/80 border-gray-200'}`}>
                                    <Button
                                        onClick={() => setViewMode('list')}
                                        className={`p-1.5 rounded transition-colors ${viewMode === 'list'
                                            ? isDark ? 'bg-slate-700 text-white' : 'bg-gray-200 text-gray-900'
                                            : isDark ? 'text-gray-400 hover:text-white hover:bg-slate-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                            }`}
                                        title="List View"
                                    >
                                        <ListBulletIcon className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        onClick={() => setViewMode('card')}
                                        className={`p-1.5 rounded transition-colors ${viewMode === 'card'
                                            ? isDark ? 'bg-slate-700 text-white' : 'bg-gray-200 text-gray-900'
                                            : isDark ? 'text-gray-400 hover:text-white hover:bg-slate-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                            }`}
                                        title="Card View"
                                    >
                                        <Squares2X2Icon className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="relative overflow-x-auto max-h-[calc(100vh-320px)]">
                        {sortedPurchaseOrders.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                                <div className={`rounded-full p-6 mb-4 ${isDark ? 'bg-gray-700/30' : 'bg-gray-100'}`}>
                                    <DocumentTextIcon className={`w-16 h-16 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                                </div>
                                <h3 className={`text-xl font-semibold mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                    {purchaseOrders.length === 0 ? 'No Purchase Orders Yet' : 'No Matching Purchase Orders'}
                                </h3>
                                <p className={`mb-4 max-w-md ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                    {purchaseOrders.length === 0
                                        ? "Get started by creating a purchase order manually or importing from your Finale inventory system."
                                        : `${purchaseOrders.length} purchase order${purchaseOrders.length === 1 ? '' : 's'} exist, but none match your current filters.`}
                                </p>
                                {purchaseOrders.length > 0 && (
                                    <div className={`text-sm mb-4 space-y-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                        <div>Current filter: <span className={isDark ? 'text-gray-400' : 'text-gray-700'}>Date = {dateFilter === 'all' ? 'All Time' : dateFilter === '30days' ? 'Last 30 Days' : dateFilter === '90days' ? 'Last 90 Days' : 'Last 12 Months'}</span></div>
                                        {dateFilter !== 'all' && (
                                            <div className="flex gap-2 justify-center mt-3">
                                                <Button
                                                    onClick={() => setDateFilter('all')}
                                                    className="px-3 py-1.5 text-xs bg-accent-500 text-white rounded hover:bg-accent-600"
                                                >
                                                    Show All Time
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {purchaseOrders.length === 0 && canManagePOs && (
                                    <div className="flex gap-3">
                                        <Button
                                            onClick={() => setIsCreatePoModalOpen(true)}
                                            className="inline-flex items-center gap-2 px-4 py-2 bg-accent-500 text-white rounded-md hover:bg-accent-600 transition-colors font-medium"
                                        >
                                            <DocumentTextIcon className="w-5 h-5" />
                                            Create Purchase Order
                                        </Button>
                                        <Button
                                            onClick={async () => {
                                                addToast('💡 To import from Finale, configure API credentials in Settings → Finale Integration', 'info');
                                            }}
                                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-md transition-colors font-medium border ${isDark 
                                                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600' 
                                                : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'}`}
                                        >
                                            <FileTextIcon className="w-5 h-5" />
                                            Import from Finale
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ) : viewMode === 'list' ? (
                            <table className={`min-w-full divide-y ${isDark ? 'divide-slate-800' : 'divide-gray-200'}`}>
                                <thead className={`sticky top-0 z-10 ${isDark ? 'bg-slate-950/50' : 'bg-gray-50/90'}`}>
                                    <tr>
                                        <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>PO Number</th>
                                        <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Vendor</th>
                                        <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Status</th>
                                        <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Date Created</th>
                                        <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Expected Date</th>
                                        <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Tracking</th>
                                        <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Total</th>
                                        <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody className={`divide-y ${isDark ? 'bg-slate-950/30 divide-slate-800/50' : 'bg-white/80 divide-gray-100'}`}>
                                    {sortedPurchaseOrders.map((po) => (
                                        <tr key={po.id} className={`transition-colors duration-200 cursor-pointer ${isDark ? 'hover:bg-slate-900/50' : 'hover:bg-gray-50'}`} onClick={() => handleViewPODetail(po)}>
                                            <td className={`px-6 py-3 whitespace-nowrap text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{po.orderId || po.id}</td>
                                            <td className={`px-6 py-1 whitespace-nowrap text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                <div className="flex items-center gap-2">
                                                    <span>{vendorMap.get(po.vendorId ?? '')?.name || po.supplier || 'Unknown Vendor'}</span>
                                                    {po.followUpCount && po.followUpCount > 0 && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/20 text-sky-200 border border-sky-500/40">
                                                            FU {po.followUpCount}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-1 whitespace-nowrap">
                                                <StatusBadge status={po.status}>
                                                    {formatStatusText(po.status)}
                                                </StatusBadge>
                                            </td>
                                            <td className={`px-6 py-1 whitespace-nowrap text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{new Date(po.orderDate || po.createdAt).toLocaleDateString()}</td>
                                            <td className={`px-6 py-1 whitespace-nowrap text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{po.estimatedReceiveDate ? new Date(po.estimatedReceiveDate).toLocaleDateString() : 'N/A'}</td>
                                            <td className={`px-6 py-1 whitespace-nowrap text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                {po.trackingNumber ? (
                                                    <div className="flex flex-col">
                                                        <span className="font-mono text-sm">{po.trackingNumber}</span>
                                                        <span className="text-xs text-gray-400 uppercase">{po.trackingCarrier || '—'}</span>
                                                        {po.trackingStatus && (
                                                            <StatusBadge status={po.trackingStatus} size="sm" className="mt-1">
                                                                {formatStatusText(po.trackingStatus)}
                                                            </StatusBadge>
                                                        )}
                                                        {po.invoiceDetectedAt && (
                                                            <span className="inline-flex items-center px-2 py-0.5 mt-1 rounded-full border text-[11px] font-medium bg-teal-500/10 text-teal-100 border-teal-500/30">
                                                                Invoice logged {new Date(po.invoiceDetectedAt).toLocaleDateString()}
                                                            </span>
                                                        )}
                                                        {po.lastFollowUpSentAt && (
                                                            <span className="text-xs text-gray-500 mt-1">
                                                                Last follow-up {new Date(po.lastFollowUpSentAt).toLocaleDateString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-gray-500">No tracking</span>
                                                )}
                                            </td>
                                            <td className={`px-6 py-1 whitespace-nowrap text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>${formatPoTotal(po)}</td>
                                            <td className="px-6 py-1 whitespace-nowrap text-sm space-x-2" onClick={(e) => e.stopPropagation()}>
                                                {canManagePOs && (
                                                    <Button
                                                        onClick={() => handleEditTracking(po)}
                                                        className="p-2 text-accent-300 hover:text-accent-100 transition-colors"
                                                        title="Update Tracking"
                                                    >
                                                        <TruckIcon className="w-5 h-5" />
                                                    </Button>
                                                )}
                                                {po.trackingNumber && (
                                                    <Button
                                                        onClick={() => handleOpenTracking(po)}
                                                        className="p-2 text-green-300 hover:text-green-100 transition-colors"
                                                        title="Track Shipment"
                                                    >
                                                        Track
                                                    </Button>
                                                )}
                                                {canManagePOs && ['shipped', 'in_transit', 'out_for_delivery', 'delivered'].includes(po.trackingStatus || '') && po.status !== 'received' && po.status !== 'partial' && (
                                                    <Button
                                                        onClick={() => handleReceivePO(po)}
                                                        className="p-2 text-emerald-400 hover:text-emerald-300 transition-colors"
                                                        title="Mark as Received"
                                                    >
                                                        <CheckCircleIcon className="w-5 h-5" />
                                                    </Button>
                                                )}
                                                <Button onClick={() => handleDownloadPdf(po)} title="Download PDF" className="p-2 text-gray-400 hover:text-accent-400 transition-colors"><FileTextIcon className="w-5 h-5" /></Button>
                                                <Button onClick={() => handleSendEmailClick(po)} title="Send Email" className="p-2 text-gray-400 hover:text-accent-400 transition-colors"><MailIcon className="w-5 h-5" /></Button>
                                                <Button
                                                    onClick={() => handleOpenComm(po)}
                                                    title="View Thread"
                                                    className="p-2 text-gray-400 hover:text-emerald-300 transition-colors"
                                                >
                                                    <DocumentTextIcon className="w-5 h-5" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
                                {sortedPurchaseOrders.map((po) => (
                                    <div
                                        key={po.id}
                                        onClick={() => handleViewPODetail(po)}
                                        className={`rounded-xl border p-4 space-y-4 transition-all duration-200 cursor-pointer ${isDark
                                            ? 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                                            : 'bg-white border-gray-200 shadow-sm hover:shadow-md'
                                            }`}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className={`text-lg font-mono font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{po.orderId || po.id}</h3>
                                                    {po.followUpCount && po.followUpCount > 0 && (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/20 text-sky-200 border border-sky-500/40">
                                                            FU {po.followUpCount}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                    {vendorMap.get(po.vendorId ?? '')?.name || po.supplier || 'Unknown Vendor'}
                                                </div>
                                            </div>
                                            <StatusBadge status={po.status}>
                                                {formatStatusText(po.status)}
                                            </StatusBadge>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                            <div>
                                                <div className={`text-xs uppercase ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Created</div>
                                                <div className={isDark ? 'text-gray-300' : 'text-gray-700'}>{new Date(po.orderDate || po.createdAt).toLocaleDateString()}</div>
                                            </div>
                                            <div>
                                                <div className={`text-xs uppercase ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Expected</div>
                                                <div className={isDark ? 'text-gray-300' : 'text-gray-700'}>{po.estimatedReceiveDate ? new Date(po.estimatedReceiveDate).toLocaleDateString() : '—'}</div>
                                            </div>
                                        </div>

                                        <div className={`pt-3 border-t flex items-center justify-between ${isDark ? 'border-gray-700/50' : 'border-gray-200'}`}>
                                            <div>
                                                <div className={`text-xs uppercase ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Total</div>
                                                <div className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>${formatPoTotal(po)}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className={`text-xs uppercase ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Items</div>
                                                <div className={isDark ? 'text-gray-300' : 'text-gray-700'}>{po.items?.length || 0} lines</div>
                                            </div>
                                        </div>

                                        {po.trackingNumber && (
                                            <div className={`rounded p-2 text-xs ${isDark ? 'bg-gray-800/50' : 'bg-gray-50 border border-gray-200'}`}>
                                                <div className={`flex justify-between items-center mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                    <span>TRACKING</span>
                                                    <span>{po.trackingCarrier}</span>
                                                </div>
                                                <div className={`font-mono truncate ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{po.trackingNumber}</div>
                                                {po.trackingStatus && (
                                                    <div className="mt-1 text-accent-300">{formatStatusText(po.trackingStatus)}</div>
                                                )}
                                            </div>
                                        )}

                                        <div className={`flex items-center justify-end gap-1 pt-2 border-t ${isDark ? 'border-gray-700/50' : 'border-gray-200'}`} onClick={(e) => e.stopPropagation()}>
                                            {canManagePOs && (
                                                <Button onClick={() => handleEditTracking(po)} className={`p-2 text-accent-300 rounded ${isDark ? 'hover:bg-slate-800' : 'hover:bg-gray-100'}`} title="Update Tracking"><TruckIcon className="w-4 h-4" /></Button>
                                            )}
                                            {po.trackingNumber && (
                                                <Button onClick={() => handleOpenTracking(po)} className={`p-2 text-green-300 rounded ${isDark ? 'hover:bg-slate-800' : 'hover:bg-gray-100'}`} title="Track"><TruckIcon className="w-4 h-4" /></Button>
                                            )}
                                            {canManagePOs && ['shipped', 'in_transit', 'out_for_delivery', 'delivered'].includes(po.trackingStatus || '') && (
                                                <Button onClick={() => handleReceivePO(po)} className={`p-2 text-emerald-400 rounded ${isDark ? 'hover:bg-slate-800' : 'hover:bg-gray-100'}`} title="Receive"><CheckCircleIcon className="w-4 h-4" /></Button>
                                            )}
                                            <Button onClick={() => handleDownloadPdf(po)} className={`p-2 rounded ${isDark ? 'text-gray-400 hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'}`} title="PDF"><FileTextIcon className="w-4 h-4" /></Button>
                                            <Button onClick={() => handleSendEmailClick(po)} className={`p-2 rounded ${isDark ? 'text-gray-400 hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'}`} title="Email"><MailIcon className="w-4 h-4" /></Button>
                                            <Button onClick={() => handleOpenComm(po)} className={`p-2 rounded ${isDark ? 'text-gray-400 hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'}`} title="Thread"><DocumentTextIcon className="w-4 h-4" /></Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                )}

            </div >

            <CreatePoModal
                key={modalSession}
                isOpen={isCreatePoModalOpen}
                onClose={handlePoModalClose}
                vendors={vendors}
                inventory={inventory}
                onCreatePo={handlePoModalSubmit}
                initialData={activePoDraft}
            />

            {
                selectedPoForEmail && selectedPoForEmail.vendorId && vendorMap.get(selectedPoForEmail.vendorId) && (
                    <EmailComposerModal
                        isOpen={isEmailModalOpen}
                        onClose={() => setIsEmailModalOpen(false)}
                        onSend={handleSendEmail}
                        purchaseOrder={selectedPoForEmail}
                        vendor={vendorMap.get(selectedPoForEmail.vendorId)!}
                        gmailConnection={gmailConnection}
                        addToast={addToast}
                        onConnectGoogle={onConnectGoogle}
                    />
                )
            }

            {
                selectedPoForComm && selectedPoForComm.vendorId && vendorMap.get(selectedPoForComm.vendorId) && (
                    <PoCommunicationModal
                        isOpen={isCommModalOpen}
                        onClose={handleCloseComm}
                        purchaseOrder={selectedPoForComm}
                        vendor={vendorMap.get(selectedPoForComm.vendorId)!}
                        gmailConnection={gmailConnection}
                        addToast={addToast}
                        onConnectGoogle={onConnectGoogle}
                    />
                )
            }

            <UpdateTrackingModal
                isOpen={isTrackingModalOpen}
                onClose={() => {
                    setIsTrackingModalOpen(false);
                    setSelectedPoForTracking(null);
                }}
                purchaseOrder={selectedPoForTracking}
                onSave={handleSaveTracking}
            />

            {/* Finale PO Tracking Modal */}
            <Modal
                isOpen={finaleTrackingModal.isOpen}
                onClose={() => setFinaleTrackingModal({ isOpen: false, orderId: '' })}
                title={`Add Tracking · PO #${finaleTrackingModal.orderId}`}
            >
                <div className="space-y-4">
                    <div>
                        <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Tracking Number *
                        </label>
                        <input
                            type="text"
                            value={finaleTrackingInput.number}
                            onChange={(e) => setFinaleTrackingInput(prev => ({ ...prev, number: e.target.value }))}
                            placeholder="e.g., 1Z999AA10123456784"
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${isDark
                                ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:ring-cyan-500'
                                : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-blue-500'
                            }`}
                        />
                    </div>
                    <div>
                        <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Carrier
                        </label>
                        <select
                            value={finaleTrackingInput.carrier}
                            onChange={(e) => setFinaleTrackingInput(prev => ({ ...prev, carrier: e.target.value }))}
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${isDark
                                ? 'bg-gray-800 border-gray-700 text-white focus:ring-cyan-500'
                                : 'bg-white border-gray-200 text-gray-900 focus:ring-blue-500'
                            }`}
                        >
                            <option value="">Select carrier...</option>
                            <option value="UPS">UPS</option>
                            <option value="FedEx">FedEx</option>
                            <option value="USPS">USPS</option>
                            <option value="DHL">DHL</option>
                            <option value="LTL">LTL Freight</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div>
                        <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Estimated Delivery
                        </label>
                        <input
                            type="date"
                            value={finaleTrackingInput.eta}
                            onChange={(e) => setFinaleTrackingInput(prev => ({ ...prev, eta: e.target.value }))}
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${isDark
                                ? 'bg-gray-800 border-gray-700 text-white focus:ring-cyan-500'
                                : 'bg-white border-gray-200 text-gray-900 focus:ring-blue-500'
                            }`}
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <Button
                            onClick={() => setFinaleTrackingModal({ isOpen: false, orderId: '' })}
                            className={`px-4 py-2 text-sm ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSaveFinaleTracking}
                            disabled={!finaleTrackingInput.number || savingFinaleTracking}
                            className={`px-4 py-2 text-sm rounded-lg disabled:opacity-50 ${isDark
                                ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                                : 'bg-gray-500 hover:bg-gray-600 text-white'
                            }`}
                        >
                            {savingFinaleTracking ? 'Saving...' : 'Save Tracking'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {
                isAdminLike && (
                    <GeneratePoModal
                        isOpen={isGeneratePoModalOpen}
                        onClose={() => setIsGeneratePoModalOpen(false)}
                        approvedRequisitions={approvedRequisitions}
                        inventory={inventory}
                        vendors={vendors}
                        onPrepareDrafts={handleRequisitionDrafts}
                    />
                )
            }

            {
                canSubmitRequisitions && (
                    <CreateRequisitionModal
                        isOpen={isCreateReqModalOpen}
                        onClose={() => setIsCreateReqModalOpen(false)}
                        inventory={inventory}
                        onCreate={(items, options) => onCreateRequisition(items, options)}
                        defaultOptions={{ requestType: 'consumable', priority: 'medium' }}
                    />
                )
            }

            {/* Requisition Approval Modal */}
            {selectedReqForApproval && (
                <Modal
                    isOpen={!!selectedReqForApproval}
                    onClose={() => setSelectedReqForApproval(null)}
                    title={`${approvalType === 'manager' ? 'Approve' : 'Operations Approve'} Requisition`}
                >
                    <div className="space-y-4">
                        {/* Requisition Header */}
                        <div className={`rounded-lg p-4 ${isDark ? 'bg-slate-800' : 'bg-blue-50'}`}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className={`text-xl font-bold font-mono ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                                        INT-{selectedReqForApproval.id.slice(0, 5).toUpperCase()}
                                    </div>
                                    <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                        {userMap.get(selectedReqForApproval.requesterId || '')?.name || 'System'} • {selectedReqForApproval.department}
                                    </div>
                                </div>
                                <StatusBadge status={selectedReqForApproval.status} size="sm">
                                    {formatStatusText(selectedReqForApproval.status)}
                                </StatusBadge>
                            </div>
                        </div>

                        {/* Items List */}
                        <div>
                            <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                Requested Items ({selectedReqForApproval.items.length})
                            </h4>
                            <div className={`rounded-lg border max-h-48 overflow-y-auto ${isDark ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-white'}`}>
                                <table className="w-full text-sm">
                                    <thead className={isDark ? 'bg-slate-800' : 'bg-gray-50'}>
                                        <tr>
                                            <th className={`px-3 py-2 text-left ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Item</th>
                                            <th className={`px-3 py-2 text-right ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Qty</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedReqForApproval.items.map((item, idx) => (
                                            <tr key={idx} className={isDark ? 'border-t border-slate-700' : 'border-t border-gray-100'}>
                                                <td className={`px-3 py-2 ${isDark ? 'text-gray-300' : 'text-gray-900'}`}>
                                                    <div>{item.name || item.sku}</div>
                                                    {item.name && <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{item.sku}</div>}
                                                </td>
                                                <td className={`px-3 py-2 text-right font-medium ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                                                    {item.quantity}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Notes */}
                        {selectedReqForApproval.notes && (
                            <div>
                                <h4 className={`text-sm font-semibold mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Notes</h4>
                                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                    {selectedReqForApproval.notes}
                                </p>
                            </div>
                        )}

                        {/* Need By Date */}
                        {selectedReqForApproval.needByDate && (
                            <div className={`flex items-center gap-2 text-sm ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                                <CalendarIcon className="w-4 h-4" />
                                Need by: {new Date(selectedReqForApproval.needByDate).toLocaleDateString()}
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex justify-end gap-3 pt-2 border-t border-gray-200 dark:border-slate-700">
                            <Button
                                onClick={() => setSelectedReqForApproval(null)}
                                className={`px-4 py-2 text-sm rounded-lg transition-colors ${isDark
                                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                }`}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={() => {
                                    if (approvalType === 'manager') {
                                        onApproveRequisition(selectedReqForApproval.id);
                                    } else {
                                        onOpsApproveRequisition(selectedReqForApproval.id);
                                    }
                                    setSelectedReqForApproval(null);
                                    addToast(`Requisition INT-${selectedReqForApproval.id.slice(0, 5).toUpperCase()} approved`, 'success');
                                }}
                                className={`px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors ${approvalType === 'manager'
                                    ? 'bg-green-600 hover:bg-green-500'
                                    : 'bg-purple-600 hover:bg-purple-500'
                                }`}
                            >
                                {approvalType === 'manager' ? 'Approve Requisition' : 'Operations Approve'}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {
                selectedPoForReceive && (
                    <ReceivePurchaseOrderModal
                        isOpen={!!selectedPoForReceive}
                        onClose={() => setSelectedPoForReceive(null)}
                        po={selectedPoForReceive}
                        inventory={inventory}
                        onReceive={handleReceiveSubmit}
                        addToast={addToast}
                    />
                )
            }

            {/* PO Detail Modal - Opens when clicking on a PO row/card */}
            <PODetailModal
                isOpen={isDetailModalOpen}
                onClose={() => {
                    setIsDetailModalOpen(false);
                    setSelectedPoForDetail(null);
                }}
                po={selectedPoForDetail}
                vendors={vendors}
                inventory={inventory}
                onSendEmail={(poId) => {
                    const po = purchaseOrders.find(p => p.id === poId);
                    if (po) {
                        setIsDetailModalOpen(false);
                        handleSendEmailClick(po);
                    }
                }}
                onUpdateTracking={(poId) => {
                    const po = purchaseOrders.find(p => p.id === poId);
                    if (po) {
                        setIsDetailModalOpen(false);
                        handleEditTracking(po);
                    }
                }}
                onReceive={(poId) => {
                    const po = purchaseOrders.find(p => p.id === poId);
                    if (po) {
                        setIsDetailModalOpen(false);
                        handleReceivePO(po);
                    }
                }}
            />

            {/* Invoice Review Modal */}
            {selectedPoForInvoice && (
                <InvoiceReviewModal
                    poId={selectedPoForInvoice}
                    isOpen={!!selectedPoForInvoice}
                    onClose={() => setSelectedPoForInvoice(null)}
                    onReviewComplete={() => {
                        setSelectedPoForInvoice(null);
                        addToast('Invoice review completed', 'success');
                    }}
                />
            )}

            {/* Three-Way Match Modal - Opens on badge tap */}
            {matchModalPO && (
                <ThreeWayMatchModal
                    isOpen={!!matchModalPO}
                    onClose={() => setMatchModalPO(null)}
                    poOrderId={matchModalPO.orderId}
                    vendorName={matchModalPO.vendorName}
                    addToast={addToast}
                    onResolved={() => {
                        // Refresh match statuses after resolution
                        setMatchModalPO(null);
                    }}
                />
            )}

            {/* Share Link Modal */}
            {shareLink.isOpen && (
                <Modal
                    isOpen={shareLink.isOpen}
                    onClose={() => setShareLink(prev => ({ ...prev, isOpen: false }))}
                    title="Share Purchase Order"
                >
                    <div className={`space-y-4 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        {shareLink.loading ? (
                            <div className="flex items-center justify-center py-8">
                                <div className={`animate-spin rounded-full h-8 w-8 border-b-2 ${isDark ? 'border-purple-400' : 'border-purple-600'}`}></div>
                                <span className="ml-3">Generating share link...</span>
                            </div>
                        ) : shareLink.error ? (
                            <div className={`p-4 rounded-lg ${isDark ? 'bg-red-900/30 border border-red-700' : 'bg-red-50 border border-red-200'}`}>
                                <p className={`text-sm ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                                    {shareLink.error}
                                </p>
                            </div>
                        ) : (
                            <>
                                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Share this link with your vendor. They can view the PO without logging in.
                                </p>

                                {/* Share URL */}
                                <div className={`flex items-center gap-2 p-3 rounded-lg font-mono text-sm ${isDark ? 'bg-slate-800 border border-slate-700' : 'bg-gray-100 border border-gray-200'}`}>
                                    <input
                                        type="text"
                                        readOnly
                                        value={shareLink.url}
                                        className={`flex-1 bg-transparent outline-none ${isDark ? 'text-purple-400' : 'text-purple-700'}`}
                                        onClick={(e) => (e.target as HTMLInputElement).select()}
                                    />
                                    <Button
                                        onClick={copyShareLink}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors ${isDark
                                            ? 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30'
                                            : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                                        }`}
                                    >
                                        <ClipboardIcon className="w-4 h-4" />
                                        Copy
                                    </Button>
                                </div>

                                {/* Expiration info */}
                                {shareLink.expiresAt && (
                                    <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                        This link expires on {new Date(shareLink.expiresAt).toLocaleDateString()}
                                    </p>
                                )}

                                {/* Features info */}
                                <div className={`p-3 rounded-lg text-xs space-y-1 ${isDark ? 'bg-slate-800/50 border border-slate-700' : 'bg-gray-50 border border-gray-200'}`}>
                                    <p className="font-medium mb-2">Link features:</p>
                                    <p>• Vendor can view PO details without login</p>
                                    <p>• Access is tracked (views, timestamps)</p>
                                    <p>• Pricing and tracking info included</p>
                                    <p>• Link can be revoked at any time</p>
                                </div>

                                {/* Action buttons */}
                                <div className="flex justify-end gap-3 pt-2">
                                    <Button
                                        onClick={() => setShareLink(prev => ({ ...prev, isOpen: false }))}
                                        className={`px-4 py-2 text-sm rounded-lg transition-colors ${isDark
                                            ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                                            : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                        }`}
                                    >
                                        Close
                                    </Button>
                                    <Button
                                        onClick={() => {
                                            copyShareLink();
                                            setShareLink(prev => ({ ...prev, isOpen: false }));
                                        }}
                                        className={`px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors bg-purple-600 hover:bg-purple-500`}
                                    >
                                        Copy & Close
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                </Modal>
            )}
        </>
    );
};

type PurchasingStat = {
    id: string;
    label: string;
    value: number;
    description: string;
    accent: string;
    onClick?: () => void;
};

interface PurchasingCommandCenterProps {
    stats: PurchasingStat[];
    highRiskRequests: InternalRequisition[];
    readyQueue: InternalRequisition[];
    trackingAlerts: PurchaseOrder[];
    followUpBacklog: number;
    onFocusRequisitions: () => void;
    onFocusTracking: () => void;
}

const PurchasingCommandCenter: React.FC<PurchasingCommandCenterProps> = ({
    stats,
    highRiskRequests,
    readyQueue,
    trackingAlerts,
    followUpBacklog,
    onFocusRequisitions,
    onFocusTracking,
}) => {
    const [isOpen, setIsOpen] = React.useState(false);

    return (
        <section className="bg-gray-800/40 border border-gray-700 rounded-2xl overflow-hidden shadow-inner shadow-black/20">
            <div
                className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between p-4 cursor-pointer hover:bg-gray-800/60 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-3">
                    <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    <div>
                        <p className="text-lg font-semibold text-white">Purchasing Command Center</p>
                        <p className="text-sm text-gray-400">Approvals, vendor comms, and tracking health at a glance.</p>
                    </div>
                </div>
                <div className="text-xs text-gray-400">
                    Follow-up backlog:{' '}
                    <span className="font-semibold text-accent-200">{followUpBacklog}</span>
                </div>
            </div>

            {isOpen && (
                <div className="p-4 pt-0 space-y-5">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {stats.map(stat => (
                            <Button
                                key={stat.id}
                                type="button"
                                onClick={() => stat.onClick?.()}
                                className={`text-left rounded-xl border bg-gray-900/40 px-4 py-3 transition-colors hover:bg-gray-900/70 ${stat.accent}`}
                            >
                                <p className="text-[11px] uppercase tracking-wide text-gray-400">{stat.label}</p>
                                <p className="text-3xl font-semibold text-white mt-1">{stat.value}</p>
                                <p className="text-xs text-gray-400 mt-1">{stat.description}</p>
                            </Button>
                        ))}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="bg-gray-900/40 border border-gray-700 rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-gray-200">Requests in Review</p>
                                <Button
                                    className="text-xs text-accent-300 hover:text-accent-100"
                                    onClick={onFocusRequisitions}
                                >
                                    Open queue →
                                </Button>
                            </div>
                            {highRiskRequests.length === 0 ? (
                                <p className="text-xs text-gray-500">No escalations — requisitions are flowing smoothly.</p>
                            ) : (
                                <ul className="space-y-2 text-sm">
                                    {highRiskRequests.map(req => (
                                        <li key={req.id} className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="text-white font-medium">
                                                    {req.items[0]?.name ?? req.id}
                                                </p>
                                                <p className="text-xs text-gray-400">
                                                    {req.department} • {req.priority ?? 'medium'} priority
                                                </p>
                                            </div>
                                            <span className="text-xs text-rose-200">
                                                {req.status === 'OpsPending' ? 'Ops review' : 'Mgr review'}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <div className="border-t border-gray-800 pt-3">
                                <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Ready for PO build</p>
                                {readyQueue.length === 0 ? (
                                    <p className="text-xs text-gray-500">No requisitions are staged for PO creation yet.</p>
                                ) : (
                                    <ul className="space-y-1 text-sm">
                                        {readyQueue.map(req => (
                                            <li key={req.id} className="flex items-center justify-between">
                                                <span className="text-gray-200">{req.id}</span>
                                                <span className="text-xs text-emerald-300">Ready</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                        <div className="bg-gray-900/40 border border-gray-700 rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-gray-200">Logistics Watchlist</p>
                                <Button
                                    className="text-xs text-accent-300 hover:text-accent-100"
                                    onClick={onFocusTracking}
                                >
                                    Update tracking →
                                </Button>
                            </div>
                            {trackingAlerts.length === 0 ? (
                                <p className="text-xs text-gray-500">All active POs have tracking or confirmed ship dates.</p>
                            ) : (
                                <ul className="space-y-2 text-sm">
                                    {trackingAlerts.map(po => (
                                        <li key={po.id} className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="text-white font-medium">{po.orderId || po.id}</p>
                                                <p className="text-xs text-gray-400">
                                                    {po.supplier || 'Vendor TBD'} •{' '}
                                                    {new Date(po.orderDate || po.createdAt).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <span className="text-xs text-yellow-200">
                                                Awaiting tracking
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <div className="rounded-lg border border-yellow-500/30 bg-gray-500/10 px-3 py-2 text-xs text-yellow-100">
                                Keep vendors in the loop — add tracking or run nudges from the automation widget below.
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};

// --- Requisitions Section Component ---

const ReqStatusBadge: React.FC<{ status: InternalRequisition['status'] }> = ({ status }) => {
    const statusConfig: Record<InternalRequisition['status'], string> = {
        Pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        ManagerApproved: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        OpsPending: 'bg-purple-500/20 text-purple-200 border-purple-500/30',
        OpsApproved: 'bg-sky-500/20 text-sky-200 border-sky-500/30',
        Rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
        Ordered: 'bg-green-500/20 text-green-400 border-green-500/30',
        Fulfilled: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30',
    };
    return <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border ${statusConfig[status]}`}>{status.replace(/([A-Z])/g, ' $1').trim()}</span>;
};

interface RequisitionsSectionProps {
    requisitions: InternalRequisition[];
    currentUser: User;
    userMap: Map<string, string>;
    isAdminLike: boolean;
    isOpen: boolean;
    onToggle: () => void;
    onApprove: (id: string) => void;
    onOpsApprove: (id: string) => void;
    onReject: (id: string) => void;
    onCreate: () => void;
    allowManualCreation: boolean;
    canActOnRequisition: (req: InternalRequisition) => boolean;
}

const RequisitionsSection: React.FC<RequisitionsSectionProps> = ({
    requisitions,
    currentUser,
    userMap,
    isAdminLike,
    isOpen,
    onToggle,
    onApprove,
    onOpsApprove,
    onReject,
    onCreate,
    allowManualCreation,
    canActOnRequisition,
}) => {

    const displayedRequisitions = useMemo(() => {
        const sorted = [...requisitions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        if (isAdminLike) return sorted;
        if (currentUser.department === 'Operations') {
            return sorted;
        }
        return sorted.filter(r => r.department === currentUser.department);
    }, [requisitions, currentUser, isAdminLike]);

    const pendingCount = useMemo(() => {
        if (isAdminLike) {
            return displayedRequisitions.filter(r => r.status === 'Pending' || r.status === 'OpsPending').length;
        }
        if (currentUser.department === 'Operations') {
            return displayedRequisitions.filter(r => r.status === 'OpsPending').length;
        }
        return displayedRequisitions.filter(r => r.status === 'Pending').length;
    }, [displayedRequisitions, currentUser, isAdminLike]);

    const canTakeAction = (req: InternalRequisition) => req.status === 'Pending' && canActOnRequisition(req);
    const canOpsTakeAction = (req: InternalRequisition) =>
        (isAdminLike || currentUser.department === 'Operations') &&
        req.opsApprovalRequired &&
        req.status === 'OpsPending';

    const columns: Column<InternalRequisition>[] = [
        {
            key: 'id',
            label: 'Req ID',
            sortable: true,
            width: 'w-24',
            render: (req) => <span className="font-medium text-accent-400">{req.id}</span>
        },
        {
            key: 'requester',
            label: 'Requester',
            sortable: true,
            render: (req) => (
                req.source === 'System' ? (
                    <div className="flex items-center gap-2" title="Auto-generated by AI Planning Insights based on demand forecast">
                        <BotIcon className="w-4 h-4 text-accent-400" />
                        <span className="text-accent-300 font-semibold">AI Generated</span>
                    </div>
                ) : (
                    <span className="text-gray-400">
                        {req.requesterId ? (userMap.get(req.requesterId) || 'Unknown User') : 'Unassigned'}
                    </span>
                )
            )
        },
        {
            key: 'department',
            label: 'Department',
            sortable: true,
            render: (req) => <span className="text-gray-300">{req.department}</span>
        },
        {
            key: 'priority',
            label: 'Need / Priority',
            render: (req) => (
                <div className="flex flex-col gap-1">
                    {req.needByDate ? (
                        <span className="text-xs text-gray-300">
                            Need by {new Date(req.needByDate).toLocaleDateString()}
                        </span>
                    ) : (
                        <span className="text-xs text-gray-500">Flexible</span>
                    )}
                    <div className="flex flex-wrap gap-1">
                        <StatusBadge variant="secondary" size="sm">
                            {req.requestType?.replace('_', ' ') || 'consumable'}
                        </StatusBadge>
                        <StatusBadge
                            variant={req.priority === 'high' ? 'danger' : req.priority === 'medium' ? 'warning' : 'success'}
                            size="sm"
                        >
                            {req.priority} priority
                        </StatusBadge>
                        {req.alertOnly && (
                            <StatusBadge variant="info" size="sm">
                                Alert Only
                            </StatusBadge>
                        )}
                        {req.autoPo && (
                            <StatusBadge variant="primary" size="sm">
                                Auto PO
                            </StatusBadge>
                        )}
                    </div>
                </div>
            )
        },
        {
            key: 'createdAt',
            label: 'Date',
            sortable: true,
            render: (req) => <span className="text-gray-400">{new Date(req.createdAt).toLocaleDateString()}</span>
        },
        {
            key: 'status',
            label: 'Status',
            render: (req) => (
                <div className="flex flex-col gap-1">
                    <ReqStatusBadge status={req.status} />
                    <div className="space-y-1 text-xs text-gray-500">
                        {req.managerApprovedBy && req.managerApprovedAt && (
                            <p>
                                Mgr: {userMap.get(req.managerApprovedBy) ?? req.managerApprovedBy} on{' '}
                                {new Date(req.managerApprovedAt).toLocaleDateString()}
                            </p>
                        )}
                        {req.opsApprovalRequired && (
                            <p>
                                Ops:{' '}
                                {req.opsApprovedAt
                                    ? `${userMap.get(req.opsApprovedBy ?? '') ?? 'Ops'} on ${new Date(req.opsApprovedAt).toLocaleDateString()}`
                                    : 'Pending'}
                            </p>
                        )}
                        {req.forwardedToPurchasingAt && (
                            <p>
                                Sent to Purchasing {new Date(req.forwardedToPurchasingAt).toLocaleDateString()}
                            </p>
                        )}
                    </div>
                </div>
            )
        },
        {
            key: 'items',
            label: 'Items',
            render: (req) => (
                <ul className="space-y-1">
                    {req.items.map(item => {
                        const amazonMeta = item.metadata?.amazon;
                        return (
                            <li key={`${req.id}-${item.sku}`} className="space-y-0.5" title={item.reason}>
                                <div className="text-sm text-gray-300">{item.quantity}x {item.name}</div>
                                {item.externalUrl && (
                                    <a
                                        href={item.externalUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs text-accent-300 hover:text-accent-200 underline decoration-dotted"
                                    >
                                        {item.externalSource === 'amazon' ? 'Amazon link' : 'External link'}
                                    </a>
                                )}
                                {(amazonMeta?.asin || item.metadata?.trackingEmail) && (
                                    <p className="text-[11px] text-gray-500">
                                        {amazonMeta?.asin && (
                                            <>
                                                ASIN {amazonMeta.asin}
                                                {amazonMeta.marketplace ? ` • ${amazonMeta.marketplace}` : ''}
                                            </>
                                        )}
                                        {item.metadata?.trackingEmail && (
                                            <>
                                                {amazonMeta?.asin ? ' • ' : ''}
                                                Tracking via {item.metadata.trackingEmail}
                                            </>
                                        )}
                                    </p>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )
        },
        {
            key: 'actions',
            label: 'Actions',
            visible: isAdminLike || currentUser.role === 'Manager' || currentUser.department === 'Operations',
            render: (req) => (
                <div className="flex gap-2 text-sm justify-end">
                    {canTakeAction(req) && (
                        <>
                            <Button onClick={() => onApprove(req.id)} className="p-2 text-green-400 hover:text-green-300" title="Approve">
                                <CheckCircleIcon className="w-6 h-6" />
                            </Button>
                            <Button onClick={() => onReject(req.id)} className="p-2 text-red-400 hover:text-red-300" title="Reject">
                                <XCircleIcon className="w-6 h-6" />
                            </Button>
                        </>
                    )}
                    {!canTakeAction(req) && canOpsTakeAction(req) && (
                        <>
                            <Button onClick={() => onOpsApprove(req.id)} className="p-2 text-purple-300 hover:text-purple-100" title="Operations Approve">
                                <CheckCircleIcon className="w-6 h-6" />
                            </Button>
                            <Button onClick={() => onReject(req.id)} className="p-2 text-red-400 hover:text-red-300" title="Reject">
                                <XCircleIcon className="w-6 h-6" />
                            </Button>
                        </>
                    )}
                    {!canTakeAction(req) && !canOpsTakeAction(req) && (
                        <span className="text-xs text-gray-500 self-center">Processed</span>
                    )}
                </div>
            )
        }
    ];

    return (
        <CollapsibleSection title="Internal Requisitions" icon={<FileTextIcon className="w-5 h-5" />} count={pendingCount} isOpen={isOpen} onToggle={onToggle}>
            <div className="p-4 flex justify-end">
                {allowManualCreation && (
                    <Button onClick={onCreate} size="sm">
                        Create Manual Requisition
                    </Button>
                )}
            </div>
            <div className="overflow-hidden">
                <Table
                    columns={columns}
                    data={displayedRequisitions}
                    getRowKey={(req) => req.id}
                    stickyHeader
                    hoverable
                    emptyMessage="No requisitions found"
                />
            </div>
        </CollapsibleSection>
    );
};

// --- Automation Controls Section Component ---
interface AutomationControlsSectionProps {
    canManagePOs: boolean;
    isAdminLike: boolean;
    followUpBacklog: number;
    isRunningFollowUps: boolean;
    handleRunFollowUps: () => void;
    addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const AutomationControlsSection: React.FC<AutomationControlsSectionProps> = ({
    canManagePOs,
    isAdminLike,
    followUpBacklog,
    isRunningFollowUps,
    handleRunFollowUps,
    addToast,
}) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const [settings, setSettings] = React.useState<any>(null);
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);

    useEffect(() => {
        if (isAdminLike) {
            loadSettings();
        } else {
            setLoading(false);
        }
    }, [isAdminLike]);

    const loadSettings = async () => {
        try {
            const { supabase } = await import('../lib/supabase/client');
            const { data, error } = await supabase
                .from('autonomous_po_settings')
                .select('*')
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            if (data) {
                setSettings(data);
            } else {
                const defaultSettings = {
                    autonomous_shipping_enabled: false,
                    autonomous_pricing_enabled: false,
                    require_approval_for_shipping: true,
                    require_approval_for_pricing: true,
                    auto_approve_below_threshold: 100,
                };

                const { data: newSettings, error: insertError } = await supabase
                    .from('autonomous_po_settings')
                    .insert(defaultSettings)
                    .select()
                    .single();

                if (insertError) throw insertError;
                setSettings(newSettings);
            }
        } catch (error) {
            console.error('Error loading autonomous settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const updateSetting = async (key: string, value: any) => {
        if (!settings) return;

        setSaving(true);
        try {
            const { supabase } = await import('../lib/supabase/client');
            const { error } = await supabase
                .from('autonomous_po_settings')
                .update({
                    [key]: value,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', settings.id);

            if (error) throw error;

            setSettings((prev: any) => prev ? { ...prev, [key]: value } : null);
            addToast('Settings updated', 'success');
        } catch (error) {
            console.error('Error updating settings:', error);
            addToast('Failed to update settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-gray-800/40 border border-gray-700 rounded-2xl overflow-hidden shadow-inner shadow-black/20">
            <div
                className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between p-4 cursor-pointer hover:bg-gray-800/60 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-3">
                    <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    <div>
                        <p className="text-lg font-semibold text-white">PO Automation & Controls</p>
                        <p className="text-sm text-gray-400">
                            {canManagePOs && `${followUpBacklog} PO${followUpBacklog === 1 ? '' : 's'} awaiting follow-up`}
                            {canManagePOs && isAdminLike && ' • '}
                            {isAdminLike && 'Autonomous shipping & pricing updates'}
                        </p>
                    </div>
                </div>
                {isOpen && saving && (
                    <div className="flex items-center gap-2 text-sm text-accent-300">
                        <BotIcon className="w-4 h-4 animate-spin" />
                        Saving...
                    </div>
                )}
            </div>

            {isOpen && (
                <div className="p-4 pt-0 space-y-6 border-t border-gray-700/50">
                    {/* Follow-up Automation */}
                    {canManagePOs && (
                        <div className="space-y-3">
                            <h3 className="text-base font-semibold text-accent-100">Follow-up Automation</h3>
                            <p className="text-xs text-gray-400">
                                Gmail nudges reuse the original thread so vendors reply with tracking only.
                            </p>
                            <div className="flex items-center justify-between gap-4 bg-accent-900/20 border border-accent-500/30 rounded-lg p-4">
                                <div className="flex-1">
                                    <p className="text-sm text-accent-100">
                                        <span className="font-semibold">{followUpBacklog}</span> PO{followUpBacklog === 1 ? '' : 's'} waiting on tracking details
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <Button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRunFollowUps();
                                        }}
                                        disabled={isRunningFollowUps}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-accent-500 text-white text-sm font-semibold hover:bg-accent-600 disabled:opacity-60 transition-colors"
                                    >
                                        {isRunningFollowUps ? 'Sending…' : 'Nudge Vendors'}
                                    </Button>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500">
                                Configure templates in Settings → Follow-up Rules.
                            </p>
                        </div>
                    )}

                    {/* Autonomous Controls */}
                    {isAdminLike && !loading && settings && (
                        <div className="space-y-4 pt-4 border-t border-gray-700/50">
                            <h3 className="text-base font-semibold text-white">Autonomous PO Controls</h3>

                            {/* Shipping Updates */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-sm font-semibold text-white">Shipping Status Updates</h4>
                                        <p className="text-xs text-gray-400">Automatically update PO status based on carrier tracking</p>
                                    </div>
                                    <Button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            updateSetting('autonomous_shipping_enabled', !settings.autonomous_shipping_enabled);
                                        }}
                                        disabled={saving}
                                        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${settings.autonomous_shipping_enabled
                                            ? 'bg-accent-500 text-white hover:bg-accent-600'
                                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                            }`}
                                    >
                                        {settings.autonomous_shipping_enabled ? (
                                            <><CheckCircleIcon className="w-4 h-4 mr-2 inline" /> Enabled</>
                                        ) : (
                                            <><XCircleIcon className="w-4 h-4 mr-2 inline" /> Disabled</>
                                        )}
                                    </Button>
                                </div>

                                {settings.autonomous_shipping_enabled && (
                                    <div className="ml-6 space-y-2">
                                        <label className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={settings.require_approval_for_shipping}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    updateSetting('require_approval_for_shipping', e.target.checked);
                                                }}
                                                disabled={saving}
                                                className="w-4 h-4 text-accent-500 bg-gray-700 border-gray-600 rounded focus:ring-accent-500"
                                            />
                                            <span className="text-sm text-gray-300">Require approval for autonomous shipping updates</span>
                                        </label>
                                    </div>
                                )}
                            </div>

                            {/* Pricing Updates */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-sm font-semibold text-white">Pricing Updates</h4>
                                        <p className="text-xs text-gray-400">Automatically update item prices from vendor communications</p>
                                    </div>
                                    <Button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            updateSetting('autonomous_pricing_enabled', !settings.autonomous_pricing_enabled);
                                        }}
                                        disabled={saving}
                                        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${settings.autonomous_pricing_enabled
                                            ? 'bg-accent-500 text-white hover:bg-accent-600'
                                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                            }`}
                                    >
                                        {settings.autonomous_pricing_enabled ? (
                                            <><CheckCircleIcon className="w-4 h-4 mr-2 inline" /> Enabled</>
                                        ) : (
                                            <><XCircleIcon className="w-4 h-4 mr-2 inline" /> Disabled</>
                                        )}
                                    </Button>
                                </div>

                                {settings.autonomous_pricing_enabled && (
                                    <div className="ml-6 space-y-3">
                                        <label className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={settings.require_approval_for_pricing}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    updateSetting('require_approval_for_pricing', e.target.checked);
                                                }}
                                                disabled={saving}
                                                className="w-4 h-4 text-accent-500 bg-gray-700 border-gray-600 rounded focus:ring-accent-500"
                                            />
                                            <span className="text-sm text-gray-300">Require approval for autonomous pricing updates</span>
                                        </label>

                                        <div className="flex items-center gap-3">
                                            <label className="text-sm text-gray-300">Auto-approve changes below:</label>
                                            <div className="flex items-center gap-2">
                                                <span className="text-accent-400">$</span>
                                                <input
                                                    type="number"
                                                    value={settings.auto_approve_below_threshold}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        updateSetting('auto_approve_below_threshold', parseFloat(e.target.value) || 0);
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    disabled={saving}
                                                    className="w-20 px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
                                                    min="0"
                                                    step="0.01"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Status Summary */}
                            <div className="border-t border-gray-700 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div className="space-y-2">
                                    <p className="text-gray-400">Shipping Automation</p>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${settings.autonomous_shipping_enabled ? 'bg-green-400' : 'bg-gray-600'}`} />
                                        <span className={settings.autonomous_shipping_enabled ? 'text-green-300' : 'text-gray-500'}>
                                            {settings.autonomous_shipping_enabled ? 'Active' : 'Disabled'}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-gray-400">Pricing Automation</p>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${settings.autonomous_pricing_enabled ? 'bg-green-400' : 'bg-gray-600'}`} />
                                        <span className={settings.autonomous_pricing_enabled ? 'text-green-300' : 'text-gray-500'}>
                                            {settings.autonomous_pricing_enabled ? 'Active' : 'Disabled'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="text-xs text-gray-500">
                                Last updated: {new Date(settings.updated_at).toLocaleString()}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PurchaseOrders;
