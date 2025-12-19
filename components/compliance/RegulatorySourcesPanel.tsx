/**
 * Regulatory Sources Panel Component
 *
 * Displays state regulatory sources with URLs, contact info,
 * and data gathering status. Allows triggering MCP scraping.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import {
  getStateRegulatorySources,
  getPriorityStates,
  requestRegulatoryScrape,
  getCombinedLabelingRequirements,
} from '@/services/regulatoryDataService';
import type { StateRegulatorySource } from '@/services/regulatoryDataService';

interface RegulatorySourcesPanelProps {
  selectedStates?: string[];
  regulatoryDomain?: string;
  showPriorityOnly?: boolean;
  onSourceSelect?: (source: StateRegulatorySource) => void;
}

const ENFORCEMENT_COLORS = {
  strict: 'bg-red-600 text-white',
  moderate: 'bg-yellow-600 text-white',
  lenient: 'bg-green-600 text-white',
};

const SCRAPE_STATUS_COLORS = {
  success: 'bg-green-600',
  partial: 'bg-yellow-600',
  failed: 'bg-red-600',
  pending: 'bg-blue-600',
};

export default function RegulatorySourcesPanel({
  selectedStates,
  regulatoryDomain = 'fertilizer',
  showPriorityOnly = false,
  onSourceSelect,
}: RegulatorySourcesPanelProps) {
  const [sources, setSources] = useState<StateRegulatorySource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [scraping, setScraping] = useState<string | null>(null);
  const [combinedRequirements, setCombinedRequirements] = useState<{
    requiredElements: string[];
    prohibitedClaims: string[];
    strictestState: string;
  } | null>(null);

  const fetchSources = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let result;
      if (showPriorityOnly) {
        result = await getPriorityStates(10);
      } else {
        result = await getStateRegulatorySources(selectedStates, regulatoryDomain);
      }

      if (result.success && result.data) {
        setSources(result.data);
      } else {
        setError(result.error || 'Failed to load sources');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedStates, regulatoryDomain, showPriorityOnly]);

  const fetchCombinedRequirements = useCallback(async () => {
    if (!selectedStates?.length) {
      setCombinedRequirements(null);
      return;
    }

    const result = await getCombinedLabelingRequirements(selectedStates);
    if (result.success && result.data) {
      setCombinedRequirements({
        requiredElements: result.data.requiredElements,
        prohibitedClaims: result.data.prohibitedClaims,
        strictestState: result.data.strictestState,
      });
    }
  }, [selectedStates]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  useEffect(() => {
    fetchCombinedRequirements();
  }, [fetchCombinedRequirements]);

  const handleScrape = async (sourceId: string) => {
    setScraping(sourceId);
    const result = await requestRegulatoryScrape(sourceId);
    if (result.success) {
      // Refresh sources to show updated status
      await fetchSources();
    }
    setScraping(null);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium text-gray-100">Regulatory Sources</h3>
        <p className="text-sm text-gray-400 mt-1">
          Authoritative sources for {regulatoryDomain} regulations by state
        </p>
      </div>

      {/* Combined Requirements Summary */}
      {combinedRequirements && selectedStates && selectedStates.length > 1 && (
        <div className="p-4 bg-accent-900 bg-opacity-30 border border-accent-700 rounded-lg">
          <h4 className="font-medium text-accent-300 mb-3 flex items-center gap-2">
            Combined Requirements for {selectedStates.length} States
            <span className="text-xs text-gray-400">
              (Strictest: {combinedRequirements.strictestState})
            </span>
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Required Elements */}
            <div>
              <h5 className="text-sm font-medium text-gray-300 mb-2">Required Label Elements</h5>
              <ul className="space-y-1">
                {combinedRequirements.requiredElements.slice(0, 6).map((element, idx) => (
                  <li key={idx} className="text-xs text-gray-400 flex items-start gap-2">
                    <span className="text-green-500">+</span>
                    {element}
                  </li>
                ))}
                {combinedRequirements.requiredElements.length > 6 && (
                  <li className="text-xs text-gray-500">
                    +{combinedRequirements.requiredElements.length - 6} more...
                  </li>
                )}
              </ul>
            </div>

            {/* Prohibited Claims */}
            <div>
              <h5 className="text-sm font-medium text-gray-300 mb-2">Prohibited Claims</h5>
              <ul className="space-y-1">
                {combinedRequirements.prohibitedClaims.slice(0, 6).map((claim, idx) => (
                  <li key={idx} className="text-xs text-gray-400 flex items-start gap-2">
                    <span className="text-red-500">-</span>
                    {claim}
                  </li>
                ))}
                {combinedRequirements.prohibitedClaims.length > 6 && (
                  <li className="text-xs text-gray-500">
                    +{combinedRequirements.prohibitedClaims.length - 6} more...
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Sources List */}
      <div className="space-y-3">
        {sources.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No regulatory sources found for the selected criteria.
          </div>
        )}

        {sources.map((source) => {
          const isExpanded = expandedSource === source.id;
          const isScraping = scraping === source.id;

          return (
            <div
              key={source.id || source.stateCode}
              className="border border-gray-700 rounded-lg overflow-hidden bg-gray-800"
            >
              {/* Source Header */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-750"
                onClick={() => setExpandedSource(isExpanded ? null : source.id)}
              >
                <div className="flex items-center gap-4">
                  {/* State Badge */}
                  <div className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center">
                    <span className="font-mono font-bold text-lg text-gray-100">
                      {source.stateCode}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-gray-100">{source.stateName}</h4>
                      {source.agencyAcronym && (
                        <span className="text-sm text-gray-400">({source.agencyAcronym})</span>
                      )}
                      <span className={`px-2 py-0.5 text-xs rounded ${ENFORCEMENT_COLORS[source.enforcementLevel as keyof typeof ENFORCEMENT_COLORS] || 'bg-gray-600 text-gray-200'}`}>
                        {source.enforcementLevel}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400">{source.agencyName}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Data Completeness */}
                  <div className="text-center">
                    <div className="text-xs text-gray-500">Data</div>
                    <div className="flex items-center gap-1">
                      <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${source.dataCompleteness >= 70 ? 'bg-green-500' : source.dataCompleteness >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${source.dataCompleteness}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400">{source.dataCompleteness}%</span>
                    </div>
                  </div>

                  {/* Last Scraped */}
                  {source.lastScrapedAt && (
                    <div className="text-center">
                      <div className="text-xs text-gray-500">Last Updated</div>
                      <div className="flex items-center gap-1">
                        {source.lastScrapeStatus && (
                          <span className={`w-2 h-2 rounded-full ${SCRAPE_STATUS_COLORS[source.lastScrapeStatus as keyof typeof SCRAPE_STATUS_COLORS] || 'bg-gray-600'}`}></span>
                        )}
                        <span className="text-xs text-gray-400">{formatDate(source.lastScrapedAt)}</span>
                      </div>
                    </div>
                  )}

                  {/* Expand Icon */}
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

              {/* Expanded Details */}
              {isExpanded && (
                <div className="border-t border-gray-700 p-4 space-y-4">
                  {/* Quick Links */}
                  <div>
                    <h5 className="text-sm font-medium text-gray-300 mb-2">Quick Links</h5>
                    <div className="flex flex-wrap gap-2">
                      {source.baseUrl && (
                        <a
                          href={source.baseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm flex items-center gap-1"
                        >
                          <span>Main Site</span>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                      {source.regulationsUrl && (
                        <a
                          href={source.regulationsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-blue-100 rounded text-sm flex items-center gap-1"
                        >
                          <span>Regulations</span>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                      {source.registrationUrl && (
                        <a
                          href={source.registrationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-green-100 rounded text-sm flex items-center gap-1"
                        >
                          <span>Registration</span>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                      {source.formsUrl && (
                        <a
                          href={source.formsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-purple-100 rounded text-sm flex items-center gap-1"
                        >
                          <span>Forms</span>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                      {source.feeScheduleUrl && (
                        <a
                          href={source.feeScheduleUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 text-yellow-100 rounded text-sm flex items-center gap-1"
                        >
                          <span>Fees</span>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Contact Information */}
                  {(source.contactEmail || source.contactPhone) && (
                    <div>
                      <h5 className="text-sm font-medium text-gray-300 mb-2">Contact</h5>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                        {source.contactEmail && (
                          <a href={`mailto:${source.contactEmail}`} className="hover:text-accent-400">
                            {source.contactEmail}
                          </a>
                        )}
                        {source.contactPhone && (
                          <a href={`tel:${source.contactPhone}`} className="hover:text-accent-400">
                            {source.contactPhone}
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Key Requirements */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Registration Info */}
                    <div>
                      <h5 className="text-sm font-medium text-gray-300 mb-2">Registration</h5>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          {source.registrationRequired ? (
                            <>
                              <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                              <span className="text-amber-400">Required</span>
                            </>
                          ) : (
                            <>
                              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                              <span className="text-green-400">Not required</span>
                            </>
                          )}
                        </div>
                        {source.registrationAnnualFee && (
                          <div className="text-gray-400">
                            Annual fee: ${source.registrationAnnualFee.toFixed(2)}
                          </div>
                        )}
                        {source.testingRequired && (
                          <div className="text-yellow-400">Testing required</div>
                        )}
                      </div>
                    </div>

                    {/* Key Regulations */}
                    {(source.primaryStatutes.length > 0 || source.primaryRegulations.length > 0) && (
                      <div>
                        <h5 className="text-sm font-medium text-gray-300 mb-2">Key Regulations</h5>
                        <ul className="space-y-1 text-xs text-gray-400">
                          {source.primaryStatutes.slice(0, 2).map((statute, idx) => (
                            <li key={idx} className="truncate">{statute}</li>
                          ))}
                          {source.primaryRegulations.slice(0, 2).map((reg, idx) => (
                            <li key={idx} className="truncate">{reg}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Required Statements */}
                  {source.requiredStatements.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium text-gray-300 mb-2">Required Label Statements</h5>
                      <ul className="space-y-1">
                        {source.requiredStatements.map((statement, idx) => (
                          <li key={idx} className="text-xs text-gray-400 flex items-start gap-2">
                            <span className="text-green-500 mt-0.5">+</span>
                            {statement}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Prohibited Claims */}
                  {source.prohibitedClaims.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium text-gray-300 mb-2">Prohibited Claims</h5>
                      <ul className="space-y-1">
                        {source.prohibitedClaims.map((claim, idx) => (
                          <li key={idx} className="text-xs text-gray-400 flex items-start gap-2">
                            <span className="text-red-500 mt-0.5">-</span>
                            {claim}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Notes */}
                  {source.notes && (
                    <div className="p-3 bg-gray-750 rounded text-sm text-gray-400">
                      {source.notes}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                    <div className="text-xs text-gray-500">
                      Domain: {source.regulatoryDomain}
                    </div>
                    <div className="flex gap-2">
                      {source.scrapeEnabled && (
                        <Button
                          onClick={() => handleScrape(source.id)}
                          disabled={isScraping}
                          className="px-3 py-1.5 bg-accent-600 hover:bg-accent-500 text-white rounded text-sm disabled:opacity-50"
                        >
                          {isScraping ? 'Gathering Data...' : 'Update Data'}
                        </Button>
                      )}
                      <Button
                        onClick={() => onSourceSelect?.(source)}
                        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm"
                      >
                        View Details
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
