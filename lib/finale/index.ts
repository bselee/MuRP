/**
 * Finale Inventory Integration - Barrel Export
 *
 * Clean, organized exports for the entire Finale integration module
 */

// =============================================================================
// Client Exports
// =============================================================================

export {
  FinaleClient,
  createFinaleClientFromEnv,
  getFinaleClient,
  updateFinaleClient,
} from './client';

// =============================================================================
// Type Exports
// =============================================================================

export type {
  // API Response Types
  FinaleApiResponse,
  FinalePaginatedResponse,

  // Data Types
  FinaleProduct,
  FinalePartyGroup,
  FinalePurchaseOrder,
  FinalePOLineItem,
  FinaleFacility,
  FinaleStockTransaction,
  FinaleAssembly,
  FinaleAssemblyComponent,

  // Configuration Types
  FinaleConnectionConfig,
  FinaleConnectionStatus,

  // Sync Types
  FinaleSyncResult,
  FinaleSyncOptions,
} from './types';

// =============================================================================
// Transformer Exports
// =============================================================================

export {
  // Utility functions
  extractIdFromUri,
  formatAddress,
  categorizeProduct,

  // Individual transformations
  transformFinaleProductToInventoryItem,
  transformFinaleVendorToVendor,
  transformFinalePOToPurchaseOrder,
  transformFinaleAssemblyToBOM,

  // Batch transformations
  transformFinaleProductsToInventory,
  transformFinaleVendorsToVendors,
  transformFinalePOsToPurchaseOrders,
  transformFinaleAssembliesToBOMs,
  transformFinaleData,

  // Status mapping
  mapFinaleStatusToAppStatus,

  // Validation
  validateInventoryItem,
  validateVendor,
  validatePurchaseOrder,

  // Default export
  default as transformers,
} from './transformers';

export type {
  TransformedFinaleData,
  FinaleRawData,
} from './transformers';

// =============================================================================
// Re-export everything as namespace (optional convenience)
// =============================================================================

import * as client from './client';
import * as types from './types';
import * as transformers from './transformers';

export const Finale = {
  client,
  types,
  transformers,
};

export default Finale;
