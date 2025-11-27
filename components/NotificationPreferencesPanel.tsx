import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase/client';
import Button from '@/components/ui/Button';
import type { User } from '../types';
import {
  BellIcon,
  SlackIcon,
  MailIcon,
  SaveIcon,
  ClockIcon,
  GlobeIcon,
  HashtagIcon,
  AtSymbolIcon
} from './icons';

interface NotificationPreferences {
  id?: string;
  user_id: string;
  in_app_enabled: boolean;
  slack_enabled: boolean;
  email_enabled: boolean;
  ticket_assignments: boolean;
  ticket_escalations: boolean;
  ticket_deadlines: boolean;
  approvals: boolean;
  system_alerts: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  timezone: string;
  slack_webhook_url?: string;
  slack_mention_me: boolean;
  slack_channel_override?: string;
  email_digest_frequency: 'immediate' | 'hourly' | 'daily' | 'weekly';
  email_include_comments: boolean;
}

interface NotificationPreferencesPanelProps {
  currentUser: User;
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const DEFAULT_PREFERENCES: Omit<NotificationPreferences, 'user_id'> = {
  in_app_enabled: true,
  slack_enabled: false,
  email_enabled: true,
  ticket_assignments: true,
  ticket_escalations: true,
  ticket_deadlines: true,
  approvals: true,
  system_alerts: true,
  timezone: 'America/New_York',
  slack_mention_me: true,
  email_digest_frequency: 'immediate',
  email_include_comments: true,
};

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'UTC',
];

