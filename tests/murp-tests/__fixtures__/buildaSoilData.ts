/**
 * BuildASoil-specific test fixtures
 * Real product data for meaningful test scenarios
 * 
 * CLAUDE CODE: These fixtures mirror actual Finale data structure.
 * Update when BOM structures change in production.
 */

// ============================================================================
// PRODUCTS
// ============================================================================

export const products = {
  // Finished Goods
  CRAFT8: {
    sku: 'CRAFT8',
    description: 'BuildASoil Craft Blend - Nutrient Pack - (1290lb - 1 Yard Super Sack)',
    type: 'finished_good',
    unit_cost: 450.00,
    selling_price: 599.99,
    primary_vendor_id: null, // Manufactured in-house
    category: 'soil',
    status: 'ACTIVE'
  },
  
  BIG6_KIT: {
    sku: 'BIG6-NUTRIENT-KIT',
    description: 'BIG 6 Micronutrient Kit',
    type: 'finished_good',
    unit_cost: 85.00,
    selling_price: 129.99,
    primary_vendor_id: null,
    category: 'nutrients',
    status: 'ACTIVE'
  },
  
  // Components - Fish/Protein
  FM104: {
    sku: 'FM104',
    description: 'Fish Meal - (50lb)',
    type: 'component',
    unit_cost: 42.50,
    primary_vendor_id: 'vendor_neptune',
    lead_time_days: 14,
    moq: 20,
    case_pack_qty: 1,
    category: 'protein',
    status: 'ACTIVE'
  },
  
  FB110: {
    sku: 'FB110',
    description: 'Fish Bone Meal - (2000lb Tote)',
    type: 'component',
    unit_cost: 1850.00,
    primary_vendor_id: 'vendor_dte',
    lead_time_days: 21,
    moq: 1,
    case_pack_qty: 1,
    category: 'protein',
    status: 'ACTIVE'
  },
  
  // Components - Minerals
  KMAG101: {
    sku: 'KMAG101',
    description: 'Sulfate of Potash Magnesia-K-Mag - (50lb)',
    type: 'component',
    unit_cost: 28.00,
    primary_vendor_id: 'vendor_dte',
    lead_time_days: 14,
    moq: 40,
    case_pack_qty: 1,
    category: 'minerals',
    status: 'ACTIVE'
  },
  
  OG106: {
    sku: 'OG106',
    description: 'Diamond K Gypsum-Solution Grade - (2000lb - 1 Yard Tote)',
    type: 'component',
    unit_cost: 425.00,
    primary_vendor_id: 'vendor_diamondk',
    lead_time_days: 7,
    moq: 1,
    case_pack_qty: 1,
    category: 'minerals',
    status: 'ACTIVE'
  },
  
  // Components - Organic Matter
  ALF04T: {
    sku: 'ALF04T',
    description: 'Alfalfa Meal Organic - (1 Ton Tote)',
    type: 'component',
    unit_cost: 890.00,
    primary_vendor_id: 'vendor_standlee',
    lead_time_days: 30,
    moq: 1,
    case_pack_qty: 1,
    category: 'organic',
    status: 'ACTIVE'
  },
  
  CM105: {
    sku: 'CM105',
    description: 'Crustacean Meal - (2000lb - 2 Yard Tote)',
    type: 'component',
    unit_cost: 2200.00,
    primary_vendor_id: 'vendor_neptune',
    lead_time_days: 21,
    moq: 1,
    case_pack_qty: 1,
    category: 'protein',
    status: 'ACTIVE'
  },
  
  MB104M: {
    sku: 'MB104M',
    description: 'Organic Malted Barley Grain for SST-Milled - (55lb)',
    type: 'component',
    unit_cost: 65.00,
    primary_vendor_id: 'vendor_grainworks',
    lead_time_days: 10,
    moq: 10,
    case_pack_qty: 1,
    category: 'organic',
    status: 'ACTIVE'
  },
  
  // Peat Moss - Long lead time
  PM101: {
    sku: 'PM101',
    description: 'Premier Sphagnum Peat Moss - (3.8 cu ft bale)',
    type: 'component',
    unit_cost: 32.00,
    primary_vendor_id: 'vendor_premier',
    lead_time_days: 45,
    moq: 100,
    case_pack_qty: 1,
    category: 'soil_base',
    status: 'ACTIVE'
  },
  
  // Discontinued product for regression tests
  'FM104-OLD': {
    sku: 'FM104-OLD',
    description: 'Fish Meal OLD FORMULA - DISCONTINUED',
    type: 'component',
    unit_cost: 40.00,
    primary_vendor_id: 'vendor_neptune',
    lead_time_days: 14,
    moq: 20,
    case_pack_qty: 1,
    category: 'protein',
    status: 'DISCONTINUED'
  }
};

// ============================================================================
// BILL OF MATERIALS
// ============================================================================

