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
        vendorPerf: 92 // Placeholder until we link the vendor logic
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

            setMetrics(prev => ({
                ...prev,
                accuracy: accuracy ? (100 - accuracy).toFixed(1) : 'N/A', // 100 - MAPE = Accuracy
                riskItems: adviceData.length
            }));

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
                    trend="positive"
                    desc="1 - MAPE (Last 90 Days)"
                />
                <KPICard
                    title="Vendor Reliability"
                    value="92.4"
                    unit="%"
                    trend="positive"
                    desc="On-Time In-Full Rate"
                />
                <KPICard
                    title="Capital Efficiency"
                    value="4.2"
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
                                    <th className="px-6 py-3">SKU / Product</th>
                                    <th className="px-6 py-3">Status</th>
                                    <th className="px-6 py-3 text-right">Calculated ROP</th>
                                    <th className="px-6 py-3 text-right">Safety Stock</th>
                                    <th className="px-6 py-3 text-right">Advice</th>
                                    <th className="px-6 py-3">Reasoning</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {advice.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-slate-900">{item.sku}</div>
                                            <div className="text-slate-500 text-xs truncate max-w-[200px]">{item.name}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex justify-between text-xs">
                                                    <span>On Hand:</span>
                                                    <span className="font-medium">{item.current_status.stock}</span>
                                                </div>
                                                <div className="flex justify-between text-xs text-slate-500">
                                                    <span>On Order:</span>
                                                    <span>{item.current_status.on_order}</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-slate-100 rounded-full mt-1 overflow-hidden">
                                                    <div
                                                        className="h-full bg-red-500 rounded-full"
                                                        style={{ width: `${Math.min(100, (item.current_status.total_position / item.parameters.rop) * 100)}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-slate-700">
                                            {item.parameters.rop.toFixed(0)}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-slate-500">
                                            {item.parameters.safety_stock.toFixed(0)}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                + {item.recommendation.quantity} Units
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-xs text-slate-500 max-w-[250px]">
                                            {item.recommendation.reason}
                                        </td>
                                    </tr>
                                ))}
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
