/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔔 NOTIFICATION SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Sends alerts for critical inventory events and ticket notifications via email/Slack/in-app
 */

import { supabase } from '../lib/supabase/client';

export interface StockoutAlert {
  sku: string;
  itemName: string;
  currentStock: number;
  daysUntilStockout: number;
  urgency: 'critical' | 'high';
  recommendedAction: string;
}

export interface NotificationChannel {
  type: 'email' | 'slack' | 'in_app';
  enabled: boolean;
  config?: Record<string, any>;
}

export interface TicketNotificationData {
  ticketId: string;
  ticketNumber: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  reporterName: string;
  assigneeName?: string;
  directedToName?: string;
  projectName?: string;
  dueDate?: string;
  action: 'created' | 'assigned' | 'status_changed' | 'due_soon' | 'overdue' | 'escalated';
  actorName: string;
  oldValue?: any;
  newValue?: any;
}

/**
 * Send critical stockout alerts
 */
export async function sendStockoutAlert(
  alert: StockoutAlert,
  channels: NotificationChannel[]
): Promise<void> {
  console.log('[NotificationService] Sending stockout alert:', alert);
  
  for (const channel of channels.filter(c => c.enabled)) {
    try {
      switch (channel.type) {
        case 'email':
          await sendEmailAlert(alert, channel.config);
          break;
        case 'slack':
          await sendSlackAlert(alert, channel.config);
          break;
        case 'in_app':
          await sendInAppAlert(alert);
          break;
      }
    } catch (error) {
      console.error(`[NotificationService] Failed to send ${channel.type} alert:`, error);
    }
  }
}

async function sendEmailAlert(alert: StockoutAlert, config?: Record<string, any>): Promise<void> {
  // Call Supabase Edge Function for email sending
  const { error } = await supabase.functions.invoke('send-notification-email', {
    body: {
      to: config?.recipients || ['purchasing@company.com'],
      subject: `🚨 ${alert.urgency.toUpperCase()}: ${alert.itemName} Stockout Risk`,
      html: `
        <h2>Stockout Alert</h2>
        <p><strong>Item:</strong> ${alert.itemName} (${alert.sku})</p>
        <p><strong>Current Stock:</strong> ${alert.currentStock} units</p>
        <p><strong>Days Until Stockout:</strong> ${alert.daysUntilStockout}</p>
        <p><strong>Urgency:</strong> ${alert.urgency.toUpperCase()}</p>
        <p><strong>Action Required:</strong> ${alert.recommendedAction}</p>
      `,
    },
  });
  
  if (error) throw error;
}

