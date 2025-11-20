import { supabase } from '../lib/supabase/client';

export interface PoEmailTimelineEntry {
  id: string;
  poId: string;
  vendorEmail?: string | null;
  gmailMessageId?: string | null;
  gmailThreadId?: string | null;
  gmailHistoryId?: string | null;
  metadata?: Record<string, any> | null;
  sentAt?: string;
  lastReplyAt?: string | null;
  lastReplyMessageId?: string | null;
}

export async function fetchPoEmailTimeline(poId: string): Promise<PoEmailTimelineEntry[]> {
  const { data, error } = await supabase
    .from('po_email_tracking')
    .select('*')
    .eq('po_id', poId)
    .order('sent_at', { ascending: true });

  if (error) {
    console.error('[poEmailService] Failed to load timeline', error);
    throw error;
  }

  return (data || []).map(entry => ({
    id: entry.id,
    poId: entry.po_id,
    vendorEmail: entry.vendor_email,
    gmailMessageId: entry.gmail_message_id,
    gmailThreadId: entry.gmail_thread_id,
    gmailHistoryId: entry.gmail_history_id,
    metadata: entry.metadata,
    sentAt: entry.sent_at,
    lastReplyAt: entry.last_reply_at,
    lastReplyMessageId: entry.last_reply_message_id,
  }));
}
