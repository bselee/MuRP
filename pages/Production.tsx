import React, { useMemo, useState } from 'react';
import ProductionCalendarView from '../components/ProductionCalendarView';
import { CalendarIcon, TableCellsIcon } from '../components/icons';
import type { BuildOrder, BillOfMaterials, InventoryItem, Vendor } from '../types';

interface ProductionProps {
    buildOrders: BuildOrder[];
    boms: BillOfMaterials[];
    inventory: InventoryItem[];
    vendors: Vendor[];
    onCompleteBuildOrder: (buildOrderId: string) => void;
    onCreateBuildOrder: (sku: string, name: string, quantity: number, scheduledDate?: string, dueDate?: string) => void;
    onUpdateBuildOrder: (buildOrder: BuildOrder) => void;
    addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const StatusBadge: React.FC<{ status: BuildOrder['status'] }> = ({ status }) => {
    const statusConfig = {
      'Pending': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'In Progress': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'Completed': 'bg-green-500/20 text-green-400 border-green-500/30',
    };
    return <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border ${statusConfig[status]}`}>{status}</span>;
};


const Production: React.FC<ProductionProps> = ({ 
    buildOrders, 
    boms, 
    inventory, 
    vendors, 
    onCompleteBuildOrder, 
    onCreateBuildOrder, 
    onUpdateBuildOrder, 
    addToast 
}) => {
    const [view, setView] = useState<'table' | 'calendar'>('table');
    
    const sortedBuildOrders = useMemo(() => 
        [...buildOrders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        [buildOrders]
    );

    return (
        <div className="space-y-6">
            <header>
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">Production</h1>
                        <p className="text-gray-400 mt-1">Manage internal build orders for finished goods.</p>
                    </div>
                    
                    {/* View Toggle */}
                    <div className="flex bg-gray-700 rounded-lg">
                        <button
                            onClick={() => setView('table')}
                            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                                view === 'table'
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-gray-300 hover:text-white hover:bg-gray-600'
                            }`}
                        >
                            <TableCellsIcon className="w-4 h-4" />
                            Table View
                        </button>
                        <button
                            onClick={() => setView('calendar')}
                            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                                view === 'calendar'
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-gray-300 hover:text-white hover:bg-gray-600'
                            }`}
                        >
                            <CalendarIcon className="w-4 h-4" />
                            Calendar View
                        </button>
                    </div>
                </div>
            </header>

            {view === 'calendar' ? (
                <ProductionCalendarView
                    buildOrders={buildOrders}
                    boms={boms}
                    inventory={inventory}
                    vendors={vendors}
                    onCreateBuildOrder={onCreateBuildOrder}
                    onUpdateBuildOrder={onUpdateBuildOrder}
                    onCompleteBuildOrder={onCompleteBuildOrder}
                    addToast={addToast}
                />
            ) : (

            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden border border-gray-700">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-800">
                            <tr>
                                <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Build Order</th>
                                <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Product</th>
                                <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Quantity</th>
                                <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Date Created</th>
                                <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {sortedBuildOrders.map((bo) => (
                                <tr key={bo.id} className="hover:bg-gray-700/50 transition-colors duration-200">
                                    <td className="px-6 py-1 whitespace-nowrap text-sm font-medium text-green-400">{bo.id}</td>
                                    <td className="px-6 py-1 whitespace-nowrap">
                                        <div className="text-sm font-medium text-white">{bo.name}</div>
                                        <div className="text-xs text-gray-400">{bo.finishedSku}</div>
                                    </td>
                                    <td className="px-6 py-1 whitespace-nowrap text-sm text-white font-semibold">{bo.quantity}</td>
                                    <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-400">{new Date(bo.createdAt).toLocaleDateString()}</td>
                                    <td className="px-6 py-1 whitespace-nowrap"><StatusBadge status={bo.status} /></td>
                                    <td className="px-6 py-1 whitespace-nowrap">
                                        {bo.status !== 'Completed' ? (
                                            <button 
                                                onClick={() => onCompleteBuildOrder(bo.id)}
                                                className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-1.5 px-3 rounded-md transition-colors"
                                            >
                                                Mark Completed
                                            </button>
                                        ) : (
                                            <span className="text-xs text-gray-500">Done</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            )}
        </div>
    );
};

export default Production;