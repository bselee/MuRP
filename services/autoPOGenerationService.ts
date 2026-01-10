/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTO-PO GENERATION SERVICE - Automated Purchase Order Creation
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Automated PO generation triggered by reorder alerts, with approval workflows.
 *
 * Key Features:
 * - Daily scheduled checks for items below ROP
 * - Groups items by vendor for efficient ordering
 * - Applies minimum order quantities and price breaks
 * - Approval workflow based on dollar thresholds
 * - Integration with pending_actions queue
 *
 * Approval Thresholds:
 * - < $1,000: Auto-approve (if trust score high enough)
 * - $1,000 - $10,000: Manager approval required
 * - > $10,000: Director approval required
 *
 * @module services/autoPOGenerationService
 */

import { supabase } from '../lib/supabase/client';
import { getRigorousPurchasingAdvice } from './purchasingForecastingService';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Types
// ═══════════════════════════════════════════════════════════════════════════

export interface POApprovalThresholds {
  autoApproveLimit: number;      // < this amount auto-approves (default $1,000)
  managerApprovalLimit: number;  // < this amount needs manager (default $10,000)
  directorApprovalLimit: number; // >= this amount needs director (default $10,000+)
  minTrustScoreForAuto: number;  // Minimum agent trust score for auto-approve (default 0.85)
}

export interface PODraftItem {
  sku: string;
  productName: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  reorderReason: string;
  daysRemaining: number;
  abcClass: 'A' | 'B' | 'C';
}

export interface PODraft {
  id: string;
  vendorId: string;
  vendorName: string;
  items: PODraftItem[];
  subtotal: number;
  estimatedTotal: number;
  approvalLevel: 'auto' | 'manager' | 'director';
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'submitted';
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
}

export interface AutoPOResult {
  success: boolean;
  draftsCreated: number;
  draftsAutoApproved: number;
  draftsPendingApproval: number;
  totalValue: number;
  drafts: PODraft[];
  errors: string[];
}

export interface VendorPricing {
  vendorId: string;
  sku: string;
  unitPrice: number;
  minOrderQty?: number;
  priceBreaks?: Array<{ qty: number; price: number }>;
  lastPurchasePrice?: number;
  lastPurchaseDate?: string;
}

// Default thresholds
const DEFAULT_THRESHOLDS: POApprovalThresholds = {
  autoApproveLimit: 1000,
  managerApprovalLimit: 10000,
  directorApprovalLimit: 10000,
  minTrustScoreForAuto: 0.85,
};

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 VENDOR PRICING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get vendor pricing for a SKU with price breaks
 * Sources pricing from:
 * 1. product_pricing table (current approved pricing)
 * 2. Fallback to last purchase price from PO line items
 */