const NotificationPreferencesPanel: React.FC<NotificationPreferencesPanelProps> = ({
  currentUser,
  addToast,
}) => {
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    ...DEFAULT_PREFERENCES,
    user_id: currentUser.id,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadPreferences();
  }, [currentUser.id]);

  const loadPreferences = async () => {
    try {
      const { data, error } = await supabase
        .from('user_notification_prefs')
        .select('*')
        .eq('user_id', currentUser.id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      if (data) {
        setPreferences(data);
      }
    } catch (error) {
      console.error('Error loading notification preferences:', error);
      addToast?.('Failed to load notification preferences', 'error');
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_notification_prefs')
        .upsert(preferences, { onConflict: 'user_id' });

      if (error) throw error;

      addToast?.('Notification preferences saved successfully', 'success');
    } catch (error) {
      console.error('Error saving notification preferences:', error);
      addToast?.('Failed to save notification preferences', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updatePreference = <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K]
  ) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BellIcon className="w-6 h-6 text-indigo-500" />
        <div>
          <h3 className="text-lg font-semibold text-white">Notification Preferences</h3>
          <p className="text-sm text-gray-400">
            Configure how and when you receive notifications about tickets, approvals, and system alerts.
          </p>
        </div>
      </div>

      {/* Channel Preferences */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700 p-6">
        <h4 className="text-md font-medium text-white mb-4 flex items-center gap-2">
          <BellIcon className="w-5 h-5" />
          Notification Channels
        </h4>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
            <div className="flex items-center gap-3">
              <BellIcon className="w-5 h-5 text-indigo-400" />
              <div>
                <span className="text-sm font-medium text-white">In-App Notifications</span>
                <p className="text-xs text-gray-400">Bell icon alerts in the application</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.in_app_enabled}
                onChange={(e) => updatePreference('in_app_enabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
            <div className="flex items-center gap-3">
              <SlackIcon className="w-5 h-5 text-purple-400" />
              <div>
                <span className="text-sm font-medium text-white">Slack Notifications</span>
                <p className="text-xs text-gray-400">Messages sent to Slack channels</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.slack_enabled}
                onChange={(e) => updatePreference('slack_enabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
            <div className="flex items-center gap-3">
              <MailIcon className="w-5 h-5 text-blue-400" />
              <div>
                <span className="text-sm font-medium text-white">Email Notifications</span>
                <p className="text-xs text-gray-400">Email messages to your inbox</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.email_enabled}
                onChange={(e) => updatePreference('email_enabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Notification Types */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700 p-6">
        <h4 className="text-md font-medium text-white mb-4">Notification Types</h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { key: 'ticket_assignments', label: 'Ticket Assignments', desc: 'When tickets are assigned to you' },
            { key: 'ticket_escalations', label: 'Ticket Escalations', desc: 'When tickets are escalated' },
            { key: 'ticket_deadlines', label: 'Ticket Deadlines', desc: 'Due date reminders and overdue alerts' },
            { key: 'approvals', label: 'Approval Requests', desc: 'When your approval is needed' },
            { key: 'system_alerts', label: 'System Alerts', desc: 'System maintenance and critical alerts' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
              <div>
                <span className="text-sm font-medium text-white">{label}</span>
                <p className="text-xs text-gray-400">{desc}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferences[key as keyof NotificationPreferences] as boolean}
                  onChange={(e) => updatePreference(key as keyof NotificationPreferences, e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Timing Preferences */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700 p-6">
        <h4 className="text-md font-medium text-white mb-4 flex items-center gap-2">
          <ClockIcon className="w-5 h-5" />
          Timing & Quiet Hours
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <GlobeIcon className="w-4 h-4 inline mr-1" />
              Timezone
            </label>
            <select
              value={preferences.timezone}
              onChange={(e) => updatePreference('timezone', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-indigo-500"
            >
              {TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Email Digest Frequency
            </label>
            <select
              value={preferences.email_digest_frequency}
              onChange={(e) => updatePreference('email_digest_frequency', e.target.value as any)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-indigo-500"
            >
              <option value="immediate">Immediate (send right away)</option>
              <option value="hourly">Hourly digest</option>
              <option value="daily">Daily digest</option>
              <option value="weekly">Weekly digest</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Quiet Hours Start
            </label>
            <input
              type="time"
              value={preferences.quiet_hours_start || ''}
              onChange={(e) => updatePreference('quiet_hours_start', e.target.value || undefined)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-indigo-500"
              placeholder="e.g., 22:00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Quiet Hours End
            </label>
            <input
              type="time"
              value={preferences.quiet_hours_end || ''}
              onChange={(e) => updatePreference('quiet_hours_end', e.target.value || undefined)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-indigo-500"
              placeholder="e.g., 08:00"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={preferences.email_include_comments}
              onChange={(e) => updatePreference('email_include_comments', e.target.checked)}
              className="rounded border-gray-700 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-300">Include ticket comments in email notifications</span>
          </label>
        </div>
      </div>

      {/* Slack Settings */}
      {preferences.slack_enabled && (
        <div className="bg-gray-800/30 rounded-xl border border-gray-700 p-6">
          <h4 className="text-md font-medium text-white mb-4 flex items-center gap-2">
            <SlackIcon className="w-5 h-5" />
            Slack Settings
          </h4>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                <HashtagIcon className="w-4 h-4 inline mr-1" />
                Slack Channel Override (optional)
              </label>
              <input
                type="text"
                value={preferences.slack_channel_override || ''}
                onChange={(e) => updatePreference('slack_channel_override', e.target.value || undefined)}
                placeholder="#your-channel or @username"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave empty to use system default channels
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Personal Slack Webhook URL (optional)
              </label>
              <input
                type="url"
                value={preferences.slack_webhook_url || ''}
                onChange={(e) => updatePreference('slack_webhook_url', e.target.value || undefined)}
                placeholder="https://hooks.slack.com/services/..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Use your own webhook for personal notifications
              </p>
            </div>

            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={preferences.slack_mention_me}
                  onChange={(e) => updatePreference('slack_mention_me', e.target.checked)}
                  className="rounded border-gray-700 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm text-gray-300 flex items-center gap-1">
                  <AtSymbolIcon className="w-4 h-4" />
                  Mention me (@username) in Slack messages
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={savePreferences}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white px-6 py-2 rounded-lg flex items-center gap-2"
        >
          <SaveIcon className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Preferences'}
        </Button>
      </div>
    </div>
  );
};

export default NotificationPreferencesPanel;