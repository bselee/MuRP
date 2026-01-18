import React from 'react';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Skeleton variant types for different loading placeholder shapes.
 * - text: Rounded corners, default height for text lines
 * - circular: Perfect circle for avatars
 * - rectangular: No border radius for images/blocks
 * - rounded: Rounded corners for cards/containers
 */
type SkeletonVariant = 'text' | 'circular' | 'rectangular' | 'rounded';

/**
 * Animation types for skeleton loading effect.
 * - pulse: Fades in and out (uses Tailwind animate-pulse)
 * - shimmer: Gradient slides across (custom animation)
 * - none: Static, no animation
 */
type SkeletonAnimation = 'pulse' | 'shimmer' | 'none';

/**
 * Variant-specific CSS classes for skeleton shapes.
 * Defined outside component to avoid recreation on every render.
 */
const VARIANT_CLASSES: Record<SkeletonVariant, string> = {
  text: 'rounded h-4',
  circular: 'rounded-full',
  rectangular: '',
  rounded: 'rounded-lg',
};

interface SkeletonProps {
  /** Additional CSS classes */
  className?: string;
  /** Shape variant of the skeleton */
  variant?: SkeletonVariant;
  /** Width of the skeleton (CSS value or number for pixels) */
  width?: string | number;
  /** Height of the skeleton (CSS value or number for pixels) */
  height?: string | number;
  /** Animation type for the loading effect */
  animation?: SkeletonAnimation;
}

/**
 * Skeleton component for displaying loading placeholders.
 * Supports both light and dark themes with configurable shapes and animations.
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'text',
  width,
  height,
  animation = 'shimmer',
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Base background color based on theme
  const baseBackground = isDark ? 'bg-gray-700' : 'bg-gray-200';

  // Animation classes based on type and theme
  const getAnimationClasses = (): string => {
    switch (animation) {
      case 'pulse':
        return 'animate-pulse';
      case 'shimmer':
        // Shimmer effect using gradient animation
        return isDark
          ? 'bg-gradient-to-r from-gray-700 via-gray-600 to-gray-700 bg-[length:200%_100%] animate-shimmer'
          : 'bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%] animate-shimmer';
      case 'none':
      default:
        return baseBackground;
    }
  };

  // Build style object for custom dimensions
  const style: React.CSSProperties = {};
  if (width !== undefined) {
    style.width = typeof width === 'number' ? `${width}px` : width;
  }
  if (height !== undefined) {
    style.height = typeof height === 'number' ? `${height}px` : height;
  }

  const animationClasses = getAnimationClasses();
  // Only add base background if not using shimmer (shimmer has its own gradient)
  const backgroundClass = animation === 'shimmer' ? '' : baseBackground;

  return (
    <div
      className={`${VARIANT_CLASSES[variant]} ${backgroundClass} ${animationClasses} ${className}`}
      style={style}
      aria-hidden="true"
      role="presentation"
    />
  );
};

// ============================================================================
// Preset Components for Common Use Cases
// ============================================================================

interface SkeletonTextProps {
  /** Number of text lines to render */
  lines?: number;
  /** Animation type */
  animation?: SkeletonAnimation;
  /** Additional CSS classes for the container */
  className?: string;
}

/**
 * SkeletonText - Multiple skeleton lines for paragraph placeholders.
 * Last line is shorter to simulate natural text endings.
 */
export const SkeletonText: React.FC<SkeletonTextProps> = ({
  lines = 3,
  animation = 'shimmer',
  className = '',
}) => {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          variant="text"
          animation={animation}
          // Last line is shorter for natural appearance
          width={index === lines - 1 ? '75%' : '100%'}
        />
      ))}
    </div>
  );
};

interface SkeletonCardProps {
  /** Show avatar placeholder */
  showAvatar?: boolean;
  /** Number of text lines */
  textLines?: number;
  /** Animation type */
  animation?: SkeletonAnimation;
  /** Additional CSS classes */
  className?: string;
}

/**
 * SkeletonCard - Card placeholder with optional avatar and text lines.
 * Common pattern for list items, user cards, or content previews.
 */
export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  showAvatar = true,
  textLines = 2,
  animation = 'shimmer',
  className = '',
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const cardBackground = isDark
    ? 'bg-gray-800/50 border-gray-700'
    : 'bg-white border-gray-200';

  return (
    <div
      className={`p-4 border rounded-lg ${cardBackground} ${className}`}
      aria-hidden="true"
    >
      <div className="flex items-start gap-3">
        {showAvatar && (
          <Skeleton
            variant="circular"
            width={40}
            height={40}
            animation={animation}
          />
        )}
        <div className="flex-1">
          <Skeleton
            variant="text"
            width="40%"
            height={16}
            animation={animation}
            className="mb-2"
          />
          <SkeletonText lines={textLines} animation={animation} />
        </div>
      </div>
    </div>
  );
};

interface SkeletonTableProps {
  /** Number of data rows (excluding header) */
  rows?: number;
  /** Number of columns */
  columns?: number;
  /** Animation type */
  animation?: SkeletonAnimation;
  /** Additional CSS classes */
  className?: string;
}

/**
 * SkeletonTable - Table placeholder with header and data rows.
 * Useful for data grids, lists, and tabular content loading states.
 */
export const SkeletonTable: React.FC<SkeletonTableProps> = ({
  rows = 5,
  columns = 4,
  animation = 'shimmer',
  className = '',
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const headerBackground = isDark ? 'bg-gray-800' : 'bg-gray-50';
  const rowBackground = isDark ? 'bg-gray-900/30' : 'bg-white';
  const borderColor = isDark ? 'border-gray-700' : 'border-gray-200';

  return (
    <div
      className={`border rounded-lg overflow-hidden ${borderColor} ${className}`}
      aria-hidden="true"
    >
      {/* Header row */}
      <div className={`grid gap-4 p-3 ${headerBackground}`} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton
            key={`header-${index}`}
            variant="text"
            height={12}
            animation={animation}
            width={index === 0 ? '70%' : '60%'}
          />
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={`row-${rowIndex}`}
          className={`grid gap-4 p-3 border-t ${borderColor} ${rowBackground}`}
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={`cell-${rowIndex}-${colIndex}`}
              variant="text"
              height={14}
              animation={animation}
              // Vary widths for natural appearance
              width={colIndex === 0 ? '80%' : colIndex === columns - 1 ? '50%' : '70%'}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

export default Skeleton;
