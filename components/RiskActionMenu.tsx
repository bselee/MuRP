import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from './ThemeProvider';
import type { DismissReason, SnoozeOptions } from '../hooks/useSkuDismissals';
import { formatDismissReason, formatSnoozeDuration } from '../hooks/useSkuDismissals';

export interface RiskActionMenuProps {
  sku: string;
  productName: string;
  recommendedQty?: number;
  onCreatePO?: (sku: string, qty: number) => void;
  onAdjustROP?: (sku: string) => void;
  onMarkForReview?: (sku: string) => void;
  onViewHistory?: (sku: string) => void;
  onDismiss?: (sku: string, reason: DismissReason, notes?: string) => void;
  onSnooze?: (sku: string, duration: SnoozeOptions['duration'], notes?: string) => void;
  disabled?: boolean;
}

type SubMenu = 'none' | 'dismiss' | 'snooze';

const DISMISS_REASONS: { value: DismissReason; label: string; icon: React.ReactNode }[] = [
  {
    value: 'dropship',
    label: 'Dropship item',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
  },
  {
    value: 'bulk_order',
    label: 'Order in bulk',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    value: 'seasonal',
    label: 'Seasonal item',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    value: 'low_priority',
    label: 'Low priority',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
    ),
  },
  {
    value: 'discontinued',
    label: 'Discontinued',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
      </svg>
    ),
  },
  {
    value: 'vendor_managed',
    label: 'Vendor managed',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
];

const SNOOZE_OPTIONS: { value: SnoozeOptions['duration']; label: string }[] = [
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: '3days', label: '3 days' },
  { value: '1week', label: '1 week' },
  { value: '2weeks', label: '2 weeks' },
  { value: '1month', label: '1 month' },
];

export default function RiskActionMenu({
  sku,
  productName,
  recommendedQty = 0,
  onCreatePO,
  onAdjustROP,
  onMarkForReview,
  onViewHistory,
  onDismiss,
  onSnooze,
  disabled = false,
}: RiskActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSubMenu, setActiveSubMenu] = useState<SubMenu>('none');
  const menuRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveSubMenu('none');
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
      if (e.key === 'Escape') {
        if (activeSubMenu !== 'none') {
          setActiveSubMenu('none');
        } else {
          setIsOpen(false);
        }
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, activeSubMenu]);

  const handleAction = (action: () => void) => {
    action();
    setIsOpen(false);
    setActiveSubMenu('none');
  };

  const menuItemClass = isDark
    ? 'w-full px-4 py-2.5 text-left text-sm hover:bg-slate-700 transition-colors flex items-center gap-3 text-slate-300 hover:text-white'
    : 'w-full px-4 py-2.5 text-left text-sm hover:bg-gray-100 transition-colors flex items-center gap-3 text-gray-700 hover:text-gray-900';

  const subMenuItemClass = isDark
    ? 'w-full px-4 py-2 text-left text-sm hover:bg-slate-600 transition-colors flex items-center gap-2 text-slate-300 hover:text-white'
    : 'w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors flex items-center gap-2 text-gray-600 hover:text-gray-900';

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
          setActiveSubMenu('none');
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

          {/* Main Actions */}
          {activeSubMenu === 'none' && (
            <>
              {onCreatePO && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAction(() => onCreatePO(sku, recommendedQty));
                  }}
                  className={menuItemClass}
                  role="menuitem"
                >
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
                  <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                  </svg>
                  <span>Mark for Review</span>
                </button>
              )}

              {/* Divider before Dismiss/Snooze */}
              {(onDismiss || onSnooze) && (
                <div className={`my-1 border-t ${isDark ? 'border-slate-700' : 'border-gray-100'}`} />
              )}

              {/* Dismiss submenu trigger */}
              {onDismiss && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveSubMenu('dismiss');
                  }}
                  className={menuItemClass}
                  role="menuitem"
                >
                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                  <span className="flex-1">Dismiss</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}

              {/* Snooze submenu trigger */}
              {onSnooze && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveSubMenu('snooze');
                  }}
                  className={menuItemClass}
                  role="menuitem"
                >
                  <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="flex-1">Snooze / Remind Me</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
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
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>View History</span>
                  </button>
                </>
              )}
            </>
          )}

          {/* Dismiss Submenu */}
          {activeSubMenu === 'dismiss' && (
            <>
              {/* Back button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveSubMenu('none');
                }}
                className={`${menuItemClass} border-b ${isDark ? 'border-slate-700' : 'border-gray-100'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium">Dismiss - Select Reason</span>
              </button>

              {/* Dismiss reason options */}
              {DISMISS_REASONS.map((reason) => (
                <button
                  key={reason.value}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAction(() => onDismiss?.(sku, reason.value));
                  }}
                  className={subMenuItemClass}
                  role="menuitem"
                >
                  <span className="text-red-400">{reason.icon}</span>
                  <span>{reason.label}</span>
                </button>
              ))}
            </>
          )}

          {/* Snooze Submenu */}
          {activeSubMenu === 'snooze' && (
            <>
              {/* Back button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveSubMenu('none');
                }}
                className={`${menuItemClass} border-b ${isDark ? 'border-slate-700' : 'border-gray-100'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium">Snooze - Remind Me In</span>
              </button>

              {/* Snooze duration options */}
              {SNOOZE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAction(() => onSnooze?.(sku, option.value));
                  }}
                  className={subMenuItemClass}
                  role="menuitem"
                >
                  <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>{option.label}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
