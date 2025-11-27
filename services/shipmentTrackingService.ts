/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SHIPMENT TRACKING SERVICE - Advanced Shipment Detection & Tracking
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This service handles comprehensive shipment tracking including:
 * - Shipment data extraction and storage from vendor emails
 * - Carrier validation and tracking number management
 * - Multiple shipment support per PO
 * - Delivery confirmation and status updates
 * - Shipment review workflows
 *
 * Key Features:
 * ✨ AI-powered shipment data extraction
 * ✨ Carrier validation with regex patterns
 * ✨ Multiple tracking numbers per shipment
 * ✨ Partial shipment support
 * ✨ Real-time delivery alerts
 * ✨ Integration with AfterShip tracking
 *
 * @module services/shipmentTrackingService
 * @author MuRP Development Team
 * @version 1.0.0
 */

import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Type Definitions
// ═══════════════════════════════════════════════════════════════════════════

export interface ShipmentData {
  id: string;
  poId: string;
  shipmentNumber?: string;
  trackingNumbers: string[];
  carrier?: string;
  carrierConfidence?: number;
  shipDate?: string;
  estimatedDeliveryDate?: string;
  actualDeliveryDate?: string;
  totalQuantityShipped?: number;
  totalQuantityOrdered?: number;
  status: 'pending' | 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'cancelled';
  aiConfidence?: number;
  requiresReview: boolean;
  reviewReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  notes?: string;
  extractedAt: string;
  updatedAt: string;
}

export interface ShipmentItem {
  id: string;
  shipmentId: string;
  poItemId?: string;
  vendorSku?: string;
  internalSku?: string;
  itemDescription?: string;
  quantityShipped: number;
  quantityOrdered?: number;
  trackingNumber?: string;
  carrier?: string;
  status: 'pending' | 'shipped' | 'in_transit' | 'delivered' | 'exception';
}

export interface ShipmentTrackingEvent {
  id: string;
  shipmentId: string;
  shipmentItemId?: string;
  eventType: 'status_update' | 'delivery_confirmation' | 'exception' | 'rescheduled' | 'pickup' | 'in_transit' | 'out_for_delivery' | 'delivered';
  status: string;
  description?: string;
  carrier?: string;
  trackingNumber?: string;
  carrierLocation?: string;
  carrierTimestamp?: string;
  source: 'email' | 'aftership' | 'manual' | 'carrier_api';
  sourceId?: string;
  aiConfidence?: number;
  createdAt: string;
}

export interface ShipmentAlert {
  poId: string;
  poNumber: string;
  shipmentId: string;
  alertType: string;
  alertMessage: string;
  severity: 'low' | 'medium' | 'high';
  daysOverdue: number;
}

export interface ShipmentReviewResult {
  shipmentId: string;
  action: 'approve' | 'reject' | 'override';
  overrideReason?: string;
  reviewerNotes?: string;
  correctedTrackingNumbers?: string[];
  correctedCarrier?: string;
  correctedDeliveryDate?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 SHIPMENT DATA MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get shipment data for a purchase order
 */
export async function getShipmentDataForPO(poId: string): Promise<ShipmentData[]> {
  const { data, error } = await supabase
    .from('po_shipment_data')
    .select('*')
    .eq('po_id', poId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get detailed shipment information including items
 */
export async function getShipmentDetails(shipmentId: string): Promise<{
  shipment: ShipmentData;
  items: ShipmentItem[];
  events: ShipmentTrackingEvent[];
} | null> {
  // Get shipment data
  const { data: shipment, error: shipmentError } = await supabase
    .from('po_shipment_data')
    .select('*')
    .eq('id', shipmentId)
    .single();

  if (shipmentError) throw shipmentError;
  if (!shipment) return null;

  // Get shipment items
  const { data: items, error: itemsError } = await supabase
    .from('po_shipment_items')
    .select('*')
    .eq('shipment_id', shipmentId)
    .order('created_at', { ascending: true });

  if (itemsError) throw itemsError;

  // Get tracking events
  const { data: events, error: eventsError } = await supabase
    .from('shipment_tracking_events')
    .select('*')
    .eq('shipment_id', shipmentId)
    .order('created_at', { ascending: true });

  if (eventsError) throw eventsError;

  return {
    shipment,
    items: items || [],
    events: events || []
  };
}

/**
 * Get shipments requiring review
 */
export async function getShipmentsRequiringReview(): Promise<ShipmentData[]> {
  const { data, error } = await supabase
    .from('po_shipment_data')
    .select('*')
    .eq('requires_review', true)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get carrier validation patterns
 */
export async function getCarrierPatterns(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'carrier_patterns')
    .maybeSingle();

  if (error) throw error;
  return data?.setting_value || {};
}

/**
 * Get carrier domain mappings
 */
export async function getCarrierDomains(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'carrier_domains')
    .maybeSingle();

  if (error) throw error;
  return data?.setting_value || {};
}

// ═══════════════════════════════════════════════════════════════════════════
// ✅ CARRIER VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate tracking number against carrier patterns
 */
export async function validateTrackingNumber(trackingNumber: string, carrier?: string): Promise<{
  isValid: boolean;
  detectedCarrier?: string;
  confidence: number;
}> {
  const patterns = await getCarrierPatterns();

  // If carrier is specified, validate against that carrier's pattern
  if (carrier && patterns[carrier]) {
    const regex = new RegExp(patterns[carrier], 'i');
    const isValid = regex.test(trackingNumber);
    return {
      isValid,
      detectedCarrier: carrier,
      confidence: isValid ? 1.0 : 0.0
    };
  }

  // Try to detect carrier from tracking number pattern
  for (const [carrierName, pattern] of Object.entries(patterns)) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(trackingNumber)) {
      return {
        isValid: true,
        detectedCarrier: carrierName,
        confidence: 0.9 // High confidence for pattern match
      };
    }
  }

