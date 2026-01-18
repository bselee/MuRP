import React from 'react';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Theme variant type for consistent styling across light/dark modes.
 */
type ThemeVariant = 'light' | 'dark';

/**
 * Supported alert variants covering common use cases.
 */
type AlertVariant = 'default' | 'destructive' | 'success' | 'warning' | 'info';

/**
 * Theme-aware styles for each alert variant.
 * Organized as a nested record for clear separation of concerns.
 */
const variantStyles: Record<AlertVariant, Record<ThemeVariant, string>> = {
  default: {
    light: 'bg-gray-50 border-gray-200 text-gray-800',
    dark: 'bg-gray-800/50 border-gray-700 text-gray-200',
  },
  destructive: {
    light: 'bg-red-50 border-red-200 text-red-800',
    dark: 'bg-red-500/10 border-red-500/30 text-red-300',
  },
  success: {
    light: 'bg-green-50 border-green-200 text-green-800',
    dark: 'bg-green-500/10 border-green-500/30 text-green-300',
  },
  warning: {
    light: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    dark: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300',
  },
  info: {
    light: 'bg-blue-50 border-blue-200 text-blue-800',
    dark: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
  },
};

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The visual style variant of the alert */
  variant?: AlertVariant;
}

/**
 * Alert component for displaying important messages to users.
 * Supports multiple variants (default, destructive, success, warning, info)
 * with automatic light/dark theme adaptation.
 *
 * @example
 * ```tsx
 * <Alert variant="success">
 *   <AlertDescription>Operation completed successfully!</AlertDescription>
 * </Alert>
 * ```
 */
export const Alert: React.FC<AlertProps> = ({
  className = '',
  variant = 'default',
  children,
  ...props
}) => {
  const { resolvedTheme } = useTheme();
  const themeKey: ThemeVariant = resolvedTheme === 'light' ? 'light' : 'dark';

  return (
    <div
      className={`p-4 border rounded-md transition-colors ${variantStyles[variant][themeKey]} ${className}`}
      role="alert"
      {...props}
    >
      {children}
    </div>
  );
};

interface AlertDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

/**
 * AlertDescription component for the main text content within an Alert.
 * Inherits text color from parent Alert component.
 */
export const AlertDescription: React.FC<AlertDescriptionProps> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <p
      className={`text-sm ${className}`}
      {...props}
    >
      {children}
    </p>
  );
};
