/**
 * Empty State Guidance Component
 *
 * Displays helpful guidance when a page has no data.
 * Distinguishes between: not configured, configured but empty, error states.
 */

import React from 'react';
import { useTheme } from './ThemeProvider';
import {
  PackageIcon,
  TruckIcon,
  DocumentTextIcon,
  SettingsIcon,
  PlusCircleIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  LinkIcon,
} from './icons';
import Button from './ui/Button';

export type EmptyStateType =
  | 'not_configured'      // No data source connected
  | 'configured_empty'    // Data source connected but no data imported yet (waiting for sync)
  | 'synced_empty'        // Data source synced successfully but has no records
  | 'no_results'          // Filters returned no results
  | 'error'               // Failed to load data
  | 'loading';            // Still loading

export interface EmptyStateGuidanceProps {
  type: EmptyStateType;
  context: 'inventory' | 'vendors' | 'purchase_orders' | 'boms' | 'general';
  onAction?: (action: string) => void;
  errorMessage?: string;
  className?: string;
}

interface ContextConfig {
  icon: React.ReactNode;
  title: string;
  notConfiguredMessage: string;
  configuredEmptyMessage: string;  // Waiting for sync
  syncedEmptyMessage: string;      // Synced but source has no data
  primaryAction: { label: string; action: string };
  secondaryAction?: { label: string; action: string };
}

const CONTEXT_CONFIGS: Record<EmptyStateGuidanceProps['context'], ContextConfig> = {
  inventory: {
    icon: <PackageIcon className="w-12 h-12" />,
    title: 'Inventory',
    notConfiguredMessage: 'Connect your inventory system to start tracking stock levels and managing orders.',
    configuredEmptyMessage: 'Your data source is connected. Waiting for data to sync—this usually takes a few minutes.',
    syncedEmptyMessage: 'Sync completed but no inventory items found. Check your source or add items manually.',
    primaryAction: { label: 'Sync Data', action: 'settings_integrations' },
    secondaryAction: { label: 'Add Item', action: 'add_item' },
  },
  vendors: {
    icon: <TruckIcon className="w-12 h-12" />,
    title: 'Vendors',
    notConfiguredMessage: 'Connect your inventory system to import vendors automatically.',
    configuredEmptyMessage: 'Your data source is connected. Vendors will appear after the next sync.',
    syncedEmptyMessage: 'Sync completed but no vendors found. Add vendors manually to get started.',
    primaryAction: { label: 'Import Vendors', action: 'settings_integrations' },
    secondaryAction: { label: 'Add Vendor', action: 'add_vendor' },
  },
  purchase_orders: {
    icon: <DocumentTextIcon className="w-12 h-12" />,
    title: 'Purchase Orders',
    notConfiguredMessage: 'Connect your inventory system first, then you can create and track purchase orders.',
    configuredEmptyMessage: 'Your data source is connected. Once inventory syncs, you can create purchase orders.',
    syncedEmptyMessage: 'Ready to create your first purchase order.',
    primaryAction: { label: 'Create PO', action: 'create_po' },
  },
  boms: {
    icon: <PackageIcon className="w-12 h-12" />,
    title: 'Bills of Materials',
    notConfiguredMessage: 'Connect your inventory system to import BOMs automatically.',
    configuredEmptyMessage: 'Your data source is connected. BOMs will sync with your next data refresh.',
    syncedEmptyMessage: 'No BOMs found in your data source. Create them manually or check your source.',
    primaryAction: { label: 'Import BOMs', action: 'settings_integrations' },
    secondaryAction: { label: 'Create BOM', action: 'create_bom' },
  },
  general: {
    icon: <SettingsIcon className="w-12 h-12" />,
    title: 'Get Started',
    notConfiguredMessage: 'Connect your inventory system to start using MuRP.',
    configuredEmptyMessage: 'Your data source is connected. Data will appear after the initial sync.',
    syncedEmptyMessage: 'No data found. Check your data source or add items manually.',
    primaryAction: { label: 'Go to Settings', action: 'settings' },
  },
};

