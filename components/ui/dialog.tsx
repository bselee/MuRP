import React, { createContext, useContext, useState, useEffect } from 'react';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Theme variant type for consistent styling across light/dark modes.
 */
type ThemeVariant = 'light' | 'dark';

/**
 * Theme-aware styles for Dialog components.
 * Includes backdrop, content panel, and title styling.
 */
const backdropStyles: Record<ThemeVariant, string> = {
  light: 'bg-black/50',
  dark: 'bg-black/70',
};

const contentStyles: Record<ThemeVariant, string> = {
  light: 'bg-white shadow-xl',
  dark: 'bg-gray-800 border border-gray-700 shadow-[0_25px_65px_rgba(0,0,0,0.65)]',
};

const titleStyles: Record<ThemeVariant, string> = {
  light: 'text-gray-900',
  dark: 'text-white',
};

const closeButtonStyles: Record<ThemeVariant, string> = {
  light: 'hover:bg-gray-100 text-gray-500 hover:text-gray-900',
  dark: 'hover:bg-gray-700 text-gray-400 hover:text-white',
};

interface DialogContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

interface DialogProps {
  children: React.ReactNode;
}

/**
 * Dialog component providing a modal overlay interface.
 * Manages open/closed state via React Context for child components.
 */
export const Dialog: React.FC<DialogProps> = ({ children }) => {
  const [open, setOpen] = useState(false);

  return (
    <DialogContext.Provider value={{ open, setOpen }}>
      {children}
    </DialogContext.Provider>
  );
};

interface DialogTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

/**
 * DialogTrigger component - the element that opens the dialog when clicked.
 * Extends native button props for flexibility.
 */
export const DialogTrigger: React.FC<DialogTriggerProps> = ({
  children,
  onClick,
  ...props
}) => {
  const context = useContext(DialogContext);
  if (!context) throw new Error('DialogTrigger must be used within Dialog');

  return (
    <button
      onClick={(e) => {
        context.setOpen(true);
        onClick?.(e);
      }}
      {...props}
    >
      {children}
    </button>
  );
};

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * DialogContent component - the modal panel containing dialog content.
 * Features theme-aware backdrop and content styling with smooth animations.
 * Includes close button and escape key handler for improved UX.
 */
export const DialogContent: React.FC<DialogContentProps> = ({
  className = '',
  children,
  ...props
}) => {
  const context = useContext(DialogContext);
  if (!context) throw new Error('DialogContent must be used within Dialog');

  const { resolvedTheme } = useTheme();
  const themeKey: ThemeVariant = resolvedTheme === 'light' ? 'light' : 'dark';

  // Handle Escape key to close dialog
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        context.setOpen(false);
      }
    };

    if (context.open) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [context.open, context]);

  if (!context.open) return null;

  return (
    <>
      {/* Backdrop with theme-aware opacity */}
      <div
        className={`fixed inset-0 z-40 transition-all duration-200 ease-out ${backdropStyles[themeKey]}`}
        onClick={() => context.setOpen(false)}
        aria-hidden="true"
      />
      {/* Dialog panel with theme-aware styling */}
      <div
        role="dialog"
        aria-modal="true"
        className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rounded-lg z-50 max-w-md w-full mx-4 transition-all duration-200 ease-out ${contentStyles[themeKey]} ${className}`}
        {...props}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={() => context.setOpen(false)}
          className={`absolute top-4 right-4 p-1 rounded transition-colors ${closeButtonStyles[themeKey]}`}
          aria-label="Close dialog"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {children}
      </div>
    </>
  );
};

interface DialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * DialogHeader component - container for dialog title and description.
 * Provides consistent spacing at the top of the dialog.
 */
export const DialogHeader: React.FC<DialogHeaderProps> = ({
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

interface DialogTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

/**
 * DialogTitle component - the main heading for the dialog.
 * Automatically applies theme-appropriate text color.
 */
export const DialogTitle: React.FC<DialogTitleProps> = ({
  className = '',
  children,
  ...props
}) => {
  const { resolvedTheme } = useTheme();
  const themeKey: ThemeVariant = resolvedTheme === 'light' ? 'light' : 'dark';

  return (
    <h3
      className={`text-lg font-semibold leading-none tracking-tight transition-colors ${titleStyles[themeKey]} ${className}`}
      {...props}
    >
      {children}
    </h3>
  );
};
