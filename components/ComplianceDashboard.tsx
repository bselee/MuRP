// Enhanced Regulatory Compliance: Compliance Dashboard
// Visual dashboard showing compliance status across all BOMs

import React, { useState, useEffect } from 'react';
import type { BillOfMaterials, WatchlistItem } from '../types';
import type { ComplianceStatus, ComplianceDashboardStats, ComplianceRiskLevel } from '../types/regulatory';
import {
  scanAllBOMs,
  generateComplianceDashboardStats,
  getAllComplianceStatuses,
} from '../services/proactiveComplianceScanner';
import {
  ExclamationCircleIcon,
  CheckCircleIcon,
  ChartBarIcon,
  RefreshIcon,
  FlagIcon,
} from './icons';

interface ComplianceDashboardProps {
  boms: BillOfMaterials[];
  watchlist: WatchlistItem[];
  onViewDetails: (bom: BillOfMaterials, status: ComplianceStatus) => void;
}

const ComplianceDashboard: React.FC<ComplianceDashboardProps> = ({ boms, watchlist, onViewDetails }) => {
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [stats, setStats] = useState<ComplianceDashboardStats | null>(null);
  const [statuses, setStatuses] = useState<Map<string, ComplianceStatus>>(new Map());

  // Load initial data
  useEffect(() => {
    updateStats();
  }, [boms]);

  const updateStats = () => {
    const currentStats = generateComplianceDashboardStats(boms);
    const currentStatuses = getAllComplianceStatuses();
    setStats(currentStats);
    setStatuses(currentStatuses);
  };

  const handleScanAll = async () => {
    setScanning(true);
    setScanProgress({ current: 0, total: boms.length });

    try {
      await scanAllBOMs(boms, watchlist, undefined, (current, total) => {
        setScanProgress({ current, total });
      });

      updateStats();
    } catch (error) {
      console.error('[Compliance Dashboard] Scan failed:', error);
    } finally {
      setScanning(false);
      setScanProgress({ current: 0, total: 0 });
    }
  };

  const getRiskColor = (risk: ComplianceRiskLevel): string => {
    switch (risk) {
      case 'clear':
        return 'bg-green-500/20 border-green-500/50 text-green-400';
      case 'low':
        return 'bg-blue-500/20 border-blue-500/50 text-blue-400';
      case 'medium':
        return 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400';
      case 'high':
        return 'bg-orange-500/20 border-orange-500/50 text-orange-400';
      case 'critical':
        return 'bg-red-500/20 border-red-500/50 text-red-400';
      default:
        return 'bg-gray-500/20 border-gray-500/50 text-gray-400';
    }
  };

  const getRiskIcon = (risk: ComplianceRiskLevel) => {
    if (risk === 'clear') {
      return <CheckCircleIcon className="w-5 h-5" />;
    }
    return <ExclamationCircleIcon className="w-5 h-5" />;
  };

  const getRiskLabel = (risk: ComplianceRiskLevel): string => {
    return risk.charAt(0).toUpperCase() + risk.slice(1);
  };

  if (!stats) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-400">Loading compliance data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Scan Button */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <FlagIcon className="w-7 h-7 text-indigo-400" />
            Compliance Dashboard
          </h2>
          <p className="text-gray-400 mt-1">
            Proactive regulatory compliance monitoring across all products
          </p>
        </div>
        <button
          onClick={handleScanAll}
          disabled={scanning}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshIcon className={`w-5 h-5 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? `Scanning ${scanProgress.current}/${scanProgress.total}...` : 'Scan All BOMs'}
        </button>
      </div>

      {/* Stats Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm mb-1">Total Products</p>
          <p className="text-3xl font-bold text-white">{stats.totalBOMs}</p>
        </div>
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm mb-1">Scanned</p>
          <p className="text-3xl font-bold text-green-400">{stats.scannedBOMs}</p>
        </div>
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm mb-1">Issues Found</p>
          <p className="text-3xl font-bold text-orange-400">
            {stats.highRiskBOMs + stats.criticalRiskBOMs + stats.mediumRiskBOMs}
          </p>
        </div>
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm mb-1">Not Scanned</p>
          <p className="text-3xl font-bold text-gray-400">{stats.unknownBOMs}</p>
        </div>
      </div>

      {/* Risk Distribution */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <ChartBarIcon className="w-5 h-5 text-indigo-400" />
          Risk Distribution
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { level: 'clear' as ComplianceRiskLevel, count: stats.clearBOMs, label: 'Clear' },
            { level: 'low' as ComplianceRiskLevel, count: stats.lowRiskBOMs, label: 'Low' },
            { level: 'medium' as ComplianceRiskLevel, count: stats.mediumRiskBOMs, label: 'Medium' },
            { level: 'high' as ComplianceRiskLevel, count: stats.highRiskBOMs, label: 'High' },
            { level: 'critical' as ComplianceRiskLevel, count: stats.criticalRiskBOMs, label: 'Critical' },
            { level: 'unknown' as ComplianceRiskLevel, count: stats.unknownBOMs, label: 'Unknown' },
          ].map(({ level, count, label }) => (
            <div
              key={level}
              className={`p-3 rounded-md border ${getRiskColor(level)}`}
            >
              <div className="flex items-center justify-between mb-1">
                {getRiskIcon(level)}
                <span className="text-2xl font-bold">{count}</span>
              </div>
              <p className="text-sm">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Top Issues Insights */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Flagged Ingredients */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Top Flagged Ingredients</h3>
          {stats.topIngredients.length > 0 ? (
            <div className="space-y-2">
              {stats.topIngredients.map(({ ingredient, issueCount }) => (
                <div key={ingredient} className="flex justify-between items-center p-2 bg-gray-900/50 rounded-md">
                  <span className="text-gray-300">{ingredient}</span>
                  <span className="text-orange-400 font-semibold">{issueCount} issues</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No issues detected yet. Run a scan to see results.</p>
          )}
        </div>

        {/* Top Problem States */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">States with Most Restrictions</h3>
          {stats.topStates.length > 0 ? (
            <div className="space-y-2">
              {stats.topStates.map(({ state, issueCount }) => (
                <div key={state} className="flex justify-between items-center p-2 bg-gray-900/50 rounded-md">
                  <span className="text-gray-300 font-mono">{state}</span>
                  <span className="text-red-400 font-semibold">{issueCount} issues</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No issues detected yet. Run a scan to see results.</p>
          )}
        </div>
      </div>

      {/* Product List with Compliance Status */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Products & Compliance Status</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {boms.map(bom => {
            const status = statuses.get(bom.id);
            const risk = status?.overallRisk || 'unknown';

            return (
              <div
                key={bom.id}
                className="flex justify-between items-center p-3 bg-gray-900/50 rounded-md hover:bg-gray-900/70 transition-colors cursor-pointer"
                onClick={() => status && onViewDetails(bom, status)}
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className={`w-3 h-3 rounded-full ${getRiskColor(risk).split(' ')[0].replace('/20', '')}`} />
                  <div>
                    <p className="text-white font-medium">{bom.name}</p>
                    <p className="text-gray-500 text-xs">{bom.finishedSku}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {status && (
                    <>
                      <span className="text-gray-400 text-sm">
                        {status.issueCount} issues
                      </span>
                      <span className="text-gray-500 text-xs">
                        {status.statesScanned.length} states
                      </span>
                    </>
                  )}
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getRiskColor(risk)}`}>
                    {getRiskLabel(risk)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ComplianceDashboard;
