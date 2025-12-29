-- ============================================================================
-- Migration 131: Direct Carrier Tracking Configuration
-- Free carrier API settings for USPS, UPS, FedEx
-- Replaces AfterShip dependency with direct carrier APIs
-- ============================================================================

-- ============================================================================
-- CARRIER API CONFIGURATION DEFAULTS
-- ============================================================================

-- Insert default carrier configurations (disabled by default)
INSERT INTO app_settings (setting_key, setting_category, setting_value, updated_at)
VALUES 
  ('carrier_api_usps', 'integrations', '{
    "name": "USPS",
    "userId": "",
    "enabled": false,
    "rateLimit": 100,
    "registrationUrl": "https://www.usps.com/business/web-tools-apis/",
    "freeTier": "Unlimited"
  }', NOW()),
  ('carrier_api_ups', 'integrations', '{
    "name": "UPS",
    "userId": "",
    "apiKey": "",
    "enabled": false,
    "rateLimit": 20,
    "registrationUrl": "https://developer.ups.com/",
    "freeTier": "500/month"
  }', NOW()),
  ('carrier_api_fedex', 'integrations', '{
    "name": "FedEx",
    "userId": "",
    "apiKey": "",
    "enabled": false,
    "rateLimit": 150,
    "registrationUrl": "https://developer.fedex.com/",
    "freeTier": "5000/month"
  }', NOW())
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================================
-- TRACKING CACHE TABLE
-- Store tracking results to minimize API calls
-- ============================================================================

CREATE TABLE IF NOT EXISTS tracking_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_number VARCHAR(100) NOT NULL,
  carrier VARCHAR(20) NOT NULL,
  status VARCHAR(50) NOT NULL,
  status_description TEXT,
  estimated_delivery TIMESTAMPTZ,
  actual_delivery TIMESTAMPTZ,
  last_location VARCHAR(255),
  last_update TIMESTAMPTZ,
  events JSONB DEFAULT '[]'::jsonb,
  source VARCHAR(20) NOT NULL DEFAULT 'carrier_api', -- carrier_api, email, manual
  confidence NUMERIC(3,2) DEFAULT 1.0,
  raw_response JSONB,
  related_po_ids UUID[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  UNIQUE(tracking_number)
);

-- Indexes for tracking cache
CREATE INDEX IF NOT EXISTS idx_tracking_cache_number ON tracking_cache(tracking_number);
CREATE INDEX IF NOT EXISTS idx_tracking_cache_carrier ON tracking_cache(carrier);
CREATE INDEX IF NOT EXISTS idx_tracking_cache_status ON tracking_cache(status);
CREATE INDEX IF NOT EXISTS idx_tracking_cache_expires ON tracking_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_tracking_cache_po_ids ON tracking_cache USING GIN(related_po_ids);

COMMENT ON TABLE tracking_cache IS 'Cache for tracking results from carrier APIs and email extraction';

-- ============================================================================
-- TRACKING EVENTS TABLE  
-- Detailed event history for each tracking number
-- ============================================================================

CREATE TABLE IF NOT EXISTS tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_cache_id UUID REFERENCES tracking_cache(id) ON DELETE CASCADE,
  tracking_number VARCHAR(100) NOT NULL,
  event_timestamp TIMESTAMPTZ NOT NULL,
  status VARCHAR(50) NOT NULL,
  description TEXT,
  location VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  country VARCHAR(50) DEFAULT 'US',
  source VARCHAR(20) NOT NULL DEFAULT 'carrier_api',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for tracking events
CREATE INDEX IF NOT EXISTS idx_tracking_events_cache_id ON tracking_events(tracking_cache_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_number ON tracking_events(tracking_number);
CREATE INDEX IF NOT EXISTS idx_tracking_events_timestamp ON tracking_events(event_timestamp DESC);

COMMENT ON TABLE tracking_events IS 'Detailed tracking event history';

-- ============================================================================
-- CARRIER API USAGE TRACKING
-- Monitor API usage against free tier limits
-- ============================================================================

CREATE TABLE IF NOT EXISTS carrier_api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier VARCHAR(20) NOT NULL,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  request_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  last_request_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(carrier, usage_date)
);

-- Index for usage lookups
CREATE INDEX IF NOT EXISTS idx_carrier_usage_date ON carrier_api_usage(carrier, usage_date DESC);

COMMENT ON TABLE carrier_api_usage IS 'Track carrier API usage against free tier limits';

-- ============================================================================
-- FUNCTION: Increment Carrier API Usage
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_carrier_api_usage(
  p_carrier VARCHAR,
  p_success BOOLEAN DEFAULT TRUE
) RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO carrier_api_usage (carrier, usage_date, request_count, success_count, error_count, last_request_at)
  VALUES (p_carrier, CURRENT_DATE, 1, 
    CASE WHEN p_success THEN 1 ELSE 0 END,
    CASE WHEN p_success THEN 0 ELSE 1 END,
    NOW())
  ON CONFLICT (carrier, usage_date) 
  DO UPDATE SET
    request_count = carrier_api_usage.request_count + 1,
    success_count = carrier_api_usage.success_count + CASE WHEN p_success THEN 1 ELSE 0 END,
    error_count = carrier_api_usage.error_count + CASE WHEN p_success THEN 0 ELSE 1 END,
    last_request_at = NOW()
  RETURNING request_count INTO v_count;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_carrier_api_usage IS 'Track API usage for rate limiting';

-- ============================================================================
-- FUNCTION: Get Tracking from Cache
-- ============================================================================

