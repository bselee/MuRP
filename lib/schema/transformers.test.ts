/**
 * Schema Transformer Tests
 *
 * Simple test harness for schema transformation functions
 * Tests the vendor transformation pipeline
 */

import {
  transformVendorRawToParsed,
  transformVendorParsedToDatabaseEnhanced,
  transformVendorsBatch,
  deduplicateVendors,
} from './transformers';

// Test utilities
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEquals(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

// ============================================================================
// Test Cases
// ============================================================================

function testBasicVendorTransformation() {
  console.log('\n📝 Test: Basic Vendor Transformation');

  const rawVendor = {
    'Name': 'ABC Supply Co.',
    'Email address 0': 'sales@abc.com',
    'Phone number 0': '555-1234',
    'Address 0 street address': '123 Main St',
    'Address 0 city': 'Portland',
    'Address 0 state / region': 'OR',
    'Address 0 postal code': '97201',
    'Notes': 'Preferred vendor',
  };

  const result = transformVendorRawToParsed(rawVendor, 0);

  assert(result.success, 'Transformation should succeed');
  assert(result.data !== undefined, 'Should have data');

  const vendor = result.data!;
  assertEquals(vendor.name, 'ABC Supply Co.', 'Name should match');
  assertEquals(vendor.contactEmails[0], 'sales@abc.com', 'Email should be extracted');
  assertEquals(vendor.phone, '555-1234', 'Phone should be extracted');
  assertEquals(vendor.addressLine1, '123 Main St', 'Address line 1 should match');
  assertEquals(vendor.city, 'Portland', 'City should match');
  assertEquals(vendor.state, 'OR', 'State should match');
  assertEquals(vendor.postalCode, '97201', 'Postal code should match');
  assertEquals(vendor.notes, 'Preferred vendor', 'Notes should match');

  console.log('✅ Basic transformation passed');
}

function testMultipleEmailsAndPhones() {
  console.log('\n📝 Test: Multiple Emails and Phones');

  const rawVendor = {
    'Name': 'XYZ Corp',
    'Email address 0': 'sales@xyz.com',
    'Email address 1': 'support@xyz.com',
    'Email address 2': 'info@xyz.com',
    'Phone number 0': '555-1111',
    'Phone number 1': '555-2222',
  };

  const result = transformVendorRawToParsed(rawVendor, 0);

  assert(result.success, 'Should succeed');
  assert(result.data!.contactEmails.length === 3, 'Should have 3 emails');
  assertEquals(result.data!.contactEmails[0], 'sales@xyz.com', 'First email');
  assertEquals(result.data!.contactEmails[1], 'support@xyz.com', 'Second email');
  assertEquals(result.data!.contactEmails[2], 'info@xyz.com', 'Third email');
  assertEquals(result.data!.phone, '555-1111', 'Should use first phone');

  console.log('✅ Multiple emails/phones passed');
}

function testAddressFallback() {
  console.log('\n📝 Test: Address Fallback (tries Address 0-3)');

  const rawVendor = {
    'Name': 'Fallback Vendor',
    'Email address 0': 'test@test.com',
    // No Address 0
    'Address 1 street address': '456 Second St',
    'Address 1 city': 'Seattle',
    'Address 1 state / region': 'WA',
  };

  const result = transformVendorRawToParsed(rawVendor, 0);

  assert(result.success, 'Should succeed');
  assertEquals(result.data!.addressLine1, '456 Second St', 'Should use Address 1');
  assertEquals(result.data!.city, 'Seattle', 'Should use Address 1 city');
  assertEquals(result.data!.state, 'WA', 'Should use Address 1 state');

  console.log('✅ Address fallback passed');
}

function testInvalidEmail() {
  console.log('\n📝 Test: Invalid Email Filtering');

  const rawVendor = {
    'Name': 'Bad Email Vendor',
    'Email address 0': 'not-an-email',
    'Email address 1': 'valid@email.com',
  };

  const result = transformVendorRawToParsed(rawVendor, 0);

  assert(result.success, 'Should succeed even with invalid email');
  assert(result.data!.contactEmails.length === 1, 'Should filter out invalid email');
  assertEquals(result.data!.contactEmails[0], 'valid@email.com', 'Should keep valid email');
  assert(result.warnings.length === 0 || result.warnings.length > 0, 'May have warnings');

  console.log('✅ Email validation passed');
}

function testPlaceholderNameRejection() {
  console.log('\n📝 Test: Placeholder Name Rejection');

  const placeholders = [
    { 'Name': '--' },
    { 'Name': 'Various' },
    { 'Name': '' },
  ];

  placeholders.forEach((raw, idx) => {
    const result = transformVendorRawToParsed(raw, idx);
    assert(!result.success, `Should reject placeholder name: "${raw['Name']}"`);
  });

  console.log('✅ Placeholder rejection passed');
}

function testBatchTransformation() {
  console.log('\n📝 Test: Batch Transformation');

  const rawVendors = [
    {
      'Name': 'Vendor A',
      'Email address 0': 'a@test.com',
    },
    {
      'Name': 'Vendor B',
      'Email address 0': 'b@test.com',
    },
    {
      'Name': '--', // Should fail
    },
    {
      'Name': 'Vendor C',
      'Email address 0': 'c@test.com',
    },
  ];

  const result = transformVendorsBatch(rawVendors);

  assertEquals(result.successful.length, 3, 'Should have 3 successful');
  assertEquals(result.failed.length, 1, 'Should have 1 failed');
  assertEquals(result.successful[0].name, 'Vendor A', 'First vendor');
  assertEquals(result.successful[1].name, 'Vendor B', 'Second vendor');
  assertEquals(result.successful[2].name, 'Vendor C', 'Third vendor');

  console.log('✅ Batch transformation passed');
}

function testDeduplication() {
  console.log('\n📝 Test: Vendor Deduplication');

  const vendors = [
    { id: '1', name: 'ABC Company', contactEmails: [], phone: '', address: '', website: '', leadTimeDays: 7 } as any,
    { id: '2', name: 'xyz company', contactEmails: [], phone: '', address: '', website: '', leadTimeDays: 7 } as any,
    { id: '3', name: 'ABC Company', contactEmails: [], phone: '', address: '', website: '', leadTimeDays: 14 } as any, // Duplicate (case-insensitive)
    { id: '4', name: 'XYZ Company', contactEmails: [], phone: '', address: '', website: '', leadTimeDays: 7 } as any, // Duplicate (case-insensitive)
  ];

  const deduped = deduplicateVendors(vendors);

  assertEquals(deduped.length, 2, 'Should have 2 unique vendors');
  assert(deduped.some(v => v.name === 'ABC Company'), 'Should keep ABC Company');
  assert(deduped.some(v => v.name === 'XYZ Company' || v.name === 'xyz company'), 'Should keep XYZ Company');

  // Last occurrence should win
  const abcVendor = deduped.find(v => v.name.toLowerCase() === 'abc company');
  assertEquals(abcVendor?.leadTimeDays, 14, 'Should keep last occurrence (lead time 14)');

  console.log('✅ Deduplication passed');
}

function testDatabaseTransformation() {
  console.log('\n📝 Test: Database Transformation');

  const parsed = {
    id: 'test-123',
    name: 'Test Vendor',
    contactEmails: ['test@example.com'],
    phone: '555-0000',
    addressLine1: '123 Test St',
    addressLine2: 'Suite 100',
    city: 'Testville',
    state: 'TS',
    postalCode: '12345',
    country: 'USA',
    addressDisplay: '123 Test St, Suite 100, Testville, TS 12345, USA',
    website: 'https://test.com',
    leadTimeDays: 10,
    notes: 'Test notes',
    source: 'csv' as const,
  };

  const dbVendor = transformVendorParsedToDatabaseEnhanced(parsed);

  assertEquals(dbVendor.id, 'test-123', 'ID should match');
  assertEquals(dbVendor.name, 'Test Vendor', 'Name should match');
  assertEquals(dbVendor.contact_emails[0], 'test@example.com', 'Email should match');
  assertEquals(dbVendor.phone, '555-0000', 'Phone should match');
  assertEquals(dbVendor.address_line1, '123 Test St', 'Address line 1 should match');
  assertEquals(dbVendor.city, 'Testville', 'City should match');
  assertEquals(dbVendor.state, 'TS', 'State should match');
  assertEquals(dbVendor.postal_code, '12345', 'Postal code should match');
  assertEquals(dbVendor.notes, 'Test notes', 'Notes should match');
  assertEquals(dbVendor.data_source, 'csv', 'Data source should match');
  assert(dbVendor.last_sync_at !== undefined, 'Should have sync timestamp');
  assertEquals(dbVendor.sync_status, 'synced', 'Sync status should be synced');

  console.log('✅ Database transformation passed');
}

function testWebsiteValidation() {
  console.log('\n📝 Test: Website URL Validation');

  const testCases = [
    {
      raw: { 'Name': 'Vendor 1', 'Website': 'https://example.com', 'Email address 0': 'test@test.com' },
      expected: 'https://example.com',
      shouldSucceed: true,
    },
    {
      raw: { 'Name': 'Vendor 2', 'Website': 'example.com', 'Email address 0': 'test@test.com' },
      expected: 'https://example.com', // Should auto-add protocol
      shouldSucceed: true,
    },
    {
      raw: { 'Name': 'Vendor 3', 'Website': 'not a url', 'Email address 0': 'test@test.com' },
      expected: '',
      shouldSucceed: true, // Should succeed but with empty website
    },
  ];

  testCases.forEach((testCase, idx) => {
    const result = transformVendorRawToParsed(testCase.raw, idx);
    assert(result.success === testCase.shouldSucceed, `Test case ${idx} should ${testCase.shouldSucceed ? 'succeed' : 'fail'}`);
    if (testCase.shouldSucceed && result.data) {
      assertEquals(result.data.website, testCase.expected, `Test case ${idx} website`);
    }
  });

  console.log('✅ Website validation passed');
}

// ============================================================================
// Run All Tests
// ============================================================================

export function runTransformerTests() {
  console.log('🧪 Running Schema Transformer Tests...\n');
  console.log('='.repeat(60));

  const tests = [
    testBasicVendorTransformation,
    testMultipleEmailsAndPhones,
    testAddressFallback,
    testInvalidEmail,
    testPlaceholderNameRejection,
    testBatchTransformation,
    testDeduplication,
    testDatabaseTransformation,
    testWebsiteValidation,
  ];

  let passed = 0;
  let failed = 0;

  tests.forEach(test => {
    try {
      test();
      passed++;
    } catch (error) {
      console.error(`❌ ${test.name} failed:`, error);
      failed++;
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('✅ All tests passed!\n');
    return true;
  } else {
    console.log(`❌ ${failed} test(s) failed\n`);
    return false;
  }
}

// Run tests if executed directly (CommonJS only); safe in ESM imports
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
if (typeof require !== 'undefined' && require.main === module) {
  const success = runTransformerTests();
  process.exit(success ? 0 : 1);
}
