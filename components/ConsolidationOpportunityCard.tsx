/**
 * ConsolidationOpportunityCard Component
 *
 * Displays purchase order consolidation opportunities
 * Shows potential savings, recommended items to add, and urgency
 */

import React from 'react';

interface RecommendedItem {
  sku: string;
  name: string;
  qty: number;
  unit_cost: number;
  total_cost: number;
  days_stock_remaining: number;
}

interface ConsolidationOpportunity {
  vendor_id: string;
  vendor_name: string;
  opportunity_type: 'shipping_threshold' | 'vendor_combine' | 'timing_optimization';
  current_order_total: number;
  shipping_threshold?: number;
  potential_savings: number;
  recommended_items: RecommendedItem[];
  urgency: 'low' | 'medium' | 'high';
  reasoning: string;
}

interface Props {
  opportunities: ConsolidationOpportunity[];
  onApplyOptimization?: (opportunity: ConsolidationOpportunity) => void;
  onDismiss?: (opportunity: ConsolidationOpportunity) => void;
}

export default function ConsolidationOpportunityCard({ opportunities, onApplyOptimization, onDismiss }: Props) {
  if (!opportunities || opportunities.length === 0) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-blue-800 font-semibold">✅ All Optimized!</h3>
        <p className="text-blue-600 text-sm mt-1">No consolidation opportunities found. Your POs are already optimized.</p>
      </div>
    );
  }

  const totalSavings = opportunities.reduce((sum, opp) => sum + opp.potential_savings, 0);

  const urgencyColors = {
    high: 'bg-red-100 text-red-800 border-red-300',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    low: 'bg-blue-100 text-blue-800 border-blue-300',
  };

  const typeLabels = {
    shipping_threshold: '📦 Free Shipping',
    vendor_combine: '🔄 Combine Orders',
    timing_optimization: '⏰ Timing',
  };

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <div className="bg-green-50 border border-green-300 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-green-800">
              💰 ${totalSavings.toFixed(2)} in Potential Savings
            </h3>
            <p className="text-sm text-green-600 mt-1">
              {opportunities.length} optimization {opportunities.length === 1 ? 'opportunity' : 'opportunities'} found
            </p>
          </div>
          <div className="text-4xl">💡</div>
        </div>
      </div>

      {/* Opportunity Cards */}
      {opportunities.map((opp, idx) => {
        const urgencyColor = urgencyColors[opp.urgency];
        const progressPercent = opp.shipping_threshold
          ? Math.min(100, (opp.current_order_total / opp.shipping_threshold) * 100)
          : 0;

        return (
          <div key={idx} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-lg font-bold text-gray-800">{opp.vendor_name}</h4>
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${urgencyColor}`}>
                    {opp.urgency.toUpperCase()}
                  </span>
                  <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
                    {typeLabels[opp.opportunity_type]}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{opp.reasoning}</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-green-600">
                  ${opp.potential_savings.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500">savings</div>
              </div>
            </div>

            {/* Progress Bar (for shipping threshold) */}
            {opp.shipping_threshold && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                  <span>Current: ${opp.current_order_total.toFixed(2)}</span>
                  <span>Free shipping at: ${opp.shipping_threshold.toFixed(2)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      progressPercent >= 90 ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  ${(opp.shipping_threshold - opp.current_order_total).toFixed(2)} more to reach free shipping
                </div>
              </div>
            )}

            {/* Recommended Items */}
            <div className="bg-gray-50 rounded-lg p-3 mb-3">
              <h5 className="font-semibold text-gray-700 mb-2 text-sm">
                Recommended Items to Add:
              </h5>
              <div className="space-y-2">
                {opp.recommended_items.map((item, itemIdx) => (
                  <div key={itemIdx} className="flex items-center justify-between text-sm bg-white border border-gray-200 rounded p-2">
                    <div className="flex-1">
                      <div className="font-medium text-gray-800">{item.name}</div>
                      <div className="text-xs text-gray-500">
                        SKU: {item.sku} • {item.days_stock_remaining} days stock remaining
                      </div>
                    </div>
                    <div className="text-right ml-3">
                      <div className="font-semibold text-gray-800">
                        {item.qty} × ${item.unit_cost.toFixed(2)}
                      </div>
                      <div className="text-xs text-green-600 font-medium">
                        ${item.total_cost.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200">
                <span className="text-sm font-medium text-gray-700">Total to Add:</span>
                <span className="text-lg font-bold text-gray-800">
                  ${opp.recommended_items.reduce((sum, item) => sum + item.total_cost, 0).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {onApplyOptimization && (
                <button
                  onClick={() => onApplyOptimization(opp)}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium text-sm transition-colors"
                >
                  ✓ Add These Items to PO
                </button>
              )}
              {onDismiss && (
                <button
                  onClick={() => onDismiss(opp)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 font-medium text-sm transition-colors"
                >
                  Dismiss
                </button>
              )}
            </div>

            {/* Additional Context */}
            {opp.urgency === 'high' && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
                <strong>⚠️ High Urgency:</strong> Some of these items are approaching their reorder point. Consider ordering soon.
              </div>
            )}
          </div>
        );
      })}

      {/* Summary Footer */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
        <p className="text-sm text-blue-800">
          <strong>💡 Pro Tip:</strong> Consolidating orders can save on shipping costs and reduce the number of
          deliveries you need to process.
        </p>
      </div>
    </div>
  );
}
