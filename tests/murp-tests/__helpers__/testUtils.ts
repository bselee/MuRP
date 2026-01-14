/**
 * Test Helper Utilities
 * 
 * CLAUDE CODE: These helpers make tests readable and reduce boilerplate.
 * Import these in any test file that needs database interaction or date manipulation.
 */

import { addDays, addWeeks, format, startOfWeek, subDays } from 'date-fns';

// ============================================================================
// DATE HELPERS
// ============================================================================

/**
 * Get a date relative to "today" (or mocked today)
 */
export function daysFromNow(days: number, baseDate?: Date): Date {
  return addDays(baseDate || new Date(), days);
}

export function weeksFromNow(weeks: number, baseDate?: Date): Date {
  return addWeeks(baseDate || new Date(), weeks);
}

export function nextWeek(baseDate?: Date): Date {
  return startOfWeek(addWeeks(baseDate || new Date(), 1));
}

export function formatDateISO(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Create a date string for SQL queries
 */
export function sqlDate(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm:ss'Z'");
}

// ============================================================================
// CALCULATION HELPERS
// ============================================================================

/**
 * Round to specified decimal places (for floating point comparison)
 */
export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Check if two numbers are close enough (for floating point tests)
 */
export function isCloseTo(actual: number, expected: number, tolerance = 0.01): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

/**
 * Calculate net available inventory
 */
export function calculateNetAvailable(inventory: {
  on_hand_qty: number;
  on_order_qty: number;
  reserved_qty: number;
} | null): number {
  if (!inventory) return 0;
  return inventory.on_hand_qty + inventory.on_order_qty - inventory.reserved_qty;
}

/**
 * Calculate component requirement from parent quantity
 */
export function calculateComponentNeed(
  parentQty: number,
  qtyPerParent: number | null | undefined
): number {
  if (qtyPerParent === null || qtyPerParent === undefined) {
    throw new Error('Invalid BOM: missing quantity_per_parent');
  }
  if (parentQty === 0) return 0;
  return parentQty * qtyPerParent;
}

/**
 * Round up for discrete ordering units
 */
export function roundForOrdering(
  rawNeed: number,
  isDiscrete: boolean,
  casePack?: number
): number {
  if (!isDiscrete) return rawNeed;
  
  if (casePack && casePack > 1) {
    return Math.ceil(rawNeed / casePack) * casePack;
  }
  
  return Math.ceil(rawNeed);
}

/**
 * Calculate order-by date based on need date and lead time
 */
export function calculateOrderByDate(
  needDate: Date,
  leadTimeDays: number | null,
  safetyBufferDays: number = 7
): Date {
  const effectiveLeadTime = leadTimeDays ?? 30; // Default to 30 if unknown
  return subDays(needDate, effectiveLeadTime + safetyBufferDays);
}

/**
 * Calculate shortage and surplus
 */
export function calculateGap(
  requirement: number,
  available: number
): { shortage: number; surplus: number } {
  const gap = available - requirement;
  return {
    shortage: Math.max(0, -gap),
    surplus: Math.max(0, gap)
  };
}

/**
 * Get effective lead time (vendor-specific or category default)
 */
export function getEffectiveLeadTime(
  vendorLeadTime: number | null,
  categoryDefault: number
): number {
  return vendorLeadTime ?? categoryDefault;
}

// ============================================================================
// BOM EXPLOSION HELPERS
// ============================================================================

export interface BOMNode {
  component: string;
  qty: number;
}

export type BOMStructure = Record<string, BOMNode[]>;

/**
 * Explode a BOM to get all component requirements
 * Handles nested BOMs and detects circular references
 */
export function explodeBOM(
  parentSku: string,
  parentQty: number,
  boms: BOMStructure,
  visited: Set<string> = new Set()
): Record<string, number> {
  // Circular reference detection
  if (visited.has(parentSku)) {
    throw new Error('Circular BOM reference detected');
  }
  visited.add(parentSku);
  
  const result: Record<string, number> = {};
  const components = boms[parentSku] || [];
  
  for (const comp of components) {
    const requiredQty = parentQty * comp.qty;
    
    // Check if this component has its own BOM (sub-assembly)
    if (boms[comp.component]) {
      // Recursive explosion
      const subComponents = explodeBOM(
        comp.component,
        requiredQty,
        boms,
        new Set(visited)
      );
      
      // Merge sub-components into result
      for (const [sku, qty] of Object.entries(subComponents)) {
        result[sku] = (result[sku] || 0) + qty;
      }
    } else {
      // Raw material - add directly
      result[comp.component] = (result[comp.component] || 0) + requiredQty;
    }
  }
  
  return result;
}

/**
 * Aggregate component needs across multiple parent demands
 */
export function aggregateComponentNeeds(
  demands: Array<{ product: string; qty: number }>,
  boms: BOMStructure
): Record<string, number> {
  const aggregated: Record<string, number> = {};
  
  for (const demand of demands) {
    const components = explodeBOM(demand.product, demand.qty, boms);
    
    for (const [sku, qty] of Object.entries(components)) {
      aggregated[sku] = (aggregated[sku] || 0) + qty;
    }
  }
  
  return aggregated;
}

// ============================================================================
// MOCK DATABASE HELPERS
// ============================================================================

/**
 * Create a mock Supabase client for unit tests
 */
export function createMockSupabase() {
  const data: Record<string, any[]> = {};
  
  return {
    from: (table: string) => ({
      select: (columns?: string) => ({
        eq: (col: string, val: any) => ({
          single: () => Promise.resolve({
            data: data[table]?.find(r => r[col] === val) || null,
            error: null
          }),
          then: (resolve: Function) => resolve({
            data: data[table]?.filter(r => r[col] === val) || [],
            error: null
          })
        }),
        in: (col: string, vals: any[]) => ({
          then: (resolve: Function) => resolve({
            data: data[table]?.filter(r => vals.includes(r[col])) || [],
            error: null
          })
        }),
        then: (resolve: Function) => resolve({
          data: data[table] || [],
          error: null
        })
      }),
      
      insert: (records: any | any[]) => {
        const arr = Array.isArray(records) ? records : [records];
        if (!data[table]) data[table] = [];
        data[table].push(...arr);
        return Promise.resolve({ data: arr, error: null });
      },
      
      upsert: (records: any | any[]) => {
        const arr = Array.isArray(records) ? records : [records];
        if (!data[table]) data[table] = [];
        // Simple upsert - replace by first key match
        for (const record of arr) {
          const key = Object.keys(record)[0];
          const idx = data[table].findIndex(r => r[key] === record[key]);
          if (idx >= 0) {
            data[table][idx] = { ...data[table][idx], ...record };
          } else {
            data[table].push(record);
          }
        }
        return Promise.resolve({ data: arr, error: null });
      },
      
      delete: () => ({
        eq: (col: string, val: any) => {
          if (data[table]) {
            data[table] = data[table].filter(r => r[col] !== val);
          }
          return Promise.resolve({ error: null });
        }
      })
    }),
    
    // Direct data access for test setup
    __setData: (table: string, records: any[]) => {
      data[table] = records;
    },
    
    __getData: (table: string) => data[table] || [],
    
    __clearAll: () => {
      for (const key of Object.keys(data)) {
        delete data[key];
      }
    }
  };
}

// ============================================================================
// TEST SCENARIO BUILDERS
// ============================================================================

/**
 * Set up a shortage scenario for testing
 */
export async function setupShortageScenario(
  db: ReturnType<typeof createMockSupabase>,
  config: {
    product?: string;
    forecastQty?: number;
    componentShortages?: Array<{
      sku: string;
      shortage: number;
      vendor?: string;
      leadTime?: number;
    }>;
  }
) {
  const { product = 'CRAFT8', forecastQty = 100, componentShortages = [] } = config;
  
  // Set up forecast
  db.__setData('finished_goods_forecast', [{
    product_id: product,
    forecast_period: formatDateISO(nextWeek()),
    base_forecast: forecastQty,
    seasonal_index: 1.0
  }]);
  
  // Set up inventory to create shortages
  const inventoryRecords = componentShortages.map(cs => ({
    sku: cs.sku,
    on_hand_qty: 0,
    on_order_qty: 0,
    reserved_qty: 0,
    vendor_name: cs.vendor || 'Unknown',
    lead_time_days: cs.leadTime || 14
  }));
  
  db.__setData('finale_inventory', inventoryRecords);
}

/**
 * Set up a vendor outage simulation
 */
export async function simulateVendorOutage(
  db: ReturnType<typeof createMockSupabase>,
  config: {
    vendor: string;
    outageDays: number;
  }
) {
  const products = db.__getData('finale_products') || [];
  const affectedProducts = products.filter(
    (p: any) => p.vendor_name === config.vendor
  );
  
  const finishedGoods = db.__getData('finale_boms') || [];
  const affectedFinishedGoods = new Set<string>();
  
  for (const product of affectedProducts) {
    const bomUsages = finishedGoods.filter(
      (b: any) => b.component_sku === product.sku
    );
    bomUsages.forEach((b: any) => affectedFinishedGoods.add(b.parent_sku));
  }
  
  return {
    affectedComponents: affectedProducts.map((p: any) => p.sku),
    affectedFinishedGoods: Array.from(affectedFinishedGoods),
    revenueAtRisk: 0 // Would need sales data to calculate
  };
}

// ============================================================================
// ASSERTION HELPERS
// ============================================================================

/**
 * Custom matcher for component requirements
 */
export function expectComponentQty(
  requirements: Array<{ component_sku: string; total_gross_requirement: number }>,
  sku: string,
  expectedQty: number,
  tolerance = 0.01
) {
  const found = requirements.find(r => r.component_sku === sku);
  
  if (!found) {
    throw new Error(`Component ${sku} not found in requirements`);
  }
  
  if (!isCloseTo(found.total_gross_requirement, expectedQty, tolerance)) {
    throw new Error(
      `Component ${sku}: expected ${expectedQty}, got ${found.total_gross_requirement}`
    );
  }
  
  return true;
}

/**
 * Validate all expected components are present
 */
export function validateComponentSet(
  requirements: Array<{ component_sku: string }>,
  expectedSkus: string[]
) {
  const foundSkus = new Set(requirements.map(r => r.component_sku));
  const missingSkus = expectedSkus.filter(sku => !foundSkus.has(sku));
  const extraSkus = Array.from(foundSkus).filter(sku => !expectedSkus.includes(sku));
  
  if (missingSkus.length > 0 || extraSkus.length > 0) {
    throw new Error(
      `Component mismatch. Missing: [${missingSkus.join(', ')}]. Extra: [${extraSkus.join(', ')}]`
    );
  }
  
  return true;
}
