-- 053_vendor_confidence_profiles.sql
-- Vendor confidence scoring system schema, functions, and bootstrap.

BEGIN;

CREATE TYPE vendor_confidence_trend AS ENUM ('improving', 'stable', 'declining');

CREATE TYPE vendor_communication_status AS ENUM (
  'fully_automatic',
  'automatic_with_review',
  'needs_review',
  'needs_full_review',
  'suspended'
);

CREATE TABLE vendor_confidence_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  confidence_score NUMERIC(4,2) NOT NULL DEFAULT 5.0,
  response_latency_score NUMERIC(4,2) NOT NULL DEFAULT 5.0,
  threading_score NUMERIC(4,2) NOT NULL DEFAULT 5.0,
  completeness_score NUMERIC(4,2) NOT NULL DEFAULT 5.0,
  invoice_accuracy_score NUMERIC(4,2) NOT NULL DEFAULT 5.0,
  lead_time_score NUMERIC(4,2) NOT NULL DEFAULT 5.0,
  trend vendor_confidence_trend NOT NULL DEFAULT 'stable',
  score_30_days_ago NUMERIC(4,2),
  recommended_lead_time_buffer_days INTEGER NOT NULL DEFAULT 7,
  template_strictness TEXT NOT NULL DEFAULT 'standard',
  communication_status vendor_communication_status NOT NULL DEFAULT 'automatic_with_review',
  interactions_count INTEGER NOT NULL DEFAULT 0,
  last_recalculated_at TIMESTAMPTZ DEFAULT NOW(),
  alert_suppressed_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vendor_id)
);

CREATE TABLE vendor_confidence_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  confidence_score NUMERIC(4,2) NOT NULL,
  response_latency_score NUMERIC(4,2),
  threading_score NUMERIC(4,2),
  completeness_score NUMERIC(4,2),
  invoice_accuracy_score NUMERIC(4,2),
  lead_time_score NUMERIC(4,2),
  communication_status vendor_communication_status,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vendor_interaction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  response_latency_minutes NUMERIC(10,2),
  is_threaded BOOLEAN,
  extraction_confidence NUMERIC(4,2),
  invoice_variance_percent NUMERIC(5,2),
  delivered_on_time BOOLEAN,
  payload JSONB,
  trigger_source TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vendor_confidence_profiles_vendor ON vendor_confidence_profiles(vendor_id);
CREATE INDEX idx_vendor_confidence_history_vendor ON vendor_confidence_history(vendor_id);
CREATE INDEX idx_vendor_interaction_events_vendor ON vendor_interaction_events(vendor_id);
CREATE INDEX idx_vendor_interaction_events_type ON vendor_interaction_events(event_type);

CREATE OR REPLACE FUNCTION get_communication_status_from_score(score NUMERIC)
RETURNS vendor_communication_status
LANGUAGE plpgsql
AS $$
BEGIN
  IF score >= 8 THEN
    RETURN 'fully_automatic';
  ELSIF score >= 6 THEN
    RETURN 'automatic_with_review';
  ELSIF score >= 4 THEN
    RETURN 'needs_review';
  ELSIF score >= 2 THEN
    RETURN 'needs_full_review';
  ELSE
    RETURN 'suspended';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION get_template_strictness_from_score(score NUMERIC)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  IF score >= 8 THEN
    RETURN 'relaxed';
  ELSIF score >= 6 THEN
    RETURN 'standard';
  ELSIF score >= 4 THEN
    RETURN 'strict';
  ELSE
    RETURN 'maximum';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION calculate_vendor_confidence_factors(_vendor_id UUID)
