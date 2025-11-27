-- ============================================================================
-- Migration: 049_notifications_and_alerts.sql
-- ============================================================================
-- Adds comprehensive notification system for ticketing and alerts
-- Supports in-app, Slack, and email notifications with user preferences
--
-- Tables:
--   - notifications: Persistent notification storage with channels
--   - user_notification_prefs: Per-user notification preferences
--   - notification_templates: Reusable notification templates
--
-- Author: MuRP Team
-- Date: 2025-11-27
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. NOTIFICATIONS TABLE
-- ============================================================================
-- Persistent storage for all notifications with multi-channel support

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User targeting
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Notification content
  type TEXT NOT NULL CHECK (type IN (
    'ticket_assigned',
    'ticket_escalated',
    'ticket_due_soon',
    'ticket_overdue',
    'ticket_commented',
    'ticket_status_changed',
    'ticket_completed',
    'approval_requested',
    'approval_approved',
    'approval_rejected',
    'escalation_alert',
    'system_alert',
    'po_alert',
    'stockout_alert'
  )),

  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Related entity (for linking to tickets, POs, etc.)
  related_entity_type TEXT, -- 'ticket', 'purchase_order', 'bom', 'requisition'
  related_entity_id TEXT,

  -- Channels and delivery status
  channels_delivered JSONB DEFAULT '[]'::JSONB, -- ['in_app', 'slack', 'email']
  channels_pending JSONB DEFAULT '[]'::JSONB,   -- Channels still to be sent

  -- Status tracking
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ, -- When first sent via any channel

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB, -- Additional context data
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. USER NOTIFICATION PREFERENCES
-- ============================================================================
-- Per-user preferences for notification channels and timing

CREATE TABLE IF NOT EXISTS user_notification_prefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Channel preferences
  in_app_enabled BOOLEAN DEFAULT true,
  slack_enabled BOOLEAN DEFAULT false,
  email_enabled BOOLEAN DEFAULT true,

  -- Notification type preferences
  ticket_assignments BOOLEAN DEFAULT true,
  ticket_escalations BOOLEAN DEFAULT true,
  ticket_deadlines BOOLEAN DEFAULT true,
  approvals BOOLEAN DEFAULT true,
  system_alerts BOOLEAN DEFAULT true,

  -- Timing preferences
  quiet_hours_start TIME, -- e.g., '22:00'
  quiet_hours_end TIME,   -- e.g., '08:00'
  timezone TEXT DEFAULT 'America/New_York',

  -- Slack-specific settings
  slack_webhook_url TEXT, -- Personal webhook if different from system
  slack_mention_me BOOLEAN DEFAULT true,
  slack_channel_override TEXT, -- Personal channel preference

  -- Email-specific settings
  email_digest_frequency TEXT DEFAULT 'immediate' CHECK (email_digest_frequency IN (
    'immediate', 'hourly', 'daily', 'weekly'
  )),
  email_include_comments BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

-- ============================================================================
-- 3. NOTIFICATION TEMPLATES
-- ============================================================================
-- Reusable templates for consistent messaging across channels

CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template identification
  template_key TEXT NOT NULL UNIQUE, -- e.g., 'ticket_assigned', 'po_overdue'
  category TEXT NOT NULL, -- 'tickets', 'purchase_orders', 'system'

  -- Template content
  title_template TEXT NOT NULL, -- Handlebars template
  message_template TEXT NOT NULL, -- Handlebars template

  -- Channel-specific templates
  slack_blocks_template JSONB, -- Slack Block Kit template
  email_html_template TEXT, -- HTML email template

  -- Default settings
  default_priority TEXT DEFAULT 'normal',
  requires_action BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'related_entity_type'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'related_entity_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_notifications_related ON notifications(related_entity_type, related_entity_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_prefs_user ON user_notification_prefs(user_id);

CREATE INDEX IF NOT EXISTS idx_templates_key ON notification_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_templates_category ON notification_templates(category);

-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

-- Notifications: Users can only see their own notifications
DROP POLICY IF EXISTS notifications_select ON notifications;
CREATE POLICY notifications_select ON notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_insert ON notifications;
CREATE POLICY notifications_insert ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (true); -- System can insert for any user

DROP POLICY IF EXISTS notifications_update ON notifications;
CREATE POLICY notifications_update ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- User preferences: Users can only manage their own preferences
DROP POLICY IF EXISTS user_prefs_select ON user_notification_prefs;
CREATE POLICY user_prefs_select ON user_notification_prefs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_prefs_insert ON user_notification_prefs;
CREATE POLICY user_prefs_insert ON user_notification_prefs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_prefs_update ON user_notification_prefs;
CREATE POLICY user_prefs_update ON user_notification_prefs
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Templates: Read-only for authenticated users, admin write
DROP POLICY IF EXISTS templates_select ON notification_templates;
CREATE POLICY templates_select ON notification_templates
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS templates_admin ON notification_templates;
CREATE POLICY templates_admin ON notification_templates
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'Admin'
    )
  );

