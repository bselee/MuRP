

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
} from '../types';
import { MailIcon, FileTextIcon, ChevronDownIcon, BotIcon, CheckCircleIcon, XCircleIcon } from '../components/icons';
import CreatePoModal from '../components/CreatePoModal';
import EmailComposerModal from '../components/EmailComposerModal';
import GeneratePoModal from '../components/GeneratePoModal';
import CreateRequisitionModal from '../components/CreateRequisitionModal';
import ReorderQueueDashboard, { ReorderQueueVendorGroup } from '../components/ReorderQueueDashboard';
import DraftPOReviewSection from '../components/DraftPOReviewSection';
import POTrackingDashboard from '../components/POTrackingDashboard';
import { subscribeToPoDrafts } from '../lib/poDraftBridge';
import { generatePoPdf } from '../services/pdfService';
import { usePermissions } from '../hooks/usePermissions';

interface PurchaseOrdersProps {
    purchaseOrders: PurchaseOrder[];
    vendors: Vendor[];
    inventory: InventoryItem[];
    onCreatePo: (poDetails: CreatePurchaseOrderInput) => Promise<void> | void;
    addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
    currentUser: User;
    approvedRequisitions: InternalRequisition[];
    gmailConnection: GmailConnection;
    onSendEmail: (poId: string, sentViaGmail: boolean) => void;
    requisitions: InternalRequisition[];
    users: User[];
    onApproveRequisition: (reqId: string) => void;
    onRejectRequisition: (reqId: string) => void;
    onCreateRequisition: (items: RequisitionItem[]) => void;
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
  sent: { label: 'Sent', className: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
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
  processing: { label: 'Processing', className: 'bg-indigo-500/20 text-indigo-200 border-indigo-500/30' },
  shipped: { label: 'Shipped', className: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30' },
  in_transit: { label: 'In Transit', className: 'bg-purple-500/20 text-purple-200 border-purple-500/30' },
  out_for_delivery: { label: 'Out for Delivery', className: 'bg-amber-500/20 text-amber-200 border-amber-500/30' },
  delivered: { label: 'Delivered', className: 'bg-green-500/20 text-green-200 border-green-500/30' },
  exception: { label: 'Exception', className: 'bg-red-500/20 text-red-200 border-red-500/30' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
};

const CollapsibleSection: React.FC<{
  title: string;
  count: number;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}> = ({ title, count, children, isOpen, onToggle }) => (
    <section className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden">
        <button onClick={onToggle} className="w-full flex justify-between items-center p-4 bg-gray-800 hover:bg-gray-700/50 transition-colors">
            <h2 className="text-xl font-semibold text-gray-300 flex items-center gap-3">
              {title}
              {count > 0 && <span className="flex items-center justify-center text-xs font-bold text-white bg-yellow-500 rounded-full h-6 w-6">{count}</span>}
            </h2>
            <ChevronDownIcon className={`w-6 h-6 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
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
        approvedRequisitions, gmailConnection, onSendEmail,
        requisitions, users, onApproveRequisition, onRejectRequisition, onCreateRequisition
    } = props;
    
    const [isCreatePoModalOpen, setIsCreatePoModalOpen] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isGeneratePoModalOpen, setIsGeneratePoModalOpen] = useState(false);
    const [isCreateReqModalOpen, setIsCreateReqModalOpen] = useState(false);
    const [isRequisitionsOpen, setIsRequisitionsOpen] = useState(true);
    const [selectedPoForEmail, setSelectedPoForEmail] = useState<PurchaseOrder | null>(null);
    const [activePoDraft, setActivePoDraft] = useState<PoDraftConfig | undefined>(undefined);
    const [pendingPoDrafts, setPendingPoDrafts] = useState<PoDraftConfig[]>([]);
    const [modalSession, setModalSession] = useState(0);
    
    const permissions = usePermissions();
    const vendorMap = useMemo(() => new Map(vendors.map(v => [v.id, v])), [vendors]);
    const userMap = useMemo(() => new Map(users.map(u => [u.id, u.name])), [users]);
    const inventoryMap = useMemo(() => new Map(inventory.map(item => [item.sku, item])), [inventory]);

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

  const handleSendEmail = (sentViaGmail: boolean) => {
      if (selectedPoForEmail) {
          onSendEmail(selectedPoForEmail.id, sentViaGmail);
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

    const sortedPurchaseOrders = useMemo(() =>
        [...purchaseOrders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        [purchaseOrders]
    );

    useEffect(() => {
        const unsubscribe = subscribeToPoDrafts(drafts => {
            openPoModalWithDrafts(drafts);
        });
        return () => {
            unsubscribe();
        };
    }, [openPoModalWithDrafts]);

    return (
        <>
            <div className="space-y-6">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">Purchase Orders</h1>
                        <p className="text-gray-400 mt-1">Manage internal requisitions and external purchase orders.</p>
                    </div>
                    {canManagePOs && (
                        <div className="flex w-full sm:w-auto gap-2">
                    {canManagePOs && currentUser.role !== 'Staff' && approvedRequisitions.length > 0 && (
                        <button
                            onClick={() => setIsGeneratePoModalOpen(true)}
                            className="relative flex-1 sm:flex-initial bg-green-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-green-700 transition-colors"
                        >
                                    Generate from Requisitions
                                    <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs">{approvedRequisitions.length}</span>
                                </button>
                            )}
                            <button 
                                onClick={handleManualCreateClick}
                                className="flex-1 sm:flex-initial bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
                            >
                                Create New PO
                            </button>
                        </div>
                    )}
                </header>

                <RequisitionsSection
                    requisitions={requisitions}
                    currentUser={currentUser}
                    userMap={userMap}
                    isOpen={isRequisitionsOpen}
                    onToggle={() => setIsRequisitionsOpen(!isRequisitionsOpen)}
                    onApprove={onApproveRequisition}
                    onReject={onRejectRequisition}
                    onCreate={() => setIsCreateReqModalOpen(true)}
                    allowManualCreation={canSubmitRequisitions}
                    canActOnRequisition={permissions.canApproveRequisition}
                />

                <ReorderQueueDashboard
                    onDraftPOs={canManagePOs ? handleReorderQueueDrafts : undefined}
                    addToast={addToast}
                />

                <POTrackingDashboard />

                <DraftPOReviewSection
                    onApprove={(orderId) => {
                        addToast(`Approved ${orderId} - ready to send to vendor`, 'success');
                    }}
                    onDiscard={(orderId) => {
                        addToast(`Discarded ${orderId}`, 'info');
                    }}
                    addToast={addToast}
                />

                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden border border-gray-700">
                    <div className="p-4 bg-gray-800">
                        <h2 className="text-xl font-semibold text-gray-300">External Purchase Orders</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-800">
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
                                        <td className="px-6 py-1 whitespace-nowrap text-sm font-medium text-indigo-400">{po.orderId || po.id}</td>
                                        <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-300">{vendorMap.get(po.vendorId ?? '')?.name || po.supplier || 'Unknown Vendor'}</td>
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
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-500">No tracking</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-1 whitespace-nowrap text-sm text-white font-semibold">${formatPoTotal(po)}</td>
                                        <td className="px-6 py-1 whitespace-nowrap text-sm space-x-2">
                                            {po.trackingNumber && (
                                                <button
                                                    onClick={() => handleOpenTracking(po)}
                                                    className="p-2 text-green-300 hover:text-green-100 transition-colors"
                                                    title="Track Shipment"
                                                >
                                                    Track
                                                </button>
                                            )}
                                            <button onClick={() => handleDownloadPdf(po)} title="Download PDF" className="p-2 text-gray-400 hover:text-indigo-400 transition-colors"><FileTextIcon className="w-5 h-5"/></button>
                                            <button onClick={() => handleSendEmailClick(po)} title="Send Email" className="p-2 text-gray-400 hover:text-indigo-400 transition-colors"><MailIcon className="w-5 h-5"/></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
                />
            )}
            
            {currentUser.role === 'Admin' && (
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
                    onCreate={onCreateRequisition}
                />
            )}
        </>
    );
};

// --- Requisitions Section Component ---

const ReqStatusBadge: React.FC<{ status: InternalRequisition['status'] }> = ({ status }) => {
    const statusConfig = {
      'Pending': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'Approved': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'Rejected': 'bg-red-500/20 text-red-400 border-red-500/30',
      'Ordered': 'bg-green-500/20 text-green-400 border-green-500/30',
    };
    return <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border ${statusConfig[status]}`}>{status}</span>;
};

interface RequisitionsSectionProps {
    requisitions: InternalRequisition[];
    currentUser: User;
    userMap: Map<string, string>;
    isOpen: boolean;
    onToggle: () => void;
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
    onCreate: () => void;
    allowManualCreation: boolean;
    canActOnRequisition: (req: InternalRequisition) => boolean;
}

const RequisitionsSection: React.FC<RequisitionsSectionProps> = ({ requisitions, currentUser, userMap, isOpen, onToggle, onApprove, onReject, onCreate, allowManualCreation, canActOnRequisition }) => {

    const displayedRequisitions = useMemo(() => {
        const sorted = [...requisitions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        if (currentUser.role === 'Admin') return sorted;
        return sorted.filter(r => r.department === currentUser.department);
    }, [requisitions, currentUser]);

    const pendingCount = useMemo(() => 
        displayedRequisitions.filter(r => r.status === 'Pending').length, 
        [displayedRequisitions]
    );

    const canTakeAction = (req: InternalRequisition) => req.status === 'Pending' && canActOnRequisition(req);

    return (
        <CollapsibleSection title="Internal Requisitions" count={pendingCount} isOpen={isOpen} onToggle={onToggle}>
            <div className="p-4 flex justify-end">
                {allowManualCreation && (
                    <button onClick={onCreate} className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors">
                        Create Manual Requisition
                    </button>
                )}
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-800/50">
                        <tr>
                            <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Req ID</th>
                            <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Requester</th>
                            <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Department</th>
                            <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Items</th>
                            {(currentUser.role === 'Admin' || currentUser.role === 'Manager') && <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>}
                        </tr>
                    </thead>
                    <tbody className="bg-gray-800 divide-y divide-gray-700">
                        {displayedRequisitions.map(req => (
                            <tr key={req.id}>
                                <td className="px-6 py-1 whitespace-nowrap text-sm font-medium text-indigo-400">{req.id}</td>
                                <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-400">
                                    {req.source === 'System' ? (
                                        <div className="flex items-center gap-2" title="Auto-generated by AI Planning Insights based on demand forecast">
                                            <BotIcon className="w-4 h-4 text-indigo-400"/> 
                                            <span className="text-indigo-300 font-semibold">AI Generated</span>
                                        </div>
                                    ) : (userMap.get(req.requesterId!) || 'Unknown User')}
                                </td>
                                <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-300">{req.department}</td>
                                <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-400">{new Date(req.createdAt).toLocaleDateString()}</td>
                                <td className="px-6 py-1 whitespace-nowrap"><ReqStatusBadge status={req.status} /></td>
                                <td className="px-6 py-1 text-sm text-gray-300">
                                    <ul className="space-y-1">
                                        {req.items.map(item => (
                                            <li key={item.sku} title={item.reason}>{item.quantity}x {item.name}</li>
                                        ))}
                                    </ul>
                                </td>
                                {(currentUser.role === 'Admin' || currentUser.role === 'Manager') && (
                                    <td className="px-6 py-1 whitespace-nowrap text-sm space-x-2">
                                        {canTakeAction(req) ? (
                                            <>
                                                <button onClick={() => onApprove(req.id)} className="p-2 text-green-400 hover:text-green-300" title="Approve"><CheckCircleIcon className="w-6 h-6" /></button>
                                                <button onClick={() => onReject(req.id)} className="p-2 text-red-400 hover:text-red-300" title="Reject"><XCircleIcon className="w-6 h-6" /></button>
                                            </>
                                        ) : <span className="text-xs text-gray-500">Processed</span>}
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
