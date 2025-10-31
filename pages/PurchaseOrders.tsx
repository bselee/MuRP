

import React, { useMemo, useState } from 'react';
import type { PurchaseOrder, Vendor, InventoryItem, User, InternalRequisition, GmailConnection, RequisitionItem } from '../types';
import { MailIcon, FileTextIcon, ChevronDownIcon, BotIcon, CheckCircleIcon, XCircleIcon } from '../components/icons';
import CreatePoModal from '../components/CreatePoModal';
import EmailComposerModal from '../components/EmailComposerModal';
import GeneratePoModal from '../components/GeneratePoModal';
import CreateRequisitionModal from '../components/CreateRequisitionModal';
import { generatePoPdf } from '../services/pdfService';

interface PurchaseOrdersProps {
    purchaseOrders: PurchaseOrder[];
    vendors: Vendor[];
    inventory: InventoryItem[];
    onCreatePo: (poDetails: Omit<PurchaseOrder, 'id' | 'status' | 'createdAt' | 'items'> & { items: { sku: string; name: string; quantity: number }[], requisitionIds?: string[] }) => void;
    addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
    currentUser: User;
    approvedRequisitions: InternalRequisition[];
    onGeneratePos: (posToCreate: { vendorId: string; items: { sku: string; name: string; quantity: number }[]; requisitionIds: string[]; }[]) => void;
    gmailConnection: GmailConnection;
    onSendEmail: (poId: string) => void;
    requisitions: InternalRequisition[];
    users: User[];
    onApproveRequisition: (reqId: string) => void;
    onRejectRequisition: (reqId: string) => void;
    onCreateRequisition: (items: RequisitionItem[]) => void;
}