export async function getVendorPricing(vendorId: string, sku: string): Promise<VendorPricing | null> {
  // Primary: Check product_pricing table for approved vendor pricing
  const { data: productPricing } = await supabase
    .from('product_pricing')
    .select(`
      current_unit_cost,
      current_effective_date,
      vendor_sku_mappings (
        vendor_sku,
        vendor_product_name
      )
    `)
    .eq('internal_sku', sku)
    .eq('vendor_id', vendorId)
    .eq('approval_status', 'approved')
    .maybeSingle();

  if (productPricing && productPricing.current_unit_cost) {
    return {
      vendorId,
      sku,
      unitPrice: productPricing.current_unit_cost,
      lastPurchasePrice: productPricing.current_unit_cost,
      lastPurchaseDate: productPricing.current_effective_date,
    };
  }

  // Secondary: Check product_pricing without vendor constraint (preferred vendor pricing)
  const { data: anyVendorPricing } = await supabase
    .from('product_pricing')
    .select('current_unit_cost, current_effective_date, vendor_id')
    .eq('internal_sku', sku)
    .eq('approval_status', 'approved')
    .order('current_effective_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (anyVendorPricing && anyVendorPricing.current_unit_cost) {
    return {
      vendorId: anyVendorPricing.vendor_id || vendorId,
      sku,
      unitPrice: anyVendorPricing.current_unit_cost,
      lastPurchasePrice: anyVendorPricing.current_unit_cost,
      lastPurchaseDate: anyVendorPricing.current_effective_date,
    };
  }

  // Tertiary: Get last purchase price from completed PO line items
  const { data: lastPurchase } = await supabase
    .from('purchase_order_items')
    .select(`
      unit_price,
      created_at,
      purchase_orders!inner(vendor_id, status)
    `)
    .eq('sku', sku)
    .eq('purchase_orders.vendor_id', vendorId)
    .in('purchase_orders.status', ['Received', 'Closed', 'Complete'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastPurchase && lastPurchase.unit_price) {
    return {
      vendorId,
      sku,
      unitPrice: lastPurchase.unit_price,
      lastPurchasePrice: lastPurchase.unit_price,
      lastPurchaseDate: lastPurchase.created_at,
    };
  }

  // Final fallback: Get last purchase price from ANY vendor
  const { data: anyLastPurchase } = await supabase
    .from('purchase_order_items')
    .select(`
      unit_price,
      created_at,
      purchase_orders!inner(vendor_id, status)
    `)
    .eq('sku', sku)
    .in('purchase_orders.status', ['Received', 'Closed', 'Complete'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (anyLastPurchase && anyLastPurchase.unit_price) {
    return {
      vendorId,
      sku,
      unitPrice: anyLastPurchase.unit_price,
      lastPurchasePrice: anyLastPurchase.unit_price,
      lastPurchaseDate: anyLastPurchase.created_at,
    };
  }

  return null;
}

/**
 * Apply price breaks to get best price for quantity
 */
export function applyPriceBreaks(
  basePrice: number,
  quantity: number,
  priceBreaks?: Array<{ qty: number; price: number }>
): number {
  if (!priceBreaks || priceBreaks.length === 0) {
    return basePrice;
  }

  // Sort by quantity descending to find highest applicable break
  const sortedBreaks = [...priceBreaks].sort((a, b) => b.qty - a.qty);

  for (const breakPoint of sortedBreaks) {
    if (quantity >= breakPoint.qty) {
      return breakPoint.price;
    }
  }

  return basePrice;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📋 APPROVAL WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get approval thresholds from settings
 */
export async function getApprovalThresholds(): Promise<POApprovalThresholds> {
  const { data } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'po_approval_thresholds')
    .maybeSingle();

  if (data?.setting_value) {
    return { ...DEFAULT_THRESHOLDS, ...data.setting_value };
  }

  return DEFAULT_THRESHOLDS;
}

/**
 * Determine approval level based on PO value
 */
export function determineApprovalLevel(
  totalValue: number,
  thresholds: POApprovalThresholds
): 'auto' | 'manager' | 'director' {
  if (totalValue < thresholds.autoApproveLimit) {
    return 'auto';
  }
  if (totalValue < thresholds.managerApprovalLimit) {
    return 'manager';
  }
  return 'director';
}

/**
 * Check if agent has sufficient trust for auto-approval
 */
export async function canAutoApprove(agentId: string, thresholds: POApprovalThresholds): Promise<boolean> {
  const { data: agent } = await supabase
    .from('agent_definitions')
    .select('trust_score, autonomy_level')
    .eq('id', agentId)
    .maybeSingle();

  if (!agent) return false;

  // Must be in autonomous mode with high trust
  return (
    agent.autonomy_level === 'autonomous' &&
    (agent.trust_score || 0) >= thresholds.minTrustScoreForAuto
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📦 PO DRAFT CREATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Group reorder items by vendor
 */
function groupItemsByVendor(items: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>();

  for (const item of items) {
    const vendorId = item.vendor_id || 'unknown';
    if (!groups.has(vendorId)) {
      groups.set(vendorId, []);
    }
    groups.get(vendorId)!.push(item);
  }

  return groups;
}

/**
 * Create PO draft from grouped items
 */
async function createPODraft(
  vendorId: string,
  vendorName: string,
  items: any[],
  thresholds: POApprovalThresholds
): Promise<PODraft> {
  const draftItems: PODraftItem[] = [];
  let subtotal = 0;

  for (const item of items) {
    // Get vendor pricing
    const pricing = await getVendorPricing(vendorId, item.sku);
    const unitCost = pricing?.unitPrice || item.parameters?.unit_cost || 0;
    const quantity = item.recommendation?.quantity || 0;

    // Apply price breaks if available
    const finalPrice = applyPriceBreaks(unitCost, quantity, pricing?.priceBreaks);
    const lineTotal = finalPrice * quantity;
    subtotal += lineTotal;

    draftItems.push({
      sku: item.sku,
      productName: item.name,
      quantity,
      unitCost: finalPrice,
      lineTotal,
      reorderReason: item.recommendation?.reason || 'Below reorder point',
      daysRemaining: item.days_remaining || 0,
      abcClass: item.parameters?.abc_class || 'C',
    });
  }

  const approvalLevel = determineApprovalLevel(subtotal, thresholds);

  return {
    id: crypto.randomUUID(),
    vendorId,
    vendorName,
    items: draftItems,
    subtotal,
    estimatedTotal: subtotal, // Could add shipping/tax estimates
    approvalLevel,
    status: 'draft',
    createdAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 MAIN AUTO-PO TRIGGER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Main function: Check inventory and generate PO drafts for items below ROP
 */
export async function triggerAutoPOGeneration(
  agentId?: string,
  options?: {
    dryRun?: boolean;
    vendorFilter?: string[];
    categoryFilter?: string[];
    maxDraftsPerRun?: number;
  }
): Promise<AutoPOResult> {
  const errors: string[] = [];
  const drafts: PODraft[] = [];
  let draftsAutoApproved = 0;

  try {
    // Get thresholds
    const thresholds = await getApprovalThresholds();

    // Get items needing reorder
    const reorderItems = await getRigorousPurchasingAdvice();

    if (!reorderItems || reorderItems.length === 0) {
      return {
        success: true,
        draftsCreated: 0,
        draftsAutoApproved: 0,
        draftsPendingApproval: 0,
        totalValue: 0,
        drafts: [],
        errors: [],
      };
    }

    // Apply filters if provided
    let filteredItems = reorderItems;
    if (options?.vendorFilter?.length) {
      filteredItems = filteredItems.filter(item =>
        options.vendorFilter!.includes(item.vendor_id)
      );
    }

    // Group by vendor
    const vendorGroups = groupItemsByVendor(filteredItems);

    // Limit number of drafts if specified
    let draftsCreated = 0;
    const maxDrafts = options?.maxDraftsPerRun || 10;

    // Check if agent can auto-approve
    const canAuto = agentId ? await canAutoApprove(agentId, thresholds) : false;

    for (const [vendorId, items] of vendorGroups) {
      if (draftsCreated >= maxDrafts) break;

      try {
        // Get vendor name
        const { data: vendor } = await supabase
          .from('vendors')
          .select('name')
          .eq('id', vendorId)
          .maybeSingle();

        const vendorName = vendor?.name || 'Unknown Vendor';

        // Create draft
        const draft = await createPODraft(vendorId, vendorName, items, thresholds);

        // Determine if we can auto-approve this draft
        if (!options?.dryRun) {
          if (canAuto && draft.approvalLevel === 'auto') {
            draft.status = 'approved';
            draft.approvedBy = 'system';
            draft.approvedAt = new Date().toISOString();
            draft.notes = 'Auto-approved by Inventory Guardian Agent';
            draftsAutoApproved++;
          } else {
            draft.status = 'pending_approval';

            // Create pending action for approval
            await createPendingApprovalAction(draft, agentId);
          }

          // Store draft in database
          await storePODraft(draft);
        }

        drafts.push(draft);
        draftsCreated++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to create draft for vendor ${vendorId}: ${message}`);
      }
    }

    const totalValue = drafts.reduce((sum, d) => sum + d.estimatedTotal, 0);

    return {
      success: errors.length === 0,
      draftsCreated,
      draftsAutoApproved,
      draftsPendingApproval: draftsCreated - draftsAutoApproved,
      totalValue,
      drafts,
      errors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      draftsCreated: 0,
      draftsAutoApproved: 0,
      draftsPendingApproval: 0,
      totalValue: 0,
      drafts: [],
      errors: [message],
    };
  }
}

/**
 * Store PO draft in database
 */
async function storePODraft(draft: PODraft): Promise<void> {
  const { error } = await supabase.from('po_drafts').insert({
    id: draft.id,
    vendor_id: draft.vendorId,
    vendor_name: draft.vendorName,
    items: draft.items,
    subtotal: draft.subtotal,
    estimated_total: draft.estimatedTotal,
    approval_level: draft.approvalLevel,
    status: draft.status,
    approved_by: draft.approvedBy,
    approved_at: draft.approvedAt,
    notes: draft.notes,
    created_at: draft.createdAt,
  });

  if (error) {
    console.error('Failed to store PO draft:', error);
    throw error;
  }
}

/**
 * Create pending action for approval
 */
async function createPendingApprovalAction(draft: PODraft, agentId?: string): Promise<void> {
  const approvalLabel = draft.approvalLevel === 'manager'
    ? 'Manager Approval'
    : 'Director Approval';

  const { error } = await supabase.from('pending_actions').insert({
    agent_id: agentId || null,
    agent_identifier: 'inventory-guardian',
    action_type: 'create_po',
    action_label: `${approvalLabel}: Create PO for ${draft.vendorName} ($${draft.estimatedTotal.toFixed(2)})`,
    payload: {
      draft_id: draft.id,
      vendor_id: draft.vendorId,
      vendor_name: draft.vendorName,
      item_count: draft.items.length,
      estimated_total: draft.estimatedTotal,
      top_items: draft.items.slice(0, 5).map(i => ({
        sku: i.sku,
        name: i.productName,
        qty: i.quantity,
      })),
    },
    confidence: 0.85,
    priority: draft.items.some(i => i.daysRemaining <= 7) ? 'high' : 'normal',
    reasoning: `Generated based on ${draft.items.length} items below reorder point. ` +
      `Critical items: ${draft.items.filter(i => i.daysRemaining <= 7).length}. ` +
      `Total value: $${draft.estimatedTotal.toFixed(2)}`,
    status: 'pending',
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    source_context: {
      draft_id: draft.id,
      approval_level: draft.approvalLevel,
    },
  });

  if (error) {
    console.error('Failed to create pending action:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📋 APPROVAL ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Approve a PO draft and convert to actual PO
 */
export async function approvePODraft(
  draftId: string,
  approverId: string,
  notes?: string
): Promise<{ success: boolean; poId?: string; error?: string }> {
  try {
    // Get draft
    const { data: draft, error: fetchError } = await supabase
      .from('po_drafts')
      .select('*')
      .eq('id', draftId)
      .single();

    if (fetchError || !draft) {
      return { success: false, error: 'Draft not found' };
    }

    if (draft.status !== 'pending_approval' && draft.status !== 'draft') {
      return { success: false, error: `Cannot approve draft with status: ${draft.status}` };
    }

    // Update draft status
    await supabase.from('po_drafts').update({
      status: 'approved',
      approved_by: approverId,
      approved_at: new Date().toISOString(),
      notes: notes || draft.notes,
    }).eq('id', draftId);

    // Update related pending action
    await supabase.from('pending_actions').update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: approverId,
    }).eq('source_context->>draft_id', draftId);

    // Create actual PO from draft
    const poId = await createPOFromDraft(draft);

    return { success: true, poId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Reject a PO draft
 */
export async function rejectPODraft(
  draftId: string,
  rejecterId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Update draft status
    await supabase.from('po_drafts').update({
      status: 'rejected',
      notes: reason,
    }).eq('id', draftId);

    // Update related pending action
    await supabase.from('pending_actions').update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: rejecterId,
      execution_result: { reason },
    }).eq('source_context->>draft_id', draftId);

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Create actual PO from approved draft
 */
async function createPOFromDraft(draft: any): Promise<string> {
  const poId = crypto.randomUUID();
  const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  // Create PO
  const { error: poError } = await supabase.from('purchase_orders').insert({
    id: poId,
    order_id: poNumber,
    vendor_id: draft.vendor_id,
    supplier_name: draft.vendor_name,
    status: 'Draft',
    order_date: new Date().toISOString(),
    total_amount: draft.estimated_total,
    line_items: draft.items.map((item: PODraftItem) => ({
      sku: item.sku,
      description: item.productName,
      quantity: item.quantity,
      unit_price: item.unitCost,
      total: item.lineTotal,
    })),
    notes: `Auto-generated from draft ${draft.id}. ${draft.notes || ''}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (poError) throw poError;

  // Update draft with PO reference
  await supabase.from('po_drafts').update({
    status: 'submitted',
    notes: `Converted to PO: ${poNumber}`,
  }).eq('id', draft.id);

  return poId;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 QUERY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get pending PO drafts awaiting approval
 */
export async function getPendingDrafts(): Promise<PODraft[]> {
  const { data, error } = await supabase
    .from('po_drafts')
    .select('*')
    .eq('status', 'pending_approval')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch pending drafts:', error);
    return [];
  }

  return (data || []).map(d => ({
    id: d.id,
    vendorId: d.vendor_id,
    vendorName: d.vendor_name,
    items: d.items,
    subtotal: d.subtotal,
    estimatedTotal: d.estimated_total,
    approvalLevel: d.approval_level,
    status: d.status,
    createdAt: d.created_at,
    approvedBy: d.approved_by,
    approvedAt: d.approved_at,
    notes: d.notes,
  }));
}

/**
 * Get draft statistics
 */
export async function getDraftStats(): Promise<{
  pending: number;
  approved: number;
  rejected: number;
  submitted: number;
  totalValuePending: number;
}> {
  const { data } = await supabase
    .from('po_drafts')
    .select('status, estimated_total');

  if (!data) {
    return { pending: 0, approved: 0, rejected: 0, submitted: 0, totalValuePending: 0 };
  }

  return {
    pending: data.filter(d => d.status === 'pending_approval').length,
    approved: data.filter(d => d.status === 'approved').length,
    rejected: data.filter(d => d.status === 'rejected').length,
    submitted: data.filter(d => d.status === 'submitted').length,
    totalValuePending: data
      .filter(d => d.status === 'pending_approval')
      .reduce((sum, d) => sum + (d.estimated_total || 0), 0),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎁 Exports
// ═══════════════════════════════════════════════════════════════════════════

export default {
  // Pricing
  getVendorPricing,
  applyPriceBreaks,

  // Thresholds
  getApprovalThresholds,
  determineApprovalLevel,
  canAutoApprove,

  // Main trigger
  triggerAutoPOGeneration,

  // Approval actions
  approvePODraft,
  rejectPODraft,

  // Queries
  getPendingDrafts,
  getDraftStats,
};
