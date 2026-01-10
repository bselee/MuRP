import React from 'react';
import { useTheme } from '../ThemeProvider';
import { HomeIcon } from '../icons';
import AgentControlCenter from '../AgentControlCenter';
import PurchasingGuidanceDashboard from '../PurchasingGuidanceDashboard';
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
    <div className="space-y-6 p-6">
      {/* Simple header */}
      <div className="flex items-center gap-3">
        <HomeIcon className={`w-6 h-6 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
        <h1 className={`text-2xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Dashboard
        </h1>
      </div>

      {/* Agent Control Center */}
      <AgentControlCenter
        onViewAllActivity={() => setCurrentPage('Agent Command Center')}
        onNavigateToInventory={(sku) => {
          console.log('[Dashboard] SKU click:', sku);
        }}
      />

      {/* Stock guidance */}
      <PurchasingGuidanceDashboard
        onNavigateToPOs={() => setCurrentPage('Purchase Orders')}
        onNavigateToPO={(poNumber) => {
          localStorage.setItem('highlightedPO', poNumber);
          setCurrentPage('Purchase Orders');
        }}
        onNavigateToSku={(sku) => {
          localStorage.setItem('highlightedSku', sku);
          setCurrentPage('Inventory');
        }}
      />
    </div>
  );
};

export default DashboardContent;
