/**
 * Vendor Lead Time Tracking & Analysis
 * 
 * Service for calculating and managing vendor lead time metrics based on
 * actual PO commitment-to-delivery timelines. Feeds into vendor confidence scoring.
 */

import { supabase } from '../lib/supabase/client';
import type { PurchaseOrder } from '../types';

export interface POStatusChange {
  id: string;
  poId: string;
  vendorId?: string;
  previousStatus: string | null;
  newStatus: string;
  statusChangedAt: string;
  changedBy?: string;
  notes?: string;
}

export interface VendorLeadTimeMetrics {
  id: string;
  vendorId: string;
  
  // Lead time statistics
  avgLeadDays: number | null;
  medianLeadDays: number | null;
  minLeadDays: number | null;
  maxLeadDays: number | null;
  stddevLeadDays: number | null;
  
  // On-time delivery
  totalPosCompleted: number;
  posOnTime: number;
  posLate: number;
  onTimePercentage: number | null;
  
  // Recent trend (30 days)
  avgLeadDays30d: number | null;
  onTimePercentage30d: number | null;
  recentPosCount: number;
  
  // Confidence scores (0-1)
  leadTimeVarianceScore: number | null;
  leadTimeReliabilityScore: number | null;
  leadTimePredictabilityScore: number | null;
  
  // Metadata
  calculatedAt: string;
  lastUpdatedAt: string;
  updatedBy: string;
}

export interface VendorLeadTimeAnalysis {
  vendorId: string;
  vendorName: string;
  metrics: VendorLeadTimeMetrics;
  leadTimeConfidenceScore: number; // 0-100
  leadTimeRiskLevel: 'Low Risk' | 'Medium Risk' | 'High Risk';
  insights: LeadTimeInsight[];
}

export interface LeadTimeInsight {
  type: 'positive' | 'warning' | 'critical';
  message: string;
  metric: string;
  value: number | string;
}

/**
 * Record a PO status change with automatic timestamp tracking
 */
