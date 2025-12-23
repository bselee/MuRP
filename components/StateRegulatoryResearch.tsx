/**
 * State Regulatory Research Component
 *
 * Displays Perplexity-powered regulatory research for each target state.
 * Provides detailed summaries, key changes, affected parties, and action items
 * similar to the Perplexity AI interface.
 */

import React, { useState, useCallback } from 'react';
import Button from '@/components/ui/Button';
import { researchStateRegulations, type StateRegulatoryResearch as ResearchResult } from '../services/mcpService';
import { supabase } from '../lib/supabase/client';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  SparklesIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  ExternalLinkIcon,
  RefreshIcon,
  GlobeIcon,
} from './icons';

interface StateRegulatoryResearchProps {
  targetStates?: string[];
  regulationType?: 'fertilizer' | 'organic' | 'soil_amendment' | 'biostimulant' | 'general';
  focusArea?: string;
  ingredientName?: string;
}

interface CachedResearch {
  state: string;
  data: ParsedResearchResult;
  fetchedAt: string;
  expiresAt: string;
}

interface ParsedResearchResult {
  summary: string;
  keyChanges: string[];
  whoIsAffected: string[];
  skuImpact: Array<{
    category: string;
    action: string;
    priority: 'High' | 'Medium' | 'Low' | 'Watch';
  }>;
  suggestedNextSteps: string[];
  sources: Array<{ title: string; url?: string }>;
  rawResponse?: string;
}

const STATE_NAMES: Record<string, string> = {
  CA: 'California',
  OR: 'Oregon',
  WA: 'Washington',
  TX: 'Texas',
  NM: 'New Mexico',
  NY: 'New York',
  FL: 'Florida',
  CO: 'Colorado',
  AZ: 'Arizona',
  NV: 'Nevada',
};

const PRIORITY_STATES = ['CA', 'OR', 'WA', 'TX', 'NM', 'NY'];