  // No pattern match found
  return {
    isValid: false,
    confidence: 0.0
  };
}

/**
 * Detect carrier from email domain
 */
export async function detectCarrierFromEmail(emailDomain: string): Promise<string | null> {
  const domains = await getCarrierDomains();
  return domains[emailDomain.toLowerCase()] || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📦 SHIPMENT CREATION & UPDATES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create new shipment from extracted data
 */
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

/**
 * Add shipment items (for partial shipments)
 */
export async function addShipmentItems(
  shipmentId: string,
  items: Array<{
    vendorSku?: string;
    internalSku?: string;
    itemDescription?: string;
    quantityShipped: number;
    quantityOrdered?: number;
    trackingNumber?: string;
    carrier?: string;
  }>
): Promise<ShipmentItem[]> {
  const itemRecords = items.map(item => ({
    shipment_id: shipmentId,
    vendor_sku: item.vendorSku,
    internal_sku: item.internalSku,
    item_description: item.itemDescription,
    quantity_shipped: item.quantityShipped,
    quantity_ordered: item.quantityOrdered,
    tracking_number: item.trackingNumber,
    carrier: item.carrier,
    status: 'pending' as const
  }));

  const { data, error } = await supabase
    .from('po_shipment_items')
    .insert(itemRecords)
    .select();

  if (error) throw error;
  return data || [];
}

/**
 * Update shipment status
 */
export async function updateShipmentStatus(
  shipmentId: string,
  status: ShipmentData['status'],
  additionalData?: {
    actualDeliveryDate?: string;
    notes?: string;
  }
): Promise<void> {
  const updateData: any = {
    status,
    updated_at: new Date().toISOString()
  };

  if (additionalData?.actualDeliveryDate) {
    updateData.actual_delivery_date = additionalData.actualDeliveryDate;
  }

  if (additionalData?.notes) {
    updateData.notes = additionalData.notes;
  }

  const { error } = await supabase
    .from('po_shipment_data')
    .update(updateData)
    .eq('id', shipmentId);

  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📧 SHIPMENT REVIEW & APPROVAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process shipment review result
 */
export async function processShipmentReview(result: ShipmentReviewResult): Promise<void> {
  const now = new Date().toISOString();
  const userId = (await supabase.auth.getUser()).data.user?.id;

  const updateData: any = {
    requires_review: false,
    reviewed_by: userId,
    reviewed_at: now,
    manual_override: true,
    updated_at: now
  };

  // Apply corrections if provided
  if (result.correctedTrackingNumbers) {
    updateData.tracking_numbers = result.correctedTrackingNumbers;
  }

  if (result.correctedCarrier) {
    updateData.carrier = result.correctedCarrier;
    updateData.carrier_confidence = 1.0; // Manual override = high confidence
  }

  if (result.correctedDeliveryDate) {
    updateData.estimated_delivery_date = result.correctedDeliveryDate;
  }

  if (result.overrideReason) {
    updateData.notes = (updateData.notes ? updateData.notes + '\n' : '') +
                      `Review notes: ${result.overrideReason}`;
  }

  const { error } = await supabase
    .from('po_shipment_data')
    .update(updateData)
    .eq('id', result.shipmentId);

  if (error) throw error;

  // Create tracking event for the review
  await createTrackingEvent({
    shipmentId: result.shipmentId,
    eventType: 'status_update',
    status: 'reviewed',
    description: `Shipment reviewed and ${result.action === 'approve' ? 'approved' : 'corrected'}`,
    source: 'manual',
    rawData: {
      action: result.action,
      reviewer: userId,
      corrections: {
        trackingNumbers: result.correctedTrackingNumbers,
        carrier: result.correctedCarrier,
        deliveryDate: result.correctedDeliveryDate
      },
      notes: result.reviewerNotes
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TRACKING EVENTS & STATUS UPDATES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create tracking event
 */
export async function createTrackingEvent(event: {
  shipmentId: string;
  shipmentItemId?: string;
  eventType: ShipmentTrackingEvent['eventType'];
  status: string;
  description?: string;
  carrier?: string;
  trackingNumber?: string;
  carrierLocation?: string;
  carrierTimestamp?: string;
  source: ShipmentTrackingEvent['source'];
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

/**
 * Update shipment from carrier API/AfterShip
 */
export async function updateShipmentFromCarrier(
  shipmentId: string,
  carrierUpdate: {
    status: string;
    location?: string;
    timestamp?: string;
    description?: string;
    trackingNumber?: string;
  }
): Promise<void> {
  // Update shipment status if it's a final status
  const finalStatuses = ['delivered', 'exception', 'cancelled'];
  if (finalStatuses.includes(carrierUpdate.status.toLowerCase())) {
    const status = carrierUpdate.status.toLowerCase() as ShipmentData['status'];
    const additionalData: any = {};

    if (status === 'delivered' && carrierUpdate.timestamp) {
      additionalData.actualDeliveryDate = carrierUpdate.timestamp;
    }

    await updateShipmentStatus(shipmentId, status, additionalData);
  }

  // Create tracking event
  await createTrackingEvent({
    shipmentId,
    eventType: carrierUpdate.status === 'delivered' ? 'delivery_confirmation' : 'status_update',
    status: carrierUpdate.status,
    description: carrierUpdate.description,
    carrierLocation: carrierUpdate.location,
    carrierTimestamp: carrierUpdate.timestamp,
    trackingNumber: carrierUpdate.trackingNumber,
    source: 'aftership'
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 🚨 ALERTS & MONITORING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get shipment alerts
 */
export async function getShipmentAlerts(): Promise<ShipmentAlert[]> {
  const { data, error } = await supabase
    .rpc('get_shipment_alerts');

  if (error) throw error;
  return data || [];
}

/**
 * Get overdue shipments
 */
export async function getOverdueShipments(): Promise<Array<{
  shipment: ShipmentData;
  po: any;
  daysOverdue: number;
}>> {
  const { data, error } = await supabase
    .from('po_shipment_data')
    .select(`
      *,
      purchase_orders (
        id,
        order_id,
        supplier_name
      )
    `)
    .eq('status', 'shipped')
    .lt('estimated_delivery_date', new Date().toISOString().split('T')[0])
    .order('estimated_delivery_date', { ascending: true });

  if (error) throw error;

  return (data || []).map(row => ({
    shipment: row,
    po: row.purchase_orders,
    daysOverdue: Math.floor((Date.now() - new Date(row.estimated_delivery_date).getTime()) / (1000 * 60 * 60 * 24))
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔗 INTEGRATION WITH EXISTING TRACKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sync shipment data with PO tracking columns
 */
export async function syncShipmentWithPOTracking(shipmentId: string): Promise<void> {
  const details = await getShipmentDetails(shipmentId);
  if (!details) return;

  const { shipment } = details;
  const primaryTracking = shipment.trackingNumbers[0];

  // Update PO tracking columns (legacy support)
  await supabase
    .from('purchase_orders')
    .update({
      tracking_status: shipment.status,
      tracking_carrier: shipment.carrier,
      tracking_number: primaryTracking,
      tracking_estimated_delivery: shipment.estimatedDeliveryDate,
      tracking_last_updated: new Date().toISOString()
    })
    .eq('id', shipment.poId);
}

/**
 * Get shipment summary for PO
 */
export async function getPOShipmentSummary(poId: string): Promise<{
  totalShipments: number;
  totalShipped: number;
  totalOrdered: number;
  deliveredShipments: number;
  inTransitShipments: number;
  pendingShipments: number;
  estimatedDeliveryDates: string[];
}> {
  const { data, error } = await supabase
    .rpc('get_po_shipment_data', { po_id: poId });

  if (error) throw error;

  const shipments = data || [];
  const summary = {
    totalShipments: shipments.length,
    totalShipped: shipments.reduce((sum, s) => sum + (s.total_quantity_shipped || 0), 0),
    totalOrdered: shipments.reduce((sum, s) => sum + (s.total_quantity_ordered || 0), 0),
    deliveredShipments: shipments.filter(s => s.status === 'delivered').length,
    inTransitShipments: shipments.filter(s => ['in_transit', 'out_for_delivery'].includes(s.status)).length,
    pendingShipments: shipments.filter(s => s.status === 'pending').length,
    estimatedDeliveryDates: shipments
      .map(s => s.estimated_delivery)
      .filter(Boolean)
      .sort()
  };

  return summary;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 ANALYTICS & REPORTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get shipment tracking statistics
 */
export async function getShipmentTrackingStats(): Promise<{
  totalShipments: number;
  deliveredShipments: number;
  onTimeDeliveries: number;
  lateDeliveries: number;
  averageTransitTime: number;
  carrierPerformance: Record<string, {
    total: number;
    onTime: number;
    late: number;
    averageDelay: number;
  }>;
}> {
  // This would aggregate data from shipment tables
  // Implementation depends on specific reporting needs
  const { data, error } = await supabase
    .rpc('get_shipment_tracking_stats');

  if (error) {
    // Fallback if RPC doesn't exist
    return {
      totalShipments: 0,
      deliveredShipments: 0,
      onTimeDeliveries: 0,
      lateDeliveries: 0,
      averageTransitTime: 0,
      carrierPerformance: {}
    };
  }

  return data;
}

/**
 * Get carrier performance metrics
 */
export async function getCarrierPerformance(): Promise<Array<{
  carrier: string;
  totalShipments: number;
  onTimePercentage: number;
  averageTransitDays: number;
  exceptionRate: number;
}>> {
  const { data, error } = await supabase
    .from('po_shipment_data')
    .select('carrier, status, ship_date, actual_delivery_date, estimated_delivery_date')
    .not('carrier', 'is', null)
    .in('status', ['delivered', 'exception']);

  if (error) throw error;

  // Group by carrier and calculate metrics
  const carrierStats: Record<string, {
    total: number;
    onTime: number;
    late: number;
    exceptions: number;
    totalTransitDays: number;
    totalDeliveries: number;
  }> = {};

  (data || []).forEach(shipment => {
    const carrier = shipment.carrier!;
    if (!carrierStats[carrier]) {
      carrierStats[carrier] = { total: 0, onTime: 0, late: 0, exceptions: 0, totalTransitDays: 0, totalDeliveries: 0 };
    }

    carrierStats[carrier].total++;

    if (shipment.status === 'exception') {
      carrierStats[carrier].exceptions++;
    } else if (shipment.actual_delivery_date && shipment.estimated_delivery_date) {
      const actual = new Date(shipment.actual_delivery_date);
      const estimated = new Date(shipment.estimated_delivery_date);
      const transitDays = Math.floor((actual.getTime() - new Date(shipment.ship_date).getTime()) / (1000 * 60 * 60 * 24));

      carrierStats[carrier].totalTransitDays += transitDays;
      carrierStats[carrier].totalDeliveries++;

      if (actual <= estimated) {
        carrierStats[carrier].onTime++;
      } else {
        carrierStats[carrier].late++;
      }
    }
  });

  return Object.entries(carrierStats).map(([carrier, stats]) => ({
    carrier,
    totalShipments: stats.total,
    onTimePercentage: stats.totalDeliveries > 0 ? (stats.onTime / stats.totalDeliveries) * 100 : 0,
    averageTransitDays: stats.totalDeliveries > 0 ? stats.totalTransitDays / stats.totalDeliveries : 0,
    exceptionRate: stats.total > 0 ? (stats.exceptions / stats.total) * 100 : 0
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎁 Export Everything
// ═══════════════════════════════════════════════════════════════════════════

export default {
  // Shipment data management
  getShipmentDataForPO,
  getShipmentDetails,
  getShipmentsRequiringReview,

  // Carrier validation
  getCarrierPatterns,
  getCarrierDomains,
  validateTrackingNumber,
  detectCarrierFromEmail,

  // Shipment creation & updates
  createShipment,
  addShipmentItems,
  updateShipmentStatus,

  // Review & approval
  processShipmentReview,

  // Tracking events
  createTrackingEvent,
  updateShipmentFromCarrier,

  // Alerts & monitoring
  getShipmentAlerts,
  getOverdueShipments,

  // Integration
  syncShipmentWithPOTracking,
  getPOShipmentSummary,

  // Analytics
  getShipmentTrackingStats,
  getCarrierPerformance,
};