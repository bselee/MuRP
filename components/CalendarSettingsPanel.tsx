import React, { useState, useEffect, useMemo } from 'react';
import { CalendarIcon, RefreshIcon, TrashIcon, ChevronDownIcon } from './icons';
import { getGoogleCalendarService, type GoogleCalendar } from '../services/googleCalendarService';
import { supabase } from '../lib/supabase/client';
import Button from '@/components/ui/Button';
import type { CalendarSourceConfig } from '../types/calendar';
import { normalizeCalendarSources } from '../types/calendar';

interface CalendarSettingsPanelProps {
  userId: string;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

interface CalendarSettings {
  calendar_timezone: string;
  calendar_sync_enabled: boolean;
  calendar_sources: CalendarSourceConfig[];
  calendar_push_enabled: boolean;
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
    calendar_timezone: 'America/Los_Angeles',
    calendar_sync_enabled: false,
    calendar_sources: [],
    calendar_push_enabled: false,
  });
  const [availableCalendars, setAvailableCalendars] = useState<GoogleCalendar[]>([]);
  const [isLoadingCalendars, setIsLoadingCalendars] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasGoogleAuth, setHasGoogleAuth] = useState(false);
  const primaryCalendar = useMemo(() => {
    if (settings.calendar_sources.length === 0) return null;
    return settings.calendar_sources.find((src) => src.ingestEnabled) ?? settings.calendar_sources[0];
  }, [settings.calendar_sources]);

  const calendarService = useMemo(
    () => getGoogleCalendarService(primaryCalendar?.id || undefined, primaryCalendar?.timezone || settings.calendar_timezone),
    [primaryCalendar?.id, primaryCalendar?.timezone, settings.calendar_timezone]
  );

  useEffect(() => {
    loadSettings();
  }, [userId]);

  useEffect(() => {
    checkGoogleAuth();
  }, [calendarService]);

  const checkGoogleAuth = async () => {
    try {
      await calendarService.listCalendars();
      setHasGoogleAuth(true);
    } catch (error) {
      console.error('Error checking Google auth:', error);
      setHasGoogleAuth(false);
    }
  };

  const handleConnectGoogle = async () => {
    try {
      // Use Supabase's built-in Google OAuth with comprehensive scopes
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets',
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) throw error;
      
      // The page will redirect to Google OAuth
    } catch (error) {
      console.error('Error connecting to Google:', error);
      addToast('Failed to connect to Google', 'error');
    }
  };

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('calendar_id, calendar_name, calendar_timezone, calendar_sync_enabled, calendar_sources, calendar_push_enabled')
        .eq('user_id', userId)
        .single();

      if (error && (error as any).code !== 'PGRST116') {
        throw error;
      }

      const sources = normalizeCalendarSources(data?.calendar_sources, {
        id: data?.calendar_id ?? null,
        name: data?.calendar_name ?? null,
        timezone: data?.calendar_timezone ?? null,
      });

      setSettings({
        calendar_timezone: data?.calendar_timezone || 'America/Los_Angeles',
        calendar_sync_enabled: data?.calendar_sync_enabled || false,
        calendar_sources: sources,
        calendar_push_enabled: data?.calendar_push_enabled || false,
      });
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
      const calendars = await calendarService.listCalendars();

      if (calendars.length === 0) {
        addToast('No calendars found in your Google account', 'info');
      }

      setAvailableCalendars(calendars);
    } catch (error) {
      console.error('Error loading calendars:', error);
      addToast('Failed to load Google Calendars. Please ensure you have granted calendar access.', 'error');
    } finally {
      setIsLoadingCalendars(false);
    }
  };

  const handleAddCalendar = (calendar: GoogleCalendar) => {
    if (settings.calendar_sources.some((src) => src.id === calendar.id)) {
      addToast('Calendar already connected', 'info');
      return;
    }

    setSettings((prev) => ({
      ...prev,
      calendar_sources: [
        ...prev.calendar_sources,
        {
          id: calendar.id,
          name: calendar.summary,
          timezone: calendar.timeZone || prev.calendar_timezone,
          ingestEnabled: prev.calendar_sources.length === 0,
          pushEnabled: false,
        },
      ],
    }));
  };

  const handleSaveSettings = async () => {
    try {
      setIsSaving(true);
      const primary = settings.calendar_sources.find((src) => src.ingestEnabled) ?? settings.calendar_sources[0] ?? null;

      const payload = {
        user_id: userId,
        calendar_id: primary?.id ?? null,
        calendar_name: primary?.name ?? null,
        calendar_timezone: settings.calendar_timezone,
        calendar_sync_enabled: settings.calendar_sync_enabled,
        calendar_sources: settings.calendar_sources,
        calendar_push_enabled: settings.calendar_push_enabled,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('user_settings')
        .upsert(payload, { onConflict: 'user_id' });

      if (error) throw error;

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
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 space-y-3">
          <p className="text-sm text-yellow-200">
            ⚠️ Google account not connected. Connect your Google account to access calendar features.
          </p>
          <Button
            onClick={handleConnectGoogle}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 text-gray-900 font-medium rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Connect Google Account
          </Button>
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
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-white">Connected Calendars</label>
            <p className="text-xs text-gray-400">Add multiple calendars and choose which ones to ingest builds from.</p>
          </div>
          <Button
            onClick={loadAvailableCalendars}
            disabled={isLoadingCalendars || !hasGoogleAuth}
            className="flex items-center gap-2 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            <RefreshIcon className={`w-4 h-4 ${isLoadingCalendars ? 'animate-spin' : ''}`} />
            {isLoadingCalendars ? 'Loading…' : 'Load Google Calendars'}
          </Button>
        </div>

        {settings.calendar_sources.length === 0 ? (
          <div className="p-4 border border-dashed border-gray-700 rounded-lg text-sm text-gray-400">
            No calendars connected yet. Load calendars above to add them.
          </div>
        ) : (
          <div className="space-y-3">
            {settings.calendar_sources.map((source) => (
              <div key={source.id} className="border border-gray-700 rounded-lg p-4 bg-gray-900/40 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">{source.name}</p>
                    <p className="text-xs text-gray-400 break-all">{source.id}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Timezone: {source.timezone || settings.calendar_timezone}
                    </p>
                  </div>
                  <Button
                    onClick={() => handleRemoveCalendar(source.id)}
                    className="text-gray-400 hover:text-red-400 transition-colors"
                    title="Remove calendar"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center justify-between text-sm text-gray-200">
                    <span>Pull builds & demand</span>
                    <input
                      type="checkbox"
                      className="w-5 h-5 text-blue-600 rounded border-gray-600 bg-gray-800"
                      checked={source.ingestEnabled}
                      onChange={(e) => handleToggleIngest(source.id, e.target.checked)}
                    />
                  </label>
                  <label className="flex items-center justify-between text-sm text-gray-200">
                    <span>Push logistics events</span>
                    <input
                      type="checkbox"
                      className="w-5 h-5 text-indigo-600 rounded border-gray-600 bg-gray-800"
                      checked={source.pushEnabled && settings.calendar_push_enabled}
                      disabled={!settings.calendar_push_enabled}
                      onChange={(e) => handleTogglePush(source.id, e.target.checked)}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        {availableCalendars.length > 0 && (
          <div className="border border-gray-800 rounded-lg">
            <div className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-white bg-gray-900/60 border-b border-gray-800">
              <span className="flex items-center gap-2">
                <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                Available Google Calendars
              </span>
              <span className="text-xs text-gray-400">{availableCalendars.length} found</span>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-gray-800">
              {availableCalendars.map((calendar) => {
                const isLinked = settings.calendar_sources.some((src) => src.id === calendar.id);
                return (
                  <div key={calendar.id} className="p-3 bg-gray-900/30">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{calendar.summary}</p>
                        {calendar.description && (
                          <p className="text-xs text-gray-400">{calendar.description}</p>
                        )}
                        <p className="text-[11px] text-gray-500 mt-1">
                          {calendar.id} • {calendar.timeZone}
                        </p>
                      </div>
                      <Button
                        onClick={() => handleAddCalendar(calendar)}
                        disabled={isLinked}
                        className={`px-3 py-1 rounded text-xs font-semibold ${
                          isLinked
                            ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        }`}
                      >
                        {isLinked ? 'Connected' : 'Add'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Push toggle */}
      <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
        <div>
          <label className="text-sm font-medium text-white">Enable Calendar Push</label>
          <p className="text-xs text-gray-400 mt-1">
            When enabled, MuRP can push inbound logistics events (critical POs, expected receipts) to selected calendars.
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.calendar_push_enabled}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                calendar_push_enabled: e.target.checked,
                calendar_sources: e.target.checked
                  ? prev.calendar_sources
                  : prev.calendar_sources.map((src) => ({ ...src, pushEnabled: false })),
              }))
            }
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
        </label>
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
        <Button
          onClick={handleSaveSettings}
          disabled={isSaving || !hasGoogleAuth}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
        >
          {isSaving ? 'Saving...' : 'Save Calendar Settings'}
        </Button>
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
  const handleRemoveCalendar = (id: string) => {
    setSettings((prev) => ({
      ...prev,
      calendar_sources: prev.calendar_sources.filter((src) => src.id !== id),
    }));
  };

  const handleToggleIngest = (id: string, enabled: boolean) => {
    setSettings((prev) => ({
      ...prev,
      calendar_sources: prev.calendar_sources.map((src) =>
        src.id === id ? { ...src, ingestEnabled: enabled } : src
      ),
    }));
  };

  const handleTogglePush = (id: string, enabled: boolean) => {
    if (!settings.calendar_push_enabled && enabled) return;
    setSettings((prev) => ({
      ...prev,
      calendar_sources: prev.calendar_sources.map((src) =>
        src.id === id ? { ...src, pushEnabled: enabled } : src
      ),
    }));
  };
