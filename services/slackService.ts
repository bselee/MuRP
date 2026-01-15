/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📢 SLACK NOTIFICATION SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Centralized Slack integration for MuRP notifications.
 * Supports both:
 *   1. Incoming Webhooks (simple, one-way notifications)
 *   2. Composio (two-way, interactive - future enhancement)
 */

import { supabase } from '../lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
  channel?: string;
  username?: string;
  icon_emoji?: string;
}

export interface SlackBlock {
  type: 'section' | 'divider' | 'header' | 'context' | 'actions';
  text?: { type: 'mrkdwn' | 'plain_text'; text: string };
  fields?: Array<{ type: 'mrkdwn' | 'plain_text'; text: string }>;
  elements?: SlackBlockElement[];
  accessory?: SlackBlockElement;
}

export interface SlackBlockElement {
  type: 'button' | 'image' | 'mrkdwn' | 'plain_text';
  text?: { type: 'plain_text'; text: string; emoji?: boolean };
  url?: string;
  action_id?: string;
  style?: 'primary' | 'danger';
  image_url?: string;
  alt_text?: string;
}

export interface SlackAttachment {
  color?: string;
  pretext?: string;
  author_name?: string;
  title?: string;
  title_link?: string;
  text?: string;
  fields?: Array<{ title: string; value: string; short?: boolean }>;
  footer?: string;
  ts?: number;
}

export type SlackNotificationType =
  | 'stockout_alert'
  | 'po_status_update'
  | 'po_overdue'
  | 'vendor_alert'
  | 'requisition_submitted'
  | 'requisition_approved'
  | 'agent_action'
  | 'system_alert'
  | 'invoice_received'
  | 'three_way_match';

// ============================================================================
// CONFIGURATION
// ============================================================================

const getWebhookUrl = async (userId?: string): Promise<string | null> => {
  // Priority 1: User-specific webhook (from notification prefs)
  if (userId) {
    const { data: prefs } = await supabase
      .from('user_notification_prefs')
      .select('slack_webhook_url, slack_enabled')
      .eq('user_id', userId)
      .single();

    if (prefs?.slack_enabled && prefs?.slack_webhook_url) {
      return prefs.slack_webhook_url;
    }
  }

  // Priority 2: System-level webhook from app_settings
  const { data: settings } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'slack_webhook_url')
    .single();

  if (settings?.setting_value) {
    return settings.setting_value;
  }

  // Priority 3: Environment variable
  return import.meta.env.VITE_SLACK_WEBHOOK_URL || null;
};

// ============================================================================
// CORE SEND FUNCTION
// ============================================================================

