import Button from '@/components/ui/Button';
// Enhanced Regulatory Compliance: Compliance Detail Modal
// Shows detailed compliance issues for a specific BOM

import React from 'react';
import type { BillOfMaterials } from '../types';
import type { ComplianceStatus, ComplianceIssue, ComplianceRiskLevel } from '../types/regulatory';
import { CloseIcon, ExclamationCircleIcon, CheckCircleIcon, LinkIcon } from './icons';

interface ComplianceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  bom: BillOfMaterials | null;
  status: ComplianceStatus | null;
  onDraftLetter?: (issue: ComplianceIssue) => void;
}

const ComplianceDetailModal: React.FC<ComplianceDetailModalProps> = ({
  isOpen,
  onClose,
  bom,
  status,
  onDraftLetter,
}) => {
  if (!isOpen || !bom || !status) return null;

  const getRiskColor = (risk: ComplianceRiskLevel): string => {
    switch (risk) {
      case 'clear':
        return 'text-green-400 bg-green-500/20';
      case 'low':
        return 'text-blue-400 bg-blue-500/20';
      case 'medium':
        return 'text-yellow-400 bg-yellow-500/20';
      case 'high':
        return 'text-orange-400 bg-orange-500/20';
      case 'critical':
        return 'text-red-400 bg-red-500/20';
      default:
        return 'text-gray-400 bg-gray-500/20';
    }
  };

  const getRiskLabel = (risk: ComplianceRiskLevel): string => {
    return risk.charAt(0).toUpperCase() + risk.slice(1);
  };

  const getStateName = (abbr: string): string => {
    const stateNames: Record<string, string> = {
      CA: 'California',
      OR: 'Oregon',
      WA: 'Washington',
      NY: 'New York',
      VT: 'Vermont',
      ME: 'Maine',
      TX: 'Texas',
      FL: 'Florida',
      CO: 'Colorado',
      AZ: 'Arizona',
    };
    return stateNames[abbr] || abbr;
  };

  // Group issues by state
  const issuesByState = status.issues.reduce((acc, issue) => {
    if (!acc[issue.state]) {
      acc[issue.state] = [];
    }
    acc[issue.state].push(issue);
    return acc;
  }, {} as Record<string, ComplianceIssue[]>);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-gray-900 rounded-lg shadow-2xl border border-gray-700 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start p-6 border-b border-gray-700 bg-gray-800/50">
          <div>
            <h2 className="text-2xl font-bold text-white">{bom.name}</h2>
            <p className="text-gray-400 mt-1">SKU: {bom.finishedSku}</p>
            <div className="flex items-center gap-4 mt-3">
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getRiskColor(status.overallRisk)}`}>
                {getRiskLabel(status.overallRisk)} Risk
              </span>
              <span className="text-gray-400 text-sm">
                {status.issueCount} {status.issueCount === 1 ? 'issue' : 'issues'} found
              </span>
              <span className="text-gray-400 text-sm">
                Scanned: {new Date(status.lastScanDate).toLocaleDateString()}
              </span>
            </div>
          </div>
          <Button
            onClick={onClose}
            className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          >
            <CloseIcon className="w-6 h-6" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* No Issues - All Clear */}
          {status.issueCount === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircleIcon className="w-16 h-16 text-green-400 mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">All Clear!</h3>
              <p className="text-gray-400 text-center max-w-md">
                No compliance issues detected for this product across the scanned states.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {status.statesScanned.map(state => (
                  <span key={state} className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">
                    {state}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Issues by State */}
          {Object.keys(issuesByState).length > 0 && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-white">Compliance Issues by State</h3>

              {Object.entries(issuesByState).map(([state, issues]: [string, ComplianceIssue[]]) => (
                <div key={state} className="bg-gray-800/50 rounded-lg p-5 border border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-md font-semibold text-white">
                      {getStateName(state)} ({state})
                    </h4>
                    <span className="text-gray-400 text-sm">
                      {issues.length} {issues.length === 1 ? 'issue' : 'issues'}
                    </span>
                  </div>

                  <div className="space-y-4">
                    {issues.map((issue, idx) => (
                      <div key={idx} className="bg-gray-900/50 rounded-md p-4 border border-gray-700/50">
                        {/* Issue Header */}
                        <div className="flex items-start gap-3 mb-3">
                          <ExclamationCircleIcon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${getRiskColor(issue.riskLevel).split(' ')[0]}`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-white">{issue.ingredient}</span>
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getRiskColor(issue.riskLevel)}`}>
                                {getRiskLabel(issue.riskLevel)}
                              </span>
                            </div>
                            <p className="text-gray-300 text-sm">{issue.issue}</p>
                          </div>
                        </div>

                        {/* Recommendation */}
                        <div className="ml-8 space-y-2">
                          <div className="bg-accent-500/10 border border-accent-500/30 rounded-md p-3">
                            <p className="text-xs text-accent-300 font-semibold mb-1">RECOMMENDED ACTION</p>
                            <p className="text-sm text-gray-300">{issue.recommendation}</p>
                          </div>

                          {/* Regulation URL */}
                          {issue.regulationUrl && (
                            <a
                              href={issue.regulationUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-accent-400 hover:text-accent-300"
                            >
                              <LinkIcon className="w-4 h-4" />
                              View Regulation
                            </a>
                          )}

                          {/* Draft Letter Button */}
                          {onDraftLetter && (
                            <Button
                              onClick={() => onDraftLetter(issue)}
                              className="text-sm text-gray-400 hover:text-white underline"
                            >
                              Draft compliance letter →
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Ingredients List */}
          <div className="bg-gray-800/50 rounded-lg p-5 border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-3">Product Ingredients</h3>
            <div className="flex flex-wrap gap-2">
              {bom.components.map(component => (
                <span
                  key={component.sku}
                  className="px-3 py-1 bg-gray-900/50 text-gray-300 rounded-md text-sm"
                >
                  {component.name}
                </span>
              ))}
            </div>
          </div>

          {/* Disclaimer */}
          <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4">
            <p className="text-yellow-300 text-sm">
              <strong>Disclaimer:</strong> This compliance scan is AI-generated and should not be considered legal advice.
              Always consult with a qualified attorney or regulatory expert before making compliance decisions.
              Regulations change frequently - verify current requirements with state agriculture departments.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700 bg-gray-800/50 flex justify-between items-center">
          <p className="text-gray-400 text-sm">
            Last scanned: {new Date(status.lastScanDate).toLocaleString()} •
            Expires: {new Date(status.expiresAt).toLocaleDateString()}
          </p>
          <Button
            onClick={onClose}
            className="bg-gray-700 text-white px-4 py-2 rounded-md hover:bg-gray-600 transition-colors"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ComplianceDetailModal;
