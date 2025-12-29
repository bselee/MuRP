import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface ShipmentData {
  id: string;
  poId: string;
  shipmentNumber?: string;
  trackingNumbers: string[];
  carrier?: string;
  carrierConfidence?: number;
  shipDate?: string;
  estimatedDeliveryDate?: string;
  totalQuantityShipped?: number;
  totalQuantityOrdered?: number;
  status: string;
  aiConfidence?: number;
  requiresReview: boolean;
  reviewReason?: string;
  extractedAt: string;
  updatedAt: string;
}

export interface ShipmentTrackingEvent {
  id: string;
  shipmentId: string;
  shipmentItemId?: string;
  eventType: string;
  status: string;
  description?: string;
  carrier?: string;
  trackingNumber?: string;
  carrierLocation?: string;
  carrierTimestamp?: string;
  source: string;
  sourceId?: string;
  aiConfidence?: number;
  rawData?: any;
}

export async function createShipment(shipmentData: {
  poId: string;
  shipmentNumber?: string;
  trackingNumbers: string[];
  carrier?: string;
  carrierConfidence?: number;
  shipDate?: string;
  estimatedDeliveryDate?: string;
  totalQuantityShipped?: number;
  totalQuantityOrdered?: number;
  aiConfidence?: number;
  aiExtraction?: any;
  gmailMessageId?: string;
  gmailThreadId?: string;
  requiresReview?: boolean;
  reviewReason?: string;
}): Promise<ShipmentData> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('po_shipment_data')
    .insert({
      po_id: shipmentData.poId,
      shipment_number: shipmentData.shipmentNumber,
      tracking_numbers: shipmentData.trackingNumbers,
      carrier: shipmentData.carrier,
      carrier_confidence: shipmentData.carrierConfidence,
      ship_date: shipmentData.shipDate,
      estimated_delivery_date: shipmentData.estimatedDeliveryDate,
      total_quantity_shipped: shipmentData.totalQuantityShipped,
      total_quantity_ordered: shipmentData.totalQuantityOrdered,
      status: 'pending',
      ai_confidence: shipmentData.aiConfidence,
      ai_extraction: shipmentData.aiExtraction,
      gmail_message_id: shipmentData.gmailMessageId,
      gmail_thread_id: shipmentData.gmailThreadId,
      requires_review: shipmentData.requiresReview || false,
      review_reason: shipmentData.reviewReason,
      extracted_at: now,
      created_at: now,
      updated_at: now
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createTrackingEvent(event: {
  shipmentId: string;
  shipmentItemId?: string;
  eventType: string;
  status: string;
  description?: string;
  carrier?: string;
  trackingNumber?: string;
  carrierLocation?: string;
  carrierTimestamp?: string;
  source: string;
  sourceId?: string;
  aiConfidence?: number;
  rawData?: any;
}): Promise<ShipmentTrackingEvent> {
  const { data, error } = await supabase
    .from('shipment_tracking_events')
    .insert({
      shipment_id: event.shipmentId,
      shipment_item_id: event.shipmentItemId,
      event_type: event.eventType,
      status: event.status,
      description: event.description,
      carrier: event.carrier,
      tracking_number: event.trackingNumber,
      carrier_location: event.carrierLocation,
      carrier_timestamp: event.carrierTimestamp,
      source: event.source,
      source_id: event.sourceId,
      ai_confidence: event.aiConfidence,
      raw_data: event.rawData || {},
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}