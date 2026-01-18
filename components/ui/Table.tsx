import React, { useState, useMemo } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { ChevronUpIcon, ChevronDownIcon, ArrowsUpDownIcon } from '../icons';

type SortDirection = 'asc' | 'desc' | null;

export interface Column<T> {
  /**
   * Unique key for the column
   */
  key: string;

  /**
   * Column header label
   */
  label: string;

  /**
   * Whether this column is sortable
   */
  sortable?: boolean;

  /**
   * Custom render function for cell content
   */
  render?: (row: T, index: number) => React.ReactNode;

  /**
   * Accessor function to get value from row
   * If not provided, will use row[key]
   */
  accessor?: (row: T) => any;

  /**
   * Custom width class (e.g., 'w-32', 'max-w-[200px]')
   */
  width?: string;

  /**
   * Text alignment
   */
  align?: 'left' | 'center' | 'right';

  /**
   * Whether column is visible
   */
  visible?: boolean;
}

interface TableProps<T> {
  /**
   * Column configuration
   */
  columns: Column<T>[];

  /**
   * Table data
   */
  data: T[];

  /**
   * Unique key accessor for row keys
   */
  getRowKey: (row: T, index: number) => string | number;

  /**
   * Optional row click handler
   */
  onRowClick?: (row: T, index: number) => void;

  /**
   * Enable sticky header
   */
  stickyHeader?: boolean;

  /**
   * Empty state message
   */
  emptyMessage?: string;

  /**
   * Enable hover effect on rows
   */
  hoverable?: boolean;

  /**
   * Compact mode (uses py-1 for all cells)
   */
  compact?: boolean;

  /**
   * Custom className for table container
   */
  className?: string;

  /**
   * Optional loading state
   */
  loading?: boolean;

  /**
   * Custom row className function
   */
  getRowClassName?: (row: T, index: number) => string;

  /**
   * Custom row attributes function (for data-* attributes, etc.)
   */
  getRowAttributes?: (row: T, index: number) => Record<string, string>;
}

/**
 * Table - Standardized table component
 *
 * Features:
 * - Sortable columns
 * - Sticky headers
 * - Consistent padding (py-2/py-1 from UI_STANDARDS.md)
 * - Theme-aware styling
 * - Flexible column configuration
 * - Row hover states
 * - Responsive design
 *
 * @example
 * ```tsx
 * <Table
 *   columns={[
 *     { key: 'sku', label: 'SKU', sortable: true },
 *     { key: 'name', label: 'Name', sortable: true },
 *     {
 *       key: 'actions',
 *       label: 'Actions',
 *       render: (row) => <Button size="sm">Edit</Button>
 *     }
 *   ]}
 *   data={inventory}
 *   getRowKey={(row) => row.id}
 *   stickyHeader
 *   hoverable
 * />
 * ```
 */