const EmptyStateGuidance: React.FC<EmptyStateGuidanceProps> = ({
  type,
  context,
  onAction,
  errorMessage,
  className = '',
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const config = CONTEXT_CONFIGS[context];

  const handleAction = (action: string) => {
    onAction?.(action);
  };

  // Container styles
  const containerClass = isDark
    ? 'bg-gray-800/30 border-gray-700/50'
    : 'bg-gray-50 border-gray-200';

  // Icon container styles based on state
  const getIconContainerClass = () => {
    if (type === 'error') {
      return isDark ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-600';
    }
    if (type === 'not_configured') {
      return isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-600';
    }
    return isDark ? 'bg-gray-700/50 text-gray-400' : 'bg-gray-200 text-gray-500';
  };

  if (type === 'loading') {
    return (
      <div className={`flex flex-col items-center justify-center py-16 ${className}`}>
        <div className="animate-pulse">
          <div className={`w-16 h-16 rounded-full ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
        </div>
        <p className={`mt-4 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          Loading...
        </p>
      </div>
    );
  }

  if (type === 'error') {
    return (
      <div className={`flex flex-col items-center justify-center py-16 px-6 rounded-xl border ${containerClass} ${className}`}>
        <div className={`p-4 rounded-full ${getIconContainerClass()}`}>
          <ExclamationCircleIcon className="w-12 h-12" />
        </div>
        <h3 className={`mt-4 text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Failed to Load {config.title}
        </h3>
        <p className={`mt-2 text-sm text-center max-w-md ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          {errorMessage || 'An error occurred while loading data. Please try again.'}
        </p>
        <Button
          onClick={() => handleAction('retry')}
          className={`mt-6 px-4 py-2 rounded-lg font-medium ${
            isDark
              ? 'bg-gray-700 hover:bg-gray-600 text-white'
              : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
          }`}
        >
          Try Again
        </Button>
      </div>
    );
  }

  if (type === 'no_results') {
    return (
      <div className={`flex flex-col items-center justify-center py-12 px-6 ${className}`}>
        <div className={`p-3 rounded-full ${isDark ? 'bg-gray-700/50 text-gray-400' : 'bg-gray-200 text-gray-500'}`}>
          {config.icon}
        </div>
        <h3 className={`mt-4 text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          No Results Found
        </h3>
        <p className={`mt-2 text-sm text-center max-w-md ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Your filters returned no results. Try adjusting your search or filters.
        </p>
        <Button
          onClick={() => handleAction('clear_filters')}
          className={`mt-4 px-4 py-2 rounded-lg font-medium ${
            isDark
              ? 'bg-gray-700 hover:bg-gray-600 text-white'
              : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
          }`}
        >
          Clear Filters
        </Button>
      </div>
    );
  }

  const isNotConfigured = type === 'not_configured';
  const isConfiguredEmpty = type === 'configured_empty';
  const isSyncedEmpty = type === 'synced_empty';

  // Choose the right message based on type
  const message = isNotConfigured
    ? config.notConfiguredMessage
    : isConfiguredEmpty
    ? config.configuredEmptyMessage
    : config.syncedEmptyMessage;

  return (
    <div className={`flex flex-col items-center justify-center py-16 px-6 rounded-xl border ${containerClass} ${className}`}>
      {/* Status Badge */}
      {isNotConfigured && (
        <div className={`mb-4 flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
          isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'
        }`}>
          <LinkIcon className="w-3 h-3" />
          No Data Source Connected
        </div>
      )}
      {isConfiguredEmpty && (
        <div className={`mb-4 flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
          isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'
        }`}>
          <CheckCircleIcon className="w-3 h-3" />
          Connected — Waiting for Sync
        </div>
      )}

      {/* Icon */}
      <div className={`p-4 rounded-full ${getIconContainerClass()}`}>
        {config.icon}
      </div>

      {/* Title */}
      <h3 className={`mt-4 text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
        {isNotConfigured
          ? `Set Up ${config.title}`
          : isConfiguredEmpty
          ? `${config.title} Syncing...`
          : `No ${config.title} Yet`}
      </h3>

      {/* Description */}
      <p className={`mt-2 text-sm text-center max-w-lg ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
        {message}
      </p>

      {/* Simple CTA for not configured state */}
      {isNotConfigured && (
        <div className="mt-6">
          <Button
            onClick={() => handleAction('settings_integrations')}
            className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium bg-accent-500 hover:bg-accent-600 text-white"
          >
            <SettingsIcon className="w-5 h-5" />
            Set Up Data Source
          </Button>
        </div>
      )}

      {/* Waiting for sync state - show check status button */}
      {isConfiguredEmpty && (
        <div className="mt-6">
          <Button
            onClick={() => handleAction('settings_integrations')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium ${
              isDark
                ? 'bg-gray-700 hover:bg-gray-600 text-white'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
            }`}
          >
            <SettingsIcon className="w-4 h-4" />
            Check Sync Status
          </Button>
        </div>
      )}

      {/* Action Buttons (for synced but empty state) */}
      {isSyncedEmpty && (
        <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
          <Button
            onClick={() => handleAction(config.primaryAction.action)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium bg-accent-500 hover:bg-accent-600 text-white"
          >
            <PlusCircleIcon className="w-4 h-4" />
            {config.primaryAction.label}
          </Button>
          {config.secondaryAction && (
            <Button
              onClick={() => handleAction(config.secondaryAction!.action)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium ${
                isDark
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
              }`}
            >
              {config.secondaryAction.label}
            </Button>
          )}
        </div>
      )}

    </div>
  );
};

export default EmptyStateGuidance;
