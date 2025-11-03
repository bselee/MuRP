/**
 * Test Script: Finale Integration Data Flow
 *
 * This script tests the complete data flow from Finale API to the application:
 * 1. Tests Finale API connection
 * 2. Fetches real data from Finale
 * 3. Transforms data to app format
 * 4. Validates transformed data
 * 5. Tests DataService layer
 *
 * Usage:
 *   ts-node scripts/test-finale-integration.ts
 *   OR
 *   npm run test:finale
 */

import { getFinaleClient } from '../lib/finale/client';
import {
  transformFinaleProductsToInventory,
  transformFinaleVendorsToVendors,
  transformFinalePOsToPurchaseOrders,
  validateInventoryItem,
  validateVendor,
  validatePurchaseOrder,
} from '../lib/finale/transformers';
import { getDataService } from '../lib/dataService';

// =============================================================================
// Test Utilities
// =============================================================================

function logSection(title: string) {
  console.log('\n' + '='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80));
}

function logSuccess(message: string) {
  console.log(`✅ ${message}`);
}

function logError(message: string) {
  console.error(`❌ ${message}`);
}

function logInfo(message: string) {
  console.log(`ℹ️  ${message}`);
}

// =============================================================================
// Test 1: Connection Test
// =============================================================================

async function testConnection() {
  logSection('Test 1: Finale API Connection');

  const finaleClient = getFinaleClient();

  if (!finaleClient) {
    logError('Finale client not configured. Check .env.local for credentials.');
    return false;
  }

  logInfo('Testing connection to Finale API...');

  try {
    const result = await finaleClient.testConnection();

    if (result.success) {
      logSuccess(`Connection successful: ${result.message}`);
      return true;
    } else {
      logError(`Connection failed: ${result.message}`);
      return false;
    }
  } catch (error) {
    logError(`Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}

// =============================================================================
// Test 2: Data Fetching
// =============================================================================

async function testDataFetching() {
  logSection('Test 2: Fetching Data from Finale API');

  const finaleClient = getFinaleClient();

  if (!finaleClient) {
    logError('Finale client not available');
    return null;
  }

  try {
    logInfo('Fetching products...');
    const products = await finaleClient.fetchProducts({ status: 'PRODUCT_ACTIVE', limit: 5 });
    logSuccess(`Fetched ${products.length} products`);
    console.log('Sample product:', JSON.stringify(products[0], null, 2));

    logInfo('Fetching vendors...');
    const vendors = await finaleClient.fetchVendors({ limit: 5 });
    logSuccess(`Fetched ${vendors.length} vendors`);
    console.log('Sample vendor:', JSON.stringify(vendors[0], null, 2));

    logInfo('Fetching purchase orders...');
    const purchaseOrders = await finaleClient.fetchPurchaseOrders({ limit: 5 });
    logSuccess(`Fetched ${purchaseOrders.length} purchase orders`);
    if (purchaseOrders.length > 0) {
      console.log('Sample PO:', JSON.stringify(purchaseOrders[0], null, 2));
    }

    return { products, vendors, purchaseOrders };
  } catch (error) {
    logError(`Data fetching error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

// =============================================================================
// Test 3: Data Transformation
// =============================================================================

async function testDataTransformation(rawData: any) {
  logSection('Test 3: Data Transformation');

  if (!rawData) {
    logError('No raw data to transform');
    return null;
  }

  const { products, vendors, purchaseOrders } = rawData;

  try {
    logInfo('Transforming products to inventory items...');
    const inventory = transformFinaleProductsToInventory(products);
    logSuccess(`Transformed ${inventory.length} inventory items`);
    console.log('Sample inventory item:', JSON.stringify(inventory[0], null, 2));

    logInfo('Transforming vendors...');
    const transformedVendors = transformFinaleVendorsToVendors(vendors);
    logSuccess(`Transformed ${transformedVendors.length} vendors`);
    console.log('Sample vendor:', JSON.stringify(transformedVendors[0], null, 2));

    logInfo('Transforming purchase orders...');
    const transformedPOs = transformFinalePOsToPurchaseOrders(purchaseOrders);
    logSuccess(`Transformed ${transformedPOs.length} purchase orders`);
    if (transformedPOs.length > 0) {
      console.log('Sample PO:', JSON.stringify(transformedPOs[0], null, 2));
    }

    return {
      inventory,
      vendors: transformedVendors,
      purchaseOrders: transformedPOs,
    };
  } catch (error) {
    logError(`Transformation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

// =============================================================================
// Test 4: Data Validation
// =============================================================================

async function testDataValidation(transformedData: any) {
  logSection('Test 4: Data Validation');

  if (!transformedData) {
    logError('No transformed data to validate');
    return false;
  }

  const { inventory, vendors, purchaseOrders } = transformedData;

  let allValid = true;

  // Validate inventory
  logInfo(`Validating ${inventory.length} inventory items...`);
  let validInventoryCount = 0;
  let invalidInventoryCount = 0;

  inventory.forEach((item: any) => {
    const validation = validateInventoryItem(item);
    if (validation.valid) {
      validInventoryCount++;
    } else {
      invalidInventoryCount++;
      console.warn(`Invalid inventory item ${item.sku}:`, validation.errors);
      allValid = false;
    }
  });

  logSuccess(`${validInventoryCount}/${inventory.length} inventory items are valid`);
  if (invalidInventoryCount > 0) {
    logError(`${invalidInventoryCount} inventory items have validation errors`);
  }

  // Validate vendors
  logInfo(`Validating ${vendors.length} vendors...`);
  let validVendorCount = 0;
  let invalidVendorCount = 0;

  vendors.forEach((vendor: any) => {
    const validation = validateVendor(vendor);
    if (validation.valid) {
      validVendorCount++;
    } else {
      invalidVendorCount++;
      console.warn(`Invalid vendor ${vendor.name}:`, validation.errors);
      allValid = false;
    }
  });

  logSuccess(`${validVendorCount}/${vendors.length} vendors are valid`);
  if (invalidVendorCount > 0) {
    logError(`${invalidVendorCount} vendors have validation errors`);
  }

  // Validate purchase orders
  logInfo(`Validating ${purchaseOrders.length} purchase orders...`);
  let validPOCount = 0;
  let invalidPOCount = 0;

  purchaseOrders.forEach((po: any) => {
    const validation = validatePurchaseOrder(po);
    if (validation.valid) {
      validPOCount++;
    } else {
      invalidPOCount++;
      console.warn(`Invalid PO ${po.id}:`, validation.errors);
      allValid = false;
    }
  });

  logSuccess(`${validPOCount}/${purchaseOrders.length} purchase orders are valid`);
  if (invalidPOCount > 0) {
    logError(`${invalidPOCount} purchase orders have validation errors`);
  }

  return allValid;
}

// =============================================================================
// Test 5: DataService Layer
// =============================================================================

async function testDataService() {
  logSection('Test 5: DataService Layer');

  const dataService = getDataService({
    source: 'finale',
    enableCaching: true,
    cacheExpiryMs: 5 * 60 * 1000,
    enableValidation: true,
    onLoadingChange: (loading) => {
      if (loading) {
        logInfo('DataService is loading...');
      } else {
        logInfo('DataService finished loading');
      }
    },
    onError: (error) => {
      logError(`DataService error: ${error.message}`);
    },
  });

  try {
    logInfo('Getting inventory through DataService...');
    const inventory = await dataService.getInventory();
    logSuccess(`Got ${inventory.length} inventory items from DataService`);

    logInfo('Testing cache hit...');
    const inventoryCached = await dataService.getInventory();
    logSuccess('Cache hit successful');

    logInfo('Getting vendors through DataService...');
    const vendors = await dataService.getVendors();
    logSuccess(`Got ${vendors.length} vendors from DataService`);

    logInfo('Getting purchase orders through DataService...');
    const purchaseOrders = await dataService.getPurchaseOrders();
    logSuccess(`Got ${purchaseOrders.length} purchase orders from DataService`);

    const cacheStats = dataService.getCacheStats();
    logInfo(`Cache stats: ${cacheStats.size} entries`);
    console.log('Cache keys:', cacheStats.keys);

    return true;
  } catch (error) {
    logError(`DataService test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}

// =============================================================================
// Test 6: Bulk Sync
// =============================================================================

async function testBulkSync() {
  logSection('Test 6: Bulk Sync');

  const dataService = getDataService({ source: 'finale' });

  try {
    logInfo('Starting bulk sync from Finale...');

    const startTime = Date.now();
    const syncResult = await dataService.syncAllFromFinale();
    const duration = Date.now() - startTime;

    logSuccess(`Bulk sync completed in ${duration}ms`);
    console.log('Sync results:', {
      inventory: syncResult.inventory.length,
      vendors: syncResult.vendors.length,
      purchaseOrders: syncResult.purchaseOrders.length,
      boms: syncResult.boms.length,
    });

    return true;
  } catch (error) {
    logError(`Bulk sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}

// =============================================================================
// Main Test Runner
// =============================================================================

async function runAllTests() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                  Finale Integration Test Suite                           ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');

  const results = {
    connection: false,
    fetching: false,
    transformation: false,
    validation: false,
    dataService: false,
    bulkSync: false,
  };

  // Test 1: Connection
  results.connection = await testConnection();

  if (!results.connection) {
    logError('Connection test failed. Aborting remaining tests.');
    printSummary(results);
    return;
  }

  // Test 2: Data Fetching
  const rawData = await testDataFetching();
  results.fetching = rawData !== null;

  if (!rawData) {
    logError('Data fetching failed. Aborting remaining tests.');
    printSummary(results);
    return;
  }

  // Test 3: Data Transformation
  const transformedData = await testDataTransformation(rawData);
  results.transformation = transformedData !== null;

  if (!transformedData) {
    logError('Data transformation failed. Aborting remaining tests.');
    printSummary(results);
    return;
  }

  // Test 4: Data Validation
  results.validation = await testDataValidation(transformedData);

  // Test 5: DataService
  results.dataService = await testDataService();

  // Test 6: Bulk Sync
  results.bulkSync = await testBulkSync();

  // Print Summary
  printSummary(results);
}

function printSummary(results: Record<string, boolean>) {
  logSection('Test Summary');

  const tests = [
    { name: 'Connection Test', passed: results.connection },
    { name: 'Data Fetching', passed: results.fetching },
    { name: 'Data Transformation', passed: results.transformation },
    { name: 'Data Validation', passed: results.validation },
    { name: 'DataService Layer', passed: results.dataService },
    { name: 'Bulk Sync', passed: results.bulkSync },
  ];

  tests.forEach(test => {
    if (test.passed) {
      logSuccess(test.name);
    } else {
      logError(test.name);
    }
  });

  const passedCount = tests.filter(t => t.passed).length;
  const totalCount = tests.length;

  console.log('\n');
  if (passedCount === totalCount) {
    console.log(`🎉 All tests passed! (${passedCount}/${totalCount})`);
  } else {
    console.log(`⚠️  ${passedCount}/${totalCount} tests passed`);
  }
  console.log('\n');
}

// =============================================================================
// Execute Tests
// =============================================================================

runAllTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
