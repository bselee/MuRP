import React from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { Button } from '@/components/ui/Button';

/**
 * Button variant types for EmptyState actions.
 */
type ActionVariant = 'primary' | 'secondary';

/**
 * Size configuration for EmptyState display.
 * - sm: Compact for inline/card empty states
 * - md: Default for page sections
 * - lg: Large for full page empty states
 */
type EmptyStateSize = 'sm' | 'md' | 'lg';

interface EmptyStateAction {
  /** Button label text */
  label: string;
  /** Click handler */
  onClick: () => void;
  /** Button style variant */
  variant?: ActionVariant;
}

interface EmptyStateProps {
  /** Optional icon to display above the title */
  icon?: React.ReactNode;
  /** Main title text (required) */
  title: string;
  /** Optional description text below the title */
  description?: string;
  /** Primary action button configuration */
  action?: EmptyStateAction;
  /** Secondary action button configuration */
  secondaryAction?: EmptyStateAction;
  /** Additional CSS classes */
  className?: string;
  /** Size variant affecting padding and text sizes */
  size?: EmptyStateSize;
}

/** Size-specific styling configuration */
const sizeConfig: Record<EmptyStateSize, {
  container: string;
  iconWrapper: string;
  title: string;
  description: string;
  buttonSize: 'xs' | 'sm' | 'md';
}> = {
  sm: {
    container: 'py-6 px-4',
    iconWrapper: 'h-10 w-10 mb-2',
    title: 'text-sm font-medium',
    description: 'text-xs',
    buttonSize: 'xs',
  },
  md: {
    container: 'py-10 px-6',
    iconWrapper: 'h-12 w-12 mb-3',
    title: 'text-base font-semibold',
    description: 'text-sm',
    buttonSize: 'sm',
  },
  lg: {
    container: 'py-16 px-8',
    iconWrapper: 'h-16 w-16 mb-4',
    title: 'text-lg font-semibold',
    description: 'text-base',
    buttonSize: 'md',
  },
};

/**
 * EmptyState - Displays placeholder content when no data is available.
 * Features dashed border, centered content, optional icon, and action buttons.
 * Supports both light and dark themes with fade-in animation.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className = '',
  size = 'md',
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const config = sizeConfig[size];

  // Theme-aware styling
  const containerStyles = isDark
    ? 'border-gray-700 bg-gray-800/30'
    : 'border-gray-300 bg-gray-50';

  const titleStyles = isDark
    ? 'text-gray-100'
    : 'text-gray-900';

  const descriptionStyles = isDark
    ? 'text-gray-400'
    : 'text-gray-500';

  const iconWrapperStyles = isDark
    ? 'bg-gray-700/50 text-gray-400'
    : 'bg-gray-100 text-gray-400';

  return (
    <div
      className={`
        flex flex-col items-center justify-center text-center
        border-2 border-dashed rounded-lg
        animate-fade-in
        ${config.container}
        ${containerStyles}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
      role="status"
      aria-label={title}
    >
      {/* Icon container */}
      {icon && (
        <div
          className={`
            flex items-center justify-center rounded-full
            ${config.iconWrapper}
            ${iconWrapperStyles}
          `.trim().replace(/\s+/g, ' ')}
        >
          {icon}
        </div>
      )}

      {/* Title */}
      <h3 className={`${config.title} ${titleStyles}`}>
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className={`mt-1 max-w-sm ${config.description} ${descriptionStyles}`}>
          {description}
        </p>
      )}

      {/* Action buttons */}
      {(action || secondaryAction) && (
        <div className="mt-4 flex items-center gap-3">
          {action && (
            <Button
              variant={action.variant || 'primary'}
              size={config.buttonSize}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant={secondaryAction.variant || 'secondary'}
              size={config.buttonSize}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Common Preset Empty States
// ============================================================================

interface NoResultsProps {
  /** Search query that returned no results */
  query?: string;
  /** Action to clear search/filters */
  onClear?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * NoResults - Empty state for search/filter scenarios with no matches.
 */
export const NoResults: React.FC<NoResultsProps> = ({
  query,
  onClear,
  className = '',
}) => {
  const title = query ? `No results for "${query}"` : 'No results found';
  const description = 'Try adjusting your search or filters to find what you are looking for.';

  return (
    <EmptyState
      icon={
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
      }
      title={title}
      description={description}
      action={onClear ? { label: 'Clear search', onClick: onClear, variant: 'secondary' } : undefined}
      className={className}
    />
  );
};

interface NoDataProps {
  /** Entity type (e.g., "vendors", "orders") */
  entityName?: string;
  /** Action to create first item */
  onCreate?: () => void;
  /** Label for create button */
  createLabel?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * NoData - Empty state when a list/table has no items yet.
 */
export const NoData: React.FC<NoDataProps> = ({
  entityName = 'items',
  onCreate,
  createLabel = 'Create first',
  className = '',
}) => {
  return (
    <EmptyState
      icon={
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      }
      title={`No ${entityName} yet`}
      description={`Get started by creating your first ${entityName.replace(/s$/, '')}.`}
      action={onCreate ? { label: createLabel, onClick: onCreate } : undefined}
      className={className}
    />
  );
};

interface ErrorStateProps {
  /** Error message to display */
  message?: string;
  /** Action to retry the failed operation */
  onRetry?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * ErrorState - Empty state for error conditions.
 */
export const ErrorState: React.FC<ErrorStateProps> = ({
  message = 'Something went wrong. Please try again.',
  onRetry,
  className = '',
}) => {
  return (
    <EmptyState
      icon={
        <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      }
      title="Error loading data"
      description={message}
      action={onRetry ? { label: 'Try again', onClick: onRetry, variant: 'secondary' } : undefined}
      className={className}
    />
  );
};

export default EmptyState;
