import React from 'react';
import { useTheme } from '@/components/ThemeProvider';

interface PageHeaderProps {
  /**
   * Main page title
   */
  title: string;

  /**
   * Optional subtitle or description
   */
  description?: string;

  /**
   * Optional breadcrumb navigation
   */
  breadcrumbs?: React.ReactNode;

  /**
   * Action buttons or controls (displayed on the right)
   */
  actions?: React.ReactNode;

  /**
   * Additional CSS classes
   */
  className?: string;

  /**
   * Custom icon to display next to title
   */
  icon?: React.ReactNode;
}

/**
 * PageHeader - Standardized page header component
 *
 * Provides consistent header layout across all pages with:
 * - Title and optional description
 * - Optional breadcrumb navigation
 * - Action buttons aligned to the right
 * - Responsive layout (stacks on mobile)
 * - Theme-aware styling
 *
 * @example
 * ```tsx
 * <PageHeader
 *   title="Purchase Orders"
 *   description="Manage and track all purchase orders"
 *   actions={
 *     <>
 *       <Button variant="secondary">Export</Button>
 *       <Button variant="primary">Create PO</Button>
 *     </>
 *   }
 * />
 * ```
 */
const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  breadcrumbs,
  actions,
  className = '',
  icon,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <header
      className={`
        flex flex-col gap-4 mb-6
        ${className}
      `.trim()}
    >
      {/* Breadcrumbs */}
      {breadcrumbs && (
        <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
          {breadcrumbs}
        </nav>
      )}

      {/* Title Row */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        {/* Title and Description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            {icon && (
              <div className={`
                flex-shrink-0 w-8 h-8 flex items-center justify-center
                ${isDark ? 'text-gray-300' : 'text-gray-600'}
              `}>
                {icon}
              </div>
            )}
            <h1 className={`
              text-xl font-bold tracking-tight
              ${isDark ? 'text-white' : 'text-gray-900'}
            `}>
              {title}
            </h1>
          </div>

          {description && (
            <p className={`
              text-sm mt-1
              ${isDark ? 'text-gray-400' : 'text-gray-600'}
            `}>
              {description}
            </p>
          )}
        </div>

        {/* Actions */}
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
};

/**
 * Breadcrumb helper component
 */
interface BreadcrumbProps {
  children: React.ReactNode;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ children }) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <ol className={`
      flex items-center gap-2
      ${isDark ? 'text-gray-400' : 'text-gray-600'}
    `}>
      {children}
    </ol>
  );
};

interface BreadcrumbItemProps {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  current?: boolean;
}

export const BreadcrumbItem: React.FC<BreadcrumbItemProps> = ({
  href,
  onClick,
  children,
  current = false,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const content = (
    <li className="flex items-center gap-2">
      {current ? (
        <span className={`
          font-medium
          ${isDark ? 'text-white' : 'text-gray-900'}
        `} aria-current="page">
          {children}
        </span>
      ) : href ? (
        <a
          href={href}
          className={`
            hover:underline transition-colors
            ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}
          `}
        >
          {children}
        </a>
      ) : onClick ? (
        <button
          onClick={onClick}
          className={`
            hover:underline transition-colors
            ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}
          `}
        >
          {children}
        </button>
      ) : (
        <span>{children}</span>
      )}
    </li>
  );

  return content;
};

export const BreadcrumbSeparator: React.FC = () => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <li aria-hidden="true" className={isDark ? 'text-gray-600' : 'text-gray-400'}>
      /
    </li>
  );
};

export default PageHeader;
