import React from 'react';
import type { Page } from '../App';
import type { User, InventoryItem, Vendor, PurchaseOrder } from '../types';
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
  return (
    <div className="min-h-screen">
      <DashboardContent
        activeTab="overview"
        currentUser={currentUser}
        setCurrentPage={setCurrentPage}
        inventory={inventory}
        vendors={vendors}
        purchaseOrders={purchaseOrders}
      />
    </div>
  );
};

export default Dashboard;
