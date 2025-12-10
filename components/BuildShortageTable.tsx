/**
 * BuildShortageTable Component
 *
 * Visualizes BOM buildability analysis results
 * Shows shortages, warnings, and feasible items in a color-coded table
 */

import React from 'react';

interface ShortageItem {
  sku: string;
  name: string;
  required: number;
  available: number;
  shortage: number;
  lead_time_days: number;
  days_until_build: number;
  status: 'critical' | 'warning' | 'ok';
  recommendation: string;
}

interface BuildabilityResult {
  success: boolean;
  bom_id: string;
  bom_name: string;
  target_quantity: number;
  target_date: string;
  overall_status: 'blocked' | 'caution' | 'ready';
  shortages: ShortageItem[];
  warnings: ShortageItem[];
  feasible_items: Array<{
    sku: string;
    name: string;
    required: number;
    available: number;
    status: 'ok';
  }>;
  build_feasibility_score: number;
}

interface Props {
  result: BuildabilityResult;
  onCreatePO?: (items: ShortageItem[]) => void;
  onViewBOM?: (bomId: string) => void;
}

export default function BuildShortageTable({ result, onCreatePO, onViewBOM }: Props) {
  if (!result || !result.success) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-semibold">Build Analysis Failed</h3>
        <p className="text-red-600 text-sm mt-1">Unable to analyze build feasibility.</p>
      </div>
    );
  }

  const statusColors = {
    blocked: {
      bg: 'bg-red-50',
      border: 'border-red-300',
      text: 'text-red-800',
      badge: 'bg-red-500',
    },
    caution: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-300',
      text: 'text-yellow-800',
      badge: 'bg-yellow-500',
    },
    ready: {
      bg: 'bg-green-50',
      border: 'border-green-300',
      text: 'text-green-800',
      badge: 'bg-green-500',
    },
  };

  const colors = statusColors[result.overall_status];

  const allItems = [
    ...result.shortages.map(s => ({ ...s, type: 'shortage' as const })),
    ...result.warnings.map(w => ({ ...w, type: 'warning' as const })),
    ...result.feasible_items.map(f => ({ ...f, type: 'ok' as const })),
  ];

  return (
    <div className={`${colors.bg} border ${colors.border} rounded-lg p-6 shadow-sm`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h3 className={`text-2xl font-bold ${colors.text}`}>
              {result.overall_status === 'ready' ? '✅ Build Ready' :
               result.overall_status === 'caution' ? '⚠️ Build Possible (Caution)' :
               '🚫 Build Blocked'}
            </h3>
            {onViewBOM && (
              <button
                onClick={() => onViewBOM(result.bom_id)}
                className="text-sm text-blue-600 hover:text-blue-800 underline"
              >
                View BOM
              </button>
            )}
          </div>
          <p className="text-gray-700 font-medium">{result.bom_name}</p>
          <p className="text-gray-600 text-sm mt-1">
            Build {result.target_quantity} units by {new Date(result.target_date).toLocaleDateString()}
          </p>
        </div>

        {/* Feasibility Score Circle */}
        <div className="flex flex-col items-center">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center border-4 ${
            result.build_feasibility_score >= 90 ? 'border-green-500 bg-green-50' :
            result.build_feasibility_score >= 70 ? 'border-yellow-500 bg-yellow-50' :
            'border-red-500 bg-red-50'
          }`}>
            <span className={`text-3xl font-bold ${
              result.build_feasibility_score >= 90 ? 'text-green-700' :
              result.build_feasibility_score >= 70 ? 'text-yellow-700' :
              'text-red-700'
            }`}>
              {result.build_feasibility_score}%
            </span>
          </div>
          <span className="text-xs text-gray-500 mt-1">Feasibility</span>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg p-3 border border-red-200">
          <div className="text-2xl font-bold text-red-600">{result.shortages.length}</div>
          <div className="text-sm text-gray-600">Critical Shortages</div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-yellow-200">
          <div className="text-2xl font-bold text-yellow-600">{result.warnings.length}</div>
          <div className="text-sm text-gray-600">Warnings</div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-green-200">
          <div className="text-2xl font-bold text-green-600">{result.feasible_items.length}</div>
          <div className="text-sm text-gray-600">In Stock</div>
        </div>
      </div>

      {/* Critical Shortages */}
      {result.shortages.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-red-800 text-lg flex items-center gap-2">
              🚨 Critical Shortages - Order Immediately
            </h4>
            {onCreatePO && (
              <button
                onClick={() => onCreatePO(result.shortages)}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-medium text-sm"
              >
                → Create PO for All Shortages
              </button>
            )}
          </div>
          <div className="bg-white border border-red-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-red-100">
                <tr>
                  <th className="text-left p-3 font-semibold text-red-800">SKU</th>
                  <th className="text-left p-3 font-semibold text-red-800">Component</th>
                  <th className="text-right p-3 font-semibold text-red-800">Required</th>
                  <th className="text-right p-3 font-semibold text-red-800">Available</th>
                  <th className="text-right p-3 font-semibold text-red-800">Short</th>
                  <th className="text-right p-3 font-semibold text-red-800">Lead Time</th>
                  <th className="text-left p-3 font-semibold text-red-800">Action</th>
                </tr>
              </thead>
              <tbody>
                {result.shortages.map((item, idx) => (
                  <tr key={idx} className="border-t border-red-100 hover:bg-red-50">
                    <td className="p-3 font-mono text-gray-700">{item.sku}</td>
                    <td className="p-3 text-gray-800">{item.name}</td>
                    <td className="p-3 text-right text-gray-700">{item.required}</td>
                    <td className="p-3 text-right text-gray-700">{item.available}</td>
                    <td className="p-3 text-right font-bold text-red-600">{item.shortage}</td>
                    <td className="p-3 text-right text-gray-700">{item.lead_time_days}d</td>
                    <td className="p-3">
                      <div className="text-xs text-red-700 bg-red-50 px-2 py-1 rounded">
                        {item.recommendation}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="mb-6">
          <h4 className="font-semibold text-yellow-800 text-lg mb-3 flex items-center gap-2">
            ⚠️ Warnings - Order Soon
          </h4>
          <div className="bg-white border border-yellow-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-yellow-100">
                <tr>
                  <th className="text-left p-3 font-semibold text-yellow-800">SKU</th>
                  <th className="text-left p-3 font-semibold text-yellow-800">Component</th>
                  <th className="text-right p-3 font-semibold text-yellow-800">Required</th>
                  <th className="text-right p-3 font-semibold text-yellow-800">Available</th>
                  <th className="text-right p-3 font-semibold text-yellow-800">Short</th>
                  <th className="text-right p-3 font-semibold text-yellow-800">Buffer Days</th>
                  <th className="text-left p-3 font-semibold text-yellow-800">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {result.warnings.map((item, idx) => (
                  <tr key={idx} className="border-t border-yellow-100 hover:bg-yellow-50">
                    <td className="p-3 font-mono text-gray-700">{item.sku}</td>
                    <td className="p-3 text-gray-800">{item.name}</td>
                    <td className="p-3 text-right text-gray-700">{item.required}</td>
                    <td className="p-3 text-right text-gray-700">{item.available}</td>
                    <td className="p-3 text-right font-bold text-yellow-600">{item.shortage}</td>
                    <td className="p-3 text-right text-gray-700">
                      {Math.max(0, item.days_until_build - item.lead_time_days)}d
                    </td>
                    <td className="p-3 text-xs text-yellow-700">{item.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ready Items (Collapsed by default) */}
      {result.feasible_items.length > 0 && (
        <details className="bg-white border border-green-200 rounded-lg p-4">
          <summary className="font-semibold text-green-800 cursor-pointer flex items-center gap-2">
            ✅ Components In Stock ({result.feasible_items.length})
          </summary>
          <div className="mt-3 space-y-1">
            {result.feasible_items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm py-1">
                <span className="text-gray-700">
                  <span className="font-mono text-gray-500">{item.sku}</span> - {item.name}
                </span>
                <span className="text-green-600 font-medium">
                  {item.available} / {item.required} ✓
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Success Message */}
      {result.overall_status === 'ready' && (
        <div className="mt-6 bg-white border border-green-300 rounded-lg p-4 text-center">
          <p className="text-green-700 font-bold text-lg">🎉 Build is Ready!</p>
          <p className="text-sm text-green-600 mt-1">
            All components are in stock. You can start production immediately.
          </p>
        </div>
      )}
    </div>
  );
}
