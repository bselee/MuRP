import React from 'react';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Spinner size options with corresponding Tailwind classes.
 */
type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface SpinnerProps {
  /** Size of the spinner */
  size?: SpinnerSize;
  /** Additional CSS classes */
  className?: string;
  /** Custom color class (overrides theme-based color) */
  color?: string;
  /** Accessible label for screen readers */
  label?: string;
}

/** Size-to-class mapping for consistent sizing */
const sizeClasses: Record<SpinnerSize, string> = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
};

/** Border width varies with spinner size for proportional appearance */
const borderWidthClasses: Record<SpinnerSize, string> = {
  xs: 'border',
  sm: 'border-2',
  md: 'border-2',
  lg: 'border-[3px]',
  xl: 'border-4',
};

/**
 * Spinner - CSS border-based loading spinner.
 * Uses the accent color system with theme support.
 */
export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  className = '',
  color,
  label = 'Loading',
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Default color based on theme, uses accent color system
  const defaultColor = isDark ? 'border-accent-400' : 'border-accent-500';
  const colorClass = color || defaultColor;

  return (
    <div
      className={`
        ${sizeClasses[size]}
        ${borderWidthClasses[size]}
        ${colorClass}
        border-t-transparent
        rounded-full
        animate-spin
        ${className}
      `.trim().replace(/\s+/g, ' ')}
      role="status"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
    </div>
  );
};

// ============================================================================
// SVG Spinner Variant
// ============================================================================

interface SpinnerSVGProps {
  /** Size of the spinner */
  size?: SpinnerSize;
  /** Additional CSS classes */
  className?: string;
  /** Custom color for the spinner (defaults to currentColor) */
  color?: string;
  /** Accessible label for screen readers */
  label?: string;
}

/** Size to pixel mapping for SVG viewBox calculations */
const sizeToPx: Record<SpinnerSize, number> = {
  xs: 12,
  sm: 16,
  md: 24,
  lg: 32,
  xl: 48,
};

/**
 * SpinnerSVG - SVG-based spinner with animated circle paths.
 * Ideal for use in buttons where a cleaner look is needed.
 * Uses currentColor by default, so it inherits text color.
 */
export const SpinnerSVG: React.FC<SpinnerSVGProps> = ({
  size = 'md',
  className = '',
  color = 'currentColor',
  label = 'Loading',
}) => {
  const pxSize = sizeToPx[size];
  const strokeWidth = size === 'xs' || size === 'sm' ? 2 : size === 'md' ? 2.5 : 3;
  const radius = (pxSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = pxSize / 2;

  return (
    <svg
      className={`${sizeClasses[size]} animate-spin ${className}`}
      viewBox={`0 0 ${pxSize} ${pxSize}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="status"
      aria-label={label}
    >
      {/* Background circle (faded) */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeOpacity={0.25}
      />
      {/* Animated arc */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * 0.75}
      />
      <span className="sr-only">{label}</span>
    </svg>
  );
};

// ============================================================================
// Convenience Exports
// ============================================================================

interface InlineSpinnerProps {
  /** Additional CSS classes */
  className?: string;
  /** Accessible label */
  label?: string;
}

/**
 * InlineSpinner - Small spinner for inline use with text.
 * Pre-configured for common button loading states.
 */
export const InlineSpinner: React.FC<InlineSpinnerProps> = ({
  className = '',
  label = 'Loading',
}) => {
  return <SpinnerSVG size="sm" className={className} label={label} />;
};

export default Spinner;
