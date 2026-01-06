import React from 'react';
import Button from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import type { Page } from '../App';
import type { User } from '../types';
import PurchasingGuidanceDashboard from '../components/PurchasingGuidanceDashboard';
import SystemHealthWidget from '../components/SystemHealthWidget';
import AgentControlCenter from '../components/AgentControlCenter';
import { ClipboardDocumentListIcon, HomeIcon } from '../components/icons';

interface DashboardProps {
  currentUser: User;
  setCurrentPage: (page: Page) => void;
  // Legacy props - kept for compatibility but not used in simplified dashboard
  inventory?: any[];
  boms?: any[];
  historicalSales?: any[];
  vendors?: any[];
  requisitions?: any[];
  users?: any[];
  purchaseOrders?: any[];
  onCreateRequisition?: any;
  onCreateBuildOrder?: any;
  aiConfig?: any;
}

const Dashboard: React.FC<DashboardProps> = ({ setCurrentPage }) => {
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

      {/* HERO: Agent Control Center - UNMISSABLE visibility into agent activity */}
      <AgentControlCenter
        onViewAllActivity={() => setCurrentPage('Admin')}
      />

      {/* Stock guidance below the agent activity */}
      <PurchasingGuidanceDashboard />
    </div>
  );
};

export default Dashboard;
