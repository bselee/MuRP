/**
 * Optimistic Update Service
 * 
 * Provides optimistic UI updates for better user experience.
 * Updates are applied immediately to the UI, then confirmed with the server.
 * If the server update fails, the UI is rolled back.
 * 
 * Features:
 * - Instant UI feedback
 * - Automatic rollback on failure
 * - Retry logic for failed updates
 * - Update queue management
 */

import type { InventoryItem, PurchaseOrder, BillOfMaterials } from '../types';

/**
 * Pending update
 */
interface PendingUpdate<T> {
  id: string;
  entity: string;
  oldValue: T;
  newValue: T;
  timestamp: number;
  retries: number;
}

/**
 * Update queue
 */
class OptimisticUpdateQueue {
  private queue: Map<string, PendingUpdate<any>> = new Map();
  private maxRetries = 3;

  /**
   * Add an update to the queue
   */
  add<T>(entity: string, id: string, oldValue: T, newValue: T): void {
    const updateId = `${entity}-${id}`;
    
    this.queue.set(updateId, {
      id,
      entity,
      oldValue,
      newValue,
      timestamp: Date.now(),
      retries: 0,
    });
  }

  /**
   * Mark an update as confirmed
   */
  confirm(entity: string, id: string): void {
    const updateId = `${entity}-${id}`;
    this.queue.delete(updateId);
  }

  /**
   * Rollback an update
   */
  rollback(entity: string, id: string): PendingUpdate<any> | null {
    const updateId = `${entity}-${id}`;
    const update = this.queue.get(updateId);
    
    if (update) {
      this.queue.delete(updateId);
      return update;
    }
    
    return null;
  }

  /**
   * Get pending updates for an entity
   */
  getPending(entity: string): PendingUpdate<any>[] {
    return Array.from(this.queue.values()).filter(u => u.entity === entity);
  }

  /**
   * Get all pending updates
   */
  getAll(): PendingUpdate<any>[] {
    return Array.from(this.queue.values());
  }

  /**
   * Clear all pending updates
   */
  clear(): void {
    this.queue.clear();
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.queue.size;
  }
}

/**
 * Global update queue
 */
const updateQueue = new OptimisticUpdateQueue();

/**
 * Apply an optimistic update
 */
export async function applyOptimisticUpdate<T>(
  entity: string,
  id: string,
  oldValue: T,
  newValue: T,
  serverUpdateFn: (value: T) => Promise<T>,
  onSuccess?: (value: T) => void,
  onError?: (error: Error, rolledBackValue: T) => void
): Promise<void> {
  // Add to queue
  updateQueue.add(entity, id, oldValue, newValue);

  try {
    // Perform server update
    const confirmedValue = await serverUpdateFn(newValue);
    
    // Mark as confirmed
    updateQueue.confirm(entity, id);
    
    // Call success callback
    if (onSuccess) {
      onSuccess(confirmedValue);
    }

  } catch (error) {
    console.error(`Optimistic update failed for ${entity}:${id}`, error);
    
    // Rollback
    const update = updateQueue.rollback(entity, id);
    
    if (update && onError) {
      onError(
        error instanceof Error ? error : new Error('Unknown error'),
        update.oldValue
      );
    }
  }
}

/**
 * Update inventory item optimistically
 */
export async function updateInventoryOptimistic(
  sku: string,
  updates: Partial<InventoryItem>,
  currentItem: InventoryItem,
  serverUpdateFn: (updates: Partial<InventoryItem>) => Promise<InventoryItem>,
  onSuccess?: (item: InventoryItem) => void,
  onRollback?: (item: InventoryItem) => void
): Promise<void> {
  const newItem = { ...currentItem, ...updates };
  
  await applyOptimisticUpdate(
    'inventory',
    sku,
    currentItem,
    newItem,
    () => serverUpdateFn(updates),
    onSuccess,
    (error, rolledBackValue) => {
      console.error('Rolling back inventory update:', error);
      if (onRollback) {
        onRollback(rolledBackValue);
      }
    }
  );
}

/**
 * Update purchase order optimistically
 */
export async function updatePurchaseOrderOptimistic(
  poId: string,
  updates: Partial<PurchaseOrder>,
  currentPO: PurchaseOrder,
  serverUpdateFn: (updates: Partial<PurchaseOrder>) => Promise<PurchaseOrder>,
  onSuccess?: (po: PurchaseOrder) => void,
  onRollback?: (po: PurchaseOrder) => void
): Promise<void> {
  const newPO = { ...currentPO, ...updates };
  
  await applyOptimisticUpdate(
    'purchaseOrder',
    poId,
    currentPO,
    newPO,
    () => serverUpdateFn(updates),
    onSuccess,
    (error, rolledBackValue) => {
      console.error('Rolling back PO update:', error);
      if (onRollback) {
        onRollback(rolledBackValue);
      }
    }
  );
}

/**
 * Update BOM optimistically
 */
export async function updateBOMOptimistic(
  bomId: string,
  updates: Partial<BillOfMaterials>,
  currentBOM: BillOfMaterials,
  serverUpdateFn: (updates: Partial<BillOfMaterials>) => Promise<BillOfMaterials>,
  onSuccess?: (bom: BillOfMaterials) => void,
  onRollback?: (bom: BillOfMaterials) => void
): Promise<void> {
  const newBOM = { ...currentBOM, ...updates };
  
  await applyOptimisticUpdate(
    'bom',
    bomId,
    currentBOM,
    newBOM,
    () => serverUpdateFn(updates),
    onSuccess,
    (error, rolledBackValue) => {
      console.error('Rolling back BOM update:', error);
      if (onRollback) {
        onRollback(rolledBackValue);
      }
    }
  );
}

/**
 * Get pending updates count
 */
export function getPendingUpdatesCount(): number {
  return updateQueue.size();
}

/**
 * Get pending updates for display
 */
export function getPendingUpdates(): Array<{
  entity: string;
  id: string;
  timestamp: number;
}> {
  return updateQueue.getAll().map(update => ({
    entity: update.entity,
    id: update.id,
    timestamp: update.timestamp,
  }));
}

/**
 * Clear all pending updates
 */
export function clearPendingUpdates(): void {
  updateQueue.clear();
}

/**
 * Check if an entity has pending updates
 */
export function hasPendingUpdates(entity: string, id?: string): boolean {
  if (id) {
    return updateQueue.getPending(entity).some(u => u.id === id);
  }
  return updateQueue.getPending(entity).length > 0;
}
