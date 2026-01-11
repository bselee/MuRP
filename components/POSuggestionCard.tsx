/**
 * PO Suggestion Card Component
 *
 * Displays AI-powered purchase recommendations with clear reasoning.
 * Users can accept (add to PO) or dismiss suggestions.
 */

import React from 'react';
import { CheckCircleIcon, XCircleIcon, BotIcon, ExclamationCircleIcon, LightBulbIcon } from './icons';

export type SuggestionReason =
  | 'stockout_imminent'
  | 'below_rop'
  | 'low_coverage'
  | 'seasonal_demand'
  | 'price_opportunity'
  | 'moq_efficiency'
  | 'frequently_ordered';

export interface POSuggestion {
  sku: string;
  name: string;
  quantity: number;
  unitCost: number;
  reason: SuggestionReason;
  reasoning: string;
  details: {
    currentStock?: number;
    onOrder?: number;
    reorderPoint?: number;
    daysOfCover?: number;
    dailyVelocity?: number;
    targetDays?: number;
    abcClass?: 'A' | 'B' | 'C';
    xyzClass?: 'X' | 'Y' | 'Z';
  };
  urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
}

interface POSuggestionCardProps {
  suggestion: POSuggestion;
  onAccept: (suggestion: POSuggestion) => void;
  onDismiss: (sku: string) => void;
  onQuantityChange?: (sku: string, quantity: number) => void;
}

const urgencyConfig = {
  critical: {
    bg: 'bg-red-900/30',
    border: 'border-red-500/50',
    badge: 'bg-red-500 text-white',
    icon: 'text-red-400',
    label: 'Critical',
  },
  high: {
    bg: 'bg-orange-900/30',
    border: 'border-orange-500/50',
    badge: 'bg-orange-500 text-white',
    icon: 'text-orange-400',
    label: 'High Priority',
  },
  medium: {
    bg: 'bg-amber-900/20',
    border: 'border-amber-500/40',
    badge: 'bg-amber-500 text-white',
    icon: 'text-amber-400',
    label: 'Recommended',
  },
  low: {
    bg: 'bg-blue-900/20',
    border: 'border-blue-500/30',
    badge: 'bg-blue-500 text-white',
    icon: 'text-blue-400',
    label: 'Optional',
  },
};

const reasonLabels: Record<SuggestionReason, string> = {
  stockout_imminent: 'Stockout Imminent',
  below_rop: 'Below Reorder Point',
  low_coverage: 'Low Days of Cover',
  seasonal_demand: 'Seasonal Demand',
  price_opportunity: 'Price Opportunity',
  moq_efficiency: 'MOQ Efficiency',
  frequently_ordered: 'Frequently Ordered',
};

const formatCurrency = (amount: number): string => {
  return `$${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

const POSuggestionCard: React.FC<POSuggestionCardProps> = ({
  suggestion,
  onAccept,
  onDismiss,
  onQuantityChange,
}) => {
  const config = urgencyConfig[suggestion.urgencyLevel];
  const { details } = suggestion;
  const lineTotal = suggestion.quantity * suggestion.unitCost;

  return (
    <div className={`rounded-lg border ${config.border} ${config.bg} p-4 transition-all hover:shadow-lg`}>
      {/* Header Row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          <div className={`p-1.5 rounded-lg bg-gray-800/50`}>
            <BotIcon className={`w-5 h-5 ${config.icon}`} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-white text-sm">{suggestion.name}</h4>
              {details.abcClass && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  details.abcClass === 'A' ? 'bg-purple-500/20 text-purple-300' :
                  details.abcClass === 'B' ? 'bg-blue-500/20 text-blue-300' :
                  'bg-slate-500/20 text-slate-300'
                }`}>
                  {details.abcClass}
                </span>
              )}
              {details.xyzClass && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  details.xyzClass === 'X' ? 'bg-green-500/20 text-green-300' :
                  details.xyzClass === 'Y' ? 'bg-amber-500/20 text-amber-300' :
                  'bg-red-500/20 text-red-300'
                }`}>
                  {details.xyzClass}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 font-mono">{suggestion.sku}</p>
          </div>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${config.badge}`}>
          {config.label}
        </span>
      </div>

      {/* Reason Badge */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium text-gray-300 bg-gray-700/50 px-2 py-1 rounded">
          {reasonLabels[suggestion.reason]}
        </span>
      </div>

      {/* Reasoning Text */}
      <div className="flex items-start gap-2 mb-4 p-2.5 bg-gray-800/30 rounded-md">
        <LightBulbIcon className="w-4 h-4 text-accent-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-gray-300 leading-relaxed">{suggestion.reasoning}</p>
      </div>

      {/* Stock Details */}
      <div className="grid grid-cols-4 gap-2 mb-4 text-center">
        {details.currentStock !== undefined && (
          <div className="bg-gray-800/40 rounded p-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Stock</p>
            <p className="text-sm font-semibold text-white">{details.currentStock}</p>
          </div>
        )}
        {details.onOrder !== undefined && (
          <div className="bg-gray-800/40 rounded p-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">On Order</p>
            <p className="text-sm font-semibold text-blue-300">{details.onOrder}</p>
          </div>
        )}
        {details.daysOfCover !== undefined && (
          <div className="bg-gray-800/40 rounded p-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Days Cover</p>
            <p className={`text-sm font-semibold ${
              details.daysOfCover < 14 ? 'text-red-400' :
              details.daysOfCover < 30 ? 'text-amber-400' :
              'text-green-400'
            }`}>
              {details.daysOfCover.toFixed(0)}d
            </p>
          </div>
        )}
        {details.dailyVelocity !== undefined && (
          <div className="bg-gray-800/40 rounded p-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Daily Use</p>
            <p className="text-sm font-semibold text-gray-200">{details.dailyVelocity.toFixed(1)}</p>
          </div>
        )}
      </div>

      {/* Quantity & Cost Row */}
      <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg mb-4">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Suggested Qty</p>
            {onQuantityChange ? (
              <input
                type="number"
                value={suggestion.quantity}
                onChange={(e) => onQuantityChange(suggestion.sku, parseInt(e.target.value) || 0)}
                className="w-20 bg-gray-700 text-white font-semibold rounded px-2 py-1 text-sm"
                min="1"
              />
            ) : (
              <p className="text-lg font-bold text-white">{suggestion.quantity}</p>
            )}
          </div>
          <div className="text-gray-600">×</div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Unit Cost</p>
            <p className="text-sm font-mono text-gray-300">{formatCurrency(suggestion.unitCost)}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Line Total</p>
          <p className="text-lg font-bold text-accent-400">{formatCurrency(lineTotal)}</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onAccept(suggestion)}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-accent-600 hover:bg-accent-500 text-white font-semibold rounded-lg transition-colors"
        >
          <CheckCircleIcon className="w-4 h-4" />
          Add to PO
        </button>
        <button
          onClick={() => onDismiss(suggestion.sku)}
          className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium rounded-lg transition-colors"
        >
          <XCircleIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default POSuggestionCard;
