import type { User, InventoryItem, Vendor, PurchaseOrder } from '../../types';
import type { Page } from '../../App';

// Tab IDs for URL hash fragments
export type DashboardTabId = 'overview' | 'stock-intelligence';

export interface DashboardTabConfig {
  id: DashboardTabId;
  label: string;
  shortLabel: string;
}

// Tab definitions
export const dashboardTabs: DashboardTabConfig[] = [
  { id: 'overview', label: 'Overview', shortLabel: 'Overview' },
  { id: 'stock-intelligence', label: 'Stock Intelligence', shortLabel: 'Stock Intel' },
];

// Props passed to Dashboard page - used by DashboardContent
export interface DashboardPageProps {
  currentUser: User;
  setCurrentPage: (page: Page) => void;
  inventory: InventoryItem[];
  vendors: Vendor[];
  purchaseOrders: PurchaseOrder[];
}

// Get default tab
export function getDefaultTab(): DashboardTabId {
  return 'overview';
}
