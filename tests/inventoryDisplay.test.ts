import assert from 'node:assert/strict';
import test from 'node:test';
import type { Vendor, BillOfMaterials } from '../types';
import {
  normalizeCategory,
  buildVendorNameMap,
  buildVendorDetailMap,
  getVendorDisplayName,
  getVendorRecord,
  buildBomAssociations,
  getBomDetailsForComponent,
} from '../lib/inventory/utils';

const vendors: Vendor[] = [
  {
    id: 'vendor-1',
    name: 'Soil Builder Industries',
    contactEmails: ['soil@example.com'],
    phone: '555-1111',
    address: '123 Farm Lane',
    website: 'https://soilbuilder.io',
    leadTimeDays: 7,
  },
  {
    id: 'vendor-2',
    name: 'Compost Labs',
    contactEmails: [],
    phone: '',
    address: '456 Garden Ave',
    website: '',
    leadTimeDays: 5,
  },
];

const packaging = { bagType: 'Standard', labelType: 'Standard', specialInstructions: '' };

const boms: BillOfMaterials[] = [
  {
    id: 'bom-1',
    finishedSku: 'FIN-ALPHA',
    name: 'Alpha Grow',
    components: [
      { sku: 'COMP-PEAT', quantity: 2, name: 'Peat Moss' },
      { sku: 'COMP-CAST', quantity: 1, name: 'Castings' },
    ],
    artwork: [],
    packaging,
  },
  {
    id: 'bom-2',
    finishedSku: 'FIN-BRAVO',
    name: 'Bravo Bloom',
    components: [
      { sku: 'COMP-PEAT', quantity: 3, name: 'Peat Moss' },
      { sku: 'COMP-EXTRA', quantity: 1, name: 'Extras' },
    ],
    artwork: [],
    packaging,
  },
];

test('normalizeCategory trims and falls back to Uncategorized', () => {
  assert.equal(normalizeCategory(undefined), 'Uncategorized');
  assert.equal(normalizeCategory('  '), 'Uncategorized');
  assert.equal(normalizeCategory(' Liquids '), 'Liquids');
});

test('vendor lookup maps resolve ids and names case-insensitively', () => {
  const nameMap = buildVendorNameMap(vendors);
  const detailMap = buildVendorDetailMap(vendors);

  assert.equal(getVendorDisplayName('vendor-1', nameMap), 'Soil Builder Industries');
  assert.equal(getVendorDisplayName('compost labs', nameMap), 'Compost Labs');
  assert.equal(getVendorDisplayName(undefined, nameMap), 'N/A');

  const vendor = getVendorRecord('Compost Labs', detailMap);
  assert.ok(vendor);
  assert.equal(vendor?.id, 'vendor-2');
});

test('BOM associations capture unique finished goods per component', () => {
  const { usageMap, finishedSkuSet } = buildBomAssociations(boms);
  const peatDetails = getBomDetailsForComponent('COMP-PEAT', usageMap);
  const castingDetails = getBomDetailsForComponent('COMP-CAST', usageMap);

  assert.equal(finishedSkuSet.has('FIN-ALPHA'), true);
  assert.equal(finishedSkuSet.has('FIN-BRAVO'), true);
  assert.equal(finishedSkuSet.has('UNKNOWN'), false);

  assert.equal(peatDetails.length, 2, 'Peat comp used by two BOMs');
  assert.equal(castingDetails.length, 1, 'Castings only used by Alpha Grow');

  // Ensure entries are sorted by finished name and cloning prevents mutation
  assert.deepEqual(
    peatDetails.map((d) => d.finishedName),
    ['Alpha Grow', 'Bravo Bloom'],
  );

  peatDetails[0].finishedName = 'Mutated';
  const secondRead = getBomDetailsForComponent('COMP-PEAT', usageMap);
  assert.equal(secondRead[0].finishedName, 'Alpha Grow');
});
