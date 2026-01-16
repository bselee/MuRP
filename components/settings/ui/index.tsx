/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎨 SETTINGS UI DESIGN SYSTEM - Unified Components for Settings Pages
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This file provides consistent UI components for all settings panels.
 * Use these components to ensure visual consistency across the settings area.
 *
 * Components:
 *   - SettingsCard: Consistent card container
 *   - SettingsInput: Form input with consistent styling
 *   - SettingsSelect: Dropdown select
 *   - SettingsTabs: Tab navigation
 *   - SettingsToggle: Toggle switch
 *   - SettingsStatusBadge: Status indicators
 *   - SettingsAlert: Info/warning/error messages
 *   - SettingsLabel: Form labels
 *   - SettingsLoadingState: Loading skeleton/spinner
 */

import React from 'react';
import { useTheme } from '@/components/ThemeProvider';
import {
  CheckCircleIcon,
  AlertCircleIcon,
  InformationCircleIcon,
  RefreshIcon,
  ExclamationTriangleIcon,
} from '@/components/icons';

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS CARD
// ═══════════════════════════════════════════════════════════════════════════

interface SettingsCardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
  noPadding?: boolean;
}

export const SettingsCard: React.FC<SettingsCardProps> = ({
  children,
  className = '',
  title,
  description,
  noPadding = false,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <div
      className={`rounded-xl border ${
        isDark
          ? 'bg-gray-800/50 border-gray-700'
          : 'bg-white border-gray-200 shadow-sm'
      } ${noPadding ? '' : 'p-6'} ${className}`}
    >
      {(title || description) && (
        <div className={noPadding ? 'px-6 pt-6' : 'mb-4'}>
          {title && (
            <h3 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {title}
            </h3>
          )}
          {description && (
            <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS INPUT
// ═══════════════════════════════════════════════════════════════════════════

interface SettingsInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helpText?: string;
  error?: string;
  icon?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const SettingsInput: React.FC<SettingsInputProps> = ({
  label,
  helpText,
  error,
  icon,
  suffix,
  className = '',
  ...props
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const inputClass = `w-full px-3 py-2 rounded-lg border transition-colors ${
    isDark
      ? 'bg-gray-900 border-gray-700 text-white placeholder-gray-500 focus:border-gray-500'
      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-gray-400'
  } focus:outline-none focus:ring-2 focus:ring-accent-500/20 ${
    error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''
  } ${icon ? 'pl-10' : ''} ${suffix ? 'pr-10' : ''} ${className}`;

  return (
    <div className="space-y-1.5">
      {label && (
        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {icon}
          </div>
        )}
        <input className={inputClass} {...props} />
        {suffix && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {suffix}
          </div>
        )}
      </div>
      {helpText && !error && (
        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{helpText}</p>
      )}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS SELECT
// ═══════════════════════════════════════════════════════════════════════════

interface SettingsSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helpText?: string;
  options: Array<{ value: string; label: string }>;
}

export const SettingsSelect: React.FC<SettingsSelectProps> = ({
  label,
  helpText,
  options,
  className = '',
  ...props
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const selectClass = `w-full px-3 py-2 rounded-lg border transition-colors ${
    isDark
      ? 'bg-gray-900 border-gray-700 text-white focus:border-gray-500'
      : 'bg-white border-gray-300 text-gray-900 focus:border-gray-400'
  } focus:outline-none focus:ring-2 focus:ring-accent-500/20 ${className}`;

  return (
    <div className="space-y-1.5">
      {label && (
        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          {label}
        </label>
      )}
      <select className={selectClass} {...props}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {helpText && (
        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{helpText}</p>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS TEXTAREA
// ═══════════════════════════════════════════════════════════════════════════

interface SettingsTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helpText?: string;
  error?: string;
}

export const SettingsTextarea: React.FC<SettingsTextareaProps> = ({
  label,
  helpText,
  error,
  className = '',
  ...props
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const textareaClass = `w-full px-3 py-2 rounded-lg border transition-colors resize-none ${
    isDark
      ? 'bg-gray-900 border-gray-700 text-white placeholder-gray-500 focus:border-gray-500'
      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-gray-400'
  } focus:outline-none focus:ring-2 focus:ring-accent-500/20 ${
    error ? 'border-red-500' : ''
  } ${className}`;

  return (
    <div className="space-y-1.5">
      {label && (
        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          {label}
        </label>
      )}
      <textarea className={textareaClass} {...props} />
      {helpText && !error && (
        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{helpText}</p>
      )}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS LABEL
// ═══════════════════════════════════════════════════════════════════════════

interface SettingsLabelProps {
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}

export const SettingsLabel: React.FC<SettingsLabelProps> = ({
  children,
  required,
  className = '',
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} ${className}`}>
      {children}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS TABS
// ═══════════════════════════════════════════════════════════════════════════

interface SettingsTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

interface SettingsTabsProps {
  tabs: SettingsTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  variant?: 'pills' | 'underline';
}

export const SettingsTabs: React.FC<SettingsTabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
  variant = 'pills',
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  if (variant === 'underline') {
    return (
      <div className={`flex gap-1 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? `border-accent-500 ${isDark ? 'text-accent-400' : 'text-accent-600'}`
                : `border-transparent ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.badge !== undefined && (
              <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                activeTab === tab.id
                  ? isDark ? 'bg-accent-500/20 text-accent-400' : 'bg-accent-100 text-accent-600'
                  : isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  // Pills variant (default)
  return (
    <div className={`flex gap-1 p-1 rounded-lg ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === tab.id
              ? isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-900 shadow-sm'
              : isDark ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {tab.icon}
          {tab.label}
          {tab.badge !== undefined && (
            <span className={`px-1.5 py-0.5 text-xs rounded-full ${
              activeTab === tab.id
                ? isDark ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-600'
                : isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'
            }`}>
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS TOGGLE
// ═══════════════════════════════════════════════════════════════════════════

interface SettingsToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export const SettingsToggle: React.FC<SettingsToggleProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  size = 'md',
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const sizeClasses = size === 'sm'
    ? { track: 'w-8 h-5', thumb: 'w-3.5 h-3.5', translate: 'translate-x-3.5' }
    : { track: 'w-10 h-6', thumb: 'w-4 h-4', translate: 'translate-x-4' };

  return (
    <label className={`flex items-center gap-3 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex shrink-0 ${sizeClasses.track} rounded-full transition-colors ${
          checked
            ? 'bg-accent-500'
            : isDark ? 'bg-gray-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`pointer-events-none inline-block ${sizeClasses.thumb} transform rounded-full bg-white shadow-sm ring-0 transition-transform ${
            checked ? sizeClasses.translate : 'translate-x-1'
          }`}
        />
      </button>
      {(label || description) && (
        <div className="flex-1">
          {label && (
            <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {label}
            </span>
          )}
          {description && (
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {description}
            </p>
          )}
        </div>
      )}
    </label>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS CHECKBOX
// ═══════════════════════════════════════════════════════════════════════════

interface SettingsCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export const SettingsCheckbox: React.FC<SettingsCheckboxProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => !disabled && onChange(e.target.checked)}
        disabled={disabled}
        className={`mt-0.5 w-4 h-4 rounded border transition-colors ${
          isDark
            ? 'bg-gray-800 border-gray-600 text-accent-500 focus:ring-accent-500/50'
            : 'bg-white border-gray-300 text-accent-600 focus:ring-accent-500/50'
        } focus:ring-2 focus:ring-offset-0`}
      />
      {(label || description) && (
        <div className="flex-1">
          {label && (
            <span className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              {label}
            </span>
          )}
          {description && (
            <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {description}
            </p>
          )}
        </div>
      )}
    </label>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS STATUS BADGE
// ═══════════════════════════════════════════════════════════════════════════

type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface SettingsStatusBadgeProps {
  variant: StatusVariant;
  children: React.ReactNode;
  icon?: boolean;
  size?: 'sm' | 'md';
}

const statusConfig: Record<StatusVariant, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
  success: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    icon: <CheckCircleIcon className="w-3.5 h-3.5" />,
  },
  warning: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    icon: <ExclamationTriangleIcon className="w-3.5 h-3.5" />,
  },
  error: {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    border: 'border-red-500/30',
    icon: <AlertCircleIcon className="w-3.5 h-3.5" />,
  },
  info: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    icon: <InformationCircleIcon className="w-3.5 h-3.5" />,
  },
  neutral: {
    bg: 'bg-gray-500/10',
    text: 'text-gray-400',
    border: 'border-gray-500/30',
    icon: null,
  },
};

export const SettingsStatusBadge: React.FC<SettingsStatusBadgeProps> = ({
  variant,
  children,
  icon = true,
  size = 'md',
}) => {
  const config = statusConfig[variant];
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${config.bg} ${config.text} ${config.border} ${sizeClasses}`}
    >
      {icon && config.icon}
      {children}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS STATUS CARD
// ═══════════════════════════════════════════════════════════════════════════

interface SettingsStatusCardProps {
  variant: StatusVariant;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export const SettingsStatusCard: React.FC<SettingsStatusCardProps> = ({
  variant,
  title,
  description,
  icon,
  action,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const config = statusConfig[variant];

  return (
    <div className={`p-4 rounded-xl border ${config.bg} ${config.border}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon && (
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${config.bg}`}>
              <span className={config.text}>{icon}</span>
            </div>
          )}
          <div>
            <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{title}</p>
            {description && (
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{description}</p>
            )}
          </div>
        </div>
        {action}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS ALERT
// ═══════════════════════════════════════════════════════════════════════════

type AlertVariant = 'info' | 'warning' | 'error' | 'success';

interface SettingsAlertProps {
  variant: AlertVariant;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const alertConfig: Record<AlertVariant, { bg: string; border: string; icon: React.ReactNode; iconColor: string; textColor: string }> = {
  info: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    icon: <InformationCircleIcon className="w-5 h-5" />,
    iconColor: 'text-blue-400',
    textColor: 'text-blue-300',
  },
  warning: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    icon: <ExclamationTriangleIcon className="w-5 h-5" />,
    iconColor: 'text-amber-400',
    textColor: 'text-amber-300',
  },
  error: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    icon: <AlertCircleIcon className="w-5 h-5" />,
    iconColor: 'text-red-400',
    textColor: 'text-red-300',
  },
  success: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    icon: <CheckCircleIcon className="w-5 h-5" />,
    iconColor: 'text-emerald-400',
    textColor: 'text-emerald-300',
  },
};

export const SettingsAlert: React.FC<SettingsAlertProps> = ({
  variant,
  title,
  children,
  className = '',
}) => {
  const config = alertConfig[variant];

  return (
    <div className={`p-4 rounded-xl border ${config.bg} ${config.border} ${className}`}>
      <div className="flex gap-3">
        <span className={`flex-shrink-0 mt-0.5 ${config.iconColor}`}>{config.icon}</span>
        <div className="flex-1">
          {title && (
            <p className={`font-medium mb-1 ${config.textColor}`}>{title}</p>
          )}
          <div className={`text-sm ${config.textColor}`}>{children}</div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS LOADING STATE
// ═══════════════════════════════════════════════════════════════════════════

interface SettingsLoadingProps {
  message?: string;
  variant?: 'spinner' | 'skeleton';
}

export const SettingsLoading: React.FC<SettingsLoadingProps> = ({
  message = 'Loading...',
  variant = 'spinner',
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  if (variant === 'skeleton') {
    return (
      <div className="animate-pulse space-y-4">
        <div className={`h-8 rounded-lg w-1/3 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
        <div className={`h-24 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
        <div className={`h-12 rounded-lg w-2/3 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-12">
      <RefreshIcon className="w-6 h-6 animate-spin text-gray-400" />
      <span className={`ml-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{message}</span>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS ROW
// ═══════════════════════════════════════════════════════════════════════════

interface SettingsRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
  vertical?: boolean;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({
  label,
  description,
  children,
  vertical = false,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  if (vertical) {
    return (
      <div className="space-y-2">
        <div>
          <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{label}</p>
          {description && (
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{description}</p>
          )}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 mr-4">
        <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{label}</p>
        {description && (
          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{description}</p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS DIVIDER
// ═══════════════════════════════════════════════════════════════════════════

export const SettingsDivider: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <hr className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-200'} ${className}`} />
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS BUTTON GROUP
// ═══════════════════════════════════════════════════════════════════════════

interface SettingsButtonGroupProps {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
}

export const SettingsButtonGroup: React.FC<SettingsButtonGroupProps> = ({
  children,
  align = 'right',
}) => {
  const alignClass = {
    left: 'justify-start',
    right: 'justify-end',
    center: 'justify-center',
  };

  return (
    <div className={`flex gap-3 pt-4 ${alignClass[align]}`}>
      {children}
    </div>
  );
};
