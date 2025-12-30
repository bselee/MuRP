/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INVOICE EXTRACTION SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Extracts structured data from invoice documents (PDF, images) using:
 * 1. AI Vision (Claude/GPT-4V) for complex invoices
 * 2. Regex patterns for simple/standard formats
 *
 * Flow:
 * 1. Invoice detected in email → stored in vendor_invoice_documents
 * 2. This service extracts: invoice#, date, amounts, line items
 * 3. Matches to PO using vendor + date + amount heuristics
 * 4. Calculates variances (shipping, tax, total)
 * 5. Queues for human review if variances detected
 *
 * Storage: Invoices stored in Supabase Storage bucket 'invoices'
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface ExtractedInvoiceData {
  invoice_number: string | null;
  invoice_date: string | null; // ISO date
  due_date: string | null;

  // Vendor info
  vendor_name: string | null;
  vendor_address: string | null;

  // Amounts
  subtotal: number | null;
  tax_amount: number | null;
  shipping_amount: number | null;
  total_amount: number | null;
  currency: string;

  // Line items
  line_items: InvoiceLineItem[];

  // PO reference (if found on invoice)
  po_reference: string | null;

  // Extraction metadata
  confidence: number;
  extraction_method: 'ai_vision' | 'regex' | 'manual';
  raw_text?: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
  sku?: string;
}

export interface InvoiceExtractionResult {
  success: boolean;
  data?: ExtractedInvoiceData;
  error?: string;
  warnings?: string[];
}

export interface InvoiceVariance {
  type: 'shipping' | 'tax' | 'subtotal' | 'total' | 'line_item';
  description: string;
  po_amount: number;
  invoice_amount: number;
  difference: number;
  severity: 'info' | 'warning' | 'critical';
  action_required: boolean;
}

