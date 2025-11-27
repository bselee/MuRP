/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📬 VENDOR RESPONSE SERVICE - Intelligent Response Management
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Manages the vendor response workbench: triaging incoming communications,
 * generating AI-powered draft responses, and tracking approval workflows.
 *
 * Features:
 * - Response queue management (pending communications needing action)
 * - AI-powered draft response generation
 * - Template-based response suggestions
 * - Approval workflow and sending
 * - Escalation handling
 *
 * @module services/vendorResponseService
 * @author MuRP Development Team
 * @version 1.0.0
 */

import { supabase } from '../lib/supabase/client';
import { sendChatMessage } from './aiGatewayService';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Type Definitions
// ═══════════════════════════════════════════════════════════════════════════

export type VendorResponseCategory =
  | 'shipment_confirmation'
  | 'delivery_update'
  | 'delivery_exception'
  | 'price_change'
  | 'out_of_stock'
  | 'substitution_offer'
  | 'invoice_attached'
  | 'order_confirmation'
  | 'lead_time_update'
  | 'general_inquiry'
  | 'thank_you'
  | 'other';

export type VendorSuggestedAction =
  | 'acknowledge_receipt'
  | 'confirm_acceptance'
  | 'request_clarification'
  | 'approve_pricing'
  | 'reject_pricing'
  | 'update_inventory'
  | 'escalate_to_manager'
  | 'forward_to_ap'
  | 'update_po_tracking'
  | 'create_backorder'
  | 'no_action_required'
  | 'review_required';

export interface VendorCommunicationQueueItem {
  id: string;
  poId: string;
  poNumber: string;
  vendorName: string;
  vendorEmail?: string;
  subject?: string;
  bodyPreview?: string;
  receivedAt: string;
  responseCategory?: VendorResponseCategory;
  suggestedAction?: VendorSuggestedAction;
  actionReasoning?: string;
  aiConfidence?: number;
  extractedData?: Record<string, unknown>;
  hasDraft: boolean;
  draftId?: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
}

