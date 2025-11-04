/*
  Minimal smoke test for schema transformers.
  Run with: npm run test:transformers
*/

import { transformVendorsBatch, transformVendorParsedToDatabaseEnhanced } from './transformers';

const sampleRows = [
  {
    'Name': 'ABC Supply Co.',
    'Email address 0': 'sales@abc.com',
    'Phone number 0': '555-1234',
    'Address 0 street address': '123 Main St',
    'Address 0 city': 'Portland',
    'Address 0 state / region': 'OR',
    'Address 0 postal code': '97201',
    'Website': 'abcsupply.com',
    'Notes': 'Preferred vendor for organics',
  },
  {
    'Name': 'XYZ Materials',
    'Email address 0': 'info@xyz.com',
    'Phone number 0': '555-9876',
    'Address 1 street address': '500 Market Ave',
    'Address 1 city': 'Eugene',
    'Address 1 state / region': 'OR',
    'Address 1 postal code': '97401',
  },
];

console.log('🧪 Running Schema Transformer Smoke Test...');

const batch = transformVendorsBatch(sampleRows);
console.log('Successful:', batch.successful.length);
console.log('Failed:', batch.failed.length);
if (batch.failed.length > 0) {
  console.log('Failures (first 2):');
  for (const f of batch.failed.slice(0, 2)) {
    console.log(`  Row ${f.index + 1}:`, f.errors.join(' | '));
  }
}
console.log('Warnings:', batch.totalWarnings.length);

if (batch.successful.length > 0) {
  const first = batch.successful[0];
  console.log('Parsed vendor sample:', {
    id: first.id,
    name: first.name,
    emails: first.contactEmails,
    phone: first.phone,
    address: first.addressDisplay,
    website: first.website,
  });
  const db = transformVendorParsedToDatabaseEnhanced(first);
  console.log('DB payload keys:', Object.keys(db));
}

console.log('✅ Smoke test finished.');