export async function recordPOStatusChange(
  poId: string,
  vendorId: string | undefined,
  newStatus: string,
  previousStatus: string | null = null,
  notes?: string
): Promise<{ success: boolean; data?: POStatusChange; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('po_status_history')
      .insert({
        po_id: poId,
        vendor_id: vendorId,
        new_status: newStatus,
        previous_status: previousStatus,
        notes
      })
      .select()
      .single();

    if (error) throw error;
    
    return { 
      success: true, 
      data: data ? {
        id: data.id,
        poId: data.po_id,
        vendorId: data.vendor_id,
        previousStatus: data.previous_status,
        newStatus: data.new_status,
        statusChangedAt: data.status_changed_at,
        changedBy: data.changed_by,
        notes: data.notes
      } : undefined
    };
  } catch (error) {
    console.error('[Lead Time Tracking] Failed to record status change:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Mark a PO as committed (when status transitions to confirmed/committed)
 */
export async function markPOCommitted(poId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('purchase_orders')
      .update({ committed_at: new Date().toISOString() })
      .eq('id', poId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('[Lead Time Tracking] Failed to mark PO committed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Mark a PO as received (when status transitions to received)
 */
export async function markPOReceived(poId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('purchase_orders')
      .update({ received_at: new Date().toISOString() })
      .eq('id', poId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('[Lead Time Tracking] Failed to mark PO received:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Calculate and update lead time metrics for a vendor
 */
export async function calculateVendorLeadTimeMetrics(
  vendorId: string
): Promise<{ success: boolean; data?: VendorLeadTimeMetrics; error?: string }> {
  try {
    const { data, error } = await supabase
      .rpc('calculate_vendor_lead_time_metrics', { 
        p_vendor_id: vendorId 
      });

    if (error) throw error;
    
    return { 
      success: true, 
      data: data ? {
        id: vendorId,
        vendorId,
        avgLeadDays: data.avg_lead_days,
        medianLeadDays: data.median_lead_days,
        minLeadDays: data.min_lead_days,
        maxLeadDays: data.max_lead_days,
        stddevLeadDays: data.stddev_lead_days,
        totalPosCompleted: data.pos_completed,
        posOnTime: data.pos_on_time,
        posLate: (data.pos_completed || 0) - (data.pos_on_time || 0),
        onTimePercentage: data.on_time_percentage,
        avgLeadDays30d: null,
        onTimePercentage30d: null,
        recentPosCount: 0,
        leadTimeVarianceScore: null,
        leadTimeReliabilityScore: null,
        leadTimePredictabilityScore: null,
        calculatedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        updatedBy: 'system'
      } : undefined
    };
  } catch (error) {
    console.error('[Lead Time Tracking] Failed to calculate metrics:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Get comprehensive lead time analysis for a vendor
 */
export async function getVendorLeadTimeAnalysis(
  vendorId: string
): Promise<{ success: boolean; data?: VendorLeadTimeAnalysis; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('vendor_lead_time_analysis')
      .select('*')
      .eq('id', vendorId)
      .single();

    if (error) throw error;
    
    if (!data) {
      return { success: false, error: 'Vendor not found' };
    }

    // Generate insights
    const insights: LeadTimeInsight[] = [];
    
    if (data.on_time_percentage >= 95) {
      insights.push({
        type: 'positive',
        message: 'Excellent on-time delivery performance',
        metric: 'On-Time %',
        value: `${data.on_time_percentage}%`
      });
    } else if (data.on_time_percentage < 70) {
      insights.push({
        type: 'critical',
        message: 'Consistent delivery delays - consider alternative vendors',
        metric: 'On-Time %',
        value: `${data.on_time_percentage}%`
      });
    }

    if (data.stddev_lead_days && data.stddev_lead_days < 1) {
      insights.push({
        type: 'positive',
        message: 'Highly predictable lead times',
        metric: 'Std Dev',
        value: `${data.stddev_lead_days.toFixed(2)} days`
      });
    } else if (data.stddev_lead_days && data.stddev_lead_days > 5) {
      insights.push({
        type: 'warning',
        message: 'Highly variable lead times - plan with larger buffers',
        metric: 'Std Dev',
        value: `${data.stddev_lead_days.toFixed(2)} days`
      });
    }

    if (data.avg_lead_days_30d && data.avg_lead_days !== null && 
        data.avg_lead_days_30d < data.avg_lead_days * 0.8) {
      insights.push({
        type: 'positive',
        message: 'Recent performance improving - faster lead times',
        metric: '30d Avg vs All-time',
        value: `${data.avg_lead_days_30d.toFixed(1)} vs ${data.avg_lead_days.toFixed(1)} days`
      });
    }

    return {
      success: true,
      data: {
        vendorId,
        vendorName: data.name || 'Unknown',
        metrics: {
          id: vendorId,
          vendorId,
          avgLeadDays: data.avg_lead_days,
          medianLeadDays: data.median_lead_days,
          minLeadDays: data.min_lead_days,
          maxLeadDays: data.max_lead_days,
          stddevLeadDays: data.stddev_lead_days,
          totalPosCompleted: data.total_pos_completed || 0,
          posOnTime: data.pos_on_time || 0,
          posLate: data.pos_late || 0,
          onTimePercentage: data.on_time_percentage,
          avgLeadDays30d: data.avg_lead_days_30d,
          onTimePercentage30d: data.on_time_percentage_30d,
          recentPosCount: data.recent_pos_count || 0,
          leadTimeVarianceScore: data.lead_time_variance_score,
          leadTimeReliabilityScore: data.lead_time_reliability_score,
          leadTimePredictabilityScore: data.lead_time_predictability_score,
          calculatedAt: data.calculated_at || new Date().toISOString(),
          lastUpdatedAt: data.last_updated_at || new Date().toISOString(),
          updatedBy: 'system'
        },
        leadTimeConfidenceScore: data.lead_time_confidence_score || 0,
        leadTimeRiskLevel: data.lead_time_risk_level || 'Medium Risk',
        insights
      }
    };
  } catch (error) {
    console.error('[Lead Time Tracking] Failed to get analysis:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Get all vendors ranked by lead time confidence
 */
export async function getVendorsByLeadTimeConfidence(
  limit = 20,
  riskFilter?: 'Low Risk' | 'Medium Risk' | 'High Risk'
): Promise<{ success: boolean; data?: VendorLeadTimeAnalysis[]; error?: string }> {
  try {
    let query = supabase
      .from('vendor_lead_time_analysis')
      .select('*')
      .order('lead_time_confidence_score', { ascending: false })
      .limit(limit);

    if (riskFilter) {
      query = query.eq('lead_time_risk_level', riskFilter);
    }

    const { data, error } = await query;

    if (error) throw error;

    const results = data?.map(row => ({
      vendorId: row.id,
      vendorName: row.name || 'Unknown',
      metrics: {
        id: row.id,
        vendorId: row.id,
        avgLeadDays: row.avg_lead_days,
        medianLeadDays: row.median_lead_days,
        minLeadDays: row.min_lead_days,
        maxLeadDays: row.max_lead_days,
        stddevLeadDays: row.stddev_lead_days,
        totalPosCompleted: row.total_pos_completed || 0,
        posOnTime: row.pos_on_time || 0,
        posLate: row.pos_late || 0,
        onTimePercentage: row.on_time_percentage,
        avgLeadDays30d: row.avg_lead_days_30d,
        onTimePercentage30d: row.on_time_percentage_30d,
        recentPosCount: row.recent_pos_count || 0,
        leadTimeVarianceScore: row.lead_time_variance_score,
        leadTimeReliabilityScore: row.lead_time_reliability_score,
        leadTimePredictabilityScore: row.lead_time_predictability_score,
        calculatedAt: row.last_updated_at,
        lastUpdatedAt: row.last_updated_at,
        updatedBy: 'system'
      },
      leadTimeConfidenceScore: row.lead_time_confidence_score || 0,
      leadTimeRiskLevel: row.lead_time_risk_level || 'Medium Risk',
      insights: []
    })) || [];

    return { success: true, data: results };
  } catch (error) {
    console.error('[Lead Time Tracking] Failed to get vendors ranking:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Get PO status history for a specific order
 */
export async function getPOStatusHistory(
  poId: string
): Promise<{ success: boolean; data?: POStatusChange[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('po_status_history')
      .select('*')
      .eq('po_id', poId)
      .order('status_changed_at', { ascending: true });

    if (error) throw error;

    const results = data?.map(row => ({
      id: row.id,
      poId: row.po_id,
      vendorId: row.vendor_id,
      previousStatus: row.previous_status,
      newStatus: row.new_status,
      statusChangedAt: row.status_changed_at,
      changedBy: row.changed_by,
      notes: row.notes
    })) || [];

    return { success: true, data: results };
  } catch (error) {
    console.error('[Lead Time Tracking] Failed to get status history:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Calculate recommended lead time buffer for a vendor based on metrics
 */
export function calculateRecommendedLeadTimeBuffer(metrics: VendorLeadTimeMetrics): number {
  if (!metrics.avgLeadDays || !metrics.stddevLeadDays) {
    return 7; // Default 7-day buffer if no data
  }

  // Formula: avg lead time + (2 * stddev) for 95% confidence interval
  // Minimum buffer of 2 days
  const buffer = Math.max(
    2,
    Math.ceil(metrics.avgLeadDays + (2 * metrics.stddevLeadDays))
  );

  return buffer;
}

/**
 * Calculate vendor's predicted lead time for a new order
 */
export function calculatePredictedLeadTime(metrics: VendorLeadTimeMetrics): number {
  if (!metrics.avgLeadDays) {
    return 14; // Default 2-week estimate
  }

  // Use recent 30-day average if available and more than 5 POs
  if (metrics.avgLeadDays30d && metrics.recentPosCount > 5) {
    return Math.ceil(metrics.avgLeadDays30d);
  }

  return Math.ceil(metrics.avgLeadDays);
}

export default {
  recordPOStatusChange,
  markPOCommitted,
  markPOReceived,
  calculateVendorLeadTimeMetrics,
  getVendorLeadTimeAnalysis,
  getVendorsByLeadTimeConfidence,
  getPOStatusHistory,
  calculateRecommendedLeadTimeBuffer,
  calculatePredictedLeadTime
};
