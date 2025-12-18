/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎨 ARTWORK APPROVAL AGENT - Intelligent Approval Routing & Escalation
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This agent monitors artwork approval workflow and ensures timely processing.
 *
 * Key Behaviors:
 * 1. Routes artwork to correct approver based on customer tier and complexity
 * 2. Auto-approves repeat customers with similar designs (if configured)
 * 3. Escalates stuck approvals after SLA breach
 * 4. Tracks approval bottlenecks and suggests process improvements
 *
 * Example:
 * - New customer uploads custom label artwork
 * - Agent routes to design manager for approval
 * - After 24 hours with no response, agent escalates to senior manager
 * - Agent suggests adding second approver for faster turnaround
 *
 * @module services/artworkApprovalAgent
 */

import { supabase } from '../lib/supabase/client';

export interface ArtworkApprovalAgentConfig {
  approval_sla_hours: number;
  escalation_threshold_hours: number;
  auto_approve_repeat_customers: boolean;
  require_double_approval_new_customers: boolean;
  notify_after_hours: number;
  escalate_to_manager_after: number;
}

export interface ArtworkApprovalAlert {
  artwork_id: string;
  artwork_name: string;
  customer_name: string;
  submitted_at: string;
  hours_pending: number;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  recommended_action: string;
  assigned_to: string | null;
}

const DEFAULT_CONFIG: ArtworkApprovalAgentConfig = {
  approval_sla_hours: 24,
  escalation_threshold_hours: 48,
  auto_approve_repeat_customers: true,
  require_double_approval_new_customers: true,
  notify_after_hours: 4,
  escalate_to_manager_after: 48,
};

/**
 * Get all artwork stuck in approval workflow
 */
export async function getStuckApprovals(
  config: Partial<ArtworkApprovalAgentConfig> = {}
): Promise<ArtworkApprovalAlert[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const alerts: ArtworkApprovalAlert[] = [];

  try {
    // Get all pending artwork submissions
    const { data: artworkFiles, error } = await supabase
      .from('artwork_files')
      .select(`
        id,
        filename,
        status,
        created_at,
        artwork:artwork_submissions(customer_name)
      `)
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!artworkFiles) return alerts;

    const now = new Date();

    for (const artwork of artworkFiles) {
      const submittedAt = new Date(artwork.created_at);
      const hoursPending = (now.getTime() - submittedAt.getTime()) / (1000 * 60 * 60);

      let severity: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO';
      let message = '';
      let recommendedAction = '';

      if (hoursPending > cfg.escalation_threshold_hours) {
        severity = 'CRITICAL';
        message = `Artwork stuck for ${Math.floor(hoursPending)} hours (>${cfg.escalation_threshold_hours}h SLA breach)`;
        recommendedAction = 'ESCALATE to senior management immediately';
      } else if (hoursPending > cfg.approval_sla_hours) {
        severity = 'WARNING';
        message = `Artwork pending ${Math.floor(hoursPending)} hours (>${cfg.approval_sla_hours}h SLA)`;
        recommendedAction = 'Send reminder to assigned approver';
      } else if (hoursPending > cfg.notify_after_hours) {
        severity = 'INFO';
        message = `Artwork pending ${Math.floor(hoursPending)} hours`;
        recommendedAction = 'Monitor - notify if exceeds 24h';
      }

      if (message) {
        alerts.push({
          artwork_id: artwork.id,
          artwork_name: artwork.filename,
          customer_name: (artwork.artwork as any)?.[0]?.customer_name || 'Unknown',
          submitted_at: artwork.created_at,
          hours_pending: Math.floor(hoursPending),
          severity,
          message,
          recommended_action: recommendedAction,
          assigned_to: null, // TODO: Track approver assignments
        });
      }
    }

    return alerts;
  } catch (error) {
    console.error('[ArtworkApprovalAgent] Error getting stuck approvals:', error);
    return [];
  }
}

/**
 * Check if artwork should be auto-approved based on customer history
 */
export async function shouldAutoApprove(
  artworkId: string,
  customerId: string
): Promise<{ autoApprove: boolean; reason: string }> {
  try {
    // Get customer's approval history
    const { data: history, error } = await supabase
      .from('artwork_files')
      .select('id, status, created_at')
      .eq('created_by', customerId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    // If customer has 5+ approved artworks, auto-approve
    if (history && history.length >= 5) {
      return {
        autoApprove: true,
        reason: `Customer has ${history.length} previously approved artworks - low risk`,
      };
    }

    // New customer - require manual approval
    return {
      autoApprove: false,
      reason: history && history.length > 0
        ? `Customer has only ${history.length} approved artwork(s) - manual review required`
        : 'New customer - manual review required',
    };
  } catch (error) {
    console.error('[ArtworkApprovalAgent] Error checking auto-approval:', error);
    return { autoApprove: false, reason: 'Error checking history' };
  }
}

/**
 * Get approval bottleneck analysis
 */
export async function getApprovalBottlenecks(): Promise<{
  avgApprovalTime: number;
  longestPending: number;
  totalPending: number;
  approverWorkload: Record<string, number>;
}> {
  try {
    const { data: pending } = await supabase
      .from('artwork_files')
      .select('id, created_at')
      .eq('status', 'pending_approval');

    if (!pending || pending.length === 0) {
      return {
        avgApprovalTime: 0,
        longestPending: 0,
        totalPending: 0,
        approverWorkload: {},
      };
    }

    const now = new Date();
    const pendingTimes = pending.map(
      p => (now.getTime() - new Date(p.created_at).getTime()) / (1000 * 60 * 60)
    );

    return {
      avgApprovalTime: pendingTimes.reduce((a, b) => a + b, 0) / pendingTimes.length,
      longestPending: Math.max(...pendingTimes),
      totalPending: pending.length,
      approverWorkload: {}, // TODO: Track approver assignments
    };
  } catch (error) {
    console.error('[ArtworkApprovalAgent] Error getting bottlenecks:', error);
    return {
      avgApprovalTime: 0,
      longestPending: 0,
      totalPending: 0,
      approverWorkload: {},
    };
  }
}

export default {
  getStuckApprovals,
  shouldAutoApprove,
  getApprovalBottlenecks,
};
