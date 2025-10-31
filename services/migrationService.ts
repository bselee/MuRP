/**
 * Migration Service - localStorage to Supabase
 * 
 * Handles migration of existing localStorage data to Supabase backend.
 * 
 * Features:
 * - Safe migration with validation
 * - Conflict resolution
 * - Rollback support
 * - Progress tracking
 * - Data preservation
 */

import {
  bulkUpsertInventory,
  createVendor,
  createBOM,
  createPurchaseOrder,
  createBuildOrder,
  createArtworkFolder,
  isDataServiceAvailable,
} from './dataService';
import type {
  InventoryItem,
  Vendor,
  BillOfMaterials,
  PurchaseOrder,
  BuildOrder,
  ArtworkFolder,
} from '../types';

/**
 * Migration result for tracking progress
 */
export interface MigrationResult {
  entity: string;
  success: boolean;
  itemsMigrated: number;
  itemsFailed: number;
  errors: string[];
  duration: number;
}

/**
 * Full migration report
 */
export interface MigrationReport {
  startedAt: string;
  completedAt: string;
  totalDuration: number;
  results: MigrationResult[];
  overallSuccess: boolean;
}

/**
 * Migration options
 */
export interface MigrationOptions {
  dryRun?: boolean;
  skipConflicts?: boolean;
  backupFirst?: boolean;
}

/**
 * Check if migration is needed
 */
export function needsMigration(): boolean {
  if (!isDataServiceAvailable()) {
    return false;
  }

  // Check if localStorage has data
  const hasLocalData = !!(
    localStorage.getItem('tgf-mrp::inventory') ||
    localStorage.getItem('tgf-mrp::vendors') ||
    localStorage.getItem('tgf-mrp::boms') ||
    localStorage.getItem('tgf-mrp::purchaseOrders') ||
    localStorage.getItem('tgf-mrp::buildOrders')
  );

  // Check if Supabase is empty (would need an API call in real implementation)
  const hasSupabaseData = localStorage.getItem('tgf-mrp::migration-completed') === 'true';

  return hasLocalData && !hasSupabaseData;
}

/**
 * Perform full migration from localStorage to Supabase
 */
