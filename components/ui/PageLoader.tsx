import React from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { Spinner } from '@/components/ui/Spinner';

interface PageLoaderProps {
  /** Optional message to display below the spinner */
  message?: string;
  /** If true, renders as a fixed full-screen overlay with backdrop blur */
  fullScreen?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * PageLoader - Full page or section loading state.
 * Displays a centered spinner with optional message.
 *
 * Use cases:
 * - fullScreen=true: Route transitions, initial app load, modal content loading
 * - fullScreen=false: Section loading within a page layout
 */
export const PageLoader: React.FC<PageLoaderProps> = ({
  message,
  fullScreen = false,
  className = '',
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Theme-aware styling
  const textColor = isDark ? 'text-gray-300' : 'text-gray-600';

  // Full-screen uses fixed positioning with backdrop blur
  const fullScreenStyles = isDark
    ? 'fixed inset-0 z-50 bg-gray-900/80 backdrop-blur-sm'
    : 'fixed inset-0 z-50 bg-white/80 backdrop-blur-sm';

  // Non-full-screen uses flexbox centering with min-height
  const inlineStyles = 'flex-1 min-h-[200px] bg-transparent';

  const containerStyles = fullScreen ? fullScreenStyles : inlineStyles;

  return (
    <div
      className={`
        flex flex-col items-center justify-center
        ${containerStyles}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner size="lg" />
      {message && (
        <p className={`mt-4 text-sm ${textColor}`}>
          {message}
        </p>
      )}
    </div>
  );
};

// ============================================================================
// Convenience Variants
// ============================================================================

interface SectionLoaderProps {
  /** Optional message */
  message?: string;
  /** Minimum height of the loading area */
  minHeight?: string | number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * SectionLoader - Loading state for a page section.
 * Configurable min-height for layout consistency.
 */
export const SectionLoader: React.FC<SectionLoaderProps> = ({
  message,
  minHeight = 200,
  className = '',
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const textColor = isDark ? 'text-gray-300' : 'text-gray-600';

  const minHeightStyle = typeof minHeight === 'number' ? `${minHeight}px` : minHeight;

  return (
    <div
      className={`flex flex-col items-center justify-center ${className}`}
      style={{ minHeight: minHeightStyle }}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner size="md" />
      {message && (
        <p className={`mt-3 text-sm ${textColor}`}>
          {message}
        </p>
      )}
    </div>
  );
};

interface OverlayLoaderProps {
  /** Optional message */
  message?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * OverlayLoader - Positioned absolute loader for overlaying existing content.
 * Parent container must have position: relative.
 */
export const OverlayLoader: React.FC<OverlayLoaderProps> = ({
  message,
  className = '',
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const bgStyles = isDark
    ? 'bg-gray-900/70 backdrop-blur-[2px]'
    : 'bg-white/70 backdrop-blur-[2px]';

  const textColor = isDark ? 'text-gray-300' : 'text-gray-600';

  return (
    <div
      className={`
        absolute inset-0 z-10
        flex flex-col items-center justify-center
        rounded-inherit
        ${bgStyles}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner size="md" />
      {message && (
        <p className={`mt-3 text-sm ${textColor}`}>
          {message}
        </p>
      )}
    </div>
  );
};

interface ButtonLoaderProps {
  /** Accessible label */
  label?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * ButtonLoader - Inline spinner for button loading states.
 * Designed to replace button content during async operations.
 */
export const ButtonLoader: React.FC<ButtonLoaderProps> = ({
  label = 'Processing',
  className = '',
}) => {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Spinner size="sm" />
      <span className="sr-only">{label}</span>
    </span>
  );
};

export default PageLoader;
