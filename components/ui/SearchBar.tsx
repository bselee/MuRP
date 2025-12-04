import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { SearchIcon, XCircleIcon } from '../icons';

export interface SearchSuggestion {
  /**
   * Unique identifier
   */
  id: string;
  /**
   * Display text
   */
  label: string;
  /**
   * Optional category for grouping
   */
  category?: string;
  /**
   * Optional metadata
   */
  metadata?: any;
}

interface SearchBarProps {
  /**
   * Current search value
   */
  value: string;

  /**
   * Change handler
   */
  onChange: (value: string) => void;

  /**
   * Optional placeholder text
   */
  placeholder?: string;

  /**
   * Autocomplete suggestions
   */
  suggestions?: SearchSuggestion[];

  /**
   * Suggestion selection handler
   */
  onSelectSuggestion?: (suggestion: SearchSuggestion) => void;

  /**
   * Whether to show suggestions
   */
  showSuggestions?: boolean;

  /**
   * Debounce delay in ms
   */
  debounceMs?: number;

  /**
   * Custom className
   */
  className?: string;

  /**
   * Size variant
   */
  size?: 'sm' | 'md' | 'lg';

  /**
   * Whether search is loading
   */
  loading?: boolean;

  /**
   * Clear button handler
   */
  onClear?: () => void;

  /**
   * Optional icon override
   */
  icon?: React.ReactNode;
}

/**
 * SearchBar - Standardized search component with autocomplete
 *
 * Features:
 * - Debounced input
 * - Autocomplete suggestions
 * - Keyboard navigation (arrow keys, enter, escape)
 * - Clear button
 * - Theme-aware styling
 * - Loading state
 *
 * @example
 * ```tsx
 * <SearchBar
 *   value={searchQuery}
 *   onChange={setSearchQuery}
 *   placeholder="Search inventory..."
 *   suggestions={suggestions}
 *   onSelectSuggestion={(suggestion) => {
 *     console.log('Selected:', suggestion);
 *   }}
 * />
 * ```
 */
const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  suggestions = [],
  onSelectSuggestion,
  showSuggestions = true,
  debounceMs = 300,
  className = '',
  size = 'md',
  loading = false,
  onClear,
  icon,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [localValue, setLocalValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout>();

  // Sync external value changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounced change handler
  const debouncedOnChange = useCallback(
    (newValue: string) => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      debounceTimer.current = setTimeout(() => {
        onChange(newValue);
      }, debounceMs);
    },
    [onChange, debounceMs]
  );

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    debouncedOnChange(newValue);
    setIsOpen(true);
    setSelectedIndex(-1);
  };

  // Handle clear
  const handleClear = () => {
    setLocalValue('');
    onChange('');
    onClear?.();
    setIsOpen(false);
    inputRef.current?.focus();
  };

  // Handle suggestion select
  const handleSelectSuggestion = (suggestion: SearchSuggestion) => {
    onSelectSuggestion?.(suggestion);
    setIsOpen(false);
    setSelectedIndex(-1);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setIsOpen(true);
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;

      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSelectSuggestion(suggestions[selectedIndex]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Size classes
  const sizeClasses = {
    sm: 'h-8 text-sm px-3',
    md: 'h-10 text-sm px-4',
    lg: 'h-12 text-base px-5',
  };

  const iconSizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  const showDropdown = isOpen && showSuggestions && suggestions.length > 0 && localValue.length > 0;

  return (
    <div className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative">
        {/* Search Icon */}
        <div className={`
          absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none
          ${isDark ? 'text-gray-400' : 'text-gray-500'}
        `}>
          {icon || <SearchIcon className={iconSizeClasses[size]} />}
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={localValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => localValue && setIsOpen(true)}
          placeholder={placeholder}
          className={`
            w-full
            ${sizeClasses[size]}
            pl-10 pr-10
            rounded-full
            border
            transition-all
            ${isDark
              ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20'
              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
            }
            focus:outline-none
          `}
        />

        {/* Loading / Clear Button */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {loading ? (
            <div className="animate-spin">
              <svg
                className={`${iconSizeClasses[size]} ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </div>
          ) : localValue ? (
            <button
              type="button"
              onClick={handleClear}
              className={`
                ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}
                transition-colors
              `}
              aria-label="Clear search"
            >
              <XCircleIcon className={iconSizeClasses[size]} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Suggestions Dropdown */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className={`
            absolute top-full left-0 right-0 mt-2
            max-h-64 overflow-y-auto
            rounded-lg border shadow-lg z-50
            ${isDark
              ? 'bg-gray-800 border-gray-700'
              : 'bg-white border-gray-200'
            }
          `}
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => handleSelectSuggestion(suggestion)}
              className={`
                w-full text-left px-4 py-2
                text-sm transition-colors
                ${index === selectedIndex
                  ? isDark
                    ? 'bg-accent-500/20 text-white'
                    : 'bg-blue-50 text-blue-900'
                  : isDark
                  ? 'text-gray-300 hover:bg-gray-700/50'
                  : 'text-gray-900 hover:bg-gray-50'
                }
                ${index === 0 ? 'rounded-t-lg' : ''}
                ${index === suggestions.length - 1 ? 'rounded-b-lg' : 'border-b border-gray-700'}
              `}
            >
              <div className="flex items-center justify-between">
                <span>{suggestion.label}</span>
                {suggestion.category && (
                  <span className={`
                    text-xs
                    ${isDark ? 'text-gray-500' : 'text-gray-400'}
                  `}>
                    {suggestion.category}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
