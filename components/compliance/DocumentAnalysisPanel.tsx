/**
 * Document Analysis Panel Component
 *
 * Analyzes compliance documents (letters, regulatory notes, certificates)
 * to extract key compliance information, deadlines, and requirements.
 */

import React, { useState, useCallback } from 'react';
import Button from '@/components/ui/Button';
import {
  analyzeComplianceDocument,
  batchAnalyzeDocuments,
} from '@/services/regulatoryDataService';
import type { DocumentAnalysisResult } from '@/services/regulatoryDataService';

interface DocumentAnalysisPanelProps {
  documentId?: string;
  documentIds?: string[];
  onAnalysisComplete?: (result: DocumentAnalysisResult) => void;
}

const IMPACT_COLORS = {
  high: 'bg-red-900 text-red-300 border-red-700',
  medium: 'bg-yellow-900 text-yellow-300 border-yellow-700',
  low: 'bg-green-900 text-green-300 border-green-700',
  unknown: 'bg-gray-800 text-gray-400 border-gray-700',
};

const IMPACT_LABELS = {
  high: 'High Impact - Immediate action required',
  medium: 'Medium Impact - Review recommended',
  low: 'Low Impact - Informational',
  unknown: 'Impact not determined',
};

export default function DocumentAnalysisPanel({
  documentId,
  documentIds,
  onAnalysisComplete,
}: DocumentAnalysisPanelProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<DocumentAnalysisResult | null>(null);
  const [batchResults, setBatchResults] = useState<{
    analyzed: number;
    failed: number;
    results: Array<{ documentId: string; success: boolean; error?: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'actions' | 'regulations' | 'text'>('summary');

  const handleAnalyze = useCallback(async () => {
    if (!documentId && !documentIds?.length) return;

    setAnalyzing(true);
    setError(null);
    setResult(null);
    setBatchResults(null);

    try {
      if (documentId) {
        const response = await analyzeComplianceDocument(documentId);
        if (response.success && response.data) {
          setResult(response.data);
          onAnalysisComplete?.(response.data);
        } else {
          setError(response.error || 'Analysis failed');
        }
      } else if (documentIds?.length) {
        const response = await batchAnalyzeDocuments(documentIds);
        if (response.success && response.data) {
          setBatchResults(response.data);
        } else {
          setError(response.error || 'Batch analysis failed');
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }, [documentId, documentIds, onAnalysisComplete]);

  if (!documentId && !documentIds?.length) {
    return (
      <div className="p-6 text-center text-gray-500">
        Select a document to analyze
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-100">Document Analysis</h3>
          <p className="text-sm text-gray-400 mt-1">
            Extract compliance information from letters, notes, and certificates
          </p>
        </div>
        <Button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded disabled:opacity-50"
        >
          {analyzing ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
              Analyzing...
            </span>
          ) : (
            documentIds?.length ? `Analyze ${documentIds.length} Documents` : 'Analyze Document'
          )}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-900 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {/* Batch Results */}
      {batchResults && (
        <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
          <h4 className="font-medium text-gray-200 mb-3">Batch Analysis Complete</h4>
          <div className="flex gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">{batchResults.analyzed}</div>
              <div className="text-xs text-gray-500">Analyzed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">{batchResults.failed}</div>
              <div className="text-xs text-gray-500">Failed</div>
            </div>
          </div>
          <div className="space-y-2">
            {batchResults.results.map((r, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 bg-gray-750 rounded">
                <span className="text-sm text-gray-400 truncate">{r.documentId}</span>
                {r.success ? (
                  <span className="text-green-400 text-xs">Success</span>
                ) : (
                  <span className="text-red-400 text-xs">{r.error || 'Failed'}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Single Document Result */}
      {result && (
        <div className="space-y-4">
          {/* Impact Badge */}
          <div className={`p-4 rounded-lg border ${IMPACT_COLORS[result.analysisResults.complianceImpact]}`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">
                  {IMPACT_LABELS[result.analysisResults.complianceImpact]}
                </span>
                <p className="text-sm opacity-80 mt-1">
                  {result.analysisResults.summary}
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs opacity-70">Confidence</div>
                <div className="text-lg font-bold">{Math.round(result.confidence * 100)}%</div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-700">
            {(['summary', 'actions', 'regulations', 'text'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-accent-500 text-accent-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            {activeTab === 'summary' && (
              <div className="space-y-4">
                {/* Key Points */}
                {result.analysisResults.keyPoints.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-300 mb-2">Key Points</h5>
                    <ul className="space-y-1">
                      {result.analysisResults.keyPoints.map((point, idx) => (
                        <li key={idx} className="text-sm text-gray-400 flex items-start gap-2">
                          <span className="text-accent-400 mt-0.5">•</span>
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* References */}
                <div className="grid grid-cols-2 gap-4">
                  {result.analysisResults.stateReferences.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium text-gray-300 mb-2">State References</h5>
                      <div className="flex flex-wrap gap-1">
                        {result.analysisResults.stateReferences.map((state, idx) => (
                          <span key={idx} className="px-2 py-0.5 text-xs bg-blue-900 text-blue-300 rounded">
                            {state}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.analysisResults.regulationReferences.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium text-gray-300 mb-2">Regulation Citations</h5>
                      <div className="flex flex-wrap gap-1">
                        {result.analysisResults.regulationReferences.map((reg, idx) => (
                          <span key={idx} className="px-2 py-0.5 text-xs bg-purple-900 text-purple-300 rounded">
                            {reg}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'actions' && (
              <div className="space-y-4">
                {/* Deadlines */}
                {result.analysisResults.deadlines.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-300 mb-2">Deadlines Detected</h5>
                    <div className="space-y-2">
                      {result.analysisResults.deadlines.map((deadline, idx) => (
                        <div key={idx} className={`p-3 rounded border ${
                          deadline.priority === 'high'
                            ? 'bg-red-900 bg-opacity-30 border-red-700'
                            : 'bg-yellow-900 bg-opacity-30 border-yellow-700'
                        }`}>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-200">{deadline.action}</span>
                            <span className={`px-2 py-0.5 text-xs rounded ${
                              deadline.priority === 'high' ? 'bg-red-800 text-red-200' : 'bg-yellow-800 text-yellow-200'
                            }`}>
                              {deadline.priority}
                            </span>
                          </div>
                          <div className="text-xs text-gray-400 mt-1">{deadline.date}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Required Actions */}
                {result.analysisResults.requiredActions.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-300 mb-2">Required Actions</h5>
                    <ul className="space-y-2">
                      {result.analysisResults.requiredActions.map((action, idx) => (
                        <li key={idx} className="p-3 bg-gray-750 rounded text-sm text-gray-300">
                          {action}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.analysisResults.deadlines.length === 0 && result.analysisResults.requiredActions.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No specific actions or deadlines detected
                  </div>
                )}
              </div>
            )}

            {activeTab === 'regulations' && (
              <div className="space-y-4">
                {result.linkedRegulations.length > 0 ? (
                  <>
                    <h5 className="text-sm font-medium text-gray-300 mb-2">Linked Regulations</h5>
                    <div className="space-y-2">
                      {result.linkedRegulations.map((reg, idx) => (
                        <div key={idx} className="p-3 bg-gray-750 rounded border border-gray-700">
                          <div className="flex items-center justify-between">
                            <div>
                              {reg.regulationCode && (
                                <span className="text-xs text-accent-400">{reg.regulationCode}</span>
                              )}
                              <p className="text-sm text-gray-200">{reg.title}</p>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-gray-500">Relevance</div>
                              <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-accent-500"
                                  style={{ width: `${reg.relevance * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No linked regulations found
                  </div>
                )}
              </div>
            )}

            {activeTab === 'text' && (
              <div>
                <h5 className="text-sm font-medium text-gray-300 mb-2">Extracted Text</h5>
                <pre className="p-4 bg-gray-900 rounded text-sm text-gray-300 whitespace-pre-wrap max-h-96 overflow-y-auto font-mono">
                  {result.extractedText || 'No text extracted'}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Idle State */}
      {!analyzing && !result && !batchResults && !error && (
        <div className="text-center py-12 text-gray-500">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="mb-2">Click "Analyze Document" to extract compliance information</p>
          <p className="text-sm">
            We'll identify deadlines, required actions, regulation references, and more
          </p>
        </div>
      )}
    </div>
  );
}
