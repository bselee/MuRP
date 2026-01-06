/**
 * AgentActivityStream - Real-time feed of agent activities
 *
 * Shows granular visibility into what agents are doing:
 * - Observations: What agents noticed
 * - Analysis: Data they analyzed
 * - Decisions: Recommendations they made (may need approval)
 * - Actions: Things they executed
 * - Checkpoints: Points where human review is needed
 * - Errors: Problems encountered
 *
 * Uses the agent_activity_stream view from migration 162.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase/client';
import { useTheme } from './ThemeProvider';
import {
  EyeIcon,
  ChartBarIcon,
  LightBulbIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  BotIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  RefreshIcon,
} from './icons';

// Activity types matching the database enum
type ActivityType = 'observation' | 'analysis' | 'decision' | 'action' | 'completion' | 'error' | 'checkpoint';
type Severity = 'info' | 'success' | 'warning' | 'error' | 'critical';
type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

interface AgentActivity {
  id: string;
  agent_identifier: string;
  activity_type: ActivityType;
  title: string;
  description: string | null;
  severity: Severity;
  reasoning: Record<string, unknown> | null;
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
  confidence_score: number | null;
  risk_level: RiskLevel | null;
  financial_impact: number | null;
  requires_human_review: boolean;
  human_reviewed_at: string | null;
  human_approved: boolean | null;
  human_feedback: string | null;
  related_sku: string | null;
  related_po_id: string | null;
  related_vendor_id: string | null;
  created_at: string;
}

interface AgentActivityStreamProps {
  agentIdentifier?: string;  // Filter to specific agent
  limit?: number;
  showFilters?: boolean;
  compact?: boolean;
  onReviewNeeded?: (activity: AgentActivity) => void;
}

const AgentActivityStream: React.FC<AgentActivityStreamProps> = ({
  agentIdentifier,
  limit = 50,
  showFilters = true,
  compact = false,
  onReviewNeeded,
}) => {
  const { isDark } = useTheme();
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<ActivityType | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('agent_activity_stream')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (agentIdentifier) {
        query = query.eq('agent_identifier', agentIdentifier);
      }

      if (filter !== 'all') {
        query = query.eq('activity_type', filter);
      }

      if (severityFilter !== 'all') {
        query = query.eq('severity', severityFilter);
      }

      const { data, error: queryError } = await query;

      if (queryError) {
        throw queryError;
      }

      setActivities(data || []);

      // Notify about items needing review
      if (onReviewNeeded) {
        const needsReview = (data || []).filter(
          a => a.requires_human_review && !a.human_reviewed_at
        );
        needsReview.forEach(a => onReviewNeeded(a));
      }
    } catch (err) {
      console.error('[AgentActivityStream] Error fetching activities:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch activities');
    } finally {
      setLoading(false);
    }
  }, [agentIdentifier, limit, filter, severityFilter, onReviewNeeded]);

  useEffect(() => {
    fetchActivities();
    // Refresh every 30 seconds for near-real-time updates
    const interval = setInterval(fetchActivities, 30 * 1000);
    return () => clearInterval(interval);
  }, [fetchActivities]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 30) return 'just now';
    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getAgentDisplayName = (identifier: string) => {
    const names: Record<string, string> = {
      'stockout-prevention': 'Stockout Prevention',
      'stockout_prevention': 'Stockout Prevention',
      'vendor-watchdog': 'Vendor Watchdog',
      'vendor_watchdog': 'Vendor Watchdog',
      'po-intelligence': 'PO Intelligence',
      'po_intelligence': 'PO Intelligence',
      'inventory-guardian': 'Inventory Guardian',
      'inventory_guardian': 'Inventory Guardian',
      'price-hunter': 'Price Hunter',
      'price_hunter': 'Price Hunter',
      'compliance-validator': 'Compliance Validator',
      'compliance_validator': 'Compliance Validator',
      'artwork-approval': 'Artwork Approval',
      'artwork_approval': 'Artwork Approval',
      'air-traffic-controller': 'Air Traffic Controller',
      'air_traffic_controller': 'Air Traffic Controller',
      'invoice-extractor': 'Invoice Extractor',
      'three-way-match': 'Three-Way Match',
      'email-monitor': 'Email Monitor',
    };
    return names[identifier] || identifier.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const getActivityIcon = (type: ActivityType, severity: Severity) => {
    const iconClass = compact ? 'w-4 h-4' : 'w-5 h-5';

    switch (type) {
      case 'observation':
        return <EyeIcon className={`${iconClass} text-blue-400`} />;
      case 'analysis':
        return <ChartBarIcon className={`${iconClass} text-purple-400`} />;
      case 'decision':
        return <LightBulbIcon className={`${iconClass} text-yellow-400`} />;
      case 'action':
        return severity === 'error'
          ? <XCircleIcon className={`${iconClass} text-red-500`} />
          : <CheckCircleIcon className={`${iconClass} text-green-500`} />;
      case 'completion':
        return <CheckCircleIcon className={`${iconClass} text-green-500`} />;
      case 'error':
        return <XCircleIcon className={`${iconClass} text-red-500`} />;
      case 'checkpoint':
        return <ExclamationTriangleIcon className={`${iconClass} text-amber-500`} />;
      default:
        return <BotIcon className={`${iconClass} text-gray-400`} />;
    }
  };

  const getSeverityBadge = (severity: Severity) => {
    const baseClass = 'px-1.5 py-0.5 rounded text-xs font-medium';
    switch (severity) {
      case 'critical':
        return <span className={`${baseClass} bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300`}>Critical</span>;
      case 'error':
        return <span className={`${baseClass} bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400`}>Error</span>;
      case 'warning':
        return <span className={`${baseClass} bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300`}>Warning</span>;
      case 'success':
        return <span className={`${baseClass} bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300`}>Success</span>;
      default:
        return null;
    }
  };

  const getRiskBadge = (risk: RiskLevel | null) => {
    if (!risk) return null;
    const baseClass = 'px-1.5 py-0.5 rounded text-xs font-medium';
    switch (risk) {
      case 'critical':
        return <span className={`${baseClass} bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300`}>High Risk</span>;
      case 'high':
        return <span className={`${baseClass} bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300`}>High Risk</span>;
      case 'medium':
        return <span className={`${baseClass} bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300`}>Med Risk</span>;
      default:
        return null;
    }
  };

  const cardClass = isDark
    ? 'bg-gray-800/50 border-gray-700'
    : 'bg-white border-gray-200 shadow-sm';

  const textClass = isDark ? 'text-gray-100' : 'text-gray-900';
  const mutedClass = isDark ? 'text-gray-400' : 'text-gray-500';
  const hoverClass = isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50';

  // Activity type filter options
  const activityTypes: { value: ActivityType | 'all'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'observation', label: 'Observations' },
    { value: 'analysis', label: 'Analysis' },
    { value: 'decision', label: 'Decisions' },
    { value: 'action', label: 'Actions' },
    { value: 'checkpoint', label: 'Checkpoints' },
    { value: 'error', label: 'Errors' },
  ];

  if (loading && activities.length === 0) {
    return (
      <div className={`p-4 rounded-lg border ${cardClass}`}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/3"></div>
          <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 rounded-lg border ${cardClass}`}>
        <div className="flex items-center gap-2 text-red-500">
          <XCircleIcon className="w-5 h-5" />
          <span>{error}</span>
        </div>
        <button
          onClick={fetchActivities}
          className="mt-2 text-sm text-blue-500 hover:text-blue-400"
        >
          Try again
        </button>
      </div>
    );
  }

  // Count items needing review
  const pendingReviewCount = activities.filter(
    a => a.requires_human_review && !a.human_reviewed_at
  ).length;

  return (
    <div className="space-y-3">
      {/* Header with filters */}
      {showFilters && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BotIcon className={`w-5 h-5 ${mutedClass}`} />
            <h3 className={`font-medium ${textClass}`}>Agent Activity Stream</h3>
            {pendingReviewCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                {pendingReviewCount} needs review
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Activity Type Filter */}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as ActivityType | 'all')}
              className={`text-xs px-2 py-1 rounded border ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-gray-200'
                  : 'bg-white border-gray-300 text-gray-700'
              }`}
            >
              {activityTypes.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            {/* Severity Filter */}
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as Severity | 'all')}
              className={`text-xs px-2 py-1 rounded border ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-gray-200'
                  : 'bg-white border-gray-300 text-gray-700'
              }`}
            >
              <option value="all">All Severity</option>
              <option value="critical">Critical</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="success">Success</option>
              <option value="info">Info</option>
            </select>

            {/* Refresh button */}
            <button
              onClick={fetchActivities}
              disabled={loading}
              className={`p-1 rounded ${hoverClass} ${mutedClass}`}
              title="Refresh"
            >
              <RefreshIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      )}

      {/* Activity List */}
      {activities.length === 0 ? (
        <div className={`p-6 rounded-lg border ${cardClass} text-center`}>
          <ClockIcon className={`w-8 h-8 mx-auto mb-2 ${mutedClass}`} />
          <p className={mutedClass}>No agent activity found</p>
        </div>
      ) : (
        <div className={`rounded-lg border ${cardClass} divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
          {activities.map(activity => {
            const isExpanded = expandedIds.has(activity.id);
            const hasDetails = activity.reasoning || activity.output_data || activity.description;
            const needsReview = activity.requires_human_review && !activity.human_reviewed_at;

            return (
              <div
                key={activity.id}
                className={`${compact ? 'p-2' : 'p-3'} ${hasDetails ? 'cursor-pointer' : ''} ${hoverClass} transition-colors`}
                onClick={() => hasDetails && toggleExpand(activity.id)}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    {getActivityIcon(activity.activity_type, activity.severity)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className={`${compact ? 'text-sm' : 'text-sm'} font-medium ${textClass} ${compact ? 'truncate' : ''}`}>
                          {activity.title}
                        </p>
                        {!compact && activity.description && !isExpanded && (
                          <p className={`text-xs ${mutedClass} line-clamp-1 mt-0.5`}>
                            {activity.description}
                          </p>
                        )}
                        <div className={`flex items-center gap-2 mt-1 text-xs ${mutedClass}`}>
                          <span>{getAgentDisplayName(activity.agent_identifier)}</span>
                          <span>·</span>
                          <span>{formatTimeAgo(activity.created_at)}</span>
                          {activity.confidence_score && (
                            <>
                              <span>·</span>
                              <span>{Math.round(activity.confidence_score * 100)}% conf</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Badges and expand icon */}
                      <div className="flex items-center gap-2">
                        {getSeverityBadge(activity.severity)}
                        {getRiskBadge(activity.risk_level)}
                        {needsReview && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 animate-pulse">
                            Review
                          </span>
                        )}
                        {activity.financial_impact && (
                          <span className={`text-xs font-medium ${
                            activity.financial_impact > 0 ? 'text-green-500' : 'text-red-500'
                          }`}>
                            ${Math.abs(activity.financial_impact).toLocaleString()}
                          </span>
                        )}
                        {hasDetails && (
                          isExpanded
                            ? <ChevronDownIcon className={`w-4 h-4 ${mutedClass}`} />
                            : <ChevronRightIcon className={`w-4 h-4 ${mutedClass}`} />
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && hasDetails && (
                      <div className={`mt-3 pt-3 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                        {activity.description && (
                          <p className={`text-sm ${mutedClass} mb-2`}>{activity.description}</p>
                        )}

                        {activity.reasoning && Object.keys(activity.reasoning).length > 0 && (
                          <div className="mb-2">
                            <p className={`text-xs font-medium ${textClass} mb-1`}>Reasoning:</p>
                            <pre className={`text-xs ${mutedClass} bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto`}>
                              {JSON.stringify(activity.reasoning, null, 2)}
                            </pre>
                          </div>
                        )}

                        {activity.output_data && Object.keys(activity.output_data).length > 0 && (
                          <div className="mb-2">
                            <p className={`text-xs font-medium ${textClass} mb-1`}>Output:</p>
                            <pre className={`text-xs ${mutedClass} bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto`}>
                              {JSON.stringify(activity.output_data, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Related entities */}
                        {(activity.related_sku || activity.related_po_id || activity.related_vendor_id) && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {activity.related_sku && (
                              <span className={`text-xs px-2 py-0.5 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                SKU: {activity.related_sku}
                              </span>
                            )}
                            {activity.related_po_id && (
                              <span className={`text-xs px-2 py-0.5 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                PO: {activity.related_po_id}
                              </span>
                            )}
                            {activity.related_vendor_id && (
                              <span className={`text-xs px-2 py-0.5 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                Vendor: {activity.related_vendor_id}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Human review status */}
                        {activity.human_reviewed_at && (
                          <div className={`mt-2 pt-2 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                            <p className={`text-xs ${activity.human_approved ? 'text-green-500' : 'text-red-500'}`}>
                              {activity.human_approved ? '✓ Approved' : '✗ Rejected'} on {new Date(activity.human_reviewed_at).toLocaleString()}
                            </p>
                            {activity.human_feedback && (
                              <p className={`text-xs ${mutedClass} mt-1`}>Feedback: {activity.human_feedback}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AgentActivityStream;