export async function sendSlackMessage(
  message: SlackMessage,
  options?: { userId?: string; webhookUrl?: string }
): Promise<{ success: boolean; error?: string }> {
  const webhookUrl = options?.webhookUrl || await getWebhookUrl(options?.userId);

  if (!webhookUrl) {
    console.warn('[SlackService] No webhook URL configured');
    return { success: false, error: 'Slack webhook URL not configured' };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SlackService] Webhook failed:', errorText);
      return { success: false, error: `Slack API error: ${errorText}` };
    }

    console.log('[SlackService] Message sent successfully');
    return { success: true };
  } catch (error) {
    console.error('[SlackService] Failed to send message:', error);
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// PRE-BUILT NOTIFICATION TEMPLATES
// ============================================================================

/**
 * Send stockout alert to Slack
 */
export async function sendStockoutNotification(alert: {
  sku: string;
  itemName: string;
  currentStock: number;
  daysUntilStockout: number;
  urgency: 'critical' | 'high' | 'medium';
  recommendedAction: string;
  vendorName?: string;
}): Promise<{ success: boolean; error?: string }> {
  const urgencyEmoji = alert.urgency === 'critical' ? '🚨' : alert.urgency === 'high' ? '⚠️' : '📦';
  const urgencyColor = alert.urgency === 'critical' ? '#dc2626' : alert.urgency === 'high' ? '#f59e0b' : '#6b7280';

  return sendSlackMessage({
    text: `${urgencyEmoji} ${alert.urgency.toUpperCase()}: ${alert.itemName} stockout risk`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${urgencyEmoji} Stockout Alert: ${alert.itemName}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*SKU:*\n\`${alert.sku}\`` },
          { type: 'mrkdwn', text: `*Current Stock:*\n${alert.currentStock.toLocaleString()} units` },
          { type: 'mrkdwn', text: `*Days Until Stockout:*\n${alert.daysUntilStockout} days` },
          { type: 'mrkdwn', text: `*Urgency:*\n${alert.urgency.toUpperCase()}` },
        ],
      },
      ...(alert.vendorName ? [{
        type: 'section' as const,
        text: { type: 'mrkdwn' as const, text: `*Vendor:* ${alert.vendorName}` },
      }] : []),
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Action Required:*\n${alert.recommendedAction}` },
      },
    ],
    attachments: [{ color: urgencyColor, footer: 'MuRP Stock Intelligence' }],
  });
}

/**
 * Send PO status update to Slack
 */
export async function sendPOStatusNotification(update: {
  poNumber: string;
  vendorName: string;
  oldStatus?: string;
  newStatus: string;
  expectedDate?: string;
  trackingNumber?: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  const statusEmoji: Record<string, string> = {
    'sent': '📤',
    'confirmed': '✅',
    'processing': '⚙️',
    'shipped': '🚚',
    'in_transit': '📦',
    'delivered': '🎉',
    'received': '✅',
    'partial': '⚠️',
    'delayed': '⏰',
    'cancelled': '❌',
  };

  const emoji = statusEmoji[update.newStatus.toLowerCase()] || '📋';

  return sendSlackMessage({
    text: `${emoji} PO ${update.poNumber} → ${update.newStatus}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${emoji} PO Status Update` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*PO Number:*\n\`${update.poNumber}\`` },
          { type: 'mrkdwn', text: `*Vendor:*\n${update.vendorName}` },
          { type: 'mrkdwn', text: `*Status:*\n${update.oldStatus ? `${update.oldStatus} → ` : ''}*${update.newStatus}*` },
          ...(update.expectedDate ? [{ type: 'mrkdwn' as const, text: `*Expected:*\n${update.expectedDate}` }] : []),
        ],
      },
      ...(update.trackingNumber ? [{
        type: 'section' as const,
        text: { type: 'mrkdwn' as const, text: `*Tracking:* \`${update.trackingNumber}\`` },
      }] : []),
      ...(update.notes ? [{
        type: 'context' as const,
        elements: [{ type: 'mrkdwn' as const, text: update.notes }],
      }] : []),
    ],
  });
}

/**
 * Send overdue PO alert to Slack
 */
export async function sendPOOverdueNotification(po: {
  poNumber: string;
  vendorName: string;
  expectedDate: string;
  daysOverdue: number;
  totalValue?: number;
  itemCount?: number;
}): Promise<{ success: boolean; error?: string }> {
  return sendSlackMessage({
    text: `⏰ PO ${po.poNumber} is ${po.daysOverdue} days overdue`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `⏰ Overdue PO Alert` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*PO Number:*\n\`${po.poNumber}\`` },
          { type: 'mrkdwn', text: `*Vendor:*\n${po.vendorName}` },
          { type: 'mrkdwn', text: `*Expected Date:*\n${po.expectedDate}` },
          { type: 'mrkdwn', text: `*Days Overdue:*\n🔴 ${po.daysOverdue} days` },
        ],
      },
      ...(po.totalValue || po.itemCount ? [{
        type: 'section' as const,
        fields: [
          ...(po.totalValue ? [{ type: 'mrkdwn' as const, text: `*Value:*\n$${po.totalValue.toLocaleString()}` }] : []),
          ...(po.itemCount ? [{ type: 'mrkdwn' as const, text: `*Items:*\n${po.itemCount}` }] : []),
        ],
      }] : []),
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*Action:* Follow up with vendor on delivery status' },
      },
    ],
    attachments: [{ color: '#dc2626', footer: 'MuRP PO Tracking' }],
  });
}

/**
 * Send requisition notification to Slack
 */
