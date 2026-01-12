import React from 'react';
import { useTheme } from '../ThemeProvider';
import { HomeIcon } from '../icons';
import PurchasingGuidanceDashboard from '../PurchasingGuidanceDashboard';
import SetupStatusCard from '../SetupStatusCard';
import { useDataSourceStatus } from '../../hooks/useDataSourceStatus';
import type { DashboardTabId, DashboardPageProps } from './dashboardConfig';

interface DashboardContentProps extends DashboardPageProps {
  activeTab: DashboardTabId;
}

const DashboardContent: React.FC<DashboardContentProps> = ({
  currentUser,
  setCurrentPage,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Get data source status for onboarding guidance
  const { status: dataSourceStatus, loading: statusLoading } = useDataSourceStatus(currentUser?.id);

  return (
    <div className="space-y-6 p-6">
      {/* Simple header */}
      <div className="flex items-center gap-3">
        <HomeIcon className={`w-6 h-6 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
        <h1 className={`text-2xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Dashboard
        </h1>
      </div>

      {/* Setup Status Card - shows for new users who haven't completed setup */}
      {!statusLoading && dataSourceStatus && !dataSourceStatus.setupComplete && (
        <SetupStatusCard
          status={dataSourceStatus}
          onNavigate={(page) => setCurrentPage(page as any)}
        />
      )}

      {/* Stock Intelligence - KPIs, out of stock alerts, replenishment guidance */}
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
