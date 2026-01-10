import type { User, InventoryItem, Vendor, PurchaseOrder } from '../../types';
import type { Page } from '../../App';

// Tab IDs for URL hash fragments (simplified - only overview now)
export type DashboardTabId = 'overview';

export interface DashboardTabConfig {
  id: DashboardTabId;
  label: string;
  shortLabel: string;
}

// Tab definitions (Stock Intelligence removed - redundant with overview content)
export const dashboardTabs: DashboardTabConfig[] = [
  { id: 'overview', label: 'Overview', shortLabel: 'Overview' },
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
