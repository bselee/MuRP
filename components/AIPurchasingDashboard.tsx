import Button from '@/components/ui/Button';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 💰 AI PURCHASING DASHBOARD - Intelligence at a Glance
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Displays AI-powered purchasing insights, anomalies, and optimization opportunities
 *
 * Features:
 * - Real-time anomaly alerts
 * - Consolidation opportunities
 * - Cost tracking and budget status
 * - Quick actions and recommendations
 *
 * @module components/AIPurchasingDashboard
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface Anomaly {
  sku: string;
  description: string;
  issue: string;
  cause: string;
  action: string;
  severity: 'critical' | 'warning' | 'info';
  estimated_impact?: number;
}

interface AnomalyLog {
  id: string;
  detected_at: string;
  critical_count: number;
  warning_count: number;
  info_count: number;
  critical_anomalies: Anomaly[];
  warning_anomalies: Anomaly[];
  info_anomalies: Anomaly[];
  cost_usd: number;
  items_analyzed: number;
}

interface ConsolidationOpportunity {
  id: string;
  vendor_name: string;
  opportunity_type: string;
  current_order_total: number;
  shipping_threshold?: number;
  potential_savings: number;
  recommended_items: any[];
  urgency: 'low' | 'medium' | 'high';
  status: string;
  identified_at: string;
}

