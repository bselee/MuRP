import React, { useState } from 'react';
import type { Page } from '../App';
import type { User, InventoryItem, Vendor, PurchaseOrder } from '../types';
import useDashboardHash from '../hooks/useDashboardHash';
import { getDefaultTab } from '../components/dashboard/dashboardConfig';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import DashboardSidebar from '../components/dashboard/DashboardSidebar';
import DashboardContent from '../components/dashboard/DashboardContent';

interface DashboardProps {
  currentUser: User;
  setCurrentPage: (page: Page) => void;
  inventory?: InventoryItem[];
  vendors?: Vendor[];
  purchaseOrders?: PurchaseOrder[];
  // Legacy props - kept for compatibility but not used
  boms?: any[];
  historicalSales?: any[];
  requisitions?: any[];
  users?: any[];
  onCreateRequisition?: any;
  onCreateBuildOrder?: any;
  aiConfig?: any;
  finalePurchaseOrders?: any[];
}

const Dashboard: React.FC<DashboardProps> = ({
  currentUser,
  setCurrentPage,
  inventory = [],
  vendors = [],
  purchaseOrders = [],
}) => {
  // URL hash-based tab navigation
  const [activeTab, setActiveTab] = useDashboardHash(getDefaultTab());

  // Mobile sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <DashboardLayout
      sidebar={
        <DashboardSidebar
          activeTab={activeTab}
          onSelect={setActiveTab}
          onClose={() => setSidebarOpen(false)}
        />
      }
      sidebarOpen={sidebarOpen}
      onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
    >
      <DashboardContent
        activeTab={activeTab}
        currentUser={currentUser}
        setCurrentPage={setCurrentPage}
        inventory={inventory}
        vendors={vendors}
        purchaseOrders={purchaseOrders}
      />
    </DashboardLayout>
  );
};

export default Dashboard;
