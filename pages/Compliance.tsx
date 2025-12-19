/**
 * Compliance Page
 *
 * Central hub for regulatory compliance management including:
 * - State regulatory sources and contact info
 * - Compliance document management
 * - Regulatory Q&A with AI-powered answers
 * - Document analysis (letters, notes from states)
 */

import React, { useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { ShieldCheckIcon } from '@/components/icons';
import ComplianceDocumentList from '@/components/compliance/ComplianceDocumentList';
import RegulatorySourcesPanel from '@/components/compliance/RegulatorySourcesPanel';
import StateContactManager from '@/components/compliance/StateContactManager';
import RegulatoryQAPanel from '@/components/compliance/RegulatoryQAPanel';
import DocumentAnalysisPanel from '@/components/compliance/DocumentAnalysisPanel';

type TabId = 'sources' | 'contacts' | 'documents' | 'qa' | 'analysis';

interface TabConfig {
  id: TabId;
  label: string;
  description: string;
}

const TABS: TabConfig[] = [
  { id: 'sources', label: 'State Sources', description: 'Regulatory agencies and requirements by state' },
  { id: 'contacts', label: 'Contact Info', description: 'Manage state agency contact information' },
  { id: 'documents', label: 'Documents', description: 'Compliance documents and certifications' },
  { id: 'qa', label: 'Q&A', description: 'Ask regulatory questions and get AI-powered answers' },
  { id: 'analysis', label: 'Document Analysis', description: 'Analyze letters and regulatory notes' },
];

export default function Compliance() {
  const [activeTab, setActiveTab] = useState<TabId>('sources');
  const [selectedStates, setSelectedStates] = useState<string[]>(['CA', 'OR', 'WA', 'NY', 'TX', 'NM']);

  const handleStateToggle = (stateCode: string) => {
    setSelectedStates(prev =>
      prev.includes(stateCode)
        ? prev.filter(s => s !== stateCode)
        : [...prev, stateCode]
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance"
        description="Manage regulatory compliance, state sources, and documentation"
        icon={<ShieldCheckIcon className="w-6 h-6" />}
      />

      {/* Quick State Selector */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-300">Priority States</h3>
          <span className="text-xs text-gray-500">{selectedStates.length} selected</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {['CA', 'OR', 'WA', 'NY', 'TX', 'NM', 'CO', 'FL', 'MI', 'PA'].map(state => (
            <button
              key={state}
              onClick={() => handleStateToggle(state)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedStates.includes(state)
                  ? 'bg-accent-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {state}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-700">
        <nav className="flex gap-1 -mb-px">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-accent-500 text-accent-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Description */}
      <p className="text-sm text-gray-500">
        {TABS.find(t => t.id === activeTab)?.description}
      </p>

      {/* Tab Content */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
        {activeTab === 'sources' && (
          <RegulatorySourcesPanel
            selectedStates={selectedStates}
            regulatoryDomain="fertilizer"
          />
        )}

        {activeTab === 'contacts' && (
          <StateContactManager />
        )}

        {activeTab === 'documents' && (
          <ComplianceDocumentList
            showUploadButton={true}
          />
        )}

        {activeTab === 'qa' && (
          <RegulatoryQAPanel />
        )}

        {activeTab === 'analysis' && (
          <DocumentAnalysisPanel />
        )}
      </div>
    </div>
  );
}
