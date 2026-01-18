import React from 'react';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Theme variant type for consistent theming
 */
type ThemeVariant = 'light' | 'dark';

/**
 * Theme-aware style configurations for checkbox component.
 * Includes background, border, accent color, and focus ring styles.
 */
const checkboxStyles: Record<ThemeVariant, string> = {
  light: 'bg-white border-gray-300 text-accent-600 focus:ring-blue-500 accent-blue-600',
  dark: 'bg-gray-800 border-gray-600 text-accent-500 focus:ring-blue-400 accent-blue-500',
};

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Callback fired when the checked state changes */
  onCheckedChange?: (checked: boolean) => void;
}

/**
 * Checkbox component with automatic light/dark theme support.
 * Provides consistent styling for boolean form inputs.
 *
 * @example
 * <Checkbox
 *   checked={isEnabled}
 *   onCheckedChange={(checked) => setIsEnabled(checked)}
 * />
 */
export const Checkbox: React.FC<CheckboxProps> = ({
  className = '',
  onCheckedChange,
  ...props
}) => {
  const { resolvedTheme } = useTheme();
  const themeKey: ThemeVariant = resolvedTheme === 'light' ? 'light' : 'dark';

  const baseClasses = 'h-4 w-4 rounded border focus:ring-2';

  return (
    <input
      type="checkbox"
      className={`${baseClasses} ${checkboxStyles[themeKey]} ${className}`}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      {...props}
    />
  );
};