export const boms = {
  CRAFT8: [
    { parent_sku: 'CRAFT8', component_sku: 'ALF04T', quantity_per: 0.0375, component_note: '75 lbs' },
    { parent_sku: 'CRAFT8', component_sku: 'FM104', quantity_per: 1.5, component_note: '75 lbs' },
    { parent_sku: 'CRAFT8', component_sku: 'KMAG101', quantity_per: 1.5, component_note: '75 lbs' },
    { parent_sku: 'CRAFT8', component_sku: 'MB104M', quantity_per: 1.363636, component_note: '75 lbs' },
    { parent_sku: 'CRAFT8', component_sku: 'CM105', quantity_per: 0.0375, component_note: '75 lbs' },
    { parent_sku: 'CRAFT8', component_sku: 'FB110', quantity_per: 0.1125, component_note: '225 lbs' },
    { parent_sku: 'CRAFT8', component_sku: 'OG106', quantity_per: 0.0375, component_note: '75 lbs' },
  ],
  
  'BIG6-NUTRIENT-KIT': [
    { parent_sku: 'BIG6-NUTRIENT-KIT', component_sku: 'FM104', quantity_per: 0.5, component_note: '25 lbs' },
    { parent_sku: 'BIG6-NUTRIENT-KIT', component_sku: 'KMAG101', quantity_per: 0.4, component_note: '20 lbs' },
  ]
};

// Flat array for database seeding
export const allBomRecords = Object.values(boms).flat();

// ============================================================================
// VENDORS
// ============================================================================

export const vendors = {
  vendor_neptune: {
    id: 'vendor_neptune',
    vendor_name: 'Neptune Harvest',
    lead_time_days: 14,
    payment_terms: 'Net 30',
    contact_email: 'orders@neptuneharvest.com',
    min_order_value: 500
  },
  
  vendor_dte: {
    id: 'vendor_dte',
    vendor_name: 'Down To Earth',
    lead_time_days: 21,
    payment_terms: 'Net 30',
    contact_email: 'wholesale@downtoearthdistributors.com',
    min_order_value: 1000
  },
  
  vendor_diamondk: {
    id: 'vendor_diamondk',
    vendor_name: 'Diamond K Gypsum',
    lead_time_days: 7,
    payment_terms: 'Net 15',
    contact_email: 'sales@diamondkgypsum.com',
    min_order_value: 0
  },
  
  vendor_standlee: {
    id: 'vendor_standlee',
    vendor_name: 'Standlee Premium Products',
    lead_time_days: 30,
    payment_terms: 'Net 30',
    contact_email: 'orders@standleeforage.com',
    min_order_value: 500
  },
  
  vendor_grainworks: {
    id: 'vendor_grainworks',
    vendor_name: 'GrainWorks Malt',
    lead_time_days: 10,
    payment_terms: 'Net 30',
    contact_email: 'sales@grainworks.com',
    min_order_value: 250
  },
  
  vendor_premier: {
    id: 'vendor_premier',
    vendor_name: 'Premier Tech Horticulture',
    lead_time_days: 45,
    payment_terms: 'Net 45',
    contact_email: 'orders@premiertech.com',
    min_order_value: 2000
  }
};

// ============================================================================
// INVENTORY STATES
// ============================================================================

export const inventoryScenarios = {
  // Normal healthy inventory
  healthy: {
    FM104: { on_hand_qty: 200, on_order_qty: 0, reserved_qty: 30 },
    KMAG101: { on_hand_qty: 150, on_order_qty: 50, reserved_qty: 20 },
    ALF04T: { on_hand_qty: 5, on_order_qty: 1, reserved_qty: 0 },
    CM105: { on_hand_qty: 4, on_order_qty: 0, reserved_qty: 0 },
    FB110: { on_hand_qty: 2, on_order_qty: 0, reserved_qty: 0 },
    OG106: { on_hand_qty: 25, on_order_qty: 0, reserved_qty: 0 },
    MB104M: { on_hand_qty: 40, on_order_qty: 0, reserved_qty: 5 },
  },
  
  // Critical shortage scenario
  critical: {
    FM104: { on_hand_qty: 10, on_order_qty: 0, reserved_qty: 8 }, // Only 2 available!
    KMAG101: { on_hand_qty: 5, on_order_qty: 0, reserved_qty: 0 },
    ALF04T: { on_hand_qty: 0.5, on_order_qty: 0, reserved_qty: 0 },
    CM105: { on_hand_qty: 0, on_order_qty: 1, reserved_qty: 0 },
    FB110: { on_hand_qty: 0.2, on_order_qty: 0, reserved_qty: 0 },
    OG106: { on_hand_qty: 1, on_order_qty: 0, reserved_qty: 0 },
    MB104M: { on_hand_qty: 0, on_order_qty: 0, reserved_qty: 0 }, // OUT OF STOCK
  },
  
  // Oversold scenario (reservations exceed on-hand)
  oversold: {
    FM104: { on_hand_qty: 20, on_order_qty: 0, reserved_qty: 50 }, // -30 net!
    KMAG101: { on_hand_qty: 10, on_order_qty: 0, reserved_qty: 15 },
  },
  
  // Plenty of stock (excess inventory)
  excess: {
    FM104: { on_hand_qty: 1000, on_order_qty: 200, reserved_qty: 50 },
    KMAG101: { on_hand_qty: 500, on_order_qty: 100, reserved_qty: 20 },
    ALF04T: { on_hand_qty: 20, on_order_qty: 5, reserved_qty: 0 },
  }
};

