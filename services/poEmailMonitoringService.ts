import { supabase } from '../lib/supabase/client';

/**
 * PO Email Monitoring Service
 * 
 * Monitors designated purchasing email account for vendor responses to sent POs.
 * Routes responses to appropriate agents (Air Traffic Controller, Document Analyzer, etc.)
 * 
 * Integration Points:
 * - Gmail Webhook: Receives real-time email notifications
 * - Air Traffic Controller: Handles tracking updates and delays
 * - Document Analyzer: Processes invoices and packing slips
 * - Vendor Watchdog: Learns lead time patterns
 */

export interface POEmailContext {
  poId: string;
  orderId: string;
  vendorId: string;
  vendorName: string;
  vendorEmail: string;
  sentAt: string;
  expectedDate?: string;
  totalAmount: number;
  status: string;
}

export interface EmailResponse {
  messageId: string;
  threadId: string;
  from: string;
  subject: string;
  receivedAt: string;
  bodyText: string;
  attachments: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  data?: string; // base64 encoded
}

export type ResponseType = 
  | 'confirmation'
  | 'tracking_update'
  | 'invoice'
  | 'packing_slip'
  | 'backorder_notice'
  | 'price_change'
  | 'cancellation'
  | 'clarification_request'
  | 'other';

export type AgentHandoff = 
  | 'air_traffic_controller'  // Tracking updates, delays
  | 'document_analyzer'        // Invoices, packing slips
  | 'vendor_watchdog'          // Backorders, delays, lead time learning
  | 'human_review'             // Clarifications, price changes, cancellations
  | 'none';                    // Auto-handled, no action needed

export interface ClassifiedResponse {
  responseType: ResponseType;
  confidence: number;
  handoffTo: AgentHandoff;
  extractedData: {
    trackingNumber?: string;
    carrier?: string;
    estimatedDelivery?: string;
    confirmedDate?: string;
    backorderedItems?: string[];
    invoiceNumber?: string;
    invoiceAmount?: number;
    priceChanges?: Array<{ sku: string; oldPrice: number; newPrice: number }>;
    requiresAction?: boolean;
    actionDescription?: string;
  };
  summary: string;
}

/**
 * Fetches all POs that have been sent but haven't received vendor responses yet
 */