RETURNS TABLE (
  response_latency_score NUMERIC,
  threading_score NUMERIC,
  completeness_score NUMERIC,
  invoice_accuracy_score NUMERIC,
  lead_time_score NUMERIC,
  interactions INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  avg_latency NUMERIC;
  threaded_ratio NUMERIC;
  completeness_avg NUMERIC;
  on_time_ratio NUMERIC;
  invoice_accuracy_avg NUMERIC;
  total_events INTEGER;
BEGIN
  SELECT
    AVG(response_latency_minutes),
    AVG(CASE WHEN is_threaded THEN 1 ELSE 0 END)::NUMERIC,
    AVG(extraction_confidence),
    AVG(CASE WHEN delivered_on_time THEN 1 ELSE 0 END)::NUMERIC,
    AVG(1 - COALESCE(invoice_variance_percent, 0) / 100.0),
    COUNT(*)
  INTO
    avg_latency,
    threaded_ratio,
    completeness_avg,
    on_time_ratio,
    invoice_accuracy_avg,
    total_events
  FROM vendor_interaction_events
  WHERE vendor_id = _vendor_id;

  response_latency_score := CASE
    WHEN avg_latency IS NULL THEN 5
    WHEN avg_latency <= 240 THEN 10
    WHEN avg_latency <= 480 THEN 9
    WHEN avg_latency <= 1440 THEN 7
    WHEN avg_latency <= 2880 THEN 5
    WHEN avg_latency <= 4320 THEN 3
    ELSE 1
  END;

  threading_score := CASE
    WHEN threaded_ratio IS NULL THEN 5
    WHEN threaded_ratio >= 0.95 THEN 10
    WHEN threaded_ratio >= 0.85 THEN 8
    WHEN threaded_ratio >= 0.70 THEN 6
    WHEN threaded_ratio >= 0.50 THEN 4
    ELSE 2
  END;

  completeness_score := COALESCE(ROUND(GREATEST(LEAST(completeness_avg * 10, 10), 0)::NUMERIC, 2), 5);

  invoice_accuracy_score := CASE
    WHEN invoice_accuracy_avg IS NULL THEN 5
    WHEN invoice_accuracy_avg >= 1 THEN 10
    WHEN invoice_accuracy_avg >= 0.9 THEN 8
    WHEN invoice_accuracy_avg >= 0.7 THEN 6
    WHEN invoice_accuracy_avg >= 0.5 THEN 4
    ELSE 2
  END;

  lead_time_score := CASE
    WHEN on_time_ratio IS NULL THEN 5
    WHEN on_time_ratio >= 0.95 THEN 10
    WHEN on_time_ratio >= 0.85 THEN 8
    WHEN on_time_ratio >= 0.70 THEN 6
    WHEN on_time_ratio >= 0.50 THEN 4
    ELSE 2
  END;

  interactions := COALESCE(total_events, 0);
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION recalculate_vendor_confidence(_vendor_id UUID, _trigger TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  factors RECORD;
  total_score NUMERIC;
  previous_score NUMERIC;
BEGIN
  SELECT * INTO factors FROM calculate_vendor_confidence_factors(_vendor_id);

  total_score :=
    ROUND(
      (COALESCE(factors.response_latency_score, 5) * 0.20) +
      (COALESCE(factors.threading_score, 5) * 0.15) +
      (COALESCE(factors.completeness_score, 5) * 0.20) +
      (COALESCE(factors.invoice_accuracy_score, 5) * 0.25) +
      (COALESCE(factors.lead_time_score, 5) * 0.20)
    , 2);

  SELECT confidence_score INTO previous_score FROM vendor_confidence_profiles WHERE vendor_id = _vendor_id;

  INSERT INTO vendor_confidence_history (
    vendor_id,
    confidence_score,
    response_latency_score,
    threading_score,
    completeness_score,
    invoice_accuracy_score,
    lead_time_score,
    communication_status
  ) VALUES (
    _vendor_id,
    total_score,
    factors.response_latency_score,
    factors.threading_score,
    factors.completeness_score,
    factors.invoice_accuracy_score,
    factors.lead_time_score,
    get_communication_status_from_score(total_score)
  );

  UPDATE vendor_confidence_profiles
  SET
    confidence_score = total_score,
    response_latency_score = factors.response_latency_score,
    threading_score = factors.threading_score,
    completeness_score = factors.completeness_score,
    invoice_accuracy_score = factors.invoice_accuracy_score,
    lead_time_score = factors.lead_time_score,
    interactions_count = factors.interactions,
    last_recalculated_at = NOW(),
    template_strictness = get_template_strictness_from_score(total_score),
    communication_status = get_communication_status_from_score(total_score),
    trend = CASE
      WHEN previous_score IS NULL OR total_score = previous_score THEN 'stable'
      WHEN total_score > previous_score THEN 'improving'
      ELSE 'declining'
    END
  WHERE vendor_id = _vendor_id;
END;
$$;

CREATE OR REPLACE FUNCTION vendor_confidence_events_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM recalculate_vendor_confidence(NEW.vendor_id, NEW.trigger_source);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vendor_confidence_events
AFTER INSERT ON vendor_interaction_events
FOR EACH ROW EXECUTE FUNCTION vendor_confidence_events_trigger();

-- Bootstrap profiles for existing vendors
INSERT INTO vendor_confidence_profiles (vendor_id)
SELECT id FROM vendors
ON CONFLICT (vendor_id) DO NOTHING;

-- Seed history rows for bootstrap
INSERT INTO vendor_confidence_history (vendor_id, confidence_score)
SELECT vendor_id, confidence_score FROM vendor_confidence_profiles;

-- Store configuration defaults in app_settings
INSERT INTO app_settings (setting_key, setting_category, setting_value, display_name, description, editable_by)
VALUES (
  'vendor_confidence_config',
  'vendor_success',
  jsonb_build_object(
    'weights', jsonb_build_object(
      'response_latency', 0.20,
      'threading', 0.15,
      'completeness', 0.20,
      'invoice_accuracy', 0.25,
      'lead_time', 0.20
    ),
    'minimum_interactions', 5,
    'alert_drop_threshold', 1.0
  ),
  'Vendor Confidence Scoring',
  'Weights and alert thresholds for vendor confidence profiles',
  ARRAY['admin', 'manager']
)
ON CONFLICT (setting_key) DO NOTHING;

-- Allow frontend to recalc on demand
CREATE OR REPLACE FUNCTION refresh_vendor_confidence_profile(vendor_id UUID, trigger_source TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM recalculate_vendor_confidence(vendor_id, trigger_source);
END;
$$;

COMMIT;
