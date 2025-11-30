import Button from '@/components/ui/Button';
// Registration Management Component
// Manages state-by-state product registrations with renewal tracking

import React, { useState, useMemo } from 'react';
import type { ProductRegistration, BillOfMaterials } from '../types';
import {
  STATE_GUIDELINES,
  calculateRenewalStatus,
  calculateDaysUntilExpiration
} from '../services/stateRegistrationService';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  XCircleIcon,
  PlusCircleIcon,
  PencilSquareIcon,
  ArrowDownTrayIcon,
  InformationCircleIcon
} from './icons';

interface RegistrationManagementProps {
  bom: BillOfMaterials;
  onAddRegistration: () => void; // Callback to trigger opening add modal
  onEditRegistration: (registration: ProductRegistration) => void; // Callback to trigger opening edit modal
  onDeleteRegistration: (registrationId: string) => void;
}

const RegistrationManagement: React.FC<RegistrationManagementProps> = ({
  bom,
  onAddRegistration,
  onEditRegistration,
  onDeleteRegistration
}) => {
  const [showGuidelines, setShowGuidelines] = useState(false);
  const [selectedState, setSelectedState] = useState<string | null>(null);

  const registrations = bom.registrations || [];

  // Calculate statuses
  const enrichedRegistrations = useMemo(() => {
    return registrations.map(reg => ({
      ...reg,
      renewalStatus: calculateRenewalStatus(reg.expirationDate),
      daysUntilExpiration: calculateDaysUntilExpiration(reg.expirationDate)
    }));
  }, [registrations]);

  // Group by status
  const grouped = useMemo(() => {
    const current = enrichedRegistrations.filter(r => r.renewalStatus === 'current');
    const dueSoon = enrichedRegistrations.filter(r => r.renewalStatus === 'due_soon');
    const urgent = enrichedRegistrations.filter(r => r.renewalStatus === 'urgent');
    const expired = enrichedRegistrations.filter(r => r.renewalStatus === 'expired');

    return { current, dueSoon, urgent, expired };
  }, [enrichedRegistrations]);

  const getStatusBadge = (status: ProductRegistration['renewalStatus']) => {
    switch (status) {
      case 'current':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-900/30 text-green-300 border border-green-700">
            <CheckCircleIcon className="w-4 h-4" />
            Current
          </span>
        );
      case 'due_soon':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-yellow-900/30 text-yellow-300 border border-yellow-700">
            <ClockIcon className="w-4 h-4" />
            Due Soon
          </span>
        );
      case 'urgent':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-orange-900/30 text-orange-300 border border-orange-700">
            <ExclamationCircleIcon className="w-4 h-4" />
            Urgent
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-red-900/30 text-red-300 border border-red-700">
            <XCircleIcon className="w-4 h-4" />
            Expired
          </span>
        );
    }
  };

  const RegistrationCard: React.FC<{ registration: ProductRegistration & { daysUntilExpiration?: number } }> = ({ registration }) => {
    const guidelines = STATE_GUIDELINES[registration.stateCode];

    return (
      <div className="bg-gray-800/30 rounded-lg border border-gray-700 p-4 hover:bg-gray-800/50 transition-colors">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h4 className="text-lg font-semibold text-white">{registration.stateName}</h4>
              {getStatusBadge(registration.renewalStatus)}
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-gray-400">
                <span className="font-medium text-gray-300">Registration #:</span>{' '}
                <span className="font-mono">{registration.registrationNumber}</span>
              </p>
              <p className="text-gray-400">
                <span className="font-medium text-gray-300">Expires:</span>{' '}
                {new Date(registration.expirationDate).toLocaleDateString()}
                {registration.daysUntilExpiration !== undefined && registration.daysUntilExpiration > 0 && (
                  <span className="ml-2 text-xs">
                    ({registration.daysUntilExpiration} days remaining)
                  </span>
                )}
                {registration.daysUntilExpiration !== undefined && registration.daysUntilExpiration < 0 && (
                  <span className="ml-2 text-xs text-red-400">
                    (Expired {Math.abs(registration.daysUntilExpiration)} days ago)
                  </span>
                )}
              </p>
              {registration.renewalFee && (
                <p className="text-gray-400">
                  <span className="font-medium text-gray-300">Renewal Fee:</span> ${registration.renewalFee}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <Button
              onClick={() => onEditRegistration(registration)}
              className="p-2 text-accent-400 hover:bg-accent-900/20 rounded-lg transition-colors"
              title="Edit"
            >
              <PencilSquareIcon className="w-5 h-5" />
            </Button>
            {registration.certificateUrl && (
              <a
                href={registration.certificateUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-blue-400 hover:bg-blue-900/20 rounded-lg transition-colors"
                title="Download Certificate"
              >
                <ArrowDownTrayIcon className="w-5 h-5" />
              </a>
            )}
          </div>
        </div>

        {/* Guidelines Info */}
        {guidelines && (
          <div className="mt-3 pt-3 border-t border-gray-700">
            <Button
              onClick={() => {
                setSelectedState(registration.stateCode);
                setShowGuidelines(true);
              }}
              className="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
            >
              <InformationCircleIcon className="w-4 h-4" />
              View {registration.stateName} Registration Requirements
            </Button>
          </div>
        )}

        {registration.notes && (
          <div className="mt-3 pt-3 border-t border-gray-700">
            <p className="text-xs text-gray-500">
              <span className="font-medium">Notes:</span> {registration.notes}
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-white">State Registrations</h3>
          <p className="text-sm text-gray-400 mt-1">
            Track product registrations and renewal deadlines across all states
          </p>
        </div>
        <Button
          onClick={onAddRegistration}
          className="flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
        >
          <PlusCircleIcon className="w-5 h-5" />
          Add Registration
        </Button>
      </div>

      {/* Summary Cards */}
      {registrations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-green-900/20 border border-green-700 rounded-lg p-4">
            <p className="text-sm text-green-400 font-medium mb-1">Current</p>
            <p className="text-3xl font-bold text-white">{grouped.current.length}</p>
          </div>
          <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
            <p className="text-sm text-yellow-400 font-medium mb-1">Due Soon (90 days)</p>
            <p className="text-3xl font-bold text-white">{grouped.dueSoon.length}</p>
          </div>
          <div className="bg-orange-900/20 border border-orange-700 rounded-lg p-4">
            <p className="text-sm text-orange-400 font-medium mb-1">Urgent (30 days)</p>
            <p className="text-3xl font-bold text-white">{grouped.urgent.length}</p>
          </div>
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
            <p className="text-sm text-red-400 font-medium mb-1">Expired</p>
            <p className="text-3xl font-bold text-white">{grouped.expired.length}</p>
          </div>
        </div>
      )}

      {/* Registrations List */}
      {registrations.length === 0 ? (
        <div className="bg-gray-800/30 rounded-lg border-2 border-dashed border-gray-700 p-12 text-center">
          <InformationCircleIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h4 className="text-lg font-medium text-gray-400 mb-2">No State Registrations Yet</h4>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            Add state registrations to track renewal deadlines and ensure compliance across all markets where you sell this product.
          </p>
          <Button
            onClick={onAddRegistration}
            className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            <PlusCircleIcon className="w-5 h-5" />
            Add Your First Registration
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Expired (highest priority) */}
          {grouped.expired.length > 0 && (
            <div>
              <h4 className="text-md font-semibold text-red-400 mb-3 flex items-center gap-2">
                <XCircleIcon className="w-5 h-5" />
                Expired Registrations ({grouped.expired.length})
              </h4>
              <div className="space-y-3">
                {grouped.expired.map(reg => (
                  <RegistrationCard key={reg.id} registration={reg} />
                ))}
              </div>
            </div>
          )}

          {/* Urgent */}
          {grouped.urgent.length > 0 && (
            <div>
              <h4 className="text-md font-semibold text-orange-400 mb-3 flex items-center gap-2">
                <ExclamationCircleIcon className="w-5 h-5" />
                Urgent - Expiring Within 30 Days ({grouped.urgent.length})
              </h4>
              <div className="space-y-3">
                {grouped.urgent.map(reg => (
                  <RegistrationCard key={reg.id} registration={reg} />
                ))}
              </div>
            </div>
          )}

          {/* Due Soon */}
          {grouped.dueSoon.length > 0 && (
            <div>
              <h4 className="text-md font-semibold text-yellow-400 mb-3 flex items-center gap-2">
                <ClockIcon className="w-5 h-5" />
                Due Soon - 30-90 Days ({grouped.dueSoon.length})
              </h4>
              <div className="space-y-3">
                {grouped.dueSoon.map(reg => (
                  <RegistrationCard key={reg.id} registration={reg} />
                ))}
              </div>
            </div>
          )}

          {/* Current */}
          {grouped.current.length > 0 && (
            <div>
              <h4 className="text-md font-semibold text-green-400 mb-3 flex items-center gap-2">
                <CheckCircleIcon className="w-5 h-5" />
                Current Registrations ({grouped.current.length})
              </h4>
              <div className="space-y-3">
                {grouped.current.map(reg => (
                  <RegistrationCard key={reg.id} registration={reg} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals would go here - we'll create separate components */}
    </div>
  );
};

export default RegistrationManagement;
