// Backorder Processor Edge Function
//
// Autonomous processing of partial receipts:
// 1. Find POs with status 'partial' or recent partial receipts
// 2. Run three-way match if invoice exists
// 3. Determine if items need BACKORDER or DISPUTE
// 4. Queue dispute emails with trust-score gating
// 5. Create backorder records for reordering
//
// Called via pg_cron daily at 10am (migration 129)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GMAIL_CLIENT_ID = Deno.env.get('GMAIL_WEBHOOK_CLIENT_ID')!;
const GMAIL_CLIENT_SECRET = Deno.env.get('GMAIL_WEBHOOK_CLIENT_SECRET')!;
const GMAIL_REFRESH_TOKEN = Deno.env.get('GMAIL_WEBHOOK_REFRESH_TOKEN')!;
const GMAIL_WEBHOOK_USER = Deno.env.get('GMAIL_WEBHOOK_USER') || 'me';

// Trust thresholds for email sending
const DISPUTE_EMAIL_TRUST_THRESHOLDS = {
  AUTO_SEND: 0.85,      // ≥85%: Send dispute email immediately
  QUEUE_REVIEW: 0.70,   // 70-85%: Queue for human approval
  DRAFT_ONLY: 0.0,      // <70%: Create draft only
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
    posProcessed: 0,
    backordersCreated: 0,
    disputesCreated: 0,
    emailsSent: 0,
    emailsQueued: 0,
    errors: [] as string[],
    details: [] as any[],
  };

  try {
    console.log('[backorder-processor] Starting autonomous backorder processing');

    // ============================================================
    // 1. FIND POs WITH PARTIAL RECEIPTS NEEDING PROCESSING
    // ============================================================

    const { data: partialPOs, error: poError } = await supabase
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
        received_at
      `)
      .in('status', ['partial', 'PARTIALLY_RECEIVED'])
      .is('three_way_match_status', null)
      .order('received_at', { ascending: true })
      .limit(50);

    if (poError) {
      console.error('[backorder-processor] PO query error:', poError);
      results.errors.push(`PO query: ${poError.message}`);
    }

    console.log(`[backorder-processor] Found ${partialPOs?.length || 0} POs needing processing`);

    // ============================================================
    // 2. PROCESS EACH PO
    // ============================================================

    for (const po of partialPOs || []) {
      results.posProcessed++;

      try {
        // Get PO line items
        const { data: poLines } = await supabase
          .from('purchase_order_line_items')
          .select('*')
          .eq('po_id', po.id);

        // Get receipt records
        const { data: receipts } = await supabase
          .from('po_receipts')
          .select('*')
          .eq('po_id', po.id);

        // Get invoice if exists
        const { data: invoice } = await supabase
          .from('vendor_invoices')
          .select('*')
          .eq('po_id', po.id)
          .maybeSingle();

        // Calculate shortages
        const shortages = calculateShortages(poLines || [], receipts || [], invoice);

        if (shortages.length === 0) {
          // No shortages - mark as matched
          await supabase
            .from('purchase_orders')
            .update({ three_way_match_status: 'matched' })
            .eq('id', po.id);
          continue;
        }

        // Categorize shortages into BACKORDER vs DISPUTE
        const { backorderItems, disputeItems } = categorizeShortages(shortages, invoice);

        // ============================================================
        // 3. CREATE BACKORDER RECORDS
        // ============================================================

        for (const item of backorderItems) {
          const { error: boError } = await supabase
            .from('po_backorders')
            .upsert({
              original_po_id: po.id,
              sku: item.sku,
              product_name: item.productName,
              original_qty_ordered: item.orderedQty,
              qty_received: item.receivedQty,
              shortage_qty: item.shortageQty,
              vendor_id: po.vendor_id,
              vendor_name: po.supplier_name,
              status: 'pending',
              priority: item.willCauseStockout ? 'urgent' : 'normal',
              notes: item.notes,
              auto_reorder_eligible: true,
            }, { onConflict: 'original_po_id,sku' });

          if (!boError) {
            results.backordersCreated++;
          }
        }

        // ============================================================
        // 4. CREATE DISPUTES WITH TRUST-GATED EMAILS
        // ============================================================

        if (disputeItems.length > 0) {
          const disputeValue = disputeItems.reduce((sum, i) => sum + (i.shortageQty * i.unitCost), 0);

          // Get vendor trust score
          const trustScore = await getVendorTrustScore(po.vendor_id);

          // Create dispute record
          const { data: dispute, error: disputeError } = await supabase
            .from('invoice_disputes')
            .insert({
              po_id: po.id,
              vendor_id: po.vendor_id,
              invoice_id: invoice?.id,
              dispute_type: 'shortage',
              disputed_amount: disputeValue,
              status: 'open',
              items: disputeItems.map(i => ({
                sku: i.sku,
                productName: i.productName,
                orderedQty: i.orderedQty,
                receivedQty: i.receivedQty,
                shortageQty: i.shortageQty,
                unitCost: i.unitCost,
                lineValue: i.shortageQty * i.unitCost,
              })),
              auto_generated: true,
              trust_score_at_creation: trustScore,
            })
            .select('id')
            .single();

          if (disputeError) {
            console.error('[backorder-processor] Dispute creation error:', disputeError);
            results.errors.push(`Dispute for PO ${po.order_id}: ${disputeError.message}`);
            continue;
          }

          results.disputesCreated++;

          // ============================================================
          // 5. TRUST-GATED EMAIL SENDING
          // ============================================================

          const vendor = await fetchVendor(po.vendor_id);
          const contactEmail = vendor?.contact_emails?.[0] || vendor?.email;

          if (contactEmail && dispute) {
            const emailContent = buildDisputeEmail(po, disputeItems, disputeValue, dispute.id);

            if (trustScore >= DISPUTE_EMAIL_TRUST_THRESHOLDS.AUTO_SEND) {
              // High trust: Send immediately
              try {
                const gmail = await sendGmailMessage({
                  to: contactEmail,
                  subject: emailContent.subject,
                  body: emailContent.body,
                });

                await supabase
                  .from('invoice_disputes')
                  .update({
                    email_sent_at: new Date().toISOString(),
                    gmail_thread_id: gmail.threadId,
                    gmail_message_id: gmail.id,
                  })
                  .eq('id', dispute.id);

                await recordDisputeEmail(dispute.id, po.id, contactEmail, gmail, emailContent);

                results.emailsSent++;
                console.log(`[backorder-processor] Auto-sent dispute email for PO ${po.order_id} (trust: ${trustScore})`);
              } catch (emailErr) {
                console.error(`[backorder-processor] Email send failed for PO ${po.order_id}:`, emailErr);
                results.errors.push(`Email for PO ${po.order_id}: ${emailErr}`);
              }
            } else if (trustScore >= DISPUTE_EMAIL_TRUST_THRESHOLDS.QUEUE_REVIEW) {
              // Medium trust: Queue for approval
              await supabase
                .from('po_email_drafts')
                .insert({
                  po_id: po.id,
                  po_number: po.order_id,
                  vendor_name: po.supplier_name,
                  vendor_email: contactEmail,
                  subject: emailContent.subject,
                  body: emailContent.body,
                  status: 'pending_approval',
                  trust_score_at_creation: trustScore,
                  requires_review: true,
                  expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
                  attachments: JSON.stringify([{ type: 'dispute', disputeId: dispute.id }]),
                });

              results.emailsQueued++;
              console.log(`[backorder-processor] Queued dispute email for approval: PO ${po.order_id} (trust: ${trustScore})`);
            } else {
              // Low trust: Draft only
              await supabase
                .from('po_email_drafts')
                .insert({
                  po_id: po.id,
                  po_number: po.order_id,
                  vendor_name: po.supplier_name,
                  vendor_email: contactEmail,
                  subject: emailContent.subject,
                  body: emailContent.body,
                  status: 'draft',
                  trust_score_at_creation: trustScore,
                  requires_review: true,
                  attachments: JSON.stringify([{ type: 'dispute', disputeId: dispute.id }]),
                });

              console.log(`[backorder-processor] Created draft dispute email: PO ${po.order_id} (trust: ${trustScore})`);
            }
          }
        }

        // Update PO three-way match status
        const matchStatus = disputeItems.length > 0 ? 'discrepancy' :
                           backorderItems.length > 0 ? 'partial' : 'matched';

        await supabase
          .from('purchase_orders')
          .update({
            three_way_match_status: matchStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', po.id);

        results.details.push({
          poId: po.id,
          orderId: po.order_id,
          backorders: backorderItems.length,
          disputes: disputeItems.length,
          matchStatus,
        });

      } catch (poErr) {
        console.error(`[backorder-processor] Error processing PO ${po.order_id}:`, poErr);
        results.errors.push(`PO ${po.order_id}: ${poErr}`);
      }
    }

    // ============================================================
    // 6. LOG AGENT EXECUTION
    // ============================================================

    await supabase.from('agent_execution_log').insert({
      agent_identifier: 'backorder-processor',
      trigger_type: 'scheduled',
      trigger_value: 'daily-backorder-check',
      status: 'completed',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      findings_count: results.posProcessed,
      actions_proposed: results.backordersCreated + results.disputesCreated,
      actions_executed: results.emailsSent,
      outcome: results.errors.length > 0 ? 'partial' : 'success',
      output: results,
    });

    console.log('[backorder-processor] Completed:', results);

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[backorder-processor] Fatal error:', error);
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
// HELPER FUNCTIONS
// ============================================================

interface ShortageItem {
  sku: string;
  productName: string;
  orderedQty: number;
  receivedQty: number;
  shortageQty: number;
  unitCost: number;
  invoiceChargedQty?: number;
  willCauseStockout?: boolean;
  notes?: string;
}

function calculateShortages(
  poLines: any[],
  receipts: any[],
  invoice: any | null
): ShortageItem[] {
  const shortages: ShortageItem[] = [];

  // Build receipt totals by SKU
  const receivedBySku = new Map<string, number>();
  for (const receipt of receipts) {
    const current = receivedBySku.get(receipt.sku) || 0;
    receivedBySku.set(receipt.sku, current + (receipt.quantity_received || 0));
  }

  // Build invoice quantities by SKU if invoice exists
  const invoicedBySku = new Map<string, number>();
  if (invoice?.line_items) {
    for (const line of invoice.line_items) {
      invoicedBySku.set(line.sku, line.quantity || 0);
    }
  }

  // Compare ordered vs received
  for (const line of poLines) {
    const ordered = line.quantity || 0;
    const received = receivedBySku.get(line.sku) || 0;
    const shortage = ordered - received;

    if (shortage > 0) {
      shortages.push({
        sku: line.sku,
        productName: line.product_name || line.description || line.sku,
        orderedQty: ordered,
        receivedQty: received,
        shortageQty: shortage,
        unitCost: line.unit_cost || line.unit_price || 0,
        invoiceChargedQty: invoicedBySku.get(line.sku),
      });
    }
  }

  return shortages;
}

function categorizeShortages(
  shortages: ShortageItem[],
  invoice: any | null
): { backorderItems: ShortageItem[]; disputeItems: ShortageItem[] } {
  const backorderItems: ShortageItem[] = [];
  const disputeItems: ShortageItem[] = [];

  for (const item of shortages) {
    // If invoice exists and charged for items not received → DISPUTE
    if (invoice && item.invoiceChargedQty !== undefined) {
      const chargedButNotReceived = (item.invoiceChargedQty || 0) - item.receivedQty;

      if (chargedButNotReceived > 0) {
        // Vendor charged for items we didn't receive
        disputeItems.push({
          ...item,
          shortageQty: chargedButNotReceived,
          notes: `Charged for ${item.invoiceChargedQty} but only received ${item.receivedQty}`,
        });

        // Remaining shortage (not charged) goes to backorder
        const remainingShortage = item.shortageQty - chargedButNotReceived;
        if (remainingShortage > 0) {
          backorderItems.push({
            ...item,
            shortageQty: remainingShortage,
            notes: 'Partial backorder - not charged on invoice',
          });
        }
      } else {
        // Not charged for missing items → simple backorder
        backorderItems.push({
          ...item,
          notes: 'Not charged on invoice - backorder needed',
        });
      }
    } else {
      // No invoice yet → assume backorder
      backorderItems.push({
        ...item,
        notes: 'Invoice not yet received - pending backorder',
      });
    }
  }

  return { backorderItems, disputeItems };
}

async function getVendorTrustScore(vendorId: string | null): Promise<number> {
  if (!vendorId) return 0.5; // Default moderate trust

  const { data: vendor } = await supabase
    .from('vendors')
    .select('trust_score, email_response_rate, on_time_delivery_rate')
    .eq('id', vendorId)
    .maybeSingle();

  if (!vendor) return 0.5;

  // Combine multiple trust signals
  const trustScore = vendor.trust_score || 0.7;
  const responseRate = vendor.email_response_rate || 0.5;
  const deliveryRate = vendor.on_time_delivery_rate || 0.7;

  // Weighted average
  return trustScore * 0.5 + responseRate * 0.25 + deliveryRate * 0.25;
}

async function fetchVendor(vendorId: string | null) {
  if (!vendorId) return null;

  const { data } = await supabase
    .from('vendors')
    .select('id, name, contact_emails, primary_contact_email, billing_email')
    .eq('id', vendorId)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    contact_emails: data.contact_emails || (data.primary_contact_email ? [data.primary_contact_email] : []),
    email: data.primary_contact_email,
    billing_email: data.billing_email,
  };
}

function buildDisputeEmail(
  po: any,
  disputeItems: ShortageItem[],
  disputeValue: number,
  disputeId: string
): { subject: string; body: string } {
  const itemLines = disputeItems.map(item =>
    `  - ${item.sku}: Ordered ${item.orderedQty}, Received ${item.receivedQty}, ` +
    `Shortage: ${item.shortageQty} @ $${item.unitCost.toFixed(2)} = $${(item.shortageQty * item.unitCost).toFixed(2)}`
  ).join('\n');

  const subject = `Invoice Discrepancy - PO ${po.order_id} - Credit Request $${disputeValue.toFixed(2)}`;

  const body = `Dear ${po.supplier_name || 'Vendor'},

We have identified a discrepancy on PO ${po.order_id} that requires resolution.

DISCREPANCY DETAILS:
${itemLines}

TOTAL CREDIT REQUESTED: $${disputeValue.toFixed(2)}

We were charged for items that were not included in the shipment. Please review and respond with one of the following:

1. ISSUE CREDIT - Confirm credit memo for $${disputeValue.toFixed(2)}
2. SHIP ITEMS - Provide tracking for the missing items
3. DISPUTE - Provide documentation showing items were shipped

Please reply directly to this email thread. Our system will automatically process your response.

Reference: DISPUTE-${disputeId.slice(0, 8).toUpperCase()}

Thank you for your prompt attention to this matter.

— MuRP Purchasing`;

  return { subject, body };
}

async function sendGmailMessage(options: { to: string; subject: string; body: string }) {
  const accessToken = await getGmailAccessToken();
  const rawMessage = buildGmailMime(options);

  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(GMAIL_WEBHOOK_USER)}/messages/send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: rawMessage }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gmail send failed: ${response.status} ${text}`);
  }

  return await response.json();
}

async function getGmailAccessToken(): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh Gmail token (${response.status})`);
  }

  const data = await response.json();
  return data.access_token;
}

function buildGmailMime(options: { to: string; subject: string; body: string }) {
  const headers = [
    `To: ${options.to}`,
    `Subject: ${options.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
  ];
  const message = `${headers.join('\n')}${options.body}`;
  return btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function recordDisputeEmail(
  disputeId: string,
  poId: string,
  vendorEmail: string,
  gmail: any,
  content: { subject: string; body: string }
) {
  await supabase.from('po_vendor_communications').upsert(
    {
      po_id: poId,
      communication_type: 'dispute',
      direction: 'outbound',
      gmail_message_id: gmail.id,
      gmail_thread_id: gmail.threadId,
      subject: content.subject,
      body_preview: content.body.slice(0, 800),
      recipient_email: vendorEmail,
      sent_at: new Date().toISOString(),
      metadata: { disputeId, auto: true },
    },
    { onConflict: 'gmail_message_id' }
  );
}