interface BudgetStatus {
  total_spent: number;
  budget_limit: number;
  remaining: number;
  percent_used: number;
  over_budget: boolean;
  service_breakdown: Record<string, number>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function AIPurchasingDashboard() {
  const [latestAnomalies, setLatestAnomalies] = useState<AnomalyLog | null>(null);
  const [consolidationOpps, setConsolidationOpps] = useState<ConsolidationOpportunity[]>([]);
  const [budgetStatus, setBudgetStatus] = useState<BudgetStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'anomalies' | 'consolidation' | 'budget'>('anomalies');

  // Load data on mount
  useEffect(() => {
    loadDashboardData();

    // Refresh every 5 minutes
    const interval = setInterval(loadDashboardData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  async function loadDashboardData() {
    try {
      setLoading(true);

      // Load latest anomaly log
      const { data: anomalyData } = await supabase
        .from('ai_anomaly_logs')
        .select('*')
        .order('detected_at', { ascending: false })
        .limit(1)
        .single();

      if (anomalyData) {
        setLatestAnomalies(anomalyData);
      }

      // Load active consolidation opportunities
      const { data: consolidationData } = await supabase
        .from('ai_consolidation_opportunities')
        .select('*')
        .eq('status', 'pending')
        .order('potential_savings', { ascending: false });

      if (consolidationData) {
        setConsolidationOpps(consolidationData);
      }

      // Load budget status
      const { data: budgetData } = await supabase
        .rpc('get_ai_budget_status', { p_budget_limit: 20.00 })
        .single();

      if (budgetData) {
        setBudgetStatus(budgetData);
      }

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function acceptConsolidation(oppId: string) {
    try {
      await supabase
        .from('ai_consolidation_opportunities')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', oppId);

      // Reload data
      loadDashboardData();
    } catch (error) {
      console.error('Failed to accept consolidation:', error);
    }
  }

  async function rejectConsolidation(oppId: string, reason: string) {
    try {
      await supabase
        .from('ai_consolidation_opportunities')
        .update({
          status: 'rejected',
          rejection_reason: reason
        })
        .eq('id', oppId);

      // Reload data
      loadDashboardData();
    } catch (error) {
      console.error('Failed to reject consolidation:', error);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading AI purchasing intelligence...</div>
      </div>
    );
  }

  const totalSavingsOpportunity = consolidationOpps.reduce(
    (sum, opp) => sum + opp.potential_savings,
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">AI Purchasing Intelligence</h2>
          <p className="text-sm text-gray-600 mt-1">
            Cost-effective purchasing optimization powered by Claude AI
          </p>
        </div>

        {/* Budget indicator */}
        {budgetStatus && (
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div className="text-xs text-gray-500 mb-1">This Month's AI Cost</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">
                ${budgetStatus.total_spent.toFixed(2)}
              </span>
              <span className="text-sm text-gray-500">/ ${budgetStatus.budget_limit}</span>
            </div>
            <div className="mt-2 w-32 bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  budgetStatus.percent_used >= 90
                    ? 'bg-red-600'
                    : budgetStatus.percent_used >= 75
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(budgetStatus.percent_used, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Critical Anomalies Card */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Critical Anomalies</p>
              <p className="text-3xl font-bold text-red-600 mt-1">
                {latestAnomalies?.critical_count || 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {latestAnomalies?.warning_count || 0} warnings, {latestAnomalies?.info_count || 0} info
              </p>
            </div>
            <div className="text-4xl">🚨</div>
          </div>
        </div>

        {/* Consolidation Opportunities Card */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Savings Opportunities</p>
              <p className="text-3xl font-bold text-green-600 mt-1">
                ${totalSavingsOpportunity.toFixed(0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {consolidationOpps.length} opportunities found
              </p>
            </div>
            <div className="text-4xl">💰</div>
          </div>
        </div>

        {/* Items Analyzed Card */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Items Analyzed</p>
              <p className="text-3xl font-bold text-blue-600 mt-1">
                {latestAnomalies?.items_analyzed || 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Last run: {latestAnomalies?.detected_at
                  ? new Date(latestAnomalies.detected_at).toLocaleString()
                  : 'Never'}
              </p>
            </div>
            <div className="text-4xl">📊</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <Button
            onClick={() => setActiveTab('anomalies')}
            className={`pb-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'anomalies'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Anomalies
            {(latestAnomalies?.critical_count || 0) > 0 && (
              <span className="ml-2 bg-red-100 text-red-600 py-0.5 px-2 rounded-full text-xs">
                {latestAnomalies?.critical_count}
              </span>
            )}
          </Button>
          <Button
            onClick={() => setActiveTab('consolidation')}
            className={`pb-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'consolidation'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Consolidation
            {consolidationOpps.length > 0 && (
              <span className="ml-2 bg-green-100 text-green-600 py-0.5 px-2 rounded-full text-xs">
                {consolidationOpps.length}
              </span>
            )}
          </Button>
          <Button
            onClick={() => setActiveTab('budget')}
            className={`pb-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'budget'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Budget & Costs
          </Button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'anomalies' && (
          <AnomaliesTab anomalies={latestAnomalies} />
        )}
        {activeTab === 'consolidation' && (
          <ConsolidationTab
            opportunities={consolidationOpps}
            onAccept={acceptConsolidation}
            onReject={rejectConsolidation}
          />
        )}
        {activeTab === 'budget' && (
          <BudgetTab budgetStatus={budgetStatus} />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════

function AnomaliesTab({ anomalies }: { anomalies: AnomalyLog | null }) {
  if (!anomalies) {
    return (
      <div className="text-center py-12 text-gray-500">
        No anomaly data available. Run the nightly AI job to detect anomalies.
      </div>
    );
  }

  const allAnomalies = [
    ...anomalies.critical_anomalies.map(a => ({ ...a, severity: 'critical' as const })),
    ...anomalies.warning_anomalies.map(a => ({ ...a, severity: 'warning' as const })),
    ...anomalies.info_anomalies.map(a => ({ ...a, severity: 'info' as const }))
  ];

  if (allAnomalies.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">✅</div>
        <div className="text-xl font-semibold text-gray-900">No Anomalies Detected</div>
        <div className="text-gray-600 mt-2">
          Everything looks good! Last analyzed: {new Date(anomalies.detected_at).toLocaleString()}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {allAnomalies.map((anomaly, idx) => (
        <div
          key={idx}
          className={`border-l-4 rounded-lg bg-white p-4 ${
            anomaly.severity === 'critical'
              ? 'border-red-500 bg-red-50'
              : anomaly.severity === 'warning'
              ? 'border-yellow-500 bg-yellow-50'
              : 'border-blue-500 bg-blue-50'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-sm font-bold">{anomaly.sku}</span>
                <span className="text-sm text-gray-600">{anomaly.description}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    anomaly.severity === 'critical'
                      ? 'bg-red-100 text-red-700'
                      : anomaly.severity === 'warning'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {anomaly.severity.toUpperCase()}
                </span>
              </div>

              <div className="space-y-1 text-sm">
                <div>
                  <span className="font-semibold text-gray-700">Issue:</span>{' '}
                  <span className="text-gray-900">{anomaly.issue}</span>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Likely Cause:</span>{' '}
                  <span className="text-gray-600">{anomaly.cause}</span>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Recommended Action:</span>{' '}
                  <span className="text-gray-900">{anomaly.action}</span>
                </div>
                {anomaly.estimated_impact && (
                  <div>
                    <span className="font-semibold text-gray-700">Estimated Impact:</span>{' '}
                    <span className="text-red-600 font-semibold">${anomaly.estimated_impact}</span>
                  </div>
                )}
              </div>
            </div>

            <Button className="ml-4 text-blue-600 hover:text-blue-800 text-sm font-medium">
              View SKU →
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ConsolidationTab({
  opportunities,
  onAccept,
  onReject
}: {
  opportunities: ConsolidationOpportunity[];
  onAccept: (id: string) => void;
  onReject: (id: string, reason: string) => void;
}) {
  if (opportunities.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No consolidation opportunities found. Create draft POs to discover savings opportunities.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {opportunities.map(opp => (
        <div key={opp.id} className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{opp.vendor_name}</h3>
              <p className="text-sm text-gray-600 mt-1">
                {opp.opportunity_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                opp.urgency === 'high'
                  ? 'bg-red-100 text-red-700'
                  : opp.urgency === 'medium'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-green-100 text-green-700'
              }`}
            >
              {opp.urgency.toUpperCase()} URGENCY
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-500">Current Order</p>
              <p className="text-lg font-bold text-gray-900">
                ${opp.current_order_total.toFixed(2)}
              </p>
            </div>
            {opp.shipping_threshold && (
              <div>
                <p className="text-xs text-gray-500">Free Shipping At</p>
                <p className="text-lg font-bold text-gray-900">
                  ${opp.shipping_threshold.toFixed(2)}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500">Potential Savings</p>
              <p className="text-lg font-bold text-green-600">
                ${opp.potential_savings.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">Recommended Items to Add:</p>
            <div className="space-y-2">
              {opp.recommended_items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold">{item.sku}</span>
                    <span className="text-gray-600">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-gray-600">Qty: {item.qty}</span>
                    <span className="text-gray-600">@ ${item.unit_cost}</span>
                    <span className="font-semibold">${item.total_cost.toFixed(2)}</span>
                    <span className="text-xs text-gray-500">
                      ({item.days_stock_remaining}d stock)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-200">
            <Button
              onClick={() => onAccept(opp.id)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm"
            >
              Accept & Add Items
            </Button>
            <Button
              onClick={() => onReject(opp.id, 'Not needed')}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium text-sm"
            >
              Dismiss
            </Button>
            <div className="flex-1"></div>
            <p className="text-xs text-gray-500">
              Identified: {new Date(opp.identified_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function BudgetTab({ budgetStatus }: { budgetStatus: BudgetStatus | null }) {
  if (!budgetStatus) {
    return (
      <div className="text-center py-12 text-gray-500">
        Budget data not available
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Budget Overview */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Budget Overview</h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div>
            <p className="text-sm text-gray-600">Total Spent</p>
            <p className="text-2xl font-bold text-gray-900">
              ${budgetStatus.total_spent.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Budget Limit</p>
            <p className="text-2xl font-bold text-gray-900">
              ${budgetStatus.budget_limit.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Remaining</p>
            <p className={`text-2xl font-bold ${budgetStatus.remaining > 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${Math.abs(budgetStatus.remaining).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Usage</p>
            <p className={`text-2xl font-bold ${
              budgetStatus.percent_used >= 90 ? 'text-red-600' :
              budgetStatus.percent_used >= 75 ? 'text-yellow-600' :
              'text-green-600'
            }`}>
              {budgetStatus.percent_used.toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-4">
          <div
            className={`h-4 rounded-full transition-all ${
              budgetStatus.percent_used >= 90
                ? 'bg-red-600'
                : budgetStatus.percent_used >= 75
                ? 'bg-yellow-500'
                : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(budgetStatus.percent_used, 100)}%` }}
          />
        </div>

        {budgetStatus.over_budget && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm font-semibold text-red-800">⚠️ Over Budget</p>
            <p className="text-sm text-red-600 mt-1">
              Consider reducing AI job frequency or adjusting budget limit.
            </p>
          </div>
        )}
      </div>

      {/* Service Breakdown */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost Breakdown by Service</h3>

        <div className="space-y-3">
          {Object.entries(budgetStatus.service_breakdown).map(([service, cost]) => (
            <div key={service} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-32 text-sm text-gray-700 capitalize">
                  {service.replace(/_/g, ' ')}
                </div>
                <div className="flex-1 bg-gray-200 rounded-full h-2 w-48">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{
                      width: `${Math.min((cost / budgetStatus.total_spent) * 100, 100)}%`
                    }}
                  />
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-semibold text-gray-900">
                  ${cost.toFixed(4)}
                </span>
                <span className="text-xs text-gray-500 ml-2">
                  ({((cost / budgetStatus.total_spent) * 100).toFixed(1)}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cost Optimization Tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">💡 Cost Optimization Tips</h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li>• Anomaly detection costs ~$0.06/day ($1.80/month)</li>
          <li>• Email parsing is pay-per-use (~$0.001 per email)</li>
          <li>• Consolidation analysis runs 1-2x/week (~$0.02 each)</li>
          <li>• Total expected monthly cost: $5-10</li>
          <li>• Implement prompt caching to reduce costs by 90%</li>
        </ul>
      </div>
    </div>
  );
}
