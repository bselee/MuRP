/**
 * Setup Status Card
 *
 * Shows onboarding progress and next steps on the Dashboard.
 * Helps new users understand what to do next.
 */

import React from 'react';
import { useTheme } from './ThemeProvider';
import {
  CheckCircleIcon,
  LinkIcon,
  PackageIcon,
  TruckIcon,
  DocumentTextIcon,
  ChevronRightIcon,
  SettingsIcon,
} from './icons';
import Button from './ui/Button';
import { DataSourceSummary, SETUP_STEP_INFO, SetupStep } from '../services/dataSourceStatusService';

interface SetupStatusCardProps {
  status: DataSourceSummary;
  onNavigate: (page: string) => void;
  onDismiss?: () => void;
}

interface StepConfig {
  id: SetupStep;
  icon: React.ReactNode;
  check: (status: DataSourceSummary) => boolean;
}

const STEPS: StepConfig[] = [
  {
    id: 'connect_data_source',
    icon: <LinkIcon className="w-4 h-4" />,
    check: (s) => s.hasAnyDataSource,
  },
  {
    id: 'import_inventory',
    icon: <PackageIcon className="w-4 h-4" />,
    check: (s) => s.counts.inventory > 0,
  },
  {
    id: 'import_vendors',
    icon: <TruckIcon className="w-4 h-4" />,
    check: (s) => s.counts.vendors > 0,
  },
  {
    id: 'create_first_po',
    icon: <DocumentTextIcon className="w-4 h-4" />,
    check: (s) => s.counts.purchaseOrders > 0,
  },
];

const SetupStatusCard: React.FC<SetupStatusCardProps> = ({
  status,
  onNavigate,
  onDismiss,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Calculate completion
  const completedSteps = STEPS.filter(step => step.check(status)).length;
  const totalSteps = STEPS.length;
  const progressPercent = (completedSteps / totalSteps) * 100;

  // Don't show if setup is complete
  if (status.setupComplete) {
    return null;
  }

  const nextStep = status.nextStep;
  const nextStepInfo = nextStep ? SETUP_STEP_INFO[nextStep] : null;

  const handleAction = () => {
    if (!nextStepInfo) return;

    // Navigate to appropriate page
    if (nextStepInfo.page === 'Settings') {
      onNavigate('Settings');
      // Could add hash navigation to specific section
    } else {
      onNavigate(nextStepInfo.page);
    }
  };

  const cardClass = isDark
    ? 'bg-gradient-to-br from-gray-800/80 via-gray-800/60 to-gray-900/80 border border-gray-700/50'
    : 'bg-gradient-to-br from-white via-gray-50 to-white border border-gray-200';

  return (
    <div className={`rounded-xl p-5 ${cardClass}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isDark ? 'bg-accent-500/20' : 'bg-accent-100'}`}>
            <SettingsIcon className={`w-5 h-5 ${isDark ? 'text-accent-400' : 'text-accent-600'}`} />
          </div>
          <div>
            <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Complete Your Setup
            </h3>
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {completedSteps} of {totalSteps} steps complete
            </p>
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className={`text-xs ${isDark ? 'text-gray-500 hover:text-gray-400' : 'text-gray-400 hover:text-gray-500'}`}
          >
            Dismiss
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className={`mt-4 h-2 rounded-full overflow-hidden ${isDark ? 'bg-gray-700/50' : 'bg-gray-200'}`}>
        <div
          className="h-full bg-accent-500 transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Step Indicators */}
      <div className="mt-4 flex items-center justify-between">
        {STEPS.map((step, index) => {
          const isComplete = step.check(status);
          const isCurrent = step.id === nextStep;
          const info = SETUP_STEP_INFO[step.id];

          return (
            <div key={step.id} className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                  isComplete
                    ? 'bg-green-500 text-white'
                    : isCurrent
                    ? isDark
                      ? 'bg-accent-500/30 text-accent-400 ring-2 ring-accent-500'
                      : 'bg-accent-100 text-accent-600 ring-2 ring-accent-500'
                    : isDark
                    ? 'bg-gray-700/50 text-gray-500'
                    : 'bg-gray-200 text-gray-400'
                }`}
                title={info.title}
              >
                {isComplete ? <CheckCircleIcon className="w-4 h-4" /> : step.icon}
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`w-8 sm:w-12 h-0.5 mx-1 ${
                    isComplete
                      ? 'bg-green-500'
                      : isDark
                      ? 'bg-gray-700/50'
                      : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Next Step CTA */}
      {nextStepInfo && (
        <div className={`mt-5 p-4 rounded-lg ${isDark ? 'bg-gray-700/30' : 'bg-gray-100/80'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-xs font-medium uppercase tracking-wide ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                Next Step
              </p>
              <p className={`mt-1 font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {nextStepInfo.title}
              </p>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                {nextStepInfo.description}
              </p>
            </div>
            <Button
              onClick={handleAction}
              className="flex items-center gap-1 px-4 py-2 rounded-lg font-medium bg-accent-500 hover:bg-accent-600 text-white whitespace-nowrap"
            >
              {nextStepInfo.action}
              <ChevronRightIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Data Source Status */}
      {status.hasAnyDataSource && (
        <div className={`mt-4 flex items-center gap-2 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          <CheckCircleIcon className={`w-3 h-3 ${isDark ? 'text-green-400' : 'text-green-500'}`} />
          <span>
            Connected to{' '}
            <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>
              {status.primarySource === 'finale' ? 'Finale API' :
               status.primarySource === 'google_sheets' ? 'Google Sheets' :
               'data source'}
            </span>
            {status.sources.finale.lastSyncAt && (
              <span> (last sync: {new Date(status.sources.finale.lastSyncAt).toLocaleString()})</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
};

export default SetupStatusCard;
