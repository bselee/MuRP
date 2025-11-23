import { supabase } from '../lib/supabase/client';
import type { POTrackingEvent, POTrackingStatus } from '../types';

export interface TrackedPurchaseOrder {
  id: string;
  order_id: string;
  vendor_name: string;
  tracking_number: string;
  tracking_carrier: string | null;
  tracking_status: POTrackingStatus;
  tracking_estimated_delivery: string | null;
  tracking_last_checked_at: string | null;
  tracking_last_exception: string | null;
  last_event_at: string | null;
}

export interface TrackingTimelineEvent {
  id: string;
  status: POTrackingStatus;
  carrier: string | null;
  tracking_number: string | null;
  description: string | null;
  created_at: string;
}

export interface TrackingHistoryRow extends TrackingTimelineEvent {
  po_id: string;
  purchase_orders?: {
    order_id: string | null;
    vendor_name: string | null;
  } | null;
}

export interface TrackingNotificationConfig {
  enabled?: boolean;
  slackWebhookUrl?: string;
  teamsWebhookUrl?: string;
  channelLabel?: string;
  slackMention?: string;
  triggerStatuses?: POTrackingStatus[];
  department?: string;
}

const DEFAULT_NOTIFICATION_STATUSES: POTrackingStatus[] = ['delivered', 'exception'];
const DEFAULT_DEPARTMENT = 'purchasing';

const STATUS_LABELS: Record<POTrackingStatus, string> = {
  awaiting_confirmation: 'Awaiting Vendor',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  exception: 'Exception',
  cancelled: 'Cancelled',
  invoice_received: 'Invoice Logged',
};

let cachedNotificationConfig: TrackingNotificationConfig | null = null;
let notificationConfigLoaded = false;

export async function fetchTrackedPurchaseOrders(): Promise<TrackedPurchaseOrder[]> {
  const { data, error } = await supabase
    .from('po_tracking_overview')
    .select('*')
    .order('tracking_last_checked_at', { ascending: false });

  if (error) {
    console.error('[poTrackingService] fetchTrackedPurchaseOrders failed', error);
    throw error;
  }
  return data || [];
}

export async function insertTrackingEvent(event: POTrackingEvent): Promise<void> {
  const { error } = await supabase.from('po_tracking_events').insert({
    po_id: event.poId,
    status: event.status,
    carrier: event.carrier ?? null,
    tracking_number: event.trackingNumber ?? null,
    description: event.description ?? null,
    raw_payload: event.rawPayload ?? null,
  });

  if (error) {
    console.error('[poTrackingService] insertTrackingEvent failed', error);
    throw error;
  }
}

export async function fetchTrackingTimeline(poId: string): Promise<TrackingTimelineEvent[]> {
  const { data, error } = await supabase
    .from('po_tracking_events')
    .select('id, status, carrier, tracking_number, description, created_at')
    .eq('po_id', poId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[poTrackingService] fetchTrackingTimeline failed', error);
    throw error;
  }
  return (data as TrackingTimelineEvent[]) || [];
}

export async function fetchTrackingHistoryRows(poIds?: string[]): Promise<TrackingHistoryRow[]> {
  let query = supabase
    .from('po_tracking_events')
    .select(
      'id, po_id, status, carrier, tracking_number, description, created_at, purchase_orders(order_id, vendor_name)',
    )
    .order('created_at', { ascending: false })
    .limit(5000);

  if (poIds && poIds.length > 0) {
    query = query.in('po_id', poIds);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[poTrackingService] fetchTrackingHistoryRows failed', error);
    throw error;
  }

  return (data as TrackingHistoryRow[]) || [];
}

export async function updatePurchaseOrderTrackingStatus(
  poId: string,
  status: POTrackingStatus,
  options?: {
    carrier?: string | null;
    trackingNumber?: string | null;
    estimatedDelivery?: string | null;
    lastException?: string | null;
    eventDescription?: string | null;
    source?: string;
    suppressEvent?: boolean;
    suppressNotifications?: boolean;
  }
): Promise<void> {
  const { error } = await supabase
    .from('purchase_orders')
    .update({
      tracking_status: status,
      tracking_carrier: options?.carrier ?? null,
      tracking_number: options?.trackingNumber ?? null,
      tracking_estimated_delivery: options?.estimatedDelivery ?? null,
      tracking_last_exception: options?.lastException ?? null,
      tracking_last_checked_at: new Date().toISOString(),
    })
    .eq('id', poId);

  if (error) {
    console.error('[poTrackingService] updatePurchaseOrderTrackingStatus failed', error);
    throw error;
  }

  if (!options?.suppressEvent) {
    await insertTrackingEvent({
      poId,
      status,
      carrier: options?.carrier ?? undefined,
      trackingNumber: options?.trackingNumber ?? undefined,
      description: options?.eventDescription ?? `Status updated to ${STATUS_LABELS[status] ?? status}`,
      rawPayload: options?.source ? { source: options.source } : undefined,
    });
  }

  if (!options?.suppressNotifications) {
    await maybeSendTrackingNotification(poId, status);
  }
}

