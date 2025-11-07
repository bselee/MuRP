// Mock Label Data for Testing AI Scanning UI
// This simulates what the AI would extract from a real fertilizer label

import type { Artwork, BillOfMaterials } from './types';

export const MOCK_SCANNED_LABEL: Artwork = {
  id: 'artwork-001',
  fileName: 'organic-fertilizer-10-5-8-label-v2.pdf',
  revision: 2.0,
  url: 'data:application/pdf;base64,mock-data',
  fileType: 'label',
  fileSize: 2457600, // ~2.5MB
  mimeType: 'application/pdf',
  uploadedAt: '2025-11-06T10:30:00Z',
  uploadedBy: 'user-123',
  status: 'draft',
  scanStatus: 'completed',
  scanCompletedAt: '2025-11-06T10:30:15Z',
  verified: false,

  // AI-Extracted Data
  extractedData: {
    productName: 'Premium Organic Fertilizer 10-5-8',
    netWeight: '50 lbs (22.7 kg)',
    barcode: '012345678901',

    ingredients: [
      { name: 'Blood Meal', percentage: '45%', order: 1, confidence: 0.95 },
      { name: 'Bone Meal', percentage: '25%', order: 2, confidence: 0.93 },
      { name: 'Kelp Powder', percentage: '15%', order: 3, confidence: 0.92 },
      { name: 'Rock Phosphate', percentage: '10%', order: 4, confidence: 0.88 },
      { name: 'Potassium Sulfate', percentage: '5%', order: 5, confidence: 0.90 },
    ],

    guaranteedAnalysis: {
      nitrogen: '10.0%',
      phosphate: '5.0%',
      potassium: '8.0%',
      otherNutrients: {
        'Calcium': '3.0%',
        'Sulfur': '2.0%',
        'Iron': '0.5%',
        'Manganese': '0.3%'
      }
    },

    claims: [
      'OMRI Listed',
      '100% Organic',
      'Non-GMO',
      'Made from Natural Ingredients'
    ],

    warnings: [
      'Keep out of reach of children',
      'Harmful if swallowed',
      'Avoid contact with eyes',
      'Wash hands thoroughly after handling'
    ],

    directions: 'Apply 1-2 cups per plant monthly during growing season. For best results, work into soil around base of plant and water thoroughly. Can be used on vegetables, flowers, trees, and shrubs.',

    otherText: [
      'Made in USA',
      'Net Weight: 50 lbs',
      'GreenGrow Fertilizers Inc.',
      '123 Farm Road, Portland, OR 97201',
      'www.greengrow.com',
      'Customer Service: 1-800-555-0123'
    ]
  }
};

export const MOCK_BOM_WITH_MISMATCH: BillOfMaterials = {
  id: 'bom-001',
  finishedSku: 'FRT-10-5-8-50LB',
  name: 'Premium Organic Fertilizer 10-5-8',
  barcode: '012345678901',

  components: [
    { sku: 'ING-001', name: 'Blood Meal, Organic', quantity: 22.5, unit: 'lbs' },
    { sku: 'ING-002', name: 'Bone Meal', quantity: 12.5, unit: 'lbs' },
    { sku: 'ING-003', name: 'Kelp Powder', quantity: 7.5, unit: 'lbs' },
    { sku: 'ING-004', name: 'Rock Phosphate', quantity: 5.0, unit: 'lbs' },
    { sku: 'ING-005', name: 'Potassium Sulfate', quantity: 2.5, unit: 'lbs' },
    // This one is in BOM but NOT on label (intentional mismatch for testing)
    { sku: 'ING-006', name: 'Humic Acid', quantity: 0.5, unit: 'lbs' },
  ],

  artwork: [MOCK_SCANNED_LABEL],

  packaging: {
    bagType: '50 lb poly bag',
    labelType: '5x7 inch label',
    specialInstructions: 'Seal bag after filling'
  },

  yieldQuantity: 1,
  category: 'Organic Fertilizer',
  description: 'Premium organic fertilizer with balanced NPK ratio for general use'
};

