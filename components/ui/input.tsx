import React from 'react';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Theme variant type for consistent theming
 */
type ThemeVariant = 'light' | 'dark';

/**
 * Theme-aware style configurations for input component.
 * Includes background, border, text, placeholder, and focus ring colors.
 */
const inputStyles: Record<ThemeVariant, string> = {
  light: 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 ring-offset-white focus-visible:ring-blue-500',
  dark: 'bg-gray-900 border-gray-700 text-white placeholder:text-gray-500 ring-offset-gray-900 focus-visible:ring-blue-400',
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Input component with automatic light/dark theme support.
 * Provides consistent styling for form text inputs with proper focus states.
 *
 * @example
 * <Input placeholder="Enter your email" type="email" />
 */
export const Input: React.FC<InputProps> = ({
  className = '',
  type = 'text',
  ...props
}) => {
  const { resolvedTheme } = useTheme();
  const themeKey: ThemeVariant = resolvedTheme === 'light' ? 'light' : 'dark';

  const baseClasses = 'flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <input
      type={type}
      className={`${baseClasses} ${inputStyles[themeKey]} ${className}`}
      {...props}
    />
  );
};
