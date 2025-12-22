/**
 * PO Intelligence Agent
 *
 * Responsibilities:
 * - Track PO arrival dates and predict ETAs
 * - Pester for updates on out-of-stock items
 * - Monitor invoices for pricing variances
 * - Flag unexpected shipping costs
 * - Calculate landed costs with actual data
 * - Integrate email-derived ETAs for better predictions (Phase 4)
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Email thread data for enhanced predictions
interface EmailThreadData {
  po_id: string;
  latest_eta: string | null;
  eta_confidence: 'high' | 'medium' | 'low' | null;
  latest_tracking_status: string | null;
  tracking_numbers: string[] | null;
  has_delay_notice: boolean;
  has_backorder_notice: boolean;
  days_since_vendor_update: number | null;
}

export interface POArrivalPrediction {
  po_id: string;
  po_number: string;
  vendor_name: string;
  expected_date: string | null;
  predicted_eta: string | null;
  confidence: 'high' | 'medium' | 'low';
  status: 'on_time' | 'delayed' | 'at_risk' | 'unknown';
  days_until_arrival: number;
  items: {
    sku: string;
    product_name: string;
    quantity_ordered: number;
    is_out_of_stock: boolean;
  }[];
  // Email-derived intelligence (Phase 4)
  email_eta?: string | null;
  email_eta_confidence?: 'high' | 'medium' | 'low' | null;
  email_tracking_status?: string | null;
  email_tracking_numbers?: string[];
  has_email_delay_notice?: boolean;
  has_email_backorder_notice?: boolean;
  eta_source?: 'email' | 'po' | 'calculated';
}

export interface InvoiceVariance {
  po_id: string;
  po_number: string;
  vendor_name: string;
  variance_type: 'price_increase' | 'unexpected_shipping' | 'tax_discrepancy' | 'quantity_mismatch';
  expected_amount: number;
  actual_amount: number;
  variance_amount: number;
  variance_percentage: number;
  flagged_at: string;
  severity: 'critical' | 'warning' | 'info';
}

export interface PesterAlert {
  po_id: string;
  po_number: string;
  vendor_name: string;
  vendor_email: string | null;
  reason: 'out_of_stock' | 'overdue' | 'no_tracking' | 'exception';
  days_overdue: number;
  last_pestered: string | null;
  pester_count: number;
  items_affected: string[];
  priority: 'urgent' | 'high' | 'medium';
}

/**
 * Fetch email thread intelligence for POs
 */
