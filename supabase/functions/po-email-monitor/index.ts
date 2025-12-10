/**
 * PO Email Monitor Edge Function
 * 
 * Scheduled function that monitors purchasing email account for vendor responses
 * to sent POs and routes them to appropriate agentic workflows.
 * 
 * Triggers: Runs every 5 minutes via pg_cron
 * 
 * Workflow:
 * 1. Fetches all sent POs awaiting vendor responses
 * 2. Checks for new emails in designated purchasing account
 * 3. Classifies responses (tracking, invoice, backorder, etc.)
 * 4. Routes to appropriate agent:
 *    - Air Traffic Controller: Tracking updates
 *    - Document Analyzer: Invoices, packing slips
 *    - Vendor Watchdog: Backorders, delays
 *    - Human Review: Price changes, cancellations, clarifications
 * 
 * Integration: Works with existing gmail-webhook for real-time processing
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface POEmailContext {
  poId: string;
  orderId: string;
  vendorId: string;
  vendorName: string;
  vendorEmail: string;
  sentAt: string;
  expectedDate?: string;
  totalAmount: number;
  status: string;
  lastChecked?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log('[PO Email Monitor] Starting scheduled scan...');
    const startTime = Date.now();

    // Get all POs awaiting vendor responses
    const awaitingPOs = await getAwaitingResponsePOs(supabase);
    console.log(`[PO Email Monitor] Found ${awaitingPOs.length} POs awaiting responses`);

    // Check for new vendor communications that haven't been processed
    const { data: unprocessedComms, error: commsError } = await supabase
      .from('po_vendor_communications')
      .select('*')
      .eq('direction', 'inbound')
      .is('processed_by_monitor', null)
      .order('received_at', { ascending: true })
      .limit(50);

    if (commsError) {
      console.error('[PO Email Monitor] Error fetching communications:', commsError);
      throw commsError;
    }

    console.log(`[PO Email Monitor] Found ${unprocessedComms?.length || 0} unprocessed vendor communications`);

    const results = [];
    let handoffCounts = {
      air_traffic_controller: 0,
      document_analyzer: 0,
      vendor_watchdog: 0,
      human_review: 0,
      auto_handled: 0,
      failed: 0
    };

    // Process each unprocessed communication
    for (const comm of unprocessedComms || []) {
      try {
        const poContext = awaitingPOs.find(po => po.poId === comm.po_id);
        if (!poContext) {
          console.warn(`[PO Email Monitor] PO not found for communication ${comm.id}`);
          continue;
        }

        // Use existing extracted_data from gmail-webhook if available
        const classification = comm.extracted_data || {};
        const responseCategory = comm.response_category || 'other';
        
        // Determine handoff target based on category
        let handoffTo: string;
        if (responseCategory === 'tracking_provided') {
          handoffTo = 'air_traffic_controller';
          handoffCounts.air_traffic_controller++;
        } else if (responseCategory === 'invoice_attached' || responseCategory === 'packing_slip') {
          handoffTo = 'document_analyzer';
          handoffCounts.document_analyzer++;
        } else if (responseCategory === 'backorder_notice' || responseCategory === 'delay_notice') {
          handoffTo = 'vendor_watchdog';
          handoffCounts.vendor_watchdog++;
        } else if (responseCategory === 'question_raised' || responseCategory === 'price_change') {
          handoffTo = 'human_review';
          handoffCounts.human_review++;
        } else if (responseCategory === 'confirmation') {
          handoffTo = 'none';
          handoffCounts.auto_handled++;
        } else {
          handoffTo = 'human_review'; // Default to human review for uncertain cases
          handoffCounts.human_review++;
        }

        // Log the routing decision
        console.log(`[PO Email Monitor] Routing PO ${poContext.orderId} (${responseCategory}) to ${handoffTo}`);

        // Mark communication as processed
        await supabase
          .from('po_vendor_communications')
          .update({
            processed_by_monitor: true,
            monitor_processed_at: new Date().toISOString(),
            monitor_handoff_to: handoffTo
          })
          .eq('id', comm.id);

        // Update PO last checked timestamp
        await supabase
          .from('purchase_orders')
          .update({ last_monitor_check: new Date().toISOString() })
          .eq('id', comm.po_id);

        results.push({
          poId: comm.po_id,
          orderId: poContext.orderId,
          category: responseCategory,
          handoffTo,
          status: 'success'
        });

      } catch (error) {
        console.error('[PO Email Monitor] Error processing communication:', error);
        handoffCounts.failed++;
        results.push({
          poId: comm.po_id,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Update last checked timestamp for POs with no new communications
    const poIdsWithComms = new Set(unprocessedComms?.map(c => c.po_id) || []);
    const poIdsToUpdate = awaitingPOs
      .filter(po => !poIdsWithComms.has(po.poId))
      .map(po => po.poId);

    if (poIdsToUpdate.length > 0) {
      await supabase
        .from('purchase_orders')
        .update({ last_monitor_check: new Date().toISOString() })
        .in('id', poIdsToUpdate);
    }

    const duration = Date.now() - startTime;
    const summary = {
      success: true,
      scanDuration: `${duration}ms`,
      posAwaitingResponse: awaitingPOs.length,
      communicationsProcessed: unprocessedComms?.length || 0,
      handoffCounts,
      results
    };

    console.log('[PO Email Monitor] Scan complete:', JSON.stringify(summary, null, 2));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('[PO Email Monitor] Fatal error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  }
});

async function getAwaitingResponsePOs(supabase: any): Promise<POEmailContext[]> {
  // Get internal POs
  const { data: internalPOs, error: internalError } = await supabase
    .from('purchase_orders')
    .select(`
      id,
      order_id,
      vendor_id,
      supplier_name,
      sent_at,
      estimated_receive_date,
      total_amount,
      status,
      last_monitor_check,
      vendors!inner(email)
    `)
    .not('sent_at', 'is', null)
    .in('status', ['sent', 'confirmed', 'committed'])
    .or('vendor_response_status.is.null,vendor_response_status.eq.pending_response')
    .order('sent_at', { ascending: true })
    .limit(100);

  if (internalError) {
    console.error('[getAwaitingResponsePOs] Internal POs error:', internalError);
    return [];
  }

  // Get Finale POs
  const { data: finalePOs, error: finaleError } = await supabase
    .from('finale_purchase_orders')
    .select(`
      id,
      order_id,
      vendor_id,
      vendor_name,
      sent_at,
      expected_date,
      total,
      status,
      finale_vendors!inner(email)
    `)
    .not('sent_at', 'is', null)
    .in('status', ['SUBMITTED', 'COMMITTED'])
    .order('sent_at', { ascending: true })
    .limit(100);

  if (finaleError) {
    console.error('[getAwaitingResponsePOs] Finale POs error:', finaleError);
  }

  const contexts: POEmailContext[] = [];

  // Process internal POs
  if (internalPOs) {
    contexts.push(...internalPOs.map((po: any) => ({
      poId: po.id,
      orderId: po.order_id,
      vendorId: po.vendor_id,
      vendorName: po.supplier_name || 'Unknown',
      vendorEmail: po.vendors?.email || '',
      sentAt: po.sent_at,
      expectedDate: po.estimated_receive_date,
      totalAmount: po.total_amount || 0,
      status: po.status,
      lastChecked: po.last_monitor_check
    })));
  }

  // Process Finale POs
  if (finalePOs) {
    contexts.push(...finalePOs.map((po: any) => ({
      poId: po.id,
      orderId: po.order_id,
      vendorId: po.vendor_id || '',
      vendorName: po.vendor_name || 'Unknown',
      vendorEmail: po.finale_vendors?.email || '',
      sentAt: po.sent_at,
      expectedDate: po.expected_date,
      totalAmount: po.total || 0,
      status: po.status
    })));
  }

  return contexts;
}
