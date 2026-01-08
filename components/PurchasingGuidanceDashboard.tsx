import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getRigorousPurchasingAdvice, getForecastAccuracyMetrics } from '../services/purchasingForecastingService';
import { detectInventoryAnomalies, type Anomaly } from '../services/aiPurchasingService';
import { supabase } from '../lib/supabase/client';
import { createPurchaseOrder, batchUpdateInventory } from '../hooks/useSupabaseMutations';
import { MagicSparklesIcon, ShoppingCartIcon, CheckIcon, PlusIcon, CheckCircleIcon, XCircleIcon } from './icons';
import type { CreatePurchaseOrderInput } from '../types';

interface AdviceItem {
    sku: string;
    name: string;
    vendor_name: string;
    vendor_id?: string;
    days_remaining: number;
    current_status: {
        stock: number;
        on_order: number;
    };
    linked_po?: {
        po_number: string;
        expected_date: string;
    };
    item_type: string;
    recommendation: {
        quantity: number;
    };
}

export default function PurchasingGuidanceDashboard() {
    const [advice, setAdvice] = useState<AdviceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState<any>({
        accuracy: null,
        riskItems: 0,
        vendorReliability: null,
        inventoryTurnover: null
    });

    const [agentInsights, setAgentInsights] = useState<{
        critical: Anomaly[];
        warning: Anomaly[];
    }>({ critical: [], warning: [] });

    // Selection state for batch actions
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [isCreatingPO, setIsCreatingPO] = useState(false);

    // Toast notifications
    const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>>([]);

    // Ref for scrolling to replenishment section
    const replenishmentRef = useRef<HTMLDivElement>(null);

    const scrollToReplenishment = () => {
        replenishmentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // Add a toast notification
    const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
        const id = crypto.randomUUID();
        setToasts(prev => [...prev, { id, message, type }]);
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 5000);
    }, []);

    // Generate unique PO ID
    const generateOrderId = useCallback(() => {
        const now = new Date();
        const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const randomSegment = crypto.randomUUID().split('-')[0].toUpperCase();
        return `PO-${datePart}-${randomSegment}`;
    }, []);

    useEffect(() => {
        loadData();

        const intervalId = setInterval(() => {
            loadData(true); // Silent refresh
        }, 5 * 60 * 1000); // Refresh every 5 minutes

        return () => clearInterval(intervalId);
    }, []);

    // Initial agent run
    useEffect(() => {
        runAgentAnalysis();
    }, []);

    async function runAgentAnalysis() {
        try {
            console.log('🤖 Running Agent Analysis...');
            const result = await detectInventoryAnomalies();
            setAgentInsights({
                critical: result.critical || [],
                warning: result.warning || []
            });
        } catch (err) {
            console.error('Agent analysis failed', err);
        }
    }

    async function loadData(silent = false) {
        if (!silent) setLoading(true);
        try {
            // 1. Get Purchasing Advice
            const adviceData = await getRigorousPurchasingAdvice();
            setAdvice(adviceData);

            // 2. Get Forecast Accuracy (Mock if empty)
            const forecasts = await getForecastAccuracyMetrics();
            const accuracy = forecasts.length > 0
                ? forecasts.reduce((acc: number, f: any) => acc + (f.error_pct || 0), 0) / forecasts.length
                : null;

            // 3. Calculate real Vendor Reliability from Finale PO data
            let vendorReliability: number | null = null;
            try {
                // Try to calculate from POs with both expected and actual dates
                const { data: poData, error: poError } = await supabase
                    .from('finale_purchase_orders')
                    .select('status, expected_date, received_date, tracking_delivered_date')
                    .eq('status', 'Completed')
                    .not('expected_date', 'is', null);

                if (!poError && poData && poData.length > 0) {
                    // Count POs with actual delivery info
                    const withDeliveryDate = poData.filter(po =>
                        po.received_date || po.tracking_delivered_date
                    );

                    if (withDeliveryDate.length > 0) {
                        const completedPOs = withDeliveryDate.length;
                        const onTimePOs = withDeliveryDate.filter(po => {
                            const actualDate = po.tracking_delivered_date || po.received_date;
                            if (!po.expected_date || !actualDate) return false;
                            return new Date(actualDate) <= new Date(po.expected_date);
                        }).length;
                        vendorReliability = completedPOs > 0 ? (onTimePOs / completedPOs) * 100 : null;
                    }
                }
            } catch (err) {
                console.warn('Could not calculate vendor reliability:', err);
            }

            // 4. Calculate Inventory Turnover from velocity data
            let inventoryTurnover: number | null = null;
            try {
                const { data: velocityData, error: velocityError } = await supabase
                    .from('inventory_velocity_summary')
                    .select('sales_velocity, stock')
                    .gt('stock', 0);

                if (!velocityError && velocityData && velocityData.length > 0) {
                    const totalVelocity = velocityData.reduce((sum: number, item: { sales_velocity: number | null }) =>
                        sum + (item.sales_velocity || 0), 0);
                    const totalStock = velocityData.reduce((sum: number, item: { stock: number | null }) =>
                        sum + (item.stock || 0), 0);

                    if (totalStock > 0) {
                        inventoryTurnover = (totalVelocity * 365) / totalStock;
                    }
                }
            } catch (err) {
                console.debug('Velocity summary not available:', err);
            }

            setMetrics({
                accuracy: accuracy ? (100 - accuracy).toFixed(1) : 'N/A',
                riskItems: adviceData.length,
                vendorReliability: vendorReliability !== null ? vendorReliability.toFixed(1) : 'N/A',
                inventoryTurnover: inventoryTurnover !== null ? inventoryTurnover.toFixed(1) : 'N/A'
            });

        } catch (err) {
            console.error('Failed to load purchasing guidance', err);
        } finally {
            if (!silent) setLoading(false);
        }
    }

    // Toggle single item selection
    const toggleSelect = (sku: string) => {
        setSelectedItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(sku)) {
                newSet.delete(sku);
            } else {
                newSet.add(sku);
            }
            return newSet;
        });
    };

    // Toggle all items (only items needing orders, not ones already on PO)
    const toggleSelectAll = () => {
        const needsOrderSkus = advice.filter(item => !item.linked_po).map(item => item.sku);
        if (selectedItems.size === needsOrderSkus.length && needsOrderSkus.length > 0) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(needsOrderSkus));
        }
    };

    // Group selected items by vendor for PO creation
    const getSelectedByVendor = () => {
        const byVendor: Record<string, AdviceItem[]> = {};
        advice.filter(item => selectedItems.has(item.sku)).forEach(item => {
            const vendor = item.vendor_name || 'Unknown';
            if (!byVendor[vendor]) byVendor[vendor] = [];
            byVendor[vendor].push(item);
        });
        return byVendor;
    };

    // Create draft PO for selected items
    const handleCreatePO = async () => {
        if (selectedItems.size === 0) return;

        setIsCreatingPO(true);
        const byVendor = getSelectedByVendor();
        const vendorNames = Object.keys(byVendor);
        let successCount = 0;
        let errorCount = 0;
        const createdPOs: string[] = [];

        try {
            // Create one PO per vendor
            for (const vendorName of vendorNames) {
                const vendorItems = byVendor[vendorName];
                const vendorId = vendorItems[0]?.vendor_id;

                if (!vendorId) {
                    // Try to look up vendor by name
                    const { data: vendorData } = await supabase
                        .from('vendors')
                        .select('id')
                        .ilike('name', vendorName)
                        .limit(1)
                        .maybeSingle();

                    if (!vendorData?.id) {
                        console.warn(`[handleCreatePO] Could not find vendor ID for ${vendorName}`);
                        errorCount++;
                        addToast(`Could not find vendor: ${vendorName}`, 'error');
                        continue;
                    }

                    const orderId = generateOrderId();
                    const poInput: CreatePurchaseOrderInput = {
                        vendorId: vendorData.id,
                        items: vendorItems.map(item => ({
                            sku: item.sku,
                            name: item.name,
                            quantity: item.recommendation.quantity,
                            unitCost: 0, // Will be filled in by user when editing
                        })),
                        notes: `Auto-generated from Purchasing Intelligence dashboard`,
                    };

                    const result = await createPurchaseOrder({
                        ...poInput,
                        orderId,
                        supplier: vendorName,
                        status: 'Pending',
                        orderDate: new Date().toISOString().split('T')[0],
                    });

                    if (result.success) {
                        createdPOs.push(orderId);
                        successCount++;

                        // Update on_order quantities
                        await batchUpdateInventory(
                            vendorItems.map(item => ({
                                sku: item.sku,
                                stockDelta: 0,
                                onOrderDelta: item.recommendation.quantity,
                            }))
                        );
                    } else {
                        errorCount++;
                        console.error(`[handleCreatePO] Failed to create PO for ${vendorName}:`, result.error);
                    }
                } else {
                    const orderId = generateOrderId();
                    const poInput: CreatePurchaseOrderInput = {
                        vendorId,
                        items: vendorItems.map(item => ({
                            sku: item.sku,
                            name: item.name,
                            quantity: item.recommendation.quantity,
                            unitCost: 0,
                        })),
                        notes: `Auto-generated from Purchasing Intelligence dashboard`,
                    };

                    const result = await createPurchaseOrder({
                        ...poInput,
                        orderId,
                        supplier: vendorName,
                        status: 'Pending',
                        orderDate: new Date().toISOString().split('T')[0],
                    });

                    if (result.success) {
                        createdPOs.push(orderId);
                        successCount++;

                        // Update on_order quantities
                        await batchUpdateInventory(
                            vendorItems.map(item => ({
                                sku: item.sku,
                                stockDelta: 0,
                                onOrderDelta: item.recommendation.quantity,
                            }))
                        );
                    } else {
                        errorCount++;
                        console.error(`[handleCreatePO] Failed to create PO for ${vendorName}:`, result.error);
                    }
                }
            }

            // Show results
            if (successCount > 0) {
                addToast(
                    `Created ${successCount} PO${successCount > 1 ? 's' : ''}: ${createdPOs.join(', ')}`,
                    'success'
                );
                // Clear selection after successful creation
                setSelectedItems(new Set());
                // Reload data to reflect new on_order quantities
                loadData(true);
            }

            if (errorCount > 0) {
                addToast(`Failed to create ${errorCount} PO${errorCount > 1 ? 's' : ''}`, 'error');
            }
        } catch (err) {
            console.error('Failed to create PO:', err);
            addToast('Unexpected error creating PO', 'error');
        } finally {
            setIsCreatingPO(false);
        }
    };

    // Quick action for single item - creates a single-item PO
    const handleQuickOrder = async (item: AdviceItem) => {
        setIsCreatingPO(true);
        try {
            // Look up vendor ID
            let vendorId = item.vendor_id;
            if (!vendorId && item.vendor_name) {
                const { data: vendorData } = await supabase
                    .from('vendors')
                    .select('id')
                    .ilike('name', item.vendor_name)
                    .limit(1)
                    .maybeSingle();
                vendorId = vendorData?.id;
            }

            if (!vendorId) {
                addToast(`Could not find vendor: ${item.vendor_name}`, 'error');
                return;
            }

            const orderId = generateOrderId();
            const result = await createPurchaseOrder({
                vendorId,
                items: [{
                    sku: item.sku,
                    name: item.name,
                    quantity: item.recommendation.quantity,
                    unitCost: 0,
                }],
                notes: `Quick order from Purchasing Intelligence for ${item.sku}`,
                orderId,
                supplier: item.vendor_name,
                status: 'Pending',
                orderDate: new Date().toISOString().split('T')[0],
            });

            if (result.success) {
                // Update on_order quantity
                await batchUpdateInventory([{
                    sku: item.sku,
                    stockDelta: 0,
                    onOrderDelta: item.recommendation.quantity,
                }]);

                addToast(`Created ${orderId} for ${item.sku} (${item.recommendation.quantity} units)`, 'success');
                // Reload data to reflect new on_order quantities
                loadData(true);
            } else {
                addToast(`Failed to create PO: ${result.error}`, 'error');
            }
        } catch (err) {
            console.error('Failed to create quick order:', err);
            addToast('Unexpected error creating quick order', 'error');
        } finally {
            setIsCreatingPO(false);
        }
    };

    // Split advice into items needing action vs items already on order
    const needsOrder = advice.filter(item => !item.linked_po);
    const onOrder = advice.filter(item => !!item.linked_po);

    const selectedCount = selectedItems.size;
    const allSelected = selectedCount === needsOrder.length && needsOrder.length > 0;

    return (
        <div className="space-y-6 relative">
            {/* Toast notifications */}
            {toasts.length > 0 && (
                <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md">
                    {toasts.map(toast => (
                        <div
                            key={toast.id}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border animate-in slide-in-from-right duration-300 ${
                                toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
                                toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
                                'bg-blue-50 border-blue-200 text-blue-800'
                            }`}
                        >
                            {toast.type === 'success' && <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />}
                            {toast.type === 'error' && <XCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0" />}
                            {toast.type === 'info' && <MagicSparklesIcon className="w-5 h-5 text-blue-500 flex-shrink-0" />}
                            <span className="text-sm font-medium">{toast.message}</span>
                            <button
                                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                                className="ml-auto text-gray-400 hover:text-gray-600"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* 1. Header & Context */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Purchasing Intelligence</h2>
                </div>
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-2 text-xs font-medium text-purple-600 bg-purple-50 px-3 py-1.5 rounded-full border border-purple-100">
                        <MagicSparklesIcon className="w-3 h-3" />
                        AI Agent Active
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        Live Updates
                    </span>
                </div>
            </div>

            {/* 2. KPI Cards - "The Control Panel" */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <KPICard
                    title="Stockout Risk"
                    value={metrics.riskItems}
                    unit="SKUs"
                    trend={metrics.riskItems > 5 ? 'critical' : 'neutral'}
                    desc="Items below calculated ROP"
                    onClick={metrics.riskItems > 0 ? scrollToReplenishment : undefined}
                    clickHint={metrics.riskItems > 0 ? "View items to reorder" : undefined}
                />
                <KPICard
                    title="Forecast Accuracy"
                    value={metrics.accuracy}
                    unit="%"
                    trend={metrics.accuracy === 'N/A' ? 'neutral' : 'positive'}
                    desc={metrics.accuracy === 'N/A' ? "No forecast data yet" : "1 - MAPE (Last 90 Days)"}
                />
                <KPICard
                    title="Vendor Reliability"
                    value={metrics.vendorReliability}
                    unit="%"
                    trend={metrics.vendorReliability === 'N/A' ? 'neutral' : (parseFloat(metrics.vendorReliability) >= 80 ? 'positive' : 'critical')}
                    desc={metrics.vendorReliability === 'N/A' ? "No completed POs with delivery dates" : "On-Time Delivery Rate"}
                />
                <KPICard
                    title="Capital Efficiency"
                    value={metrics.inventoryTurnover}
                    unit="Turns"
                    trend="neutral"
                    desc={metrics.inventoryTurnover === 'N/A' ? "No velocity data available" : "Inventory Turnover Rate"}
                />
            </div>

            {/* 2.5 Agent Insights Section */}
            {(agentInsights.critical.length > 0 || agentInsights.warning.length > 0) && (
                <div className="bg-gradient-to-br from-purple-50 to-white rounded-xl shadow-sm border border-purple-100 p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <MagicSparklesIcon className="w-24 h-24 text-purple-500" />
                    </div>

                    <h3 className="font-semibold text-purple-900 flex items-center gap-2 mb-4">
                        <MagicSparklesIcon className="w-5 h-5 text-purple-600" />
                        Agent Insights & Anomalies
                    </h3>

                    <div className="grid gap-3">
                        {agentInsights.critical.map((insight, idx) => (
                            <div key={`crit-${idx}`} className="bg-white border-l-4 border-red-500 rounded-r-lg p-3 shadow-sm flex items-start gap-3">
                                <div className="text-red-500 mt-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
                                </div>
                                <div>
                                    <div className="font-medium text-slate-900 text-sm">{insight.description} ({insight.sku})</div>
                                    <div className="text-slate-600 text-xs mt-1">{insight.issue}</div>
                                    <div className="text-slate-500 text-xs mt-1 italic">Suggested: {insight.action}</div>
                                </div>
                            </div>
                        ))}
                        {agentInsights.warning.map((insight, idx) => (
                            <div key={`warn-${idx}`} className="bg-white border-l-4 border-amber-400 rounded-r-lg p-3 shadow-sm flex items-start gap-3">
                                <div className="text-amber-500 mt-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
                                </div>
                                <div>
                                    <div className="font-medium text-slate-900 text-sm">{insight.description} ({insight.sku})</div>
                                    <div className="text-slate-600 text-xs mt-1">{insight.issue}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 3. ACTION REQUIRED - Items needing POs */}
            <div ref={replenishmentRef} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                            Action Required: Order Now
                            {needsOrder.length > 0 && (
                                <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full ml-2">
                                    {needsOrder.length} items
                                </span>
                            )}
                        </h3>
                        {selectedCount > 0 && (
                            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                                {selectedCount} selected
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {selectedCount > 0 && (
                            <button
                                onClick={handleCreatePO}
                                disabled={isCreatingPO}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                                <ShoppingCartIcon className="w-4 h-4" />
                                {isCreatingPO ? 'Creating...' : `Create PO (${selectedCount})`}
                            </button>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div className="p-12 text-center text-slate-400">Loading analysis...</div>
                ) : needsOrder.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                        <div className="mb-2 text-2xl font-bold text-green-500">OK</div>
                        No items need ordering right now.<br />
                        <span className="text-sm opacity-75">All at-risk items already have POs placed.</span>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-red-50 text-slate-600 font-medium">
                                <tr>
                                    <th className="px-4 py-3 w-10">
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            onChange={toggleSelectAll}
                                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            title="Select all items"
                                        />
                                    </th>
                                    <th className="px-4 py-3">SKU / Product</th>
                                    <th className="px-4 py-3">Vendor</th>
                                    <th className="px-4 py-3 text-right">Stock</th>
                                    <th className="px-4 py-3 text-right">Days Left</th>
                                    <th className="px-4 py-3">Type</th>
                                    <th className="px-4 py-3 text-right">Suggested Qty</th>
                                    <th className="px-4 py-3 w-24"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {needsOrder.map((item, idx) => {
                                    const daysRemaining = item.days_remaining ?? 999;
                                    const isSelected = selectedItems.has(item.sku);
                                    const rowClass = daysRemaining <= 0 ? 'bg-red-100' :
                                        daysRemaining < 7 ? 'bg-red-50' :
                                        daysRemaining < 14 ? 'bg-yellow-50' : '';

                                    return (
                                        <tr
                                            key={idx}
                                            className={`${rowClass} ${isSelected ? 'ring-2 ring-inset ring-blue-300' : ''} hover:bg-slate-50/50 transition-colors cursor-pointer`}
                                            onClick={(e) => {
                                                if ((e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'BUTTON') {
                                                    toggleSelect(item.sku);
                                                }
                                            }}
                                        >
                                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleSelect(item.sku)}
                                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-slate-900 font-mono text-xs">{item.sku}</div>
                                                <div className="text-slate-500 text-xs max-w-[300px] truncate" title={item.name}>{item.name}</div>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-slate-600 max-w-[120px] truncate">
                                                {item.vendor_name || 'Unknown'}
                                            </td>
                                            <td className={`px-4 py-3 text-right font-medium ${item.current_status.stock === 0 ? 'text-red-600' : 'text-slate-900'}`}>
                                                {item.current_status.stock}
                                            </td>
                                            <td className={`px-4 py-3 text-right font-bold ${
                                                daysRemaining <= 0 ? 'text-red-700' :
                                                daysRemaining < 7 ? 'text-red-600' :
                                                daysRemaining < 14 ? 'text-yellow-600' :
                                                'text-slate-600'
                                            }`}>
                                                {daysRemaining <= 0 ? 'OUT' : daysRemaining}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 text-xs rounded ${
                                                    item.item_type === 'Manufactured'
                                                        ? 'bg-purple-100 text-purple-700'
                                                        : 'bg-blue-100 text-blue-700'
                                                }`}>
                                                    {item.item_type === 'Manufactured' ? 'Mfg' : 'Purch'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                    +{item.recommendation.quantity}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => handleQuickOrder(item)}
                                                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-white hover:bg-blue-600 border border-blue-200 hover:border-blue-600 rounded transition-colors"
                                                    title={`Quick order ${item.recommendation.quantity} units`}
                                                >
                                                    <PlusIcon className="w-3 h-3" />
                                                    Order
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Batch action footer when items selected */}
                {selectedCount > 0 && (
                    <div className="px-6 py-3 bg-blue-50 border-t border-blue-100 flex items-center justify-between">
                        <div className="text-sm text-blue-700">
                            <strong>{selectedCount}</strong> item{selectedCount !== 1 ? 's' : ''} selected
                            {Object.keys(getSelectedByVendor()).length > 1 && (
                                <span className="ml-2 text-blue-500">
                                    ({Object.keys(getSelectedByVendor()).length} vendors)
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setSelectedItems(new Set())}
                                className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
                            >
                                Clear
                            </button>
                            <button
                                onClick={handleCreatePO}
                                disabled={isCreatingPO}
                                className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                                <ShoppingCartIcon className="w-4 h-4" />
                                Create Purchase Order{Object.keys(getSelectedByVendor()).length > 1 ? 's' : ''}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* 4. ON ORDER - Items with POs (monitoring) */}
            {onOrder.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-green-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-green-100 bg-green-50/50 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                <CheckCircleIcon className="w-5 h-5 text-green-600" />
                                On Order - Monitoring
                                <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded-full ml-2">
                                    {onOrder.length} items
                                </span>
                            </h3>
                        </div>
                        <span className="text-xs text-slate-500">POs placed, awaiting delivery</span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-green-50 text-slate-600 font-medium">
                                <tr>
                                    <th className="px-4 py-3">SKU / Product</th>
                                    <th className="px-4 py-3">Vendor</th>
                                    <th className="px-4 py-3 text-right">Stock</th>
                                    <th className="px-4 py-3 text-right">Days Left</th>
                                    <th className="px-4 py-3">PO #</th>
                                    <th className="px-4 py-3">Est. Arrival</th>
                                    <th className="px-4 py-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {onOrder.map((item, idx) => {
                                    const daysRemaining = item.days_remaining ?? 999;
                                    const expectedDate = item.linked_po?.expected_date ? new Date(item.linked_po.expected_date) : null;
                                    const today = new Date();
                                    const daysUntilArrival = expectedDate ? Math.ceil((expectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;

                                    // Determine if PO will arrive in time
                                    const willArriveInTime = daysUntilArrival !== null && daysUntilArrival <= daysRemaining;
                                    const isLate = daysUntilArrival !== null && daysUntilArrival > daysRemaining;

                                    return (
                                        <tr key={idx} className={`${isLate ? 'bg-amber-50' : 'bg-white'} hover:bg-slate-50/50 transition-colors`}>
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-slate-900 font-mono text-xs">{item.sku}</div>
                                                <div className="text-slate-500 text-xs max-w-[250px] truncate" title={item.name}>{item.name}</div>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-slate-600 max-w-[120px] truncate">
                                                {item.vendor_name || 'Unknown'}
                                            </td>
                                            <td className={`px-4 py-3 text-right font-medium ${item.current_status.stock === 0 ? 'text-red-600' : 'text-slate-900'}`}>
                                                {item.current_status.stock}
                                            </td>
                                            <td className={`px-4 py-3 text-right font-bold ${
                                                daysRemaining <= 0 ? 'text-red-700' :
                                                daysRemaining < 7 ? 'text-red-600' :
                                                daysRemaining < 14 ? 'text-yellow-600' :
                                                'text-slate-600'
                                            }`}>
                                                {daysRemaining <= 0 ? 'OUT' : daysRemaining}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="font-medium text-green-700 font-mono text-xs">
                                                    {item.linked_po?.po_number}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs">
                                                {expectedDate ? (
                                                    <div>
                                                        <div className="font-medium text-slate-700">
                                                            {expectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                        </div>
                                                        <div className="text-slate-400">
                                                            {daysUntilArrival !== null && daysUntilArrival > 0 ? `in ${daysUntilArrival}d` : daysUntilArrival === 0 ? 'Today' : 'Past due'}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400">No date</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {willArriveInTime ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                                                        <CheckIcon className="w-3 h-3" />
                                                        On Track
                                                    </span>
                                                ) : isLate ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-100 rounded-full">
                                                        May stockout before arrival
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 bg-slate-100 rounded-full">
                                                        Pending
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

        </div>
    );
}

interface KPICardProps {
    title: string;
    value: string | number;
    unit: string;
    trend: 'critical' | 'positive' | 'neutral';
    desc: string;
    onClick?: () => void;
    clickHint?: string;
}

function KPICard({ title, value, unit, trend, desc, onClick, clickHint }: KPICardProps) {
    const isCritical = trend === 'critical';
    const isClickable = !!onClick;

    return (
        <div
            className={`p-4 rounded-xl border ${isCritical ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'} shadow-sm ${
                isClickable ? 'cursor-pointer hover:shadow-md hover:border-blue-300 transition-all duration-200 group' : ''
            }`}
            onClick={onClick}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={isClickable ? (e) => e.key === 'Enter' && onClick?.() : undefined}
        >
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">{title}</div>
            <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-bold ${isCritical ? 'text-red-700' : 'text-slate-900'}`}>{value}</span>
                <span className="text-sm text-slate-400 font-medium">{unit}</span>
            </div>
            <div className="mt-2 text-xs text-slate-400 truncate">
                {desc}
            </div>
            {isClickable && clickHint && (
                <div className="mt-2 text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    {clickHint} →
                </div>
            )}
        </div>
    );
}
