import React from 'react';
import { useTheme } from '../ThemeProvider';
import { Bars3BottomLeftIcon, XMarkIcon, HomeIcon, ChevronDoubleLeftIcon } from '../icons';

interface DashboardLayoutProps {
  sidebar: React.ReactNode;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  sidebar,
  sidebarOpen,
  onToggleSidebar,
  isCollapsed,
  onToggleCollapse,
  children,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <div className="flex h-full min-h-0">
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onToggleSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - fixed on mobile, collapsible on desktop */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 transform transition-all duration-200 ease-in-out
          lg:relative lg:translate-x-0 lg:z-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          ${isCollapsed ? 'lg:w-14' : 'lg:w-56'} w-56
          ${isDark ? 'bg-gray-900 border-r border-gray-800' : 'bg-white border-r border-gray-200'}
        `}
      >
        {/* Mobile header with close button */}
        <div className="flex items-center justify-between px-4 py-4 lg:hidden">
          <div className="flex items-center gap-2">
            <HomeIcon className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
            <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Dashboard
            </span>
          </div>
          <button
            type="button"
            onClick={onToggleSidebar}
            className={`p-2 rounded-md ${
              isDark
                ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
            aria-label="Close sidebar"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Desktop header with collapse toggle - h-12 is smaller than main sidebar h-14 */}
        <div className={`hidden lg:flex items-center relative h-12 ${isCollapsed ? 'justify-center px-2' : 'gap-2 px-4'}`}>
          <HomeIcon className={`w-5 h-5 flex-shrink-0 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          {!isCollapsed && (
            <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Dashboard
            </span>
          )}
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`absolute -right-3 top-1/2 -translate-y-1/2 rounded-full p-1 border transition-transform z-10 ${
              isDark
                ? 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700'
                : 'bg-white border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 shadow-sm'
            }`}
          >
            <ChevronDoubleLeftIcon className={`w-3 h-3 transition-transform duration-200 ${isCollapsed ? 'rotate-180' : 'rotate-0'}`} />
          </button>
        </div>

        {/* Sidebar content */}
        <div className="h-[calc(100%-4rem)] lg:h-[calc(100%-3rem)]">
          {sidebar}
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {/* Mobile header with menu button */}
        <div
          className={`sticky top-0 z-30 flex items-center gap-3 px-4 py-3 lg:hidden ${
            isDark ? 'bg-gray-900/95 border-b border-gray-800' : 'bg-white/95 border-b border-gray-200'
          } backdrop-blur-sm`}
        >
          <button
            type="button"
            onClick={onToggleSidebar}
            className={`p-2 -ml-2 rounded-md ${
              isDark
                ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
            aria-label="Open sidebar"
          >
            <Bars3BottomLeftIcon className="w-5 h-5" />
          </button>
          <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Dashboard
          </span>
        </div>

        {/* Content */}
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
