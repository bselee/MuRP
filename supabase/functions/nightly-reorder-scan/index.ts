/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🌙 NIGHTLY REORDER SCAN EDGE FUNCTION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Daily cron job that scans inventory and populates the reorder queue.
 *
 * Schedule: Runs daily at 6:00 AM UTC
 *
 * What it does:
 * 1. Scans all active inventory items
 * 2. Calculates consumption rates and days until stockout
 * 3. Identifies items below reorder point
 * 4. Populates reorder_queue with recommendations
 * 5. Assigns urgency and priority scores
 * 6. (Optional) Auto-creates draft POs for vendors with automation enabled
 * 7. Logs execution to ai_job_logs
 *
 * @module supabase/functions/nightly-reorder-scan
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface InventoryForReorder {
  sku: string;
  name: string;
  current_stock: number;
  reorder_point: number;
  safety_stock: number;
  moq: number;
  vendor_id: string | null;
  vendor_name: string | null;
  lead_time_days: number;
  unit_cost: number;
  sales_last_30_days: number;
  sales_last_90_days: number;
  on_order: number;
}

interface ReorderRecommendation {
  inventory_sku: string;
  item_name: string;
  vendor_id: string | null;
  vendor_name: string | null;
  current_stock: number;
  on_order: number;
  reorder_point: number;
  safety_stock: number;
  moq: number;
  recommended_quantity: number;
  consumption_daily: number;
  consumption_30day: number;
  consumption_90day: number;
  consumption_variance: number;
  lead_time_days: number;
  days_until_stockout: number;
  urgency: 'critical' | 'high' | 'normal' | 'low';
  priority_score: number;
  estimated_cost: number;
  notes: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Handler
// ═══════════════════════════════════════════════════════════════════════════

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    console.log('🔄 Starting nightly reorder scan...');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Log job start
    const jobLogId = await logJobStart(supabase);

    // 1. Fetch active inventory items
    const inventoryItems = await fetchInventoryForReorder(supabase);
    console.log(`📊 Analyzing ${inventoryItems.length} active inventory items...`);

    // 2. Analyze each item and generate recommendations
    const recommendations: ReorderRecommendation[] = [];

    for (const item of inventoryItems) {
      const recommendation = analyzeItem(item);
      if (recommendation) {
        recommendations.push(recommendation);
      }
    }

    // 3. Update reorder queue
    await updateReorderQueue(supabase, recommendations);

    // 4. Calculate summary
    const summary = {
      items_scanned: inventoryItems.length,
      items_needing_reorder: recommendations.length,
      critical_items: recommendations.filter(r => r.urgency === 'critical').length,
      high_priority_items: recommendations.filter(r => r.urgency === 'high').length,
      total_estimated_cost: recommendations.reduce((sum, r) => sum + r.estimated_cost, 0),
      auto_pos_created: 0,
      auto_po_vendors: [],
      notifications_sent: 0,
    };

    console.log(`✅ Scan complete: ${summary.items_needing_reorder} items need reordering`);
    console.log(`   Critical: ${summary.critical_items}, High: ${summary.high_priority_items}`);
    console.log(`   Estimated cost: $${summary.total_estimated_cost.toFixed(2)}`);

    // 5. Send notifications for critical items
    try {
      const notificationResult = await sendCriticalItemNotifications(supabase, recommendations);
      summary.notifications_sent = notificationResult.sent;
      
      if (notificationResult.sent > 0) {
        console.log(`📧 Sent ${notificationResult.sent} notification(s) for critical items`);
      }
    } catch (error: any) {
      console.error('⚠️ Notification sending failed:', error.message);
      // Don't fail entire job if notifications fail
    }

    // 6. Auto-create draft POs for vendors with automation enabled
    try {
      const autoPOResult = await createAutoDraftPOs(supabase);
      summary.auto_pos_created = autoPOResult.pos_created;
      summary.auto_po_vendors = autoPOResult.vendors;

      if (autoPOResult.pos_created > 0) {
        console.log(`🤖 Auto-created ${autoPOResult.pos_created} draft PO(s) for ${autoPOResult.vendors.length} vendor(s)`);
      }
    } catch (error: any) {
      console.error('⚠️ Auto-PO creation failed:', error.message);
      // Don't fail entire job if auto-PO fails
    }