export const MOCK_PERFECT_MATCH_BOM: BillOfMaterials = {
  id: 'bom-002',
  finishedSku: 'FRT-10-5-8-50LB',
  name: 'Premium Organic Fertilizer 10-5-8',
  barcode: '012345678901',

  components: [
    { sku: 'ING-001', name: 'Blood Meal', quantity: 22.5, unit: 'lbs' },
    { sku: 'ING-002', name: 'Bone Meal', quantity: 12.5, unit: 'lbs' },
    { sku: 'ING-003', name: 'Kelp Powder', quantity: 7.5, unit: 'lbs' },
    { sku: 'ING-004', name: 'Rock Phosphate', quantity: 5.0, unit: 'lbs' },
    { sku: 'ING-005', name: 'Potassium Sulfate', quantity: 2.5, unit: 'lbs' },
  ],

  artwork: [MOCK_SCANNED_LABEL],

  packaging: {
    bagType: '50 lb poly bag',
    labelType: '5x7 inch label',
    specialInstructions: 'Seal bag after filling'
  },

  yieldQuantity: 1,
  category: 'Organic Fertilizer',
  description: 'Premium organic fertilizer with balanced NPK ratio for general use'
};

export const MOCK_SCAN_FAILED: Artwork = {
  id: 'artwork-002',
  fileName: 'product-label-blurry.pdf',
  revision: 1.0,
  url: 'data:application/pdf;base64,mock-data',
  fileType: 'label',
  fileSize: 1234567,
  mimeType: 'application/pdf',
  uploadedAt: '2025-11-06T11:00:00Z',
  uploadedBy: 'user-123',
  status: 'draft',
  scanStatus: 'failed',
  scanError: 'Image quality too low - text not readable. Please upload higher resolution label.',
  verified: false
};

export const MOCK_NO_NPK_LABEL: Artwork = {
  id: 'artwork-003',
  fileName: 'soil-amendment-label.pdf',
  revision: 1.0,
  url: 'data:application/pdf;base64,mock-data',
  fileType: 'label',
  fileSize: 1800000,
  mimeType: 'application/pdf',
  uploadedAt: '2025-11-06T12:00:00Z',
  uploadedBy: 'user-123',
  status: 'draft',
  scanStatus: 'completed',
  scanCompletedAt: '2025-11-06T12:00:10Z',
  verified: false,

  extractedData: {
    productName: 'Organic Compost Soil Amendment',
    netWeight: '1 cubic foot',
    barcode: '987654321098',

    ingredients: [
      { name: 'Composted Yard Waste', order: 1, confidence: 0.92 },
      { name: 'Peat Moss', order: 2, confidence: 0.88 },
      { name: 'Perlite', order: 3, confidence: 0.85 },
    ],

    // No guaranteed analysis (soil amendment, not fertilizer)

    claims: [
      'OMRI Listed',
      '100% Organic Matter'
    ],

    warnings: [
      'Keep out of reach of children'
    ],

    directions: 'Mix 1 part amendment with 3 parts native soil. Water thoroughly after application.',

    otherText: [
      'Made in USA',
      'Store in cool, dry place'
    ]
  }
};

// Mock comparison test scenarios
export const MOCK_TEST_SCENARIOS = {
  'Perfect Match': {
    label: MOCK_SCANNED_LABEL,
    bom: MOCK_PERFECT_MATCH_BOM,
    description: 'All ingredients match perfectly between label and BOM'
  },
  'With Mismatches': {
    label: MOCK_SCANNED_LABEL,
    bom: MOCK_BOM_WITH_MISMATCH,
    description: 'BOM has Humic Acid which is not on label'
  },
  'Scan Failed': {
    label: MOCK_SCAN_FAILED,
    bom: undefined,
    description: 'AI scan failed due to poor image quality'
  },
  'No NPK Analysis': {
    label: MOCK_NO_NPK_LABEL,
    bom: undefined,
    description: 'Soil amendment without guaranteed analysis'
  }
};
