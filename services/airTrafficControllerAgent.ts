/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ✈️ AIR TRAFFIC CONTROLLER AGENT - Intelligent Alert Prioritization
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This agent determines which PO delays are CRITICAL vs INFORMATIONAL
 * based on actual stock impact, not just "it's late."
 *
 * Example Decision Logic:
 *
 * Scenario 1:
 * - PO #105 delayed 3 days
 * - Contains: Citric Acid
 * - Current stock: 45 days
 * - Decision: UPDATE DATE, NO ALERT (informational only)
 *
 * Scenario 2:
 * - PO #106 delayed 3 days
 * - Contains: Bottles
 * - Current stock: 2 days
 * - Decision: CRITICAL ALERT + Draft vendor email
 *
 * @module services/airTrafficControllerAgent
 */

import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Types
// ═══════════════════════════════════════════════════════════════════════════

export interface PODelayAlert {
  po_id: string;
  order_id: string;
  vendor_name: string;
  delay_days: number;
  priority_level: 'critical' | 'high' | 'medium' | 'low';
  is_production_blocking: boolean;
  affected_items: Array<{
    sku: string;
    name: string;
    current_stock: number;
    days_of_stock: number;
    will_stockout: boolean;
  }>;
  reasoning: string;
  recommended_action: string;
  draft_vendor_email?: string;
}

