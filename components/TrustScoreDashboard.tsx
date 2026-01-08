/**
 * TrustScoreDashboard Component
 *
 * Displays agent performance metrics and progress toward "No Human Intervention"
 * Shows the 4 key metrics tracking autonomous system reliability
 */

import React, { useEffect, useState } from 'react';
import { getTrustScoreReport } from '../services/trustScoreAgent';

interface TrustScoreReport {
  period: string;
  overall_trust_score: number;
  metrics: {
    stockout_prevention_rate: number;
    touchless_po_rate: number;
    eta_accuracy_rate: number;
    capital_efficiency_score: number;
  };
  progress_toward_autonomy: number;
  recommendations: string[];
}

export default function TrustScoreDashboard() {
  const [report, setReport] = useState<TrustScoreReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'today' | '7days' | '30days'>('7days');

  useEffect(() => {
    loadReport();
  }, [timeRange]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const endDate = new Date().toISOString().split('T')[0];
      let startDate: string;

      if (timeRange === 'today') {
        startDate = endDate;
      } else if (timeRange === '7days') {
        const date = new Date();
        date.setDate(date.getDate() - 7);
        startDate = date.toISOString().split('T')[0];
      } else {
        const date = new Date();
        date.setDate(date.getDate() - 30);
        startDate = date.toISOString().split('T')[0];
      }

      const data = await getTrustScoreReport(startDate, endDate);
      setReport(data);
    } catch (error) {
      console.error('Failed to load trust score:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-24 bg-gray-200 rounded mb-4"></div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <h3 className="text-yellow-800 font-semibold">No Data Available</h3>
        <p className="text-yellow-600 text-sm mt-1">
          Trust Score data will be available after the first nightly scan runs.
        </p>
      </div>
    );
  }

  const getTrustScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-50 border-green-500';
    if (score >= 70) return 'text-yellow-600 bg-yellow-50 border-yellow-500';
    return 'text-red-600 bg-red-50 border-red-500';
  };

  const getMetricColor = (value: number, target: number) => {
    if (value >= target) return 'text-green-600';
    if (value >= target * 0.8) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Header with Time Range Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">🤖 Agent Trust Score</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setTimeRange('today')}
            className={`px-3 py-1 rounded text-sm font-medium ${
              timeRange === 'today'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setTimeRange('7days')}
            className={`px-3 py-1 rounded text-sm font-medium ${
              timeRange === '7days'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            7 Days
          </button>
          <button
            onClick={() => setTimeRange('30days')}
            className={`px-3 py-1 rounded text-sm font-medium ${
              timeRange === '30days'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            30 Days
          </button>
        </div>
      </div>

      {/* Overall Trust Score */}
      <div className={`rounded-lg border-4 p-8 ${getTrustScoreColor(report.overall_trust_score)}`}>
        <div className="text-center">
          <div className="text-6xl font-bold mb-2">{report.overall_trust_score}</div>
          <div className="text-lg font-medium mb-1">Overall Trust Score</div>
          <div className="text-sm opacity-75">{report.period}</div>
        </div>
        <div className="mt-4 pt-4 border-t border-current opacity-75">
          <div className="flex items-center justify-center gap-2">
            <div className="text-sm font-medium">Progress Toward Full Autonomy:</div>
            <div className="text-2xl font-bold">{report.progress_toward_autonomy}%</div>
          </div>
          <div className="w-full bg-white bg-opacity-30 rounded-full h-3 mt-2">
            <div
              className="bg-current h-3 rounded-full transition-all duration-500"
              style={{ width: `${report.progress_toward_autonomy}%` }}
            />
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stockout Prevention */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Stockout Prevention</h3>
            <span className="text-2xl">🎯</span>
          </div>
          <div className={`text-4xl font-bold mb-2 ${getMetricColor(report.metrics.stockout_prevention_rate, 100)}`}>
            {report.metrics.stockout_prevention_rate.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500 mb-2">Target: 100%</div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                report.metrics.stockout_prevention_rate >= 100 ? 'bg-green-500' :
                report.metrics.stockout_prevention_rate >= 90 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(100, report.metrics.stockout_prevention_rate)}%` }}
            />
          </div>
          <p className="text-xs text-gray-600 mt-2">Did agent order before run-out date?</p>
        </div>

        {/* Touchless PO Rate */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Touchless POs</h3>
            <span className="text-2xl">🤖</span>
          </div>
          <div className={`text-4xl font-bold mb-2 ${getMetricColor(report.metrics.touchless_po_rate, 95)}`}>
            {report.metrics.touchless_po_rate.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500 mb-2">Target: &gt;95%</div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                report.metrics.touchless_po_rate >= 95 ? 'bg-green-500' :
                report.metrics.touchless_po_rate >= 80 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(100, report.metrics.touchless_po_rate)}%` }}
            />
          </div>
          <p className="text-xs text-gray-600 mt-2">% of POs sent without human editing</p>
        </div>

        {/* ETA Accuracy */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">ETA Accuracy</h3>
            <span className="text-2xl">📅</span>
          </div>
          <div className={`text-4xl font-bold mb-2 ${getMetricColor(report.metrics.eta_accuracy_rate, 90)}`}>
            {report.metrics.eta_accuracy_rate.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500 mb-2">Target: ±1 day</div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                report.metrics.eta_accuracy_rate >= 90 ? 'bg-green-500' :
                report.metrics.eta_accuracy_rate >= 70 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(100, report.metrics.eta_accuracy_rate)}%` }}
            />
          </div>
          <p className="text-xs text-gray-600 mt-2">Predicted vs actual arrival accuracy</p>
        </div>

        {/* Capital Efficiency */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Capital Efficiency</h3>
            <span className="text-2xl">💰</span>
          </div>
          <div className={`text-4xl font-bold mb-2 ${getMetricColor(report.metrics.capital_efficiency_score, 70)}`}>
            {report.metrics.capital_efficiency_score.toFixed(0)}
          </div>
          <div className="text-xs text-gray-500 mb-2">Target: Steady/Decreasing</div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                report.metrics.capital_efficiency_score >= 80 ? 'bg-green-500' :
                report.metrics.capital_efficiency_score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(100, report.metrics.capital_efficiency_score)}%` }}
            />
          </div>
          <p className="text-xs text-gray-600 mt-2">Days Sales of Inventory optimization</p>
        </div>
      </div>

      {/* Recommendations */}
      {report.recommendations.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">Recommendations</h3>
          <ul className="space-y-2">
            {report.recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-blue-800">
                <span className="text-blue-600 mt-0.5">•</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Info Footer */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
        <p className="text-xs text-gray-600">
          <strong>Trust Score</strong> measures the system's progress toward <strong>"No Human Intervention"</strong>.
          Higher scores indicate more reliable autonomous operation.
        </p>
      </div>
    </div>
  );
}