export async function getAwaitingResponsePOs(): Promise<POEmailContext[]> {
  try {
    // Query both internal and Finale POs
    const [internalResult, finaleResult] = await Promise.all([
      supabase
        .from('purchase_orders')
        .select('id, order_id, vendor_id, supplier_name, sent_at, estimated_receive_date, total_amount, status, vendors(email)')
        .not('sent_at', 'is', null)
        .in('status', ['sent', 'confirmed', 'committed'])
        .is('vendor_response_status', null)
        .order('sent_at', { ascending: true }),
      
      supabase
        .from('finale_purchase_orders')
        .select('id, order_id, vendor_id, vendor_name, sent_at, expected_date, total, status, finale_vendors(email)')
        .not('sent_at', 'is', null)
        .in('status', ['SUBMITTED', 'COMMITTED'])
        .order('sent_at', { ascending: true })
    ]);

    const contexts: POEmailContext[] = [];

    // Process internal POs
    if (internalResult.data) {
      contexts.push(...internalResult.data.map((po: any) => ({
        poId: po.id,
        orderId: po.order_id,
        vendorId: po.vendor_id,
        vendorName: po.supplier_name || 'Unknown',
        vendorEmail: po.vendors?.email || '',
        sentAt: po.sent_at,
        expectedDate: po.estimated_receive_date,
        totalAmount: po.total_amount || 0,
        status: po.status
      })));
    }

    // Process Finale POs
    if (finaleResult.data) {
      contexts.push(...finaleResult.data.map((po: any) => ({
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

    console.log(`[POEmailMonitoring] Found ${contexts.length} POs awaiting vendor responses`);
    return contexts;
  } catch (error) {
    console.error('[POEmailMonitoring] Error fetching awaiting response POs:', error);
    return [];
  }
}

/**
 * Classifies vendor email response and determines which agent should handle it
 */
export async function classifyVendorResponse(
  poContext: POEmailContext,
  email: EmailResponse
): Promise<ClassifiedResponse> {
  const subject = email.subject.toLowerCase();
  const body = email.bodyText.toLowerCase();
  
  // Initialize response
  const response: ClassifiedResponse = {
    responseType: 'other',
    confidence: 0,
    handoffTo: 'none',
    extractedData: {},
    summary: ''
  };

  // Check for tracking updates
  const trackingKeywords = ['tracking', 'shipped', 'shipment', 'carrier', 'ups', 'fedex', 'usps'];
  if (trackingKeywords.some(kw => subject.includes(kw) || body.includes(kw))) {
    response.responseType = 'tracking_update';
    response.confidence = 0.85;
    response.handoffTo = 'air_traffic_controller';
    
    // Extract tracking number (simplified pattern)
    const trackingMatch = body.match(/tracking.*?(?:number|#)?:?\s*([a-z0-9]{10,30})/i);
    if (trackingMatch) {
      response.extractedData.trackingNumber = trackingMatch[1];
    }
    
    // Extract carrier
    if (body.includes('ups')) response.extractedData.carrier = 'UPS';
    else if (body.includes('fedex')) response.extractedData.carrier = 'FedEx';
    else if (body.includes('usps')) response.extractedData.carrier = 'USPS';
    
    response.summary = `Vendor provided tracking update for PO ${poContext.orderId}`;
    return response;
  }

  // Check for invoice
  const invoiceKeywords = ['invoice', 'bill', 'payment', 'amount due'];
  const hasInvoiceAttachment = email.attachments.some(att => 
    att.filename.toLowerCase().includes('invoice') || 
    att.mimeType === 'application/pdf'
  );
  
  if (invoiceKeywords.some(kw => subject.includes(kw)) || hasInvoiceAttachment) {
    response.responseType = 'invoice';
    response.confidence = 0.90;
    response.handoffTo = 'document_analyzer';
    
    // Extract invoice number
    const invoiceMatch = body.match(/invoice.*?#?:?\s*([a-z0-9-]{5,20})/i);
    if (invoiceMatch) {
      response.extractedData.invoiceNumber = invoiceMatch[1];
    }
    
    // Extract amount
    const amountMatch = body.match(/\$\s*([0-9,]+\.?[0-9]*)/);
    if (amountMatch) {
      response.extractedData.invoiceAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
    }
    
    response.summary = `Invoice received for PO ${poContext.orderId}${response.extractedData.invoiceNumber ? ` (Invoice #${response.extractedData.invoiceNumber})` : ''}`;
    return response;
  }

  // Check for backorder
  const backorderKeywords = ['backorder', 'back order', 'out of stock', 'unavailable', 'delayed'];
  if (backorderKeywords.some(kw => body.includes(kw))) {
    response.responseType = 'backorder_notice';
    response.confidence = 0.80;
    response.handoffTo = 'vendor_watchdog';
    response.extractedData.requiresAction = true;
    response.extractedData.actionDescription = 'Items backordered - may impact inventory levels';
    response.summary = `Backorder notice for PO ${poContext.orderId} - Vendor Watchdog alerted`;
    return response;
  }

  // Check for confirmation
  const confirmKeywords = ['confirmed', 'confirm', 'accepted', 'received your order', 'processing'];
  if (confirmKeywords.some(kw => body.includes(kw))) {
    response.responseType = 'confirmation';
    response.confidence = 0.75;
    response.handoffTo = 'none'; // Auto-handled, just log it
    
    // Try to extract confirmed delivery date
    const dateMatch = body.match(/(?:deliver|ship|arrive).*?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
    if (dateMatch) {
      response.extractedData.confirmedDate = dateMatch[1];
    }
    
    response.summary = `PO ${poContext.orderId} confirmed by vendor`;
    return response;
  }

  // Check for price changes
  const priceKeywords = ['price change', 'pricing update', 'cost increase', 'price increase'];
  if (priceKeywords.some(kw => body.includes(kw))) {
    response.responseType = 'price_change';
    response.confidence = 0.85;
    response.handoffTo = 'human_review';
    response.extractedData.requiresAction = true;
    response.extractedData.actionDescription = 'Price changes detected - review required';
    response.summary = `Price change notification for PO ${poContext.orderId} - human review needed`;
    return response;
  }

  // Check for cancellation
  const cancelKeywords = ['cancel', 'cannot fulfill', 'unable to process'];
  if (cancelKeywords.some(kw => body.includes(kw))) {
    response.responseType = 'cancellation';
    response.confidence = 0.90;
    response.handoffTo = 'human_review';
    response.extractedData.requiresAction = true;
    response.extractedData.actionDescription = 'PO may be cancelled - immediate action required';
    response.summary = `Potential cancellation for PO ${poContext.orderId} - urgent review needed`;
    return response;
  }

  // Check for clarification requests
  const clarifyKeywords = ['question', 'clarify', 'unclear', 'please confirm', 'need more info'];
  if (clarifyKeywords.some(kw => body.includes(kw))) {
    response.responseType = 'clarification_request';
    response.confidence = 0.70;
    response.handoffTo = 'human_review';
    response.extractedData.requiresAction = true;
    response.extractedData.actionDescription = 'Vendor requesting clarification';
    response.summary = `Clarification request for PO ${poContext.orderId} - response needed`;
    return response;
  }

  // Packing slip
  const hasPackingSlip = email.attachments.some(att => 
    att.filename.toLowerCase().includes('packing') || 
    att.filename.toLowerCase().includes('slip')
  );
  if (hasPackingSlip) {
    response.responseType = 'packing_slip';
    response.confidence = 0.85;
    response.handoffTo = 'document_analyzer';
    response.summary = `Packing slip received for PO ${poContext.orderId}`;
    return response;
  }

  // Default: unknown type
  response.responseType = 'other';
  response.confidence = 0.50;
  response.handoffTo = 'human_review';
  response.summary = `Vendor response for PO ${poContext.orderId} - classification uncertain`;
  return response;
}

/**
 * Routes classified response to appropriate agent
 */
export async function routeToAgent(
  poContext: POEmailContext,
  email: EmailResponse,
  classification: ClassifiedResponse
): Promise<{ success: boolean; agent: AgentHandoff; message: string }> {
  try {
    console.log(`[POEmailMonitoring] Routing ${classification.responseType} to ${classification.handoffTo} for PO ${poContext.orderId}`);

    switch (classification.handoffTo) {
      case 'air_traffic_controller':
        return await handoffToAirTrafficController(poContext, email, classification);
      
      case 'document_analyzer':
        return await handoffToDocumentAnalyzer(poContext, email, classification);
      
      case 'vendor_watchdog':
        return await handoffToVendorWatchdog(poContext, email, classification);
      
      case 'human_review':
        return await createHumanReviewTask(poContext, email, classification);
      
      case 'none':
        // Just log it, no agent action needed
        await logVendorResponse(poContext, email, classification);
        return {
          success: true,
          agent: 'none',
          message: `Auto-handled: ${classification.summary}`
        };
      
      default:
        return {
          success: false,
          agent: 'none',
          message: `Unknown handoff target: ${classification.handoffTo}`
        };
    }
  } catch (error) {
    console.error('[POEmailMonitoring] Routing error:', error);
    return {
      success: false,
      agent: classification.handoffTo,
      message: error instanceof Error ? error.message : 'Routing failed'
    };
  }
}

/**
 * Handoff to Air Traffic Controller for tracking updates
 */
async function handoffToAirTrafficController(
  poContext: POEmailContext,
  email: EmailResponse,
  classification: ClassifiedResponse
): Promise<{ success: boolean; agent: AgentHandoff; message: string }> {
  try {
    // Update PO with tracking information
    const updateData: any = {
      tracking_number: classification.extractedData.trackingNumber,
      tracking_carrier: classification.extractedData.carrier,
      tracking_status: 'shipped',
      vendor_response_status: 'vendor_responded',
      vendor_response_received_at: email.receivedAt,
      vendor_response_email_id: email.messageId,
      vendor_response_thread_id: email.threadId,
      vendor_response_summary: {
        type: classification.responseType,
        confidence: classification.confidence,
        summary: classification.summary
      }
    };

    if (classification.extractedData.estimatedDelivery) {
      updateData.tracking_estimated_delivery = classification.extractedData.estimatedDelivery;
    }

    await supabase
      .from('purchase_orders')
      .update(updateData)
      .eq('id', poContext.poId);

    // Log to PO communication tracking
    await supabase
      .from('po_vendor_communications')
      .insert({
        po_id: poContext.poId,
        communication_type: 'email',
        direction: 'inbound',
        stage: 'tracking_update',
        gmail_message_id: email.messageId,
        gmail_thread_id: email.threadId,
        subject: email.subject,
        body_preview: email.bodyText.substring(0, 500),
        sender_email: email.from,
        received_at: email.receivedAt,
        extracted_data: classification.extractedData,
        ai_confidence: classification.confidence
      });

    console.log(`[Air Traffic Controller] Monitoring PO ${poContext.orderId} - tracking: ${classification.extractedData.trackingNumber}`);

    return {
      success: true,
      agent: 'air_traffic_controller',
      message: `Tracking info updated - Air Traffic Controller now monitoring delivery`
    };
  } catch (error) {
    console.error('[POEmailMonitoring] Air Traffic Controller handoff failed:', error);
    throw error;
  }
}

/**
 * Handoff to Document Analyzer for invoices/packing slips
 */
async function handoffToDocumentAnalyzer(
  poContext: POEmailContext,
  email: EmailResponse,
  classification: ClassifiedResponse
): Promise<{ success: boolean; agent: AgentHandoff; message: string }> {
  try {
    // Store email for Document Analyzer processing
    const { error } = await supabase
      .from('ai_vendor_email_cache')
      .insert({
        gmail_message_id: email.messageId,
        gmail_thread_id: email.threadId,
        po_id: poContext.poId,
        subject: email.subject,
        sender: email.from,
        received_at: email.receivedAt,
        body_text: email.bodyText,
        attachments_metadata: email.attachments.map(att => ({
          filename: att.filename,
          mimeType: att.mimeType,
          size: att.size
        })),
        classification: classification.responseType,
        confidence: classification.confidence,
        processing_status: 'queued_for_analysis'
      });

    if (error) throw error;

    // Update PO vendor response status
    await supabase
      .from('purchase_orders')
      .update({
        vendor_response_status: 'vendor_responded',
        vendor_response_received_at: email.receivedAt,
        vendor_response_email_id: email.messageId,
        vendor_response_summary: {
          type: classification.responseType,
          invoiceNumber: classification.extractedData.invoiceNumber,
          invoiceAmount: classification.extractedData.invoiceAmount
        }
      })
      .eq('id', poContext.poId);

    console.log(`[Document Analyzer] Queued ${classification.responseType} for PO ${poContext.orderId}`);

    return {
      success: true,
      agent: 'document_analyzer',
      message: `${classification.responseType} queued for Document Analyzer processing`
    };
  } catch (error) {
    console.error('[POEmailMonitoring] Document Analyzer handoff failed:', error);
    throw error;
  }
}

/**
 * Handoff to Vendor Watchdog for backorders/delays
 */
async function handoffToVendorWatchdog(
  poContext: POEmailContext,
  email: EmailResponse,
  classification: ClassifiedResponse
): Promise<{ success: boolean; agent: AgentHandoff; message: string }> {
  try {
    // Create vendor performance incident
    await supabase
      .from('vendor_performance_incidents')
      .insert({
        vendor_id: poContext.vendorId,
        po_id: poContext.poId,
        incident_type: classification.responseType,
        incident_date: email.receivedAt,
        severity: classification.extractedData.requiresAction ? 'high' : 'medium',
        description: classification.summary,
        source_email_id: email.messageId,
        metadata: {
          backorderedItems: classification.extractedData.backorderedItems,
          originalExpectedDate: poContext.expectedDate,
          responseDetails: email.bodyText.substring(0, 1000)
        }
      });

    // Update PO status
    await supabase
      .from('purchase_orders')
      .update({
        vendor_response_status: 'verified_with_issues',
        vendor_response_received_at: email.receivedAt,
        vendor_response_email_id: email.messageId,
        vendor_response_summary: {
          type: classification.responseType,
          issues: classification.extractedData.backorderedItems
        }
      })
      .eq('id', poContext.poId);

    console.log(`[Vendor Watchdog] Performance incident logged for vendor ${poContext.vendorName}`);

    return {
      success: true,
      agent: 'vendor_watchdog',
      message: `Vendor performance incident logged - Watchdog monitoring`
    };
  } catch (error) {
    console.error('[POEmailMonitoring] Vendor Watchdog handoff failed:', error);
    throw error;
  }
}

/**
 * Create human review task for complex responses
 */
async function createHumanReviewTask(
  poContext: POEmailContext,
  email: EmailResponse,
  classification: ClassifiedResponse
): Promise<{ success: boolean; agent: AgentHandoff; message: string }> {
  try {
    // Create alert in po_alert_log
    await supabase
      .from('po_alert_log')
      .insert({
        po_id: poContext.poId,
        alert_type: classification.responseType,
        priority: classification.extractedData.requiresAction ? 'high' : 'medium',
        message: classification.summary,
        metadata: {
          emailMessageId: email.messageId,
          emailThreadId: email.threadId,
          emailFrom: email.from,
          emailSubject: email.subject,
          actionRequired: classification.extractedData.actionDescription,
          extractedData: classification.extractedData
        },
        created_at: new Date().toISOString()
      });

    // Update PO status
    await supabase
      .from('purchase_orders')
      .update({
        vendor_response_status: 'requires_clarification',
        vendor_response_received_at: email.receivedAt,
        vendor_response_email_id: email.messageId,
        vendor_response_summary: {
          type: classification.responseType,
          requiresAction: true,
          actionDescription: classification.extractedData.actionDescription
        }
      })
      .eq('id', poContext.poId);

    console.log(`[Human Review] Alert created for PO ${poContext.orderId} - ${classification.responseType}`);

    return {
      success: true,
      agent: 'human_review',
      message: `Alert created - human review required for ${classification.responseType}`
    };
  } catch (error) {
    console.error('[POEmailMonitoring] Human review task creation failed:', error);
    throw error;
  }
}

/**
 * Log vendor response (for auto-handled responses)
 */
async function logVendorResponse(
  poContext: POEmailContext,
  email: EmailResponse,
  classification: ClassifiedResponse
): Promise<void> {
  try {
    await supabase
      .from('po_vendor_communications')
      .insert({
        po_id: poContext.poId,
        communication_type: 'email',
        direction: 'inbound',
        stage: 'confirmation',
        gmail_message_id: email.messageId,
        gmail_thread_id: email.threadId,
        subject: email.subject,
        body_preview: email.bodyText.substring(0, 500),
        sender_email: email.from,
        received_at: email.receivedAt,
        extracted_data: classification.extractedData,
        ai_confidence: classification.confidence
      });

    await supabase
      .from('purchase_orders')
      .update({
        vendor_response_status: 'verified_confirmed',
        vendor_response_received_at: email.receivedAt,
        vendor_response_email_id: email.messageId
      })
      .eq('id', poContext.poId);

    console.log(`[POEmailMonitoring] Logged vendor confirmation for PO ${poContext.orderId}`);
  } catch (error) {
    console.error('[POEmailMonitoring] Failed to log vendor response:', error);
  }
}

/**
 * Main monitoring function - processes all awaiting POs
 * Should be called periodically (e.g., every 5 minutes) or via webhook
 */
export async function monitorPOEmails(): Promise<{
  processed: number;
  successful: number;
  failed: number;
  results: Array<{ poId: string; status: string; agent: AgentHandoff }>;
}> {
  const startTime = Date.now();
  const results: Array<{ poId: string; status: string; agent: AgentHandoff }> = [];
  
  try {
    console.log('[POEmailMonitoring] Starting email monitoring scan...');
    
    const awaitingPOs = await getAwaitingResponsePOs();
    
    // For each PO, check if there's a vendor response
    // Note: This is a simplified version - in production, integrate with Gmail API
    // or wait for webhook notifications
    
    console.log(`[POEmailMonitoring] Scan complete - checked ${awaitingPOs.length} POs in ${Date.now() - startTime}ms`);
    
    return {
      processed: awaitingPOs.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      results
    };
  } catch (error) {
    console.error('[POEmailMonitoring] Monitor scan failed:', error);
    return {
      processed: 0,
      successful: 0,
      failed: 0,
      results: []
    };
  }
}
