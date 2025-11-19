-- Migration: Add calendar configuration settings
-- Created: 2025-11-19

-- Add calendar settings to user_settings table
ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS calendar_id TEXT,
ADD COLUMN IF NOT EXISTS calendar_timezone TEXT DEFAULT 'America/Los_Angeles',
ADD COLUMN IF NOT EXISTS calendar_sync_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS calendar_name TEXT;

-- Create index for faster calendar lookups
CREATE INDEX IF NOT EXISTS idx_user_settings_calendar 
ON user_settings(calendar_id) 
WHERE calendar_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN user_settings.calendar_id IS 'Google Calendar ID for production build synchronization';
COMMENT ON COLUMN user_settings.calendar_timezone IS 'Timezone for calendar events';
COMMENT ON COLUMN user_settings.calendar_sync_enabled IS 'Whether Google Calendar sync is enabled';
COMMENT ON COLUMN user_settings.calendar_name IS 'Display name of the selected calendar';
