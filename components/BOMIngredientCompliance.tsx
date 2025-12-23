/**
 * BOM Ingredient Compliance Component
 *
 * Displays ingredient-level compliance status and SDS documents for BOM components.
 * Shows state-by-state compliance, hazard classifications, and links to SDS documents.
 */

import React, { useState, useMemo } from 'react';
import Button from '@/components/ui/Button';
import { useBOMIngredientCompliance, type BOMComplianceData, type IngredientSDSDisplay, type IngredientComplianceDisplay } from '../hooks/useSupabaseData';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  XCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  BeakerIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  ShieldCheckIcon,
  AlertTriangleIcon,
} from './icons';

interface BOMIngredientComplianceProps {
  bomId: string;
  components: Array<{ sku: string; name: string }>;
  targetStates?: string[];
}

const PRIORITY_STATES = ['CA', 'OR', 'WA', 'TX', 'NM', 'NY'];

const BOMIngredientCompliance: React.FC<BOMIngredientComplianceProps> = ({
  bomId,
  components,
  targetStates = PRIORITY_STATES,
}) => {
  const componentSkus = useMemo(() => components.map(c => c.sku), [components]);
  const { data: complianceData, loading, error, refetch } = useBOMIngredientCompliance(
    bomId,
    componentSkus,
    targetStates
  );

  const [expandedComponent, setExpandedComponent] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-400"></div>
        <span className="ml-3 text-gray-400">Loading compliance data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <XCircleIcon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-400 font-medium">Failed to load compliance data</p>
            <p className="text-gray-400 text-sm mt-1">{error.message}</p>
            <Button
              onClick={() => refetch()}
              className="mt-3 px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded"
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!complianceData || complianceData.components.length === 0) {
    return (
      <div className="bg-gray-800/30 rounded-lg border-2 border-dashed border-gray-700 p-8 text-center">
        <BeakerIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <h4 className="text-lg font-medium text-gray-400 mb-2">No Compliance Data Available</h4>
        <p className="text-sm text-gray-500 mb-4">
          Compliance information for these ingredients hasn't been researched yet.
          The Ingredient Compliance Agent can populate this data automatically.
        </p>
      </div>
    );
  }

  const { summary } = complianceData;

  const getComplianceStatusBadge = (status: string) => {
    switch (status) {
      case 'compliant':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-300 border border-green-700">
            <CheckCircleIcon className="w-3 h-3" />
            Compliant
          </span>
        );
      case 'restricted':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-900/30 text-yellow-300 border border-yellow-700">
            <ExclamationCircleIcon className="w-3 h-3" />
            Restricted
          </span>
        );
      case 'prohibited':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/30 text-red-300 border border-red-700">
            <XCircleIcon className="w-3 h-3" />
            Prohibited
          </span>
        );
      case 'conditional':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-900/30 text-orange-300 border border-orange-700">
            <AlertTriangleIcon className="w-3 h-3" />
            Conditional
          </span>
        );
      case 'pending_review':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-900/30 text-blue-300 border border-blue-700">
            <ClockIcon className="w-3 h-3" />
            Pending Review
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-700 text-gray-300 border border-gray-600">
            <ClockIcon className="w-3 h-3" />
            Unknown
          </span>
        );
    }
  };

  const getOverallStatus = (compliance: IngredientComplianceDisplay[]) => {
    if (compliance.length === 0) return 'unknown';
    const statuses = compliance.map(c => c.complianceStatus);
    if (statuses.includes('prohibited')) return 'prohibited';
    if (statuses.includes('restricted')) return 'restricted';
    if (statuses.includes('conditional')) return 'conditional';
    if (statuses.includes('pending_review')) return 'pending_review';
    if (statuses.every(s => s === 'compliant')) return 'compliant';
    return 'unknown';
  };

  const renderSDSInfo = (sds: IngredientSDSDisplay) => (
    <div className="bg-gray-900/50 rounded-lg p-4 mt-3">
      <div className="flex items-center justify-between mb-3">
        <h5 className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <DocumentTextIcon className="w-4 h-4 text-accent-400" />
          Safety Data Sheet
        </h5>
        {sds.sdsUrl && (
          <a
            href={sds.sdsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300"
          >
            View SDS
            <ExternalLinkIcon className="w-3 h-3" />
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {sds.manufacturerName && (
          <div>
            <span className="text-gray-500">Manufacturer:</span>
            <span className="text-white ml-2">{sds.manufacturerName}</span>
          </div>
        )}
        {sds.casNumber && (
          <div>
            <span className="text-gray-500">CAS #:</span>
            <span className="text-white ml-2 font-mono">{sds.casNumber}</span>
          </div>
        )}
        {sds.revisionDate && (
          <div>
            <span className="text-gray-500">Revision:</span>
            <span className="text-white ml-2">{new Date(sds.revisionDate).toLocaleDateString()}</span>
          </div>
        )}
        {sds.sdsExpirationDate && (
          <div>
            <span className="text-gray-500">Expires:</span>
            <span className={`ml-2 ${new Date(sds.sdsExpirationDate) < new Date() ? 'text-red-400' : 'text-white'}`}>
              {new Date(sds.sdsExpirationDate).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>

      {/* GHS Hazard Information */}
      {(sds.signalWord || sds.ghsHazardCodes.length > 0) && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangleIcon className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-medium text-gray-300">GHS Hazard Classification</span>
          </div>

          {sds.signalWord && (
            <div className={`inline-block px-2 py-0.5 rounded text-xs font-bold mb-2 ${
              sds.signalWord.toLowerCase() === 'danger'
                ? 'bg-red-900/50 text-red-300 border border-red-700'
                : 'bg-yellow-900/50 text-yellow-300 border border-yellow-700'
            }`}>
              {sds.signalWord.toUpperCase()}
            </div>
          )}

          {sds.ghsHazardCodes.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {sds.ghsHazardCodes.map((code, idx) => (
                <span key={idx} className="px-1.5 py-0.5 bg-gray-700 text-gray-300 text-xs rounded font-mono">
                  {code}
                </span>
              ))}
            </div>
          )}

          {sds.hazardStatements.length > 0 && (
            <ul className="mt-2 text-xs text-gray-400 space-y-1">
              {sds.hazardStatements.slice(0, 3).map((statement, idx) => (
                <li key={idx}>• {statement}</li>
              ))}
              {sds.hazardStatements.length > 3 && (
                <li className="text-gray-500 italic">...and {sds.hazardStatements.length - 3} more</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );

  const renderComplianceByState = (compliance: IngredientComplianceDisplay[]) => {
    if (compliance.length === 0) {
      return (
        <p className="text-sm text-gray-500 italic mt-2">
          No state compliance data available. Run the Ingredient Compliance Agent to research regulations.
        </p>
      );
    }

    const filteredCompliance = selectedState
      ? compliance.filter(c => c.stateCode === selectedState)
      : compliance;

    return (
      <div className="mt-3 space-y-2">
        {/* State filter */}
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setSelectedState(null)}
            className={`px-2 py-1 text-xs rounded ${
              !selectedState ? 'bg-accent-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            All States
          </button>
          {targetStates.map(state => {
            const hasData = compliance.some(c => c.stateCode === state);
            return (
              <button
                key={state}
                onClick={() => setSelectedState(state)}
                className={`px-2 py-1 text-xs rounded ${
                  selectedState === state
                    ? 'bg-accent-600 text-white'
                    : hasData
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                }`}
                disabled={!hasData}
              >
                {state}
              </button>
            );
          })}
        </div>

        {/* Compliance details by state */}
        <div className="space-y-2">
          {filteredCompliance.map((comp, idx) => (
            <div key={idx} className="bg-gray-900/30 rounded p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">{comp.stateCode}</span>
                {getComplianceStatusBadge(comp.complianceStatus)}
              </div>

              {comp.restrictionDetails && (
                <p className="text-xs text-gray-400 mt-1">{comp.restrictionDetails}</p>
              )}

              <div className="flex gap-4 mt-2 text-xs text-gray-500">
                {comp.maxConcentration !== null && (
                  <span>Max: {comp.maxConcentration}%</span>
                )}
                {comp.regulationCode && (
                  <span className="font-mono">{comp.regulationCode}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <BeakerIcon className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-400">Components</span>
          </div>
          <p className="text-2xl font-semibold text-white">{summary.totalComponents}</p>
        </div>

        <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <DocumentTextIcon className="w-5 h-5 text-accent-400" />
            <span className="text-sm text-gray-400">With SDS</span>
          </div>
          <p className="text-2xl font-semibold text-white">
            {summary.componentsWithSDS}
            <span className="text-sm text-gray-500 font-normal ml-1">
              / {summary.totalComponents}
            </span>
          </p>
        </div>

        <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircleIcon className="w-5 h-5 text-green-400" />
            <span className="text-sm text-gray-400">Compliant</span>
          </div>
          <p className="text-2xl font-semibold text-green-400">{summary.compliantCount}</p>
        </div>

        <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <ExclamationCircleIcon className="w-5 h-5 text-yellow-400" />
            <span className="text-sm text-gray-400">Flagged</span>
          </div>
          <p className="text-2xl font-semibold text-yellow-400">
            {summary.prohibitedCount + summary.restrictedCount}
          </p>
        </div>
      </div>

      {/* Alert for prohibited ingredients */}
      {summary.prohibitedCount > 0 && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <XCircleIcon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-400 font-medium">
                {summary.prohibitedCount} ingredient(s) prohibited in one or more states
              </p>
              <p className="text-gray-400 text-sm mt-1">
                Review the details below and consider reformulation or state-specific labeling.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Component List */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-400 uppercase">Ingredient Compliance Details</h4>

        {complianceData.components.map((component) => {
          const isExpanded = expandedComponent === component.sku;
          const overallStatus = getOverallStatus(component.compliance);

          return (
            <div key={component.sku} className="bg-gray-800/30 rounded-lg border border-gray-700 overflow-hidden">
              <button
                onClick={() => setExpandedComponent(isExpanded ? null : component.sku)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                  )}
                  <div className="text-left">
                    <p className="text-sm font-medium text-white">{component.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{component.sku}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {component.sds && (
                    <span className="flex items-center gap-1 text-xs text-accent-400">
                      <DocumentTextIcon className="w-4 h-4" />
                      SDS
                    </span>
                  )}
                  {getComplianceStatusBadge(overallStatus)}
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-700">
                  {/* SDS Information */}
                  {component.sds ? (
                    renderSDSInfo(component.sds)
                  ) : (
                    <div className="bg-gray-900/30 rounded-lg p-4 mt-3">
                      <div className="flex items-center gap-2 text-gray-500">
                        <DocumentTextIcon className="w-4 h-4" />
                        <span className="text-sm">No SDS document on file</span>
                      </div>
                    </div>
                  )}

                  {/* State Compliance */}
                  <div className="mt-4">
                    <h5 className="text-sm font-medium text-gray-300 flex items-center gap-2 mb-2">
                      <ShieldCheckIcon className="w-4 h-4 text-accent-400" />
                      State-by-State Compliance
                    </h5>
                    {renderComplianceByState(component.compliance)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="text-xs text-gray-500 text-center">
        Compliance data is researched using the Ingredient Compliance Agent with Perplexity AI.
        Last checked states: {targetStates.join(', ')}
      </p>
    </div>
  );
};

export default BOMIngredientCompliance;
