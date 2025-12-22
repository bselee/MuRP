/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EMAIL STOCKOUT INTELLIGENCE WIDGET
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Phase 4: Unified dashboard widget showing email-driven stockout prevention.
 *
 * Displays:
 * - Email-based early warning signals (delays, backorders)
 * - SKUs at risk based on email-derived ETAs
 * - PO arrival predictions enhanced with email intelligence
 * - Action items for stockout prevention
 *
 * Goal: NEVER BE OUT OF STOCK!
 */

import React, { useState, useEffect } from 'react';
import {
  getEmailIntelligenceDashboard,
  EmailIntelligenceDashboard,
  EmailStockoutSignal,
  EmailDrivenStockoutRisk,
  EmailEnhancedPrediction,
} from '../services/emailStockoutIntegrationService';

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function EmailStockoutIntelligenceWidget() {
  const [dashboard, setDashboard] = useState<EmailIntelligenceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'signals' | 'risks' | 'predictions'>('signals');

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getEmailIntelligenceDashboard();
      setDashboard(data);
    } catch (err) {
      console.error('[EmailStockoutWidget] Failed to load dashboard:', err);
      setError('Failed to load email intelligence data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="text-red-500 dark:text-red-400">{error}</div>
        <button
          onClick={loadDashboard}
          className="mt-2 text-sm text-blue-500 hover:text-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!dashboard) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <span className="text-2xl">📧</span>
              Email Stockout Intelligence
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Vendor email signals for proactive stockout prevention
            </p>
          </div>
          <button
            onClick={loadDashboard}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="Refresh"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
          <StatCard
            label="Active Threads"
            value={dashboard.summary.total_active_threads}
            color="blue"
          />
          <StatCard
            label="With ETA"
            value={dashboard.summary.threads_with_eta}
            color="green"
          />
          <StatCard
            label="Delay/Issues"
            value={dashboard.summary.threads_with_delays}
            color="red"
          />
          <StatCard
            label="Awaiting Response"
            value={dashboard.summary.threads_awaiting_response}
            color="yellow"
          />
          <StatCard
            label="Avg Response"
            value={`${dashboard.summary.avg_vendor_response_days}d`}
            color="gray"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex -mb-px">
          <TabButton
            active={activeTab === 'signals'}
            onClick={() => setActiveTab('signals')}
            label="Signals"
            count={dashboard.signals.length}
            color="red"
          />
          <TabButton
            active={activeTab === 'risks'}
            onClick={() => setActiveTab('risks')}
            label="At-Risk SKUs"
            count={dashboard.at_risk_skus.length}
            color="yellow"
          />
          <TabButton
            active={activeTab === 'predictions'}
            onClick={() => setActiveTab('predictions')}
            label="PO Predictions"
            count={dashboard.enhanced_predictions.length}
            color="blue"
          />
        </nav>
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {activeTab === 'signals' && (
          <SignalsTab signals={dashboard.signals} />
        )}
        {activeTab === 'risks' && (
          <RisksTab risks={dashboard.at_risk_skus} />
        )}
        {activeTab === 'predictions' && (
          <PredictionsTab predictions={dashboard.enhanced_predictions} />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: 'blue' | 'green' | 'red' | 'yellow' | 'gray';
}) {
  const colorClasses = {
    blue: 'text-blue-600 dark:text-blue-400',
    green: 'text-green-600 dark:text-green-400',
    red: 'text-red-600 dark:text-red-400',
    yellow: 'text-yellow-600 dark:text-yellow-400',
    gray: 'text-gray-600 dark:text-gray-400',
  };

  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${colorClasses[color]}`}>{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color: 'red' | 'yellow' | 'blue';
}) {
  const colorClasses = {
    red: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    yellow: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  };

  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
        active
          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
          : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
      }`}
    >
      {label}
      {count > 0 && (
        <span className={`px-2 py-0.5 rounded-full text-xs ${colorClasses[color]}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function SignalsTab({ signals }: { signals: EmailStockoutSignal[] }) {
  if (signals.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <span className="text-4xl">✅</span>
        <p className="mt-2">No active stockout signals from vendor emails</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {signals.map((signal, idx) => (
        <SignalCard key={idx} signal={signal} />
      ))}
    </div>
  );
}

function SignalCard({ signal }: { signal: EmailStockoutSignal }) {
  const severityColors = {
    CRITICAL: 'border-red-500 bg-red-50 dark:bg-red-900/20',
    HIGH: 'border-orange-500 bg-orange-50 dark:bg-orange-900/20',
    MEDIUM: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20',
  };

  const severityIcons = {
    CRITICAL: '🚨',
    HIGH: '⚠️',
    MEDIUM: '📢',
  };

  const typeIcons = {
    delay_notice: '⏰',
    backorder: '❌',
    no_response: '📭',
    tracking_exception: '📦',
    eta_slipped: '📅',
  };

  return (
    <div className={`border-l-4 rounded-r-lg p-4 ${severityColors[signal.severity]}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <span className="text-2xl">{typeIcons[signal.signal_type]}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-white">
                {signal.po_number}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {signal.vendor_name}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded ${
                signal.severity === 'CRITICAL' ? 'bg-red-200 text-red-800' :
                signal.severity === 'HIGH' ? 'bg-orange-200 text-orange-800' :
                'bg-yellow-200 text-yellow-800'
              }`}>
                {signal.severity}
              </span>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
              {signal.message}
            </p>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
              → {signal.recommended_action}
            </p>
            {signal.items_at_risk.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Items: {signal.items_at_risk.join(', ')}
              </p>
            )}
          </div>
        </div>
        <div className="text-right text-sm text-gray-500 dark:text-gray-400">
          <div>+{signal.estimated_impact_days}d delay</div>
        </div>
      </div>
    </div>
  );
}

function RisksTab({ risks }: { risks: EmailDrivenStockoutRisk[] }) {
  if (risks.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <span className="text-4xl">🛡️</span>
        <p className="mt-2">No SKUs at risk based on email intelligence</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
            <th className="pb-2 font-medium">SKU</th>
            <th className="pb-2 font-medium">Stock</th>
            <th className="pb-2 font-medium">Days Left</th>
            <th className="pb-2 font-medium">Email ETA</th>
            <th className="pb-2 font-medium">Gap</th>
            <th className="pb-2 font-medium">Risk</th>
            <th className="pb-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {risks.map((risk, idx) => (
            <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <td className="py-3">
                <div className="font-medium text-gray-900 dark:text-white">{risk.sku}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                  {risk.product_name}
                </div>
              </td>
              <td className="py-3 text-gray-700 dark:text-gray-300">
                {risk.current_stock}
              </td>
              <td className="py-3">
                <span className={`${
                  risk.days_of_stock_remaining <= 0 ? 'text-red-600' :
                  risk.days_of_stock_remaining < 7 ? 'text-orange-600' :
                  'text-gray-700 dark:text-gray-300'
                }`}>
                  {risk.days_of_stock_remaining <= 0 ? 'OUT' : `${risk.days_of_stock_remaining}d`}
                </span>
              </td>
              <td className="py-3 text-gray-700 dark:text-gray-300">
                {risk.earliest_email_eta
                  ? new Date(risk.earliest_email_eta).toLocaleDateString()
                  : '-'}
              </td>
              <td className="py-3">
                <span className={`${
                  risk.gap_days > 0 ? 'text-red-600' :
                  risk.gap_days > -3 ? 'text-orange-600' :
                  'text-green-600'
                }`}>
                  {risk.gap_days > 0 ? `+${risk.gap_days}d` : `${risk.gap_days}d`}
                </span>
              </td>
              <td className="py-3">
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  risk.risk_level === 'WILL_STOCKOUT' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                  risk.risk_level === 'AT_RISK' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                  'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                }`}>
                  {risk.risk_level.replace('_', ' ')}
                </span>
              </td>
              <td className="py-3">
                <span className={`text-xs ${
                  risk.action_required === 'emergency_order' ? 'text-red-600 font-medium' :
                  risk.action_required === 'expedite' ? 'text-orange-600' :
                  'text-gray-500'
                }`}>
                  {risk.action_required.replace('_', ' ')}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PredictionsTab({ predictions }: { predictions: EmailEnhancedPrediction[] }) {
  // Show only POs with email data
  const emailPredictions = predictions.filter(p => p.email_eta || p.email_tracking_numbers?.length);

  if (emailPredictions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <span className="text-4xl">📬</span>
        <p className="mt-2">No POs with email-derived intelligence yet</p>
        <p className="text-xs mt-1">Connect vendor email threads to POs for enhanced predictions</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {emailPredictions.slice(0, 10).map((pred, idx) => (
        <PredictionCard key={idx} prediction={pred} />
      ))}
      {emailPredictions.length > 10 && (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          +{emailPredictions.length - 10} more POs with email intelligence
        </p>
      )}
    </div>
  );
}

function PredictionCard({ prediction }: { prediction: EmailEnhancedPrediction }) {
  const statusColors = {
    on_time: 'text-green-600',
    at_risk: 'text-yellow-600',
    delayed: 'text-red-600',
    unknown: 'text-gray-600',
  };

  const statusIcons = {
    on_time: '✅',
    at_risk: '⚠️',
    delayed: '🚨',
    unknown: '❓',
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white">
              {prediction.po_number}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {prediction.vendor_name}
            </span>
            <span className={`text-sm ${statusColors[prediction.status]}`}>
              {statusIcons[prediction.status]} {prediction.status.replace('_', ' ')}
            </span>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">PO ETA:</span>
              <span className="ml-2 text-gray-700 dark:text-gray-300">
                {prediction.expected_date
                  ? new Date(prediction.expected_date).toLocaleDateString()
                  : 'Not set'}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Email ETA:</span>
              <span className={`ml-2 ${prediction.email_eta ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-400'}`}>
                {prediction.email_eta
                  ? new Date(prediction.email_eta).toLocaleDateString()
                  : 'None'}
                {prediction.email_eta_confidence && (
                  <span className="text-xs ml-1">({prediction.email_eta_confidence})</span>
                )}
              </span>
            </div>
          </div>

          {(prediction.email_tracking_numbers?.length || 0) > 0 && (
            <div className="mt-2 text-sm">
              <span className="text-gray-500 dark:text-gray-400">Tracking:</span>
              <span className="ml-2 text-gray-700 dark:text-gray-300">
                {prediction.email_tracking_numbers?.join(', ')}
              </span>
              {prediction.email_tracking_status && (
                <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                  {prediction.email_tracking_status}
                </span>
              )}
            </div>
          )}

          {(prediction.has_email_delay_notice || prediction.has_email_backorder_notice) && (
            <div className="mt-2 flex gap-2">
              {prediction.has_email_delay_notice && (
                <span className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 px-2 py-1 rounded">
                  ⏰ Delay Notice
                </span>
              )}
              {prediction.has_email_backorder_notice && (
                <span className="text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 px-2 py-1 rounded">
                  ❌ Backorder
                </span>
              )}
            </div>
          )}
        </div>

        <div className="text-right">
          <div className={`text-2xl font-bold ${
            prediction.days_until_arrival < 0 ? 'text-red-600' :
            prediction.days_until_arrival < 3 ? 'text-orange-600' :
            prediction.days_until_arrival < 7 ? 'text-yellow-600' :
            'text-green-600'
          }`}>
            {prediction.days_until_arrival < 0 ? 'LATE' : `${prediction.days_until_arrival}d`}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {prediction.eta_source === 'email' ? '📧 from email' : '📋 from PO'}
          </div>
        </div>
      </div>

      {prediction.items.filter(i => i.is_out_of_stock).length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <span className="text-xs text-red-600 dark:text-red-400 font-medium">
            ⚠️ Out of stock items:
          </span>
          <span className="text-xs text-gray-600 dark:text-gray-400 ml-2">
            {prediction.items.filter(i => i.is_out_of_stock).map(i => i.product_name).join(', ')}
          </span>
        </div>
      )}
    </div>
  );
}
