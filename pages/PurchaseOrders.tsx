
import React, { useMemo, useState } from 'react';
// FIX: Import GmailConnection from types.ts.
import type { PurchaseOrder, Vendor, InventoryItem, User, InternalRequisition, GmailConnection } from '../types';
import { MailIcon, FileTextIcon } from '../components/icons';
import CreatePoModal from '../components/CreatePoModal';
import EmailComposerModal from '../components/EmailComposerModal';
import GeneratePoModal from '../components/GeneratePoModal';
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
}

const StatusBadge: React.FC<{ status: 'Pending' | 'Submitted' | 'Fulfilled' }> = ({ status }) => {
    const statusConfig = {
      'Pending': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'Submitted': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'Fulfilled': 'bg-green-500/20 text-green-400 border-green-500/30',
    };
    return <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border ${statusConfig[status]}`}>{status}</span>;
};

const PurchaseOrders: React.FC<PurchaseOrdersProps> = ({ purchaseOrders, vendors, inventory, onCreatePo, addToast, currentUser, approvedRequisitions, onGeneratePos, gmailConnection, onSendEmail }) => {
    const [isCreatePoModalOpen, setIsCreatePoModalOpen] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isGeneratePoModalOpen, setIsGeneratePoModalOpen] = useState(false);
    const [selectedPoForEmail, setSelectedPoForEmail] = useState<PurchaseOrder | null>(null);
    
    const vendorMap = useMemo(() => new Map(vendors.map(v => [v.id, v])), [vendors]);

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
                        <p className="text-gray-400 mt-1">Track and manage all your purchase orders.</p>
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

                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden border border-gray-700">
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
                                        <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={po.status} /></td>
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
        </>
    );
};

export default PurchaseOrders;