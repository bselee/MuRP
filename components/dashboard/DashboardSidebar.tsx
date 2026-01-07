import React from 'react';
import { useTheme } from '../ThemeProvider';
import { HomeIcon, ChartBarIcon } from '../icons';
import type { DashboardTabId, DashboardTabConfig } from './dashboardConfig';
import { dashboardTabs } from './dashboardConfig';

interface DashboardSidebarProps {
  activeTab: DashboardTabId;
  onSelect: (tab: DashboardTabId) => void;
  onClose?: () => void;
}

const tabIcons: Record<DashboardTabId, React.ReactNode> = {
  'overview': <HomeIcon className="w-5 h-5" />,
  'stock-intelligence': <ChartBarIcon className="w-5 h-5" />,
};

const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  activeTab,
  onSelect,
  onClose,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const handleSelect = (tabId: DashboardTabId) => {
    onSelect(tabId);
    onClose?.();
  };

  return (
    <nav className="h-full overflow-y-auto py-6 px-4">
      <div className="space-y-1">
        {dashboardTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSelect(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? isDark
                    ? 'bg-gray-800 text-white border-l-2 border-accent-400 -ml-[2px] pl-[14px]'
                    : 'bg-gray-100 text-gray-900 border-l-2 border-accent-500 -ml-[2px] pl-[14px]'
                  : isDark
                    ? 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                {tabIcons[tab.id]}
              </span>
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default DashboardSidebar;