    // Log job completion
    const duration = Date.now() - startTime;
    await logJobComplete(supabase, jobLogId, summary, duration);

    return new Response(
      JSON.stringify({
        success: true,
        summary,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('❌ Reorder scan failed:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

async function fetchInventoryForReorder(supabase: any): Promise<InventoryForReorder[]> {
  const { data: items, error } = await supabase
    .from('inventory_items')
    .select(`
      sku,
      name,
      current_stock,
      reorder_point,
      safety_stock,
      moq,
      vendor_id,
      lead_time_days,
      unit_cost,
      sales_last_30_days,
      sales_last_90_days,
      vendors (
        id,
        name
      )
    `)
    .eq('status', 'active')
    .gte('reorder_point', 0);

  if (error) throw error;

  // Calculate on_order quantities
  const itemsWithOnOrder: InventoryForReorder[] = await Promise.all(
    (items || []).map(async (item: any) => {
      const { data: poItems } = await supabase
        .from('purchase_order_items')
        .select('quantity_pending')
        .eq('inventory_sku', item.sku)
        .in('line_status', ['pending', 'partial']);

      const on_order = poItems?.reduce(
        (sum: number, poi: any) => sum + (poi.quantity_pending || 0),
        0
      ) || 0;

      return {
        sku: item.sku,
        name: item.name,
        current_stock: item.current_stock || 0,
        reorder_point: item.reorder_point || 0,
        safety_stock: item.safety_stock || 0,
        moq: item.moq || 1,
        vendor_id: item.vendor_id,
        vendor_name: item.vendors?.name || 'Unknown Vendor',
        lead_time_days: item.lead_time_days || 14,
        unit_cost: item.unit_cost || 0,
        sales_last_30_days: item.sales_last_30_days || 0,
        sales_last_90_days: item.sales_last_90_days || 0,
        on_order,
      };
    })
  );

  return itemsWithOnOrder;
}

function analyzeItem(item: InventoryForReorder): ReorderRecommendation | null {
  // Calculate available stock
  const availableStock = item.current_stock + item.on_order;

  // Skip if above reorder point
  if (availableStock >= item.reorder_point) {
    return null;
  }

  // Calculate consumption rates
  const consumption30day = item.sales_last_30_days;
  const consumption90day = item.sales_last_90_days;
  const consumptionDaily = consumption30day / 30;

  // Calculate consumption variance
  const avg30 = consumption30day / 30;
  const avg90 = consumption90day / 90;
  const consumptionVariance = avg30 > 0 ? Math.abs(avg30 - avg90) / avg30 : 0;

  // Calculate days until stockout
  const daysUntilStockout = consumptionDaily > 0
    ? Math.floor(availableStock / consumptionDaily)
    : 999;

  // Calculate recommended order quantity
  const leadTimeDemand = Math.ceil(consumptionDaily * item.lead_time_days);
  const targetStock = leadTimeDemand + item.safety_stock;
  const rawQuantity = Math.max(0, targetStock - availableStock);

  // Round up to MOQ
  const recommendedQuantity = Math.max(
    item.moq,
    Math.ceil(rawQuantity / item.moq) * item.moq
  );

  // Calculate urgency
  const urgency = calculateUrgency(daysUntilStockout, item.lead_time_days, consumptionVariance);

  // Calculate priority score
  const priorityScore = calculatePriorityScore(
    daysUntilStockout,
    item.lead_time_days,
    item.current_stock,
    item.reorder_point,
    consumptionVariance
  );

  // Estimated cost
  const estimatedCost = recommendedQuantity * item.unit_cost;

  // Generate notes
  const notes = generateNotes(item, daysUntilStockout, availableStock, recommendedQuantity);

  return {
    inventory_sku: item.sku,
    item_name: item.name,
    vendor_id: item.vendor_id,
    vendor_name: item.vendor_name,
    current_stock: item.current_stock,
    on_order: item.on_order,
    reorder_point: item.reorder_point,
    safety_stock: item.safety_stock,
    moq: item.moq,
    recommended_quantity: recommendedQuantity,
    consumption_daily: parseFloat(consumptionDaily.toFixed(2)),
    consumption_30day: consumption30day,
    consumption_90day: consumption90day,
    consumption_variance: parseFloat(consumptionVariance.toFixed(2)),
    lead_time_days: item.lead_time_days,
    days_until_stockout: daysUntilStockout,
    urgency,
    priority_score: priorityScore,
    estimated_cost: estimatedCost,
    notes,
  };
}

function calculateUrgency(
  daysUntilStockout: number,
  leadTimeDays: number,
  consumptionVariance: number
): 'critical' | 'high' | 'normal' | 'low' {
  const varianceBuffer = consumptionVariance > 0.3 ? 3 : 0;
  const effectiveLeadTime = leadTimeDays + varianceBuffer;

  if (daysUntilStockout <= 0) {
    return 'critical';
  } else if (daysUntilStockout < effectiveLeadTime * 0.5) {
    return 'critical';
  } else if (daysUntilStockout < effectiveLeadTime) {
    return 'high';
  } else if (daysUntilStockout < effectiveLeadTime * 1.5) {
    return 'normal';
  } else {
    return 'low';
  }
}

function calculatePriorityScore(
  daysUntilStockout: number,
  leadTimeDays: number,
  currentStock: number,
  reorderPoint: number,
  consumptionVariance: number
): number {
  let score = 50;

  const stockoutRatio = daysUntilStockout / leadTimeDays;
  if (stockoutRatio <= 0) {
    score += 40;
  } else if (stockoutRatio < 0.5) {
    score += 35;
  } else if (stockoutRatio < 1.0) {
    score += 25;
  } else if (stockoutRatio < 1.5) {
    score += 15;
  } else {
    score += 5;
  }

  const belowReorderPoint = reorderPoint - currentStock;
  const percentBelow = belowReorderPoint / reorderPoint;
  score += Math.min(30, percentBelow * 30);

  score += Math.min(20, consumptionVariance * 20);

  if (currentStock <= 0) {
    score += 10;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

function generateNotes(
  item: InventoryForReorder,
  daysUntilStockout: number,
  availableStock: number,
  recommendedQuantity: number
): string {
  const notes: string[] = [];

  if (item.current_stock <= 0) {
    notes.push('⚠️ STOCKED OUT');
  } else if (daysUntilStockout < item.lead_time_days) {
    notes.push(`Will stock out in ${daysUntilStockout} days (lead time: ${item.lead_time_days} days)`);
  } else {
    notes.push(`${daysUntilStockout} days until stockout`);
  }

  if (item.on_order > 0) {
    notes.push(`${item.on_order} units on order`);
  }

  if (recommendedQuantity > item.moq && recommendedQuantity % item.moq !== 0) {
    notes.push(`Rounded up to MOQ multiple (${item.moq})`);
  }

  const dailySales = item.sales_last_30_days / 30;
  if (dailySales > 0) {
    notes.push(`Avg daily sales: ${dailySales.toFixed(1)} units`);
  }

  return notes.join(' • ');
}

async function updateReorderQueue(
  supabase: any,
  recommendations: ReorderRecommendation[]
): Promise<void> {
  // Mark old pending items as resolved
  await supabase
    .from('reorder_queue')
    .update({
      status: 'resolved',
      resolution_type: 'auto_cleanup',
      resolved_at: new Date().toISOString(),
    })
    .eq('status', 'pending')
    .lt('identified_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  // Insert new recommendations
  if (recommendations.length > 0) {
    const { error } = await supabase.from('reorder_queue').insert(
      recommendations.map((rec) => ({
        inventory_sku: rec.inventory_sku,
        item_name: rec.item_name,
        vendor_id: rec.vendor_id,
        vendor_name: rec.vendor_name,
        current_stock: rec.current_stock,
        on_order: rec.on_order,
        reorder_point: rec.reorder_point,
        safety_stock: rec.safety_stock,
        moq: rec.moq,
        recommended_quantity: rec.recommended_quantity,
        consumption_daily: rec.consumption_daily,
        consumption_30day: rec.consumption_30day,
        consumption_90day: rec.consumption_90day,
        consumption_variance: rec.consumption_variance,
        lead_time_days: rec.lead_time_days,
        days_until_stockout: rec.days_until_stockout,
        urgency: rec.urgency,
        priority_score: rec.priority_score,
        estimated_cost: rec.estimated_cost,
        notes: rec.notes,
        status: 'pending',
        identified_at: new Date().toISOString(),
      }))
    );

    if (error) throw error;
  }
}

async function logJobStart(supabase: any): Promise<string> {
  const { data, error } = await supabase
    .from('ai_job_logs')
    .insert({
      job_name: 'reorder_queue_scan',
      job_type: 'scheduled',
      status: 'running',
      started_at: new Date().toISOString(),
      triggered_by: 'cron',
    })
    .select('id')
    .single();

  if (error) {
    console.warn('Failed to log job start:', error);
    return 'unknown';
  }

  return data.id;
}

async function logJobComplete(
  supabase: any,
  jobLogId: string,
  summary: any,
  durationMs: number
): Promise<void> {
  await supabase
    .from('ai_job_logs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
      items_processed: summary.items_scanned,
      success_count: summary.items_needing_reorder,
      result_summary: JSON.stringify(summary),
    })
    .eq('id', jobLogId);
}

/**
 * Send notifications for critical stockout items
 */
async function sendCriticalItemNotifications(
  supabase: any,
  recommendations: ReorderRecommendation[]
): Promise<{ sent: number }> {
  const criticalItems = recommendations.filter(r => r.urgency === 'critical');
  
  if (criticalItems.length === 0) {
    return { sent: 0 };
  }

  // Get notification settings
  const { data: settings } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'notification_channels')
    .single();

  const channels = settings?.setting_value || ['in-app'];

  // Get admin users for notifications
  const { data: adminUsers } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .or('role.eq.admin,role.eq.manager');

  if (!adminUsers || adminUsers.length === 0) {
    return { sent: 0 };
  }

  // Create in-app notifications
  const notifications = adminUsers.flatMap((user: any) => 
    criticalItems.map((item: any) => ({
      user_id: user.id,
      title: `Critical Stock Alert: ${item.item_name}`,
      message: `${item.item_name} (${item.inventory_sku}) will stock out in ${item.days_until_stockout} days. Current stock: ${item.current_stock}, Recommended order: ${item.recommended_quantity} units.`,
      type: 'critical_stockout',
      reference_type: 'reorder_queue',
      reference_id: item.inventory_sku,
      is_read: false,
      created_at: new Date().toISOString(),
    }))
  );

  const { error: notifError } = await supabase
    .from('notifications')
    .insert(notifications);

  if (notifError) {
    console.error('Failed to create in-app notifications:', notifError);
  }

  // Send email notifications if enabled
  if (channels.includes('email')) {
    try {
      await supabase.functions.invoke('send-notification-email', {
        body: {
          recipients: adminUsers.map((u: any) => u.email),
          subject: `🚨 Critical Stock Alert: ${criticalItems.length} item(s) need immediate reordering`,
          items: criticalItems.map((item: any) => ({
            sku: item.inventory_sku,
            name: item.item_name,
            current_stock: item.current_stock,
            days_until_stockout: item.days_until_stockout,
            recommended_quantity: item.recommended_quantity,
            vendor: item.vendor_name,
          })),
        },
      });
    } catch (emailError) {
      console.error('Failed to send email notifications:', emailError);
    }
  }

  return { sent: notifications.length };
}

/**
 * Auto-create draft POs for vendors with automation enabled
 */
async function createAutoDraftPOs(supabase: any): Promise<{ pos_created: number; vendors: string[] }> {
  // 1. Fetch pending reorder queue items
  const { data: queueItems, error: queueError } = await supabase
    .from('reorder_queue')
    .select('*')
    .eq('status', 'pending')
    .not('vendor_id', 'is', null);

  if (queueError) throw queueError;
  if (!queueItems || queueItems.length === 0) {
    return { pos_created: 0, vendors: [] };
  }

  // 2. Fetch vendors with automation enabled
  const { data: vendors, error: vendorsError } = await supabase
    .from('vendors')
    .select('id, name, auto_po_enabled, auto_po_threshold, lead_time_days')
    .eq('auto_po_enabled', true);

  if (vendorsError) throw vendorsError;
  if (!vendors || vendors.length === 0) {
    return { pos_created: 0, vendors: [] };
  }

  const vendorMap = new Map(vendors.map((v: any) => [v.id, v]));

  // 3. Filter items by vendor automation settings & urgency threshold
  const urgencyRank: Record<string, number> = { critical: 4, high: 3, normal: 2, low: 1 };

  const eligibleItems = queueItems.filter((item: any) => {
    const vendor = vendorMap.get(item.vendor_id);
    if (!vendor) return false;

    const threshold = vendor.auto_po_threshold || 'critical';
    return urgencyRank[item.urgency] >= urgencyRank[threshold];
  });

  if (eligibleItems.length === 0) {
    return { pos_created: 0, vendors: [] };
  }

  // 4. Group by vendor
  const itemsByVendor = new Map<string, any[]>();
  eligibleItems.forEach((item: any) => {
    if (!itemsByVendor.has(item.vendor_id)) {
      itemsByVendor.set(item.vendor_id, []);
    }
    itemsByVendor.get(item.vendor_id)!.push(item);
  });

  // 5. Create draft PO for each vendor
  const createdVendors: string[] = [];

  for (const [vendorId, items] of itemsByVendor.entries()) {
    const vendor = vendorMap.get(vendorId);
    if (!vendor) continue;

    try {
      // Generate order ID
      const orderId = await generateOrderId(supabase);

      // Calculate expected date
      const orderDate = new Date().toISOString();
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + (vendor.lead_time_days || 14));

      // Insert PO header
      const { data: newPO, error: poError } = await supabase
        .from('purchase_orders')
        .insert({
          order_id: orderId,
          vendor_id: vendorId,
          supplier_name: vendor.name,
          status: 'draft',
          order_date: orderDate,
          expected_date: expectedDate.toISOString(),
          internal_notes: `Auto-generated from reorder queue (${items.length} items)`,
          source: 'auto_reorder',
          auto_generated: true,
          auto_approved: false,
          record_created: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (poError) throw poError;

      // Insert line items
      const lineItems = items.map((item: any, idx: number) => ({
        po_id: newPO.id,
        inventory_sku: item.inventory_sku,
        item_name: item.item_name,
        quantity_ordered: item.recommended_quantity,
        unit_cost: item.estimated_cost / item.recommended_quantity,
        line_number: idx + 1,
        line_status: 'pending',
      }));

      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(lineItems);

      if (itemsError) throw itemsError;

      // Mark reorder queue items as processed
      const itemIds = items.map((i: any) => i.id);
      await supabase
        .from('reorder_queue')
        .update({
          status: 'po_created',
          po_id: orderId,
          resolved_at: new Date().toISOString(),
          resolution_type: 'auto_po_created',
        })
        .in('id', itemIds);

      createdVendors.push(vendor.name);
    } catch (error) {
      console.error(`Failed to create auto-PO for vendor ${vendorId}:`, error);
      // Continue with other vendors
    }
  }

  return { pos_created: itemsByVendor.size, vendors: createdVendors };
}

/**
 * Generate unique order ID
 */
async function generateOrderId(supabase: any): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');

  // Find max sequence for today
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('order_id')
    .like('order_id', `PO-${dateStr}-%`)
    .order('order_id', { ascending: false })
    .limit(1);

  let sequence = 1;
  if (data && data.length > 0) {
    const lastId = data[0].order_id;
    const lastSeq = parseInt(lastId.split('-')[2]);
    sequence = lastSeq + 1;
  }

  return `PO-${dateStr}-${sequence.toString().padStart(3, '0')}`;
}
