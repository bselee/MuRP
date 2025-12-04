

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
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
import { MailIcon, FileTextIcon, ChevronDownIcon, BotIcon, CheckCircleIcon, XCircleIcon, TruckIcon, DocumentTextIcon, CalendarIcon } from '../components/icons';
import CreatePoModal from '../components/CreatePoModal';
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

interface PurchaseOrdersProps {
    purchaseOrders: PurchaseOrder[];
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

const PO_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-600/20 text-gray-200 border-gray-500/40' },
  pending: { label: 'Pending', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  committed: { label: 'Committed', className: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  sent: { label: 'Sent', className: 'bg-accent-500/20 text-accent-300 border-accent-500/30' },
  confirmed: { label: 'Confirmed', className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  partial: { label: 'Partial', className: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  received: { label: 'Received', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  cancelled: { label: 'Cancelled', className: 'bg-red-500/20 text-red-300 border-red-500/30' },
  Pending: { label: 'Pending', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  Submitted: { label: 'Submitted', className: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  Fulfilled: { label: 'Fulfilled', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
};

const PoStatusBadge: React.FC<{ status: PurchaseOrder['status'] }> = ({ status }) => {
  const config = PO_STATUS_STYLES[status] ?? { label: status, className: 'bg-gray-600/20 text-gray-200 border-gray-500/30' };
  return (
    <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border ${config.className}`}>
      {config.label}
    </span>
  );
};

const TRACKING_STATUS_STYLES: Record<POTrackingStatus, { label: string; className: string }> = {
  awaiting_confirmation: { label: 'Awaiting Reply', className: 'bg-gray-600/20 text-gray-200 border-gray-500/30' },
  confirmed: { label: 'Confirmed', className: 'bg-blue-500/20 text-blue-200 border-blue-500/30' },
  processing: { label: 'Processing', className: 'bg-accent-500/20 text-accent-200 border-accent-500/30' },
  shipped: { label: 'Shipped', className: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30' },
  in_transit: { label: 'In Transit', className: 'bg-purple-500/20 text-purple-200 border-purple-500/30' },
  out_for_delivery: { label: 'Out for Delivery', className: 'bg-amber-500/20 text-amber-200 border-amber-500/30' },
  delivered: { label: 'Delivered', className: 'bg-green-500/20 text-green-200 border-green-500/30' },
  exception: { label: 'Exception', className: 'bg-red-500/20 text-red-200 border-red-500/30' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
  invoice_received: { label: 'Invoice Logged', className: 'bg-teal-500/20 text-teal-100 border-teal-500/30' },
};

const CollapsibleSection: React.FC<{
  title: string;
  count: number;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}> = ({ title, count, children, isOpen, onToggle }) => (
    <section className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden">
        <Button onClick={onToggle} className="w-full flex justify-between items-center p-4 bg-gray-800 hover:bg-gray-700/50 transition-colors">
            <h2 className="text-xl font-semibold text-gray-300 flex items-center gap-3">
              {title}
              {count > 0 && <span className="flex items-center justify-center text-xs font-bold text-white bg-yellow-500 rounded-full h-6 w-6">{count}</span>}
            </h2>
            <ChevronDownIcon className={`w-6 h-6 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </Button>
        {isOpen && (
            <div className="border-t border-gray-700">
                {children}
            </div>
        )}
    </section>
);

const PurchaseOrders: React.FC<PurchaseOrdersProps> = (props) => {
    const { 
        purchaseOrders, vendors, inventory, onCreatePo, addToast, currentUser, 
        approvedRequisitions, gmailConnection, onSendEmail, onUpdateTracking,
        requisitions, users, onApproveRequisition, onOpsApproveRequisition, onRejectRequisition, onCreateRequisition,
        onConnectGoogle,
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
    const [showAllPOs, setShowAllPOs] = useState(false);
    
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

    // Calculate 2 weeks ago for filtering
    const twoWeeksAgo = useMemo(() => {
        const date = new Date();
        date.setDate(date.getDate() - 14);
        return date;
    }, []);

    // Filter and sort purchase orders - show last 2 weeks by default
    const sortedPurchaseOrders = useMemo(() => {
        const sorted = [...purchaseOrders].sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        
        if (showAllPOs) {
            return sorted;
        }
        
        // Filter to POs created in the last 2 weeks
        return sorted.filter(po => {
            const poDate = new Date(po.createdAt);
            return poDate >= twoWeeksAgo;
        });
    }, [purchaseOrders, showAllPOs, twoWeeksAgo]);

    // Count of all POs vs filtered
    const totalPOCount = purchaseOrders.length;
    const filteredPOCount = sortedPurchaseOrders.length;

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
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                    <h1 className="text-xl font-bold text-white tracking-tight">Purchase Orders</h1>
                    {canManagePOs && (
                        <div className="flex w-full sm:w-auto gap-2">
                            {currentUser.role !== 'Staff' && approvedRequisitions.length > 0 && (
                                <Button
                                    onClick={() => setIsGeneratePoModalOpen(true)}
                                    className="relative flex-1 sm:flex-initial bg-green-600 hover:bg-green-500 focus-visible:ring-green-500 text-sm py-2 px-3"
                                >
                                    Generate from Requisitions
                                    <span className="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs">
                                        {approvedRequisitions.length}
                                    </span>
                                </Button>
                            )}
                            <Button
                                onClick={handleManualCreateClick}
                                className="flex-1 sm:flex-initial text-sm py-2 px-3"
                                variant="primary"
                            >
                                Create New PO
                            </Button>
                        </div>
                    )}
                </header>

                {showCommandCenter && (
                    <PurchasingCommandCenter
                        stats={[
                            {
                                id: 'manager',
                                label: 'Manager Review',
                                value: managerQueue.length,
                                description: 'Awaiting department approval',
                                accent: managerQueue.length > 0 ? 'border-amber-400/50 text-amber-100' : 'border-gray-600 text-gray-300',
                                onClick: focusRequisitionSection,
                            },
                            {
                                id: 'ops',
                                label: 'Ops Review',
                                value: opsQueue.length,
                                description: 'Strategic buys waiting on Ops',
                                accent: opsQueue.length > 0 ? 'border-purple-400/50 text-purple-100' : 'border-gray-600 text-gray-300',
                                onClick: focusRequisitionSection,
                            },
                            {
                                id: 'ready',
                                label: 'Ready for PO Build',
                                value: readyQueue.length,
                                description: 'Fully approved requisitions',
                                accent: readyQueue.length > 0 ? 'border-sky-400/50 text-sky-100' : 'border-gray-600 text-gray-300',
                                onClick: focusRequisitionSection,
                            },
                            {
                                id: 'tracking',
                                label: 'Tracking Missing',
                                value: trackingAlerts.length,
                                description: `${followUpBacklog} vendor nudges queued`,
                                accent: trackingAlerts.length > 0 ? 'border-rose-400/50 text-rose-100' : 'border-gray-600 text-gray-300',
                                onClick: focusTrackingPanel,
                            },
                        ]}
                        highRiskRequests={urgentRequests}
                        readyQueue={readyHighlights}
                        trackingAlerts={trackingAlerts}
                        followUpBacklog={followUpBacklog}
                        onFocusRequisitions={focusRequisitionSection}
                        onFocusTracking={focusTrackingPanel}
                    />
                )}

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

                <ReorderQueueDashboard
                    onDraftPOs={canManagePOs ? handleReorderQueueDrafts : undefined}
                    addToast={addToast}
                />

                {canManagePOs && (
                    <div className="bg-accent-900/20 border border-accent-500/30 rounded-lg px-4 py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between shadow-inner shadow-accent-800/30">
                        <div>
                            <p className="text-sm font-semibold text-accent-100">Follow-up Automation</p>
                            <p className="text-xs text-accent-100/80">
                                Gmail nudges reuse the original thread so vendors reply with tracking only. Backlog:{' '}
                                <span className="font-semibold">{followUpBacklog}</span> PO{followUpBacklog === 1 ? '' : 's'} waiting on details.
                            </p>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <Button
                                onClick={handleRunFollowUps}
                                disabled={isRunningFollowUps}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-accent-500 text-white text-sm font-semibold hover:bg-accent-500 disabled:opacity-60"
                            >
                                {isRunningFollowUps ? 'Sending…' : 'Nudge Vendors'}
                            </Button>
                            <span className="text-[11px] text-accent-100/70">
                                Configure templates in Settings → Follow-up Rules.
                            </span>
                        </div>
                    </div>
                )}

                <div id="po-tracking">
                    <POTrackingDashboard />
                </div>

                {isAdminLike && (
                    <AutonomousControls addToast={addToast} />
                )}

                {isAdminLike && (
                    <AutonomousApprovals addToast={addToast} />
                )}

                <DraftPOReviewSection
                    onApprove={(orderId) => {
                        addToast(`Approved ${orderId} - ready to send to vendor`, 'success');
                    }}
                    onDiscard={(orderId) => {
                        addToast(`Discarded ${orderId}`, 'info');
                    }}
                    addToast={addToast}
                />

                {/* VendorResponseWorkbench component removed - was causing ReferenceError */}

                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden border border-gray-700">
                    <div className="p-4 bg-gray-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-semibold text-gray-300">Purchase Orders</h2>
                            <span className="text-sm text-gray-400">
                                {showAllPOs 
                                    ? `${totalPOCount} total`
                                    : `${filteredPOCount} of ${totalPOCount} (last 2 weeks)`
                                }
                            </span>
                        </div>
                        <Button
                            onClick={() => setShowAllPOs(!showAllPOs)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:text-white border border-gray-600 rounded-md hover:bg-gray-700 transition-colors"
                        >
                            <CalendarIcon className="w-4 h-4" />
                            {showAllPOs ? 'Show Last 2 Weeks' : 'Show All POs'}
                        </Button>
                    </div>
                    <div className="overflow-x-auto max-h-[calc(100vh-320px)]">
                        {sortedPurchaseOrders.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                                <div className="bg-gray-700/30 rounded-full p-6 mb-4">
                                    <DocumentTextIcon className="w-16 h-16 text-gray-500" />
                                </div>
                                <h3 className="text-xl font-semibold text-gray-300 mb-2">
                                    No Purchase Orders Yet
                                </h3>
                                <p className="text-gray-400 mb-6 max-w-md">
                                    {purchaseOrders.length === 0 
                                        ? "Get started by creating a purchase order manually or importing from your Finale inventory system."
                                        : "No purchase orders match your current time filter. Try showing all POs."}
                                </p>
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
                        ) : (
                            <table className="table-density min-w-full divide-y divide-gray-700">
                                <thead className="bg-gray-800 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">PO Number</th>
                                        <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Vendor</th>
                                        <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Date Created</th>
                                        <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Expected Date</th>
                                        <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Tracking</th>
                                        <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Total</th>
                                        <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-gray-800 divide-y divide-gray-700">
                                    {sortedPurchaseOrders.map((po) => (
                                    <tr key={po.id} className="hover:bg-gray-700/50 transition-colors duration-200">
                                        <td className="px-6 py-1 whitespace-nowrap text-sm font-medium text-accent-400">{po.orderId || po.id}</td>
                                        <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-300">
                                            <div className="flex items-center gap-2">
                                                <span>{vendorMap.get(po.vendorId ?? '')?.name || po.supplier || 'Unknown Vendor'}</span>
                                                {po.followUpCount && po.followUpCount > 0 && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/20 text-sky-200 border border-sky-500/40">
                                                        FU {po.followUpCount}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-1 whitespace-nowrap"><PoStatusBadge status={po.status} /></td>
                                        <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-400">{new Date(po.orderDate || po.createdAt).toLocaleDateString()}</td>
                                        <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-400">{po.estimatedReceiveDate ? new Date(po.estimatedReceiveDate).toLocaleDateString() : 'N/A'}</td>
                                        <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-300">
                                            {po.trackingNumber ? (
                                                <div className="flex flex-col">
                                                    <span className="font-mono text-sm">{po.trackingNumber}</span>
                                                    <span className="text-xs text-gray-400 uppercase">{po.trackingCarrier || '—'}</span>
                                                    {po.trackingStatus && (
                                                    <span className={`inline-flex items-center px-2 py-0.5 mt-1 rounded-full border text-[11px] font-medium ${TRACKING_STATUS_STYLES[po.trackingStatus]?.className ?? 'bg-gray-600/20 text-gray-200 border-gray-500/30'}`}>
                                                        {TRACKING_STATUS_STYLES[po.trackingStatus]?.label ?? po.trackingStatus}
                                                    </span>
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
                                            {canManagePOs && ['shipped', 'in_transit', 'out_for_delivery', 'delivered'].includes(po.trackingStatus || '') && po.status !== 'received' && po.status !== 'partially_received' && (
                                                <Button
                                                    onClick={() => handleReceivePO(po)}
                                                    className="p-2 text-emerald-400 hover:text-emerald-300 transition-colors"
                                                    title="Mark as Received"
                                                >
                                                    <CheckCircleIcon className="w-5 h-5" />
                                                </Button>
                                            )}
                                            <Button onClick={() => handleDownloadPdf(po)} title="Download PDF" className="p-2 text-gray-400 hover:text-accent-400 transition-colors"><FileTextIcon className="w-5 h-5"/></Button>
                                            <Button onClick={() => handleSendEmailClick(po)} title="Send Email" className="p-2 text-gray-400 hover:text-accent-400 transition-colors"><MailIcon className="w-5 h-5"/></Button>
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
                        )}
                    </div>
                </div>
            </div>
            
            <CreatePoModal
                key={modalSession}
                isOpen={isCreatePoModalOpen}
                onClose={handlePoModalClose}
                vendors={vendors}
                inventory={inventory}
                onCreatePo={handlePoModalSubmit}
                initialData={activePoDraft}
            />

            {selectedPoForEmail && selectedPoForEmail.vendorId && vendorMap.get(selectedPoForEmail.vendorId) && (
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
            )}
            
            {selectedPoForComm && selectedPoForComm.vendorId && vendorMap.get(selectedPoForComm.vendorId) && (
                <PoCommunicationModal
                    isOpen={isCommModalOpen}
                    onClose={handleCloseComm}
                    purchaseOrder={selectedPoForComm}
                    vendor={vendorMap.get(selectedPoForComm.vendorId)!}
                    gmailConnection={gmailConnection}
                    addToast={addToast}
                    onConnectGoogle={onConnectGoogle}
                />
            )}
            
            <UpdateTrackingModal
                isOpen={isTrackingModalOpen}
                onClose={() => {
                    setIsTrackingModalOpen(false);
                    setSelectedPoForTracking(null);
                }}
                purchaseOrder={selectedPoForTracking}
                onSave={handleSaveTracking}
            />
            
            {isAdminLike && (
                <GeneratePoModal 
                    isOpen={isGeneratePoModalOpen}
                    onClose={() => setIsGeneratePoModalOpen(false)}
                    approvedRequisitions={approvedRequisitions}
                    inventory={inventory}
                    vendors={vendors}
                    onPrepareDrafts={handleRequisitionDrafts}
                />
            )}

            {canSubmitRequisitions && (
                <CreateRequisitionModal 
                    isOpen={isCreateReqModalOpen}
                    onClose={() => setIsCreateReqModalOpen(false)}
                    inventory={inventory}
                    onCreate={(items, options) => onCreateRequisition(items, options)}
                    defaultOptions={{ requestType: 'consumable', priority: 'medium' }}
                />
            )}

            {selectedPoForReceive && (
                <ReceivePurchaseOrderModal
                    isOpen={!!selectedPoForReceive}
                    onClose={() => setSelectedPoForReceive(null)}
                    po={selectedPoForReceive}
                    inventory={inventory}
                    onReceive={handleReceiveSubmit}
                    addToast={addToast}
                />
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
}) => (
    <section className="bg-gray-800/40 border border-gray-700 rounded-2xl p-4 space-y-5 shadow-inner shadow-black/20">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
                <p className="text-lg font-semibold text-white">Purchasing Command Center</p>
                <p className="text-sm text-gray-400">Approvals, vendor comms, and tracking health at a glance.</p>
            </div>
            <div className="text-xs text-gray-400">
                Follow-up backlog:{' '}
                <span className="font-semibold text-accent-200">{followUpBacklog}</span>
            </div>
        </div>
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
    </section>
);

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

    return (
        <CollapsibleSection title="Internal Requisitions" count={pendingCount} isOpen={isOpen} onToggle={onToggle}>
            <div className="p-4 flex justify-end">
                {allowManualCreation && (
                    <Button onClick={onCreate} size="sm">
                        Create Manual Requisition
                    </Button>
                )}
            </div>
            <div className="overflow-x-auto">
                <table className="table-density min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-800/80 backdrop-blur-sm sticky top-0 z-10">
                        <tr>
                            <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Req ID</th>
                            <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Requester</th>
                            <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Department</th>
                            <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Need / Priority</th>
                            <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Items</th>
                            {(isAdminLike || currentUser.role === 'Manager' || currentUser.department === 'Operations') && (
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="bg-gray-800 divide-y divide-gray-700">
                        {displayedRequisitions.map(req => (
                            <tr key={req.id}>
                                <td className="px-6 py-1 whitespace-nowrap text-sm font-medium text-accent-400">{req.id}</td>
                                <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-400">
                                    {req.source === 'System' ? (
                                        <div className="flex items-center gap-2" title="Auto-generated by AI Planning Insights based on demand forecast">
                                            <BotIcon className="w-4 h-4 text-accent-400"/> 
                                            <span className="text-accent-300 font-semibold">AI Generated</span>
                                        </div>
                                    ) : (req.requesterId ? (userMap.get(req.requesterId) || 'Unknown User') : 'Unassigned')}
                                </td>
                                <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-300">{req.department}</td>
                                <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-200">
                                    <div className="flex flex-col gap-1">
                                        {req.needByDate ? (
                                            <span className="text-xs text-gray-300">
                                                Need by {new Date(req.needByDate).toLocaleDateString()}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-gray-500">Flexible</span>
                                        )}
                                        <div className="flex flex-wrap gap-1">
                                            <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide bg-gray-700 text-gray-200">
                                                {req.requestType?.replace('_', ' ') || 'consumable'}
                                            </span>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide ${
                                                req.priority === 'high'
                                                    ? 'bg-rose-500/20 text-rose-200 border border-rose-500/40'
                                                    : req.priority === 'medium'
                                                    ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30'
                                                    : 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30'
                                            }`}>
                                                {req.priority} priority
                                            </span>
                                            {req.alertOnly && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide bg-sky-500/20 text-sky-200 border border-sky-500/30">
                                                    Alert Only
                                                </span>
                                            )}
                                            {req.autoPo && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide bg-accent-500/20 text-accent-200 border border-accent-500/30">
                                                    Auto PO
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-400">{new Date(req.createdAt).toLocaleDateString()}</td>
                                <td className="px-6 py-1 whitespace-nowrap align-top">
                                    <ReqStatusBadge status={req.status} />
                                    <div className="mt-1 space-y-1 text-xs text-gray-500">
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
                                                    ? `${userMap.get(req.opsApprovedBy ?? '') ?? 'Ops'} on ${new Date(
                                                          req.opsApprovedAt,
                                                      ).toLocaleDateString()}`
                                                    : 'Pending'}
                                            </p>
                                        )}
                                        {req.forwardedToPurchasingAt && (
                                            <p>
                                                Sent to Purchasing {new Date(req.forwardedToPurchasingAt).toLocaleDateString()}
                                            </p>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-1 text-sm text-gray-300">
                                    <ul className="space-y-1">
                                        {req.items.map(item => {
                                            const amazonMeta = item.metadata?.amazon;
                                            return (
                                                <li key={`${req.id}-${item.sku}`} className="space-y-0.5" title={item.reason}>
                                                    <div>{item.quantity}x {item.name}</div>
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
                                                            {amazonMeta?.asin ? (
                                                                <>
                                                                    ASIN {amazonMeta.asin}
                                                                    {amazonMeta.marketplace ? ` • ${amazonMeta.marketplace}` : ''}
                                                                </>
                                                            ) : null}
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
                                </td>
                                {(isAdminLike || currentUser.role === 'Manager' || currentUser.department === 'Operations') && (
                                    <td className="px-6 py-1 whitespace-nowrap text-sm space-x-2">
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
                                            <span className="text-xs text-gray-500">Processed</span>
                                        )}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </CollapsibleSection>
    );
};

export default PurchaseOrders;
