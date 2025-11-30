import React from 'react';

export type BadgeVariant = 
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'secondary';

interface StatusBadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  primary: 'bg-accent-500/20 text-accent-300 border-accent-500/30',
  success: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  warning: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  danger: 'bg-red-500/20 text-red-300 border-red-500/30',
  info: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  secondary: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
};

const sizeStyles = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-3 py-1 text-xs',
};

/**
 * Unified StatusBadge component following the Grok/X design system.
 * Uses pill shape (rounded-full) and accent color palette.
 */
const StatusBadge: React.FC<StatusBadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  className = '',
}) => {
  return (
    <span
      className={`
        inline-flex items-center font-medium rounded-full border
        uppercase tracking-wide
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `.trim()}
    >
      {children}
    </span>
  );
};

/**
 * Helper to map common status strings to badge variants
 */
export const getVariantForStatus = (status: string): BadgeVariant => {
  const normalizedStatus = status.toLowerCase().replace(/[_-]/g, '');
  
  // Success states
  if (['completed', 'approved', 'received', 'fulfilled', 'confirmed', 'active', 'instock'].includes(normalizedStatus)) {
    return 'success';
  }
  
  // Warning states
  if (['pending', 'partial', 'lowstock', 'outfordelivery', 'needsreview'].includes(normalizedStatus)) {
    return 'warning';
  }
  
  // Danger states
  if (['cancelled', 'rejected', 'failed', 'outofstock', 'expired', 'overdue'].includes(normalizedStatus)) {
    return 'danger';
  }
  
  // Info states
  if (['shipped', 'intransit', 'processing', 'sent'].includes(normalizedStatus)) {
    return 'info';
  }
  
  // Primary states (active/action states)
  if (['committed', 'submitted', 'draft'].includes(normalizedStatus)) {
    return 'primary';
  }
  
  return 'default';
};

export default StatusBadge;
