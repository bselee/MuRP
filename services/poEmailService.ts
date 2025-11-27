import { supabase } from '../lib/supabase/client';
import type { VendorCommunication } from '../types';

export type PoEmailTimelineEntry = VendorCommunication;

export async function fetchPoEmailTimeline(poId: string): Promise<PoEmailTimelineEntry[]> {
  const { data, error } = await supabase
    .from('po_vendor_communications')
    .select('*')
    .eq('po_id', poId)
    .order('COALESCE(sent_at, received_at, created_at)', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[poEmailService] Failed to load timeline', error);
    throw error;
  }

  return (data || []).map(entry => ({
    id: entry.id,
    poId: entry.po_id,
    communicationType: entry.communication_type,
    direction: entry.direction,
    stage: entry.stage,
    gmailMessageId: entry.gmail_message_id,
    gmailThreadId: entry.gmail_thread_id,
    subject: entry.subject,
    bodyPreview: entry.body_preview,
    senderEmail: entry.sender_email,
    recipientEmail: entry.recipient_email,
    sentAt: entry.sent_at,
    receivedAt: entry.received_at,
    attachments: entry.attachments,
    metadata: entry.metadata,
    extractedData: entry.extracted_data,
    aiConfidence: entry.ai_confidence,
    aiCostUsd: entry.ai_cost_usd,
    aiExtracted: entry.ai_extracted,
    correlationConfidence: entry.correlation_confidence,
    createdAt: entry.created_at,
  }));
}