export interface VendorResponseDraft {
  id: string;
  communicationId: string;
  poId: string;
  subject: string;
  body: string;
  signature?: string;
  aiGenerated: boolean;
  aiModel?: string;
  aiConfidence?: number;
  templateId?: string;
  templateType?: string;
  userEdited: boolean;
  status: 'draft' | 'pending_review' | 'approved' | 'sent' | 'discarded';
  originalBody?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateDraftOptions {
  templateType?: string;
  additionalContext?: Record<string, unknown>;
  tone?: 'formal' | 'friendly' | 'concise';
  includeCompanySignature?: boolean;
}

export interface SendDraftOptions {
  markPoTracking?: boolean;
  addToThread?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📋 RESPONSE QUEUE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all pending vendor communications requiring user action
 */
export async function getResponseQueue(): Promise<VendorCommunicationQueueItem[]> {
  const { data, error } = await supabase
    .from('po_vendor_communications')
    .select(`
      id,
      po_id,
      subject,
      body_preview,
      sender_email,
      received_at,
      response_category,
      suggested_action,
      action_reasoning,
      ai_confidence,
      extracted_data,
      gmail_message_id,
      gmail_thread_id,
      purchase_orders (
        id,
        order_id,
        vendor_name
      ),
      vendor_response_drafts (
        id
      )
    `)
    .eq('requires_user_action', true)
    .is('dismissed_at', null)
    .is('user_action_taken_at', null)
    .eq('direction', 'inbound')
    .order('received_at', { ascending: false });

  if (error) {
    console.error('[VendorResponseService] Error fetching response queue:', error);
    throw error;
  }

  return (data || []).map((item: any) => ({
    id: item.id,
    poId: item.po_id,
    poNumber: item.purchase_orders?.order_id || 'Unknown',
    vendorName: item.purchase_orders?.vendor_name || 'Unknown Vendor',
    vendorEmail: item.sender_email,
    subject: item.subject,
    bodyPreview: item.body_preview,
    receivedAt: item.received_at,
    responseCategory: item.response_category,
    suggestedAction: item.suggested_action,
    actionReasoning: item.action_reasoning,
    aiConfidence: item.ai_confidence,
    extractedData: item.extracted_data,
    hasDraft: (item.vendor_response_drafts?.length || 0) > 0,
    draftId: item.vendor_response_drafts?.[0]?.id,
    gmailMessageId: item.gmail_message_id,
    gmailThreadId: item.gmail_thread_id,
  }));
}

/**
 * Get queue count for badge display
 */
export async function getResponseQueueCount(): Promise<number> {
  const { count, error } = await supabase
    .from('po_vendor_communications')
    .select('id', { count: 'exact', head: true })
    .eq('requires_user_action', true)
    .is('dismissed_at', null)
    .is('user_action_taken_at', null)
    .eq('direction', 'inbound');

  if (error) {
    console.error('[VendorResponseService] Error fetching queue count:', error);
    return 0;
  }

  return count || 0;
}

/**
 * Get detailed communication for response workbench
 */
export async function getCommunicationDetails(communicationId: string): Promise<{
  communication: VendorCommunicationQueueItem;
  draft?: VendorResponseDraft;
  poDetails?: any;
  relatedCommunications?: any[];
} | null> {
  // Get communication with related data
  const { data: comm, error: commError } = await supabase
    .from('po_vendor_communications')
    .select(`
      *,
      purchase_orders (
        id,
        order_id,
        vendor_name,
        vendor_id,
        status,
        items,
        total_amount,
        expected_date,
        tracking_number,
        tracking_carrier,
        vendors (
          id,
          name,
          contact_person,
          email,
          purchase_email
        )
      )
    `)
    .eq('id', communicationId)
    .single();

  if (commError || !comm) {
    console.error('[VendorResponseService] Error fetching communication:', commError);
    return null;
  }

  // Get existing draft if any
  const { data: drafts } = await supabase
    .from('vendor_response_drafts')
    .select('*')
    .eq('communication_id', communicationId)
    .order('created_at', { ascending: false })
    .limit(1);

  // Get related communications in same thread
  const { data: related } = await supabase
    .from('po_vendor_communications')
    .select('id, direction, subject, body_preview, sent_at, received_at')
    .eq('gmail_thread_id', comm.gmail_thread_id)
    .neq('id', communicationId)
    .order('created_at', { ascending: true });

  const communication: VendorCommunicationQueueItem = {
    id: comm.id,
    poId: comm.po_id,
    poNumber: comm.purchase_orders?.order_id || 'Unknown',
    vendorName: comm.purchase_orders?.vendor_name || 'Unknown Vendor',
    vendorEmail: comm.sender_email,
    subject: comm.subject,
    bodyPreview: comm.body_preview,
    receivedAt: comm.received_at,
    responseCategory: comm.response_category,
    suggestedAction: comm.suggested_action,
    actionReasoning: comm.action_reasoning,
    aiConfidence: comm.ai_confidence,
    extractedData: comm.extracted_data,
    hasDraft: (drafts?.length || 0) > 0,
    draftId: drafts?.[0]?.id,
    gmailMessageId: comm.gmail_message_id,
    gmailThreadId: comm.gmail_thread_id,
  };

  const draft = drafts?.[0] ? {
    id: drafts[0].id,
    communicationId: drafts[0].communication_id,
    poId: drafts[0].po_id,
    subject: drafts[0].subject,
    body: drafts[0].body,
    signature: drafts[0].signature,
    aiGenerated: drafts[0].ai_generated,
    aiModel: drafts[0].ai_model,
    aiConfidence: drafts[0].ai_confidence,
    templateId: drafts[0].template_id,
    templateType: drafts[0].template_type,
    userEdited: drafts[0].user_edited,
    status: drafts[0].status,
    originalBody: drafts[0].original_body,
    createdAt: drafts[0].created_at,
    updatedAt: drafts[0].updated_at,
  } : undefined;

  return {
    communication,
    draft,
    poDetails: comm.purchase_orders,
    relatedCommunications: related || [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ✍️ DRAFT RESPONSE GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate an AI-powered draft response for a vendor communication
 */
export async function generateDraftReply(
  communicationId: string,
  options: GenerateDraftOptions = {}
): Promise<VendorResponseDraft | null> {
  // Get communication details
  const details = await getCommunicationDetails(communicationId);
  if (!details) {
    console.error('[VendorResponseService] Communication not found:', communicationId);
    return null;
  }

  const { communication, poDetails } = details;

  // Try to use a template first for common categories
  const templateType = getTemplateTypeForCategory(communication.responseCategory);
  
  if (templateType && options.templateType !== 'ai_only') {
    const templateDraft = await generateFromTemplate(
      communicationId,
      communication,
      poDetails,
      templateType
    );
    if (templateDraft) return templateDraft;
  }

  // Fall back to AI generation
  return generateWithAI(communicationId, communication, poDetails, options);
}

/**
 * Get appropriate template type for a response category
 */
function getTemplateTypeForCategory(category?: VendorResponseCategory): string | null {
  const categoryTemplateMap: Record<VendorResponseCategory, string> = {
    shipment_confirmation: 'response_shipment',
    delivery_update: 'response_shipment',
    delivery_exception: 'response_clarification',
    price_change: 'response_pricing',
    out_of_stock: 'response_backorder',
    substitution_offer: 'response_clarification',
    invoice_attached: 'response_thank_you',
    order_confirmation: 'response_thank_you',
    lead_time_update: 'response_thank_you',
    general_inquiry: 'response_clarification',
    thank_you: 'response_thank_you',
    other: 'response_clarification',
  };

  return category ? categoryTemplateMap[category] : null;
}

/**
 * Generate draft from template
 */
async function generateFromTemplate(
  communicationId: string,
  communication: VendorCommunicationQueueItem,
  poDetails: any,
  templateType: string
): Promise<VendorResponseDraft | null> {
  // Fetch template
  const { data: template } = await supabase
    .from('email_templates')
    .select('*')
    .eq('template_type', templateType)
    .eq('is_default', true)
    .maybeSingle();

  if (!template) return null;

  // Get company settings for signature
  const { data: company } = await supabase
    .from('company_settings')
    .select('company_name')
    .maybeSingle();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name')
    .eq('id', user?.id)
    .maybeSingle();

  // Prepare variables
  const variables: Record<string, string> = {
    original_subject: communication.subject || 'Your Message',
    po_number: communication.poNumber,
    vendor_name: communication.vendorName,
    vendor_contact: poDetails?.vendors?.contact_person || communication.vendorName.split(' ')[0],
    company_name: company?.company_name || 'Our Team',
    user_name: profile?.full_name || 'Purchasing Team',
  };

  // Add extracted data as variables
  if (communication.extractedData) {
    const extracted = communication.extractedData as Record<string, any>;
    if (extracted.trackingNumber) variables.tracking_number = extracted.trackingNumber;
    if (extracted.carrier) variables.carrier = extracted.carrier;
    if (extracted.expectedDelivery) variables.expected_delivery = extracted.expectedDelivery;
  }

  // Substitute variables in template
  let subject = template.subject_line;
  let body = template.body_template;
  let signature = template.signature || '';

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    subject = subject.replace(regex, value);
    body = body.replace(regex, value);
    signature = signature.replace(regex, value);
  }

  // Remove any remaining unsubstituted conditional blocks
  body = body
    .replace(/\{\{#if\s+\w+\}\}[\s\S]*?\{\{\/if\}\}/g, '')
    .replace(/\{\{#else\}\}[\s\S]*?\{\{\/if\}\}/g, '');

  // Create draft record
  const { data: draft, error } = await supabase
    .from('vendor_response_drafts')
    .insert({
      communication_id: communicationId,
      po_id: communication.poId,
      subject,
      body,
      signature,
      ai_generated: false,
      template_id: template.id,
      template_type: templateType,
      status: 'draft',
    })
    .select()
    .single();

  if (error) {
    console.error('[VendorResponseService] Error creating template draft:', error);
    return null;
  }

  return {
    id: draft.id,
    communicationId: draft.communication_id,
    poId: draft.po_id,
    subject: draft.subject,
    body: draft.body,
    signature: draft.signature,
    aiGenerated: false,
    templateId: draft.template_id,
    templateType: draft.template_type,
    userEdited: false,
    status: draft.status,
    createdAt: draft.created_at,
    updatedAt: draft.updated_at,
  };
}

/**
 * Generate draft using AI
 */
async function generateWithAI(
  communicationId: string,
  communication: VendorCommunicationQueueItem,
  poDetails: any,
  options: GenerateDraftOptions
): Promise<VendorResponseDraft | null> {
  const tone = options.tone || 'friendly';
  
  const prompt = `Generate a professional email response to this vendor communication.

CONTEXT:
- PO Number: ${communication.poNumber}
- Vendor: ${communication.vendorName}
- Category: ${communication.responseCategory || 'general'}
- Suggested Action: ${communication.suggestedAction || 'review_required'}
- AI Reasoning: ${communication.actionReasoning || 'N/A'}

ORIGINAL EMAIL:
Subject: ${communication.subject}
From: ${communication.vendorEmail}
Body Preview: ${communication.bodyPreview}

EXTRACTED DATA:
${JSON.stringify(communication.extractedData || {}, null, 2)}

PO DETAILS:
- Status: ${poDetails?.status || 'unknown'}
- Expected Date: ${poDetails?.expected_date || 'N/A'}
- Tracking: ${poDetails?.tracking_number || 'Not yet provided'}

INSTRUCTIONS:
1. Write a ${tone} but professional response
2. Acknowledge the specific information they provided
3. Include any necessary confirmations or next steps
4. Keep it concise (2-4 short paragraphs max)
5. End with an appropriate closing

Return ONLY JSON in this format:
{
  "subject": "Re: [original subject or appropriate reply subject]",
  "body": "The email body text",
  "signature": "Best regards,\\n[Name]"
}`;

  try {
    const response = await sendChatMessage({
      userId: 'system-vendor-response',
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: 'You are a professional purchasing agent writing vendor communication responses. Always return valid JSON.',
      temperature: 0.3,
    });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[VendorResponseService] Failed to parse AI response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Create draft record
    const { data: draft, error } = await supabase
      .from('vendor_response_drafts')
      .insert({
        communication_id: communicationId,
        po_id: communication.poId,
        subject: parsed.subject,
        body: parsed.body,
        signature: parsed.signature,
        ai_generated: true,
        ai_model: 'claude-3-5-haiku-20241022',
        ai_confidence: 0.85,
        generation_context: {
          category: communication.responseCategory,
          suggestedAction: communication.suggestedAction,
          tone: options.tone,
        },
        status: 'draft',
      })
      .select()
      .single();

    if (error) {
      console.error('[VendorResponseService] Error creating AI draft:', error);
      return null;
    }

    return {
      id: draft.id,
      communicationId: draft.communication_id,
      poId: draft.po_id,
      subject: draft.subject,
      body: draft.body,
      signature: draft.signature,
      aiGenerated: true,
      aiModel: draft.ai_model,
      aiConfidence: draft.ai_confidence,
      userEdited: false,
      status: draft.status,
      createdAt: draft.created_at,
      updatedAt: draft.updated_at,
    };
  } catch (error) {
    console.error('[VendorResponseService] AI generation failed:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ✏️ DRAFT EDITING & APPROVAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Update draft content
 */
export async function updateDraft(
  draftId: string,
  updates: { subject?: string; body?: string; signature?: string }
): Promise<VendorResponseDraft | null> {
  const { data: { user } } = await supabase.auth.getUser();

  // Get original draft to preserve original_body on first edit
  const { data: existing } = await supabase
    .from('vendor_response_drafts')
    .select('body, user_edited, original_body')
    .eq('id', draftId)
    .single();

  const updateData: Record<string, any> = {
    ...updates,
    user_edited: true,
    edited_by: user?.id,
    edited_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Preserve original body on first edit
  if (existing && !existing.user_edited) {
    updateData.original_body = existing.body;
  }

  const { data: draft, error } = await supabase
    .from('vendor_response_drafts')
    .update(updateData)
    .eq('id', draftId)
    .select()
    .single();

  if (error) {
    console.error('[VendorResponseService] Error updating draft:', error);
    return null;
  }

  return {
    id: draft.id,
    communicationId: draft.communication_id,
    poId: draft.po_id,
    subject: draft.subject,
    body: draft.body,
    signature: draft.signature,
    aiGenerated: draft.ai_generated,
    aiModel: draft.ai_model,
    aiConfidence: draft.ai_confidence,
    templateId: draft.template_id,
    templateType: draft.template_type,
    userEdited: draft.user_edited,
    status: draft.status,
    originalBody: draft.original_body,
    createdAt: draft.created_at,
    updatedAt: draft.updated_at,
  };
}

/**
 * Approve draft for sending
 */
export async function approveDraft(draftId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('vendor_response_drafts')
    .update({
      status: 'approved',
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', draftId);

  return !error;
}

/**
 * Discard draft
 */
export async function discardDraft(draftId: string): Promise<boolean> {
  const { error } = await supabase
    .from('vendor_response_drafts')
    .update({
      status: 'discarded',
    })
    .eq('id', draftId);

  return !error;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📤 SENDING & COMPLETION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mark draft as sent (after email is sent via Gmail)
 */
export async function markDraftSent(
  draftId: string,
  gmailMessageId: string,
  gmailThreadId?: string
): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data: draft, error: draftError } = await supabase
    .from('vendor_response_drafts')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_by: user?.id,
      gmail_message_id: gmailMessageId,
      gmail_thread_id: gmailThreadId,
    })
    .eq('id', draftId)
    .select('communication_id')
    .single();

  if (draftError) {
    console.error('[VendorResponseService] Error marking draft sent:', draftError);
    return false;
  }

  // Mark communication as action taken
  const { error: commError } = await supabase
    .from('po_vendor_communications')
    .update({
      user_action_taken_at: new Date().toISOString(),
      user_action_taken_by: user?.id,
      user_action_type: 'replied',
    })
    .eq('id', draft.communication_id);

  return !commError;
}

// ═══════════════════════════════════════════════════════════════════════════
// ❌ DISMISS & ESCALATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dismiss a communication (no response needed)
 */
export async function dismissCommunication(
  communicationId: string,
  reason: string
): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('po_vendor_communications')
    .update({
      dismissed_at: new Date().toISOString(),
      dismissed_by: user?.id,
      dismiss_reason: reason,
    })
    .eq('id', communicationId);

  return !error;
}

/**
 * Mark action taken without sending a reply
 */
export async function markActionTaken(
  communicationId: string,
  actionType: string
): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('po_vendor_communications')
    .update({
      user_action_taken_at: new Date().toISOString(),
      user_action_taken_by: user?.id,
      user_action_type: actionType,
    })
    .eq('id', communicationId);

  return !error;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 ANALYTICS & STATS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get response workbench statistics
 */
export async function getResponseStats(): Promise<{
  pending: number;
  respondedToday: number;
  avgResponseTime: number;
  categoryBreakdown: Record<string, number>;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Pending count
  const { count: pending } = await supabase
    .from('po_vendor_communications')
    .select('id', { count: 'exact', head: true })
    .eq('requires_user_action', true)
    .is('dismissed_at', null)
    .is('user_action_taken_at', null);

  // Responded today
  const { count: respondedToday } = await supabase
    .from('po_vendor_communications')
    .select('id', { count: 'exact', head: true })
    .gte('user_action_taken_at', today.toISOString());

  // Category breakdown
  const { data: categories } = await supabase
    .from('po_vendor_communications')
    .select('response_category')
    .eq('requires_user_action', true)
    .is('dismissed_at', null)
    .is('user_action_taken_at', null);

  const categoryBreakdown: Record<string, number> = {};
  (categories || []).forEach((item: any) => {
    const cat = item.response_category || 'uncategorized';
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;
  });

  return {
    pending: pending || 0,
    respondedToday: respondedToday || 0,
    avgResponseTime: 0, // Would calculate from actual data
    categoryBreakdown,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎁 Export Everything
// ═══════════════════════════════════════════════════════════════════════════

export default {
  // Queue management
  getResponseQueue,
  getResponseQueueCount,
  getCommunicationDetails,

  // Draft generation
  generateDraftReply,

  // Draft editing
  updateDraft,
  approveDraft,
  discardDraft,

  // Sending
  markDraftSent,

  // Dismiss/Complete
  dismissCommunication,
  markActionTaken,

  // Analytics
  getResponseStats,
};