export async function sendRequisitionNotification(req: {
  requisitionId: string;
  action: 'submitted' | 'approved' | 'rejected';
  requestedBy: string;
  department: string;
  items: Array<{ sku: string; name: string; quantity: number }>;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  const actionEmoji = req.action === 'submitted' ? '📝' : req.action === 'approved' ? '✅' : '❌';
  const actionText = req.action === 'submitted' ? 'New Requisition' : req.action === 'approved' ? 'Requisition Approved' : 'Requisition Rejected';
  const priorityEmoji = req.priority === 'urgent' ? '🔴' : req.priority === 'high' ? '🟠' : '';

  const itemSummary = req.items.length <= 3
    ? req.items.map(i => `• ${i.quantity}x ${i.name} (\`${i.sku}\`)`).join('\n')
    : `• ${req.items.slice(0, 2).map(i => `${i.quantity}x ${i.name}`).join('\n• ')}\n• _...and ${req.items.length - 2} more items_`;

  return sendSlackMessage({
    text: `${actionEmoji} ${actionText}: ${req.items.length} item(s) from ${req.department}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${actionEmoji} ${actionText} ${priorityEmoji}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Requisition ID:*\n\`${req.requisitionId}\`` },
          { type: 'mrkdwn', text: `*Requested By:*\n${req.requestedBy}` },
          { type: 'mrkdwn', text: `*Department:*\n${req.department}` },
          ...(req.priority ? [{ type: 'mrkdwn' as const, text: `*Priority:*\n${req.priority.toUpperCase()}` }] : []),
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Items:*\n${itemSummary}` },
      },
      ...(req.notes ? [{
        type: 'context' as const,
        elements: [{ type: 'mrkdwn' as const, text: `📝 ${req.notes}` }],
      }] : []),
    ],
  });
}

/**
 * Send agent action notification to Slack
 */
export async function sendAgentActionNotification(action: {
  agentName: string;
  actionType: string;
  description: string;
  status: 'proposed' | 'executed' | 'failed';
  affectedItems?: string[];
  requiresApproval?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const statusEmoji = action.status === 'executed' ? '✅' : action.status === 'proposed' ? '🤖' : '❌';
  const statusColor = action.status === 'executed' ? '#22c55e' : action.status === 'proposed' ? '#3b82f6' : '#dc2626';

  return sendSlackMessage({
    text: `${statusEmoji} ${action.agentName}: ${action.actionType}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${statusEmoji} AI Agent Action` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Agent:*\n${action.agentName}` },
          { type: 'mrkdwn', text: `*Action:*\n${action.actionType}` },
          { type: 'mrkdwn', text: `*Status:*\n${action.status.toUpperCase()}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: action.description },
      },
      ...(action.affectedItems && action.affectedItems.length > 0 ? [{
        type: 'context' as const,
        elements: [{ type: 'mrkdwn' as const, text: `Affected: ${action.affectedItems.slice(0, 5).join(', ')}${action.affectedItems.length > 5 ? '...' : ''}` }],
      }] : []),
      ...(action.requiresApproval ? [{
        type: 'section' as const,
        text: { type: 'mrkdwn' as const, text: '⚠️ *This action requires approval in MuRP*' },
      }] : []),
    ],
    attachments: [{ color: statusColor, footer: `MuRP ${action.agentName}` }],
  });
}

/**
 * Send daily summary to Slack
 */
export async function sendDailySummary(summary: {
  date: string;
  criticalAlerts: number;
  overduePOs: number;
  pendingRequisitions: number;
  lowStockItems: number;
  completedPOs: number;
  highlights?: string[];
}): Promise<{ success: boolean; error?: string }> {
  const hasIssues = summary.criticalAlerts > 0 || summary.overduePOs > 0;
  const emoji = hasIssues ? '⚠️' : '📊';

  return sendSlackMessage({
    text: `${emoji} MuRP Daily Summary - ${summary.date}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${emoji} Daily Summary - ${summary.date}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Critical Alerts:*\n${summary.criticalAlerts > 0 ? `🔴 ${summary.criticalAlerts}` : '✅ 0'}` },
          { type: 'mrkdwn', text: `*Overdue POs:*\n${summary.overduePOs > 0 ? `⏰ ${summary.overduePOs}` : '✅ 0'}` },
          { type: 'mrkdwn', text: `*Pending Requisitions:*\n${summary.pendingRequisitions}` },
          { type: 'mrkdwn', text: `*Low Stock Items:*\n${summary.lowStockItems}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*POs Completed Today:* ${summary.completedPOs}` },
      },
      ...(summary.highlights && summary.highlights.length > 0 ? [{
        type: 'section' as const,
        text: { type: 'mrkdwn' as const, text: `*Highlights:*\n${summary.highlights.map(h => `• ${h}`).join('\n')}` },
      }] : []),
      { type: 'divider' },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: '_View details in MuRP Dashboard_' }],
      },
    ],
  });
}

/**
 * Send invoice received notification
 */
export async function sendInvoiceNotification(invoice: {
  poNumber: string;
  vendorName: string;
  invoiceNumber: string;
  amount: number;
  matchStatus: 'matched' | 'variance' | 'pending';
  variance?: number;
}): Promise<{ success: boolean; error?: string }> {
  const statusEmoji = invoice.matchStatus === 'matched' ? '✅' : invoice.matchStatus === 'variance' ? '⚠️' : '📋';
  const statusColor = invoice.matchStatus === 'matched' ? '#22c55e' : invoice.matchStatus === 'variance' ? '#f59e0b' : '#6b7280';

  return sendSlackMessage({
    text: `${statusEmoji} Invoice received for PO ${invoice.poNumber}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${statusEmoji} Invoice Received` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*PO Number:*\n\`${invoice.poNumber}\`` },
          { type: 'mrkdwn', text: `*Vendor:*\n${invoice.vendorName}` },
          { type: 'mrkdwn', text: `*Invoice #:*\n${invoice.invoiceNumber}` },
          { type: 'mrkdwn', text: `*Amount:*\n$${invoice.amount.toLocaleString()}` },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: invoice.matchStatus === 'matched'
            ? '✅ *Three-way match successful*'
            : invoice.matchStatus === 'variance'
            ? `⚠️ *Variance detected:* $${invoice.variance?.toLocaleString() || 'Unknown'} - review required`
            : '📋 *Pending review*'
        },
      },
    ],
    attachments: [{ color: statusColor, footer: 'MuRP Invoice Processing' }],
  });
}

