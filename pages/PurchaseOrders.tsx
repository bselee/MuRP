

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
import { MailIcon, FileTextIcon, ChevronDownIcon, BotIcon, CheckCircleIcon, XCircleIcon, TruckIcon, DocumentTextIcon, CalendarIcon, SettingsIcon, Squares2X2Icon, ListBulletIcon } from '../components/icons';
import CollapsibleSection from '../components/CollapsibleSection';
import CreatePoModal from '../components/CreatePoModal';
import Modal from '../components/Modal';
import EmailComposerModal from '../components/EmailComposerModal';
import GeneratePoModal from '../components/GeneratePoModal';
import CreateRequisitionModal from '../components/CreateRequisitionModal';
import PoCommunicationModal from '../components/PoCommunicationModal';
import ReorderQueueDashboard, { ReorderQueueVendorGroup } from '../components/ReorderQueueDashboard';
import DraftPOReviewSection from '../components/DraftPOReviewSection';
import POTrackingDashboard from '../components/POTrackingDashboard';
import ReceivePurchaseOrderModal from '../components/ReceivePurchaseOrderModal';
import UpdateTrackingModal from '../components/UpdateTrackingModal';
import { subscribeToPoDrafts } from '../lib/poDraftBridge';
import { generatePoPdf } from '../services/pdfService';
import { usePermissions } from '../hooks/usePermissions';
import { runFollowUpAutomation } from '../services/followUpService';
import { getGoogleGmailService } from '../services/googleGmailService';
import AutonomousControls from '../components/AutonomousControls';
import AutonomousApprovals from '../components/AutonomousApprovals';
import AlertFeedComponent from '../components/AlertFeedComponent';
import TrustScoreDashboard from '../components/TrustScoreDashboard';
import VendorScorecardComponent from '../components/VendorScorecardComponent';
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
    const [activePoDraft, setActivePoDraft] = useState<PoDraftConfig | undefined>(undefined);
    const [pendingPoDrafts, setPendingPoDrafts] = useState<PoDraftConfig[]>([]);
    const [modalSession, setModalSession] = useState(0);
    const [isRunningFollowUps, setIsRunningFollowUps] = useState(false);
    const [showAllPOs, setShowAllPOs] = useState(true); // Default: show all time
    const [expandedFinalePO, setExpandedFinalePO] = useState<string | null>(null);
    const [isCommandCenterOpen, setIsCommandCenterOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>('all'); // Default: show all statuses
    const [finalePOStatusFilter, setFinalePOStatusFilter] = useState<string>('all');
    const [finalePOSortOrder, setFinalePOSortOrder] = useState<'asc' | 'desc'>('desc'); // Default newest first
    const [hideDropship, setHideDropship] = useState(false); // Default: show dropship too (user can toggle off)
    const [isAgentSettingsOpen, setIsAgentSettingsOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'card'>('list');

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
        const total = typeof po.total === 'number' ? po.total : po.items.reduce((sum, item) => sum + (item.lineTotal ?? item.quantity * (item.price ?? 0)), 0);
        return total.toFixed(2);
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

    const handleReceivePO = (po: PurchaseOrder) => {
        setSelectedPoForReceive(po);
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

    // Calculate 12 months ago for filtering
    const twelveMonthsAgo = useMemo(() => {
        const date = new Date();
        date.setMonth(date.getMonth() - 12);
        return date;
    }, []);

    // Filter and sort purchase orders by status and date
    const sortedPurchaseOrders = useMemo(() => {
        let filtered = [...purchaseOrders];

        // Filter by status
        if (statusFilter === 'active') {
            filtered = filtered.filter(po =>
                ['draft', 'pending', 'sent', 'confirmed', 'committed'].includes(po.status.toLowerCase())
            );
        } else if (statusFilter === 'committed') {
            filtered = filtered.filter(po => po.status.toLowerCase() === 'committed');
        } else if (statusFilter === 'received') {
            filtered = filtered.filter(po =>
                ['received', 'partial'].includes(po.status.toLowerCase())
            );
        } else if (statusFilter === 'cancelled') {
            filtered = filtered.filter(po => po.status.toLowerCase() === 'cancelled');
        }
        // 'all' shows everything

        const sorted = filtered.sort((a, b) =>
            new Date(b.createdAt || b.orderDate || 0).getTime() - new Date(a.createdAt || a.orderDate || 0).getTime()
        );

        if (showAllPOs) {
            return sorted;
        }

        // Filter to POs created in the last 12 months
        return sorted.filter(po => {
            const poDate = new Date(po.createdAt || po.orderDate);
            // Handle invalid dates - show them if we can't parse the date
            if (isNaN(poDate.getTime())) return true;
            return poDate >= twelveMonthsAgo;
        });
    }, [purchaseOrders, showAllPOs, twelveMonthsAgo, statusFilter]);

    // Count of all POs vs filtered
    const totalPOCount = purchaseOrders.length;
    const filteredPOCount = sortedPurchaseOrders.length;

    // UNIFIED PO LIST - Combine Internal and Finale POs into one list
    const unifiedPOs = useMemo(() => {
        // Add source to internal POs
        const internalWithSource = sortedPurchaseOrders.map(po => ({
            ...po,
            source: 'Internal' as const,
            displayDate: po.createdAt || po.orderDate,
        }));

        // Filter and add source to Finale POs
        const finaleFiltered = finalePurchaseOrders.filter(fpo => {
            // Dropship filter
            if (hideDropship) {
                const searchText = `${fpo.orderId || ''} ${fpo.publicNotes || ''} ${(fpo as any).privateNotes || ''}`.toLowerCase();
                if (searchText.includes('dropship') || searchText.includes('drop-ship') || searchText.includes('drop ship')) {
                    return false;
                }
            }
            // Status filter
            if (statusFilter === 'all') return true;
            if (statusFilter === 'active') return ['Pending', 'DRAFT', 'Draft', 'Submitted', 'SUBMITTED', 'Ordered'].includes(fpo.status);
            if (statusFilter === 'committed') return ['Submitted', 'SUBMITTED', 'Ordered'].includes(fpo.status);
            if (statusFilter === 'received') return ['Received', 'RECEIVED', 'Partial', 'PARTIALLY_RECEIVED'].includes(fpo.status);
            if (statusFilter === 'cancelled') return ['Cancelled', 'CANCELLED'].includes(fpo.status);
            return false;
        });

        const finaleWithSource = finaleFiltered.map(fpo => ({
            ...fpo,
            source: 'Finale' as const,
            displayDate: fpo.orderDate,
        }));

        // Combine and sort by date (newest first)
        return [...internalWithSource, ...finaleWithSource].sort((a, b) => {
            const dateA = new Date(a.displayDate || 0).getTime();
            const dateB = new Date(b.displayDate || 0).getTime();
            return dateB - dateA;
        });
    }, [sortedPurchaseOrders, finalePurchaseOrders, hideDropship, statusFilter]);

    // Debug logging to understand PO visibility issues
    useEffect(() => {
        console.log('[PurchaseOrders] Data summary:', {
            internalPOs: purchaseOrders.length,
            finalePOs: finalePurchaseOrders.length,
            filteredInternalPOs: sortedPurchaseOrders.length,
            filters: {
                statusFilter,
                showAllPOs,
                showAllFinaleHistory,
                hideDropship,
                finalePOStatusFilter,
            },
            internalPOStatuses: [...new Set(purchaseOrders.map(po => po.status))],
            finalePOStatuses: [...new Set(finalePurchaseOrders.map(fpo => fpo.status))],
        });
    }, [purchaseOrders, finalePurchaseOrders, sortedPurchaseOrders, statusFilter, showAllPOs, showAllFinaleHistory, hideDropship, finalePOStatusFilter]);

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
                        canManagePOs && (
                            <div className="flex items-center gap-3">
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
                                        className="p-2 border border-gray-600 hover:border-gray-500 hover:bg-gray-700 w-10 h-10 flex items-center justify-center rounded-lg shadow-sm"
                                        aria-label="Agent Command Center & Settings"
                                    >
                                        <SettingsIcon className="w-5 h-5 text-gray-400 group-hover:text-white" />
                                    </Button>
                                )}
                            </div>
                        )
                    }

                />
                {/* Purchasing Command Center moved to Agent Settings Modal */}

                <div id="po-requisitions">
                    <RequisitionsSection
                        requisitions={requisitions}
                        currentUser={currentUser}
                        userMap={userMap}
                        isAdminLike={isAdminLike}
                        isOpen={isRequisitionsOpen}
                        onToggle={() => setIsRequisitionsOpen(!isRequisitionsOpen)}
                        onApprove={onApproveRequisition}
                        onOpsApprove={onOpsApproveRequisition}
                        onReject={onRejectRequisition}
                        onCreate={() => setIsCreateReqModalOpen(true)}
                        allowManualCreation={canSubmitRequisitions}
                        canActOnRequisition={permissions.canApproveRequisition}
                    />
                </div>

                {/* Agent/Auto Controls moved to Modal */}
                <Modal
                    isOpen={isAgentSettingsOpen}
                    onClose={() => setIsAgentSettingsOpen(false)}
                    title="Agent Command Center"
                >
                    <div className="space-y-8 p-1">
                        {showCommandCenter && (
                            <section>
                                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Purchasing Overview</h3>
                                <PurchasingCommandCenter
                                    stats={[
                                        {
                                            id: 'manager',
                                            label: 'Manager Review',
                                            value: managerQueue.length,
                                            description: 'Awaiting department approval',
                                            accent: managerQueue.length > 0 ? 'border-amber-400/50 text-amber-100' : 'border-gray-600 text-gray-300',
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
                                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Automation Controls</h3>
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
                                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Autonomous Signing</h3>
                                <AutonomousApprovals addToast={addToast} />
                            </section>
                        )}

                        {isAdminLike && (
                            <section>
                                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">System Intelligence</h3>
                                <div className="space-y-6">
                                    <TrustScoreDashboard />
                                    <div>
                                        <h4 className="text-xs font-semibold text-gray-500 mb-2">ACTIVE ALERTS</h4>
                                        <AlertFeedComponent limit={20} showResolved={false} />
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-semibold text-gray-500 mb-2">VENDOR INTELLIGENCE</h4>
                                        <VendorScorecardComponent limit={10} />
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>
                </Modal>

                {/* VendorResponseWorkbench component removed - was causing ReferenceError */}

                {/* Finale Purchase Orders - DISABLED - Now using unified list */}
                {false && finalePurchaseOrders.length > 0 && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-semibold text-gray-300">📦 External Purchase Orders</h2>
                                <StatusBadge variant="primary" className="ml-2">
                                    {finalePurchaseOrders.filter(fpo => {
                                        // Dropship filter - check in ORDER ID, notes, and all text fields
                                        if (hideDropship) {
                                            const searchText = `${fpo.orderId || ''} ${fpo.publicNotes || ''} ${(fpo as any).privateNotes || ''}`.toLowerCase();
                                            // Catch all dropship variations: dropship, drop-ship, drop ship, dropshippo, etc.
                                            if (searchText.includes('dropship') || searchText.includes('drop-ship') || searchText.includes('drop ship')) {
                                                return false;
                                            }
                                        }
                                        // Status filter
                                        if (finalePOStatusFilter === 'all') return true;
                                        if (finalePOStatusFilter === 'committed') return ['Submitted', 'SUBMITTED', 'Ordered'].includes(fpo.status);
                                        if (finalePOStatusFilter === 'received') return ['Received', 'RECEIVED', 'Partial', 'PARTIALLY_RECEIVED'].includes(fpo.status);
                                        if (finalePOStatusFilter === 'pending') return ['Pending', 'DRAFT', 'Draft'].includes(fpo.status);
                                        return false;
                                    }).length} {finalePOStatusFilter === 'all' ? 'total' : finalePOStatusFilter}
                                </StatusBadge>
                                {!showAllFinaleHistory && (
                                    <span className="text-xs text-gray-500">(Active only)</span>
                                )}
                                {showAllFinaleHistory && (
                                    <span className="text-xs text-gray-500">(Including inactive)</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 bg-gray-800/50 rounded-lg p-1 border border-gray-700">
                                    <Button
                                        onClick={() => setFinalePOStatusFilter('all')}
                                        className={`px-3 py-1 text-xs rounded transition-colors ${finalePOStatusFilter === 'all'
                                            ? 'bg-accent-500 text-white'
                                            : 'text-gray-400 hover:text-white hover:bg-gray-700'
                                            }`}
                                    >
                                        All
                                    </Button>
                                    <Button
                                        onClick={() => setFinalePOStatusFilter('committed')}
                                        className={`px-3 py-1 text-xs rounded transition-colors ${finalePOStatusFilter === 'committed'
                                            ? 'bg-blue-500 text-white'
                                            : 'text-gray-400 hover:text-white hover:bg-gray-700'
                                            }`}
                                    >
                                        Committed
                                    </Button>
                                    <Button
                                        onClick={() => setFinalePOStatusFilter('pending')}
                                        className={`px-3 py-1 text-xs rounded transition-colors ${finalePOStatusFilter === 'pending'
                                            ? 'bg-amber-500 text-white'
                                            : 'text-gray-400 hover:text-white hover:bg-gray-700'
                                            }`}
                                    >
                                        Pending
                                    </Button>
                                    <Button
                                        onClick={() => setFinalePOStatusFilter('received')}
                                        className={`px-3 py-1 text-xs rounded transition-colors ${finalePOStatusFilter === 'received'
                                            ? 'bg-green-500 text-white'
                                            : 'text-gray-400 hover:text-white hover:bg-gray-700'
                                            }`}
                                    >
                                        Received
                                    </Button>
                                </div>

                                {/* Sort Order Toggle */}
                                <Button
                                    onClick={() => setFinalePOSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                                    className="px-3 py-1.5 text-xs rounded bg-gray-800/50 border border-gray-700 text-gray-300 hover:bg-gray-700 transition-colors"
                                >
                                    {finalePOSortOrder === 'asc' ? 'A-Z ↑' : 'Z-A ↓'}
                                </Button>

                                {/* Dropship Filter Toggle */}
                                <Button
                                    onClick={() => setHideDropship(!hideDropship)}
                                    className={`px-3 py-1.5 text-xs rounded transition-colors ${hideDropship
                                        ? 'bg-red-500/20 text-red-300 border border-red-500/50'
                                        : 'bg-gray-800/50 text-gray-400 border border-gray-700 hover:bg-gray-700'
                                        }`}
                                >
                                    {hideDropship ? '🚫 Dropship Hidden' : 'Show All'}
                                </Button>

                                {/* Active / All History Toggle */}
                                <Button
                                    onClick={() => setShowAllFinaleHistory(!showAllFinaleHistory)}
                                    className={`px-3 py-1.5 text-xs rounded transition-colors ${showAllFinaleHistory
                                        ? 'bg-accent-500/20 text-accent-300 border border-accent-500/50'
                                        : 'bg-gray-800/50 text-gray-400 border border-gray-700 hover:bg-gray-700'
                                        }`}
                                >
                                    {showAllFinaleHistory ? 'All History' : 'Active Only'}
                                </Button>

                                <span className="text-xs text-gray-400">
                                    Synced from Finale API
                                </span>
                            </div>
                        </div>

                        <div className="grid gap-4">
                            {finalePurchaseOrders
                                .filter(fpo => {
                                    // Dropship filter - check in ORDER ID, notes, and all text fields (catches everything!)
                                    if (hideDropship) {
                                        const searchText = `${fpo.orderId || ''} ${fpo.publicNotes || ''} ${(fpo as any).privateNotes || ''}`.toLowerCase();
                                        // Catch all dropship variations: dropship, drop-ship, drop ship, dropshippo, etc.
                                        if (searchText.includes('dropship') || searchText.includes('drop-ship') || searchText.includes('drop ship')) {
                                            return false;
                                        }
                                    }
                                    // Status filter
                                    if (finalePOStatusFilter === 'all') return true;
                                    if (finalePOStatusFilter === 'committed') return ['Submitted', 'SUBMITTED', 'Ordered'].includes(fpo.status);
                                    if (finalePOStatusFilter === 'received') return ['Received', 'RECEIVED', 'Partial', 'PARTIALLY_RECEIVED'].includes(fpo.status);
                                    if (finalePOStatusFilter === 'pending') return ['Pending', 'DRAFT', 'Draft'].includes(fpo.status);
                                    return false;
                                })
                                .sort((a, b) => {
                                    // Sort by order ID (A-Z or Z-A)
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
                                                ? 'border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/80 to-slate-950 shadow-[0_25px_70px_rgba(2,6,23,0.65)] hover:border-amber-500/40 hover:shadow-[0_30px_90px_rgba(251,191,36,0.25)]'
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
                                                : 'bg-gradient-to-r from-amber-50/90 via-white/80 to-amber-50/90'
                                                }`}>
                                                <div className={`pointer-events-none absolute inset-x-10 top-0 h-2 blur-2xl ${isDark ? 'opacity-70 bg-white/20' : 'opacity-80 bg-amber-200/60'
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
                                                            <div className={`text-lg font-semibold font-mono ${isDark ? 'text-amber-400' : 'text-amber-700'
                                                                }`}>
                                                                PO #{fpo.orderId}
                                                            </div>
                                                            <div className={isDark ? 'text-sm text-gray-400' : 'text-sm text-gray-600'}>
                                                                {fpo.vendorName || 'Unknown Vendor'}
                                                            </div>
                                                        </div>
                                                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${fpo.status === 'Submitted' || fpo.status === 'SUBMITTED' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                                                            fpo.status === 'Partial' || fpo.status === 'PARTIALLY_RECEIVED' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                                                                fpo.status === 'Pending' || fpo.status === 'DRAFT' ? 'bg-gray-500/20 text-gray-300 border border-gray-500/30' :
                                                                    fpo.status === 'Ordered' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' :
                                                                        'bg-accent-500/20 text-accent-300 border border-accent-500/30'
                                                            }`}>
                                                            {fpo.status}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-6">
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
                                                            <div className={`text-2xl font-bold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                                                                ${fpo.total?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                                                            </div>
                                                            <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                                                                {fpo.lineCount || 0} items • {fpo.totalQuantity?.toFixed(0) || 0} units
                                                            </div>
                                                        </div>
                                                        <ChevronDownIcon
                                                            className={`w-5 h-5 transition-transform ${isDark ? 'text-gray-400' : 'text-gray-600'} ${isExpanded ? 'rotate-180' : ''}`}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Expanded Details */}
                                            {isExpanded && (
                                                <div className={`relative p-4 space-y-4 border-t backdrop-blur-lg ${isDark
                                                    ? 'border-white/5 bg-slate-950/70'
                                                    : 'border-amber-900/15 bg-amber-50/80'
                                                    }`}>
                                                    {/* Summary Info */}
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className={`rounded-xl border backdrop-blur-lg p-4 space-y-3 ${isDark
                                                            ? 'border-white/10 bg-gradient-to-br from-slate-950/80 via-slate-900/60 to-slate-950/80 shadow-[0_12px_30px_rgba(2,6,23,0.45)]'
                                                            : 'border-stone-300/25 bg-gradient-to-br from-white/98 via-stone-100/50 to-white/92 shadow-[0_18px_40px_rgba(15,23,42,0.18)]'
                                                            }`}>
                                                            <div>
                                                                <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Vendor Information</div>
                                                                <div className="text-sm text-gray-200">{fpo.vendorName || 'Unknown'}</div>
                                                                {fpo.vendorUrl && (
                                                                    <div className="text-xs text-gray-500 font-mono mt-0.5">{fpo.vendorUrl}</div>
                                                                )}
                                                            </div>
                                                            {fpo.facilityId && (
                                                                <div>
                                                                    <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Facility</div>
                                                                    <div className="text-sm text-gray-200">{fpo.facilityId}</div>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="rounded-xl border border-white/10 bg-gradient-to-br from-slate-950/80 via-slate-900/60 to-slate-950/80 backdrop-blur-lg shadow-[0_12px_30px_rgba(2,6,23,0.45)] p-4">
                                                            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Financial Summary</div>
                                                            <div className="space-y-1 text-sm">
                                                                <div className="flex justify-between text-gray-300">
                                                                    <span>Subtotal:</span>
                                                                    <span className="font-mono">${fpo.subtotal?.toFixed(2) || '0.00'}</span>
                                                                </div>
                                                                {fpo.tax && fpo.tax > 0 && (
                                                                    <div className="flex justify-between text-gray-300">
                                                                        <span>Tax:</span>
                                                                        <span className="font-mono">${fpo.tax.toFixed(2)}</span>
                                                                    </div>
                                                                )}
                                                                {fpo.shipping && fpo.shipping > 0 && (
                                                                    <div className="flex justify-between text-gray-300">
                                                                        <span>Shipping:</span>
                                                                        <span className="font-mono">${fpo.shipping.toFixed(2)}</span>
                                                                    </div>
                                                                )}
                                                                <div className="flex justify-between text-amber-400 font-semibold pt-2 border-t border-white/10">
                                                                    <span>Total:</span>
                                                                    <span className="font-mono">${fpo.total?.toFixed(2) || '0.00'}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Notes */}
                                                    {(fpo.publicNotes || fpo.privateNotes) && (
                                                        <div className="space-y-2">
                                                            {fpo.publicNotes && (
                                                                <div>
                                                                    <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Public Notes</div>
                                                                    <div className="text-sm text-gray-300 bg-slate-950/50 p-3 rounded-lg border border-white/5">
                                                                        {fpo.publicNotes}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {fpo.privateNotes && (
                                                                <div>
                                                                    <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Private Notes</div>
                                                                    <div className="text-sm text-gray-300 bg-slate-950/50 p-3 rounded-lg border border-white/5">
                                                                        {fpo.privateNotes}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Line Items */}
                                                    {fpo.lineItems && fpo.lineItems.length > 0 && (
                                                        <div>
                                                            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Line Items</div>
                                                            <div className="rounded-xl border border-white/10 bg-gradient-to-br from-slate-950/80 via-slate-900/60 to-slate-950/80 backdrop-blur-lg shadow-[0_12px_30px_rgba(2,6,23,0.45)] overflow-hidden">
                                                                <table className="min-w-full">
                                                                    <thead className="bg-slate-900/50">
                                                                        <tr>
                                                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase">#</th>
                                                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase">Product</th>
                                                                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-400 uppercase">Ordered</th>
                                                                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-400 uppercase">Received</th>
                                                                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-400 uppercase">Unit Price</th>
                                                                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-400 uppercase">Total</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-white/5">
                                                                        {fpo.lineItems.map((item: any, idx: number) => (
                                                                            <tr key={idx} className="hover:bg-slate-900/30">
                                                                                <td className="px-3 py-2 text-sm text-gray-400">{item.line_number || idx + 1}</td>
                                                                                <td className="px-3 py-2 text-sm text-gray-300 font-mono">{item.product_id || 'N/A'}</td>
                                                                                <td className="px-3 py-2 text-sm text-gray-300 text-right font-mono">{item.quantity_ordered || 0}</td>
                                                                                <td className="px-3 py-2 text-sm text-gray-300 text-right font-mono">{item.quantity_received || 0}</td>
                                                                                <td className="px-3 py-2 text-sm text-gray-300 text-right font-mono">${item.unit_price?.toFixed(2) || '0.00'}</td>
                                                                                <td className="px-3 py-2 text-sm text-amber-400 text-right font-mono font-semibold">${item.line_total?.toFixed(2) || '0.00'}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Metadata */}
                                                    <div className="flex items-center justify-between pt-3 border-t border-white/5 text-xs text-gray-500">
                                                        <div>Finale: <span className="font-mono text-gray-400">{fpo.finaleOrderUrl}</span></div>
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

                <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/80 to-slate-950 shadow-[0_25px_70px_rgba(2,6,23,0.65)]">
                    {/* Card overlay effect */}
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),rgba(15,23,42,0))]" />

                    <div className="relative p-4 bg-gradient-to-r from-slate-900/80 via-slate-900/40 to-slate-900/70 border-b border-white/5">
                        <div className="pointer-events-none absolute inset-x-10 top-0 h-2 opacity-70 blur-2xl bg-white/20" />
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-semibold text-amber-400">📦 All Purchase Orders</h2>
                                <span className="px-3 py-1 rounded-full text-sm bg-slate-800/50 text-gray-300 border border-slate-700 font-medium">
                                    {unifiedPOs.length} {statusFilter === 'all' && showAllPOs ? 'total' : statusFilter}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-1 bg-slate-950/50 rounded-lg p-1 border border-slate-800">
                                    <Button
                                        onClick={() => setStatusFilter('active')}
                                        className={`px-3 py-1.5 text-xs rounded transition-colors ${statusFilter === 'active'
                                            ? 'bg-accent-500 text-white'
                                            : 'text-gray-400 hover:text-white hover:bg-slate-800'
                                            }`}
                                    >
                                        Active
                                    </Button>
                                    <Button
                                        onClick={() => setStatusFilter('committed')}
                                        className={`px-3 py-1.5 text-xs rounded transition-colors ${statusFilter === 'committed'
                                            ? 'bg-blue-500 text-white'
                                            : 'text-gray-400 hover:text-white hover:bg-slate-800'
                                            }`}
                                    >
                                        Committed
                                    </Button>
                                    <Button
                                        onClick={() => setStatusFilter('received')}
                                        className={`px-3 py-1.5 text-xs rounded transition-colors ${statusFilter === 'received'
                                            ? 'bg-green-500 text-white'
                                            : 'text-gray-400 hover:text-white hover:bg-slate-800'
                                            }`}
                                    >
                                        Received
                                    </Button>
                                    <Button
                                        onClick={() => setStatusFilter('cancelled')}
                                        className={`px-3 py-1.5 text-xs rounded transition-colors ${statusFilter === 'cancelled'
                                            ? 'bg-red-500 text-white'
                                            : 'text-gray-400 hover:text-white hover:bg-slate-800'
                                            }`}
                                    >
                                        Cancelled
                                    </Button>
                                    <Button
                                        onClick={() => setStatusFilter('all')}
                                        className={`px-3 py-1.5 text-xs rounded transition-colors ${statusFilter === 'all'
                                            ? 'bg-slate-700 text-white'
                                            : 'text-gray-400 hover:text-white hover:bg-slate-800'
                                            }`}
                                    >
                                        All
                                    </Button>
                                </div>

                                <div className="h-6 w-px bg-slate-700 mx-1" />

                                <div className="flex items-center gap-1 bg-slate-950/50 rounded-lg p-1 border border-slate-800">
                                    <Button
                                        onClick={() => setViewMode('list')}
                                        className={`p-1.5 rounded transition-colors ${viewMode === 'list'
                                            ? 'bg-slate-700 text-white'
                                            : 'text-gray-400 hover:text-white hover:bg-slate-800'
                                            }`}
                                        title="List View"
                                    >
                                        <ListBulletIcon className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        onClick={() => setViewMode('card')}
                                        className={`p-1.5 rounded transition-colors ${viewMode === 'card'
                                            ? 'bg-slate-700 text-white'
                                            : 'text-gray-400 hover:text-white hover:bg-slate-800'
                                            }`}
                                        title="Card View"
                                    >
                                        <Squares2X2Icon className="w-4 h-4" />
                                    </Button>
                                </div>

                                <Button
                                    onClick={() => setShowAllPOs(!showAllPOs)}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:text-white border border-slate-700 rounded-md hover:bg-slate-800 transition-colors"
                                >
                                    <CalendarIcon className="w-4 h-4" />
                                    {showAllPOs ? 'Last 2 Weeks' : 'All Time'}
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="relative overflow-x-auto max-h-[calc(100vh-320px)]">
                        {sortedPurchaseOrders.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                                <div className="bg-gray-700/30 rounded-full p-6 mb-4">
                                    <DocumentTextIcon className="w-16 h-16 text-gray-500" />
                                </div>
                                <h3 className="text-xl font-semibold text-gray-300 mb-2">
                                    {purchaseOrders.length === 0 ? 'No Purchase Orders Yet' : 'No Matching Purchase Orders'}
                                </h3>
                                <p className="text-gray-400 mb-4 max-w-md">
                                    {purchaseOrders.length === 0
                                        ? "Get started by creating a purchase order manually or importing from your Finale inventory system."
                                        : `${purchaseOrders.length} purchase order${purchaseOrders.length === 1 ? '' : 's'} exist, but none match your current filters.`}
                                </p>
                                {purchaseOrders.length > 0 && (
                                    <div className="text-sm text-gray-500 mb-4 space-y-1">
                                        <div>Current filters: <span className="text-gray-400">Status = "{statusFilter}"</span>, <span className="text-gray-400">Date = {showAllPOs ? 'All Time' : 'Last 2 Weeks'}</span></div>
                                        <div className="flex gap-2 justify-center mt-3">
                                            <Button
                                                onClick={() => { setStatusFilter('all'); setShowAllPOs(true); }}
                                                className="px-3 py-1.5 text-xs bg-accent-500 text-white rounded hover:bg-accent-600"
                                            >
                                                Clear All Filters
                                            </Button>
                                        </div>
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
                                            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 transition-colors font-medium border border-gray-600"
                                        >
                                            <FileTextIcon className="w-5 h-5" />
                                            Import from Finale
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ) : viewMode === 'list' ? (
                            <table className="min-w-full divide-y divide-slate-800">
                                <thead className="bg-slate-950/50 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">PO Number</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Vendor</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date Created</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Expected Date</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Tracking</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Total</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-slate-950/30 divide-y divide-slate-800/50">
                                    {unifiedPOs.map((po: any) => (
                                        <tr key={po.id} className="hover:bg-slate-900/50 transition-colors duration-200">
                                            <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-amber-400">
                                                <div className="flex items-center gap-2">
                                                    <span>{po.orderId || po.id}</span>
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${po.source === 'Finale' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'}`}>
                                                        {po.source}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-300">
                                                <div className="flex items-center gap-2">
                                                    <span>{po.source === 'Internal' ? (vendorMap.get(po.vendorId ?? '')?.name || po.supplier || 'Unknown Vendor') : (po.vendorName || 'Unknown Vendor')}</span>
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
                                            <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-400">{new Date(po.orderDate || po.createdAt).toLocaleDateString()}</td>
                                            <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-400">{po.estimatedReceiveDate ? new Date(po.estimatedReceiveDate).toLocaleDateString() : 'N/A'}</td>
                                            <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-300">
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
                                            <td className="px-6 py-1 whitespace-nowrap text-sm text-white font-semibold">${formatPoTotal(po)}</td>
                                            <td className="px-6 py-1 whitespace-nowrap text-sm space-x-2">
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
                                {unifiedPOs.map((po: any) => (
                                    <div
                                        key={po.id}
                                        className={`rounded-xl border p-4 space-y-4 transition-all duration-200 ${isDark
                                            ? 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                                            : 'bg-white border-gray-200 shadow-sm hover:shadow-md'
                                            }`}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-lg font-mono font-semibold text-amber-400">{po.orderId || po.id}</h3>
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${po.source === 'Finale' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'}`}>
                                                        {po.source}
                                                    </span>
                                                    {po.followUpCount && po.followUpCount > 0 && (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/20 text-sky-200 border border-sky-500/40">
                                                            FU {po.followUpCount}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-sm text-gray-300 font-medium">
                                                    {po.source === 'Internal' ? (vendorMap.get(po.vendorId ?? '')?.name || po.supplier || 'Unknown Vendor') : (po.vendorName || 'Unknown Vendor')}
                                                </div>
                                            </div>
                                            <StatusBadge status={po.status}>
                                                {formatStatusText(po.status)}
                                            </StatusBadge>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                            <div>
                                                <div className="text-xs text-gray-500 uppercase">Created</div>
                                                <div className="text-gray-300">{new Date(po.orderDate || po.createdAt).toLocaleDateString()}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-500 uppercase">Expected</div>
                                                <div className="text-gray-300">{po.estimatedReceiveDate ? new Date(po.estimatedReceiveDate).toLocaleDateString() : '—'}</div>
                                            </div>
                                        </div>

                                        <div className="pt-3 border-t border-gray-700/50 flex items-center justify-between">
                                            <div>
                                                <div className="text-xs text-gray-500 uppercase">Total</div>
                                                <div className="text-lg font-bold text-white">${formatPoTotal(po)}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xs text-gray-500 uppercase">Items</div>
                                                <div className="text-gray-300">{po.items?.length || 0} lines</div>
                                            </div>
                                        </div>

                                        {po.trackingNumber && (
                                            <div className="bg-gray-800/50 rounded p-2 text-xs">
                                                <div className="flex justify-between items-center text-gray-400 mb-1">
                                                    <span>TRACKING</span>
                                                    <span>{po.trackingCarrier}</span>
                                                </div>
                                                <div className="font-mono text-gray-200 truncate">{po.trackingNumber}</div>
                                                {po.trackingStatus && (
                                                    <div className="mt-1 text-accent-300">{formatStatusText(po.trackingStatus)}</div>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex items-center justify-end gap-1 pt-2 border-t border-gray-700/50">
                                            {canManagePOs && (
                                                <Button onClick={() => handleEditTracking(po)} className="p-2 text-accent-300 hover:bg-slate-800 rounded" title="Update Tracking"><TruckIcon className="w-4 h-4" /></Button>
                                            )}
                                            {po.trackingNumber && (
                                                <Button onClick={() => handleOpenTracking(po)} className="p-2 text-green-300 hover:bg-slate-800 rounded" title="Track"><TruckIcon className="w-4 h-4" /></Button>
                                            )}
                                            {canManagePOs && ['shipped', 'in_transit', 'out_for_delivery', 'delivered'].includes(po.trackingStatus || '') && (
                                                <Button onClick={() => handleReceivePO(po)} className="p-2 text-emerald-400 hover:bg-slate-800 rounded" title="Receive"><CheckCircleIcon className="w-4 h-4" /></Button>
                                            )}
                                            <Button onClick={() => handleDownloadPdf(po)} className="p-2 text-gray-400 hover:bg-slate-800 rounded" title="PDF"><FileTextIcon className="w-4 h-4" /></Button>
                                            <Button onClick={() => handleSendEmailClick(po)} className="p-2 text-gray-400 hover:bg-slate-800 rounded" title="Email"><MailIcon className="w-4 h-4" /></Button>
                                            <Button onClick={() => handleOpenComm(po)} className="p-2 text-gray-400 hover:bg-slate-800 rounded" title="Thread"><DocumentTextIcon className="w-4 h-4" /></Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
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
                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
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
