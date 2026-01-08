/**
 * ComplianceRiskCard Component
 *
 * Renders compliance check results in a visual, actionable format
 * Replaces stringified JSON output with a beautiful UI
 */

import React from 'react';

interface ComplianceIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  state: string;
  category: string;
  issue: string;
  regulation_code?: string;
  regulation_text?: string;
  recommendation: string;
}

interface ComplianceResult {
  success: boolean;
  check_id?: string;
  overall_status: 'pass' | 'warning' | 'fail';
  compliance_score: number;
  risk_level: 'critical' | 'high' | 'medium' | 'low';
  violations: ComplianceIssue[];
  warnings: ComplianceIssue[];
  recommendations: ComplianceIssue[];
  regulations_checked: number;
  states_checked: string[];
}

interface Props {
  result: ComplianceResult;
  productName?: string;
  onViewDetails?: (checkId: string) => void;
  onFixIssue?: (issue: ComplianceIssue) => void;
}

export default function ComplianceRiskCard({ result, productName, onViewDetails, onFixIssue }: Props) {
  if (!result || !result.success) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-semibold">Compliance Check Failed</h3>
        <p className="text-red-600 text-sm mt-1">Unable to complete compliance analysis.</p>
      </div>
    );
  }

  // Determine overall color scheme based on status
  const statusColors = {
    pass: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-800',
      badge: 'bg-green-100 text-green-800',
    },
    warning: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-800',
      badge: 'bg-yellow-100 text-yellow-800',
    },
    fail: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-800',
      badge: 'bg-red-100 text-red-800',
    },
  };

  const colors = statusColors[result.overall_status];

  const riskColors = {
    critical: 'text-red-600 bg-red-100',
    high: 'text-orange-600 bg-orange-100',
    medium: 'text-yellow-600 bg-yellow-100',
    low: 'text-blue-600 bg-blue-100',
  };

  const severityIcons = {
    critical: '',
    high: '',
    medium: '',
    low: '',
  };

  return (
    <div className={`${colors.bg} border ${colors.border} rounded-lg p-6 shadow-sm`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className={`text-xl font-bold ${colors.text}`}>
              {result.overall_status === 'pass' ? 'Compliant' :
               result.overall_status === 'warning' ? 'Review Needed' :
               'Non-Compliant'}
            </h3>
            <span className={`px-2 py-1 rounded text-xs font-semibold ${riskColors[result.risk_level]}`}>
              {result.risk_level.toUpperCase()} RISK
            </span>
          </div>
          {productName && (
            <p className="text-gray-600 text-sm">Product: {productName}</p>
          )}
          <p className="text-gray-500 text-xs mt-1">
            Checked {result.regulations_checked} regulations across {result.states_checked.join(', ')}
          </p>
        </div>

        {/* Compliance Score Circle */}
        <div className="flex flex-col items-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center border-4 ${
            result.compliance_score >= 90 ? 'border-green-500 bg-green-50' :
            result.compliance_score >= 70 ? 'border-yellow-500 bg-yellow-50' :
            'border-red-500 bg-red-50'
          }`}>
            <span className={`text-2xl font-bold ${
              result.compliance_score >= 90 ? 'text-green-700' :
              result.compliance_score >= 70 ? 'text-yellow-700' :
              'text-red-700'
            }`}>
              {result.compliance_score}
            </span>
          </div>
          <span className="text-xs text-gray-500 mt-1">Score</span>
        </div>
      </div>

      {/* Violations */}
      {result.violations.length > 0 && (
        <div className="mb-4">
          <h4 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
            Violations ({result.violations.length})
          </h4>
          <div className="space-y-2">
            {result.violations.map((violation, idx) => (
              <div key={idx} className="bg-white border border-red-200 rounded p-3">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{severityIcons[violation.severity]}</span>
                    <span className="font-semibold text-gray-800">{violation.state}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${riskColors[violation.severity]}`}>
                      {violation.severity.toUpperCase()}
                    </span>
                  </div>
                  {violation.regulation_code && (
                    <span className="text-xs text-gray-500">{violation.regulation_code}</span>
                  )}
                </div>
                <p className="text-sm text-gray-700 mb-2">{violation.issue}</p>
                <div className="bg-blue-50 border-l-4 border-blue-400 p-2 text-sm">
                  <span className="font-semibold text-blue-800">Fix: </span>
                  <span className="text-blue-700">{violation.recommendation}</span>
                </div>
                {onFixIssue && (
                  <button
                    onClick={() => onFixIssue(violation)}
                    className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    → Create Task to Fix
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="mb-4">
          <h4 className="font-semibold text-yellow-800 mb-2 flex items-center gap-2">
            Warnings ({result.warnings.length})
          </h4>
          <div className="space-y-2">
            {result.warnings.map((warning, idx) => (
              <div key={idx} className="bg-white border border-yellow-200 rounded p-3">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{severityIcons[warning.severity]}</span>
                    <span className="font-semibold text-gray-800">{warning.state}</span>
                  </div>
                </div>
                <p className="text-sm text-gray-700 mb-1">{warning.issue}</p>
                <p className="text-xs text-gray-600 italic">{warning.recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {result.recommendations.length > 0 && (
        <div>
          <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
            Recommendations ({result.recommendations.length})
          </h4>
          <div className="space-y-1">
            {result.recommendations.map((rec, idx) => (
              <div key={idx} className="bg-white border border-blue-100 rounded p-2 text-sm">
                <p className="text-gray-700">{rec.issue}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {result.check_id && onViewDetails && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <button
            onClick={() => onViewDetails(result.check_id!)}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            → View Full Compliance Report
          </button>
        </div>
      )}

      {/* Success Message */}
      {result.overall_status === 'pass' && result.violations.length === 0 && result.warnings.length === 0 && (
        <div className="bg-white border border-green-200 rounded p-4 text-center">
          <p className="text-green-700 font-semibold">🎉 All checks passed!</p>
          <p className="text-sm text-green-600 mt-1">
            Your label is compliant with all regulations in {result.states_checked.join(', ')}
          </p>
        </div>
      )}
    </div>
  );
}
