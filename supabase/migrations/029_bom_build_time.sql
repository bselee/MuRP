-- Migration 028: BOM build time + labor metadata

ALTER TABLE boms
  ADD COLUMN IF NOT EXISTS build_time_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS labor_cost_per_hour NUMERIC(10,2);

COMMENT ON COLUMN boms.build_time_minutes IS 'Estimated labor time to complete one build (in minutes)';
COMMENT ON COLUMN boms.labor_cost_per_hour IS 'Blended hourly labor rate used for costing builds';
