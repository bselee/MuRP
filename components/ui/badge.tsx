import React from 'react';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Theme variant type for consistent theming across badge variants
 */
type ThemeVariant = 'light' | 'dark';

/**
 * Available badge variants including status indicators
 */
type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info';

/**
 * Theme-aware style configurations for each badge variant.
 * Each variant has distinct light and dark mode appearances.
 */
const variantStyles: Record<BadgeVariant, Record<ThemeVariant, string>> = {
  default: {
    light: 'bg-gray-100 text-gray-800 border-gray-200',
    dark: 'bg-gray-700/50 text-gray-200 border-gray-600',
  },
  secondary: {
    light: 'bg-gray-200 text-gray-900 border-gray-300',
    dark: 'bg-gray-600/50 text-gray-100 border-gray-500',
  },
  destructive: {
    light: 'bg-red-100 text-red-700 border-red-300',
    dark: 'bg-red-500/20 text-red-300 border-red-500/30',
  },
  outline: {
    light: 'bg-transparent text-gray-700 border-gray-300',
    dark: 'bg-transparent text-gray-300 border-gray-600',
  },
  success: {
    light: 'bg-green-100 text-green-700 border-green-300',
    dark: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  warning: {
    light: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    dark: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  info: {
    light: 'bg-blue-100 text-blue-700 border-blue-300',
    dark: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** The visual style variant of the badge */
  variant?: BadgeVariant;
}

/**
 * Badge component with automatic light/dark theme support.
 * Displays a small label with variant-specific colors for status indication.
 *
 * @example
 * // Success badge
 * <Badge variant="success">Active</Badge>
 *
 * @example
 * // Warning badge
 * <Badge variant="warning">Pending Review</Badge>
 */
export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  className = '',
  children,
  ...props
}) => {
  const { resolvedTheme } = useTheme();
  const themeKey: ThemeVariant = resolvedTheme === 'light' ? 'light' : 'dark';

  const baseClasses = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border';

  return (
    <span
      className={`${baseClasses} ${variantStyles[variant][themeKey]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
