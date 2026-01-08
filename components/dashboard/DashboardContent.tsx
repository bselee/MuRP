import React from 'react';
import { useTheme } from '../ThemeProvider';
import Button from '../ui/Button';
import PageHeader from '../ui/PageHeader';
import { HomeIcon, ClipboardDocumentListIcon } from '../icons';
import SystemHealthWidget from '../SystemHealthWidget';
import AgentControlCenter from '../AgentControlCenter';
import PurchasingGuidanceDashboard from '../PurchasingGuidanceDashboard';
import StockIntelligence from '../../pages/StockIntelligence';
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

  switch (activeTab) {
    case 'overview':
      return (
        <div className="space-y-6">
          <PageHeader
            title="Dashboard"
            description="Stock levels and reorder guidance"
            icon={<HomeIcon />}
            actions={
              <div className="flex items-center gap-3">
                <SystemHealthWidget
                  compact
                  onNavigateToSettings={() => setCurrentPage('Settings')}
                />
                <Button
                  onClick={() => setCurrentPage('Purchase Orders')}
                  size="sm"
                  leftIcon={<ClipboardDocumentListIcon className="w-4 h-4" aria-hidden="true" />}
                >
                  View Reorder Queue
                </Button>
              </div>
            }
          />

          {/* Agent Control Center */}
          <AgentControlCenter
            onViewAllActivity={() => setCurrentPage('Agent Command Center')}
            onNavigateToInventory={(sku) => {
              console.log('[Dashboard] SKU click:', sku);
            }}
          />

          {/* Stock guidance */}
          <PurchasingGuidanceDashboard onNavigateToPOs={() => setCurrentPage('Purchase Orders')} />
        </div>
      );

    case 'stock-intelligence':
      return (
        <StockIntelligence
          inventory={inventory}
          vendors={vendors}
          purchaseOrders={purchaseOrders}
        />
      );

    default:
      return (
        <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          <p>Tab not found</p>
        </div>
      );
  }
};

export default DashboardContent;
