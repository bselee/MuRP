// Three-Way Match Runner Edge Function
//
// Autonomous PO/Invoice/Receipt verification:
// 1. Find POs with invoices that need three-way matching
// 2. Compare PO quantities vs Invoice amounts vs Receipt quantities
// 3. Apply tolerance thresholds and flag discrepancies
// 4. Auto-approve clean matches for payment
// 5. Queue discrepancies for review or dispute processing
//
// Called via pg_cron or triggered when invoice is detected

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Default tolerance thresholds
const DEFAULT_THRESHOLDS = {
  quantityTolerancePercent: 2,   // 2% quantity variance allowed
  priceToleranceDollars: 0.50,  // $0.50 price variance per unit allowed
  totalTolerancePercent: 1,      // 1% total variance allowed
  minMatchScoreForApproval: 95,  // 95% match score for auto-approval
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  const results = {
    success: true,
    timestamp: new Date().toISOString(),
    posChecked: 0,
    matchesCompleted: 0,
    autoApproved: 0,
    discrepanciesFound: 0,
    errors: [] as string[],
    details: [] as any[],
  };

  try {
    console.log('[three-way-match-runner] Starting three-way match processing');

    // Check for specific PO ID in request body (for triggered runs)
    let specificPoId: string | null = null;
    try {
      const body = await req.json();
      specificPoId = body?.poId || null;
    } catch {
      // No body or invalid JSON - process all pending
    }

    // ============================================================
    // 1. FIND POs NEEDING THREE-WAY MATCH
    // ============================================================

    let query = supabase
      .from('purchase_orders')
      .select(`
        id,
        order_id,
        vendor_id,
        supplier_name,
        status,
        total_amount,
        invoice_detected_at,
        invoice_amount,
        three_way_match_status,
        payment_approved
      `)
      .not('invoice_detected_at', 'is', null)  // Has invoice
      .or('three_way_match_status.is.null,three_way_match_status.eq.pending');

    if (specificPoId) {
      query = query.eq('id', specificPoId);
    } else {
      query = query.limit(50);
    }

    const { data: posToMatch, error: poError } = await query;

    if (poError) {
      console.error('[three-way-match-runner] PO query error:', poError);
      results.errors.push(`PO query: ${poError.message}`);
    }

    console.log(`[three-way-match-runner] Found ${posToMatch?.length || 0} POs to match`);

    // ============================================================
    // 2. PERFORM THREE-WAY MATCH FOR EACH PO
    // ============================================================

    for (const po of posToMatch || []) {
      results.posChecked++;

      try {
        const matchResult = await performThreeWayMatch(po);
        results.matchesCompleted++;

        // Store match result
        const { error: matchError } = await supabase
          .from('po_three_way_matches')
          .upsert({
            po_id: po.id,
            po_number: po.order_id,
            invoice_id: matchResult.invoiceId,
            po_total: matchResult.poTotal,
            invoice_total: matchResult.invoiceTotal,
            receipt_total: matchResult.receiptTotal,
            match_score: matchResult.score,
            status: matchResult.status,
            discrepancies: matchResult.discrepancies,
            line_item_matches: matchResult.lineMatches,
            auto_approved: matchResult.autoApproved,
            matched_at: new Date().toISOString(),
          }, { onConflict: 'po_id' });

        if (matchError) {
          console.error('[three-way-match-runner] Match upsert error:', matchError);
          results.errors.push(`Match for PO ${po.order_id}: ${matchError.message}`);
          continue;
        }

        // Update PO status
        await supabase
          .from('purchase_orders')
          .update({
            three_way_match_status: matchResult.status,
            three_way_match_score: matchResult.score,
            invoice_verified: matchResult.invoiceVerified,
            payment_approved: matchResult.autoApproved ? true : po.payment_approved,
            updated_at: new Date().toISOString(),
          })
          .eq('id', po.id);

        if (matchResult.autoApproved) {
          results.autoApproved++;
          console.log(`[three-way-match-runner] Auto-approved PO ${po.order_id} (score: ${matchResult.score}%)`);
        }

        if (matchResult.discrepancies.length > 0) {
          results.discrepanciesFound++;
        }

        results.details.push({
          poId: po.id,
          orderId: po.order_id,
          score: matchResult.score,
          status: matchResult.status,
          autoApproved: matchResult.autoApproved,
          discrepancies: matchResult.discrepancies.length,
        });

      } catch (matchErr) {
        console.error(`[three-way-match-runner] Error matching PO ${po.order_id}:`, matchErr);
        results.errors.push(`PO ${po.order_id}: ${matchErr}`);
      }
    }

    // ============================================================
    // 3. LOG AGENT EXECUTION
    // ============================================================

    await supabase.from('agent_execution_log').insert({
      agent_identifier: 'three-way-match-runner',
      trigger_type: specificPoId ? 'event' : 'scheduled',
      trigger_value: specificPoId ? `invoice.detected:${specificPoId}` : 'hourly-match-check',
      status: 'completed',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      findings_count: results.posChecked,
      actions_proposed: results.discrepanciesFound,
      actions_executed: results.autoApproved,
      outcome: results.errors.length > 0 ? 'partial' : 'success',
      output: results,
    });

    console.log('[three-way-match-runner] Completed:', results);

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[three-way-match-runner] Fatal error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startTime,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ============================================================
// THREE-WAY MATCH LOGIC
// ============================================================

interface MatchResult {
  score: number;
  status: 'matched' | 'partial' | 'discrepancy' | 'pending';
  autoApproved: boolean;
  invoiceVerified: boolean;
  invoiceId: string | null;
  poTotal: number;
  invoiceTotal: number;
  receiptTotal: number;
  discrepancies: Discrepancy[];
  lineMatches: LineItemMatch[];
}

interface Discrepancy {
  type: 'quantity' | 'price' | 'total' | 'missing_item';
  sku?: string;
  expected: number;
  actual: number;
  variance: number;
  severity: 'minor' | 'major' | 'critical';
}

interface LineItemMatch {
  sku: string;
  productName: string;
  poQty: number;
  invoiceQty: number;
  receivedQty: number;
  poUnitPrice: number;
  invoiceUnitPrice: number;
  qtyMatch: boolean;
  priceMatch: boolean;
}

async function performThreeWayMatch(po: any): Promise<MatchResult> {
  // Get PO line items
  const { data: poLines } = await supabase
    .from('purchase_order_line_items')
    .select('*')
    .eq('po_id', po.id);

  // Get invoice
  const { data: invoice } = await supabase
    .from('vendor_invoices')
    .select('*')
    .eq('po_id', po.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Get receipts
  const { data: receipts } = await supabase
    .from('po_receipts')
    .select('*')
    .eq('po_id', po.id);

  // Build lookup maps
  const poLinesBySku = new Map<string, any>();
  let poTotal = 0;
  for (const line of poLines || []) {
    poLinesBySku.set(line.sku, line);
    poTotal += (line.quantity || 0) * (line.unit_cost || line.unit_price || 0);
  }

  const invoiceLinesBySku = new Map<string, any>();
  let invoiceTotal = 0;
  if (invoice?.line_items) {
    for (const line of invoice.line_items) {
      invoiceLinesBySku.set(line.sku, line);
      invoiceTotal += (line.quantity || 0) * (line.unit_price || 0);
    }
  }
  invoiceTotal = invoice?.total_amount || invoiceTotal;

  const receivedBySku = new Map<string, number>();
  let receiptTotal = 0;
  for (const receipt of receipts || []) {
    const current = receivedBySku.get(receipt.sku) || 0;
    receivedBySku.set(receipt.sku, current + (receipt.quantity_received || 0));
  }

  // Calculate receipt total based on PO unit prices
  for (const [sku, qty] of receivedBySku) {
    const poLine = poLinesBySku.get(sku);
    if (poLine) {
      receiptTotal += qty * (poLine.unit_cost || poLine.unit_price || 0);
    }
  }

  // Perform line-by-line matching
  const lineMatches: LineItemMatch[] = [];
  const discrepancies: Discrepancy[] = [];
  const allSkus = new Set([...poLinesBySku.keys(), ...invoiceLinesBySku.keys()]);

  let matchingLines = 0;
  let totalLines = 0;

  for (const sku of allSkus) {
    const poLine = poLinesBySku.get(sku);
    const invoiceLine = invoiceLinesBySku.get(sku);
    const receivedQty = receivedBySku.get(sku) || 0;

    if (!poLine && invoiceLine) {
      // Item on invoice but not on PO
      discrepancies.push({
        type: 'missing_item',
        sku,
        expected: 0,
        actual: invoiceLine.quantity || 0,
        variance: invoiceLine.quantity || 0,
        severity: 'critical',
      });
      continue;
    }

    if (!invoiceLine && poLine) {
      // Item on PO but not on invoice - might be OK if not received
      if (receivedQty > 0) {
        discrepancies.push({
          type: 'missing_item',
          sku,
          expected: poLine.quantity || 0,
          actual: 0,
          variance: -(poLine.quantity || 0),
          severity: 'major',
        });
      }
      continue;
    }

    if (!poLine || !invoiceLine) continue;

    totalLines++;

    const poQty = poLine.quantity || 0;
    const invoiceQty = invoiceLine.quantity || 0;
    const poUnitPrice = poLine.unit_cost || poLine.unit_price || 0;
    const invoiceUnitPrice = invoiceLine.unit_price || 0;

    // Check quantity match
    const qtyVariance = Math.abs(invoiceQty - poQty);
    const qtyVariancePercent = poQty > 0 ? (qtyVariance / poQty) * 100 : 100;
    const qtyMatch = qtyVariancePercent <= DEFAULT_THRESHOLDS.quantityTolerancePercent;

    if (!qtyMatch) {
      discrepancies.push({
        type: 'quantity',
        sku,
        expected: poQty,
        actual: invoiceQty,
        variance: invoiceQty - poQty,
        severity: qtyVariancePercent > 10 ? 'critical' : qtyVariancePercent > 5 ? 'major' : 'minor',
      });
    }

    // Check price match
    const priceVariance = Math.abs(invoiceUnitPrice - poUnitPrice);
    const priceMatch = priceVariance <= DEFAULT_THRESHOLDS.priceToleranceDollars;

    if (!priceMatch) {
      discrepancies.push({
        type: 'price',
        sku,
        expected: poUnitPrice,
        actual: invoiceUnitPrice,
        variance: invoiceUnitPrice - poUnitPrice,
        severity: priceVariance > 5 ? 'critical' : priceVariance > 2 ? 'major' : 'minor',
      });
    }

    if (qtyMatch && priceMatch) {
      matchingLines++;
    }

    lineMatches.push({
      sku,
      productName: poLine.product_name || poLine.description || sku,
      poQty,
      invoiceQty,
      receivedQty,
      poUnitPrice,
      invoiceUnitPrice,
      qtyMatch,
      priceMatch,
    });
  }

  // Check total match
  const totalVariance = Math.abs(invoiceTotal - poTotal);
  const totalVariancePercent = poTotal > 0 ? (totalVariance / poTotal) * 100 : 100;

  if (totalVariancePercent > DEFAULT_THRESHOLDS.totalTolerancePercent) {
    discrepancies.push({
      type: 'total',
      expected: poTotal,
      actual: invoiceTotal,
      variance: invoiceTotal - poTotal,
      severity: totalVariancePercent > 5 ? 'critical' : totalVariancePercent > 2 ? 'major' : 'minor',
    });
  }

  // Calculate match score
  const lineScore = totalLines > 0 ? (matchingLines / totalLines) * 100 : 100;
  const totalScore = 100 - Math.min(totalVariancePercent * 10, 50);
  const score = Math.round((lineScore * 0.7 + totalScore * 0.3));

  // Determine status
  const criticalDiscrepancies = discrepancies.filter(d => d.severity === 'critical');
  const majorDiscrepancies = discrepancies.filter(d => d.severity === 'major');

  let status: MatchResult['status'];
  if (criticalDiscrepancies.length > 0) {
    status = 'discrepancy';
  } else if (majorDiscrepancies.length > 0) {
    status = 'partial';
  } else if (discrepancies.length > 0) {
    status = 'partial';
  } else {
    status = 'matched';
  }

  // Auto-approve if score is high enough and no critical issues
  const autoApproved = status === 'matched' &&
    score >= DEFAULT_THRESHOLDS.minMatchScoreForApproval &&
    criticalDiscrepancies.length === 0;

  return {
    score,
    status,
    autoApproved,
    invoiceVerified: status === 'matched',
    invoiceId: invoice?.id || null,
    poTotal,
    invoiceTotal,
    receiptTotal,
    discrepancies,
    lineMatches,
  };
}
