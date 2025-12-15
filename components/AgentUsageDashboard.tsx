/**
 * Agent Usage Dashboard
 * Displays agent run statistics and cost tracking
 */

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { 
  BotIcon, 
  DollarSignIcon, 
  ClockIcon, 
  TrendingUpIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  RefreshIcon
} from '@/components/icons';
import { 
  getAgentCostBreakdown, 
  getTotalAgentCosts,
  type AgentCostBreakdown 
} from '../services/agentUsageService';

export default function AgentUsageDashboard() {
  const [breakdown, setBreakdown] = useState<AgentCostBreakdown[]>([]);
  const [totals, setTotals] = useState<{
    total_cost: number;
    cost_today: number;
    cost_this_week: number;
    cost_this_month: number;
    total_runs: number;
    total_tokens: number;
    most_expensive_agent: { name: string; cost: number } | null;
    most_active_agent: { name: string; runs: number } | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [breakdownData, totalsData] = await Promise.all([
      getAgentCostBreakdown(),
      getTotalAgentCosts(),
    ]);
    setBreakdown(breakdownData);
    setTotals(totalsData);
    setLoading(false);
  }

  const formatCost = (cost: number) => {
    if (cost < 0.01) return `$${cost.toFixed(6)}`;
    if (cost < 1) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (loading) {
    return (
      <Card className="bg-gray-900/50 border-gray-700">
        <CardContent className="p-6">
          <div className="flex items-center justify-center gap-2 text-gray-400">
            <RefreshIcon className="w-5 h-5 animate-spin" />
            Loading agent usage data...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <DollarSignIcon className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Total Cost (All Time)</p>
                <p className="text-xl font-bold text-white">{formatCost(totals?.total_cost || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <ClockIcon className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Cost Today</p>
                <p className="text-xl font-bold text-white">{formatCost(totals?.cost_today || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <BotIcon className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Total Agent Runs</p>
                <p className="text-xl font-bold text-white">{formatNumber(totals?.total_runs || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/20 rounded-lg">
                <TrendingUpIcon className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Total Tokens</p>
                <p className="text-xl font-bold text-white">{formatNumber(totals?.total_tokens || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Highlights */}
      {(totals?.most_expensive_agent || totals?.most_active_agent) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {totals?.most_expensive_agent && (
            <Card className="bg-gray-900/50 border-yellow-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <AlertCircleIcon className="w-5 h-5 text-yellow-400" />
                  <div>
                    <p className="text-sm text-gray-400">Highest Cost Agent</p>
                    <p className="text-white font-medium">{totals.most_expensive_agent.name}</p>
                    <p className="text-yellow-400">{formatCost(totals.most_expensive_agent.cost)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {totals?.most_active_agent && (
            <Card className="bg-gray-900/50 border-green-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <CheckCircleIcon className="w-5 h-5 text-green-400" />
                  <div>
                    <p className="text-sm text-gray-400">Most Active Agent</p>
                    <p className="text-white font-medium">{totals.most_active_agent.name}</p>
                    <p className="text-green-400">{totals.most_active_agent.runs} runs</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Agent Breakdown Table */}
      <Card className="bg-gray-900/50 border-gray-700">
        <CardHeader className="border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BotIcon className="w-5 h-5 text-accent-400" />
              <h3 className="font-semibold text-white">Agent Cost Breakdown</h3>
            </div>
            <button 
              onClick={loadData}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <RefreshIcon className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Agent</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Runs</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Tokens</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">24h Cost</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">7d Cost</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Total Cost</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Avg/Run</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {breakdown.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                      No agent usage data yet. Run some agents to see statistics here.
                    </td>
                  </tr>
                ) : (
                  breakdown.map((agent) => (
                    <tr key={agent.agent_identifier} className="hover:bg-gray-800/30">
                      <td className="px-4 py-3">
                        <span className="text-white font-medium">{agent.display_name}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">
                        {formatNumber(agent.total_runs)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">
                        {formatNumber(agent.tokens_used)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={agent.cost_last_24h > 0 ? 'text-yellow-400' : 'text-gray-500'}>
                          {formatCost(agent.cost_last_24h)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={agent.cost_last_7d > 0 ? 'text-blue-400' : 'text-gray-500'}>
                          {formatCost(agent.cost_last_7d)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={agent.total_cost > 0 ? 'text-green-400' : 'text-gray-500'}>
                          {formatCost(agent.total_cost)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400">
                        {formatCost(agent.avg_cost_per_run)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {breakdown.length > 0 && (
                <tfoot className="bg-gray-800/50">
                  <tr>
                    <td className="px-4 py-3 font-medium text-white">Total</td>
                    <td className="px-4 py-3 text-right font-medium text-white">
                      {formatNumber(breakdown.reduce((s, a) => s + a.total_runs, 0))}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-white">
                      {formatNumber(breakdown.reduce((s, a) => s + a.tokens_used, 0))}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-yellow-400">
                      {formatCost(breakdown.reduce((s, a) => s + a.cost_last_24h, 0))}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-blue-400">
                      {formatCost(breakdown.reduce((s, a) => s + a.cost_last_7d, 0))}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-green-400">
                      {formatCost(breakdown.reduce((s, a) => s + a.total_cost, 0))}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">—</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
