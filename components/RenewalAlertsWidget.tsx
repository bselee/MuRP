// Renewal Alerts Widget for Dashboard
// Displays urgent and upcoming registration renewals

import React, { useMemo } from 'react';
import type { BillOfMaterials } from '../types';
import { getRegistrationsNeedingAttention } from '../services/stateRegistrationService';
import {
  ExclamationCircleIcon,
  ClockIcon,
  XCircleIcon,
  CheckCircleIcon,
  ChevronDoubleLeftIcon
} from './icons';

interface RenewalAlertsWidgetProps {
  boms: BillOfMaterials[];
  onViewDetails?: (bomId: string) => void;
}

const RenewalAlertsWidget: React.FC<RenewalAlertsWidgetProps> = ({
  boms,
  onViewDetails
}) => {
  const alerts = useMemo(() => {
    // Collect all registrations from all BOMs
    const allRegistrations = boms.flatMap(bom =>
      (bom.registrations || []).map(reg => ({
        ...reg,
        bomId: bom.id,
        bomName: bom.name,
        bomSku: bom.finishedSku
      }))
    );

    return getRegistrationsNeedingAttention(allRegistrations);
  }, [boms]);

  const totalCount = alerts.urgent.length + alerts.dueSoon.length + alerts.expired.length;

  if (totalCount === 0) {
    return (
      <div className="bg-green-900/20 border border-green-700 rounded-lg p-6">
        <div className="flex items-center gap-3">
          <CheckCircleIcon className="w-8 h-8 text-green-400 flex-shrink-0" />
          <div>
            <h3 className="text-lg font-semibold text-green-400">All Registrations Current</h3>
            <p className="text-sm text-gray-400 mt-1">
              No registrations require immediate attention.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Expired */}
        {alerts.expired.length > 0 && (
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <XCircleIcon className="w-6 h-6 text-red-400" />
              <p className="text-sm font-medium text-red-400">Expired</p>
            </div>
            <p className="text-3xl font-bold text-white">{alerts.expired.length}</p>
            <p className="text-xs text-gray-400 mt-1">
              {alerts.expired.length === 1 ? 'registration' : 'registrations'} past due
            </p>
          </div>
        )}

        {/* Urgent (30 days) */}
        {alerts.urgent.length > 0 && (
          <div className="bg-orange-900/20 border border-orange-700 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <ExclamationCircleIcon className="w-6 h-6 text-orange-400" />
              <p className="text-sm font-medium text-orange-400">Urgent</p>
            </div>
            <p className="text-3xl font-bold text-white">{alerts.urgent.length}</p>
            <p className="text-xs text-gray-400 mt-1">
              Expiring within 30 days
            </p>
          </div>
        )}

        {/* Due Soon (90 days) */}
        {alerts.dueSoon.length > 0 && (
          <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <ClockIcon className="w-6 h-6 text-yellow-400" />
              <p className="text-sm font-medium text-yellow-400">Due Soon</p>
            </div>
            <p className="text-3xl font-bold text-white">{alerts.dueSoon.length}</p>
            <p className="text-xs text-gray-400 mt-1">
              Expiring in 30-90 days
            </p>
          </div>
        )}
      </div>

      {/* Detailed List */}
      <div className="space-y-3">
        {/* Expired - Highest Priority */}
        {alerts.expired.map((reg) => (
          <div
            key={reg.id}
            className="bg-red-900/20 border border-red-700 rounded-lg p-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <XCircleIcon className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <h4 className="text-sm font-semibold text-white">
                    {reg.bomName} ({reg.bomSku})
                  </h4>
                </div>
                <p className="text-sm text-gray-300">
                  {reg.stateName} registration expired{' '}
                  {Math.abs(reg.daysUntilExpiration || 0)} days ago
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Reg #: {reg.registrationNumber}
                </p>
              </div>
              {onViewDetails && (
                <button
                  onClick={() => onViewDetails(reg.bomId)}
                  className="ml-4 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded transition-colors flex-shrink-0"
                >
                  Renew Now
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Urgent - 30 days or less */}
        {alerts.urgent.map((reg) => (
          <div
            key={reg.id}
            className="bg-orange-900/20 border border-orange-700 rounded-lg p-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <ExclamationCircleIcon className="w-5 h-5 text-orange-400 flex-shrink-0" />
                  <h4 className="text-sm font-semibold text-white">
                    {reg.bomName} ({reg.bomSku})
                  </h4>
                </div>
                <p className="text-sm text-gray-300">
                  {reg.stateName} registration expires in {reg.daysUntilExpiration} days
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Expiration: {new Date(reg.expirationDate).toLocaleDateString()} • Reg #: {reg.registrationNumber}
                </p>
              </div>
              {onViewDetails && (
                <button
                  onClick={() => onViewDetails(reg.bomId)}
                  className="ml-4 px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium rounded transition-colors flex-shrink-0"
                >
                  Review
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Due Soon - 30-90 days - Only show top 3 */}
        {alerts.dueSoon.slice(0, 3).map((reg) => (
          <div
            key={reg.id}
            className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <ClockIcon className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                  <h4 className="text-sm font-semibold text-white">
                    {reg.bomName} ({reg.bomSku})
                  </h4>
                </div>
                <p className="text-sm text-gray-300">
                  {reg.stateName} registration expires in {reg.daysUntilExpiration} days
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Expiration: {new Date(reg.expirationDate).toLocaleDateString()}
                </p>
              </div>
              {onViewDetails && (
                <button
                  onClick={() => onViewDetails(reg.bomId)}
                  className="ml-4 px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white text-xs font-medium rounded transition-colors flex-shrink-0"
                >
                  View
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Show count if more than 3 */}
        {alerts.dueSoon.length > 3 && (
          <div className="text-center py-2">
            <p className="text-sm text-gray-400">
              + {alerts.dueSoon.length - 3} more registrations due in 30-90 days
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RenewalAlertsWidget;
