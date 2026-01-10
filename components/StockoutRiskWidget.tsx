import React from 'react';
import { AlertCircleIcon, TrendingUpIcon } from '@/components/icons';

export interface StockoutRisk {
    sku: string;
    name: string;
    daysUntilStockout: number;
    riskLevel: 'critical' | 'high' | 'medium' | 'low';
    trendDirection: 'up' | 'down' | 'stable';
    // ABC/XYZ classification (optional, added when KPI data available)
    abcClass?: 'A' | 'B' | 'C';
    xyzClass?: 'X' | 'Y' | 'Z';
}

interface StockoutRiskWidgetProps {
    risks: StockoutRisk[];
    limit?: number;
    compact?: boolean;
}

const RiskBadge = ({ level }: { level: 'critical' | 'high' | 'medium' | 'low' }) => {
    const styles = {
        critical: 'bg-red-500/20 text-red-200 border-red-500/30',
        high: 'bg-orange-500/20 text-orange-200 border-orange-500/30',
        medium: 'bg-yellow-500/20 text-yellow-200 border-yellow-500/30',
        low: 'bg-green-500/20 text-green-200 border-green-500/30',
    };
    return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${styles[level]}`}>
            {level.toUpperCase()}
        </span>
    );
};

const TrendIndicator = ({ direction }: { direction: 'up' | 'down' | 'stable' }) => {
    if (direction === 'up') return <span className="text-green-400 flex items-center gap-1"><TrendingUpIcon className="w-3 h-3" /> <span className="text-xs">Growing</span></span>;
    if (direction === 'down') return <span className="text-red-400 flex items-center gap-1"><TrendingUpIcon className="w-3 h-3 rotate-180" /> <span className="text-xs">Declining</span></span>;
    return <span className="text-gray-400 text-xs">Stable</span>;
};

const StockoutRiskWidget: React.FC<StockoutRiskWidgetProps> = ({ risks, limit = 50, compact = false }) => {
    if (risks.length === 0) {
        return (
            <div className="p-8 text-center bg-gray-800/30 rounded-lg border border-gray-700/50">
                <p className="text-gray-400">No stockout risks detected.</p>
            </div>
        );
    }

    return (
        <div className={`overflow-hidden rounded-lg ${compact ? '' : 'bg-gray-800/50 border border-gray-700'}`}>
            {!compact && (
                <div className="p-4 border-b border-gray-700 bg-gray-900/20 flex items-center gap-2">
                    <AlertCircleIcon className="w-5 h-5 text-red-400" />
                    <h3 className="font-semibold text-white">Critical Purchasing Priorities</h3>
                </div>
            )}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-800/80">
                        <tr>
                            <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">SKU</th>
                            <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Class</th>
                            <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Item</th>
                            <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Days Left</th>
                            <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Risk Level</th>
                            <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Trend</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/50 bg-gray-800/30">
                        {risks.slice(0, limit).map((risk) => (
                            <tr key={risk.sku} className="hover:bg-gray-700/30 transition-colors">
                                <td className="px-4 py-3 text-sm text-gray-300 font-mono">{risk.sku}</td>
                                <td className="px-4 py-3 text-center">
                                    {risk.abcClass && (
                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                            risk.abcClass === 'A' ? 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/30' :
                                            risk.abcClass === 'B' ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30' :
                                            'bg-slate-500/20 text-slate-400 ring-1 ring-slate-500/30'
                                        }`} title={`ABC: ${risk.abcClass} (${risk.abcClass === 'A' ? '80% of value' : risk.abcClass === 'B' ? '15% of value' : '5% of value'})`}>
                                            {risk.abcClass}
                                        </span>
                                    )}
                                    {risk.xyzClass && (
                                        <span className={`ml-0.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                            risk.xyzClass === 'X' ? 'bg-green-500/20 text-green-300 ring-1 ring-green-500/30' :
                                            risk.xyzClass === 'Y' ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30' :
                                            'bg-red-500/20 text-red-300 ring-1 ring-red-500/30'
                                        }`} title={`XYZ: ${risk.xyzClass} (${risk.xyzClass === 'X' ? 'Predictable' : risk.xyzClass === 'Y' ? 'Variable' : 'Erratic'} demand)`}>
                                            {risk.xyzClass}
                                        </span>
                                    )}
                                    {!risk.abcClass && !risk.xyzClass && (
                                        <span className="text-gray-500 text-xs">--</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-sm text-white font-medium">{risk.name}</td>
                                <td className="px-4 py-3 text-sm">
                                    <span
                                        className={`font-bold ${risk.daysUntilStockout <= 0
                                                ? 'text-red-500'
                                                : risk.daysUntilStockout < 7
                                                    ? 'text-orange-400'
                                                    : 'text-gray-300'
                                            }`}
                                    >
                                        {risk.daysUntilStockout <= 0 ? 'OUT OF STOCK' : `${risk.daysUntilStockout} days`}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <RiskBadge level={risk.riskLevel} />
                                </td>
                                <td className="px-4 py-3">
                                    <TrendIndicator direction={risk.trendDirection} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default StockoutRiskWidget;
