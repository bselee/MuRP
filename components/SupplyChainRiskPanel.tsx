import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from './ThemeProvider';
import RiskActionMenu from './RiskActionMenu';
import type { SupplyChainRisk, SupplyChainRiskSummary, RiskSeverity } from '../services/supplyChainRiskService';

interface SupplyChainRiskPanelProps {
  risks: SupplyChainRisk[];
  summary?: SupplyChainRiskSummary;
  loading?: boolean;
  onCreatePO?: (sku: string, qty: number) => void;
  onAdjustROP?: (sku: string) => void;
  onMarkForReview?: (sku: string) => void;
  onViewHistory?: (sku: string) => void;
  onNavigateToSku?: (sku: string) => void;
  maxItems?: number;
}

const SEVERITY_CONFIG: Record<RiskSeverity, {
  badge: string;
  border: string;
  text: string;
  bg: string;
}> = {
  CRITICAL: {
    badge: 'bg-red-500/20 text-red-400 ring-red-500/50',
    border: 'border-l-red-500',
    text: 'text-red-400',
    bg: 'bg-red-900/10',
  },
  HIGH: {
    badge: 'bg-orange-500/20 text-orange-400 ring-orange-500/50',
    border: 'border-l-orange-500',
    text: 'text-orange-400',
    bg: 'bg-orange-900/10',
  },
  MEDIUM: {
    badge: 'bg-yellow-500/20 text-yellow-400 ring-yellow-500/50',
    border: 'border-l-yellow-500',
    text: 'text-yellow-400',
    bg: 'bg-yellow-900/10',
  },
  LOW: {
    badge: 'bg-blue-500/20 text-blue-400 ring-blue-500/50',
    border: 'border-l-blue-500',
    text: 'text-blue-400',
    bg: 'bg-blue-900/10',
  },
};

const RISK_TYPE_ICONS: Record<string, React.ReactNode> = {
  STOCKOUT: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  SS_BREACH: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  COMPONENT_SHORT: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  ),
  PO_LATE: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

