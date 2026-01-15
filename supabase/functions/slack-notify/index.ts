/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📢 SLACK NOTIFICATION EDGE FUNCTION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sends notifications to Slack via incoming webhooks.
 * Called by:
 *   - Scheduled pg_cron jobs
 *   - AI agents (Inventory Guardian, Air Traffic Controller, etc.)
 *   - Manual triggers from frontend
 *
 * POST /slack-notify
 * Body: { type: 'stockout' | 'po_status' | 'requisition' | ..., payload: {...} }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// TYPES
// ============================================================================

interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  fields?: Array<{ type: string; text: string }>;
  elements?: Array<{ type: string; text?: string }>;
  accessory?: Record<string, unknown>;
}

interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
  attachments?: Array<{ color?: string; footer?: string }>;
}

type NotificationType =
  | 'stockout'
  | 'po_status'
  | 'po_overdue'
  | 'requisition'
  | 'agent_action'
  | 'daily_summary'
  | 'invoice'
  | 'test'
  | 'custom';

interface NotificationRequest {
  type: NotificationType;
  payload: Record<string, unknown>;
  webhookUrl?: string;
  userId?: string;
}

// ============================================================================
// WEBHOOK URL RESOLUTION
// ============================================================================

async function getWebhookUrl(supabase: ReturnType<typeof createClient>, userId?: string): Promise<string | null> {
  // Priority 1: User-specific webhook
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

  // Priority 2: System-level from app_settings
  const { data: settings } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'slack_webhook_url')
    .single();

  if (settings?.setting_value) {
    return settings.setting_value;
  }

  // Priority 3: Environment variable
  return Deno.env.get('SLACK_WEBHOOK_URL') || null;
}

// ============================================================================
// MESSAGE BUILDERS
// ============================================================================

function buildStockoutMessage(payload: Record<string, unknown>): SlackMessage {
  const urgency = payload.urgency as string || 'high';
  const emoji = urgency === 'critical' ? '🚨' : urgency === 'high' ? '⚠️' : '📦';
  const color = urgency === 'critical' ? '#dc2626' : urgency === 'high' ? '#f59e0b' : '#6b7280';

  return {
    text: `${emoji} ${urgency.toUpperCase()}: ${payload.itemName} stockout risk`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${emoji} Stockout Alert: ${payload.itemName}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*SKU:*\n\`${payload.sku}\`` },
          { type: 'mrkdwn', text: `*Current Stock:*\n${(payload.currentStock as number)?.toLocaleString() || 0} units` },
          { type: 'mrkdwn', text: `*Days Until Stockout:*\n${payload.daysUntilStockout} days` },
          { type: 'mrkdwn', text: `*Urgency:*\n${urgency.toUpperCase()}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Action Required:*\n${payload.recommendedAction || 'Create purchase order'}` },
      },
    ],
    attachments: [{ color, footer: 'MuRP Stock Intelligence' }],
  };
}

function buildPOStatusMessage(payload: Record<string, unknown>): SlackMessage {
  const statusEmoji: Record<string, string> = {
    'sent': '📤', 'confirmed': '✅', 'processing': '⚙️', 'shipped': '🚚',
    'in_transit': '📦', 'delivered': '🎉', 'received': '✅', 'delayed': '⏰', 'cancelled': '❌',
  };
  const status = (payload.newStatus as string || '').toLowerCase();
  const emoji = statusEmoji[status] || '📋';

  return {
    text: `${emoji} PO ${payload.poNumber} → ${payload.newStatus}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${emoji} PO Status Update` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*PO Number:*\n\`${payload.poNumber}\`` },
          { type: 'mrkdwn', text: `*Vendor:*\n${payload.vendorName}` },
          { type: 'mrkdwn', text: `*Status:*\n${payload.oldStatus ? `${payload.oldStatus} → ` : ''}*${payload.newStatus}*` },
        ],
      },
    ],
  };
}

function buildPOOverdueMessage(payload: Record<string, unknown>): SlackMessage {
  return {
    text: `⏰ PO ${payload.poNumber} is ${payload.daysOverdue} days overdue`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `⏰ Overdue PO Alert` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*PO Number:*\n\`${payload.poNumber}\`` },
          { type: 'mrkdwn', text: `*Vendor:*\n${payload.vendorName}` },
          { type: 'mrkdwn', text: `*Expected Date:*\n${payload.expectedDate}` },
          { type: 'mrkdwn', text: `*Days Overdue:*\n🔴 ${payload.daysOverdue} days` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*Action:* Follow up with vendor on delivery status' },
      },
    ],
    attachments: [{ color: '#dc2626', footer: 'MuRP PO Tracking' }],
  };
}