CREATE OR REPLACE FUNCTION get_tracking_from_cache(
  p_tracking_number VARCHAR,
  p_max_age_minutes INTEGER DEFAULT 60
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'tracking_number', tracking_number,
    'carrier', carrier,
    'status', status,
    'status_description', status_description,
    'estimated_delivery', estimated_delivery,
    'actual_delivery', actual_delivery,
    'last_location', last_location,
    'last_update', last_update,
    'events', events,
    'source', source,
    'confidence', confidence,
    'related_po_ids', related_po_ids,
    'cached_at', updated_at
  )
  INTO v_result
  FROM tracking_cache
  WHERE tracking_number = p_tracking_number
    AND updated_at > NOW() - (p_max_age_minutes || ' minutes')::INTERVAL;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_tracking_from_cache IS 'Get cached tracking data if not stale';

-- ============================================================================
-- FUNCTION: Upsert Tracking Cache
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_tracking_cache(
  p_tracking_number VARCHAR,
  p_carrier VARCHAR,
  p_status VARCHAR,
  p_status_description TEXT DEFAULT NULL,
  p_estimated_delivery TIMESTAMPTZ DEFAULT NULL,
  p_actual_delivery TIMESTAMPTZ DEFAULT NULL,
  p_last_location VARCHAR DEFAULT NULL,
  p_events JSONB DEFAULT '[]'::jsonb,
  p_source VARCHAR DEFAULT 'carrier_api',
  p_confidence NUMERIC DEFAULT 1.0,
  p_raw_response JSONB DEFAULT NULL,
  p_related_po_ids UUID[] DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_cache_id UUID;
BEGIN
  INSERT INTO tracking_cache (
    tracking_number, carrier, status, status_description,
    estimated_delivery, actual_delivery, last_location, last_update,
    events, source, confidence, raw_response, related_po_ids, updated_at
  )
  VALUES (
    p_tracking_number, p_carrier, p_status, p_status_description,
    p_estimated_delivery, p_actual_delivery, p_last_location, NOW(),
    p_events, p_source, p_confidence, p_raw_response, p_related_po_ids, NOW()
  )
  ON CONFLICT (tracking_number) 
  DO UPDATE SET
    carrier = COALESCE(EXCLUDED.carrier, tracking_cache.carrier),
    status = EXCLUDED.status,
    status_description = COALESCE(EXCLUDED.status_description, tracking_cache.status_description),
    estimated_delivery = COALESCE(EXCLUDED.estimated_delivery, tracking_cache.estimated_delivery),
    actual_delivery = COALESCE(EXCLUDED.actual_delivery, tracking_cache.actual_delivery),
    last_location = COALESCE(EXCLUDED.last_location, tracking_cache.last_location),
    last_update = NOW(),
    events = CASE 
      WHEN jsonb_array_length(EXCLUDED.events) > 0 THEN EXCLUDED.events 
      ELSE tracking_cache.events 
    END,
    source = EXCLUDED.source,
    confidence = EXCLUDED.confidence,
    raw_response = COALESCE(EXCLUDED.raw_response, tracking_cache.raw_response),
    related_po_ids = COALESCE(EXCLUDED.related_po_ids, tracking_cache.related_po_ids),
    updated_at = NOW(),
    expires_at = NOW() + INTERVAL '24 hours'
  RETURNING id INTO v_cache_id;
  
  RETURN v_cache_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION upsert_tracking_cache IS 'Insert or update tracking cache entry';

-- ============================================================================
-- VIEW: Carrier API Status
-- Quick view of API usage and remaining quota
-- ============================================================================

CREATE OR REPLACE VIEW carrier_api_status AS
SELECT 
  c.carrier,
  c.request_count as requests_today,
  CASE c.carrier
    WHEN 'USPS' THEN 999999 -- Unlimited
    WHEN 'UPS' THEN 500
    WHEN 'FedEx' THEN 5000
    ELSE 100
  END as daily_limit,
  CASE c.carrier
    WHEN 'USPS' THEN 999999 - c.request_count
    WHEN 'UPS' THEN 500 - c.request_count
    WHEN 'FedEx' THEN 5000 - c.request_count
    ELSE 100 - c.request_count
  END as remaining_today,
  c.success_count,
  c.error_count,
  c.last_request_at,
  ROUND((c.success_count::NUMERIC / NULLIF(c.request_count, 0)) * 100, 1) as success_rate
FROM carrier_api_usage c
WHERE c.usage_date = CURRENT_DATE;

COMMENT ON VIEW carrier_api_status IS 'Current day API usage status per carrier';

-- ============================================================================
-- VIEW: Stale Tracking Numbers
-- Find tracking numbers that need refresh
-- ============================================================================

CREATE OR REPLACE VIEW stale_tracking_numbers AS
SELECT 
  tc.tracking_number,
  tc.carrier,
  tc.status,
  tc.last_update,
  tc.related_po_ids,
  EXTRACT(EPOCH FROM (NOW() - tc.last_update)) / 60 as minutes_since_update,
  tc.status NOT IN ('delivered', 'exception') as needs_tracking
FROM tracking_cache tc
WHERE tc.updated_at < NOW() - INTERVAL '2 hours'
  AND tc.status NOT IN ('delivered')
ORDER BY tc.last_update ASC;

COMMENT ON VIEW stale_tracking_numbers IS 'Tracking numbers that need refresh';

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

ALTER TABLE tracking_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_api_usage ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "tracking_cache_select_policy" ON tracking_cache
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tracking_cache_insert_policy" ON tracking_cache
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "tracking_cache_update_policy" ON tracking_cache
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "tracking_events_select_policy" ON tracking_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tracking_events_insert_policy" ON tracking_events
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "carrier_api_usage_select_policy" ON carrier_api_usage
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "carrier_api_usage_all_policy" ON carrier_api_usage
  FOR ALL TO authenticated USING (true);