-- ============================================================================
-- 6. DEFAULT TEMPLATES
-- ============================================================================

INSERT INTO notification_templates (
  template_key, category, title_template, message_template,
  slack_blocks_template, default_priority, requires_action
) VALUES
  (
    'ticket_assigned',
    'tickets',
    'Ticket Assigned: {{ticket.title}}',
    'You have been assigned ticket #{{ticket.ticketNumber}}: "{{ticket.title}}" by {{assigner.name}}',
    '[
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "*Ticket Assigned*\n#{{ticket.ticketNumber}}: {{ticket.title}}"
        }
      },
      {
        "type": "section",
        "fields": [
          {"type": "mrkdwn", "text": "*Priority:* {{ticket.priority}}"},
          {"type": "mrkdwn", "text": "*Due:* {{ticket.dueDate}}"},
          {"type": "mrkdwn", "text": "*Assigned by:* {{assigner.name}}"}
        ]
      }
    ]'::JSONB,
    'normal',
    true
  ),
  (
    'ticket_escalated',
    'tickets',
    '🚨 Ticket Escalated: {{ticket.title}}',
    'Ticket #{{ticket.ticketNumber}} has been escalated to {{escalationTarget}} due to inactivity',
    '[
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": ":warning: *TICKET ESCALATED*\n#{{ticket.ticketNumber}}: {{ticket.title}}"
        }
      },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "This ticket has been escalated to *{{escalationTarget}}* due to inactivity."
        }
      }
    ]'::JSONB,
    'high',
    true
  ),
  (
    'ticket_due_soon',
    'tickets',
    '⏰ Ticket Due Soon: {{ticket.title}}',
    'Ticket #{{ticket.ticketNumber}} is due in {{hoursUntilDue}} hours',
    '[
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": ":alarm_clock: *TICKET DUE SOON*\n#{{ticket.ticketNumber}}: {{ticket.title}}"
        }
      },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "Due in *{{hoursUntilDue}} hours*"
        }
      }
    ]'::JSONB,
    'normal',
    false
  ),
  (
    'approval_requested',
    'tickets',
    'Approval Requested: {{ticket.title}}',
    'Your approval is requested for ticket #{{ticket.ticketNumber}}: "{{ticket.title}}"',
    '[
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "*APPROVAL REQUESTED*\n#{{ticket.ticketNumber}}: {{ticket.title}}"
        }
      },
      {
        "type": "actions",
        "elements": [
          {
            "type": "button",
            "text": {"type": "plain_text", "text": "View Ticket"},
            "url": "{{ticketUrl}}"
          }
        ]
      }
    ]'::JSONB,
    'high',
    true
  );

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Get unread notification count for a user
CREATE OR REPLACE FUNCTION get_unread_notification_count(user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  count_val INTEGER;
BEGIN
  SELECT COUNT(*) INTO count_val
  FROM notifications
  WHERE notifications.user_id = user_id
    AND read_at IS NULL
    AND dismissed_at IS NULL;
  RETURN count_val;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create notification with user preferences
CREATE OR REPLACE FUNCTION create_notification_with_prefs(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_priority TEXT DEFAULT 'normal',
  p_related_entity_type TEXT DEFAULT NULL,
  p_related_entity_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
  user_prefs user_notification_prefs;
  channels_to_send TEXT[];
BEGIN
  -- Get user preferences
  SELECT * INTO user_prefs
  FROM user_notification_prefs
  WHERE user_id = p_user_id;

  -- If no preferences set, use defaults
  IF user_prefs IS NULL THEN
    user_prefs := ROW(
      NULL, p_user_id, true, false, true, -- in_app, slack, email enabled
      true, true, true, true, true, -- all notification types enabled
      NULL, NULL, 'America/New_York', -- timing
      NULL, true, NULL, -- slack settings
      'immediate', true -- email settings
    );
  END IF;

  -- Determine channels to send based on preferences and type
  channels_to_send := ARRAY[]::TEXT[];

  -- In-app notifications (always included if enabled)
  IF user_prefs.in_app_enabled THEN
    channels_to_send := channels_to_send || 'in_app';
  END IF;

  -- Slack notifications
  IF user_prefs.slack_enabled THEN
    channels_to_send := channels_to_send || 'slack';
  END IF;

  -- Email notifications
  IF user_prefs.email_enabled THEN
    channels_to_send := channels_to_send || 'email';
  END IF;

  -- Create notification
  INSERT INTO notifications (
    user_id, type, title, message, priority,
    related_entity_type, related_entity_id,
    channels_pending, metadata
  ) VALUES (
    p_user_id, p_type, p_title, p_message, p_priority,
    p_related_entity_type, p_related_entity_id,
    channels_to_send, p_metadata
  ) RETURNING id INTO notification_id;

  RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 8. TRIGGER FOR UPDATED_AT
-- ============================================================================

DO $$ BEGIN
  CREATE TRIGGER update_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_user_prefs_updated_at
    BEFORE UPDATE ON user_notification_prefs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_templates_updated_at
    BEFORE UPDATE ON notification_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
