import React from 'react';
import { useTheme } from '../ThemeProvider';
import { HomeIcon } from '../icons';
import PurchasingGuidanceDashboard from '../PurchasingGuidanceDashboard';
import SetupStatusCard from '../SetupStatusCard';
import BuildForecastSummaryCard from '../BuildForecastSummaryCard';
import PageHeader from '@/components/ui/PageHeader';
import { useDataSourceStatus } from '../../hooks/useDataSourceStatus';
import { usePermissions } from '../../hooks/usePermissions';
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
  const permissions = usePermissions();

  // Get data source status for onboarding guidance
  const { status: dataSourceStatus, loading: statusLoading } = useDataSourceStatus(currentUser?.id);

  return (
    <div className="space-y-6 p-6">
      {/* Consistent PageHeader */}
      <PageHeader
        title="Dashboard"
        description="Overview of your inventory health, purchasing needs, and supply chain risks."
        icon={<HomeIcon className="w-6 h-6 text-emerald-400" />}
        actions={
          <div className="text-xs text-gray-500 flex items-center gap-2">
             <span className="bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-full border border-emerald-500/20">
                Live Data
             </span>
          </div>
        }
      />

      {/* Setup Status Card - shows for new users who haven't completed setup */}
      {!statusLoading && dataSourceStatus && !dataSourceStatus.setupComplete && (
        <SetupStatusCard
          status={dataSourceStatus}
          onNavigate={(page) => setCurrentPage(page as any)}
        />
      )}

      {/* Build Forecast Summary - shows production readiness and shortages */}
      {permissions.canViewBoms && (
        <BuildForecastSummaryCard
          onNavigateToBOMs={() => setCurrentPage('BOMs')}
          onNavigateToBuilds={() => setCurrentPage('Build Forecast' as any)}
          expanded={false}
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
        onNavigateToInventoryFilter={(filter) => {
          localStorage.setItem('inventoryDashboardFilter', filter);
          setCurrentPage('Inventory');
        }}
        onNavigateToBOMs={(filter) => {
          if (filter) {
            localStorage.setItem('bomDashboardFilter', filter);
          }
          setCurrentPage('BOMs');
        }}
        onNavigateToVendors={() => setCurrentPage('Vendors')}
      />
    </div>
  );
};

export default DashboardContent;
