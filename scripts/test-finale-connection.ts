/**
 * Test Finale API Connection
 * 
 * This script tests both the REST API and CSV Report URLs to verify
 * that the credentials and report URLs are working correctly.
 */

import { config } from 'dotenv';
import { FinaleBasicAuthClient } from '../services/finaleBasicAuthClient.js';

// Load .env.local file
config({ path: '.env.local' });

// Load environment variables (with VITE_ prefix for client-side)
const FINALE_API_KEY = process.env.VITE_FINALE_API_KEY;
const FINALE_API_SECRET = process.env.VITE_FINALE_API_SECRET;
const FINALE_ACCOUNT_PATH = process.env.VITE_FINALE_ACCOUNT_PATH;
const FINALE_BASE_URL = process.env.VITE_FINALE_BASE_URL;

const FINALE_VENDORS_REPORT_URL = process.env.FINALE_VENDORS_REPORT_URL;
const FINALE_INVENTORY_REPORT_URL = process.env.FINALE_INVENTORY_REPORT_URL;
const FINALE_REORDER_REPORT_URL = process.env.FINALE_REORDER_REPORT_URL;

interface TestResult {
  test: string;
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

const results: TestResult[] = [];

/**
 * Test 1: Verify environment variables are loaded
 */
function testEnvironmentVariables(): TestResult {
  console.log('\n🔍 Test 1: Checking environment variables...');
  
  const missing: string[] = [];
  
  if (!FINALE_API_KEY) missing.push('FINALE_API_KEY');
  if (!FINALE_API_SECRET) missing.push('FINALE_API_SECRET');
  if (!FINALE_ACCOUNT_PATH) missing.push('FINALE_ACCOUNT_PATH');
  if (!FINALE_BASE_URL) missing.push('FINALE_BASE_URL');
  if (!FINALE_VENDORS_REPORT_URL) missing.push('FINALE_VENDORS_REPORT_URL');
  if (!FINALE_INVENTORY_REPORT_URL) missing.push('FINALE_INVENTORY_REPORT_URL');
  // if (!FINALE_REORDER_REPORT_URL) missing.push('FINALE_REORDER_REPORT_URL'); // Optional
  
  if (missing.length > 0) {
    return {
      test: 'Environment Variables',
      success: false,
      message: `Missing environment variables: ${missing.join(', ')}`,
    };
  }
  
  return {
    test: 'Environment Variables',
    success: true,
    message: 'All required environment variables are present',
    data: {
      apiKey: FINALE_API_KEY?.substring(0, 4) + '...',
      accountPath: FINALE_ACCOUNT_PATH,
      baseUrl: FINALE_BASE_URL,
    },
  };
}

/**
 * Test 2: Test Finale REST API - Get Facilities
 */
async function testFinaleRestAPI(): Promise<TestResult> {
  console.log('\n🔍 Test 2: Testing Finale REST API...');
  
  try {
    // Create Finale client
    const client = new FinaleBasicAuthClient({
      apiKey: FINALE_API_KEY,
      apiSecret: FINALE_API_SECRET,
      accountPath: FINALE_ACCOUNT_PATH,
      baseUrl: FINALE_BASE_URL,
    });
    
    // Test connection
    const result = await client.testConnection();
    
    if (!result.success) {
      return {
        test: 'Finale REST API',
        success: false,
        message: result.message,
        error: result.error,
      };
    }
    
    return {
      test: 'Finale REST API',
      success: true,
      message: result.message,
      data: {
        facilities: result.facilities?.length || 0,
        sampleFacility: result.facilities?.[0] || null,
        accountInfo: client.getAccountInfo(),
      },
    };
  } catch (error) {
    return {
      test: 'Finale REST API',
      success: false,
      message: 'Failed to connect to Finale API',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test 3: Test Vendors Report CSV URL
 */
async function testVendorsReport(): Promise<TestResult> {
  console.log('\n🔍 Test 3: Testing Vendors Report CSV URL...');
  
  if (!FINALE_VENDORS_REPORT_URL) {
    return {
      test: 'Vendors Report',
      success: false,
      message: 'FINALE_VENDORS_REPORT_URL not configured',
    };
  }
  
  try {
    console.log(`   Fetching: ${FINALE_VENDORS_REPORT_URL.substring(0, 100)}...`);
    
    const response = await fetch(FINALE_VENDORS_REPORT_URL);
    
    if (!response.ok) {
      return {
        test: 'Vendors Report',
        success: false,
        message: `Report URL returned ${response.status}: ${response.statusText}`,
      };
    }
    
    const csvText = await response.text();
    const lines = csvText.trim().split('\n');
    
    return {
      test: 'Vendors Report',
      success: true,
      message: `Successfully fetched vendors report`,
      data: {
        totalLines: lines.length,
        headers: lines[0],
        sampleRow: lines[1],
        vendors: lines.length - 1, // Minus header row
      },
    };
  } catch (error) {
    return {
      test: 'Vendors Report',
      success: false,
      message: 'Failed to fetch vendors report',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test 4: Test Inventory Report CSV URL
 */
async function testInventoryReport(): Promise<TestResult> {
  console.log('\n🔍 Test 4: Testing Inventory Report CSV URL...');
  
  if (!FINALE_INVENTORY_REPORT_URL) {
    return {
      test: 'Inventory Report',
      success: false,
      message: 'FINALE_INVENTORY_REPORT_URL not configured',
    };
  }
  
  try {
    console.log(`   Fetching: ${FINALE_INVENTORY_REPORT_URL.substring(0, 100)}...`);
    
    const response = await fetch(FINALE_INVENTORY_REPORT_URL);
    
    if (!response.ok) {
      return {
        test: 'Inventory Report',
        success: false,
        message: `Report URL returned ${response.status}: ${response.statusText}`,
      };
    }
    
    const csvText = await response.text();
    const lines = csvText.trim().split('\n');
    
    return {
      test: 'Inventory Report',
      success: true,
      message: `Successfully fetched inventory report`,
      data: {
        totalLines: lines.length,
        headers: lines[0],
        sampleRow: lines[1],
        products: lines.length - 1, // Minus header row
      },
    };
  } catch (error) {
    return {
      test: 'Inventory Report',
      success: false,
      message: 'Failed to fetch inventory report',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test 5: Test Reorder Report CSV URL
 */
async function testReorderReport(): Promise<TestResult> {
  console.log('\n🔍 Test 5: Testing Reorder Report CSV URL...');
  
  if (!FINALE_REORDER_REPORT_URL) {
    return {
      test: 'Reorder Report',
      success: false,
      message: 'FINALE_REORDER_REPORT_URL not configured',
    };
  }
  
  try {
    console.log(`   Fetching: ${FINALE_REORDER_REPORT_URL.substring(0, 100)}...`);
    
    const response = await fetch(FINALE_REORDER_REPORT_URL);
    
    if (!response.ok) {
      return {
        test: 'Reorder Report',
        success: false,
        message: `Report URL returned ${response.status}: ${response.statusText}`,
      };
    }
    
    const csvText = await response.text();
    const lines = csvText.trim().split('\n');
    
    return {
      test: 'Reorder Report',
      success: true,
      message: `Successfully fetched reorder report`,
      data: {
        totalLines: lines.length,
        headers: lines[0],
        sampleRow: lines[1],
        itemsToReorder: lines.length - 1, // Minus header row
      },
    };
  } catch (error) {
    return {
      test: 'Reorder Report',
      success: false,
      message: 'Failed to fetch reorder report',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Print results summary
 */
function printSummary(results: TestResult[]) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(80));
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  results.forEach((result, index) => {
    const icon = result.success ? '✅' : '❌';
    console.log(`\n${index + 1}. ${icon} ${result.test}`);
    console.log(`   ${result.message}`);
    
    if (result.data) {
      console.log('   Data:', JSON.stringify(result.data, null, 2).split('\n').join('\n   '));
    }
    
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });
  
  console.log('\n' + '='.repeat(80));
  console.log(`✅ Passed: ${passed} / ${results.length}`);
  console.log(`❌ Failed: ${failed} / ${results.length}`);
  console.log('='.repeat(80));
  
  if (passed === results.length) {
    console.log('\n🎉 All tests passed! Finale connection is working correctly.');
    console.log('✅ Ready to proceed with integration.');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the errors above.');
    console.log('❌ Fix the issues before proceeding with integration.');
  }
  
  console.log('');
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('🚀 Starting Finale API Connection Tests...');
  console.log('='.repeat(80));
  
  // Test 1: Environment variables
  results.push(testEnvironmentVariables());
  
  // Only proceed with API tests if environment variables are present
  if (results[0].success) {
    // Test 2: REST API
    results.push(await testFinaleRestAPI());
    
    // Test 3-5: CSV Reports (run in parallel)
    const reportTests = await Promise.all([
      testVendorsReport(),
      testInventoryReport(),
      testReorderReport(),
    ]);
    
    results.push(...reportTests);
  } else {
    console.log('\n❌ Skipping API tests due to missing environment variables.');
  }
  
  // Print summary
  printSummary(results);
  
  // Exit with appropriate code
  const failed = results.filter(r => !r.success).length;
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch((error) => {
  console.error('❌ Fatal error running tests:', error);
  process.exit(1);
});
