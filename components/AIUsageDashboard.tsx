/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📊 AI USAGE DASHBOARD - Beautiful Insights into AI Operations
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A stunning dashboard component that displays comprehensive AI usage statistics,
 * costs, and tier limits with beautiful visualizations.
 *
 * Features:
 * ✨ Real-time usage statistics
 * ✨ Cost breakdown by feature
 * ✨ Tier limit visualization
 * ✨ Monthly trends
 * ✨ Upgrade prompts for basic tier
 * ✨ Beautiful, responsive design
 *
 * @module components/AIUsageDashboard
 * @author TGF-MRP Development Team
 * @version 2.0.0 - AI Gateway Edition
 */

import React, { useState, useEffect } from 'react';
import { getUserUsageSummary, getMonthlyFeatureBreakdown, type UserUsageSummary } from '../services/usageTrackingService';
import { getTierLimits, isFeatureAvailable, type AIFeatureType } from '../services/aiGatewayService';

interface AIUsageDashboardProps {
  userId: string;
  onUpgradeClick?: () => void;
}

/**
 * Stat card component for displaying metrics
 */
const StatCard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  color?: 'blue' | 'green' | 'purple' | 'orange';
  percentage?: number;
  limit?: number;
}> = ({ title, value, subtitle, icon, color = 'blue', percentage, limit }) => {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
  };

  const bgGradient = colorClasses[color];

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 hover:border-gray-600 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-gray-400 text-sm mb-1">{title}</p>
          <p className="text-3xl font-bold text-white">{value}</p>
          {subtitle && <p className="text-gray-500 text-xs mt-1">{subtitle}</p>}
        </div>
        {icon && (
          <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${bgGradient} flex items-center justify-center text-white text-2xl`}>
            {icon}
          </div>
        )}
      </div>

      {percentage !== undefined && limit !== undefined && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{percentage.toFixed(0)}% used</span>
            {limit > 0 && <span>{limit - (Math.floor(limit * percentage / 100))} remaining</span>}
            {limit === -1 && <span>Unlimited</span>}
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${bgGradient} transition-all duration-500`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Feature usage row component
 */
const FeatureUsageRow: React.FC<{
  feature: AIFeatureType;
  requests: number;
  cost: number;
  available: boolean;
}> = ({ feature, requests, cost, available }) => {
  const featureIcons = {
    chat: '💬',
    compliance: '✓',
    vision: '👁️',
    embedding: '🧠',
  };

  const featureNames = {
    chat: 'AI Chat Assistant',
    compliance: 'Compliance Scanning',
    vision: 'Label Vision OCR',
    embedding: 'Semantic Search',
  };

  if (!available && requests === 0) {
    return (
      <div className="flex items-center justify-between py-3 px-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="flex items-center gap-3">
          <span className="text-2xl opacity-30">{featureIcons[feature]}</span>
          <div>
            <p className="text-gray-500 text-sm">{featureNames[feature]}</p>
            <p className="text-xs text-gray-600">Upgrade to Full AI to unlock</p>
          </div>
        </div>
        <span className="text-xs text-gray-600 font-mono">🔒 Locked</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-3 px-4 bg-gray-800/50 rounded-lg border border-gray-700">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{featureIcons[feature]}</span>
        <div>
          <p className="text-white text-sm font-medium">{featureNames[feature]}</p>
          <p className="text-xs text-gray-400">{requests} requests this month</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-white font-mono text-sm">${cost.toFixed(4)}</p>
        <p className="text-xs text-gray-500">
          {cost > 0 ? `$${(cost / requests).toFixed(6)}/req` : 'Free'}
        </p>
      </div>
    </div>
  );
};

/**
 * AI Usage Dashboard Component
 */
export const AIUsageDashboard: React.FC<AIUsageDashboardProps> = ({ userId, onUpgradeClick }) => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<UserUsageSummary | null>(null);
  const [featureBreakdown, setFeatureBreakdown] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUsageData();
  }, [userId]);

  const loadUsageData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [summaryData, breakdownData] = await Promise.all([
        getUserUsageSummary(userId),
        getMonthlyFeatureBreakdown(userId),
      ]);

      setSummary(summaryData);
      setFeatureBreakdown(breakdownData);
    } catch (err: any) {
      console.error('Failed to load usage data:', err);
      setError(err.message || 'Failed to load usage statistics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-700 rounded-lg p-6 text-center">
        <p className="text-red-400">Error loading usage data</p>
        <p className="text-sm text-gray-400 mt-2">{error}</p>
        <button
          onClick={loadUsageData}
          className="mt-4 px-4 py-2 bg-red-700 hover:bg-red-600 rounded text-white text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  const tierLimits = getTierLimits(summary.tier);
  const isBasicTier = summary.tier === 'basic';

  const chatUsagePercentage = tierLimits.chatMessagesPerMonth === -1
    ? 0
    : (summary.currentMonth.chatMessages / tierLimits.chatMessagesPerMonth) * 100;

  const complianceUsagePercentage = summary.currentMonth.complianceScansLimit === 0
    ? 0
    : (summary.currentMonth.complianceScans / summary.currentMonth.complianceScansLimit) * 100;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">AI Usage Dashboard</h2>
          <p className="text-gray-400 text-sm mt-1">
            Monitor your AI operations and costs
          </p>
        </div>
        <div className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg">
          <p className="text-xs text-indigo-200">Current Tier</p>
          <p className="text-white font-bold">
            {isBasicTier ? 'Basic (Free)' : 'Full AI ($49/mo)'}
          </p>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Chat Messages"
          value={summary.currentMonth.chatMessages}
          subtitle={tierLimits.chatMessagesPerMonth === -1 ? 'Unlimited' : `of ${tierLimits.chatMessagesPerMonth} this month`}
          icon="💬"
          color="blue"
          percentage={chatUsagePercentage}
          limit={tierLimits.chatMessagesPerMonth}
        />

        <StatCard
          title="Compliance Scans"
          value={summary.currentMonth.complianceScans}
          subtitle={`of ${summary.currentMonth.complianceScansLimit} this month`}
          icon="✓"
          color="green"
          percentage={complianceUsagePercentage}
          limit={summary.currentMonth.complianceScansLimit}
        />

        <StatCard
          title="Monthly Cost"
          value={`$${summary.currentMonth.totalCost.toFixed(2)}`}
          subtitle="Estimated this month"
          icon="💰"
          color="purple"
        />

        <StatCard
          title="Total Requests"
          value={summary.allTime.totalRequests.toLocaleString()}
          subtitle="All time"
          icon="📊"
          color="orange"
        />
      </div>

      {/* Feature Breakdown */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h3 className="text-lg font-bold text-white mb-4">Feature Usage</h3>
        <div className="space-y-3">
          <FeatureUsageRow
            feature="chat"
            requests={featureBreakdown.chat.requests}
            cost={featureBreakdown.chat.cost}
            available={true}
          />
          <FeatureUsageRow
            feature="compliance"
            requests={featureBreakdown.compliance.requests}
            cost={featureBreakdown.compliance.cost}
            available={isFeatureAvailable(summary.tier, 'compliance') || featureBreakdown.compliance.requests > 0}
          />
          <FeatureUsageRow
            feature="vision"
            requests={featureBreakdown.vision.requests}
            cost={featureBreakdown.vision.cost}
            available={isFeatureAvailable(summary.tier, 'vision')}
          />
          <FeatureUsageRow
            feature="embedding"
            requests={featureBreakdown.embedding.requests}
            cost={featureBreakdown.embedding.cost}
            available={isFeatureAvailable(summary.tier, 'embedding')}
          />
        </div>
      </div>

      {/* Upgrade CTA for Basic Tier */}
      {isBasicTier && (
        <div className="bg-gradient-to-r from-indigo-900 to-purple-900 border-2 border-indigo-500 rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-xl font-bold text-white mb-2">
                ✨ Unlock Full AI Power
              </h3>
              <p className="text-indigo-200 mb-4">
                Get unlimited chat, 50 compliance scans/month, vision OCR, and semantic search
              </p>
              <ul className="space-y-2 text-sm text-indigo-100">
                <li>• Unlimited AI chat messages</li>
                <li>• 50 compliance scans per month</li>
                <li>• Advanced label vision OCR</li>
                <li>• Semantic search with embeddings</li>
                <li>• Priority model access (GPT-4o, Claude Sonnet)</li>
                <li>• Detailed usage analytics</li>
              </ul>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-white">$49</p>
              <p className="text-indigo-200 text-sm">/month</p>
            </div>
          </div>
          {onUpgradeClick && (
            <button
              onClick={onUpgradeClick}
              className="mt-6 w-full py-3 px-6 bg-indigo-500 hover:bg-indigo-600 rounded-lg font-bold text-white transition-all shadow-lg hover:shadow-xl"
            >
              Upgrade to Full AI →
            </button>
          )}
        </div>
      )}

      {/* Usage Insights */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h3 className="text-lg font-bold text-white mb-4">💡 Usage Insights</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-gray-700/50 rounded-lg">
            <p className="text-2xl font-bold text-white">
              {summary.allTime.totalTokens.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400 mt-1">Total Tokens Processed</p>
          </div>
          <div className="text-center p-4 bg-gray-700/50 rounded-lg">
            <p className="text-2xl font-bold text-white">
              ${summary.allTime.totalCost.toFixed(2)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Total AI Cost (All Time)</p>
          </div>
          <div className="text-center p-4 bg-gray-700/50 rounded-lg">
            <p className="text-2xl font-bold text-white">
              ${summary.allTime.totalRequests > 0 ? (summary.allTime.totalCost / summary.allTime.totalRequests).toFixed(4) : '0.0000'}
            </p>
            <p className="text-xs text-gray-400 mt-1">Average Cost per Request</p>
          </div>
        </div>
      </div>

      {/* Refresh Button */}
      <div className="text-center">
        <button
          onClick={loadUsageData}
          className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm transition-colors"
        >
          🔄 Refresh Statistics
        </button>
      </div>
    </div>
  );
};

export default AIUsageDashboard;
