import React, { useState } from 'react';
import type { User } from '../types';
import type { RegulatoryUserAgreement } from '../types/userAgreements';
import { ShieldCheckIcon, CheckCircleIcon, ExclamationCircleIcon } from './icons';
import RegulatoryAgreementModal from './RegulatoryAgreementModal';

interface RegulatoryAgreementPanelProps {
  currentUser: User;
  onUpdateUser: (updatedUser: User) => void;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

/**
 * Regulatory Compliance Agreement Panel
 * Handles user agreement acceptance, revocation, and display
 */
const RegulatoryAgreementPanel: React.FC<RegulatoryAgreementPanelProps> = ({
  currentUser,
  onUpdateUser,
  addToast,
}) => {
  const [isAgreementModalOpen, setIsAgreementModalOpen] = useState(false);

  // Helper to get regulatory agreement (checks new structure first, then legacy)
  const getRegulatoryAgreement = () => {
    return currentUser.agreements?.regulatory || currentUser.regulatoryAgreement;
  };

  const handleAcceptAgreement = (agreement: Omit<RegulatoryUserAgreement, 'userId'>) => {
    const updatedUser: User = {
      ...currentUser,
      agreements: {
        ...currentUser.agreements,
        regulatory: {
          accepted: true,
          acceptedAt: agreement.acceptedAt,
          version: agreement.version,
          fullName: agreement.fullName,
          title: agreement.title,
          companyName: agreement.companyName,
          electronicSignature: agreement.electronicSignature,
        },
      },
      // Keep legacy field for backward compatibility
      regulatoryAgreement: {
        accepted: true,
        acceptedAt: agreement.acceptedAt,
        version: agreement.version,
        fullName: agreement.fullName,
        title: agreement.title,
        companyName: agreement.companyName,
        electronicSignature: agreement.electronicSignature,
      },
    };
    onUpdateUser(updatedUser);
    setIsAgreementModalOpen(false);
    addToast(
      'Regulatory Compliance Agreement accepted. You can now access compliance features.',
      'success'
    );
  };

  const handleDeclineAgreement = () => {
    setIsAgreementModalOpen(false);
    addToast('You must accept the agreement to use regulatory compliance features.', 'info');
  };

  const handleRevokeAgreement = () => {
    const updatedUser: User = {
      ...currentUser,
      agreements: {
        ...currentUser.agreements,
        regulatory: {
          accepted: false,
        },
      },
      // Keep legacy field for backward compatibility
      regulatoryAgreement: {
        accepted: false,
      },
    };
    onUpdateUser(updatedUser);
    addToast(
      'Regulatory Compliance Agreement revoked. Compliance features are now disabled.',
      'info'
    );
  };

  const agreement = getRegulatoryAgreement();

  return (
    <>
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <div className="flex items-start gap-4 mb-4">
          {agreement?.accepted ? (
            <CheckCircleIcon className="w-8 h-8 text-green-400 flex-shrink-0" />
          ) : (
            <ExclamationCircleIcon className="w-8 h-8 text-yellow-500 flex-shrink-0" />
          )}
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white">
              {agreement?.accepted ? 'Agreement Accepted' : 'Agreement Required'}
            </h3>
            <p className="text-sm text-gray-400 mt-1">
              {agreement?.accepted
                ? 'You have accepted the Regulatory Compliance Agreement and can use compliance features.'
                : 'You must accept the Regulatory Compliance Agreement to use state regulatory research, compliance scanning, and letter drafting features.'}
            </p>
          </div>
        </div>

        {agreement?.accepted ? (
          <div className="space-y-4">
            {/* Agreement Details */}
            <div className="bg-gray-900/50 rounded-lg p-4 space-y-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Accepted By:</span>
                  <span className="ml-2 text-white font-semibold">{agreement?.fullName}</span>
                </div>
                <div>
                  <span className="text-gray-400">Title:</span>
                  <span className="ml-2 text-white">{agreement?.title}</span>
                </div>
                <div>
                  <span className="text-gray-400">Company:</span>
                  <span className="ml-2 text-white">{agreement?.companyName}</span>
                </div>
                <div>
                  <span className="text-gray-400">Date:</span>
                  <span className="ml-2 text-white">
                    {agreement?.acceptedAt
                      ? new Date(agreement.acceptedAt).toLocaleDateString()
                      : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Version:</span>
                  <span className="ml-2 text-white">{agreement?.version || '1.0'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Status:</span>
                  <span className="ml-2 text-green-400 font-semibold">Active</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center pt-4 border-t border-gray-700">
              <button
                onClick={() => setIsAgreementModalOpen(true)}
                className="text-sm text-indigo-400 hover:text-indigo-300 font-semibold"
              >
                View Full Agreement
              </button>
              <button
                onClick={handleRevokeAgreement}
                className="text-sm bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors"
              >
                Revoke Agreement
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Warning Box */}
            <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
              <h4 className="text-sm font-bold text-yellow-400 mb-2">
                ⚠️ Legal Agreement Required
              </h4>
              <p className="text-xs text-gray-300 leading-relaxed">
                Our regulatory compliance features provide AI-generated research and guidance about
                state-level agriculture regulations. This is <strong>NOT legal advice</strong> and
                requires careful verification. You must read and accept the full agreement to
                proceed.
              </p>
            </div>

            {/* Features Covered */}
            <div className="bg-gray-900/50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-300 mb-3">
                Features Covered by This Agreement:
              </h4>
              <ul className="space-y-2 text-xs text-gray-400">
                <li className="flex items-start gap-2">
                  <span className="text-indigo-400 mt-1">•</span>
                  <span>AI-powered state regulatory research (all 50 states)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-400 mt-1">•</span>
                  <span>Proactive BOM compliance scanning</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-400 mt-1">•</span>
                  <span>State agency contact database and research</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-400 mt-1">•</span>
                  <span>Letter upload and AI analysis</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-400 mt-1">•</span>
                  <span>AI-assisted draft letter generation</span>
                </li>
              </ul>
            </div>

            {/* Accept Button */}
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setIsAgreementModalOpen(true)}
                className="bg-indigo-600 text-white px-6 py-3 rounded-md hover:bg-indigo-700 transition-colors font-semibold"
              >
                Review and Accept Agreement
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      <RegulatoryAgreementModal
        isOpen={isAgreementModalOpen}
        onAccept={handleAcceptAgreement}
        onDecline={handleDeclineAgreement}
        currentUser={currentUser}
      />
    </>
  );
};

export default RegulatoryAgreementPanel;
