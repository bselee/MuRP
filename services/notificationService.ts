/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔔 NOTIFICATION SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Sends alerts for critical inventory events via email/Slack/in-app
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