// ============================================================================
// SEASONAL INDICES (BuildASoil's actual patterns)
// ============================================================================

export const seasonalIndices = [
  { month: 1, category: 'soil', index_value: 0.60, notes: 'Winter lull - indoor grows prep' },
  { month: 2, category: 'soil', index_value: 0.80, notes: 'Early planners' },
  { month: 3, category: 'soil', index_value: 1.40, notes: '🚀 Spring ramp begins' },
  { month: 4, category: 'soil', index_value: 1.80, notes: '🔥 Peak season starts' },
  { month: 5, category: 'soil', index_value: 1.90, notes: '🔥 Peak - outdoor planting' },
  { month: 6, category: 'soil', index_value: 1.50, notes: 'Late planters' },
  { month: 7, category: 'soil', index_value: 0.90, notes: 'Mid-season maintenance' },
  { month: 8, category: 'soil', index_value: 0.80, notes: 'Harvest prep' },
  { month: 9, category: 'soil', index_value: 0.70, notes: 'Post-harvest' },
  { month: 10, category: 'soil', index_value: 0.75, notes: 'Fall indoor setup' },
  { month: 11, category: 'soil', index_value: 0.65, notes: 'Black Friday spike' },
  { month: 12, category: 'soil', index_value: 0.50, notes: 'Holiday slowdown' },
];

// ============================================================================
// FORECAST SCENARIOS
// ============================================================================

export const forecastScenarios = {
  // Normal week
  normal: [
    { product_id: 'CRAFT8', base_forecast: 20, seasonal_index: 1.0 },
    { product_id: 'BIG6-NUTRIENT-KIT', base_forecast: 50, seasonal_index: 1.0 },
  ],
  
  // Spring rush (April)
  springRush: [
    { product_id: 'CRAFT8', base_forecast: 20, seasonal_index: 1.8 }, // 36 units
    { product_id: 'BIG6-NUTRIENT-KIT', base_forecast: 50, seasonal_index: 1.8 }, // 90 units
  ],
  
  // Winter lull (January)
  winterLull: [
    { product_id: 'CRAFT8', base_forecast: 20, seasonal_index: 0.6 }, // 12 units
    { product_id: 'BIG6-NUTRIENT-KIT', base_forecast: 50, seasonal_index: 0.6 }, // 30 units
  ],
  
  // Large production run
  largeBatch: [
    { product_id: 'CRAFT8', base_forecast: 100, seasonal_index: 1.0 },
  ],
};

// ============================================================================
// EXPECTED CALCULATION RESULTS
// For validating test assertions
// ============================================================================

export const expectedResults = {
  // CRAFT8 BOM explosion for 30 units
  craft8_30units: {
    ALF04T: 1.125,      // 30 × 0.0375 = 1.125 totes
    FM104: 45,          // 30 × 1.5 = 45 bags
    KMAG101: 45,        // 30 × 1.5 = 45 bags
    MB104M: 40.909,     // 30 × 1.363636 ≈ 40.91 bags
    CM105: 1.125,       // 30 × 0.0375 = 1.125 totes
    FB110: 3.375,       // 30 × 0.1125 = 3.375 totes
    OG106: 1.125,       // 30 × 0.0375 = 1.125 totes
  },
  
  // Total component cost per CRAFT8 unit
  craft8_unitCost: {
    ALF04T: 33.375,     // 0.0375 × 890
    FM104: 63.75,       // 1.5 × 42.50
    KMAG101: 42.00,     // 1.5 × 28
    MB104M: 88.636,     // 1.363636 × 65
    CM105: 82.50,       // 0.0375 × 2200
    FB110: 208.125,     // 0.1125 × 1850
    OG106: 15.9375,     // 0.0375 × 425
    total: 534.37       // Sum of above
  }
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Product {
  sku: string;
  description: string;
  type: 'finished_good' | 'component';
  unit_cost: number;
  selling_price?: number;
  primary_vendor_id: string | null;
  lead_time_days?: number;
  moq?: number;
  case_pack_qty?: number;
  category: string;
  status: 'ACTIVE' | 'DISCONTINUED' | 'PENDING';
}

export interface BOMRecord {
  parent_sku: string;
  component_sku: string;
  quantity_per: number;
  component_note?: string;
}

export interface Vendor {
  id: string;
  vendor_name: string;
  lead_time_days: number;
  payment_terms: string;
  contact_email: string;
  min_order_value: number;
}

export interface InventoryRecord {
  on_hand_qty: number;
  on_order_qty: number;
  reserved_qty: number;
}

export interface ForecastRecord {
  product_id: string;
  base_forecast: number;
  seasonal_index: number;
}
