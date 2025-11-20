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

export async function updatePurchaseOrderTrackingStatus(
  poId: string,
  status: POTrackingStatus,
  options?: {
    carrier?: string | null;
    trackingNumber?: string | null;
    estimatedDelivery?: string | null;
    lastException?: string | null;
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
}