async function maybeSendTrackingNotification(poId: string, status: POTrackingStatus): Promise<void> {
  const config = await resolveNotificationConfig();
  if (!config || !config.enabled) return;
  if ((config.department || DEFAULT_DEPARTMENT) !== DEFAULT_DEPARTMENT) {
    // Only Purchasing notifications are currently supported
    return;
  }

  const triggers = config.triggerStatuses ?? DEFAULT_NOTIFICATION_STATUSES;
  if (!triggers.includes(status)) {
    return;
  }

  const { data: po, error } = await supabase
    .from('purchase_orders')
    .select('id, order_id, vendor_name, tracking_number, tracking_carrier, tracking_estimated_delivery')
    .eq('id', poId)
    .single();

  if (error) {
    console.error('[poTrackingService] Failed to load PO for notification', error);
    return;
  }

  const title =
    status === 'delivered'
      ? `✅ PO #${po?.order_id ?? '—'} delivered`
      : status === 'exception'
        ? `⚠️ PO #${po?.order_id ?? '—'} exception`
        : `PO #${po?.order_id ?? '—'} updated`;

  const body = [
    po?.vendor_name ? `Vendor: ${po.vendor_name}` : null,
    po?.tracking_number ? `Tracking: ${po.tracking_number} (${po.tracking_carrier || 'Carrier TBD'})` : null,
    po?.tracking_estimated_delivery ? `ETA: ${new Date(po.tracking_estimated_delivery).toLocaleDateString()}` : null,
    `Status: ${STATUS_LABELS[status] ?? status}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const tasks: Promise<void>[] = [];

  if (config.slackWebhookUrl) {
    tasks.push(
      sendSlackTrackingNotification(
        config.slackWebhookUrl,
        title,
        body,
        config.slackMention,
        config.channelLabel,
      ),
    );
  }

  if (config.teamsWebhookUrl) {
    tasks.push(sendTeamsTrackingNotification(config.teamsWebhookUrl, `${title}\n${body}`));
  }

  await Promise.allSettled(tasks);
}

async function resolveNotificationConfig(): Promise<TrackingNotificationConfig | null> {
  if (!notificationConfigLoaded) {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'po_tracking_notifications')
        .single();

      if (!error) {
        cachedNotificationConfig = data?.setting_value as TrackingNotificationConfig | null;
      }
    } catch (err) {
      console.warn('[poTrackingService] Unable to load tracking notification config', err);
    } finally {
      notificationConfigLoaded = true;
    }
  }

  if (!cachedNotificationConfig) {
    return null;
  }

  const enabled = Boolean(cachedNotificationConfig.enabled);
  if (!enabled) {
    return null;
  }

  const slackWebhook =
    cachedNotificationConfig.slackWebhookUrl ??
    import.meta.env.VITE_PO_TRACKING_SLACK_WEBHOOK ??
    import.meta.env.VITE_SLACK_WEBHOOK_URL;
  const teamsWebhook =
    cachedNotificationConfig.teamsWebhookUrl ?? import.meta.env.VITE_PO_TRACKING_TEAMS_WEBHOOK ?? null;

  if (!slackWebhook && !teamsWebhook) {
    return null;
  }

  return {
    enabled,
    slackWebhookUrl: slackWebhook ?? undefined,
    teamsWebhookUrl: teamsWebhook ?? undefined,
    triggerStatuses: cachedNotificationConfig.triggerStatuses ?? DEFAULT_NOTIFICATION_STATUSES,
    channelLabel: cachedNotificationConfig.channelLabel,
    slackMention: cachedNotificationConfig.slackMention,
    department: (cachedNotificationConfig.department || DEFAULT_DEPARTMENT).toLowerCase(),
  };
}

async function sendSlackTrackingNotification(
  webhookUrl: string,
  title: string,
  body: string,
  slackMention?: string,
  channelLabel?: string | null,
): Promise<void> {
  try {
    const mention = slackMention?.trim();
    const headline = mention ? `${title} ${mention}` : title;
    const blocks: Array<Record<string, any>> = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${headline}*\n${body}`,
        },
      },
    ];

    if (channelLabel) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Channel: ${channelLabel}`,
          },
        ],
      });
    }

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${headline} — ${body}`,
        blocks,
      }),
    });
  } catch (error) {
    console.error('[poTrackingService] Slack notification failed', error);
  }
}

async function sendTeamsTrackingNotification(webhookUrl: string, text: string): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (error) {
    console.error('[poTrackingService] Teams notification failed', error);
  }
}