const PoStatusBadge: React.FC<{ status: 'Pending' | 'Submitted' | 'Fulfilled' }> = ({ status }) => {
    const statusConfig = {
      'Pending': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'Submitted': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'Fulfilled': 'bg-green-500/20 text-green-400 border-green-500/30',
    };
    return <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border ${statusConfig[status]}`}>{status}</span>;
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
        approvedRequisitions, onGeneratePos, gmailConnection, onSendEmail,
        requisitions, users, onApproveRequisition, onRejectRequisition, onCreateRequisition
    } = props;
    
    const [isCreatePoModalOpen, setIsCreatePoModalOpen] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isGeneratePoModalOpen, setIsGeneratePoModalOpen] = useState(false);
    const [isCreateReqModalOpen, setIsCreateReqModalOpen] = useState(false);
    const [isRequisitionsOpen, setIsRequisitionsOpen] = useState(true);
    const [selectedPoForEmail, setSelectedPoForEmail] = useState<PurchaseOrder | null>(null);
    
    const vendorMap = useMemo(() => new Map(vendors.map(v => [v.id, v])), [vendors]);
    const userMap = useMemo(() => new Map(users.map(u => [u.id, u.name])), [users]);

    const canManagePOs = currentUser.role === 'Admin';

    const calculateTotal = (items: {quantity: number, price: number}[]) => {
        return items.reduce((sum, item) => sum + item.quantity * item.price, 0).toFixed(2);
    };
    
    const handleDownloadPdf = (po: PurchaseOrder) => {
        const vendor = vendorMap.get(po.vendorId);
        if (vendor) {
            generatePoPdf(po, vendor);
            addToast(`Downloaded ${po.id}.pdf`, 'success');
        } else {
            addToast(`Could not generate PDF: Vendor not found for ${po.id}`, 'error');
        }
    };
    
    const handleSendEmailClick = (po: PurchaseOrder) => {
        setSelectedPoForEmail(po);
        setIsEmailModalOpen(true);
    };

    const handleSendEmail = () => {
        if (selectedPoForEmail) {
            onSendEmail(selectedPoForEmail.id);
        }
        setIsEmailModalOpen(false);
        setSelectedPoForEmail(null);
    };

    const sortedPurchaseOrders = useMemo(() => 
        [...purchaseOrders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        [purchaseOrders]
    );

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
                            {currentUser.role === 'Admin' && approvedRequisitions.length > 0 && (
                                <button
                                    onClick={() => setIsGeneratePoModalOpen(true)}
                                    className="relative flex-1 sm:flex-initial bg-green-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-green-700 transition-colors"
                                >
                                    Generate from Requisitions
                                    <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs">{approvedRequisitions.length}</span>
                                </button>
                            )}
                            <button 
                                onClick={() => setIsCreatePoModalOpen(true)}
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
                />

                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden border border-gray-700">
                    <div className="p-4 bg-gray-800">
                        <h2 className="text-xl font-semibold text-gray-300">External Purchase Orders</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-800">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">PO Number</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Vendor</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Date Created</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Expected Date</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Total</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-gray-800 divide-y divide-gray-700">
                                {sortedPurchaseOrders.map((po) => (
                                    <tr key={po.id} className="hover:bg-gray-700/50 transition-colors duration-200">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-400">{po.id}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{vendorMap.get(po.vendorId)?.name || 'Unknown Vendor'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap"><PoStatusBadge status={po.status} /></td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{new Date(po.createdAt).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : 'N/A'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white font-semibold">${calculateTotal(po.items)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
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
                isOpen={isCreatePoModalOpen}
                onClose={() => setIsCreatePoModalOpen(false)}
                vendors={vendors}
                inventory={inventory}
                onCreatePo={onCreatePo}
            />

            {selectedPoForEmail && (
                <EmailComposerModal 
                    isOpen={isEmailModalOpen}
                    onClose={() => setIsEmailModalOpen(false)}
                    onSend={handleSendEmail}
                    purchaseOrder={selectedPoForEmail}
                    vendor={vendorMap.get(selectedPoForEmail.vendorId)!}
                    gmailConnection={gmailConnection}
                />
            )}
            
            {currentUser.role === 'Admin' && (
                <GeneratePoModal 
                    isOpen={isGeneratePoModalOpen}
                    onClose={() => setIsGeneratePoModalOpen(false)}
                    approvedRequisitions={approvedRequisitions}
                    inventory={inventory}
                    vendors={vendors}
                    onGenerate={onGeneratePos}
                />
            )}

            <CreateRequisitionModal 
                isOpen={isCreateReqModalOpen}
                onClose={() => setIsCreateReqModalOpen(false)}
                inventory={inventory}
                onCreate={onCreateRequisition}
            />
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
}

const RequisitionsSection: React.FC<RequisitionsSectionProps> = ({ requisitions, currentUser, userMap, isOpen, onToggle, onApprove, onReject, onCreate }) => {

    const displayedRequisitions = useMemo(() => {
        const sorted = [...requisitions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        if (currentUser.role === 'Admin') return sorted;
        return sorted.filter(r => r.department === currentUser.department);
    }, [requisitions, currentUser]);

    const pendingCount = useMemo(() => 
        displayedRequisitions.filter(r => r.status === 'Pending').length, 
        [displayedRequisitions]
    );

    const canTakeAction = (req: InternalRequisition) => {
        if (req.status !== 'Pending') return false;
        if (currentUser.role === 'Admin') return true;
        if (currentUser.role === 'Manager' && currentUser.department === req.department) return true;
        return false;
    }

    return (
        <CollapsibleSection title="Internal Requisitions" count={pendingCount} isOpen={isOpen} onToggle={onToggle}>
            <div className="p-4 flex justify-end">
                {currentUser.role !== 'Admin' && (
                    <button onClick={onCreate} className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors">
                        Create Manual Requisition
                    </button>
                )}
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-800/50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Req ID</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Requester</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Department</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Items</th>
                            {(currentUser.role === 'Admin' || currentUser.role === 'Manager') && <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>}
                        </tr>
                    </thead>
                    <tbody className="bg-gray-800 divide-y divide-gray-700">
                        {displayedRequisitions.map(req => (
                            <tr key={req.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-400">{req.id}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                    {req.source === 'System' ? (
                                        <div className="flex items-center gap-2" title="Auto-generated by AI Planning Insights based on demand forecast">
                                            <BotIcon className="w-4 h-4 text-indigo-400"/> 
                                            <span className="text-indigo-300 font-semibold">AI Generated</span>
                                        </div>
                                    ) : (userMap.get(req.requesterId!) || 'Unknown User')}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{req.department}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{new Date(req.createdAt).toLocaleDateString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap"><ReqStatusBadge status={req.status} /></td>
                                <td className="px-6 py-4 text-sm text-gray-300">
                                    <ul className="space-y-1">
                                        {req.items.map(item => (
                                            <li key={item.sku} title={item.reason}>{item.quantity}x {item.name}</li>
                                        ))}
                                    </ul>
                                </td>
                                {(currentUser.role === 'Admin' || currentUser.role === 'Manager') && (
                                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
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