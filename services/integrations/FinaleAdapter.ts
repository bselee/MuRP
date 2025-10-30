import type { IDataAdapter } from './BaseAdapter';
import type { InventoryItem, Vendor, PurchaseOrder, BuildOrder } from '../../types';
import { DataError, DataErrorCode } from '../errors';

export interface FinaleConfig {
  apiKey: string;
  accountId: string;
  baseUrl: string;
}

export class FinaleAdapter implements IDataAdapter {
  readonly name = 'Finale Inventory';
  readonly type = 'api' as const;

  constructor(private config: FinaleConfig) {}

  async connect(): Promise<boolean> {
    // Placeholder until API docs/credentials available
    console.warn('[FinaleAdapter] connect() not implemented');
    return false;
  }

  async disconnect(): Promise<void> { /* no-op */ }
  async healthCheck(): Promise<boolean> { return false; }

  async fetchInventory(): Promise<InventoryItem[]> {
    throw new DataError(DataErrorCode.NOT_IMPLEMENTED, 'Finale adapter requires API documentation and credentials');
  }
  async fetchVendors(): Promise<Vendor[]> {
    throw new DataError(DataErrorCode.NOT_IMPLEMENTED, 'Finale adapter not implemented');
  }
  async fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
    throw new DataError(DataErrorCode.NOT_IMPLEMENTED, 'Finale adapter not implemented');
  }
  async fetchBuildOrders(): Promise<BuildOrder[]> {
    throw new DataError(DataErrorCode.NOT_IMPLEMENTED, 'Finale adapter not implemented');
  }

  supportsRealtime(): boolean { return false; }
  supportsWebhooks(): boolean { return false; }
  async getLastSyncTime(): Promise<Date | null> { return null; }
}
