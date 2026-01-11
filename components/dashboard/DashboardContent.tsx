import React from 'react';
import { useTheme } from '../ThemeProvider';
import { HomeIcon } from '../icons';
import AgentActivityPill from '../AgentActivityPill';
import type { DashboardTabId, DashboardPageProps } from './dashboardConfig';

interface DashboardContentProps extends DashboardPageProps {
  activeTab: DashboardTabId;
}

const DashboardContent: React.FC<DashboardContentProps> = ({
  activeTab,
  currentUser,
  setCurrentPage,
  inventory,
  vendors,
  purchaseOrders,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <div className="p-6">
      {/* Compact header with Agent Activity pill */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HomeIcon className={`w-6 h-6 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          <h1 className={`text-2xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Dashboard
          </h1>
        </div>

        {/* Agent Activity Pill - vibrates when updating */}
        <AgentActivityPill
          onViewAll={() => setCurrentPage('Agent Command Center')}
        />
      </div>
    </div>
  );
};

export default DashboardContent;
