import type { IDataAdapter } from './BaseAdapter';
import type { InventoryItem, Vendor, PurchaseOrder, BuildOrder } from '../../types';
import { DataError, DataErrorCode } from '../errors';

export class CSVAdapter implements IDataAdapter {
  readonly name = 'CSV/JSON Upload';
  readonly type = 'file' as const;

  private inventory: InventoryItem[] = [];
  private vendors: Vendor[] = [];
  private pos: PurchaseOrder[] = [];
  private builds: BuildOrder[] = [];

  async connect(): Promise<boolean> { return true; }
  async disconnect(): Promise<void> { /* no-op */ }
  async healthCheck(): Promise<boolean> { return true; }

  // Import CSV text into the adapter's in-memory store
  async importCSVText(text: string, entity: 'inventory' | 'vendors'): Promise<number> {
    const Papa = (await import('papaparse')).default;
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, transform: (v: any) => (typeof v === 'string' ? v.trim() : v) });
    if (parsed.errors?.length) {
      throw new DataError(DataErrorCode.INVALID_DATA, 'CSV parse error', parsed.errors);
    }
    const rows = parsed.data as any[];
    if (entity === 'inventory') {
      this.inventory = rows.map(this.mapCSVToInventoryItem);
      return this.inventory.length;
    }
    if (entity === 'vendors') {
      this.vendors = rows.map(this.mapCSVToVendor);
      return this.vendors.length;
    }
    return 0;
  }

  async fetchInventory(): Promise<InventoryItem[]> { return this.inventory; }
  async fetchVendors(): Promise<Vendor[]> { return this.vendors; }
  async fetchPurchaseOrders(): Promise<PurchaseOrder[]> { return this.pos; }
  async fetchBuildOrders(): Promise<BuildOrder[]> { return this.builds; }

  supportsRealtime(): boolean { return false; }
  supportsWebhooks(): boolean { return false; }
  async getLastSyncTime(): Promise<Date | null> { return null; }

  private mapCSVToInventoryItem = (row: any): InventoryItem => {
    return {
      sku: row['SKU'] || row['sku'],
      name: row['Name'] || row['name'],
      category: row['Category'] || row['category'] || '',
      stock: parseInt(row['Stock'] ?? row['stock'] ?? '0', 10) || 0,
      onOrder: parseInt(row['On Order'] ?? row['onOrder'] ?? '0', 10) || 0,
      reorderPoint: parseInt(row['Reorder Point'] ?? row['reorderPoint'] ?? '0', 10) || 0,
      vendorId: row['Vendor ID'] || row['vendorId'] || 'N/A',
      moq: row['MOQ'] ? parseInt(row['MOQ'], 10) : undefined,
    };
  };

  private mapCSVToVendor = (row: any): Vendor => {
    return {
      id: row['ID'] || row['id'] || crypto.randomUUID(),
      name: row['Name'] || row['name'],
      contactEmails: (row['Emails'] || row['Email'] || row['email'] || '').split(/[,;\s]+/).filter(Boolean),
      phone: row['Phone'] || row['phone'] || '',
      address: row['Address'] || row['address'] || '',
      website: row['Website'] || row['website'] || '',
      leadTimeDays: parseInt(row['Lead Time Days'] ?? row['leadTimeDays'] ?? '0', 10) || 0,
    };
  };
}
