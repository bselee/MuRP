import React from 'react';
import { useTheme } from '../ThemeProvider';
import { HomeIcon } from '../icons';
import type { DashboardTabId } from './dashboardConfig';
import { dashboardTabs } from './dashboardConfig';

interface DashboardSidebarProps {
  activeTab: DashboardTabId;
  onSelect: (tab: DashboardTabId) => void;
  onClose?: () => void;
  isCollapsed?: boolean;
}

const tabIcons: Record<DashboardTabId, React.ReactNode> = {
  'overview': <HomeIcon className="w-5 h-5" />,
};

const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  activeTab,
  onSelect,
  onClose,
  isCollapsed = false,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const handleSelect = (tabId: DashboardTabId) => {
    onSelect(tabId);
    onClose?.();
  };

  return (
    <nav className={`h-full overflow-y-auto py-6 ${isCollapsed ? 'px-2' : 'px-4'}`}>
      <div className="space-y-1">
        {dashboardTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSelect(tab.id)}
              className={`relative w-full flex items-center rounded-md text-sm font-medium transition-colors group ${
                isCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
              } ${
                isActive
                  ? isDark
                    ? 'bg-gray-800 text-white border-l-2 border-accent-400 -ml-[2px] pl-[14px]'
                    : 'bg-gray-100 text-gray-900 border-l-2 border-accent-500 -ml-[2px] pl-[14px]'
                  : isDark
                    ? 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              } ${isCollapsed && isActive ? 'pl-[10px]' : ''}`}
            >
              <span className={`flex-shrink-0 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {tabIcons[tab.id]}
              </span>
              {!isCollapsed && tab.label}
              {/* Tooltip on hover when collapsed */}
              {isCollapsed && (
                <span className={`pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 ${
                  isDark ? 'bg-gray-800 text-white border border-gray-700' : 'bg-white text-gray-900 border border-gray-200 shadow-sm'
                }`}>
                  {tab.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default DashboardSidebar;