async function sendSlackAlert(alert: StockoutAlert, config?: Record<string, any>): Promise<void> {
  // Call Slack webhook
  const webhookUrl = config?.webhookUrl || import.meta.env.VITE_SLACK_WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.warn('[NotificationService] Slack webhook URL not configured');
    return;
  }
  
  const message = {
    text: `🚨 *${alert.urgency.toUpperCase()} Stockout Risk*`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${alert.itemName}* (${alert.sku})`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Current Stock:*\n${alert.currentStock} units` },
          { type: 'mrkdwn', text: `*Days Left:*\n${alert.daysUntilStockout} days` },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Action Required:*\n${alert.recommendedAction}`,
        },
      },
    ],
  };
  
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
}

async function sendInAppAlert(alert: StockoutAlert): Promise<void> {
  // Store in database for in-app notification center
  const { error } = await supabase.from('notifications').insert({
    type: 'stockout_alert',
    severity: alert.urgency,
    title: `${alert.itemName} Stockout Risk`,
    message: `${alert.daysUntilStockout} days until stockout. ${alert.recommendedAction}`,
    data: alert,
    read: false,
  });
  
  if (error) {
    console.error('[NotificationService] Failed to create in-app notification:', error);
    throw error;
  }
}

/**
 * Check for critical items and send alerts
 */
export async function checkAndAlertCriticalItems(): Promise<void> {
  const { data: criticalItems } = await supabase
    .from('reorder_queue')
    .select('*')
    .eq('status', 'pending')
    .in('urgency', ['critical', 'high'])
    .limit(50);
  
  if (!criticalItems || criticalItems.length === 0) return;
  
  // Get notification preferences
  const { data: preferences } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'notification_channels')
    .single();
  
  const channels: NotificationChannel[] = preferences?.setting_value || [
    { type: 'in_app', enabled: true },
  ];
  
  // Send alerts for critical items
  for (const item of criticalItems.filter(i => i.urgency === 'critical')) {
    await sendStockoutAlert({
      sku: item.inventory_sku,
      itemName: item.item_name,
      currentStock: item.current_stock,
      daysUntilStockout: item.days_until_stockout,
      urgency: 'critical',
      recommendedAction: `Create purchase order for ${item.recommended_quantity} units immediately`,
    }, channels);
  }
}

/**
 * Get unread notifications for current user
 */
export async function getUnreadNotifications(): Promise<any[]> {
  const { data: user } = await supabase.auth.getUser();
  
  if (!user.user) return [];
  
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('read', false)
    .or(`user_id.eq.${user.user.id},role.is.null`)
    .order('created_at', { ascending: false })
    .limit(50);
  
  if (error) {
    console.error('[NotificationService] Failed to fetch notifications:', error);
    return [];
  }
  
  return data || [];
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId);
  
  if (error) {
    console.error('[NotificationService] Failed to mark notification as read:', error);
    throw error;
  }
}

/**
 * Dismiss notification
 */
export async function dismissNotification(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ dismissed: true, dismissed_at: new Date().toISOString() })
    .eq('id', notificationId);
  
  if (error) {
    console.error('[NotificationService] Failed to dismiss notification:', error);
    throw error;
  }
}

// ============================================================================
// TICKET NOTIFICATIONS
// ============================================================================

/**
 * Create notification with user preferences and delegation routing
 */
export async function createNotificationWithPrefs(
  data: TicketNotificationData,
  targetUsers?: string[]
): Promise<void> {
  try {
    // Get delegation settings for ticket notifications
    const { data: delegationSettings } = await supabase
      .from('delegation_settings')
      .select('*')
      .eq('task_type', 'ticket')
      .single();

    // Determine target users based on delegation settings and action
    let recipients: string[] = targetUsers || [];

    if (!targetUsers) {
      // Use delegation logic to determine who should be notified
      recipients = await getNotificationRecipients(data, delegationSettings);
    }

    if (recipients.length === 0) {
      console.log('[NotificationService] No recipients found for ticket notification');
      return;
    }

    // Create notifications for each recipient
    for (const userId of recipients) {
      await createTicketNotificationForUser(data, userId);
    }

    console.log(`[NotificationService] Created ${recipients.length} ticket notifications`);
  } catch (error) {
    console.error('[NotificationService] Failed to create notification with prefs:', error);
  }
}

/**
 * Get notification recipients based on delegation settings and ticket action
 */
async function getNotificationRecipients(
  data: TicketNotificationData,
  delegationSettings?: any
): Promise<string[]> {
  const recipients = new Set<string>();

  // Always notify assignee if exists
  if (data.assigneeName) {
    const assignee = await getUserByName(data.assigneeName);
    if (assignee) recipients.add(assignee.id);
  }

  // Always notify directed_to if exists
  if (data.directedToName) {
    const directedTo = await getUserByName(data.directedToName);
    if (directedTo) recipients.add(directedTo.id);
  }

  // Add escalation targets based on delegation settings
  if (delegationSettings?.escalation_target_role) {
    const escalationUsers = await getUsersByRole(delegationSettings.escalation_target_role);
    escalationUsers.forEach(user => recipients.add(user.id));
  }

  // For high priority tickets, notify managers
  if (data.priority === 'high' || data.priority === 'urgent') {
    const managers = await getUsersByRole('manager');
    managers.forEach(user => recipients.add(user.id));
  }

  // For overdue tickets, notify operations
  if (data.action === 'overdue') {
    const opsUsers = await getUsersByRole('operations');
    opsUsers.forEach(user => recipients.add(user.id));
  }

  return Array.from(recipients);
}

/**
 * Create ticket notification for specific user with their preferences
 */
async function createTicketNotificationForUser(
  data: TicketNotificationData,
  userId: string
): Promise<void> {
  // Get user notification preferences
  const { data: prefs } = await supabase
    .from('user_notification_prefs')
    .select('*')
    .eq('user_id', userId)
    .single();

  const preferences = prefs || {
    in_app_enabled: true,
    email_enabled: true,
    slack_enabled: false,
    ticket_assignments: true,
    ticket_escalations: true,
    ticket_deadlines: true,
    approvals: true,
    system_alerts: true,
    quiet_hours_start: null,
    quiet_hours_end: null,
    email_digest_frequency: 'immediate',
    timezone: 'UTC'
  };

  // Check if user has enabled notifications for this specific type
  const notificationTypeEnabled = isNotificationTypeEnabled(data.action, preferences);
  if (!notificationTypeEnabled) {
    console.log(`[NotificationService] User ${userId} has disabled ${data.action} notifications`);
    return;
  }

  // Check if user is in quiet hours
  const now = new Date();
  const isQuietHours = preferences.quiet_hours_start && preferences.quiet_hours_end &&
    isInQuietHours(now, preferences.quiet_hours_start, preferences.quiet_hours_end, preferences.timezone);

  // Determine notification channels based on preferences and quiet hours
  const channels = [];
  if (preferences.in_app_enabled) {
    channels.push('in_app');
  }
  if (preferences.email_enabled && !isQuietHours) {
    channels.push('email');
  }
  if (preferences.slack_enabled && !isQuietHours) {
    channels.push('slack');
  }

  // If no channels are enabled, skip notification
  if (channels.length === 0) {
    console.log(`[NotificationService] No channels enabled for user ${userId}`);
    return;
  }

  // Create the notification
  const notificationData = {
    user_id: userId,
    type: 'ticket',
    severity: getSeverityFromPriority(data.priority),
    title: getNotificationTitle(data),
    message: getNotificationMessage(data),
    data: data,
    channels: channels,
    read: false,
    created_at: new Date().toISOString()
  };

  const { error } = await supabase.from('notifications').insert(notificationData);
  if (error) {
    console.error('[NotificationService] Failed to create ticket notification:', error);
    throw error;
  }

  // Send external notifications (email/slack)
  await sendTicketExternalNotifications(data, userId, channels);
}

/**
 * Send external notifications (email/slack) for tickets
 */
async function sendTicketExternalNotifications(
  data: TicketNotificationData,
  userId: string,
  channels: string[]
): Promise<void> {
  const user = await getUserById(userId);
  if (!user) return;

  for (const channel of channels) {
    try {
      switch (channel) {
        case 'email':
          await sendTicketEmailNotification(data, user);
          break;
        case 'slack':
          await sendTicketSlackNotification(data, user);
          break;
      }
    } catch (error) {
      console.error(`[NotificationService] Failed to send ${channel} ticket notification:`, error);
    }
  }
}

/**
 * Send ticket notification via email
 */
async function sendTicketEmailNotification(
  data: TicketNotificationData,
  user: any
): Promise<void> {
  const subject = `🎫 ${getNotificationTitle(data)}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">${getNotificationTitle(data)}</h2>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Ticket:</strong> ${data.ticketNumber} - ${data.title}</p>
        <p><strong>Priority:</strong> ${data.priority.toUpperCase()}</p>
        <p><strong>Status:</strong> ${data.status}</p>
        ${data.dueDate ? `<p><strong>Due:</strong> ${new Date(data.dueDate).toLocaleDateString()}</p>` : ''}
        <p><strong>Reporter:</strong> ${data.reporterName}</p>
        ${data.assigneeName ? `<p><strong>Assigned to:</strong> ${data.assigneeName}</p>` : ''}
        ${data.directedToName ? `<p><strong>Directed to:</strong> ${data.directedToName}</p>` : ''}
        ${data.projectName ? `<p><strong>Project:</strong> ${data.projectName}</p>` : ''}
      </div>
      <p><strong>Action:</strong> ${getActionDescription(data)}</p>
      ${data.description ? `<p><strong>Description:</strong> ${data.description}</p>` : ''}
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
        <a href="${getTicketUrl(data.ticketId)}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Ticket</a>
      </div>
    </div>
  `;

  const { error } = await supabase.functions.invoke('send-notification-email', {
    body: {
      to: [user.email],
      subject,
      html,
    },
  });

  if (error) throw error;
}

/**
 * Send ticket notification via Slack
 */
async function sendTicketSlackNotification(
  data: TicketNotificationData,
  user: any
): Promise<void> {
  // Get user's Slack webhook from preferences
  const { data: prefs } = await supabase
    .from('user_notification_prefs')
    .select('slack_webhook_url')
    .eq('user_id', user.id)
    .single();

  const webhookUrl = prefs?.slack_webhook_url || import.meta.env.VITE_SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const message = {
    text: `🎫 ${getNotificationTitle(data)}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${getNotificationTitle(data)}*`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Ticket:*\n${data.ticketNumber}` },
          { type: 'mrkdwn', text: `*Priority:*\n${data.priority.toUpperCase()}` },
          { type: 'mrkdwn', text: `*Status:*\n${data.status}` },
          { type: 'mrkdwn', text: `*Reporter:*\n${data.reporterName}` },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Action:* ${getActionDescription(data)}`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Ticket' },
            url: getTicketUrl(data.ticketId),
          },
        ],
      },
    ],
  };

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function isNotificationTypeEnabled(
  action: TicketNotificationData['action'],
  preferences: any
): boolean {
  switch (action) {
    case 'assigned':
      return preferences.ticket_assignments !== false;
    case 'escalated':
      return preferences.ticket_escalations !== false;
    case 'due_soon':
    case 'overdue':
      return preferences.ticket_deadlines !== false;
    case 'created':
    case 'status_changed':
      // These are general ticket notifications, enabled by default
      return true;
    default:
      return true; // Default to enabled for unknown actions
  }
}

function getSeverityFromPriority(priority: string): 'low' | 'medium' | 'high' | 'critical' {
  switch (priority) {
    case 'urgent': return 'critical';
    case 'high': return 'high';
    case 'medium': return 'medium';
    default: return 'low';
  }
}

function getNotificationTitle(data: TicketNotificationData): string {
  const actionText = {
    created: 'New Ticket',
    assigned: 'Ticket Assigned',
    status_changed: 'Ticket Status Changed',
    due_soon: 'Ticket Due Soon',
    overdue: 'Ticket Overdue',
    escalated: 'Ticket Escalated'
  };

  return `${actionText[data.action]}: ${data.title}`;
}

function getNotificationMessage(data: TicketNotificationData): string {
  const baseMessage = `${data.ticketNumber}: ${data.title}`;
  const actionMessage = getActionDescription(data);
  return `${baseMessage} - ${actionMessage}`;
}

function getActionDescription(data: TicketNotificationData): string {
  switch (data.action) {
    case 'created':
      return `Created by ${data.actorName}`;
    case 'assigned':
      return `Assigned to ${data.assigneeName || 'someone'}`;
    case 'status_changed':
      return `Status changed from ${data.oldValue || 'unknown'} to ${data.newValue || data.status}`;
    case 'due_soon':
      return `Due in ${data.newValue || 'soon'}`;
    case 'overdue':
      return 'Ticket is now overdue';
    case 'escalated':
      return `Escalated to ${data.directedToName || 'higher authority'}`;
    default:
      return data.action;
  }
}

function getTicketUrl(ticketId: string): string {
  return `${window.location.origin}/tickets/${ticketId}`;
}

async function getUserById(userId: string): Promise<any> {
  const { data } = await supabase
    .from('user_profiles')
    .select('id, name, email')
    .eq('id', userId)
    .single();
  return data;
}

async function getUserByName(name: string): Promise<any> {
  const { data } = await supabase
    .from('user_profiles')
    .select('id, name, email')
    .ilike('name', name)
    .single();
  return data;
}

async function getUsersByRole(role: string): Promise<any[]> {
  const { data } = await supabase
    .from('user_profiles')
    .select('id, name, email')
    .eq('role', role);
  return data || [];
}

function isInQuietHours(
  now: Date,
  start: string,
  end: string,
  timezone: string
): boolean {
  // Simple implementation - could be enhanced with proper timezone handling
  const [startHour, startMin] = start.split(':').map(Number);
  const [endHour, endMin] = end.split(':').map(Number);
  
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const currentTime = currentHour * 60 + currentMin;
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;

  if (startTime < endTime) {
    // Same day range
    return currentTime >= startTime && currentTime <= endTime;
  } else {
    // Overnight range
    return currentTime >= startTime || currentTime <= endTime;
  }
}
