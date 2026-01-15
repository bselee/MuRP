/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔒 SLACK QUALITY GATE - Alert Verification Before Sending
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ensures alerts are verified and deduplicated before sending to Slack.
 * Prevents alert fatigue and maintains notification quality.
 *
 * Quality Rules:
 * 1. Deduplication: Don't send same alert within cooldown period
 * 2. Batching: Group related alerts into single message
 * 3. Severity threshold: Only send alerts above configured threshold
 * 4. Business hours: Optionally respect quiet hours
 * 5. Verification: Log all alerts for audit trail
 */

import { supabase } from '../lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export interface AlertQueueItem {
  id: string;
  alert_type: 'stockout' | 'po_overdue' | 'requisition' | 'agent_action' | 'invoice' | 'system';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  payload: Record<string, unknown>;
  created_at: string;
  verified_at?: string;
  sent_at?: string;
  suppressed_reason?: string;
  dedup_key: string;
}

export interface QualityGateConfig {
  // Deduplication cooldown in minutes
  dedup_cooldown_minutes: number;
  // Minimum severity to send (critical > high > medium > low > info)
  min_severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  // Batch window in seconds (group alerts within this window)
  batch_window_seconds: number;
  // Quiet hours (24h format, e.g., "22:00" to "07:00")
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  quiet_hours_timezone?: string;
  // Max alerts per hour (rate limiting)
  max_alerts_per_hour: number;
  // Auto-verify alerts below certain severity
  auto_verify_below_severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
}

export interface VerificationResult {
  allowed: boolean;
  reason: string;
  suppressed?: boolean;
  queued?: boolean;
  deferred_until?: string;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: QualityGateConfig = {
  dedup_cooldown_minutes: 60, // Don't repeat same alert for 1 hour
  min_severity: 'medium', // Only send medium+ alerts
  batch_window_seconds: 30, // Batch alerts within 30 seconds
  max_alerts_per_hour: 20, // Max 20 alerts per hour
  auto_verify_below_severity: 'high', // Auto-verify high and below
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

// ============================================================================
// QUALITY GATE FUNCTIONS
// ============================================================================

/**
 * Load quality gate configuration from database or use defaults
 */
export async function getQualityGateConfig(): Promise<QualityGateConfig> {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'slack_quality_gate_config')
      .single();

    if (data?.setting_value) {
      return { ...DEFAULT_CONFIG, ...data.setting_value };
    }
  } catch {
    // Ignore errors, use defaults
  }
  return DEFAULT_CONFIG;
}

/**
 * Save quality gate configuration
 */
