import React from 'react';
import { useTheme } from './ThemeProvider';

export type VelocityTrend =
  | 'SURGING'      // >100% increase
  | 'ACCELERATING' // 50-100% increase
  | 'WARMING'      // 20-50% increase
  | 'STABLE'       // -20% to +20%
  | 'COOLING'      // 20-50% decrease
  | 'SLOWING'      // 50-100% decrease
  | 'STALLED';     // >100% decrease (or no sales)

interface VelocityTrendBadgeProps {
  trend: VelocityTrend;
  changePct?: number;
  runwayImpact?: string; // e.g., "22d → 8d"
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const TREND_CONFIG: Record<VelocityTrend, {
  label: string;
  shortLabel: string;
  bgClass: string;
  textClass: string;
  ringClass: string;
  icon: string;
  description: string;
}> = {
  SURGING: {
    label: 'Surging',
    shortLabel: 'SURG',
    bgClass: 'bg-red-500/20',
    textClass: 'text-red-400',
    ringClass: 'ring-red-500/50',
    icon: '🔴',
    description: 'Demand surging - runway shrinking fast',
  },
  ACCELERATING: {
    label: 'Accelerating',
    shortLabel: 'ACC',
    bgClass: 'bg-orange-500/20',
    textClass: 'text-orange-400',
    ringClass: 'ring-orange-500/50',
    icon: '🟠',
    description: 'Demand accelerating - monitor closely',
  },
  WARMING: {
    label: 'Warming',
    shortLabel: 'WARM',
    bgClass: 'bg-yellow-500/20',
    textClass: 'text-yellow-400',
    ringClass: 'ring-yellow-500/50',
    icon: '🟡',
    description: 'Demand warming - slight uptick',
  },
  STABLE: {
    label: 'Stable',
    shortLabel: 'STBL',
    bgClass: 'bg-slate-500/20',
    textClass: 'text-slate-400',
    ringClass: 'ring-slate-500/50',
    icon: '⚪',
    description: 'Demand stable',
  },
  COOLING: {
    label: 'Cooling',
    shortLabel: 'COOL',
    bgClass: 'bg-blue-500/20',
    textClass: 'text-blue-400',
    ringClass: 'ring-blue-500/50',
    icon: '🔵',
    description: 'Demand cooling - may extend runway',
  },
  SLOWING: {
    label: 'Slowing',
    shortLabel: 'SLOW',
    bgClass: 'bg-blue-600/20',
    textClass: 'text-blue-300',
    ringClass: 'ring-blue-600/50',
    icon: '🔵',
    description: 'Demand slowing - consider reducing orders',
  },
  STALLED: {
    label: 'Stalled',
    shortLabel: 'STLD',
    bgClass: 'bg-indigo-500/20',
    textClass: 'text-indigo-400',
    ringClass: 'ring-indigo-500/50',
    icon: '🟣',
    description: 'Demand stalled - minimal movement',
  },
};

export default function VelocityTrendBadge({
  trend,
  changePct,
  runwayImpact,
  showLabel = false,
  size = 'sm',
}: VelocityTrendBadgeProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const config = TREND_CONFIG[trend];

  // Don't render badge for STABLE trend (default state)
  if (trend === 'STABLE' && !showLabel) {
    return null;
  }

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2 py-1 text-xs',
    lg: 'px-2.5 py-1 text-sm',
  };

  const tooltipContent = [
    config.description,
    changePct !== undefined && `${changePct > 0 ? '+' : ''}${changePct.toFixed(0)}% vs 30-day avg`,
    runwayImpact && `Runway impact: ${runwayImpact}`,
  ].filter(Boolean).join('\n');

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded font-bold ring-1
        ${config.bgClass} ${config.textClass} ${config.ringClass}
        ${sizeClasses[size]}
        cursor-help
      `}
      title={tooltipContent}
    >
      {showLabel ? config.label : config.shortLabel}
      {changePct !== undefined && size !== 'sm' && (
        <span className="opacity-75">
          {changePct > 0 ? '+' : ''}{Math.abs(changePct).toFixed(0)}%
        </span>
      )}
    </span>
  );
}

/**
 * Inline trend indicator for table rows
 */
export function VelocityIndicator({
  trend,
  changePct,
}: {
  trend: VelocityTrend;
  changePct?: number;
}) {
  const config = TREND_CONFIG[trend];

  // Don't show indicator for stable items
  if (trend === 'STABLE') return null;

  const isIncreasing = ['SURGING', 'ACCELERATING', 'WARMING'].includes(trend);
  const isDecreasing = ['COOLING', 'SLOWING', 'STALLED'].includes(trend);

  return (
    <span
      className={`inline-flex items-center text-xs ${config.textClass}`}
      title={config.description}
    >
      {isIncreasing && (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
      )}
      {isDecreasing && (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      )}
      {changePct !== undefined && (
        <span className="ml-0.5">
          {Math.abs(changePct).toFixed(0)}%
        </span>
      )}
    </span>
  );
}

/**
 * Determine trend from percentage change
 */
export function getTrendFromChange(changePct: number): VelocityTrend {
  if (changePct > 100) return 'SURGING';
  if (changePct > 50) return 'ACCELERATING';
  if (changePct > 20) return 'WARMING';
  if (changePct >= -20) return 'STABLE';
  if (changePct >= -50) return 'COOLING';
  if (changePct >= -100) return 'SLOWING';
  return 'STALLED';
}
