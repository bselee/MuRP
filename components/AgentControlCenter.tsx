/**
 * AgentControlCenter - Modern, actionable widget for agent activity
 *
 * Features:
 * - Hover tooltips guide users on what to do
 * - Clickable items with visual feedback
 * - Quick actions on hover (dismiss)
 * - Modern glass-morphism styling
 * - Clear visual hierarchy
 */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase/client';
import { useTheme } from './ThemeProvider';
import {
  BotIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ChevronRightIcon,
  RefreshIcon,
  XMarkIcon,
  EyeSlashIcon,
  PackageIcon,
  TruckIcon,
  ShoppingCartIcon,
} from './icons';

interface ActivityItem {
  id: string;
  agent_identifier: string;
  activity_type: string;
  title: string;
  description: string | null;
  severity: string;
  requires_human_review: boolean;
  human_reviewed_at: string | null;
  created_at: string;
  context: Record<string, unknown> | null;
}

interface AgentControlCenterProps {
  onViewAllActivity?: () => void;
  onNavigateToInventory?: (sku: string) => void;
}

const AgentControlCenter: React.FC<AgentControlCenterProps> = ({
  onViewAllActivity,
  onNavigateToInventory,
}) => {
  const { isDark } = useTheme();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [runningCount, setRunningCount] = useState(0);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [selectedItem, setSelectedItem] = useState<ActivityItem | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: activity } = await supabase
        .from('agent_activity_log')
        .select('id, agent_identifier, activity_type, title, description, severity, requires_human_review, human_reviewed_at, created_at, context')
        .gte('created_at', oneDayAgo)
        .in('activity_type', ['decision', 'completion', 'action'])
        .is('human_reviewed_at', null)
        .order('severity', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(10);

      const { count: running } = await supabase
        .from('agent_execution_log')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'running');

      const { count: pendingReview } = await supabase
        .from('agent_activity_log')
        .select('id', { count: 'exact', head: true })
        .eq('requires_human_review', true)
        .is('human_reviewed_at', null);

      setActivities(activity || []);
      setRunningCount(running || 0);
      setPendingReviewCount(pendingReview || 0);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('[AgentControlCenter] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('agent-activity-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_activity_log' }, () => fetchData())
      .subscribe();
    const interval = setInterval(fetchData, 30000);
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const handleDismiss = async (item: ActivityItem, feedback?: string) => {
    setDismissing(true);
    try {
      await supabase
        .from('agent_activity_log')
        .update({
          human_reviewed_at: new Date().toISOString(),
          human_approved: false,
          human_feedback: feedback || 'Dismissed by user',
        })
        .eq('id', item.id);

      setActivities(prev => prev.filter(a => a.id !== item.id));
      setSelectedItem(null);
      setPendingReviewCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('[AgentControlCenter] Dismiss error:', err);
    } finally {
      setDismissing(false);
    }
  };

  const handleDismissAllSimilar = async (item: ActivityItem) => {
    setDismissing(true);
    try {
      const similarIds = activities
        .filter(a =>
          a.agent_identifier === item.agent_identifier &&
          a.activity_type === item.activity_type &&
          a.severity === item.severity
        )
        .map(a => a.id);

      await supabase
        .from('agent_activity_log')
        .update({
          human_reviewed_at: new Date().toISOString(),
          human_approved: false,
          human_feedback: 'Bulk dismissed by user',
        })
        .in('id', similarIds);

      setActivities(prev => prev.filter(a => !similarIds.includes(a.id)));
      setSelectedItem(null);
      setPendingReviewCount(prev => Math.max(0, prev - similarIds.length));
    } catch (err) {
      console.error('[AgentControlCenter] Bulk dismiss error:', err);
    } finally {
      setDismissing(false);
    }
  };

  const extractSku = (title: string): string | null => {
    const match = title.match(/:\s*(.+)$/);
    return match ? match[1].trim() : null;
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const getAgentInfo = (identifier: string) => {
    const info: Record<string, { name: string; icon: React.ReactNode; color: string }> = {
      'stockout-prevention': { name: 'Stock Monitor', icon: <PackageIcon className="w-3.5 h-3.5" />, color: 'text-blue-500' },
      'vendor-watchdog': { name: 'Vendor Watch', icon: <TruckIcon className="w-3.5 h-3.5" />, color: 'text-purple-500' },
      'inventory-guardian': { name: 'Inventory', icon: <PackageIcon className="w-3.5 h-3.5" />, color: 'text-emerald-500' },
      'po-intelligence': { name: 'PO Monitor', icon: <ShoppingCartIcon className="w-3.5 h-3.5" />, color: 'text-orange-500' },
      'email-tracking-specialist': { name: 'Email Track', icon: <TruckIcon className="w-3.5 h-3.5" />, color: 'text-cyan-500' },
      'invoice-extractor': { name: 'Invoice AI', icon: <ShoppingCartIcon className="w-3.5 h-3.5" />, color: 'text-pink-500' },
    };
    return info[identifier] || { name: identifier.split('-').map(w => w[0]?.toUpperCase() || '').join(''), icon: <BotIcon className="w-3.5 h-3.5" />, color: 'text-gray-500' };
  };

  const getSeverityStyles = (severity: string) => {
    if (severity === 'critical') return {
      icon: <XCircleIcon className="w-5 h-5" />,
      bg: isDark ? 'bg-red-500/10' : 'bg-red-50',
      border: 'border-red-500/20',
      iconColor: 'text-red-500',
    };
    if (severity === 'warning') return {
      icon: <ExclamationTriangleIcon className="w-5 h-5" />,
      bg: isDark ? 'bg-amber-500/10' : 'bg-amber-50',
      border: 'border-amber-500/20',
      iconColor: 'text-amber-500',
    };
    return {
      icon: <CheckCircleIcon className="w-5 h-5" />,
      bg: isDark ? 'bg-green-500/10' : 'bg-green-50',
      border: 'border-green-500/20',
      iconColor: 'text-green-500',
    };
  };

  // Get product name from context or description
  const getProductName = (item: ActivityItem): string | null => {
    if (item.context?.product_name) return String(item.context.product_name);
    if (item.description) return item.description.split(' has ')[0] || item.description;
    return null;
  };

  // Get actionable hint based on item type
  const getActionHint = (item: ActivityItem): string => {
    if (item.title.includes('OUT OF STOCK')) return 'Click to view reorder options';
    if (item.title.includes('CRITICAL LOW')) return 'Click to check inventory levels';
    if (item.title.includes('Below ROP')) return 'Click to review reorder point';
    if (item.title.includes('completed')) return 'Click for scan summary';
    return 'Click for details';
  };

  // Theme
  const cardBg = isDark ? 'bg-gray-800/80 backdrop-blur-sm' : 'bg-white/90 backdrop-blur-sm';
  const borderColor = isDark ? 'border-gray-700/50' : 'border-gray-200';
  const textColor = isDark ? 'text-gray-100' : 'text-gray-900';
  const mutedColor = isDark ? 'text-gray-400' : 'text-gray-500';

  // hasActivity should include pending reviews - don't say "All clear" if there are items needing review
  const hasActivity = activities.length > 0 || runningCount > 0 || pendingReviewCount > 0;
  const needsAttention = pendingReviewCount > 0;

  if (loading) {
    return (
      <div className={`rounded-xl border ${borderColor} ${cardBg} p-6`}>
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className={mutedColor}>Checking agent activity...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`rounded-xl border ${needsAttention ? 'border-amber-500/50 shadow-amber-500/10 shadow-lg' : borderColor} ${cardBg} overflow-hidden transition-all duration-300`}>
        {/* Header */}
        <div className={`px-4 py-3 flex items-center justify-between border-b ${borderColor} ${needsAttention ? (isDark ? 'bg-amber-900/20' : 'bg-amber-50/80') : ''}`}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={`p-1.5 rounded-lg ${runningCount > 0 ? 'bg-green-500/20' : (isDark ? 'bg-gray-700' : 'bg-gray-100')}`}>
                <BotIcon className={`w-4 h-4 ${runningCount > 0 ? 'text-green-500' : mutedColor}`} />
              </div>
              {runningCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse ring-2 ring-green-500/30" />
              )}
            </div>
            <div>
              <span className={`font-semibold text-sm ${textColor}`}>Agent Activity</span>
              {pendingReviewCount > 0 && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 font-medium">
                  {pendingReviewCount} need{pendingReviewCount === 1 ? 's' : ''} review
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs ${mutedColor}`}>Updated {formatTimeAgo(lastUpdate.toISOString())}</span>
            <button
              onClick={fetchData}
              className={`p-1.5 rounded-lg transition-all duration-200 ${isDark ? 'hover:bg-gray-700 active:bg-gray-600' : 'hover:bg-gray-100 active:bg-gray-200'}`}
              title="Refresh activity"
            >
              <RefreshIcon className={`w-4 h-4 ${mutedColor} hover:text-blue-500 transition-colors`} />
            </button>
            {onViewAllActivity && (
              <button
                onClick={onViewAllActivity}
                className="text-xs text-blue-500 hover:text-blue-400 flex items-center gap-0.5 font-medium transition-colors"
              >
                View all <ChevronRightIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Activity List */}
        {hasActivity ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-700/30">
            {activities.slice(0, 5).map(item => {
              const severity = getSeverityStyles(item.severity);
              const agentInfo = getAgentInfo(item.agent_identifier);
              const isHovered = hoveredItem === item.id;
              const sku = extractSku(item.title);
              const productName = getProductName(item);

              return (
                <div
                  key={item.id}
                  className={`group relative px-4 py-3 flex items-center gap-3 cursor-pointer transition-all duration-200 ${
                    isHovered
                      ? (isDark ? 'bg-gray-700/50' : 'bg-gray-50')
                      : ''
                  }`}
                  onClick={() => setSelectedItem(item)}
                  onMouseEnter={() => setHoveredItem(item.id)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  {/* Severity indicator - static, no pulse */}
                  <div className={`flex-shrink-0 p-2 rounded-lg ${severity.bg} border ${severity.border} ${severity.iconColor} transition-transform duration-200 ${isHovered ? 'scale-105' : ''}`}>
                    {severity.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium ${textColor} truncate`}>{item.title}</p>
                    </div>
                    {/* Product name */}
                    {productName && (
                      <p className={`text-sm ${mutedColor} truncate mt-0.5`}>{productName}</p>
                    )}
                    {/* Key metrics row */}
                    {item.context && (
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {item.context.current_stock !== undefined && (
                          <span className={`text-xs ${Number(item.context.current_stock) <= 0 ? 'text-red-500 font-semibold' : mutedColor}`}>
                            Stock: {item.context.current_stock}
                          </span>
                        )}
                        {item.context.velocity !== undefined && Number(item.context.velocity) > 0 && (
                          <span className={`text-xs ${mutedColor}`}>
                            {Number(item.context.velocity).toFixed(1)}/day
                          </span>
                        )}
                        {item.context.reorder_point !== undefined && (
                          <span className={`text-xs ${mutedColor}`}>
                            ROP: {item.context.reorder_point}
                          </span>
                        )}
                        {item.context.vendor && (
                          <span className={`text-xs ${mutedColor} truncate max-w-[120px]`}>
                            {String(item.context.vendor)}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`${agentInfo.color}`}>{agentInfo.icon}</span>
                      <span className={`text-xs ${mutedColor}`}>{agentInfo.name}</span>
                      <span className={`text-xs ${mutedColor}`}>·</span>
                      <span className={`text-xs ${mutedColor}`}>{formatTimeAgo(item.created_at)}</span>
                    </div>
                  </div>

                  {/* Hover actions */}
                  <div className={`flex items-center gap-2 transition-all duration-200 ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'}`}>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDismiss(item); }}
                      className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-600 text-gray-400 hover:text-gray-200' : 'hover:bg-gray-200 text-gray-400 hover:text-gray-600'}`}
                      title="Dismiss this item"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Click indicator */}
                  <ChevronRightIcon className={`w-4 h-4 flex-shrink-0 transition-all duration-200 ${isHovered ? 'text-blue-500 translate-x-0.5' : mutedColor}`} />

                  {/* Hover tooltip */}
                  {isHovered && (
                    <div className={`absolute left-1/2 -translate-x-1/2 -bottom-8 px-2 py-1 rounded text-xs font-medium whitespace-nowrap z-10 ${
                      isDark ? 'bg-gray-900 text-gray-200' : 'bg-gray-800 text-white'
                    } shadow-lg`}>
                      {getActionHint(item)}
                      <div className={`absolute left-1/2 -translate-x-1/2 -top-1 w-2 h-2 rotate-45 ${isDark ? 'bg-gray-900' : 'bg-gray-800'}`} />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Show count if more items */}
            {activities.length > 5 && (
              <div className={`px-4 py-2 text-center ${mutedColor} text-xs`}>
                +{activities.length - 5} more items
              </div>
            )}
          </div>
        ) : pendingReviewCount > 0 ? (
          // Has pending reviews but no recent activities - prompt user to view all
          <div className="px-6 py-6 text-center">
            <div className={`w-12 h-12 mx-auto mb-3 rounded-xl ${isDark ? 'bg-amber-500/20' : 'bg-amber-50'} flex items-center justify-center`}>
              <ExclamationTriangleIcon className="w-6 h-6 text-amber-500" />
            </div>
            <p className={`text-sm font-medium ${textColor}`}>{pendingReviewCount} items need review</p>
            <p className={`text-xs ${mutedColor} mt-1 mb-3`}>Older items are waiting for your attention</p>
            {onViewAllActivity && (
              <button
                onClick={onViewAllActivity}
                className="text-sm text-blue-500 hover:text-blue-400 font-medium"
              >
                View all activity →
              </button>
            )}
          </div>
        ) : (
          <div className="px-6 py-8 text-center">
            <div className={`w-12 h-12 mx-auto mb-3 rounded-xl ${isDark ? 'bg-green-500/20' : 'bg-green-50'} flex items-center justify-center`}>
              <CheckCircleIcon className="w-6 h-6 text-green-500" />
            </div>
            <p className={`text-sm font-medium ${textColor}`}>All clear!</p>
            <p className={`text-xs ${mutedColor} mt-1`}>No items need your attention right now</p>
          </div>
        )}

        {/* Footer hint when there are items */}
        {hasActivity && activities.length > 0 && (
          <div className={`px-4 py-2 border-t ${borderColor} ${isDark ? 'bg-gray-800/50' : 'bg-gray-50/50'}`}>
            <p className={`text-xs ${mutedColor} text-center`}>
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                Click any item to take action or dismiss
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Enhanced Action Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-2xl shadow-2xl max-w-md w-full overflow-hidden transform transition-all duration-300 scale-100`}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header with severity color */}
            {(() => {
              const severity = getSeverityStyles(selectedItem.severity);
              return (
                <div className={`px-5 py-4 ${severity.bg} border-b ${borderColor}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl bg-white/80 dark:bg-gray-900/50 ${severity.iconColor}`}>
                        {severity.icon}
                      </div>
                      <div>
                        <span className={`font-semibold ${textColor}`}>
                          {selectedItem.severity === 'critical' ? 'Critical Alert' : selectedItem.severity === 'warning' ? 'Warning' : 'Info'}
                        </span>
                        <p className={`text-xs ${mutedColor}`}>
                          {getAgentInfo(selectedItem.agent_identifier).name} · {formatTimeAgo(selectedItem.created_at)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedItem(null)}
                      className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-gray-700' : 'hover:bg-white/50'}`}
                    >
                      <XMarkIcon className={`w-5 h-5 ${mutedColor}`} />
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Modal Content */}
            <div className="p-5 space-y-4">
              <div>
                <h3 className={`text-lg font-semibold ${textColor}`}>{selectedItem.title}</h3>
                {selectedItem.description && (
                  <p className={`text-sm ${mutedColor} mt-2 leading-relaxed`}>{selectedItem.description}</p>
                )}
              </div>

              {/* Context info with better styling */}
              {selectedItem.context && Object.keys(selectedItem.context).length > 0 && (
                <div className={`rounded-xl overflow-hidden border ${borderColor}`}>
                  <div className={`px-4 py-2 text-xs font-medium ${mutedColor} uppercase tracking-wide ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                    Details
                  </div>
                  <div className="p-4 space-y-3">
                    {selectedItem.context.product_name && (
                      <div className="flex justify-between items-center">
                        <span className={`text-sm ${mutedColor}`}>Product</span>
                        <span className={`text-sm font-medium ${textColor}`}>{String(selectedItem.context.product_name)}</span>
                      </div>
                    )}
                    {selectedItem.context.current_stock !== undefined && (
                      <div className="flex justify-between items-center">
                        <span className={`text-sm ${mutedColor}`}>Current Stock</span>
                        <span className={`text-sm font-semibold ${Number(selectedItem.context.current_stock) <= 0 ? 'text-red-500' : textColor}`}>
                          {String(selectedItem.context.current_stock)} units
                        </span>
                      </div>
                    )}
                    {selectedItem.context.reorder_point !== undefined && (
                      <div className="flex justify-between items-center">
                        <span className={`text-sm ${mutedColor}`}>Reorder Point</span>
                        <span className={`text-sm font-medium ${textColor}`}>{String(selectedItem.context.reorder_point)} units</span>
                      </div>
                    )}
                    {selectedItem.context.vendor && (
                      <div className="flex justify-between items-center">
                        <span className={`text-sm ${mutedColor}`}>Vendor</span>
                        <span className={`text-sm font-medium ${textColor}`}>{String(selectedItem.context.vendor)}</span>
                      </div>
                    )}
                    {selectedItem.context.recommendation && (
                      <div className={`mt-3 p-3 rounded-lg ${isDark ? 'bg-blue-500/10 border-blue-500/20' : 'bg-blue-50 border-blue-100'} border`}>
                        <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                          {String(selectedItem.context.recommendation)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className={`px-5 py-4 border-t ${borderColor} space-y-3 ${isDark ? 'bg-gray-800/50' : 'bg-gray-50/50'}`}>
              {/* Primary action */}
              {extractSku(selectedItem.title) && onNavigateToInventory && (
                <button
                  onClick={() => {
                    const sku = extractSku(selectedItem.title);
                    if (sku) {
                      onNavigateToInventory(sku);
                      setSelectedItem(null);
                    }
                  }}
                  className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl font-semibold transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 flex items-center justify-center gap-2"
                >
                  <PackageIcon className="w-5 h-5" />
                  View in Stock Intelligence
                </button>
              )}

              {/* Secondary actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleDismiss(selectedItem, 'Not relevant')}
                  disabled={dismissing}
                  className={`flex-1 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                    isDark
                      ? 'bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600'
                      : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow-sm'
                  }`}
                >
                  <EyeSlashIcon className="w-4 h-4" />
                  {dismissing ? 'Dismissing...' : 'Dismiss'}
                </button>
                <button
                  onClick={() => handleDismissAllSimilar(selectedItem)}
                  disabled={dismissing}
                  className={`flex-1 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 ${
                    isDark
                      ? 'bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600'
                      : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow-sm'
                  }`}
                >
                  Dismiss Similar
                </button>
              </div>

              <p className={`text-xs ${mutedColor} text-center`}>
                Dismissed items won't appear again
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AgentControlCenter;