async function getEmailThreadDataForPOs(poIds: string[]): Promise<Map<string, EmailThreadData>> {
  const emailDataMap = new Map<string, EmailThreadData>();

  if (poIds.length === 0) return emailDataMap;

  try {
    // Get email threads with ETA/tracking info
    const { data: threads, error: threadError } = await supabase
      .from('email_threads')
      .select(`
        id,
        po_id,
        latest_eta,
        eta_confidence,
        latest_tracking_status,
        tracking_numbers,
        last_inbound_at
      `)
      .in('po_id', poIds)
      .eq('is_resolved', false);

    if (threadError) {
      console.warn('[POIntelligence] Failed to fetch email threads:', threadError);
      return emailDataMap;
    }

    // Get delay/backorder messages
    const threadIds = (threads || []).map(t => t.id);
    let delayMessages: any[] = [];

    if (threadIds.length > 0) {
      const { data: messages } = await supabase
        .from('email_thread_messages')
        .select('thread_id, is_delay_notice, is_backorder_notice')
        .in('thread_id', threadIds)
        .or('is_delay_notice.eq.true,is_backorder_notice.eq.true');
      delayMessages = messages || [];
    }

    // Build delay notice lookup
    const delayByThread = new Map<string, { delay: boolean; backorder: boolean }>();
    for (const msg of delayMessages) {
      const existing = delayByThread.get(msg.thread_id) || { delay: false, backorder: false };
      if (msg.is_delay_notice) existing.delay = true;
      if (msg.is_backorder_notice) existing.backorder = true;
      delayByThread.set(msg.thread_id, existing);
    }

    // Build email data map by PO
    const now = new Date();
    for (const thread of threads || []) {
      if (!thread.po_id) continue;

      const notices = delayByThread.get(thread.id) || { delay: false, backorder: false };
      const daysSinceUpdate = thread.last_inbound_at
        ? Math.floor((now.getTime() - new Date(thread.last_inbound_at).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      emailDataMap.set(thread.po_id, {
        po_id: thread.po_id,
        latest_eta: thread.latest_eta,
        eta_confidence: thread.eta_confidence,
        latest_tracking_status: thread.latest_tracking_status,
        tracking_numbers: thread.tracking_numbers,
        has_delay_notice: notices.delay,
        has_backorder_notice: notices.backorder,
        days_since_vendor_update: daysSinceUpdate,
      });
    }
  } catch (err) {
    console.warn('[POIntelligence] Error fetching email thread data:', err);
  }

  return emailDataMap;
}

/**
 * Get arrival predictions for all active POs
 * Enhanced with email-derived intelligence (Phase 4)
 */
export async function getArrivalPredictions(): Promise<POArrivalPrediction[]> {
  try {
    // Get active POs from finale_purchase_orders
    // Filter: only recent orders (last 90 days) and exclude DropshipPo records
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: pos, error } = await supabase
      .from('finale_purchase_orders')
      .select(`
        id,
        order_id,
        vendor_name,
        expected_date,
        order_date,
        tracking_status,
        status,
        line_items
      `)
      .eq('is_active', true)
      .or('status.eq.Submitted,status.eq.Ordered,status.eq.Partial')
      .gte('order_date', ninetyDaysAgo.toISOString())
      .not('order_id', 'ilike', '%DropshipPo%')
      .order('expected_date', { ascending: true });

    if (error) throw error;

    // Get inventory to check stock levels
    const { data: inventory } = await supabase
      .from('inventory_items')
      .select('sku, product_name, available_quantity, reorder_point');

    const inventoryMap = new Map(inventory?.map(i => [i.sku, i]) || []);

    // Get email thread data for all POs (Phase 4 enhancement)
    const poIds = (pos || []).map(p => p.id);
    const emailDataMap = await getEmailThreadDataForPOs(poIds);

    const predictions: POArrivalPrediction[] = (pos || []).map(po => {
      const expectedDate = po.expected_date ? new Date(po.expected_date) : null;
      const orderDate = new Date(po.order_date);
      const now = new Date();

      // Get email thread data for this PO
      const emailData = emailDataMap.get(po.id);

      // Determine best ETA source: email > PO tracking > PO expected date
      let effectiveEta = expectedDate;
      let etaSource: 'email' | 'po' | 'calculated' = 'po';

      // Use email ETA if available and confidence is not low
      if (emailData?.latest_eta && emailData.eta_confidence !== 'low') {
        effectiveEta = new Date(emailData.latest_eta);
        etaSource = 'email';
      }

      // Calculate days until arrival using best available ETA
      const daysUntilArrival = effectiveEta
        ? Math.ceil((effectiveEta.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      // Predict ETA based on tracking status
      let predictedEta = effectiveEta?.toISOString() || null;
      let confidence: 'high' | 'medium' | 'low' = 'medium';
      let status: 'on_time' | 'delayed' | 'at_risk' | 'unknown' = 'unknown';

      // Use email tracking status if available, otherwise PO tracking status
      const trackingStatus = emailData?.latest_tracking_status || po.tracking_status;

      if (trackingStatus === 'delivered') {
        status = 'on_time';
        confidence = 'high';
      } else if (trackingStatus === 'in_transit' || trackingStatus === 'out_for_delivery') {
        status = 'on_time';
        confidence = 'high';
      } else if (trackingStatus === 'exception') {
        status = 'delayed';
        confidence = 'high';
      } else if (effectiveEta && daysUntilArrival < 0) {
        status = 'delayed';
        confidence = 'high';
      } else if (effectiveEta && daysUntilArrival < 3) {
        status = 'at_risk';
        confidence = 'medium';
      } else if (effectiveEta) {
        status = 'on_time';
        confidence = 'medium';
      }

      // Email delay/backorder notices escalate status (Phase 4)
      if (emailData?.has_backorder_notice) {
        status = 'delayed';
        confidence = 'high';
      } else if (emailData?.has_delay_notice && status !== 'delayed') {
        status = 'at_risk';
        confidence = 'high';
      }

      // Boost confidence if we have email ETA
      if (etaSource === 'email' && emailData?.eta_confidence === 'high') {
        confidence = 'high';
      }

      // Parse line items
      const lineItems = Array.isArray(po.line_items) ? po.line_items : [];
      const items = lineItems.map((item: any) => {
        const invItem = inventoryMap.get(item.product_url || item.sku || '');
        const isOutOfStock = invItem
          ? (invItem.available_quantity || 0) <= (invItem.reorder_point || 0)
          : false;

        return {
          sku: item.product_url || item.sku || 'Unknown',
          product_name: item.product_name || 'Unknown Product',
          quantity_ordered: item.quantity_ordered || 0,
          is_out_of_stock: isOutOfStock,
        };
      });

      return {
        po_id: po.id,
        po_number: po.order_id,
        vendor_name: po.vendor_name || 'Unknown Vendor',
        expected_date: po.expected_date,
        predicted_eta: predictedEta,
        confidence,
        status,
        days_until_arrival: daysUntilArrival,
        items,
        // Email-derived intelligence (Phase 4)
        email_eta: emailData?.latest_eta || null,
        email_eta_confidence: emailData?.eta_confidence || null,
        email_tracking_status: emailData?.latest_tracking_status || null,
        email_tracking_numbers: emailData?.tracking_numbers || [],
        has_email_delay_notice: emailData?.has_delay_notice || false,
        has_email_backorder_notice: emailData?.has_backorder_notice || false,
        eta_source: etaSource,
      };
    });

    return predictions.sort((a, b) => a.days_until_arrival - b.days_until_arrival);
  } catch (error) {
    console.error('[POIntelligence] getArrivalPredictions failed:', error);
    return [];
  }
}

/**
 * Get POs that need pestering (out of stock items, overdue, no tracking)
 */
export async function getPesterAlerts(): Promise<PesterAlert[]> {
  try {
    const predictions = await getArrivalPredictions();
    const alerts: PesterAlert[] = [];

    for (const pred of predictions) {
      const outOfStockItems = pred.items.filter(i => i.is_out_of_stock);
      const hasOutOfStock = outOfStockItems.length > 0;
      const isOverdue = pred.days_until_arrival < 0;
      const hasNoTracking = pred.status === 'unknown';

      if (!hasOutOfStock && !isOverdue && !hasNoTracking) continue;

      // Get vendor contact info
      const { data: vendor } = await supabase
        .from('vendors')
        .select('contact_emails')
        .ilike('name', pred.vendor_name)
        .limit(1)
        .single();

      let reason: PesterAlert['reason'] = 'no_tracking';
      let priority: PesterAlert['priority'] = 'medium';

      if (hasOutOfStock && isOverdue) {
        reason = 'out_of_stock';
        priority = 'urgent';
      } else if (hasOutOfStock) {
        reason = 'out_of_stock';
        priority = 'high';
      } else if (isOverdue) {
        reason = 'overdue';
        priority = 'high';
      } else if (pred.status === 'delayed') {
        reason = 'exception';
        priority = 'high';
      }

      alerts.push({
        po_id: pred.po_id,
        po_number: pred.po_number,
        vendor_name: pred.vendor_name,
        vendor_email: vendor?.contact_emails?.[0] || null,
        reason,
        days_overdue: isOverdue ? Math.abs(pred.days_until_arrival) : 0,
        last_pestered: null, // TODO: Track in database
        pester_count: 0, // TODO: Track in database
        items_affected: outOfStockItems.map(i => i.product_name),
        priority,
      });
    }

    return alerts.sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, medium: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  } catch (error) {
    console.error('[POIntelligence] getPesterAlerts failed:', error);
    return [];
  }
}

/**
 * Check for invoice variances
 * Compares po_invoice_data with original PO amounts
 */
export async function getInvoiceVariances(): Promise<InvoiceVariance[]> {
  try {
    // Get invoices with variance flags
    const { data: invoices, error } = await supabase
      .from('po_invoice_data')
      .select(`
        id,
        po_id,
        invoice_number,
        invoice_total,
        shipping_cost,
        tax_amount,
        line_items,
        flagged_at,
        purchase_orders!inner(
          order_id,
          total,
          shipping,
          tax,
          vendor:vendors!inner(name)
        )
      `)
      .not('flagged_at', 'is', null)
      .order('flagged_at', { ascending: false });

    if (error) {
      console.error('[POIntelligence] Error fetching invoices:', error);
      return [];
    }

    const variances: InvoiceVariance[] = [];

    for (const invoice of invoices || []) {
      const po = invoice.purchase_orders;
      if (!po) continue;

      const expectedTotal = po.total || 0;
      const actualTotal = invoice.invoice_total || 0;
      const expectedShipping = po.shipping || 0;
      const actualShipping = invoice.shipping_cost || 0;
      const expectedTax = po.tax || 0;
      const actualTax = invoice.tax_amount || 0;

      // Check for price increases (total variance)
      const totalVariance = actualTotal - expectedTotal;
      const totalVariancePct = expectedTotal > 0 ? (totalVariance / expectedTotal) * 100 : 0;

      if (Math.abs(totalVariancePct) > 5) { // >5% variance
        variances.push({
          po_id: po.id,
          po_number: po.order_id,
          vendor_name: po.vendor?.name || 'Unknown',
          variance_type: totalVariance > 0 ? 'price_increase' : 'quantity_mismatch',
          expected_amount: expectedTotal,
          actual_amount: actualTotal,
          variance_amount: totalVariance,
          variance_percentage: totalVariancePct,
          flagged_at: invoice.flagged_at,
          severity: Math.abs(totalVariancePct) > 15 ? 'critical' : 'warning',
        });
      }

      // Check for unexpected shipping
      const shippingVariance = actualShipping - expectedShipping;
      if (actualShipping > 0 && expectedShipping === 0) {
        variances.push({
          po_id: po.id,
          po_number: po.order_id,
          vendor_name: po.vendor?.name || 'Unknown',
          variance_type: 'unexpected_shipping',
          expected_amount: expectedShipping,
          actual_amount: actualShipping,
          variance_amount: shippingVariance,
          variance_percentage: 100,
          flagged_at: invoice.flagged_at,
          severity: actualShipping > 50 ? 'warning' : 'info',
        });
      }

      // Check for tax discrepancies
      const taxVariance = actualTax - expectedTax;
      const taxVariancePct = expectedTax > 0 ? (taxVariance / expectedTax) * 100 : 0;
      
      if (Math.abs(taxVariancePct) > 10) {
        variances.push({
          po_id: po.id,
          po_number: po.order_id,
          vendor_name: po.vendor?.name || 'Unknown',
          variance_type: 'tax_discrepancy',
          expected_amount: expectedTax,
          actual_amount: actualTax,
          variance_amount: taxVariance,
          variance_percentage: taxVariancePct,
          flagged_at: invoice.flagged_at,
          severity: 'info',
        });
      }
    }

    return variances;
  } catch (error) {
    console.error('[POIntelligence] getInvoiceVariances failed:', error);
    return [];
  }
}

/**
 * Calculate landed cost for a PO
 * Includes actual shipping, duties, and any invoice adjustments
 */
export async function calculateLandedCost(poId: string): Promise<{
  original_total: number;
  actual_total: number;
  shipping_cost: number;
  tax_amount: number;
  landed_cost: number;
  variance: number;
  variance_percentage: number;
}> {
  try {
    // Get PO
    const { data: po } = await supabase
      .from('purchase_orders')
      .select('total, shipping, tax')
      .eq('id', poId)
      .single();

    // Get invoice if exists
    const { data: invoice } = await supabase
      .from('po_invoice_data')
      .select('invoice_total, shipping_cost, tax_amount')
      .eq('po_id', poId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const originalTotal = po?.total || 0;
    const actualTotal = invoice?.invoice_total || originalTotal;
    const shippingCost = invoice?.shipping_cost || po?.shipping || 0;
    const taxAmount = invoice?.tax_amount || po?.tax || 0;

    const landedCost = actualTotal + shippingCost + taxAmount;
    const variance = landedCost - originalTotal;
    const variancePercentage = originalTotal > 0 ? (variance / originalTotal) * 100 : 0;

    return {
      original_total: originalTotal,
      actual_total: actualTotal,
      shipping_cost: shippingCost,
      tax_amount: taxAmount,
      landed_cost: landedCost,
      variance,
      variance_percentage: variancePercentage,
    };
  } catch (error) {
    console.error('[POIntelligence] calculateLandedCost failed:', error);
    return {
      original_total: 0,
      actual_total: 0,
      shipping_cost: 0,
      tax_amount: 0,
      landed_cost: 0,
      variance: 0,
      variance_percentage: 0,
    };
  }
}

/**
 * Send automated pester email to vendor
 */
export async function sendPesterEmail(alert: PesterAlert): Promise<boolean> {
  try {
    if (!alert.vendor_email) {
      console.warn('[POIntelligence] No vendor email for PO', alert.po_number);
      return false;
    }

    // TODO: Integrate with email service
    // For now, just log the intent
    console.log('[POIntelligence] Would send pester email:', {
      to: alert.vendor_email,
      subject: `Urgent: Update Needed for PO #${alert.po_number}`,
      reason: alert.reason,
      items: alert.items_affected,
    });

    // Track pester in database
    await supabase
      .from('po_vendor_communications')
      .insert({
        po_id: alert.po_id,
        communication_type: 'automated_follow_up',
        subject: `Update Request: PO #${alert.po_number}`,
        body: `We need an update on the following items: ${alert.items_affected.join(', ')}`,
        sent_at: new Date().toISOString(),
      });

    return true;
  } catch (error) {
    console.error('[POIntelligence] sendPesterEmail failed:', error);
    return false;
  }
}