function Table<T>({
  columns,
  data,
  getRowKey,
  onRowClick,
  stickyHeader = false,
  emptyMessage = 'No data available',
  hoverable = true,
  compact = false,
  className = '',
  loading = false,
  getRowClassName,
  getRowAttributes,
}: TableProps<T>) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Sorting state
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Handle column sort
  const handleSort = (column: Column<T>) => {
    if (!column.sortable) return;

    if (sortKey === column.key) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortKey(null);
        setSortDirection(null);
      }
    } else {
      setSortKey(column.key);
      setSortDirection('asc');
    }
  };

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortKey || !sortDirection) return data;

    const column = columns.find((col) => col.key === sortKey);
    if (!column) return data;

    const sorted = [...data].sort((a, b) => {
      const aVal = column.accessor ? column.accessor(a) : (a as any)[column.key];
      const bVal = column.accessor ? column.accessor(b) : (b as any)[column.key];

      if (aVal === bVal) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      const comparison = aVal < bVal ? -1 : 1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [data, sortKey, sortDirection, columns]);

  // Filter visible columns
  const visibleColumns = columns.filter((col) => col.visible !== false);

  // Padding classes based on UI_STANDARDS.md
  const headerPadding = 'py-2'; // 8px vertical
  const cellPadding = compact ? 'py-1' : 'py-2'; // 4px compact, 8px normal
  const horizontalPadding = 'px-6';

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full">
        {/* Table Header */}
        <thead
          className={`
            ${isDark ? 'bg-gray-800' : 'bg-gray-50'}
            ${isDark ? 'border-gray-700' : 'border-gray-200'}
            ${stickyHeader ? 'sticky top-0 z-10 backdrop-blur-sm' : ''}
          `}
        >
          <tr className={isDark ? 'border-b border-gray-700' : 'border-b border-gray-200'}>
            {visibleColumns.map((column) => (
              <th
                key={column.key}
                className={`
                  ${headerPadding} ${horizontalPadding}
                  text-left text-xs font-medium uppercase tracking-wider
                  ${isDark ? 'text-gray-300' : 'text-gray-700'}
                  ${column.sortable ? 'cursor-pointer select-none hover:bg-white/5' : ''}
                  ${column.width || ''}
                  ${column.align === 'center' ? 'text-center' : ''}
                  ${column.align === 'right' ? 'text-right' : ''}
                `}
                onClick={() => column.sortable && handleSort(column)}
              >
                <div className="flex items-center gap-2">
                  <span>{column.label}</span>
                  {column.sortable && (
                    <span className="text-gray-500 transition-transform duration-150">
                      {sortKey === column.key ? (
                        sortDirection === 'asc' ? (
                          <ChevronUpIcon className="w-4 h-4" />
                        ) : (
                          <ChevronDownIcon className="w-4 h-4" />
                        )
                      ) : (
                        <ArrowsUpDownIcon className="w-4 h-4 opacity-50" />
                      )}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>

        {/* Table Body */}
        <tbody
          className={`
            ${isDark ? 'divide-gray-700' : 'divide-gray-200'}
            divide-y
          `}
        >
          {loading ? (
            <tr>
              <td
                colSpan={visibleColumns.length}
                className={`
                  ${cellPadding} ${horizontalPadding}
                  text-center
                  ${isDark ? 'text-gray-400' : 'text-gray-600'}
                `}
              >
                Loading...
              </td>
            </tr>
          ) : sortedData.length === 0 ? (
            <tr>
              <td
                colSpan={visibleColumns.length}
                className={`
                  ${cellPadding} ${horizontalPadding}
                  text-center py-12
                  ${isDark ? 'text-gray-400' : 'text-gray-600'}
                `}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row, index) => (
              <tr
                key={getRowKey(row, index)}
                onClick={() => onRowClick?.(row, index)}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={(e) => {
                  if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onRowClick(row, index);
                  }
                }}
                className={`
                  ${isDark ? 'bg-gray-900' : 'bg-white'}
                  ${hoverable
                    ? isDark
                      ? 'hover:bg-gray-700/50 hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]'
                      : 'hover:bg-gray-50 hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.03)]'
                    : ''
                  }
                  ${onRowClick ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/50' : ''}
                  ${getRowClassName ? getRowClassName(row, index) : ''}
                  transition-all duration-200
                `}
                {...(getRowAttributes ? getRowAttributes(row, index) : {})}
              >
                {visibleColumns.map((column) => (
                  <td
                    key={column.key}
                    className={`
                      ${cellPadding} ${horizontalPadding}
                      text-sm
                      ${isDark ? 'text-gray-300' : 'text-gray-900'}
                      ${column.width || ''}
                      ${column.align === 'center' ? 'text-center' : ''}
                      ${column.align === 'right' ? 'text-right' : ''}
                    `}
                  >
                    {column.render
                      ? column.render(row, index)
                      : column.accessor
                      ? column.accessor(row)
                      : (row as any)[column.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default Table;
