-- Migration: Add calendar configuration settings
-- Created: 2025-11-19

-- Create the table if it does not exist yet
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_id TEXT,
  calendar_timezone TEXT DEFAULT 'America/Los_Angeles',
  calendar_sync_enabled BOOLEAN DEFAULT false,
  calendar_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure required columns exist if the table predated this migration
ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS calendar_id TEXT,
ADD COLUMN IF NOT EXISTS calendar_timezone TEXT DEFAULT 'America/Los_Angeles',
ADD COLUMN IF NOT EXISTS calendar_sync_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS calendar_name TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for faster calendar lookups
CREATE INDEX IF NOT EXISTS idx_user_settings_calendar 
ON user_settings(calendar_id) 
WHERE calendar_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN user_settings.calendar_id IS 'Google Calendar ID for production build synchronization';
COMMENT ON COLUMN user_settings.calendar_timezone IS 'Timezone for calendar events';
COMMENT ON COLUMN user_settings.calendar_sync_enabled IS 'Whether Google Calendar sync is enabled';
COMMENT ON COLUMN user_settings.calendar_name IS 'Display name of the selected calendar';

-- ============================================================================
-- RLS configuration
-- ============================================================================

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_settings' 
    AND policyname = 'Users can view own settings'
  ) THEN
    CREATE POLICY "Users can view own settings"
      ON user_settings
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_settings' 
    AND policyname = 'Users can upsert own settings'
  ) THEN
    CREATE POLICY "Users can upsert own settings"
      ON user_settings
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================================
-- Updated-at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_user_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_settings_timestamp ON user_settings;
CREATE TRIGGER trigger_update_user_settings_timestamp
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_user_settings_timestamp();
