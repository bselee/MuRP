import type { InventoryItem, Vendor, PurchaseOrder, BuildOrder } from '../../types';

export type AdapterKind = 'api' | 'file' | 'database';

export interface IDataAdapter {
  // Identity
  readonly name: string;
  readonly type: AdapterKind;

  // Connection lifecycle
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<boolean>;

  // CRUD - Read (minimum set for phase 1)
  fetchInventory(): Promise<InventoryItem[]>;
  fetchVendors(): Promise<Vendor[]>;
  fetchPurchaseOrders(): Promise<PurchaseOrder[]>;
  fetchBuildOrders(): Promise<BuildOrder[]>;

  // Capabilities
  supportsRealtime(): boolean;
  supportsWebhooks(): boolean;
  getLastSyncTime(): Promise<Date | null>;
}
