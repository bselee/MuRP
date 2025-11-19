import React, { useState, useEffect } from 'react';
import { CalendarIcon, RefreshIcon, CheckCircleIcon } from './icons';
import { getGoogleCalendarService, type GoogleCalendar } from '../services/googleCalendarService';
import { supabase } from '../lib/supabase/client';

interface CalendarSettingsPanelProps {
  userId: string;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

interface CalendarSettings {
  calendar_id: string | null;
  calendar_timezone: string;
  calendar_sync_enabled: boolean;
  calendar_name: string | null;
}

const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Phoenix',
  'Pacific/Honolulu',
  'America/Anchorage',
  'UTC',
];

export const CalendarSettingsPanel: React.FC<CalendarSettingsPanelProps> = ({ userId, addToast }) => {
  const [settings, setSettings] = useState<CalendarSettings>({
    calendar_id: null,
    calendar_timezone: 'America/Los_Angeles',
    calendar_sync_enabled: false,
    calendar_name: null,
  });
  const [availableCalendars, setAvailableCalendars] = useState<GoogleCalendar[]>([]);
  const [isLoadingCalendars, setIsLoadingCalendars] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasGoogleAuth, setHasGoogleAuth] = useState(false);

  useEffect(() => {
    loadSettings();
    checkGoogleAuth();
  }, [userId]);

  const checkGoogleAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setHasGoogleAuth(!!session?.provider_token);
    } catch (error) {
      console.error('Error checking Google auth:', error);
      setHasGoogleAuth(false);
    }
  };

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('calendar_id, calendar_timezone, calendar_sync_enabled, calendar_name')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setSettings({
          calendar_id: data.calendar_id,
          calendar_timezone: data.calendar_timezone || 'America/Los_Angeles',
          calendar_sync_enabled: data.calendar_sync_enabled || false,
          calendar_name: data.calendar_name,
        });
      }
    } catch (error) {
      console.error('Error loading calendar settings:', error);
      addToast('Failed to load calendar settings', 'error');
    }
  };

  const loadAvailableCalendars = async () => {
    if (!hasGoogleAuth) {
      addToast('Please connect your Google account first', 'error');
      return;
    }

    try {
      setIsLoadingCalendars(true);
      const calendarService = getGoogleCalendarService();
      const calendars = await calendarService.listCalendars();
      setAvailableCalendars(calendars);
      
      if (calendars.length === 0) {
        addToast('No calendars found in your Google account', 'info');
      }
    } catch (error) {
      console.error('Error loading calendars:', error);
      addToast('Failed to load Google Calendars. Please ensure you have granted calendar access.', 'error');
    } finally {
      setIsLoadingCalendars(false);
    }
  };

  const handleCalendarSelect = (calendar: GoogleCalendar) => {
    setSettings({
      ...settings,
      calendar_id: calendar.id,
      calendar_name: calendar.summary,
      calendar_timezone: calendar.timeZone || settings.calendar_timezone,
    });
  };

  const handleSaveSettings = async () => {
    try {
      setIsSaving(true);

      // Upsert settings
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: userId,
          calendar_id: settings.calendar_id,
          calendar_timezone: settings.calendar_timezone,
          calendar_sync_enabled: settings.calendar_sync_enabled,
          calendar_name: settings.calendar_name,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      if (error) throw error;

      // Update the service with new calendar ID
      const calendarService = getGoogleCalendarService(
        settings.calendar_id || 'primary',
        settings.calendar_timezone
      );

      addToast('Calendar settings saved successfully', 'success');
    } catch (error) {
      console.error('Error saving calendar settings:', error);
      addToast('Failed to save calendar settings', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
          <CalendarIcon className="w-5 h-5" />
          Google Calendar Integration
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          Connect to a Google Calendar to pull build information from other creators' calendars and sync production schedules.
        </p>
      </div>

      {!hasGoogleAuth && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
          <p className="text-sm text-yellow-200">
            ⚠️ Google account not connected. Please connect your Google account in the Google Integration section first.
          </p>
        </div>
      )}

      {/* Enable/Disable Calendar Sync */}
      <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
        <div>
          <label className="text-sm font-medium text-white">Enable Calendar Sync</label>
          <p className="text-xs text-gray-400 mt-1">
            Automatically sync production builds with Google Calendar
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.calendar_sync_enabled}
            onChange={(e) => setSettings({ ...settings, calendar_sync_enabled: e.target.checked })}
            disabled={!hasGoogleAuth}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>

      {/* Calendar Selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-white">Select Calendar</label>
          <button
            onClick={loadAvailableCalendars}
            disabled={isLoadingCalendars || !hasGoogleAuth}
            className="flex items-center gap-2 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            <RefreshIcon className={`w-4 h-4 ${isLoadingCalendars ? 'animate-spin' : ''}`} />
            {isLoadingCalendars ? 'Loading...' : 'Load Calendars'}
          </button>
        </div>

        {settings.calendar_name && (
          <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
            <CheckCircleIcon className="w-5 h-5 text-green-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-white">{settings.calendar_name}</p>
              <p className="text-xs text-gray-400">{settings.calendar_id}</p>
            </div>
          </div>
        )}

        {availableCalendars.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {availableCalendars.map((calendar) => (
              <button
                key={calendar.id}
                onClick={() => handleCalendarSelect(calendar)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  settings.calendar_id === calendar.id
                    ? 'bg-blue-500/20 border-blue-500'
                    : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{calendar.summary}</p>
                    {calendar.description && (
                      <p className="text-xs text-gray-400 mt-1">{calendar.description}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {calendar.id} • {calendar.timeZone}
                    </p>
                  </div>
                  {calendar.primary && (
                    <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">
                      Primary
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Timezone Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-white">Timezone</label>
        <select
          value={settings.calendar_timezone}
          onChange={(e) => setSettings({ ...settings, calendar_timezone: e.target.value })}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-400">
          Timezone for calendar events. This should match your production facility's location.
        </p>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-gray-700">
        <button
          onClick={handleSaveSettings}
          disabled={isSaving || !hasGoogleAuth}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
        >
          {isSaving ? 'Saving...' : 'Save Calendar Settings'}
        </button>
      </div>

      {/* Usage Instructions */}
      <div className="mt-6 p-4 bg-gray-800/30 border border-gray-700 rounded-lg">
        <h4 className="text-sm font-semibold text-white mb-2">How to use Calendar Integration:</h4>
        <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
          <li>Connect your Google account and grant calendar access</li>
          <li>Select the calendar you want to pull build information from</li>
          <li>Enable calendar sync to automatically create events for production builds</li>
          <li>View synced builds in the Production Calendar view</li>
          <li>Calendar events include material requirements and build details</li>
        </ul>
      </div>
    </div>
  );
};

export default CalendarSettingsPanel;
