import React from 'react';
import { AlertCircleIcon, ChartBarIcon, TrendingUpIcon, UsersIcon } from './icons';
import type { StockoutRisk, VendorPerformance } from '@/lib/inventory/stockIntelligence';

interface StockIntelligencePanelProps {
  risks: StockoutRisk[];
  vendors?: VendorPerformance[];
  maxRisks?: number;
  title?: string;
  description?: string;
  className?: string;
  emptyLabel?: string;
}

const formatDaysLabel = (days: number) => {
  if (days <= 0) return 'OUT';
  if (days < 7) return `${days}d`;
  return `${Math.min(days, 90)}d`;
};

const StockIntelligencePanel: React.FC<StockIntelligencePanelProps> = ({
  risks,
  vendors = [],
  maxRisks = 5,
  title = 'Stock Intelligence',
  description = 'Predictive alerts and proactive insights',
  className = '',
  emptyLabel = 'Everything looks stable right now.',
}) => {
  const criticalCount = risks.filter(r => r.riskLevel === 'critical').length;
  const highCount = risks.filter(r => r.riskLevel === 'high').length;
  const improvingCount = risks.filter(r => r.trendDirection === 'down').length;
  const increasingCount = risks.filter(r => r.trendDirection === 'up').length;
  const risksToShow = risks.slice(0, maxRisks);

  return (
    <section
      className={`bg-gray-900/70 backdrop-blur-sm border border-white/10 rounded-2xl p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] text-white flex flex-col gap-5 ${className}`}
    >
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gray-400">
          <ChartBarIcon className="w-4 h-4 text-accent-400" />
          Intelligence
        </div>
        <div>
          <h3 className="text-xl font-semibold flex items-center gap-2">
            {title}
          </h3>
          <p className="text-sm text-gray-400">{description}</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-400">Critical</p>
          <p className="text-3xl font-bold text-red-300">{criticalCount}</p>
        </div>
        <div className="rounded-2xl bg-orange-400/10 border border-orange-400/20 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-400">High</p>
          <p className="text-3xl font-bold text-orange-200">{highCount}</p>
        </div>
        <div className="rounded-2xl bg-green-500/10 border border-green-500/20 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-400">Improving</p>
          <p className="text-3xl font-bold text-green-200">{improvingCount}</p>
        </div>
        <div className="rounded-2xl bg-accent-500/10 border border-accent-500/20 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-400">Trending Up</p>
          <p className="text-3xl font-bold text-accent-200">{increasingCount}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/5">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 text-xs uppercase tracking-[0.2em] text-gray-400">
          <AlertCircleIcon className="w-4 h-4 text-red-300" />
          Live Stockout Watch
        </div>
        {risksToShow.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400">{emptyLabel}</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {risksToShow.map(risk => (
              <li key={risk.sku} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">{risk.name}</p>
                  <p className="text-xs text-gray-400">{risk.sku}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-semibold px-3 py-1 rounded-full border ${
                      risk.riskLevel === 'critical'
                        ? 'border-red-400 text-red-200 bg-red-500/10'
                        : risk.riskLevel === 'high'
                        ? 'border-orange-400 text-orange-200 bg-orange-500/10'
                        : 'border-gray-500 text-gray-200 bg-gray-600/20'
                    }`}
                  >
                    {risk.riskLevel.toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-300">{formatDaysLabel(risk.daysUntilStockout)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {vendors.length > 0 && (
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gray-400 mb-2">
            <UsersIcon className="w-4 h-4 text-accent-300" />
            Vendor Reliability
          </div>
          <div className="space-y-2">
            {vendors.slice(0, 3).map(vendor => (
              <div
                key={vendor.vendorId}
                className="rounded-2xl bg-gray-900 border border-white/5 px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-semibold">{vendor.vendorName}</p>
                  <p className="text-xs text-gray-400">
                    {vendor.onTimeDeliveryRate.toFixed(0)}% on-time · {vendor.averageLeadTimeActual}d actual
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-accent-200">{vendor.reliabilityScore}</p>
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">Score</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {risksToShow.length > 0 && (
        <div className="text-xs uppercase tracking-[0.3em] text-gray-500 flex items-center gap-2">
          <TrendingUpIcon className="w-4 h-4 text-emerald-300" />
          Updated hourly · Grok layout ready
        </div>
      )}
    </section>
  );
};

export default StockIntelligencePanel;