function buildRequisitionMessage(payload: Record<string, unknown>): SlackMessage {
  const action = payload.action as string || 'submitted';
  const emoji = action === 'submitted' ? '📝' : action === 'approved' ? '✅' : '❌';
  const items = payload.items as Array<{ sku: string; name: string; quantity: number }> || [];

  return {
    text: `${emoji} Requisition ${action}: ${items.length} item(s) from ${payload.department}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${emoji} ${action === 'submitted' ? 'New Requisition' : `Requisition ${action}`}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Requisition ID:*\n\`${payload.requisitionId}\`` },
          { type: 'mrkdwn', text: `*Requested By:*\n${payload.requestedBy}` },
          { type: 'mrkdwn', text: `*Department:*\n${payload.department}` },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Items:*\n${items.slice(0, 3).map(i => `• ${i.quantity}x ${i.name}`).join('\n')}${items.length > 3 ? `\n_...and ${items.length - 3} more_` : ''}`,
        },
      },
    ],
  };
}

function buildAgentActionMessage(payload: Record<string, unknown>): SlackMessage {
  const status = payload.status as string || 'proposed';
  const emoji = status === 'executed' ? '✅' : status === 'proposed' ? '🤖' : '❌';
  const color = status === 'executed' ? '#22c55e' : status === 'proposed' ? '#3b82f6' : '#dc2626';

  return {
    text: `${emoji} ${payload.agentName}: ${payload.actionType}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${emoji} AI Agent Action` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Agent:*\n${payload.agentName}` },
          { type: 'mrkdwn', text: `*Action:*\n${payload.actionType}` },
          { type: 'mrkdwn', text: `*Status:*\n${status.toUpperCase()}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: String(payload.description || '') },
      },
    ],
    attachments: [{ color, footer: `MuRP ${payload.agentName}` }],
  };
}

function buildDailySummaryMessage(payload: Record<string, unknown>): SlackMessage {
  const hasIssues = (payload.criticalAlerts as number || 0) > 0 || (payload.overduePOs as number || 0) > 0;
  const emoji = hasIssues ? '⚠️' : '📊';

  return {
    text: `${emoji} MuRP Daily Summary - ${payload.date}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${emoji} Daily Summary - ${payload.date}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Critical Alerts:*\n${(payload.criticalAlerts as number) > 0 ? `🔴 ${payload.criticalAlerts}` : '✅ 0'}` },
          { type: 'mrkdwn', text: `*Overdue POs:*\n${(payload.overduePOs as number) > 0 ? `⏰ ${payload.overduePOs}` : '✅ 0'}` },
          { type: 'mrkdwn', text: `*Pending Requisitions:*\n${payload.pendingRequisitions}` },
          { type: 'mrkdwn', text: `*Low Stock Items:*\n${payload.lowStockItems}` },
        ],
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: '_View details in MuRP Dashboard_' }],
      },
    ],
  };
}

function buildTestMessage(): SlackMessage {
  return {
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
  };
}

function buildCustomMessage(payload: Record<string, unknown>): SlackMessage {
  return {
    text: String(payload.text || 'MuRP Notification'),
    blocks: payload.blocks as SlackBlock[] || undefined,
    attachments: payload.attachments as Array<{ color?: string; footer?: string }> || undefined,
  };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: NotificationRequest = await req.json();
    const { type, payload, webhookUrl: providedUrl, userId } = body;

    // Get webhook URL
    const webhookUrl = providedUrl || await getWebhookUrl(supabase, userId);

    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Slack webhook URL not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build message based on type
    let message: SlackMessage;
    switch (type) {
      case 'stockout':
        message = buildStockoutMessage(payload);
        break;
      case 'po_status':
        message = buildPOStatusMessage(payload);
        break;
      case 'po_overdue':
        message = buildPOOverdueMessage(payload);
        break;
      case 'requisition':
        message = buildRequisitionMessage(payload);
        break;
      case 'agent_action':
        message = buildAgentActionMessage(payload);
        break;
      case 'daily_summary':
        message = buildDailySummaryMessage(payload);
        break;
      case 'test':
        message = buildTestMessage();
        break;
      case 'custom':
        message = buildCustomMessage(payload);
        break;
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown notification type: ${type}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Send to Slack
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[slack-notify] Webhook failed:', errorText);
      return new Response(
        JSON.stringify({ success: false, error: `Slack API error: ${errorText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log notification (optional - for audit trail)
    await supabase.from('slack_notification_log').insert({
      notification_type: type,
      payload,
      sent_at: new Date().toISOString(),
      success: true,
    }).catch(() => {
      // Table might not exist, that's fine
    });

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[slack-notify] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