// ============================================================================
// COMPOSIO INTEGRATION (FUTURE)
// ============================================================================

/**
 * Check if Composio is configured for advanced Slack features
 */
export function isComposioConfigured(): boolean {
  return Boolean(import.meta.env.VITE_COMPOSIO_API_KEY);
}

/**
 * Get Composio MCP URL for Slack integration
 * This enables two-way communication via Composio's tool router
 */
export async function getComposioSlackConfig(): Promise<{
  available: boolean;
  mcpUrl?: string;
  features?: string[];
}> {
  const apiKey = import.meta.env.VITE_COMPOSIO_API_KEY;

  if (!apiKey) {
    return { available: false };
  }

  // Composio provides these features beyond webhooks
  return {
    available: true,
    features: [
      'Interactive buttons and actions',
      'User mentions and DMs',
      'Channel creation and management',
      'Thread replies',
      'File uploads',
      'Slash commands',
    ],
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Test Slack webhook connection
 */
export async function testSlackConnection(webhookUrl?: string): Promise<{ success: boolean; error?: string }> {
  const url = webhookUrl || await getWebhookUrl();

  if (!url) {
    return { success: false, error: 'No webhook URL configured' };
  }

  return sendSlackMessage({
    text: '✅ MuRP Slack Integration Test',
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '✅ *Connection successful!*\n\nMuRP can now send notifications to this Slack channel.' },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Tested at ${new Date().toISOString()}` }],
      },
    ],
  }, { webhookUrl: url });
}

/**
 * Get Slack configuration status
 */
export async function getSlackStatus(): Promise<{
  webhookConfigured: boolean;
  composioConfigured: boolean;
  userPrefsEnabled: boolean;
}> {
  const webhookUrl = await getWebhookUrl();

  return {
    webhookConfigured: Boolean(webhookUrl),
    composioConfigured: isComposioConfigured(),
    userPrefsEnabled: false, // Would check user prefs
  };
}
