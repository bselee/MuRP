import React from 'react';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Theme variant type for consistent theming
 */
type ThemeVariant = 'light' | 'dark';

/**
 * Theme-aware style configurations for textarea component.
 * Matches input styling for consistent form appearance.
 */
const textareaStyles: Record<ThemeVariant, string> = {
  light: 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 ring-offset-white focus-visible:ring-blue-500',
  dark: 'bg-gray-900 border-gray-700 text-white placeholder:text-gray-500 ring-offset-gray-900 focus-visible:ring-blue-400',
};

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

/**
 * Textarea component with automatic light/dark theme support.
 * Provides consistent styling for multi-line text inputs with proper focus states.
 *
 * @example
 * <Textarea placeholder="Enter your message" rows={4} />
 */
export const Textarea: React.FC<TextareaProps> = ({
  className = '',
  ...props
}) => {
  const { resolvedTheme } = useTheme();
  const themeKey: ThemeVariant = resolvedTheme === 'light' ? 'light' : 'dark';

  const baseClasses = 'flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <textarea
      className={`${baseClasses} ${textareaStyles[themeKey]} ${className}`}
      {...props}
    />
  );
};
