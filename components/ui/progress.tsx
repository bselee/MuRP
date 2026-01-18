import React from 'react';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Theme variant type for consistent styling across light/dark modes.
 */
type ThemeVariant = 'light' | 'dark';

/**
 * Theme-aware styles for the progress track background.
 */
const trackStyles: Record<ThemeVariant, string> = {
  light: 'bg-gray-200',
  dark: 'bg-gray-700',
};

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The current progress value (0-100) */
  value: number;
}

/**
 * Progress component displaying a horizontal progress bar.
 * Supports light/dark themes with automatic adaptation.
 * The indicator uses accent-500 color for both themes.
 *
 * @example
 * ```tsx
 * <Progress value={75} />
 * ```
 */
export const Progress: React.FC<ProgressProps> = ({
  className = '',
  value,
  ...props
}) => {
  const { resolvedTheme } = useTheme();
  const themeKey: ThemeVariant = resolvedTheme === 'light' ? 'light' : 'dark';

  // Clamp value between 0 and 100 for safety
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div
      className={`w-full rounded-full h-2 transition-colors ${trackStyles[themeKey]} ${className}`}
      role="progressbar"
      aria-valuenow={clampedValue}
      aria-valuemin={0}
      aria-valuemax={100}
      {...props}
    >
      <div
        className="bg-accent-500 h-2 rounded-full transition-all duration-300"
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  );
};