export interface ImpactAssessment {
  is_critical: boolean;
  priority_level: 'critical' | 'high' | 'medium' | 'low';
  reasoning: string;
  affected_items: any[];
  recommended_action: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 Core Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Assess impact of a PO delay
 * Returns prioritized alert or null if not critical
 */
export async function assessPODelay(
  poId: string,
  delayDays: number,
  newExpectedDate?: string
): Promise<PODelayAlert | null> {
  try {
    // Call database function to assess impact
    const { data: assessment, error } = await supabase
      .rpc('assess_po_delay_impact', {
        p_po_id: poId,
        p_delay_days: delayDays,
      })
      .single();

    if (error || !assessment) {
      console.error('Failed to assess PO delay:', error);
      return null;
    }

    // Get PO details
    const { data: po } = await supabase
      .from('purchase_orders')
      .select('order_id, supplier_name, vendor_id')
      .eq('id', poId)
      .single();

    if (!po) return null;

    // If not critical, just update date and return null (no alert)
    if (!assessment.is_critical && assessment.priority_level === 'low') {
      // Silently update expected date
      if (newExpectedDate) {
        await supabase
          .from('purchase_orders')
          .update({ expected_date: newExpectedDate })
          .eq('id', poId);
      }
      return null; // No alert needed
    }

    // Critical or high priority - create alert
    const alert: PODelayAlert = {
      po_id: poId,
      order_id: po.order_id,
      vendor_name: po.supplier_name,
      delay_days: delayDays,
      priority_level: assessment.priority_level as any,
      is_production_blocking: assessment.is_critical,
      affected_items: assessment.affected_items || [],
      reasoning: assessment.reasoning,
      recommended_action: assessment.recommended_action,
    };

    // If critical, draft vendor email
    if (assessment.is_critical) {
      alert.draft_vendor_email = draftVendorEmail(po, assessment, delayDays);
    }

    // Log the alert
    await logAlert(alert);

    return alert;
  } catch (error) {
    console.error('Error assessing PO delay:', error);
    return null;
  }
}

/**
 * Process all open POs for potential delays
 * Called by tracking webhook or cron job
 */
export async function scanOpenPOsForDelays(): Promise<PODelayAlert[]> {
  try {
    const alerts: PODelayAlert[] = [];

    // Get all open POs with expected dates
    const { data: openPOs, error } = await supabase
      .from('purchase_orders')
      .select('id, order_id, expected_date, supplier_name')
      .in('status', ['pending', 'sent', 'confirmed'])
      .not('expected_date', 'is', null);

    if (error || !openPOs) {
      return [];
    }

    const today = new Date();

    for (const po of openPOs) {
      const expectedDate = new Date(po.expected_date);
      const daysDiff = Math.floor(
        (expectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      // If expected date is in the past (late), assess impact
      if (daysDiff < 0) {
        const delayDays = Math.abs(daysDiff);
        const alert = await assessPODelay(po.id, delayDays);

        if (alert) {
          alerts.push(alert);
        }
      }
      // If expected date is within 3 days and no tracking update, warn
      else if (daysDiff <= 3 && daysDiff >= 0) {
        // Check if we have recent tracking update
        const { data: tracking } = await supabase
          .from('po_tracking_events')
          .select('event_type, event_date')
          .eq('po_id', po.id)
          .order('event_date', { ascending: false })
          .limit(1)
          .single();

        if (!tracking || tracking.event_type === 'created') {
          // No tracking update - potential delay
          const alert = await assessPODelay(po.id, 0);
          if (alert) {
            alerts.push({
              ...alert,
              reasoning: `PO due in ${daysDiff} days but no tracking update. ${alert.reasoning}`,
              priority_level: 'medium',
            });
          }
        }
      }
    }

    return alerts.filter(a => a.priority_level !== 'low');
  } catch (error) {
    console.error('Error scanning open POs:', error);
    return [];
  }
}

/**
 * Get prioritized alert feed
 * Returns what user should pay attention to RIGHT NOW
 */
export async function getPrioritizedAlerts(
  limit: number = 10
): Promise<PODelayAlert[]> {
  try {
    // Get recent alerts from log
    const { data: recentAlerts, error } = await supabase
      .from('po_alert_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit * 2); // Get more than needed for filtering

    if (error || !recentAlerts) {
      return [];
    }

    // Filter out resolved alerts
    const activeAlerts = recentAlerts.filter(
      a => !a.resolved_at && a.priority_level !== 'low'
    );

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return activeAlerts
      .sort((a, b) => priorityOrder[a.priority_level] - priorityOrder[b.priority_level])
      .slice(0, limit)
      .map(a => ({
        po_id: a.po_id,
        order_id: a.order_id,
        vendor_name: a.vendor_name,
        delay_days: a.delay_days,
        priority_level: a.priority_level,
        is_production_blocking: a.is_production_blocking,
        affected_items: a.affected_items || [],
        reasoning: a.reasoning,
        recommended_action: a.recommended_action,
        draft_vendor_email: a.draft_vendor_email,
      }));
  } catch (error) {
    console.error('Error getting prioritized alerts:', error);
    return [];
  }
}

/**
 * Mark alert as resolved
 */
export async function resolveAlert(
  poId: string,
  resolution: string
): Promise<void> {
  await supabase
    .from('po_alert_log')
    .update({
      resolved_at: new Date().toISOString(),
      resolution,
    })
    .eq('po_id', poId)
    .is('resolved_at', null);
}

// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Draft email to vendor for expediting
 */
function draftVendorEmail(
  po: any,
  assessment: ImpactAssessment,
  delayDays: number
): string {
  const criticalItems = assessment.affected_items
    .filter(item => item.will_stockout)
    .map(item => `  - ${item.name} (${item.sku}): ${item.days_of_stock} days of stock remaining`)
    .join('\n');

  return `Subject: URGENT: Expedite PO ${po.order_id} - Production at Risk

Dear ${po.supplier_name} Team,

We need to expedite PO ${po.order_id} immediately due to critical stock shortages.

Current Situation:
- PO is delayed by ${delayDays} days
- The following items are at risk of stockout:

${criticalItems}

Impact:
${assessment.reasoning}

Action Needed:
${assessment.recommended_action}

Please confirm expedited shipping and provide updated ETA within 2 hours.

Thank you,
[Your Name]`;
}

/**
 * Log alert to database
 */
async function logAlert(alert: PODelayAlert): Promise<void> {
  try {
    // Create alert log table if it doesn't exist (will be in migration)
    await supabase.from('po_alert_log').insert({
      po_id: alert.po_id,
      order_id: alert.order_id,
      vendor_name: alert.vendor_name,
      delay_days: alert.delay_days,
      priority_level: alert.priority_level,
      is_production_blocking: alert.is_production_blocking,
      affected_items: alert.affected_items,
      reasoning: alert.reasoning,
      recommended_action: alert.recommended_action,
      draft_vendor_email: alert.draft_vendor_email,
    });
  } catch (error) {
    console.error('Failed to log alert:', error);
  }
}

/**
 * Get statistics for dashboard
 */
export async function getAlertStatistics(): Promise<{
  total_open_alerts: number;
  critical_alerts: number;
  high_priority_alerts: number;
  average_resolution_time_hours: number;
}> {
  try {
    const { data: stats } = await supabase
      .from('po_alert_log')
      .select('priority_level, created_at, resolved_at')
      .is('resolved_at', null);

    if (!stats) {
      return {
        total_open_alerts: 0,
        critical_alerts: 0,
        high_priority_alerts: 0,
        average_resolution_time_hours: 0,
      };
    }

    return {
      total_open_alerts: stats.length,
      critical_alerts: stats.filter(s => s.priority_level === 'critical').length,
      high_priority_alerts: stats.filter(s => s.priority_level === 'high').length,
      average_resolution_time_hours: 0, // TODO: Calculate from resolved alerts
    };
  } catch (error) {
    console.error('Error getting alert statistics:', error);
    return {
      total_open_alerts: 0,
      critical_alerts: 0,
      high_priority_alerts: 0,
      average_resolution_time_hours: 0,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎁 Export
// ═══════════════════════════════════════════════════════════════════════════

export default {
  assessPODelay,
  scanOpenPOsForDelays,
  getPrioritizedAlerts,
  resolveAlert,
  getAlertStatistics,
};