const StateRegulatoryResearch: React.FC<StateRegulatoryResearchProps> = ({
  targetStates = PRIORITY_STATES,
  regulationType = 'fertilizer',
  focusArea,
  ingredientName,
}) => {
  const [expandedState, setExpandedState] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<string | null>(null);
  const [researchCache, setResearchCache] = useState<Map<string, CachedResearch>>(new Map());
  const [error, setError] = useState<string | null>(null);

  // Parse the raw Perplexity response into structured data
  const parseResearchResponse = (rawResponse: string): ParsedResearchResult => {
    // Default structure
    const result: ParsedResearchResult = {
      summary: '',
      keyChanges: [],
      whoIsAffected: [],
      skuImpact: [],
      suggestedNextSteps: [],
      sources: [],
      rawResponse,
    };

    try {
      // Try to parse as JSON first (if MCP returns structured data)
      const parsed = JSON.parse(rawResponse);
      if (parsed.summary) {
        return {
          summary: parsed.summary || '',
          keyChanges: parsed.keyChanges || parsed.key_changes || [],
          whoIsAffected: parsed.whoIsAffected || parsed.who_is_affected || [],
          skuImpact: parsed.skuImpact || parsed.sku_impact || [],
          suggestedNextSteps: parsed.suggestedNextSteps || parsed.suggested_next_steps || [],
          sources: parsed.sources || [],
          rawResponse,
        };
      }
    } catch {
      // Not JSON, parse as text
    }

    // Parse markdown-style response
    const lines = rawResponse.split('\n');
    let currentSection = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect section headers
      if (trimmed.toLowerCase().includes('key change') || trimmed.toLowerCase().includes('proposed rule')) {
        currentSection = 'keyChanges';
        continue;
      }
      if (trimmed.toLowerCase().includes('who is affected') || trimmed.toLowerCase().includes('affected')) {
        currentSection = 'whoIsAffected';
        continue;
      }
      if (trimmed.toLowerCase().includes('impact') || trimmed.toLowerCase().includes('sku')) {
        currentSection = 'skuImpact';
        continue;
      }
      if (trimmed.toLowerCase().includes('next step') || trimmed.toLowerCase().includes('suggested')) {
        currentSection = 'nextSteps';
        continue;
      }
      if (trimmed.toLowerCase().includes('source') || trimmed.toLowerCase().includes('reference')) {
        currentSection = 'sources';
        continue;
      }

      // Parse bullet points
      if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
        const content = trimmed.replace(/^[•\-*]\s*/, '');
        switch (currentSection) {
          case 'keyChanges':
            result.keyChanges.push(content);
            break;
          case 'whoIsAffected':
            result.whoIsAffected.push(content);
            break;
          case 'nextSteps':
            result.suggestedNextSteps.push(content);
            break;
          case 'sources':
            result.sources.push({ title: content });
            break;
        }
      } else if (!currentSection && trimmed.length > 50) {
        // First substantial paragraph is likely the summary
        result.summary = trimmed;
        currentSection = 'afterSummary';
      }
    }

    // If no structured content found, use raw as summary
    if (!result.summary && !result.keyChanges.length) {
      result.summary = rawResponse.slice(0, 500) + (rawResponse.length > 500 ? '...' : '');
    }

    return result;
  };

  // Fetch research for a state
  const fetchStateResearch = useCallback(async (stateCode: string) => {
    // Check cache first
    const cached = researchCache.get(stateCode);
    if (cached && new Date(cached.expiresAt) > new Date()) {
      return cached.data;
    }

    setLoadingState(stateCode);
    setError(null);

    try {
      const result = await researchStateRegulations({
        state_code: stateCode,
        regulation_type: regulationType,
        focus_area: focusArea || ingredientName,
      });

      if (!result.success) {
        throw new Error(result.error || 'Research failed');
      }

      const parsed = parseResearchResponse(
        typeof result.data === 'string' ? result.data : JSON.stringify(result.data)
      );

      // Cache for 24 hours
      const now = new Date();
      const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const cacheEntry: CachedResearch = {
        state: stateCode,
        data: parsed,
        fetchedAt: now.toISOString(),
        expiresAt: expires.toISOString(),
      };

      setResearchCache(prev => new Map(prev).set(stateCode, cacheEntry));

      // Also save to database for persistence
      try {
        await supabase.from('regulation_sync_schedule').upsert({
          state_code: stateCode,
          regulation_type: regulationType,
          last_sync_at: now.toISOString(),
          next_sync_at: expires.toISOString(),
          sync_status: 'completed',
          last_sync_result: parsed,
        }, {
          onConflict: 'state_code,regulation_type',
        });
      } catch (dbErr) {
        console.warn('Failed to cache research in database:', dbErr);
      }

      return parsed;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch research';
      setError(message);
      return null;
    } finally {
      setLoadingState(null);
    }
  }, [regulationType, focusArea, ingredientName, researchCache]);

  // Handle state card click
  const handleStateClick = async (stateCode: string) => {
    if (expandedState === stateCode) {
      setExpandedState(null);
      return;
    }

    setExpandedState(stateCode);

    // Fetch research if not cached
    if (!researchCache.has(stateCode)) {
      await fetchStateResearch(stateCode);
    }
  };

  // Refresh research for a state
  const handleRefresh = async (stateCode: string, e: React.MouseEvent) => {
    e.stopPropagation();
    researchCache.delete(stateCode);
    setResearchCache(new Map(researchCache));
    await fetchStateResearch(stateCode);
  };

  const getPriorityBadge = (priority: string) => {
    const colors = {
      High: 'bg-red-900/30 text-red-300 border-red-700',
      Medium: 'bg-yellow-900/30 text-yellow-300 border-yellow-700',
      Low: 'bg-green-900/30 text-green-300 border-green-700',
      Watch: 'bg-blue-900/30 text-blue-300 border-blue-700',
    };
    return colors[priority as keyof typeof colors] || colors.Low;
  };

  const renderResearchContent = (stateCode: string) => {
    const cached = researchCache.get(stateCode);

    if (loadingState === stateCode) {
      return (
        <div className="py-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-400 mx-auto mb-3"></div>
          <p className="text-gray-400">Researching {STATE_NAMES[stateCode] || stateCode} regulations...</p>
          <p className="text-xs text-gray-500 mt-1">This may take 10-30 seconds</p>
        </div>
      );
    }

    if (!cached) {
      return (
        <div className="py-6 text-center">
          <SparklesIcon className="w-8 h-8 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">Click to research {STATE_NAMES[stateCode] || stateCode} regulations</p>
          <Button
            onClick={() => fetchStateResearch(stateCode)}
            className="mt-3 px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm"
          >
            <SparklesIcon className="w-4 h-4 inline mr-2" />
            Research with Perplexity AI
          </Button>
        </div>
      );
    }

    const { data } = cached;

    return (
      <div className="space-y-6">
        {/* Summary */}
        {data.summary && (
          <div className="bg-gray-900/50 rounded-lg p-4">
            <p className="text-sm text-gray-300 leading-relaxed">{data.summary}</p>
          </div>
        )}

        {/* Key Changes */}
        {data.keyChanges.length > 0 && (
          <div>
            <h5 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
              <ExclamationCircleIcon className="w-4 h-4 text-yellow-400" />
              Key Changes
            </h5>
            <ul className="space-y-2">
              {data.keyChanges.map((change, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-gray-400">
                  <span className="text-accent-400 mt-1">•</span>
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Who Is Affected */}
        {data.whoIsAffected.length > 0 && (
          <div>
            <h5 className="text-sm font-semibold text-gray-300 mb-3">Who Is Affected</h5>
            <ul className="space-y-2">
              {data.whoIsAffected.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-gray-400">
                  <span className="text-accent-400 mt-1">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* SKU Impact Table */}
        {data.skuImpact.length > 0 && (
          <div>
            <h5 className="text-sm font-semibold text-gray-300 mb-3">Impact on Your SKUs</h5>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">SKU Category</th>
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">Action</th>
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {data.skuImpact.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-800">
                      <td className="py-2 px-3 text-white">{item.category}</td>
                      <td className="py-2 px-3 text-gray-300">{item.action}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getPriorityBadge(item.priority)}`}>
                          {item.priority}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Suggested Next Steps */}
        {data.suggestedNextSteps.length > 0 && (
          <div>
            <h5 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
              <CheckCircleIcon className="w-4 h-4 text-green-400" />
              Suggested Next Steps
            </h5>
            <ul className="space-y-2">
              {data.suggestedNextSteps.map((step, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-gray-400">
                  <span className="text-green-400 mt-1">{idx + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Sources */}
        {data.sources.length > 0 && (
          <div className="pt-4 border-t border-gray-700">
            <h5 className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
              <GlobeIcon className="w-3 h-3" />
              {data.sources.length} sources
            </h5>
            <div className="flex flex-wrap gap-2">
              {data.sources.map((source, idx) => (
                <span key={idx} className="text-xs text-gray-500">
                  {source.url ? (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-400 hover:text-accent-300 flex items-center gap-1"
                    >
                      {source.title}
                      <ExternalLinkIcon className="w-3 h-3" />
                    </a>
                  ) : (
                    source.title
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Raw response fallback */}
        {!data.keyChanges.length && !data.whoIsAffected.length && data.rawResponse && (
          <div className="bg-gray-900/50 rounded-lg p-4">
            <pre className="text-xs text-gray-400 whitespace-pre-wrap">{data.rawResponse}</pre>
          </div>
        )}

        {/* Last updated */}
        <div className="text-xs text-gray-600 text-right">
          Last updated: {new Date(cached.fetchedAt).toLocaleString()}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-lg font-semibold text-white flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-purple-400" />
            State Regulatory Research
          </h4>
          <p className="text-sm text-gray-400 mt-1">
            Click on a state to get AI-powered regulatory analysis
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* State Cards */}
      <div className="space-y-2">
        {targetStates.map((stateCode) => {
          const isExpanded = expandedState === stateCode;
          const isLoading = loadingState === stateCode;
          const hasCached = researchCache.has(stateCode);

          return (
            <div
              key={stateCode}
              className="bg-gray-800/30 rounded-lg border border-gray-700 overflow-hidden"
            >
              {/* State Header */}
              <button
                onClick={() => handleStateClick(stateCode)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                  )}
                  <div className="text-left">
                    <p className="text-sm font-medium text-white">
                      {STATE_NAMES[stateCode] || stateCode}
                    </p>
                    <p className="text-xs text-gray-500">{stateCode} • {regulationType}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isLoading && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-accent-400"></div>
                  )}
                  {hasCached && !isLoading && (
                    <>
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <CheckCircleIcon className="w-3 h-3" />
                        Researched
                      </span>
                      <button
                        onClick={(e) => handleRefresh(stateCode, e)}
                        className="p-1 hover:bg-gray-700 rounded"
                        title="Refresh research"
                      >
                        <RefreshIcon className="w-4 h-4 text-gray-400" />
                      </button>
                    </>
                  )}
                  {!hasCached && !isLoading && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <ClockIcon className="w-3 h-3" />
                      Not researched
                    </span>
                  )}
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-700">
                  {renderResearchContent(stateCode)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <p className="text-xs text-gray-500 text-center">
        Powered by Perplexity Sonar API • Research is cached for 24 hours
      </p>
    </div>
  );
};

export default StateRegulatoryResearch;