export default function SupplyChainRiskPanel({
  risks,
  summary,
  loading = false,
  onCreatePO,
  onAdjustROP,
  onMarkForReview,
  onViewHistory,
  onNavigateToSku,
  maxItems = 10,
}: SupplyChainRiskPanelProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [expanded, setExpanded] = useState(false);

  // Count by severity
  const criticalCount = risks.filter(r => r.severity === 'CRITICAL').length;
  const highCount = risks.filter(r => r.severity === 'HIGH').length;

  const displayRisks = expanded ? risks : risks.slice(0, maxItems);
  const hasMore = risks.length > maxItems;

  if (loading) {
    return (
      <div className={`rounded-xl border p-6 ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'}`}>
        <div className="animate-pulse">
          <div className={`h-5 rounded w-48 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
          <div className={`h-4 rounded w-32 mt-2 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
          <div className="space-y-3 mt-4">
            {[1, 2, 3].map(i => (
              <div key={i} className={`h-20 rounded ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (risks.length === 0) {
    return (
      <div className={`rounded-xl border p-6 ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-500/20">
            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              No Supply Chain Risks Detected
            </h3>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              All items have adequate stock levels for the forecast horizon.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'}`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b flex items-center justify-between ${isDark ? 'border-slate-700' : 'border-gray-100'}`}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/20">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Supply Chain Risks
            </h3>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              {risks.length} item{risks.length !== 1 ? 's' : ''} need attention
            </p>
          </div>
        </div>

        {/* Severity badges */}
        <div className="flex items-center gap-2">
          {criticalCount > 0 && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400 ring-1 ring-red-500/50">
              {criticalCount} Critical
            </span>
          )}
          {highCount > 0 && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/50">
              {highCount} High
            </span>
          )}
        </div>
      </div>

      {/* Risk Items */}
      <div className="divide-y divide-slate-700/50">
        {displayRisks.map((risk, index) => {
          const severityConfig = SEVERITY_CONFIG[risk.severity];
          const suggestedQty = Math.ceil(risk.daily_demand * 30); // 30 days of stock

          return (
            <div
              key={`${risk.sku}-${index}`}
              className={`px-6 py-4 border-l-4 ${severityConfig.border} ${severityConfig.bg} hover:bg-opacity-75 transition-colors`}
            >
              <div className="flex items-start justify-between gap-4">
                {/* Risk Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* SKU Link */}
                    {onNavigateToSku ? (
                      <button
                        onClick={() => onNavigateToSku(risk.sku)}
                        className="font-mono text-sm font-semibold text-blue-400 hover:text-blue-300 hover:underline"
                      >
                        {risk.sku}
                      </button>
                    ) : (
                      <span className={`font-mono text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {risk.sku}
                      </span>
                    )}

                    {/* Risk Type Icon */}
                    <span className={severityConfig.text}>
                      {RISK_TYPE_ICONS[risk.risk_type]}
                    </span>

                    {/* Severity Badge */}
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ring-1 ${severityConfig.badge}`}>
                      {risk.severity}
                    </span>

                    {/* Days badge */}
                    {risk.days_until_runout !== null && risk.days_until_runout <= 14 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-900/30 text-red-400">
                        {risk.days_until_runout}d
                      </span>
                    )}
                  </div>

                  {/* Product name */}
                  <div className={`text-sm truncate mt-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`} title={risk.product_name}>
                    {risk.product_name}
                  </div>

                  {/* Two-sentence format */}
                  <div className="mt-2 space-y-1">
                    {/* Risk statement */}
                    <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                      {risk.risk_statement}
                    </p>

                    {/* Action statement */}
                    <p className={`text-sm font-medium ${severityConfig.text}`}>
                      {risk.action_statement}
                    </p>
                  </div>

                  {/* Dependent demand info (if BOM-driven) */}
                  {risk.dependent_demand_daily > 0 && risk.parent_skus.length > 0 && (
                    <div className={`mt-2 text-xs ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                      <span className="font-medium">Component for:</span> {risk.parent_skus.slice(0, 3).join(', ')}
                      {risk.parent_skus.length > 3 && ` +${risk.parent_skus.length - 3} more`}
                    </div>
                  )}
                </div>

                {/* Action Menu */}
                <RiskActionMenu
                  sku={risk.sku}
                  productName={risk.product_name}
                  recommendedQty={suggestedQty}
                  onCreatePO={onCreatePO}
                  onAdjustROP={onAdjustROP}
                  onMarkForReview={onMarkForReview}
                  onViewHistory={onViewHistory}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Show more/less */}
      {hasMore && (
        <div className={`px-6 py-3 border-t ${isDark ? 'border-slate-700 bg-slate-800/30' : 'border-gray-100 bg-gray-50'}`}>
          <button
            onClick={() => setExpanded(!expanded)}
            className={`text-sm font-medium ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-500'}`}
          >
            {expanded ? 'Show less' : `Show ${risks.length - maxItems} more risks`}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Compact summary cards for risk overview
 */
export function RiskSummaryCards({ summary }: { summary: SupplyChainRiskSummary }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const cards = [
    {
      label: 'Stockout Risks',
      value: summary.stockout_risks,
      color: 'text-red-400',
      bg: 'bg-red-500/20',
    },
    {
      label: 'SS Breach Risks',
      value: summary.ss_breach_risks,
      color: 'text-orange-400',
      bg: 'bg-orange-500/20',
    },
    {
      label: 'Component Shorts',
      value: summary.component_risks,
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/20',
    },
    {
      label: 'Late POs',
      value: summary.po_late_risks,
      color: 'text-blue-400',
      bg: 'bg-blue-500/20',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(card => (
        <div
          key={card.label}
          className={`p-3 rounded-lg border ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'}`}
        >
          <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
          <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{card.label}</div>
        </div>
      ))}
    </div>
  );
}
