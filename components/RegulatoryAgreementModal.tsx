import Button from '@/components/ui/Button';
// Regulatory Agreement Modal
// Displays comprehensive legal agreement that users must accept before using compliance features

import React, { useState } from 'react';
import { REGULATORY_AGREEMENT_TEXT } from '../types/userAgreements';
import type { RegulatoryUserAgreement } from '../types/userAgreements';
import { ExclamationCircleIcon, CheckCircleIcon } from './icons';

interface RegulatoryAgreementModalProps {
  isOpen: boolean;
  onAccept: (agreement: Omit<RegulatoryUserAgreement, 'userId'>) => void;
  onDecline: () => void;
  currentUser: { email: string };
}

const RegulatoryAgreementModal: React.FC<RegulatoryAgreementModalProps> = ({
  isOpen,
  onAccept,
  onDecline,
  currentUser,
}) => {
  // Form state
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [electronicSignature, setElectronicSignature] = useState('');

  // Acknowledgment checkboxes
  const [acknowledgedTerms, setAcknowledgedTerms] = useState({
    notLegalAdvice: false,
    verificationRequired: false,
    consultAttorneyRecommended: false,
    noWarranties: false,
    useAtOwnRisk: false,
    liabilityRelease: false,
    aiLimitations: false,
    regulatoryChanges: false,
  });

  const [additionalAcknowledgments, setAdditionalAcknowledgments] = useState({
    letterDraftsRequireReview: false,
    complianceInfoMayBeIncomplete: false,
    verifyAllSourcesRequired: false,
    documentVerificationProcess: false,
  });

  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const isAtBottom = Math.abs(element.scrollHeight - element.scrollTop - element.clientHeight) < 10;
    if (isAtBottom) {
      setHasScrolledToBottom(true);
    }
  };

  const allTermsChecked = Object.values(acknowledgedTerms).every(v => v === true);
  const allAdditionalChecked = Object.values(additionalAcknowledgments).every(v => v === true);
  const formComplete = fullName && title && companyName && electronicSignature && electronicSignature === fullName;
  const canAccept = hasScrolledToBottom && allTermsChecked && allAdditionalChecked && formComplete;

  const handleAccept = () => {
    const agreement: Omit<RegulatoryUserAgreement, 'userId'> = {
      acceptedAt: new Date().toISOString(),
      version: REGULATORY_AGREEMENT_TEXT.version,
      ipAddress: undefined, // Could capture if needed
      acknowledgedTerms,
      additionalAcknowledgments,
      fullName,
      title,
      companyName,
      electronicSignature,
      status: 'active',
      expiresAt: undefined, // Could set to 1 year from now if needed
    };

    onAccept(agreement);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-gray-700">
        {/* Header */}
        <div className="flex items-start gap-4 p-6 border-b border-gray-700">
          <ExclamationCircleIcon className="w-8 h-8 text-yellow-500 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white mb-2">
              {REGULATORY_AGREEMENT_TEXT.title}
            </h2>
            <p className="text-sm text-gray-400">
              Version {REGULATORY_AGREEMENT_TEXT.version} • Last Updated: {REGULATORY_AGREEMENT_TEXT.lastUpdated}
            </p>
            <p className="text-sm text-yellow-400 mt-2 font-semibold">
              ⚠️ Please read this entire agreement carefully before accepting.
            </p>
          </div>
        </div>

        {/* Scrollable Content */}
        <div
          className="flex-1 overflow-y-auto p-6 space-y-6"
          onScroll={handleScroll}
        >
          {/* Introduction */}
          <div className="prose prose-invert prose-sm max-w-none">
            <div className="bg-gray-900/50 p-4 rounded-md border border-gray-700">
              <p className="text-gray-300 whitespace-pre-line leading-relaxed">
                {REGULATORY_AGREEMENT_TEXT.introduction}
              </p>
            </div>
          </div>

          {/* Sections */}
          {REGULATORY_AGREEMENT_TEXT.sections.map((section, index) => (
            <div key={index} className="bg-gray-900/30 rounded-lg p-5 border border-gray-700">
              <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                {section.title}
              </h3>
              <p className="text-sm text-gray-300 whitespace-pre-line leading-relaxed">
                {section.content}
              </p>
            </div>
          ))}

          {/* Primary Acknowledgments */}
          <div className="bg-indigo-900/20 rounded-lg p-5 border border-indigo-700">
            <h3 className="text-lg font-bold text-white mb-4">Required Acknowledgments</h3>
            <div className="space-y-3">
              {Object.entries(acknowledgedTerms).map(([key, checked]) => (
                <label key={key} className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setAcknowledgedTerms(prev => ({ ...prev, [key]: e.target.checked }))}
                    className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-gray-800"
                  />
                  <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
                    {getTermLabel(key)}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Additional Acknowledgments */}
          <div className="bg-indigo-900/20 rounded-lg p-5 border border-indigo-700">
            <h3 className="text-lg font-bold text-white mb-4">Additional Acknowledgments</h3>
            <div className="space-y-3">
              {Object.entries(additionalAcknowledgments).map(([key, checked]) => (
                <label key={key} className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setAdditionalAcknowledgments(prev => ({ ...prev, [key]: e.target.checked }))}
                    className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-gray-800"
                  />
                  <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
                    {getAdditionalTermLabel(key)}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Final Agreement Text */}
          <div className="bg-yellow-900/20 rounded-lg p-5 border border-yellow-700">
            <p className="text-sm text-gray-300 whitespace-pre-line leading-relaxed font-semibold">
              {REGULATORY_AGREEMENT_TEXT.agreement}
            </p>
          </div>

          {/* Electronic Signature Section */}
          <div className="bg-gray-900/50 rounded-lg p-5 border border-gray-700">
            <h3 className="text-lg font-bold text-white mb-4">Electronic Signature</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Full Legal Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="John Smith"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Operations Manager"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Company Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Acme Fertilizers Inc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Electronic Signature <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={electronicSignature}
                  onChange={(e) => setElectronicSignature(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-['Brush_Script_MT',cursive] text-xl"
                  placeholder="Type your full name to sign"
                />
                <p className="text-xs text-gray-400 mt-1">
                  By typing your name, you agree that this constitutes your electronic signature.
                  Must match your full name exactly.
                </p>
              </div>
            </div>
          </div>

          {/* Scroll Reminder */}
          {!hasScrolledToBottom && (
            <div className="bg-yellow-900/20 rounded-lg p-4 border border-yellow-700">
              <p className="text-sm text-yellow-400 font-semibold">
                ⬇️ Please scroll to the bottom to enable the "I Accept" button
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-700 bg-gray-900/50">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              {!canAccept && (
                <p className="text-xs text-gray-400">
                  {!hasScrolledToBottom && '• Scroll to bottom\n'}
                  {(!allTermsChecked || !allAdditionalChecked) && '• Check all acknowledgment boxes\n'}
                  {!formComplete && '• Complete signature section'}
                </p>
              )}
              {canAccept && (
                <div className="flex items-center gap-2 text-green-400">
                  <CheckCircleIcon className="w-5 h-5" />
                  <span className="text-sm font-semibold">Ready to accept</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                onClick={onDecline}
                className="px-6 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
              >
                Decline
              </Button>
              <Button
                onClick={handleAccept}
                disabled={!canAccept}
                className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                I Accept
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper functions to get human-readable labels
function getTermLabel(key: string): string {
  const labels: Record<string, string> = {
    notLegalAdvice: 'I understand this is NOT legal advice',
    verificationRequired: 'I will verify all information with official sources',
    consultAttorneyRecommended: 'I understand consulting an attorney is recommended',
    noWarranties: 'I understand there are no warranties on accuracy or completeness',
    useAtOwnRisk: 'I use these features at my own risk',
    liabilityRelease: 'I release MuRP from liability as stated above',
    aiLimitations: 'I understand AI systems can make mistakes',
    regulatoryChanges: 'I understand regulations change and information may be outdated',
  };
  return labels[key] || key;
}

function getAdditionalTermLabel(key: string): string {
  const labels: Record<string, string> = {
    letterDraftsRequireReview: 'I understand AI letter drafts require thorough review before sending',
    complianceInfoMayBeIncomplete: 'I understand compliance information may be incomplete',
    verifyAllSourcesRequired: 'I will verify all sources and citations provided',
    documentVerificationProcess: 'I will document my verification process',
  };
  return labels[key] || key;
}

export default RegulatoryAgreementModal;
