import React from 'react';
import { useTheme } from '../ThemeProvider';
import { Bars3BottomLeftIcon, XMarkIcon, SettingsIcon } from '../icons';

interface SettingsLayoutProps {
  sidebar: React.ReactNode;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  children: React.ReactNode;
}

const SettingsLayout: React.FC<SettingsLayoutProps> = ({
  sidebar,
  sidebarOpen,
  onToggleSidebar,
  children,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <div className="flex h-full min-h-0">
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onToggleSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - fixed on mobile, static on desktop */}
      {/* Modern SaaS: White background, subtle border */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out
          lg:relative lg:translate-x-0 lg:z-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          ${isDark ? 'bg-gray-900 border-r border-gray-800' : 'bg-white border-r border-gray-200'}
        `}
      >
        {/* Mobile header with close button */}
        <div className={`flex items-center justify-between px-4 py-4 lg:hidden border-b ${
          isDark ? 'border-gray-800' : 'border-gray-100'
        }`}>
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-gray-400" />
            <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Settings
            </span>
          </div>
          <button
            type="button"
            onClick={onToggleSidebar}
            className={`p-2 rounded-md transition-colors ${
              isDark
                ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
            aria-label="Close sidebar"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Desktop header */}
        <div className={`hidden lg:flex items-center gap-2 px-6 py-5 border-b ${
          isDark ? 'border-gray-800' : 'border-gray-100'
        }`}>
          <SettingsIcon className="w-5 h-5 text-gray-400" />
          <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Settings
          </span>
        </div>

        {/* Sidebar content */}
        <div className="h-[calc(100%-4rem)] lg:h-[calc(100%-3.5rem)]">
          {sidebar}
        </div>
      </aside>

      {/* Main content area - light gray background for contrast */}
      <main className={`flex-1 min-w-0 overflow-y-auto ${
        isDark ? 'bg-gray-950' : 'bg-gray-50'
      }`}>
        {/* Mobile header with menu button */}
        <div
          className={`sticky top-0 z-30 flex items-center gap-3 px-4 py-3 lg:hidden ${
            isDark ? 'bg-gray-900/95 border-b border-gray-800' : 'bg-white/95 border-b border-gray-200'
          } backdrop-blur-sm`}
        >
          <button
            type="button"
            onClick={onToggleSidebar}
            className={`p-2 -ml-2 rounded-md transition-colors ${
              isDark
                ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
            aria-label="Open sidebar"
          >
            <Bars3BottomLeftIcon className="w-5 h-5" />
          </button>
          <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Settings
          </span>
        </div>

        {/* Content */}
        <div className="p-6 lg:p-8 max-w-4xl">
          {children}
        </div>
      </main>
    </div>
  );
};

export default SettingsLayout;
