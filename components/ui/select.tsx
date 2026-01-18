import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Theme variant type for consistent styling across light/dark modes.
 */
type ThemeVariant = 'light' | 'dark';

/**
 * Theme-aware styles for Select components.
 * Organized by component and theme variant for easy maintenance.
 */
const triggerStyles: Record<ThemeVariant, string> = {
  light: 'bg-white border-gray-300 text-gray-900',
  dark: 'bg-gray-900 border-gray-700 text-white',
};

const contentStyles: Record<ThemeVariant, string> = {
  light: 'bg-white border-gray-300 shadow-lg',
  dark: 'bg-gray-800 border-gray-700 shadow-[0_8px_32px_rgba(0,0,0,0.5)]',
};

const itemStyles: Record<ThemeVariant, string> = {
  light: 'text-gray-900 hover:bg-gray-100',
  dark: 'text-gray-200 hover:bg-gray-700',
};

interface SelectProps {
  children: React.ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
}

/**
 * Select component providing a dropdown selection interface.
 * Supports light/dark themes and manages open/closed state internally.
 * Includes click-outside detection to close the dropdown when clicking elsewhere.
 */
export const Select: React.FC<SelectProps> = ({ children, value, onValueChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle click-outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Handle Escape key to close dropdown
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child) && child.type === SelectTrigger
          ? React.cloneElement(child, {
              onClick: () => setIsOpen(!isOpen),
              'aria-expanded': isOpen,
              'aria-haspopup': 'listbox',
              children: React.Children.map(child.props.children, (triggerChild) =>
                React.isValidElement(triggerChild) && triggerChild.type === SelectValue
                  ? React.cloneElement(triggerChild, { value })
                  : triggerChild
              )
            })
          : child.type === SelectContent
          ? React.cloneElement(child, { isOpen, onClose: () => setIsOpen(false) })
          : child
      )}
    </div>
  );
};

interface SelectTriggerProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

/**
 * SelectTrigger component - the clickable button that opens the dropdown.
 * Automatically applies theme-appropriate background, border, and text colors.
 */
export const SelectTrigger: React.FC<SelectTriggerProps> = ({ children, className = '', onClick }) => {
  const { resolvedTheme } = useTheme();
  const themeKey: ThemeVariant = resolvedTheme === 'light' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-left transition-colors ${triggerStyles[themeKey]} ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
};

interface SelectValueProps {
  placeholder?: string;
  value?: string;
}

/**
 * SelectValue component - displays the currently selected value or placeholder.
 */
export const SelectValue: React.FC<SelectValueProps> = ({ placeholder, value }) => {
  return <span>{value || placeholder}</span>;
};

interface SelectContentProps {
  children: React.ReactNode;
  isOpen?: boolean;
  onClose?: () => void;
}

/**
 * SelectContent component - the dropdown container that displays options.
 * Includes theme-aware background, border, and shadow styling.
 * Uses role="listbox" for accessibility.
 */
export const SelectContent: React.FC<SelectContentProps> = ({ children, isOpen, onClose }) => {
  const { resolvedTheme } = useTheme();
  const themeKey: ThemeVariant = resolvedTheme === 'light' ? 'light' : 'dark';

  if (!isOpen) return null;

  return (
    <div
      role="listbox"
      className={`absolute z-10 w-full mt-1 border rounded-md transition-colors ${contentStyles[themeKey]}`}
    >
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child, { onClose })
          : child
      )}
    </div>
  );
};

interface SelectItemProps {
  children: React.ReactNode;
  value: string;
  onClick?: () => void;
  onClose?: () => void;
}

/**
 * SelectItem component - individual selectable option within the dropdown.
 * Provides theme-aware text color and hover background.
 * Supports keyboard navigation with Enter and Space keys.
 */
export const SelectItem: React.FC<SelectItemProps> = ({ children, value, onClick, onClose }) => {
  const { resolvedTheme } = useTheme();
  const themeKey: ThemeVariant = resolvedTheme === 'light' ? 'light' : 'dark';

  const handleSelect = () => {
    onClick?.();
    onClose?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect();
    }
  };

  return (
    <div
      role="option"
      tabIndex={0}
      className={`px-3 py-2 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/50 ${itemStyles[themeKey]}`}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
};
