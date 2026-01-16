/**
 * Build Forecast Page
 *
 * Displays upcoming production builds from finished_goods_forecast table.
 * Shows component requirements, shortages, and replenishment recommendations.
 * Data flows from Google Calendar via Rube -> import-build-forecast edge function.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useTheme } from '../components/ThemeProvider';
import Button from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import CollapsibleSection from '../components/CollapsibleSection';
import Modal from '../components/Modal';
import {
  CalendarIcon,
  ChevronDownIcon,
  ListBulletIcon,
  Squares2X2Icon,
  AlertTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  TruckIcon,
  PackageIcon,
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  BoxIcon,
} from '../components/icons';
import {
  useFinishedGoodsForecast,
  useComponentRequirements,
  usePurchaseRecommendations,
  useForecastSummary,
  type BuildForecastWithDetails,
  type ComponentRequirement,
  type PurchaseRecommendation,
} from '../hooks/useFinishedGoodsForecast';

// ============================================================================
// TYPES
// ============================================================================

interface BuildForecastProps {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type ViewMode = 'card' | 'table';
type SortOption = 'date' | 'sku' | 'requirement' | 'urgency' | 'shortages';
type GroupByOption = 'none' | 'week' | 'action' | 'confidence';
type BuildActionFilter = 'all' | 'BUILD_URGENT' | 'BUILD_SOON' | 'ADEQUATE' | 'NO_DEMAND';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const formatWeekLabel = (dateStr: string): string => {
  const date = new Date(dateStr);
  const month = date.toLocaleString('default', { month: 'short' });
  const day = date.getDate();
  const endDate = new Date(date);
  endDate.setDate(endDate.getDate() + 6);
  const endDay = endDate.getDate();
  return `${month} ${day}-${endDay}`;
};

const getActionColor = (action: string | undefined, isDark: boolean) => {
  switch (action) {
    case 'BUILD_URGENT':
      return isDark ? 'text-red-400 bg-red-900/30' : 'text-red-600 bg-red-100';
    case 'BUILD_SOON':
      return isDark ? 'text-amber-400 bg-amber-900/30' : 'text-amber-600 bg-amber-100';
    case 'ADEQUATE':
      return isDark ? 'text-emerald-400 bg-emerald-900/30' : 'text-emerald-600 bg-emerald-100';
    case 'NO_DEMAND':
      return isDark ? 'text-gray-400 bg-gray-800' : 'text-gray-500 bg-gray-100';
    default:
      return isDark ? 'text-gray-400 bg-gray-800' : 'text-gray-500 bg-gray-100';
  }
};

const getConfidenceColor = (confidence: string, isDark: boolean) => {
  switch (confidence) {
    case 'high':
      return isDark ? 'text-emerald-400' : 'text-emerald-600';
    case 'medium':
      return isDark ? 'text-amber-400' : 'text-amber-600';
    case 'low':
      return isDark ? 'text-red-400' : 'text-red-600';
    default:
      return isDark ? 'text-gray-400' : 'text-gray-500';
  }
};

const getStatusColor = (status: string, isDark: boolean) => {
  switch (status) {
    case 'CRITICAL':
      return isDark ? 'bg-red-900/50 border-red-700 text-red-300' : 'bg-red-50 border-red-200 text-red-700';
    case 'SHORTAGE':
      return isDark ? 'bg-amber-900/50 border-amber-700 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700';
    case 'COVERED':
      return isDark ? 'bg-emerald-900/50 border-emerald-700 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700';
    case 'EXCESS':
      return isDark ? 'bg-blue-900/50 border-blue-700 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-700';
    default:
      return isDark ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-700';
  }
};

// ============================================================================
// COMPONENTS
// ============================================================================

// Build Forecast Card Component
const BuildForecastCard: React.FC<{
  forecast: BuildForecastWithDetails;
  isDark: boolean;
  onViewShortages: (productId: string) => void;
}> = ({ forecast, isDark, onViewShortages }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const cardClass = isDark
    ? 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
    : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm';

  return (
    <div className={`rounded-xl border p-4 transition-all ${cardClass}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {forecast.bom_name || forecast.product_id}
            </h3>
            <span className={`text-xs px-2 py-0.5 rounded ${getActionColor(forecast.build_action, isDark)}`}>
              {forecast.build_action?.replace('_', ' ') || 'Unknown'}
            </span>
          </div>
          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            SKU: {forecast.product_id} • {forecast.bom_category || 'Uncategorized'}
          </p>
        </div>
        <div className="text-right">
          <div className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {forecast.gross_requirement}
          </div>
          <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            units needed
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        <div className={`p-2 rounded-lg ${isDark ? 'bg-gray-900/50' : 'bg-gray-50'}`}>
          <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Week</div>
          <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {formatWeekLabel(forecast.forecast_period)}
          </div>
        </div>
        <div className={`p-2 rounded-lg ${isDark ? 'bg-gray-900/50' : 'bg-gray-50'}`}>
          <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Stock</div>
          <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {forecast.current_stock ?? 0}
          </div>
        </div>
        <div className={`p-2 rounded-lg ${isDark ? 'bg-gray-900/50' : 'bg-gray-50'}`}>
          <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Buildable</div>
          <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {forecast.buildable_units ?? 0}
          </div>
        </div>
        <div className={`p-2 rounded-lg ${isDark ? 'bg-gray-900/50' : 'bg-gray-50'}`}>
          <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Coverage</div>
          <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {forecast.days_of_coverage ? `${Math.round(forecast.days_of_coverage)}d` : '-'}
          </div>
        </div>
      </div>

      {/* Confidence & Seasonal */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Confidence: <span className={getConfidenceColor(forecast.forecast_confidence, isDark)}>
              {forecast.forecast_confidence}
            </span>
          </span>
          <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Seasonal: <span className={forecast.seasonal_index > 1.2 ? (isDark ? 'text-blue-400' : 'text-blue-600') : ''}>
              {forecast.seasonal_index.toFixed(2)}x
            </span>
          </span>
        </div>
        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          via {forecast.forecast_method}
        </span>
      </div>

      {/* Shortages Alert */}
      {(forecast.shortage_count ?? 0) > 0 && (
        <div
          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer ${
            isDark ? 'bg-red-900/20 hover:bg-red-900/30' : 'bg-red-50 hover:bg-red-100'
          }`}
          onClick={() => onViewShortages(forecast.product_id)}
        >
          <div className="flex items-center gap-2">
            <AlertTriangleIcon className={`w-4 h-4 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
            <span className={`text-sm ${isDark ? 'text-red-300' : 'text-red-700'}`}>
              {forecast.critical_shortage_count} critical, {(forecast.shortage_count ?? 0) - (forecast.critical_shortage_count ?? 0)} shortage
            </span>
          </div>
          <ChevronDownIcon className={`w-4 h-4 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
        </div>
      )}

      {/* Limiting Component */}
      {forecast.limiting_component && (
        <div className={`mt-2 text-xs ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
          ⚠️ Limited by: {forecast.limiting_component}
        </div>
      )}

      {/* Expandable Notes */}
      {forecast.notes && (
        <div className="mt-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`text-xs ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
          >
            {isExpanded ? '▼ Hide notes' : '▶ Show import notes'}
          </button>
          {isExpanded && (
            <pre className={`mt-2 p-2 rounded text-xs whitespace-pre-wrap ${
              isDark ? 'bg-gray-900 text-gray-300' : 'bg-gray-50 text-gray-600'
            }`}>
              {forecast.notes}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

// Component Shortage Row
const ComponentShortageRow: React.FC<{
  requirement: ComponentRequirement;
  isDark: boolean;
  onCreatePO?: (sku: string) => void;
}> = ({ requirement, isDark, onCreatePO }) => {
  return (
    <tr className={isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'}>
      <td className="px-3 py-2">
        <div className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {requirement.component_name}
        </div>
        <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          {requirement.component_sku}
        </div>
      </td>
      <td className="px-3 py-2 text-sm">
        <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>
          {requirement.parent_name}
        </span>
      </td>
      <td className="px-3 py-2 text-center">
        <span className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {requirement.required_qty}
        </span>
      </td>
      <td className="px-3 py-2 text-center">
        <span className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {requirement.available_qty}
        </span>
      </td>
      <td className="px-3 py-2 text-center">
        <span className={`text-sm font-medium ${
          requirement.shortage_qty > 0
            ? (isDark ? 'text-red-400' : 'text-red-600')
            : (isDark ? 'text-emerald-400' : 'text-emerald-600')
        }`}>
          {requirement.shortage_qty > 0 ? `-${requirement.shortage_qty}` : `+${requirement.surplus_qty}`}
        </span>
      </td>
      <td className="px-3 py-2 text-center">
        <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          {requirement.days_until_needed}d
        </span>
      </td>
      <td className="px-3 py-2">
        <span className={`px-2 py-1 text-xs rounded border ${getStatusColor(requirement.status, isDark)}`}>
          {requirement.status}
        </span>
      </td>
      <td className="px-3 py-2">
        <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          {requirement.vendor_name || '-'}
        </span>
      </td>
      <td className="px-3 py-2">
        {requirement.status === 'CRITICAL' || requirement.status === 'SHORTAGE' ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onCreatePO?.(requirement.component_sku)}
            className={`text-xs ${isDark ? 'text-accent-400 hover:text-accent-300' : 'text-accent-600 hover:text-accent-500'}`}
          >
            <BoxIcon className="w-3 h-3 mr-1" />
            Order
          </Button>
        ) : null}
      </td>
    </tr>
  );
};

// Summary Stats Card
const SummaryCard: React.FC<{
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  isDark: boolean;
}> = ({ label, value, icon, color, isDark }) => (
  <div className={`p-4 rounded-xl border ${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-200 shadow-sm'}`}>
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg ${color}`}>
        {icon}
      </div>
      <div>
        <div className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {value}
        </div>
        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          {label}
        </div>
      </div>
    </div>
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const BuildForecast: React.FC<BuildForecastProps> = ({ addToast }) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // View state (persisted)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('build-forecast-view') as ViewMode) || 'card';
    }
    return 'card';
  });

  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [groupBy, setGroupBy] = useState<GroupByOption>('week');
  const [actionFilter, setActionFilter] = useState<BuildActionFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFiltersOpen, setIsFiltersOpen] = useState(true);

  // Modal state
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isShortagesModalOpen, setIsShortagesModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'forecasts' | 'shortages' | 'recommendations'>('forecasts');

  // Data hooks
  const { data: forecasts, loading: forecastsLoading, error: forecastsError, refetch: refetchForecasts } = useFinishedGoodsForecast({ weeksAhead: 13 });
  const { data: shortages, loading: shortagesLoading, refetch: refetchShortages } = useComponentRequirements({
    statusFilter: ['CRITICAL', 'SHORTAGE'],
  });
  const { data: recommendations, loading: recommendationsLoading } = usePurchaseRecommendations();
  const { summary } = useForecastSummary();

  // Persist view mode
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('build-forecast-view', viewMode);
    }
  }, [viewMode]);

  // Filter and sort forecasts
  const filteredForecasts = useMemo(() => {
    let result = [...forecasts];

    // Apply action filter
    if (actionFilter !== 'all') {
      result = result.filter(f => f.build_action === actionFilter);
    }

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(f =>
        f.product_id.toLowerCase().includes(query) ||
        f.bom_name?.toLowerCase().includes(query) ||
        f.bom_category?.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(a.forecast_period).getTime() - new Date(b.forecast_period).getTime();
        case 'sku':
          return a.product_id.localeCompare(b.product_id);
        case 'requirement':
          return b.gross_requirement - a.gross_requirement;
        case 'urgency':
          const urgencyOrder = { BUILD_URGENT: 0, BUILD_SOON: 1, ADEQUATE: 2, NO_DEMAND: 3 };
          return (urgencyOrder[a.build_action as keyof typeof urgencyOrder] ?? 4) -
                 (urgencyOrder[b.build_action as keyof typeof urgencyOrder] ?? 4);
        case 'shortages':
          return (b.shortage_count ?? 0) - (a.shortage_count ?? 0);
        default:
          return 0;
      }
    });

    return result;
  }, [forecasts, actionFilter, searchQuery, sortBy]);

  // Group forecasts
  const groupedForecasts = useMemo(() => {
    if (groupBy === 'none') return { 'All Forecasts': filteredForecasts };

    const groups: Record<string, BuildForecastWithDetails[]> = {};

    filteredForecasts.forEach(f => {
      let groupKey: string;
      switch (groupBy) {
        case 'week':
          groupKey = formatWeekLabel(f.forecast_period);
          break;
        case 'action':
          groupKey = f.build_action?.replace('_', ' ') || 'Unknown';
          break;
        case 'confidence':
          groupKey = `${f.forecast_confidence.charAt(0).toUpperCase()}${f.forecast_confidence.slice(1)} Confidence`;
          break;
        default:
          groupKey = 'Other';
      }

      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(f);
    });

    return groups;
  }, [filteredForecasts, groupBy]);

  // Handlers
  const handleViewShortages = useCallback((productId: string) => {
    setSelectedProductId(productId);
    setIsShortagesModalOpen(true);
  }, []);

  const handleRefresh = useCallback(async () => {
    await Promise.all([refetchForecasts(), refetchShortages()]);
    addToast('Forecast data refreshed', 'success');
  }, [refetchForecasts, refetchShortages, addToast]);

  // Theme classes
  const bgClass = isDark ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-200 shadow-sm';
  const textClass = isDark ? 'text-white' : 'text-gray-900';
  const mutedClass = isDark ? 'text-gray-400' : 'text-gray-500';

  // Product shortages for modal
  const productShortages = useMemo(() => {
    if (!selectedProductId) return [];
    return shortages.filter(s => s.parent_sku === selectedProductId);
  }, [shortages, selectedProductId]);

  return (
    <div className={`min-h-screen ${bgClass}`}>
      {/* Header */}
      <PageHeader
        title="Build Forecast"
        subtitle="Production builds from calendar • Component requirements • Replenishment"
        icon={<CalendarIcon className="w-6 h-6" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={forecastsLoading}
              className={isDark ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}
            >
              <ArrowPathIcon className={`w-4 h-4 ${forecastsLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        }
      />

      <div className="p-4 lg:p-6 space-y-6">
        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard
              label="Products Forecasted"
              value={summary.totalProducts}
              icon={<PackageIcon className="w-5 h-5 text-blue-400" />}
              color={isDark ? 'bg-blue-900/30' : 'bg-blue-100'}
              isDark={isDark}
            />
            <SummaryCard
              label="Total Requirement"
              value={summary.totalGrossRequirement.toLocaleString()}
              icon={<CalendarIcon className="w-5 h-5 text-purple-400" />}
              color={isDark ? 'bg-purple-900/30' : 'bg-purple-100'}
              isDark={isDark}
            />
            <SummaryCard
              label="Critical Shortages"
              value={summary.criticalShortages}
              icon={<ExclamationCircleIcon className="w-5 h-5 text-red-400" />}
              color={isDark ? 'bg-red-900/30' : 'bg-red-100'}
              isDark={isDark}
            />
            <SummaryCard
              label="Build Urgent"
              value={summary.byAction.BUILD_URGENT}
              icon={<AlertTriangleIcon className="w-5 h-5 text-amber-400" />}
              color={isDark ? 'bg-amber-900/30' : 'bg-amber-100'}
              isDark={isDark}
            />
          </div>
        )}

        {/* Tabs */}
        <div className={`flex items-center gap-1 p-1 rounded-lg ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
          {[
            { id: 'forecasts', label: 'Build Forecasts', count: forecasts.length },
            { id: 'shortages', label: 'Component Shortages', count: shortages.length },
            { id: 'recommendations', label: 'Replenishment', count: recommendations.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? (isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-900 shadow-sm')
                  : (isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900')
              }`}
            >
              {tab.label}
              <span className={`ml-2 px-1.5 py-0.5 text-xs rounded ${
                activeTab === tab.id
                  ? (isDark ? 'bg-gray-600' : 'bg-gray-100')
                  : (isDark ? 'bg-gray-700' : 'bg-gray-200')
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Forecasts Tab */}
        {activeTab === 'forecasts' && (
          <>
            {/* Filters */}
            <CollapsibleSection
              title="Filters & View"
              icon={<AdjustmentsHorizontalIcon className="w-4 h-4" />}
              variant="card"
              isOpen={isFiltersOpen}
              onToggle={() => setIsFiltersOpen(!isFiltersOpen)}
            >
              <div className="flex flex-wrap items-center gap-4">
                {/* Search */}
                <input
                  type="text"
                  placeholder="Search SKU, name..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className={`px-3 py-2 rounded-lg border w-64 ${
                    isDark
                      ? 'bg-gray-900 border-gray-700 text-white placeholder-gray-500'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                  }`}
                />

                {/* Action Filter */}
                <select
                  value={actionFilter}
                  onChange={e => setActionFilter(e.target.value as BuildActionFilter)}
                  className={`px-3 py-2 rounded-lg border ${
                    isDark
                      ? 'bg-gray-900 border-gray-700 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  <option value="all">All Actions</option>
                  <option value="BUILD_URGENT">Build Urgent</option>
                  <option value="BUILD_SOON">Build Soon</option>
                  <option value="ADEQUATE">Adequate</option>
                  <option value="NO_DEMAND">No Demand</option>
                </select>

                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as SortOption)}
                  className={`px-3 py-2 rounded-lg border ${
                    isDark
                      ? 'bg-gray-900 border-gray-700 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  <option value="date">Sort by Date</option>
                  <option value="sku">Sort by SKU</option>
                  <option value="requirement">Sort by Requirement</option>
                  <option value="urgency">Sort by Urgency</option>
                  <option value="shortages">Sort by Shortages</option>
                </select>

                {/* Group By */}
                <select
                  value={groupBy}
                  onChange={e => setGroupBy(e.target.value as GroupByOption)}
                  className={`px-3 py-2 rounded-lg border ${
                    isDark
                      ? 'bg-gray-900 border-gray-700 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  <option value="none">No Grouping</option>
                  <option value="week">Group by Week</option>
                  <option value="action">Group by Action</option>
                  <option value="confidence">Group by Confidence</option>
                </select>

                {/* View Toggle */}
                <div className={`flex items-center gap-1 p-1 rounded-lg ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                  <button
                    onClick={() => setViewMode('card')}
                    className={`p-2 rounded ${
                      viewMode === 'card'
                        ? (isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-900 shadow-sm')
                        : (isDark ? 'text-gray-400' : 'text-gray-500')
                    }`}
                  >
                    <Squares2X2Icon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`p-2 rounded ${
                      viewMode === 'table'
                        ? (isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-900 shadow-sm')
                        : (isDark ? 'text-gray-400' : 'text-gray-500')
                    }`}
                  >
                    <ListBulletIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </CollapsibleSection>

            {/* Forecast List */}
            {forecastsLoading ? (
              <div className="flex items-center justify-center py-12">
                <ArrowPathIcon className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : forecastsError ? (
              <div className={`p-6 rounded-xl border text-center ${
                isDark ? 'bg-red-900/20 border-red-800 text-red-300' : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                <ExclamationCircleIcon className="w-8 h-8 mx-auto mb-2" />
                <p>Failed to load forecasts: {forecastsError.message}</p>
              </div>
            ) : filteredForecasts.length === 0 ? (
              <div className={`p-12 rounded-xl border text-center ${cardClass}`}>
                <CalendarIcon className={`w-12 h-12 mx-auto mb-4 ${mutedClass}`} />
                <h3 className={`text-lg font-medium mb-2 ${textClass}`}>No Build Forecasts</h3>
                <p className={mutedClass}>
                  No upcoming builds found. Connect your Google Calendar to import production schedules.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedForecasts).map(([groupName, items]) => (
                  <div key={groupName}>
                    {groupBy !== 'none' && (
                      <h3 className={`text-sm font-medium mb-3 ${mutedClass}`}>
                        {groupName} ({items.length})
                      </h3>
                    )}
                    {viewMode === 'card' ? (
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {items.map(forecast => (
                          <BuildForecastCard
                            key={forecast.id}
                            forecast={forecast}
                            isDark={isDark}
                            onViewShortages={handleViewShortages}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className={`rounded-xl border overflow-hidden ${cardClass}`}>
                        <table className="w-full">
                          <thead className={isDark ? 'bg-gray-800' : 'bg-gray-50'}>
                            <tr>
                              <th className={`px-4 py-3 text-left text-xs font-medium uppercase ${mutedClass}`}>Product</th>
                              <th className={`px-4 py-3 text-left text-xs font-medium uppercase ${mutedClass}`}>Week</th>
                              <th className={`px-4 py-3 text-center text-xs font-medium uppercase ${mutedClass}`}>Required</th>
                              <th className={`px-4 py-3 text-center text-xs font-medium uppercase ${mutedClass}`}>Stock</th>
                              <th className={`px-4 py-3 text-center text-xs font-medium uppercase ${mutedClass}`}>Buildable</th>
                              <th className={`px-4 py-3 text-center text-xs font-medium uppercase ${mutedClass}`}>Action</th>
                              <th className={`px-4 py-3 text-center text-xs font-medium uppercase ${mutedClass}`}>Shortages</th>
                            </tr>
                          </thead>
                          <tbody className={`divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                            {items.map(forecast => (
                              <tr key={forecast.id} className={isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'}>
                                <td className="px-4 py-3">
                                  <div className={`font-medium ${textClass}`}>{forecast.bom_name || forecast.product_id}</div>
                                  <div className={`text-xs ${mutedClass}`}>{forecast.product_id}</div>
                                </td>
                                <td className={`px-4 py-3 ${mutedClass}`}>{formatWeekLabel(forecast.forecast_period)}</td>
                                <td className={`px-4 py-3 text-center font-medium ${textClass}`}>{forecast.gross_requirement}</td>
                                <td className={`px-4 py-3 text-center ${textClass}`}>{forecast.current_stock ?? 0}</td>
                                <td className={`px-4 py-3 text-center ${textClass}`}>{forecast.buildable_units ?? 0}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`px-2 py-1 text-xs rounded ${getActionColor(forecast.build_action, isDark)}`}>
                                    {forecast.build_action?.replace('_', ' ') || '-'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {(forecast.shortage_count ?? 0) > 0 ? (
                                    <button
                                      onClick={() => handleViewShortages(forecast.product_id)}
                                      className={`px-2 py-1 text-xs rounded ${
                                        isDark ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50' : 'bg-red-100 text-red-600 hover:bg-red-200'
                                      }`}
                                    >
                                      {forecast.shortage_count} issues
                                    </button>
                                  ) : (
                                    <CheckCircleIcon className={`w-5 h-5 mx-auto ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Shortages Tab */}
        {activeTab === 'shortages' && (
          <div className={`rounded-xl border overflow-hidden ${cardClass}`}>
            {shortagesLoading ? (
              <div className="flex items-center justify-center py-12">
                <ArrowPathIcon className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : shortages.length === 0 ? (
              <div className="p-12 text-center">
                <CheckCircleIcon className={`w-12 h-12 mx-auto mb-4 text-emerald-400`} />
                <h3 className={`text-lg font-medium mb-2 ${textClass}`}>No Component Shortages</h3>
                <p className={mutedClass}>All components are adequately stocked for upcoming builds.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className={isDark ? 'bg-gray-800' : 'bg-gray-50'}>
                    <tr>
                      <th className={`px-3 py-3 text-left text-xs font-medium uppercase ${mutedClass}`}>Component</th>
                      <th className={`px-3 py-3 text-left text-xs font-medium uppercase ${mutedClass}`}>Needed For</th>
                      <th className={`px-3 py-3 text-center text-xs font-medium uppercase ${mutedClass}`}>Required</th>
                      <th className={`px-3 py-3 text-center text-xs font-medium uppercase ${mutedClass}`}>Available</th>
                      <th className={`px-3 py-3 text-center text-xs font-medium uppercase ${mutedClass}`}>Gap</th>
                      <th className={`px-3 py-3 text-center text-xs font-medium uppercase ${mutedClass}`}>Days Left</th>
                      <th className={`px-3 py-3 text-center text-xs font-medium uppercase ${mutedClass}`}>Status</th>
                      <th className={`px-3 py-3 text-left text-xs font-medium uppercase ${mutedClass}`}>Vendor</th>
                      <th className={`px-3 py-3 text-center text-xs font-medium uppercase ${mutedClass}`}>Action</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                    {shortages.map(req => (
                      <ComponentShortageRow
                        key={req.id}
                        requirement={req}
                        isDark={isDark}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Recommendations Tab */}
        {activeTab === 'recommendations' && (
          <div className={`rounded-xl border overflow-hidden ${cardClass}`}>
            {recommendationsLoading ? (
              <div className="flex items-center justify-center py-12">
                <ArrowPathIcon className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : recommendations.length === 0 ? (
              <div className="p-12 text-center">
                <TruckIcon className={`w-12 h-12 mx-auto mb-4 ${mutedClass}`} />
                <h3 className={`text-lg font-medium mb-2 ${textClass}`}>No Purchase Recommendations</h3>
                <p className={mutedClass}>No replenishment needed at this time.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className={isDark ? 'bg-gray-800' : 'bg-gray-50'}>
                    <tr>
                      <th className={`px-4 py-3 text-left text-xs font-medium uppercase ${mutedClass}`}>Component</th>
                      <th className={`px-4 py-3 text-left text-xs font-medium uppercase ${mutedClass}`}>Vendor</th>
                      <th className={`px-4 py-3 text-center text-xs font-medium uppercase ${mutedClass}`}>Priority</th>
                      <th className={`px-4 py-3 text-center text-xs font-medium uppercase ${mutedClass}`}>Qty</th>
                      <th className={`px-4 py-3 text-right text-xs font-medium uppercase ${mutedClass}`}>Unit Cost</th>
                      <th className={`px-4 py-3 text-right text-xs font-medium uppercase ${mutedClass}`}>Total</th>
                      <th className={`px-4 py-3 text-center text-xs font-medium uppercase ${mutedClass}`}>Lead Time</th>
                      <th className={`px-4 py-3 text-center text-xs font-medium uppercase ${mutedClass}`}>Blocks</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                    {recommendations.map(rec => (
                      <tr key={rec.id} className={isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'}>
                        <td className="px-4 py-3">
                          <div className={`font-medium ${textClass}`}>{rec.component_name}</div>
                          <div className={`text-xs ${mutedClass}`}>{rec.component_sku}</div>
                        </td>
                        <td className={`px-4 py-3 ${mutedClass}`}>{rec.vendor_name}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 text-xs rounded ${
                            rec.purchase_priority === 'CRITICAL'
                              ? (isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-600')
                              : rec.purchase_priority === 'HIGH'
                              ? (isDark ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-100 text-amber-600')
                              : rec.purchase_priority === 'MEDIUM'
                              ? (isDark ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-600')
                              : (isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600')
                          }`}>
                            {rec.purchase_priority}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-center font-medium ${textClass}`}>{rec.suggested_order_qty}</td>
                        <td className={`px-4 py-3 text-right ${mutedClass}`}>${rec.unit_cost.toFixed(2)}</td>
                        <td className={`px-4 py-3 text-right font-medium ${textClass}`}>${rec.total_cost.toFixed(2)}</td>
                        <td className={`px-4 py-3 text-center ${mutedClass}`}>{rec.lead_time_days}d</td>
                        <td className="px-4 py-3 text-center">
                          {rec.blocks_critical_builds ? (
                            <AlertTriangleIcon className={`w-5 h-5 mx-auto ${isDark ? 'text-red-400' : 'text-red-600'}`} />
                          ) : (
                            <span className={mutedClass}>-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Shortages Modal */}
      <Modal
        isOpen={isShortagesModalOpen}
        onClose={() => setIsShortagesModalOpen(false)}
        title={`Component Shortages for ${selectedProductId}`}
        size="xl"
      >
        <div className="max-h-96 overflow-auto">
          {productShortages.length === 0 ? (
            <p className={mutedClass}>No shortages found for this product.</p>
          ) : (
            <table className="w-full">
              <thead className={isDark ? 'bg-gray-800' : 'bg-gray-100'}>
                <tr>
                  <th className={`px-3 py-2 text-left text-xs ${mutedClass}`}>Component</th>
                  <th className={`px-3 py-2 text-center text-xs ${mutedClass}`}>Required</th>
                  <th className={`px-3 py-2 text-center text-xs ${mutedClass}`}>Available</th>
                  <th className={`px-3 py-2 text-center text-xs ${mutedClass}`}>Shortage</th>
                  <th className={`px-3 py-2 text-center text-xs ${mutedClass}`}>Status</th>
                </tr>
              </thead>
              <tbody>
                {productShortages.map(s => (
                  <tr key={s.id}>
                    <td className={`px-3 py-2 ${textClass}`}>{s.component_name}</td>
                    <td className={`px-3 py-2 text-center ${textClass}`}>{s.required_qty}</td>
                    <td className={`px-3 py-2 text-center ${textClass}`}>{s.available_qty}</td>
                    <td className={`px-3 py-2 text-center text-red-400`}>-{s.shortage_qty}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-1 text-xs rounded ${getStatusColor(s.status, isDark)}`}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default BuildForecast;