export async function saveQualityGateConfig(config: Partial<QualityGateConfig>): Promise<{ success: boolean; error?: string }> {
  try {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };

    const { error } = await supabase
      .from('app_settings')
      .upsert({
        setting_key: 'slack_quality_gate_config',
        setting_value: fullConfig,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Generate deduplication key for an alert
 */
function generateDedupKey(alertType: string, payload: Record<string, unknown>): string {
  // Create a unique key based on alert type and key identifiers
  const keyParts: string[] = [alertType];

  switch (alertType) {
    case 'stockout':
      keyParts.push(String(payload.sku || ''));
      keyParts.push(String(payload.urgency || ''));
      break;
    case 'po_overdue':
      keyParts.push(String(payload.poNumber || ''));
      break;
    case 'requisition':
      keyParts.push(String(payload.requisitionId || ''));
      keyParts.push(String(payload.action || ''));
      break;
    case 'agent_action':
      keyParts.push(String(payload.agentName || ''));
      keyParts.push(String(payload.actionType || ''));
      break;
    case 'invoice':
      keyParts.push(String(payload.invoiceNumber || ''));
      break;
    default:
      keyParts.push(JSON.stringify(payload).slice(0, 100));
  }

  return keyParts.join(':');
}

/**
 * Check if alert is within quiet hours
 */
function isInQuietHours(config: QualityGateConfig): boolean {
  if (!config.quiet_hours_start || !config.quiet_hours_end) {
    return false;
  }

  const now = new Date();
  const timezone = config.quiet_hours_timezone || 'America/New_York';

  // Get current time in configured timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  });
  const currentTime = formatter.format(now);

  const [currentHour, currentMinute] = currentTime.split(':').map(Number);
  const currentMinutes = currentHour * 60 + currentMinute;

  const [startHour, startMinute] = config.quiet_hours_start.split(':').map(Number);
  const [endHour, endMinute] = config.quiet_hours_end.split(':').map(Number);
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  // Handle overnight quiet hours (e.g., 22:00 to 07:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

/**
 * Check if we've exceeded rate limit
 */
async function isRateLimited(config: QualityGateConfig): Promise<boolean> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count } = await supabase
      .from('slack_alert_queue')
      .select('*', { count: 'exact', head: true })
      .gte('sent_at', oneHourAgo)
      .not('sent_at', 'is', null);

    return (count || 0) >= config.max_alerts_per_hour;
  } catch {
    return false; // Don't block on error
  }
}

/**
 * Check if alert is a duplicate within cooldown
 */
async function isDuplicate(dedupKey: string, config: QualityGateConfig): Promise<boolean> {
  try {
    const cooldownTime = new Date(
      Date.now() - config.dedup_cooldown_minutes * 60 * 1000
    ).toISOString();

    const { data } = await supabase
      .from('slack_alert_queue')
      .select('id')
      .eq('dedup_key', dedupKey)
      .gte('created_at', cooldownTime)
      .not('suppressed_reason', 'is', null)
      .limit(1);

    return (data?.length || 0) > 0;
  } catch {
    return false; // Don't block on error
  }
}

/**
 * Main quality gate check - verify if alert should be sent
 */
export async function verifyAlert(
  alertType: AlertQueueItem['alert_type'],
  severity: AlertQueueItem['severity'],
  payload: Record<string, unknown>
): Promise<VerificationResult> {
  const config = await getQualityGateConfig();
  const dedupKey = generateDedupKey(alertType, payload);

  // 1. Check severity threshold
  if (SEVERITY_ORDER[severity] < SEVERITY_ORDER[config.min_severity]) {
    return {
      allowed: false,
      reason: `Severity ${severity} below threshold ${config.min_severity}`,
      suppressed: true,
    };
  }

  // 2. Check quiet hours (except for critical alerts)
  if (severity !== 'critical' && isInQuietHours(config)) {
    const endTime = config.quiet_hours_end;
    return {
      allowed: false,
      reason: `Deferred until ${endTime} (quiet hours)`,
      queued: true,
      deferred_until: endTime,
    };
  }

  // 3. Check rate limit (except for critical alerts)
  if (severity !== 'critical' && await isRateLimited(config)) {
    return {
      allowed: false,
      reason: `Rate limit exceeded (${config.max_alerts_per_hour}/hour)`,
      queued: true,
    };
  }

  // 4. Check for duplicates
  if (await isDuplicate(dedupKey, config)) {
    return {
      allowed: false,
      reason: `Duplicate alert within ${config.dedup_cooldown_minutes} minute cooldown`,
      suppressed: true,
    };
  }

  // 5. Auto-verify or queue for manual verification
  const needsManualVerification = SEVERITY_ORDER[severity] > SEVERITY_ORDER[config.auto_verify_below_severity];

  return {
    allowed: !needsManualVerification,
    reason: needsManualVerification
      ? 'Queued for manual verification (high severity)'
      : 'Auto-verified',
    queued: needsManualVerification,
  };
}

/**
 * Queue an alert for sending (with verification)
 */
export async function queueAlert(
  alertType: AlertQueueItem['alert_type'],
  severity: AlertQueueItem['severity'],
  payload: Record<string, unknown>
): Promise<{ success: boolean; alertId?: string; verification: VerificationResult }> {
  const verification = await verifyAlert(alertType, severity, payload);
  const dedupKey = generateDedupKey(alertType, payload);

  // Always log to queue for audit trail
  try {
    const { data, error } = await supabase
      .from('slack_alert_queue')
      .insert({
        alert_type: alertType,
        severity,
        payload,
        dedup_key: dedupKey,
        verified_at: verification.allowed ? new Date().toISOString() : null,
        suppressed_reason: verification.suppressed ? verification.reason : null,
      })
      .select('id')
      .single();

    if (error) throw error;

    return {
      success: true,
      alertId: data.id,
      verification,
    };
  } catch (error) {
    console.error('[SlackQualityGate] Failed to queue alert:', error);
    return {
      success: false,
      verification: {
        allowed: false,
        reason: `Queue error: ${error}`,
      },
    };
  }
}

/**
 * Mark alert as sent
 */
export async function markAlertSent(alertId: string): Promise<void> {
  await supabase
    .from('slack_alert_queue')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', alertId);
}

/**
 * Manually verify a queued alert
 */
export async function manuallyVerifyAlert(alertId: string): Promise<{ success: boolean }> {
  const { error } = await supabase
    .from('slack_alert_queue')
    .update({
      verified_at: new Date().toISOString(),
      suppressed_reason: null,
    })
    .eq('id', alertId);

  return { success: !error };
}

/**
 * Suppress a queued alert
 */
export async function suppressAlert(alertId: string, reason: string): Promise<{ success: boolean }> {
  const { error } = await supabase
    .from('slack_alert_queue')
    .update({
      suppressed_reason: reason,
    })
    .eq('id', alertId);

  return { success: !error };
}

/**
 * Get pending alerts for review
 */
export async function getPendingAlerts(limit: number = 50): Promise<AlertQueueItem[]> {
  const { data } = await supabase
    .from('slack_alert_queue')
    .select('*')
    .is('verified_at', null)
    .is('suppressed_reason', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  return data || [];
}

/**
 * Get verified but unsent alerts (ready to send)
 */
export async function getReadyToSendAlerts(limit: number = 20): Promise<AlertQueueItem[]> {
  const { data } = await supabase
    .from('slack_alert_queue')
    .select('*')
    .not('verified_at', 'is', null)
    .is('sent_at', null)
    .is('suppressed_reason', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  return data || [];
}

/**
 * Get alert statistics
 */
export async function getAlertStats(): Promise<{
  pending: number;
  sent_today: number;
  suppressed_today: number;
  rate_limit_remaining: number;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const config = await getQualityGateConfig();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const [pending, sentToday, suppressedToday, sentLastHour] = await Promise.all([
    supabase.from('slack_alert_queue').select('*', { count: 'exact', head: true })
      .is('verified_at', null).is('suppressed_reason', null),
    supabase.from('slack_alert_queue').select('*', { count: 'exact', head: true })
      .gte('sent_at', todayISO),
    supabase.from('slack_alert_queue').select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO).not('suppressed_reason', 'is', null),
    supabase.from('slack_alert_queue').select('*', { count: 'exact', head: true })
      .gte('sent_at', oneHourAgo),
  ]);

  return {
    pending: pending.count || 0,
    sent_today: sentToday.count || 0,
    suppressed_today: suppressedToday.count || 0,
    rate_limit_remaining: Math.max(0, config.max_alerts_per_hour - (sentLastHour.count || 0)),
  };
}
