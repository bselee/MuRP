/**
 * VendorLeadTimeAnalysisCard Component
 * 
 * Displays vendor lead time metrics and risk assessment with visual indicators.
 */

import React, { useEffect, useState } from 'react';
import useLeadTimeTracking from '../hooks/useLeadTimeTracking';
import { VendorLeadTimeAnalysis } from '../services/leadTimeTrackingService';

interface VendorLeadTimeAnalysisCardProps {
  vendorId: string;
  vendorName?: string;
  compact?: boolean;
  showInsights?: boolean;
}

export const VendorLeadTimeAnalysisCard: React.FC<VendorLeadTimeAnalysisCardProps> = ({
  vendorId,
  vendorName,
  compact = false,
  showInsights = true
}) => {
  const { fetchVendorAnalysis, getVendorAnalysis, loading, error } = useLeadTimeTracking();
  const [analysis, setAnalysis] = useState<VendorLeadTimeAnalysis | null>(null);

  useEffect(() => {
    const cached = getVendorAnalysis(vendorId);
    if (cached) {
      setAnalysis(cached);
    } else {
      fetchVendorAnalysis(vendorId).then(data => {
        if (data) setAnalysis(data);
      });
    }
  }, [vendorId, fetchVendorAnalysis, getVendorAnalysis]);

  if (loading && !analysis) {
    return (
      <div className="p-4 bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-24"></div>
          <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-full"></div>
        </div>
      </div>
    );
  }

  if (error && !analysis) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
        <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
        <p className="text-gray-500 dark:text-gray-400 text-sm">No lead time data available</p>
      </div>
    );
  }

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'Low Risk':
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700';
      case 'Medium Risk':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700';
      case 'High Risk':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700';
      default:
        return 'bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-slate-600';
    }
  };

  const { metrics, leadTimeConfidenceScore, leadTimeRiskLevel, insights } = analysis;

  if (compact) {
    return (
      <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Lead Time</p>
            {vendorName && <p className="text-xs text-gray-500 dark:text-gray-400">{vendorName}</p>}
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${getRiskColor(leadTimeRiskLevel || '')}`}>
            {leadTimeConfidenceScore.toFixed(0)}%
          </div>
        </div>

        {metrics.avgLeadDays && (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Avg Lead</p>
              <p className="font-semibold text-gray-900 dark:text-white">{metrics.avgLeadDays.toFixed(1)} days</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">On-Time %</p>
              <p className={`font-semibold ${(metrics.onTimePercentage || 0) >= 80 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {(metrics.onTimePercentage || 0).toFixed(0)}%
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200 dark:border-slate-700">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Lead Time Performance</h3>
          {vendorName && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{vendorName}</p>}
        </div>
        <div className={`px-4 py-2 rounded-lg border font-semibold text-center ${getRiskColor(leadTimeRiskLevel || '')}`}>
          <div className="text-2xl font-bold">{leadTimeConfidenceScore.toFixed(0)}</div>
          <div className="text-xs mt-1">{leadTimeRiskLevel || 'Unknown'}</div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {metrics.avgLeadDays !== null && (
          <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Avg Lead Time</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{metrics.avgLeadDays.toFixed(1)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">days</p>
          </div>
        )}

        {metrics.medianLeadDays !== null && (
          <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Median Lead Time</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{metrics.medianLeadDays.toFixed(1)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">days</p>
          </div>
        )}

        {metrics.onTimePercentage !== null && (
          <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">On-Time Delivery</p>
            <p className={`text-2xl font-bold ${metrics.onTimePercentage >= 90 ? 'text-green-600 dark:text-green-400' : metrics.onTimePercentage >= 70 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
              {metrics.onTimePercentage.toFixed(0)}%
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">of deliveries</p>
          </div>
        )}

        {metrics.totalPosCompleted !== null && (
          <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Completed POs</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{metrics.totalPosCompleted}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">orders</p>
          </div>
        )}
      </div>

      {/* Variance & Predictability */}
      {metrics.stddevLeadDays !== null && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">Lead Time Consistency</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-blue-700 dark:text-blue-300 mb-1">Std Deviation</p>
              <p className="text-lg font-bold text-blue-900 dark:text-blue-100">{metrics.stddevLeadDays.toFixed(2)} days</p>
            </div>
            {metrics.minLeadDays !== null && metrics.maxLeadDays !== null && (
              <div>
                <p className="text-xs text-blue-700 dark:text-blue-300 mb-1">Range</p>
                <p className="text-lg font-bold text-blue-900 dark:text-blue-100">
                  {metrics.minLeadDays}-{metrics.maxLeadDays} days
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Insights */}
      {showInsights && insights && insights.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Insights</h4>
          <div className="space-y-2">
            {insights.map((insight, idx) => {
              const bgColor = insight.type === 'positive' 
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : insight.type === 'warning'
                ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
              
              const textColor = insight.type === 'positive'
                ? 'text-green-800 dark:text-green-200'
                : insight.type === 'warning'
                ? 'text-yellow-800 dark:text-yellow-200'
                : 'text-red-800 dark:text-red-200';

              return (
                <div key={idx} className={`p-3 rounded-lg border ${bgColor}`}>
                  <p className={`text-sm font-medium ${textColor}`}>{insight.message}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {insight.metric}: {insight.value}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="pt-4 border-t border-gray-200 dark:border-slate-700 text-xs text-gray-500 dark:text-gray-400">
        <p>Last calculated: {new Date(metrics.calculatedAt || new Date()).toLocaleDateString()}</p>
      </div>
    </div>
  );
};

export default VendorLeadTimeAnalysisCard;
