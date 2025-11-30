import React, { useState } from 'react';
import type { User } from '../types';
import { ShieldCheckIcon, CheckCircleIcon, ExclamationCircleIcon } from './icons';

interface RegulatoryAgreementPanelProps {
  currentUser: User;
  onUpdateUser: (updatedUser: User) => void;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

/**
 * Regulatory Compliance Agreement Panel
 * Simplified single-checkbox acknowledgment with auto-save
 */
const RegulatoryAgreementPanel: React.FC<RegulatoryAgreementPanelProps> = ({
  currentUser,
  onUpdateUser,
  addToast,
}) => {
  const [isAcknowledging, setIsAcknowledging] = useState(false);

  // Helper to get regulatory agreement (checks new structure first, then legacy)
  const getRegulatoryAgreement = () => {
    return currentUser.agreements?.regulatory || currentUser.regulatoryAgreement;
  };

  const handleToggleAgreement = async (checked: boolean) => {
    if (isAcknowledging) return;
    
    setIsAcknowledging(true);
    
    if (checked) {
      // Auto-save acceptance
      const updatedUser: User = {
        ...currentUser,
        agreements: {
          ...currentUser.agreements,
          regulatory: {
            accepted: true,
            acceptedAt: new Date().toISOString(),
            version: '1.0',
            fullName: currentUser.name,
            title: currentUser.role,
            companyName: 'MuRP',
            electronicSignature: currentUser.name,
          },
        },
        // Keep legacy field for backward compatibility
        regulatoryAgreement: {
          accepted: true,
          acceptedAt: new Date().toISOString(),
          version: '1.0',
          fullName: currentUser.name,
          title: currentUser.role,
          companyName: 'MuRP',
          electronicSignature: currentUser.name,
        },
      };
      onUpdateUser(updatedUser);
      addToast(
        'Regulatory Compliance Agreement accepted. You can now access compliance features.',
        'success'
      );
    } else {
      // Auto-save revocation
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
    }
    
    setIsAcknowledging(false);
  };

  const agreement = getRegulatoryAgreement();

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
      <div className="flex items-start gap-4 mb-4">
        {agreement?.accepted ? (
          <CheckCircleIcon className="w-8 h-8 text-green-400 flex-shrink-0" />
        ) : (
          <ExclamationCircleIcon className="w-8 h-8 text-yellow-500 flex-shrink-0" />
        )}
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white">
            Regulatory Compliance Agreement
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            {agreement?.accepted
              ? 'You have accepted the agreement and can use compliance features.'
              : 'Accept the agreement to use state regulatory research, compliance scanning, and letter drafting features.'}
          </p>
        </div>
      </div>

      {/* Single Acknowledgment Checkbox - Always Visible */}
      <div className="space-y-4">
        {/* Warning Box (shown when not accepted) */}
        {!agreement?.accepted && (
          <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
            <h4 className="text-sm font-bold text-yellow-400 mb-2">
              ⚠️ Legal Agreement Required
            </h4>
            <p className="text-xs text-gray-300 leading-relaxed">
              Our regulatory compliance features provide AI-generated research and guidance about
              state-level agriculture regulations. This is <strong>NOT legal advice</strong> and
              requires careful verification by qualified legal counsel.
            </p>
          </div>
        )}

        {/* Agreement Details (shown when accepted) */}
        {agreement?.accepted && (
          <div className="bg-gray-900/50 rounded-lg p-4 space-y-2">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Accepted By:</span>
                <span className="ml-2 text-white font-semibold">{agreement?.fullName}</span>
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
        )}

        {/* Features Covered */}
        <div className="bg-gray-900/50 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-300 mb-3">
            Features Covered by This Agreement:
          </h4>
          <ul className="space-y-2 text-xs text-gray-400">
            <li className="flex items-start gap-2">
              <span className="text-accent-400 mt-1">•</span>
              <span>AI-powered state regulatory research (all 50 states)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent-400 mt-1">•</span>
              <span>Proactive BOM compliance scanning</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent-400 mt-1">•</span>
              <span>State agency contact database and research</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent-400 mt-1">•</span>
              <span>Letter upload and AI analysis</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent-400 mt-1">•</span>
              <span>AI-assisted draft letter generation</span>
            </li>
          </ul>
        </div>

        {/* Single Acknowledgment Checkbox with Agreement Text */}
        <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
          <h4 className="text-sm font-semibold text-gray-300 mb-3">Acknowledgment:</h4>
          <div className="text-xs text-gray-400 leading-relaxed mb-4 space-y-2">
            <p>
              I acknowledge that the regulatory compliance features in this system provide AI-generated 
              research and analysis for informational purposes only. I understand that:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>This information is NOT legal advice and should not be relied upon as such</li>
              <li>All AI-generated content must be verified by qualified legal counsel</li>
              <li>State regulations change frequently and may not reflect the most current laws</li>
              <li>I am responsible for ensuring compliance with all applicable regulations</li>
              <li>The system provider assumes no liability for compliance decisions made based on this information</li>
            </ul>
          </div>
          
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={agreement?.accepted || false}
              onChange={(e) => handleToggleAgreement(e.target.checked)}
              disabled={isAcknowledging}
              className="mt-1 w-5 h-5 rounded border-gray-600 text-accent-500 focus:ring-accent-500 focus:ring-offset-gray-800 disabled:opacity-50"
            />
            <span className="text-sm text-gray-300 group-hover:text-white transition-colors font-medium">
              I have read and acknowledge the terms above. I agree to use compliance features responsibly 
              and verify all information with qualified legal counsel.
            </span>
          </label>
        </div>
      </div>
    </div>
  );
};

export default RegulatoryAgreementPanel;