export interface POUpdateRecommendation {
  action: 'update_shipping' | 'update_tax' | 'mark_no_shipping' | 'adjust_total' | 'review_required';
  field?: string;
  old_value?: number | null;
  new_value?: number;
  reason: string;
  auto_apply: boolean; // Can be auto-applied without human review
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Extraction Function
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract data from an invoice document
 * @param invoiceDocId - UUID of vendor_invoice_documents record
 * @param attachmentData - Raw attachment bytes (optional, will fetch if not provided)
 */
export async function extractInvoiceData(
  invoiceDocId: string,
  attachmentData?: Uint8Array
): Promise<InvoiceExtractionResult> {
  try {
    // Get invoice document record
    const { data: invoiceDoc, error: docError } = await supabase
      .from('vendor_invoice_documents')
      .select('*, email_attachments!attachment_id(*)')
      .eq('id', invoiceDocId)
      .single();

    if (docError || !invoiceDoc) {
      return { success: false, error: `Invoice document not found: ${docError?.message}` };
    }

    // Get attachment info
    const attachment = invoiceDoc.email_attachments;
    if (!attachment && !attachmentData) {
      return { success: false, error: 'No attachment data available' };
    }

    // Determine extraction method based on file type and AI availability
    const mimeType = attachment?.mime_type || 'application/pdf';
    const filename = attachment?.filename || 'invoice.pdf';

    let extractedData: ExtractedInvoiceData | null = null;
    let extractionMethod: 'ai_vision' | 'regex' | 'manual' = 'regex';

    // Try AI extraction first if enabled
    const aiEnabled = await isAIExtractionEnabled();

    if (aiEnabled && (mimeType === 'application/pdf' || mimeType.startsWith('image/'))) {
      try {
        const aiResult = await extractWithAI(invoiceDocId, attachmentData);
        if (aiResult.success && aiResult.data) {
          extractedData = aiResult.data;
          extractionMethod = 'ai_vision';
        }
      } catch (aiError) {
        console.warn('[invoiceExtractionService] AI extraction failed, falling back to regex:', aiError);
      }
    }

    // Fall back to regex extraction if AI failed or unavailable
    if (!extractedData) {
      const regexResult = await extractWithRegex(invoiceDocId);
      if (regexResult.success && regexResult.data) {
        extractedData = regexResult.data;
        extractionMethod = 'regex';
      }
    }

    if (!extractedData) {
      // Mark for manual extraction
      await supabase
        .from('vendor_invoice_documents')
        .update({
          status: 'manual',
          extraction_method: 'manual',
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceDocId);

      return {
        success: false,
        error: 'Could not extract invoice data automatically. Manual entry required.',
      };
    }

    // Update invoice document with extracted data
    const { error: updateError } = await supabase
      .from('vendor_invoice_documents')
      .update({
        invoice_number: extractedData.invoice_number,
        invoice_date: extractedData.invoice_date,
        due_date: extractedData.due_date,
        vendor_name_on_invoice: extractedData.vendor_name,
        vendor_address: extractedData.vendor_address,
        subtotal: extractedData.subtotal,
        tax_amount: extractedData.tax_amount,
        shipping_amount: extractedData.shipping_amount,
        total_amount: extractedData.total_amount,
        currency: extractedData.currency,
        line_items: extractedData.line_items,
        extraction_method: extractionMethod,
        extraction_confidence: extractedData.confidence,
        raw_extraction: extractedData,
        status: 'pending_match',
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoiceDocId);

    if (updateError) {
      console.error('[invoiceExtractionService] Failed to update invoice:', updateError);
    }

    // Try to match to PO
    await matchInvoiceToPO(invoiceDocId);

    return {
      success: true,
      data: extractedData,
    };

  } catch (error) {
    console.error('[invoiceExtractionService] Extraction error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown extraction error',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI Vision Extraction (Claude/GPT-4V)
// ═══════════════════════════════════════════════════════════════════════════

async function extractWithAI(
  invoiceDocId: string,
  _attachmentData?: Uint8Array
): Promise<InvoiceExtractionResult> {
  // Call edge function for AI extraction (keeps API keys server-side)
  const { data, error } = await supabase.functions.invoke('invoice-extractor', {
    body: { invoice_id: invoiceDocId },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data?.success) {
    return { success: false, error: data?.error || 'AI extraction failed' };
  }

  return {
    success: true,
    data: data.extracted_data,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Regex-based Extraction (fallback)
// ═══════════════════════════════════════════════════════════════════════════

async function extractWithRegex(invoiceDocId: string): Promise<InvoiceExtractionResult> {
  // Get any text content we have (from email body or previous OCR)
  const { data: invoiceDoc } = await supabase
    .from('vendor_invoice_documents')
    .select('raw_extraction, email_threads!email_thread_id(email_thread_messages(body_preview))')
    .eq('id', invoiceDocId)
    .single();

  if (!invoiceDoc) {
    return { success: false, error: 'Invoice document not found' };
  }

  // Try to get text from email body
  const emailText = invoiceDoc.email_threads?.email_thread_messages?.[0]?.body_preview || '';
  const rawText = invoiceDoc.raw_extraction?.raw_text || emailText;

  if (!rawText || rawText.length < 20) {
    return { success: false, error: 'No text content available for regex extraction' };
  }

  const extracted: ExtractedInvoiceData = {
    invoice_number: null,
    invoice_date: null,
    due_date: null,
    vendor_name: null,
    vendor_address: null,
    subtotal: null,
    tax_amount: null,
    shipping_amount: null,
    total_amount: null,
    currency: 'USD',
    line_items: [],
    po_reference: null,
    confidence: 0.5,
    extraction_method: 'regex',
    raw_text: rawText,
  };

  // Invoice number patterns
  const invoicePatterns = [
    /invoice\s*#?\s*:?\s*([A-Z0-9-]+)/i,
    /inv\s*#?\s*:?\s*([A-Z0-9-]+)/i,
    /invoice\s+number\s*:?\s*([A-Z0-9-]+)/i,
  ];
  for (const pattern of invoicePatterns) {
    const match = rawText.match(pattern);
    if (match) {
      extracted.invoice_number = match[1];
      break;
    }
  }

  // PO reference patterns
  const poPatterns = [
    /PO\s*#?\s*:?\s*(\d{4,})/i,
    /purchase\s*order\s*#?\s*:?\s*(\d{4,})/i,
    /reference\s*:?\s*PO[-\s]?(\d{4,})/i,
  ];
  for (const pattern of poPatterns) {
    const match = rawText.match(pattern);
    if (match) {
      extracted.po_reference = match[1];
      break;
    }
  }

  // Date patterns
  const datePatterns = [
    /invoice\s*date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  ];
  for (const pattern of datePatterns) {
    const match = rawText.match(pattern);
    if (match) {
      extracted.invoice_date = parseDate(match[1]);
      break;
    }
  }

  // Amount patterns
  const totalPatterns = [
    /total\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    /amount\s*due\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    /balance\s*due\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    /grand\s*total\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
  ];
  for (const pattern of totalPatterns) {
    const match = rawText.match(pattern);
    if (match) {
      extracted.total_amount = parseAmount(match[1]);
      break;
    }
  }

  // Tax patterns
  const taxPatterns = [
    /tax\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    /sales\s*tax\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    /vat\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
  ];
  for (const pattern of taxPatterns) {
    const match = rawText.match(pattern);
    if (match) {
      extracted.tax_amount = parseAmount(match[1]);
      break;
    }
  }

  // Shipping patterns
  const shippingPatterns = [
    /shipping\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    /freight\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    /delivery\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    /s\s*&\s*h\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
  ];
  for (const pattern of shippingPatterns) {
    const match = rawText.match(pattern);
    if (match) {
      extracted.shipping_amount = parseAmount(match[1]);
      break;
    }
  }

  // Subtotal patterns
  const subtotalPatterns = [
    /subtotal\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    /sub\s*-?\s*total\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
  ];
  for (const pattern of subtotalPatterns) {
    const match = rawText.match(pattern);
    if (match) {
      extracted.subtotal = parseAmount(match[1]);
      break;
    }
  }

  // Calculate confidence based on what we found
  let fieldsFound = 0;
  if (extracted.invoice_number) fieldsFound++;
  if (extracted.invoice_date) fieldsFound++;
  if (extracted.total_amount) fieldsFound++;
  if (extracted.po_reference) fieldsFound++;

  extracted.confidence = Math.min(0.3 + (fieldsFound * 0.15), 0.75);

  // Must have at least invoice number or total to be useful
  if (!extracted.invoice_number && !extracted.total_amount) {
    return { success: false, error: 'Could not extract invoice number or total amount' };
  }

  return { success: true, data: extracted };
}

// ═══════════════════════════════════════════════════════════════════════════
// PO Matching & Variance Calculation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Match an invoice to a PO and calculate variances
 */
export async function matchInvoiceToPO(invoiceDocId: string): Promise<{
  matched: boolean;
  poId?: string;
  variances?: InvoiceVariance[];
  recommendations?: POUpdateRecommendation[];
}> {
  // Call the database function to match
  const { data: matchResult, error } = await supabase
    .rpc('match_invoice_to_po', { p_invoice_id: invoiceDocId });

  if (error) {
    console.error('[invoiceExtractionService] PO match error:', error);
    return { matched: false };
  }

  if (!matchResult || matchResult.length === 0) {
    // No match found - update status
    await supabase
      .from('vendor_invoice_documents')
      .update({
        status: 'pending_match',
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoiceDocId);

    return { matched: false };
  }

  const match = matchResult[0];

  // Update invoice with match
  await supabase
    .from('vendor_invoice_documents')
    .update({
      matched_po_id: match.po_id,
      po_match_confidence: match.confidence,
      po_match_method: match.match_method,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceDocId);

  // Calculate variances
  const { data: varianceResult } = await supabase
    .rpc('process_invoice_variances', { p_invoice_id: invoiceDocId });

  const variances: InvoiceVariance[] = varianceResult?.variances || [];

  // Generate recommendations
  const recommendations = generatePOUpdateRecommendations(variances, invoiceDocId);

  // Update status based on variances
  const hasVariances = variances.length > 0;
  await supabase
    .from('vendor_invoice_documents')
    .update({
      status: hasVariances ? 'variance_detected' : 'pending_review',
      has_variances: hasVariances,
      variance_summary: variances,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceDocId);

  return {
    matched: true,
    poId: match.po_id,
    variances,
    recommendations,
  };
}

/**
 * Generate recommendations for PO updates based on variances
 */
function generatePOUpdateRecommendations(
  variances: InvoiceVariance[],
  _invoiceDocId: string
): POUpdateRecommendation[] {
  const recommendations: POUpdateRecommendation[] = [];

  for (const variance of variances) {
    switch (variance.type) {
      case 'shipping':
        if (variance.po_amount === 0 && variance.invoice_amount > 0) {
          // PO had no shipping, invoice has shipping
          recommendations.push({
            action: 'update_shipping',
            field: 'shipping_cost',
            old_value: 0,
            new_value: variance.invoice_amount,
            reason: `Invoice includes shipping charge of $${variance.invoice_amount.toFixed(2)}`,
            auto_apply: variance.invoice_amount < 50, // Auto-apply small shipping charges
          });
        } else if (variance.invoice_amount === 0 && variance.po_amount > 0) {
          // Invoice has no shipping but PO expected it
          recommendations.push({
            action: 'mark_no_shipping',
            field: 'shipping_cost',
            old_value: variance.po_amount,
            new_value: 0,
            reason: 'Invoice shows no shipping charge - mark PO as no shipping',
            auto_apply: false, // Needs review
          });
        } else {
          // Shipping amount differs
          recommendations.push({
            action: 'update_shipping',
            field: 'shipping_cost',
            old_value: variance.po_amount,
            new_value: variance.invoice_amount,
            reason: `Shipping differs: PO has $${variance.po_amount.toFixed(2)}, invoice has $${variance.invoice_amount.toFixed(2)}`,
            auto_apply: false,
          });
        }
        break;

      case 'tax':
        if (variance.po_amount === 0 && variance.invoice_amount > 0) {
          // PO had no tax, invoice has tax
          recommendations.push({
            action: 'update_tax',
            field: 'tax_amount',
            old_value: 0,
            new_value: variance.invoice_amount,
            reason: `Invoice includes tax of $${variance.invoice_amount.toFixed(2)}`,
            auto_apply: true, // Tax is usually straightforward
          });
        } else if (Math.abs(variance.difference) > 0.01) {
          recommendations.push({
            action: 'update_tax',
            field: 'tax_amount',
            old_value: variance.po_amount,
            new_value: variance.invoice_amount,
            reason: `Tax differs: PO has $${variance.po_amount.toFixed(2)}, invoice has $${variance.invoice_amount.toFixed(2)}`,
            auto_apply: Math.abs(variance.difference) < 10, // Auto-apply small differences
          });
        }
        break;

      case 'total':
        if (variance.severity === 'critical') {
          // Large total difference - needs review
          recommendations.push({
            action: 'review_required',
            field: 'total',
            old_value: variance.po_amount,
            new_value: variance.invoice_amount,
            reason: `Total differs significantly: PO $${variance.po_amount.toFixed(2)} vs Invoice $${variance.invoice_amount.toFixed(2)} (${((variance.difference / variance.po_amount) * 100).toFixed(1)}% difference)`,
            auto_apply: false,
          });
        } else {
          recommendations.push({
            action: 'adjust_total',
            field: 'total',
            old_value: variance.po_amount,
            new_value: variance.invoice_amount,
            reason: `Total adjusted from $${variance.po_amount.toFixed(2)} to $${variance.invoice_amount.toFixed(2)}`,
            auto_apply: Math.abs(variance.difference) < 20, // Auto-apply small differences
          });
        }
        break;
    }
  }

  return recommendations;
}

// ═══════════════════════════════════════════════════════════════════════════
// PO Update Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply invoice data to PO (shipping, tax adjustments)
 */
export async function applyInvoiceToPO(
  invoiceDocId: string,
  options: {
    updateShipping?: boolean;
    updateTax?: boolean;
    markComplete?: boolean;
  } = {}
): Promise<{ success: boolean; error?: string; updates?: Record<string, unknown> }> {
  try {
    // Get invoice with matched PO
    const { data: invoice, error: invoiceError } = await supabase
      .from('vendor_invoice_documents')
      .select('*')
      .eq('id', invoiceDocId)
      .single();

    if (invoiceError || !invoice) {
      return { success: false, error: 'Invoice not found' };
    }

    if (!invoice.matched_po_id) {
      return { success: false, error: 'Invoice not matched to a PO' };
    }

    const updates: Record<string, unknown> = {};

    // Update shipping if requested
    if (options.updateShipping && invoice.shipping_amount !== null) {
      updates.shipping_cost = invoice.shipping_amount;
    }

    // Update tax if requested
    if (options.updateTax && invoice.tax_amount !== null) {
      updates.tax_amount = invoice.tax_amount;
    }

    // Mark as invoice received
    updates.invoice_received = true;
    updates.invoice_received_at = new Date().toISOString();
    updates.invoice_number = invoice.invoice_number;

    // Calculate new total if we updated shipping or tax
    if (updates.shipping_cost !== undefined || updates.tax_amount !== undefined) {
      // Get current PO
      const { data: po } = await supabase
        .from('finale_purchase_orders')
        .select('subtotal, shipping_cost, tax_amount')
        .eq('id', invoice.matched_po_id)
        .single();

      if (po) {
        const newSubtotal = po.subtotal || invoice.subtotal || 0;
        const newShipping = (updates.shipping_cost as number) ?? po.shipping_cost ?? 0;
        const newTax = (updates.tax_amount as number) ?? po.tax_amount ?? 0;
        updates.total = newSubtotal + newShipping + newTax;
      }
    }

    // Update PO - try finale_purchase_orders first
    const { data: finaleUpdated, error: finaleError } = await supabase
      .from('finale_purchase_orders')
      .update(updates)
      .eq('id', invoice.matched_po_id)
      .select('id')
      .single();

    if (finaleError || !finaleUpdated) {
      // Try purchase_orders table
      const { error: poError } = await supabase
        .from('purchase_orders')
        .update(updates)
        .eq('id', invoice.matched_po_id);

      if (poError) {
        return { success: false, error: `Failed to update PO: ${poError.message}` };
      }
    }

    // Update invoice status
    await supabase
      .from('vendor_invoice_documents')
      .update({
        status: options.markComplete ? 'approved' : 'pending_review',
        reviewed_at: options.markComplete ? new Date().toISOString() : null,
        review_notes: `Applied to PO: ${Object.keys(updates).join(', ')}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoiceDocId);

    return { success: true, updates };

  } catch (error) {
    console.error('[invoiceExtractionService] Apply to PO error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Mark PO as having no shipping (when invoice confirms $0 shipping)
 */
export async function markPONoShipping(poId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Update finale_purchase_orders
    const { data: finaleUpdated } = await supabase
      .from('finale_purchase_orders')
      .update({
        shipping_cost: 0,
        no_shipping: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', poId)
      .select('id')
      .single();

    if (!finaleUpdated) {
      // Try purchase_orders
      await supabase
        .from('purchase_orders')
        .update({
          shipping_cost: 0,
          no_shipping: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', poId);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

function parseAmount(str: string): number | null {
  if (!str) return null;
  const cleaned = str.replace(/[,$\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseDate(str: string): string | null {
  if (!str) return null;
  try {
    // Try common formats
    const parts = str.split(/[\/\-]/);
    if (parts.length === 3) {
      let month = parseInt(parts[0]);
      let day = parseInt(parts[1]);
      let year = parseInt(parts[2]);

      // Handle 2-digit year
      if (year < 100) {
        year += year > 50 ? 1900 : 2000;
      }

      // Validate
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function isAIExtractionEnabled(): Promise<boolean> {
  // Check if AI extraction is enabled in settings
  const { data: settings } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'invoice_ai_extraction_enabled')
    .single();

  return settings?.value === 'true' || settings?.value === true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Batch Processing
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process all pending invoices (called by scheduled job)
 */
export async function processPendingInvoices(): Promise<{
  processed: number;
  matched: number;
  errors: number;
}> {
  const stats = { processed: 0, matched: 0, errors: 0 };

  // Get invoices pending extraction
  const { data: pendingInvoices } = await supabase
    .from('vendor_invoice_documents')
    .select('id')
    .eq('status', 'pending_extraction')
    .limit(20);

  if (!pendingInvoices || pendingInvoices.length === 0) {
    return stats;
  }

  for (const invoice of pendingInvoices) {
    try {
      const result = await extractInvoiceData(invoice.id);
      stats.processed++;

      if (result.success) {
        // Check if it got matched
        const { data: updated } = await supabase
          .from('vendor_invoice_documents')
          .select('matched_po_id')
          .eq('id', invoice.id)
          .single();

        if (updated?.matched_po_id) {
          stats.matched++;
        }
      } else {
        stats.errors++;
      }
    } catch (error) {
      console.error(`[invoiceExtractionService] Error processing invoice ${invoice.id}:`, error);
      stats.errors++;
    }
  }

  return stats;
}

export default {
  extractInvoiceData,
  matchInvoiceToPO,
  applyInvoiceToPO,
  markPONoShipping,
  processPendingInvoices,
};
