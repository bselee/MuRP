import React, { useMemo } from 'react';
import type { PurchaseOrder } from '../types';

interface PurchaseOrdersProps {
    purchaseOrders: PurchaseOrder[];
    vendorMap: Map<string, string>;
}

const StatusBadge: React.FC<{ status: 'Pending' | 'Submitted' | 'Fulfilled' }> = ({ status }) => {
    const statusConfig = {
      'Pending': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'Submitted': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'Fulfilled': 'bg-green-500/20 text-green-400 border-green-500/30',
    };
    return <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border ${statusConfig[status]}`}>{status}</span>;
};

const PurchaseOrders: React.FC<PurchaseOrdersProps> = ({ purchaseOrders, vendorMap }) => {
    
    const calculateTotal = (items: {quantity: number, price: number}[]) => {
        return items.reduce((sum, item) => sum + item.quantity * item.price, 0).toFixed(2);
    };

    const sortedPurchaseOrders = useMemo(() => 
        [...purchaseOrders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        [purchaseOrders]
    );

    return (
        <div className="space-y-6">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Purchase Orders</h1>
                    <p className="text-gray-400 mt-1">Track and manage all your purchase orders.</p>
                </div>
                <button className="w-full sm:w-auto bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors" disabled>
                    Create New PO
                </button>
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
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Total</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {sortedPurchaseOrders.map((po) => (
                                <tr key={po.id} className="hover:bg-gray-700/50 transition-colors duration-200">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-400">{po.id}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{vendorMap.get(po.vendorId) || 'Unknown Vendor'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={po.status} /></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{new Date(po.createdAt).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white font-semibold">${calculateTotal(po.items)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default PurchaseOrders;