import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from './ThemeProvider';

export interface RiskActionMenuProps {
  sku: string;
  productName: string;
  recommendedQty?: number;
  onCreatePO?: (sku: string, qty: number) => void;
  onAdjustROP?: (sku: string) => void;
  onMarkForReview?: (sku: string) => void;
  onViewHistory?: (sku: string) => void;
  disabled?: boolean;
}

export default function RiskActionMenu({
  sku,
  productName,
  recommendedQty = 0,
  onCreatePO,
  onAdjustROP,
  onMarkForReview,
  onViewHistory,
  disabled = false,
}: RiskActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleAction = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  const menuItemClass = isDark
    ? 'w-full px-4 py-2.5 text-left text-sm hover:bg-slate-700 transition-colors flex items-center gap-3 text-slate-300 hover:text-white'
    : 'w-full px-4 py-2.5 text-left text-sm hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-700 hover:text-gray-900';

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        disabled={disabled}
        className={`p-1.5 rounded-md transition-colors ${
          isDark
            ? 'text-slate-400 hover:text-white hover:bg-slate-700'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        title="Actions"
        aria-label="Open action menu"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {/* Three dots icon */}
        <svg
          className="w-5 h-5"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute right-0 mt-1 w-56 rounded-lg shadow-lg border z-50 py-1 ${
            isDark
              ? 'bg-slate-800 border-slate-700'
              : 'bg-white border-gray-200'
          }`}
          role="menu"
          aria-orientation="vertical"
        >
          {/* Header */}
          <div className={`px-4 py-2 border-b ${isDark ? 'border-slate-700' : 'border-gray-100'}`}>
            <div className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              Actions for
            </div>
            <div className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`} title={productName}>
              {sku}
            </div>
          </div>

          {/* Action Items */}
          {onCreatePO && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAction(() => onCreatePO(sku, recommendedQty));
              }}
              className={menuItemClass}
              role="menuitem"
            >
              {/* Shopping cart icon */}
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>Create PO{recommendedQty > 0 && ` (${recommendedQty} units)`}</span>
            </button>
          )}

          {onAdjustROP && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAction(() => onAdjustROP(sku));
              }}
              className={menuItemClass}
              role="menuitem"
            >
              {/* Settings/adjust icon */}
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <span>Adjust ROP</span>
            </button>
          )}

          {onMarkForReview && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAction(() => onMarkForReview(sku));
              }}
              className={menuItemClass}
              role="menuitem"
            >
              {/* Flag icon */}
              <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
              </svg>
              <span>Mark for Review</span>
            </button>
          )}

          {onViewHistory && (
            <>
              <div className={`my-1 border-t ${isDark ? 'border-slate-700' : 'border-gray-100'}`} />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAction(() => onViewHistory(sku));
                }}
                className={menuItemClass}
                role="menuitem"
              >
                {/* History icon */}
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>View History</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