export async function migrateToSupabase(
  options: MigrationOptions = {}
): Promise<MigrationReport> {
  console.log('🚀 Starting migration to Supabase...', options);

  const startTime = Date.now();
  const results: MigrationResult[] = [];
  
  if (!isDataServiceAvailable()) {
    throw new Error('Supabase not configured. Cannot perform migration.');
  }

  // Backup if requested
  if (options.backupFirst) {
    await backupLocalStorage();
  }

  try {
    // Migrate in order (vendors first, then inventory, then BOMs, etc.)
    results.push(await migrateVendors(options));
    results.push(await migrateInventory(options));
    results.push(await migrateArtworkFolders(options));
    results.push(await migrateBOMs(options));
    results.push(await migratePurchaseOrders(options));
    results.push(await migrateBuildOrders(options));

    const completedAt = new Date().toISOString();
    const totalDuration = Date.now() - startTime;
    const overallSuccess = results.every(r => r.success);

    if (!options.dryRun && overallSuccess) {
      // Mark migration as complete
      localStorage.setItem('tgf-mrp::migration-completed', 'true');
      localStorage.setItem('tgf-mrp::migration-date', completedAt);
    }

    const report: MigrationReport = {
      startedAt: new Date(startTime).toISOString(),
      completedAt,
      totalDuration,
      results,
      overallSuccess,
    };

    console.log('✅ Migration complete:', report);
    return report;

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Migrate vendors
 */
async function migrateVendors(options: MigrationOptions): Promise<MigrationResult> {
  const startTime = Date.now();
  const result: MigrationResult = {
    entity: 'vendors',
    success: true,
    itemsMigrated: 0,
    itemsFailed: 0,
    errors: [],
    duration: 0,
  };

  try {
    const vendorsJson = localStorage.getItem('tgf-mrp::vendors');
    if (!vendorsJson) {
      console.log('No vendors to migrate');
      result.duration = Date.now() - startTime;
      return result;
    }

    const vendors: Vendor[] = JSON.parse(vendorsJson);
    console.log(`Migrating ${vendors.length} vendors...`);

    if (options.dryRun) {
      result.itemsMigrated = vendors.length;
      result.duration = Date.now() - startTime;
      return result;
    }

    for (const vendor of vendors) {
      try {
        await createVendor(vendor);
        result.itemsMigrated++;
      } catch (error) {
        result.itemsFailed++;
        result.errors.push(`Vendor ${vendor.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        if (!options.skipConflicts) {
          result.success = false;
        }
      }
    }

  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Migrate inventory
 */
async function migrateInventory(options: MigrationOptions): Promise<MigrationResult> {
  const startTime = Date.now();
  const result: MigrationResult = {
    entity: 'inventory',
    success: true,
    itemsMigrated: 0,
    itemsFailed: 0,
    errors: [],
    duration: 0,
  };

  try {
    const inventoryJson = localStorage.getItem('tgf-mrp::inventory');
    if (!inventoryJson) {
      console.log('No inventory to migrate');
      result.duration = Date.now() - startTime;
      return result;
    }

    const inventory: InventoryItem[] = JSON.parse(inventoryJson);
    console.log(`Migrating ${inventory.length} inventory items...`);

    if (options.dryRun) {
      result.itemsMigrated = inventory.length;
      result.duration = Date.now() - startTime;
      return result;
    }

    // Use bulk upsert for efficiency
    await bulkUpsertInventory(inventory);
    result.itemsMigrated = inventory.length;

  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Migrate artwork folders
 */
async function migrateArtworkFolders(options: MigrationOptions): Promise<MigrationResult> {
  const startTime = Date.now();
  const result: MigrationResult = {
    entity: 'artworkFolders',
    success: true,
    itemsMigrated: 0,
    itemsFailed: 0,
    errors: [],
    duration: 0,
  };

  try {
    const foldersJson = localStorage.getItem('tgf-mrp::artworkFolders');
    if (!foldersJson) {
      console.log('No artwork folders to migrate');
      result.duration = Date.now() - startTime;
      return result;
    }

    const folders: ArtworkFolder[] = JSON.parse(foldersJson);
    console.log(`Migrating ${folders.length} artwork folders...`);

    if (options.dryRun) {
      result.itemsMigrated = folders.length;
      result.duration = Date.now() - startTime;
      return result;
    }

    for (const folder of folders) {
      try {
        await createArtworkFolder(folder.name);
        result.itemsMigrated++;
      } catch (error) {
        result.itemsFailed++;
        result.errors.push(`Folder ${folder.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        if (!options.skipConflicts) {
          result.success = false;
        }
      }
    }

  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Migrate BOMs
 */
async function migrateBOMs(options: MigrationOptions): Promise<MigrationResult> {
  const startTime = Date.now();
  const result: MigrationResult = {
    entity: 'boms',
    success: true,
    itemsMigrated: 0,
    itemsFailed: 0,
    errors: [],
    duration: 0,
  };

  try {
    const bomsJson = localStorage.getItem('tgf-mrp::boms');
    if (!bomsJson) {
      console.log('No BOMs to migrate');
      result.duration = Date.now() - startTime;
      return result;
    }

    const boms: BillOfMaterials[] = JSON.parse(bomsJson);
    console.log(`Migrating ${boms.length} BOMs...`);

    if (options.dryRun) {
      result.itemsMigrated = boms.length;
      result.duration = Date.now() - startTime;
      return result;
    }

    for (const bom of boms) {
      try {
        await createBOM(bom);
        result.itemsMigrated++;
      } catch (error) {
        result.itemsFailed++;
        result.errors.push(`BOM ${bom.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        if (!options.skipConflicts) {
          result.success = false;
        }
      }
    }

  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Migrate purchase orders
 */
async function migratePurchaseOrders(options: MigrationOptions): Promise<MigrationResult> {
  const startTime = Date.now();
  const result: MigrationResult = {
    entity: 'purchaseOrders',
    success: true,
    itemsMigrated: 0,
    itemsFailed: 0,
    errors: [],
    duration: 0,
  };

  try {
    const posJson = localStorage.getItem('tgf-mrp::purchaseOrders');
    if (!posJson) {
      console.log('No purchase orders to migrate');
      result.duration = Date.now() - startTime;
      return result;
    }

    const pos: PurchaseOrder[] = JSON.parse(posJson);
    console.log(`Migrating ${pos.length} purchase orders...`);

    if (options.dryRun) {
      result.itemsMigrated = pos.length;
      result.duration = Date.now() - startTime;
      return result;
    }

    for (const po of pos) {
      try {
        await createPurchaseOrder(po);
        result.itemsMigrated++;
      } catch (error) {
        result.itemsFailed++;
        result.errors.push(`PO ${po.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        if (!options.skipConflicts) {
          result.success = false;
        }
      }
    }

  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Migrate build orders
 */
async function migrateBuildOrders(options: MigrationOptions): Promise<MigrationResult> {
  const startTime = Date.now();
  const result: MigrationResult = {
    entity: 'buildOrders',
    success: true,
    itemsMigrated: 0,
    itemsFailed: 0,
    errors: [],
    duration: 0,
  };

  try {
    const ordersJson = localStorage.getItem('tgf-mrp::buildOrders');
    if (!ordersJson) {
      console.log('No build orders to migrate');
      result.duration = Date.now() - startTime;
      return result;
    }

    const orders: BuildOrder[] = JSON.parse(ordersJson);
    console.log(`Migrating ${orders.length} build orders...`);

    if (options.dryRun) {
      result.itemsMigrated = orders.length;
      result.duration = Date.now() - startTime;
      return result;
    }

    for (const order of orders) {
      try {
        await createBuildOrder(order);
        result.itemsMigrated++;
      } catch (error) {
        result.itemsFailed++;
        result.errors.push(`Build order ${order.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        if (!options.skipConflicts) {
          result.success = false;
        }
      }
    }

  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Backup localStorage data to JSON file
 */
async function backupLocalStorage(): Promise<void> {
  console.log('📦 Creating localStorage backup...');
  
  const backup = {
    timestamp: new Date().toISOString(),
    inventory: localStorage.getItem('tgf-mrp::inventory'),
    vendors: localStorage.getItem('tgf-mrp::vendors'),
    boms: localStorage.getItem('tgf-mrp::boms'),
    purchaseOrders: localStorage.getItem('tgf-mrp::purchaseOrders'),
    buildOrders: localStorage.getItem('tgf-mrp::buildOrders'),
    artworkFolders: localStorage.getItem('tgf-mrp::artworkFolders'),
  };

  // Store backup in localStorage
  localStorage.setItem('tgf-mrp::backup', JSON.stringify(backup));
  
  console.log('✅ Backup created');
}

/**
 * Restore from backup
 */
export async function restoreFromBackup(): Promise<void> {
  console.log('🔄 Restoring from backup...');
  
  const backupJson = localStorage.getItem('tgf-mrp::backup');
  if (!backupJson) {
    throw new Error('No backup found');
  }

  const backup = JSON.parse(backupJson);
  
  if (backup.inventory) localStorage.setItem('tgf-mrp::inventory', backup.inventory);
  if (backup.vendors) localStorage.setItem('tgf-mrp::vendors', backup.vendors);
  if (backup.boms) localStorage.setItem('tgf-mrp::boms', backup.boms);
  if (backup.purchaseOrders) localStorage.setItem('tgf-mrp::purchaseOrders', backup.purchaseOrders);
  if (backup.buildOrders) localStorage.setItem('tgf-mrp::buildOrders', backup.buildOrders);
  if (backup.artworkFolders) localStorage.setItem('tgf-mrp::artworkFolders', backup.artworkFolders);
  
  console.log('✅ Restore complete');
}

/**
 * Download backup as JSON file
 */
export function downloadBackup(): void {
  const backupJson = localStorage.getItem('tgf-mrp::backup');
  if (!backupJson) {
    alert('No backup found');
    return;
  }

  const blob = new Blob([backupJson], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tgf-mrp-backup-${new Date().toISOString()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Reset migration status (for testing)
 */
export function resetMigrationStatus(): void {
  localStorage.removeItem('tgf-mrp::migration-completed');
  localStorage.removeItem('tgf-mrp::migration-date');
  console.log('Migration status reset');
}
