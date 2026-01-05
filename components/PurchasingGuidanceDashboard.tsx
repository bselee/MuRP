import React, { useEffect, useState } from 'react';
import { getRigorousPurchasingAdvice, getForecastAccuracyMetrics } from '../services/purchasingForecastingService';
import { detectInventoryAnomalies, type Anomaly } from '../services/aiPurchasingService';
import { supabase } from '../lib/supabase/client';
import { MagicSparklesIcon } from './icons';

export default function PurchasingGuidanceDashboard() {
    const [advice, setAdvice] = useState<any[]>([]);
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

            // 3. Calculate real Vendor Reliability from PO data
            let vendorReliability: number | null = null;
            try {
                const { data: poData, error: poError } = await supabase
                    .from('purchase_orders')
                    .select('status, expected_date, received_at')
                    .in('status', ['received', 'Fulfilled', 'partial']);

                if (!poError && poData && poData.length > 0) {
                    const completedPOs = poData.length;
                    const onTimePOs = poData.filter(po => {
                        if (!po.expected_date || !po.received_at) return false;
                        return new Date(po.received_at) <= new Date(po.expected_date);
                    }).length;
                    vendorReliability = completedPOs > 0 ? (onTimePOs / completedPOs) * 100 : null;
                }
            } catch (err) {
                console.warn('Could not calculate vendor reliability:', err);
            }

            // 4. Calculate Inventory Turnover from velocity data
            // Turnover approximation based on average velocity across inventory
            let inventoryTurnover: number | null = null;
            try {
                const { data: velocityData, error: velocityError } = await supabase
                    .from('inventory_velocity_summary')
                    .select('sales_velocity, stock')
                    .gt('stock', 0);

                if (!velocityError && velocityData && velocityData.length > 0) {
                    // Calculate weighted average turnover (annual velocity / avg stock)
                    const totalVelocity = velocityData.reduce((sum: number, item: { sales_velocity: number | null }) =>
                        sum + (item.sales_velocity || 0), 0);
                    const totalStock = velocityData.reduce((sum: number, item: { stock: number | null }) =>
                        sum + (item.stock || 0), 0);

                    if (totalStock > 0) {
                        // Annualized turnover: (daily velocity * 365) / avg stock
                        inventoryTurnover = (totalVelocity * 365) / totalStock;
                    }
                }
            } catch (err) {
                // View may not exist or query failed, that's okay
                console.debug('Velocity summary not available:', err);
            }

            setMetrics({
                accuracy: accuracy ? (100 - accuracy).toFixed(1) : 'N/A', // 100 - MAPE = Accuracy
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

    return (
        <div className="space-y-6">
            {/* 1. Header & Context */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Purchasing Intelligence</h2>
                    <p className="text-slate-500">Data-driven guidance based on Service Level targets (95% Confidence)</p>
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
                />
                <KPICard
                    title="Forecast Accuracy"
                    value={metrics.accuracy}
                    unit="%"
                    trend={metrics.accuracy === 'N/A' ? 'neutral' : 'positive'}
                    desc="1 - MAPE (Last 90 Days)"
                />
                <KPICard
                    title="Vendor Reliability"
                    value={metrics.vendorReliability}
                    unit="%"
                    trend={metrics.vendorReliability === 'N/A' ? 'neutral' : (parseFloat(metrics.vendorReliability) >= 80 ? 'positive' : 'critical')}
                    desc="On-Time Delivery Rate"
                />
                <KPICard
                    title="Capital Efficiency"
                    value={metrics.inventoryTurnover}
                    unit="Turns"
                    trend="neutral"
                    desc="Inventory Turnover Rate"
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

            {/* 3. Actionable Reorder Advice */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                        Action Required: Replenishment
                    </h3>
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                        Formula: Z × σD × √LT
                    </span>
                </div>

                {loading ? (
                    <div className="p-12 text-center text-slate-400">Loading analysis...</div>
                ) : advice.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                        <div className="mb-2 text-4xl">✅</div>
                        No immediate reorder risks detected.<br />
                        <span className="text-sm opacity-75">All inventory positions are above calculated Reorder Points.</span>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-medium">
                                <tr>
                                    <th className="px-4 py-3">SKU / Product</th>
                                    <th className="px-4 py-3">Vendor</th>
                                    <th className="px-4 py-3 text-right">Stock</th>
                                    <th className="px-4 py-3 text-right">On Order</th>
                                    <th className="px-4 py-3 text-right">Days Left</th>
                                    <th className="px-4 py-3">Est. Receive</th>
                                    <th className="px-4 py-3">Type</th>
                                    <th className="px-4 py-3 text-right">Order Qty</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {advice.map((item, idx) => {
                                    // Row highlighting based on days remaining
                                    const daysRemaining = item.days_remaining || 999;
                                    const rowClass = daysRemaining <= 0 ? 'bg-red-100' :
                                        daysRemaining < 7 ? 'bg-red-50' :
                                        daysRemaining < 14 ? 'bg-yellow-50' :
                                        item.linked_po ? 'bg-green-50' : '';

                                    return (
                                        <tr key={idx} className={`${rowClass} hover:opacity-90 transition-colors`}>
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-slate-900 font-mono text-xs">{item.sku}</div>
                                                <div className="text-slate-500 text-xs truncate max-w-[180px]">{item.name}</div>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-slate-600 max-w-[100px] truncate">
                                                {item.vendor_name || 'Unknown'}
                                            </td>
                                            <td className={`px-4 py-3 text-right font-medium ${item.current_status.stock === 0 ? 'text-red-600' : 'text-slate-900'}`}>
                                                {item.current_status.stock}
                                            </td>
                                            <td className={`px-4 py-3 text-right ${item.current_status.on_order > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                                                {item.current_status.on_order || '-'}
                                            </td>
                                            <td className={`px-4 py-3 text-right font-bold ${
                                                daysRemaining <= 0 ? 'text-red-700' :
                                                daysRemaining < 7 ? 'text-red-600' :
                                                daysRemaining < 14 ? 'text-yellow-600' :
                                                'text-slate-600'
                                            }`}>
                                                {daysRemaining === 999 ? '-' : daysRemaining}
                                            </td>
                                            <td className="px-4 py-3 text-xs">
                                                {item.linked_po ? (
                                                    <div>
                                                        <div className="text-green-600 font-medium">{item.linked_po.po_number}</div>
                                                        {item.linked_po.expected_date && (
                                                            <div className="text-slate-500">
                                                                {new Date(item.linked_po.expected_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400">-</span>
                                                )}
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
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

        </div>
    );
}

function KPICard({ title, value, unit, trend, desc }: any) {
    const isCritical = trend === 'critical';
    const isPositive = trend === 'positive';

    return (
        <div className={`p-4 rounded-xl border ${isCritical ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'} shadow-sm`}>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">{title}</div>
            <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-bold ${isCritical ? 'text-red-700' : 'text-slate-900'}`}>{value}</span>
                <span className="text-sm text-slate-400 font-medium">{unit}</span>
            </div>
            <div className="mt-2 text-xs text-slate-400 truncate">
                {desc}
            </div>
        </div>
    );
}
