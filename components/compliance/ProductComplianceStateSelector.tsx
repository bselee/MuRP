/**
 * Product Compliance State Selector Component
 *
 * Allows selecting and managing compliance states for a specific product,
 * with compliance status tracking per state.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import {
  getStateSelectionOptions,
  setProductStateCompliance,
  bulkSetProductStates,
  getProductComplianceSummary,
} from '@/services/complianceDocumentService';
import type {
  StateSelectionOption,
  ComplianceStatus,
  ProductComplianceSummary,
} from '@/types/complianceDocuments';

interface ProductComplianceStateSelectorProps {
  sku?: string;
  bomId?: string;
  productGroup?: string;
  onStatesChange?: (states: string[]) => void;
  readOnly?: boolean;
}

const STRICTNESS_COLORS = {
  'Very Strict': 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700',
  Strict: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900 dark:text-orange-200 dark:border-orange-700',
  Moderate: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-700',
  Lenient: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200 dark:border-green-700',
  'Very Lenient': 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700',
};

const STRICTNESS_BADGES = {
  'Very Strict': '5',
  Strict: '4',
  Moderate: '3',
  Lenient: '2',
  'Very Lenient': '1',
};

const COMPLIANCE_STATUS_COLORS: Record<ComplianceStatus, string> = {
  unknown: 'bg-gray-600',
  compliant: 'bg-green-600',
  pending: 'bg-yellow-600',
  needs_attention: 'bg-orange-600',
  non_compliant: 'bg-red-600',
  not_applicable: 'bg-gray-500',
  exempt: 'bg-blue-600',
};

const COMPLIANCE_STATUS_LABELS: Record<ComplianceStatus, string> = {
  unknown: 'Unknown',
  compliant: 'Compliant',
  pending: 'Pending',
  needs_attention: 'Needs Attention',
  non_compliant: 'Non-Compliant',
  not_applicable: 'N/A',
  exempt: 'Exempt',
};

export default function ProductComplianceStateSelector({
  sku,
  bomId,
  productGroup,
  onStatesChange,
  readOnly = false,
}: ProductComplianceStateSelectorProps) {
  const [states, setStates] = useState<StateSelectionOption[]>([]);
  const [complianceSummary, setComplianceSummary] = useState<ProductComplianceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['Very Strict', 'Strict'])
  );
  const [showOnlySelected, setShowOnlySelected] = useState(false);

  const productRef = { sku, bomId, productGroup };
  const hasProduct = sku || bomId || productGroup;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [statesResult, summaryResult] = await Promise.all([
        getStateSelectionOptions(hasProduct ? productRef : undefined),
        hasProduct ? getProductComplianceSummary(sku, bomId) : Promise.resolve({ success: true, data: [] }),
      ]);

      if (statesResult.success && statesResult.data) {
        setStates(statesResult.data);
      } else {
        setError(statesResult.error || 'Failed to load states');
      }

      if (summaryResult.success && summaryResult.data) {
        setComplianceSummary(summaryResult.data);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [hasProduct, sku, bomId, productGroup]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedStates = states.filter((s) => s.isSelected).map((s) => s.stateCode);

  const toggleState = async (stateCode: string) => {
    if (readOnly || !hasProduct) return;

    setSaving(true);
    const isCurrentlySelected = states.find((s) => s.stateCode === stateCode)?.isSelected;

    const result = await setProductStateCompliance({
      ...productRef,
      stateCode,
      isActive: !isCurrentlySelected,
    });

    if (result.success) {
      setStates((prev) =>
        prev.map((s) =>
          s.stateCode === stateCode ? { ...s, isSelected: !isCurrentlySelected } : s
        )
      );
      const newSelected = isCurrentlySelected
        ? selectedStates.filter((s) => s !== stateCode)
        : [...selectedStates, stateCode];
      onStatesChange?.(newSelected);
    }

    setSaving(false);
  };

  const selectAll = async () => {
    if (readOnly || !hasProduct) return;

    setSaving(true);
    const allStateCodes = states.map((s) => s.stateCode);

    const result = await bulkSetProductStates(productRef, allStateCodes, false);

    if (result.success) {
      setStates((prev) => prev.map((s) => ({ ...s, isSelected: true })));
      onStatesChange?.(allStateCodes);
    }

    setSaving(false);
  };

  const clearAll = async () => {
    if (readOnly || !hasProduct) return;

    setSaving(true);

    const result = await bulkSetProductStates(productRef, [], true);

    if (result.success) {
      setStates((prev) => prev.map((s) => ({ ...s, isSelected: false })));
      onStatesChange?.([]);
    }

    setSaving(false);
  };

  const toggleGroup = (level: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(level)) {
      newExpanded.delete(level);
    } else {
      newExpanded.add(level);
    }
    setExpandedGroups(newExpanded);
  };

  const selectAllInGroup = async (level: string) => {
    if (readOnly || !hasProduct) return;

    setSaving(true);
    const groupStates = states
      .filter((s) => s.strictnessLevel === level && !s.isSelected)
      .map((s) => s.stateCode);

    const newSelected = [...selectedStates, ...groupStates];
    const result = await bulkSetProductStates(productRef, newSelected, false);

    if (result.success) {
      setStates((prev) =>
        prev.map((s) =>
          s.strictnessLevel === level ? { ...s, isSelected: true } : s
        )
      );
      onStatesChange?.(newSelected);
    }

    setSaving(false);
  };

  const getComplianceForState = (stateCode: string) => {
    return complianceSummary.find((s) => s.stateCode === stateCode);
  };

  // Filter states
  let filteredStates = states.filter(
    (state) =>
      state.stateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      state.stateCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (showOnlySelected) {
    filteredStates = filteredStates.filter((s) => s.isSelected);
  }

  // Group states by strictness
  const groupedStates = {
    'Very Strict': filteredStates.filter((s) => s.strictnessLevel === 'Very Strict'),
    Strict: filteredStates.filter((s) => s.strictnessLevel === 'Strict'),
    Moderate: filteredStates.filter((s) => s.strictnessLevel === 'Moderate'),
    Lenient: filteredStates.filter((s) => s.strictnessLevel === 'Lenient'),
    'Very Lenient': filteredStates.filter((s) => s.strictnessLevel === 'Very Lenient'),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900 border border-red-700 rounded-lg text-red-200">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-100">Target States</h3>
          <p className="text-sm text-gray-400 mt-1">
            {selectedStates.length} state{selectedStates.length !== 1 ? 's' : ''} selected
          </p>
        </div>

        {!readOnly && hasProduct && (
          <div className="flex gap-2">
            <Button
              onClick={selectAll}
              disabled={saving}
              className="px-3 py-1 text-sm bg-gray-700 text-gray-200 rounded hover:bg-gray-600 disabled:opacity-50"
            >
              Select All
            </Button>
            <Button
              onClick={clearAll}
              disabled={saving}
              className="px-3 py-1 text-sm bg-gray-700 text-gray-200 rounded hover:bg-gray-600 disabled:opacity-50"
            >
              Clear All
            </Button>
          </div>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search states..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
        <label className="flex items-center gap-2 text-sm text-gray-400">
          <input
            type="checkbox"
            checked={showOnlySelected}
            onChange={(e) => setShowOnlySelected(e.target.checked)}
            className="rounded bg-gray-700 border-gray-600 text-accent-500 focus:ring-accent-500"
          />
          Selected only
        </label>
      </div>

      {/* No Product Warning */}
      {!hasProduct && (
        <div className="p-4 bg-yellow-900 bg-opacity-30 border border-yellow-700 rounded-lg">
          <p className="text-yellow-300 text-sm">
            Select a product (SKU, BOM, or Product Group) to manage state compliance.
          </p>
        </div>
      )}

      {/* State Groups */}
      <div className="space-y-3">
        {Object.entries(groupedStates).map(([level, levelStates]) => {
          if (levelStates.length === 0) return null;

          const isExpanded = expandedGroups.has(level);
          const selectedInGroup = levelStates.filter((s) => s.isSelected).length;

          return (
            <div
              key={level}
              className="border border-gray-700 rounded-lg overflow-hidden bg-gray-800"
            >
              {/* Group Header */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-750"
                onClick={() => toggleGroup(level)}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${STRICTNESS_COLORS[level as keyof typeof STRICTNESS_COLORS]}`}
                  >
                    {STRICTNESS_BADGES[level as keyof typeof STRICTNESS_BADGES]}
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-100">
                      {level}
                      <span className="ml-2 text-sm font-normal text-gray-400">
                        ({levelStates.length} state{levelStates.length !== 1 ? 's' : ''})
                      </span>
                    </h4>
                    {selectedInGroup > 0 && (
                      <p className="text-sm text-accent-400 mt-0.5">
                        {selectedInGroup} selected
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isExpanded && !readOnly && hasProduct && (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        selectAllInGroup(level);
                      }}
                      disabled={saving}
                      className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50"
                    >
                      Select All
                    </Button>
                  )}
                  <svg
                    className={`w-5 h-5 text-gray-400 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* State List */}
              {isExpanded && (
                <div className="border-t border-gray-700 p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {levelStates.map((state) => {
                    const compliance = getComplianceForState(state.stateCode);

                    return (
                      <div
                        key={state.stateCode}
                        onClick={() => toggleState(state.stateCode)}
                        className={`
                          p-3 rounded-lg border-2 transition-all
                          ${!readOnly && hasProduct ? 'cursor-pointer' : ''}
                          ${state.isSelected
                            ? 'bg-accent-800 border-accent-500'
                            : 'bg-gray-750 border-gray-700 hover:border-gray-600'}
                          ${saving ? 'opacity-50' : ''}
                        `}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-gray-100">
                                {state.stateCode}
                              </span>
                              <span className="text-sm text-gray-300">
                                {state.stateName}
                              </span>
                            </div>

                            <div className="mt-2 space-y-1">
                              {state.registrationRequired && (
                                <div className="text-xs text-amber-400 flex items-center gap-1">
                                  <span>Registration required</span>
                                </div>
                              )}

                              {compliance && (
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`w-2 h-2 rounded-full ${COMPLIANCE_STATUS_COLORS[compliance.complianceStatus]}`}
                                  ></span>
                                  <span className="text-xs text-gray-400">
                                    {COMPLIANCE_STATUS_LABELS[compliance.complianceStatus]}
                                  </span>
                                  {compliance.documentCount > 0 && (
                                    <span className="text-xs text-gray-500">
                                      | {compliance.documentCount} doc{compliance.documentCount !== 1 ? 's' : ''}
                                    </span>
                                  )}
                                </div>
                              )}

                              {compliance?.alertsCount > 0 && (
                                <div className="text-xs text-red-400">
                                  {compliance.alertsCount} alert{compliance.alertsCount !== 1 ? 's' : ''}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Checkbox */}
                          <div
                            className={`
                              w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0
                              ${state.isSelected
                                ? 'bg-accent-500 border-accent-500'
                                : 'bg-gray-700 border-gray-600'}
                            `}
                          >
                            {state.isSelected && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
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
        })}
      </div>

      {/* Summary Stats */}
      {selectedStates.length > 0 && complianceSummary.length > 0 && (
        <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
          <h4 className="font-medium text-gray-200 mb-3">Compliance Summary</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">
                {complianceSummary.filter((s) => s.complianceStatus === 'compliant').length}
              </div>
              <div className="text-xs text-gray-500">Compliant</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400">
                {complianceSummary.filter((s) => s.complianceStatus === 'pending').length}
              </div>
              <div className="text-xs text-gray-500">Pending</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-400">
                {complianceSummary.filter((s) => s.complianceStatus === 'needs_attention').length}
              </div>
              <div className="text-xs text-gray-500">Needs Attention</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">
                {complianceSummary.filter((s) => s.complianceStatus === 'non_compliant').length}
              </div>
              <div className="text-xs text-gray-500">Non-Compliant</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
