import React, { useMemo, useState } from 'react';
import ProductionCalendarView from '../components/ProductionCalendarView';
import ProductionTimelineView from '../components/ProductionTimelineView';
import { CalendarIcon, TableCellsIcon, TimelineIcon } from '../components/icons';
import Button from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import type { BuildOrder, BillOfMaterials, InventoryItem, Vendor, PurchaseOrder, QuickRequestDefaults } from '../types';
import ScheduleBuildModal from '../components/ScheduleBuildModal';
import { useTheme } from '../components/ThemeProvider';

interface ProductionProps {
    buildOrders: BuildOrder[];
    boms: BillOfMaterials[];
    inventory: InventoryItem[];
    vendors: Vendor[];
    purchaseOrders: PurchaseOrder[];
    onCompleteBuildOrder: (buildOrderId: string) => void;
    onCreateBuildOrder: (sku: string, name: string, quantity: number, scheduledDate?: string, dueDate?: string) => void;
    onUpdateBuildOrder: (buildOrder: BuildOrder) => void;
    addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
    onQuickRequest?: (defaults?: QuickRequestDefaults) => void;
}

const Production: React.FC<ProductionProps> = ({ 
    buildOrders, 
    boms, 
    inventory, 
    vendors, 
    purchaseOrders,
    onCompleteBuildOrder, 
    onCreateBuildOrder, 
    onUpdateBuildOrder, 
    addToast,
    onQuickRequest
}) => {
    const { isDark } = useTheme();
    const [view, setView] = useState<'table' | 'calendar' | 'timeline'>('table');
    const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
    const [scheduleAnchor, setScheduleAnchor] = useState<Date | null>(null);
    
    const sortedBuildOrders = useMemo(() => 
        [...buildOrders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        [buildOrders]
    );

    return (
        <div className="space-y-6">
            <PageHeader
                title="Production"
                description="Schedule builds, track orders, and manage production workflow"
                icon={<CalendarIcon className="w-6 h-6" />}
                actions={
                    <div className="flex items-center gap-3 flex-wrap justify-end">
                        <div className="flex gap-2 flex-wrap justify-end">
                            {onQuickRequest && (
                                <Button
                                    onClick={() => onQuickRequest()}
                                    className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg transition-colors"
                                >
                                    Ask About Product
                                </Button>
                            )}
                            <Button
                                onClick={() => {
                                    setScheduleAnchor(new Date());
                                    setScheduleModalOpen(true);
                                }}
                                className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors"
                            >
                                Schedule Build
                            </Button>
                        </div>
                        {/* View Toggle */}
                        <div className={`flex items-center gap-2 rounded-2xl border ${isDark ? 'border-white/10 bg-white/5' : 'border-gray-300 bg-gray-100'} p-1 backdrop-blur`}>
                            <button
                                type="button"
                                onClick={() => setView('table')}
                                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                                    view === 'table' ? 'bg-accent-500 text-white' : isDark ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                <TableCellsIcon className="w-4 h-4" />
                                List
                            </button>
                            <button
                                type="button"
                                onClick={() => setView('calendar')}
                                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                                    view === 'calendar' ? 'bg-accent-500 text-white' : isDark ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                <CalendarIcon className="w-4 h-4" />
                                Calendar
                            </button>
                            <button
                                type="button"
                                onClick={() => setView('timeline')}
                                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                                    view === 'timeline' ? 'bg-accent-500 text-white' : isDark ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                <TimelineIcon className="w-4 h-4" />
                                Timeline
                            </button>
                        </div>
                    </div>
                }
            />

            {view === 'calendar' ? (
                <ProductionCalendarView
                    buildOrders={buildOrders}
                    boms={boms}
                    inventory={inventory}
                    vendors={vendors}
                    purchaseOrders={purchaseOrders}
                    onCreateBuildOrder={onCreateBuildOrder}
                    onUpdateBuildOrder={onUpdateBuildOrder}
                    onCompleteBuildOrder={onCompleteBuildOrder}
                    addToast={addToast}
                />
            ) : view === 'timeline' ? (
                <ProductionTimelineView buildOrders={buildOrders} boms={boms} purchaseOrders={purchaseOrders} />
            ) : (

            <div className={`rounded-3xl border ${isDark ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-white shadow-sm'} backdrop-blur ${isDark ? 'shadow-[0_25px_80px_rgba(1,5,20,0.45)]' : ''} overflow-hidden`}>
                <div className="overflow-x-auto">
                    <table className={`table-density min-w-full divide-y ${isDark ? 'divide-white/10' : 'divide-gray-200'}`}>
                        <thead className={isDark ? 'bg-white/5' : 'bg-gray-50'}>
                            <tr>
                                <th className={`px-6 py-2 text-left text-xs font-semibold ${isDark ? 'text-gray-200' : 'text-gray-600'} uppercase tracking-wider`}>Build Order</th>
                                <th className={`px-6 py-2 text-left text-xs font-semibold ${isDark ? 'text-gray-200' : 'text-gray-600'} uppercase tracking-wider`}>Product</th>
                                <th className={`px-6 py-2 text-left text-xs font-semibold ${isDark ? 'text-gray-200' : 'text-gray-600'} uppercase tracking-wider`}>Quantity</th>
                                <th className={`px-6 py-2 text-left text-xs font-semibold ${isDark ? 'text-gray-200' : 'text-gray-600'} uppercase tracking-wider`}>Scheduled</th>
                                <th className={`px-6 py-2 text-left text-xs font-semibold ${isDark ? 'text-gray-200' : 'text-gray-600'} uppercase tracking-wider`}>Status</th>
                                <th className={`px-6 py-2 text-left text-xs font-semibold ${isDark ? 'text-gray-200' : 'text-gray-600'} uppercase tracking-wider`}>Action</th>
                            </tr>
                        </thead>
                        <tbody className={`${isDark ? 'bg-white/5' : 'bg-white'} divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
                            {sortedBuildOrders.map((bo) => (
                                <tr key={bo.id} className={`${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'} transition-colors duration-200`}>
                                    <td className="px-6 py-1 whitespace-nowrap text-sm font-medium text-emerald-500">{bo.id}</td>
                                    <td className="px-6 py-1 whitespace-nowrap">
                                        <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{bo.name}</div>
                                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{bo.finishedSku}</div>
                                    </td>
                                    <td className={`px-6 py-1 whitespace-nowrap text-sm ${isDark ? 'text-white' : 'text-gray-900'} font-semibold`}>{bo.quantity}</td>
                                    <td className={`px-6 py-1 whitespace-nowrap text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                        {bo.scheduledDate
                                            ? new Date(bo.scheduledDate).toLocaleDateString()
                                            : new Date(bo.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-1 whitespace-nowrap"><StatusBadge status={bo.status} /></td>
                                    <td className="px-6 py-1 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            {onQuickRequest && bo.finishedSku && (
                                                <Button
                                                    onClick={() => onQuickRequest({ sku: bo.finishedSku, requestType: 'product_alert', alertOnly: true })}
                                                    className={`${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} ${isDark ? 'text-white' : 'text-gray-800'} text-xs font-semibold py-1.5 px-3 rounded-md transition-colors`}
                                                >
                                                    Ask
                                                </Button>
                                            )}
                                            {bo.status !== 'Completed' ? (
                                                <Button 
                                                    onClick={() => onCompleteBuildOrder(bo.id)}
                                                    className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-1.5 px-3 rounded-md transition-colors"
                                                >
                                                    Mark Completed
                                                </Button>
                                            ) : (
                                                <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Done</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            )}
            {scheduleModalOpen && (
                <ScheduleBuildModal
                    boms={boms}
                    defaultStart={scheduleAnchor ?? new Date()}
                    onClose={() => {
                        setScheduleModalOpen(false);
                        setScheduleAnchor(null);
                    }}
                    onCreate={(sku, name, quantity, scheduledDate, dueDate) => {
                        onCreateBuildOrder(sku, name, quantity, scheduledDate, dueDate);
                        addToast(`Scheduled ${quantity}x ${name}`, 'success');
                        setScheduleModalOpen(false);
                        setScheduleAnchor(null);
                    }}
                />
            )}
        </div>
    );
};

export default Production;
