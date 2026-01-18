import React from 'react';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Theme variant type for consistent theming across card components
 */
type ThemeVariant = 'light' | 'dark';

/**
 * Theme-aware style configurations for card components
 */
const cardStyles: Record<ThemeVariant, string> = {
  light: 'bg-white border-gray-200 shadow-sm text-gray-900',
  dark: 'bg-gray-800/50 border-gray-700 text-white',
};

const titleStyles: Record<ThemeVariant, string> = {
  light: 'text-gray-900',
  dark: 'text-white',
};

const descriptionStyles: Record<ThemeVariant, string> = {
  light: 'text-gray-600',
  dark: 'text-gray-400',
};

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Card component with automatic light/dark theme support.
 * Provides a container with appropriate background, border, and shadow styles.
 */
export const Card: React.FC<CardProps> = ({
  className = '',
  children,
  ...props
}) => {
  const { resolvedTheme } = useTheme();
  const themeKey: ThemeVariant = resolvedTheme === 'light' ? 'light' : 'dark';

  return (
    <div
      className={`border rounded-lg ${cardStyles[themeKey]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Card header section with consistent padding.
 */
export const CardHeader: React.FC<CardHeaderProps> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`p-6 pb-0 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

/**
 * Card title with theme-aware text color.
 */
export const CardTitle: React.FC<CardTitleProps> = ({
  className = '',
  children,
  ...props
}) => {
  const { resolvedTheme } = useTheme();
  const themeKey: ThemeVariant = resolvedTheme === 'light' ? 'light' : 'dark';

  return (
    <h3
      className={`text-lg font-semibold leading-none tracking-tight ${titleStyles[themeKey]} ${className}`}
      {...props}
    >
      {children}
    </h3>
  );
};

interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

/**
 * Card description with theme-aware muted text color.
 */
export const CardDescription: React.FC<CardDescriptionProps> = ({
  className = '',
  children,
  ...props
}) => {
  const { resolvedTheme } = useTheme();
  const themeKey: ThemeVariant = resolvedTheme === 'light' ? 'light' : 'dark';

  return (
    <p
      className={`text-sm ${descriptionStyles[themeKey]} ${className}`}
      {...props}
    >
      {children}
    </p>
  );
};

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Card content section with consistent padding.
 */
export const CardContent: React.FC<CardContentProps> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`p-6 pt-0 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Card footer section with flex layout for action buttons.
 */
export const CardFooter: React.FC<CardFooterProps> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`flex items-center p-6 pt-0 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
