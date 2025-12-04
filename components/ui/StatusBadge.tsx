import React from 'react';
import { useTheme } from '@/components/ThemeProvider';

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'secondary'
  | 'processing'
  | 'shipped'
  | 'delivered';

interface StatusBadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /**
   * Auto-detect variant from status string
   */
  status?: string;
  /**
   * Optional icon to display before text
   */
  icon?: React.ReactNode;
}

type ThemeVariant = 'light' | 'dark';

const variantStyles: Record<BadgeVariant, Record<ThemeVariant, string>> = {
  default: {
    dark: 'bg-gray-600/20 text-gray-200 border-gray-500/40',
    light: 'bg-gray-200 text-gray-700 border-gray-300',
  },
  primary: {
    dark: 'bg-accent-500/20 text-accent-300 border-accent-500/30',
    light: 'bg-blue-100 text-blue-700 border-blue-300',
  },
  success: {
    dark: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    light: 'bg-green-100 text-green-700 border-green-300',
  },
  warning: {
    dark: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    light: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  },
  danger: {
    dark: 'bg-red-500/20 text-red-300 border-red-500/30',
    light: 'bg-red-100 text-red-700 border-red-300',
  },
  info: {
    dark: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30',
    light: 'bg-cyan-100 text-cyan-700 border-cyan-300',
  },
  secondary: {
    dark: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    light: 'bg-purple-100 text-purple-700 border-purple-300',
  },
  processing: {
    dark: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    light: 'bg-blue-100 text-blue-700 border-blue-300',
  },
  shipped: {
    dark: 'bg-purple-500/20 text-purple-200 border-purple-500/30',
    light: 'bg-purple-100 text-purple-700 border-purple-300',
  },
  delivered: {
    dark: 'bg-green-500/20 text-green-200 border-green-500/30',
    light: 'bg-green-100 text-green-700 border-green-300',
  },
};

const sizeStyles = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-3 py-1 text-xs',
  lg: 'px-4 py-1.5 text-sm',
};

/**
 * Unified StatusBadge component following the Grok/X design system.
 * Uses pill shape (rounded-full) and accent color palette.
 *
 * @example
 * ```tsx
 * // Manual variant
 * <StatusBadge variant="success">Completed</StatusBadge>
 *
 * // Auto-detect from status string
 * <StatusBadge status={order.status}>{order.status}</StatusBadge>
 *
 * // With icon
 * <StatusBadge variant="warning" icon={<AlertIcon />}>Pending</StatusBadge>
 * ```
 */
const StatusBadge: React.FC<StatusBadgeProps> = ({
  children,
  variant,
  size = 'md',
  className = '',
  status,
  icon,
}) => {
  const { resolvedTheme } = useTheme();
  const themeKey: ThemeVariant = resolvedTheme === 'light' ? 'light' : 'dark';

  // Auto-detect variant from status if not explicitly provided
  const finalVariant = variant || (status ? getVariantForStatus(status) : 'default');

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-medium rounded-full border
        ${variantStyles[finalVariant][themeKey]}
        ${sizeStyles[size]}
        ${className}
      `.trim()}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </span>
  );
};

/**
 * Helper to map common status strings to badge variants
 * Handles PO statuses, tracking statuses, inventory statuses, and more
 */
export const getVariantForStatus = (status: string): BadgeVariant => {
  const normalizedStatus = status.toLowerCase().replace(/[_-\s]/g, '');

  // Success states (green)
  if ([
    'completed', 'approved', 'received', 'fulfilled', 'confirmed',
    'active', 'instock', 'delivered', 'invoicereceived'
  ].includes(normalizedStatus)) {
    return 'success';
  }

  // Warning states (amber/yellow)
  if ([
    'pending', 'partial', 'lowstock', 'outfordelivery',
    'needsreview', 'awaitingconfirmation'
  ].includes(normalizedStatus)) {
    return 'warning';
  }

  // Danger states (red)
  if ([
    'cancelled', 'rejected', 'failed', 'outofstock',
    'expired', 'overdue', 'exception', 'critical'
  ].includes(normalizedStatus)) {
    return 'danger';
  }

  // Shipped/Transit states (purple)
  if (['shipped', 'intransit'].includes(normalizedStatus)) {
    return 'shipped';
  }

  // Processing states (blue)
  if (['processing', 'sent'].includes(normalizedStatus)) {
    return 'processing';
  }

  // Info states (cyan)
  if (['committed', 'submitted'].includes(normalizedStatus)) {
    return 'info';
  }

  // Primary/Draft states (accent blue)
  if (['draft', 'new', 'open'].includes(normalizedStatus)) {
    return 'primary';
  }

  // Secondary states (purple)
  if (['archived', 'onhold', 'paused'].includes(normalizedStatus)) {
    return 'secondary';
  }

  return 'default';
};

/**
 * Utility to format status text for display
 * Converts: "awaiting_confirmation" -> "Awaiting Confirmation"
 */
export const formatStatusText = (status: string): string => {
  return status
    .replace(/[_-]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export default StatusBadge;
