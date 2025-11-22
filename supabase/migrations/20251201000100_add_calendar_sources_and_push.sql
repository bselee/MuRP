-- Migration: Enhance calendar settings for multi-calendar ingest & push
-- Adds JSONB calendar_sources and push toggle while seeding legacy values

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS calendar_sources JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS calendar_push_enabled BOOLEAN DEFAULT false;

-- Backfill calendar_sources for existing rows that only have calendar_id
UPDATE user_settings
SET calendar_sources =
  CASE
    WHEN (calendar_sources IS NULL OR jsonb_typeof(calendar_sources) <> 'array' OR jsonb_array_length(calendar_sources) = 0)
      AND calendar_id IS NOT NULL
    THEN jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'id', calendar_id,
        'name', COALESCE(calendar_name, calendar_id),
        'timezone', calendar_timezone,
        'ingestEnabled', true,
        'pushEnabled', false
      ))
    )
    ELSE calendar_sources
  END
WHERE TRUE;

COMMENT ON COLUMN user_settings.calendar_sources IS 'Array of connected calendars with ingest/push settings';
COMMENT ON COLUMN user_settings.calendar_push_enabled IS 'Global toggle to allow pushing events back to calendar providers';
