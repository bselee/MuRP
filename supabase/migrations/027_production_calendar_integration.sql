-- Migration 027: Production Calendar Integration
-- Adds scheduling and material sourcing capabilities to build orders

-- ============================================================================
-- ENHANCE BUILD_ORDERS TABLE
-- ============================================================================

ALTER TABLE build_orders ADD COLUMN IF NOT EXISTS scheduled_date TIMESTAMPTZ;
ALTER TABLE build_orders ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
ALTER TABLE build_orders ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;
ALTER TABLE build_orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE build_orders ADD COLUMN IF NOT EXISTS estimated_duration_hours INTEGER DEFAULT 2;
ALTER TABLE build_orders ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES auth.users(id);

-- Add indexes for scheduling queries
CREATE INDEX IF NOT EXISTS idx_build_orders_scheduled_date ON build_orders(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_build_orders_due_date ON build_orders(due_date);
CREATE INDEX IF NOT EXISTS idx_build_orders_calendar_event_id ON build_orders(calendar_event_id);
CREATE INDEX IF NOT EXISTS idx_build_orders_assigned_user ON build_orders(assigned_user_id);

-- ============================================================================
-- BUILD ORDER MATERIAL REQUIREMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS build_order_material_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_order_id UUID NOT NULL REFERENCES build_orders(id) ON DELETE CASCADE,
  
  -- Material info
  sku VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  required_quantity INTEGER NOT NULL,
  available_quantity INTEGER DEFAULT 0,
  shortfall INTEGER GENERATED ALWAYS AS (GREATEST(required_quantity - available_quantity, 0)) STORED,
  
  -- Vendor sourcing info
  vendor_id UUID REFERENCES vendors(id),
  vendor_name VARCHAR(255),
  lead_time_days INTEGER,
  estimated_cost DECIMAL(10,2),
  
  -- Tracking
  sourced BOOLEAN DEFAULT FALSE,
  sourced_at TIMESTAMPTZ,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_material_requirements_build_order ON build_order_material_requirements(build_order_id);
CREATE INDEX IF NOT EXISTS idx_material_requirements_sku ON build_order_material_requirements(sku);
CREATE INDEX IF NOT EXISTS idx_material_requirements_vendor ON build_order_material_requirements(vendor_id);
CREATE INDEX IF NOT EXISTS idx_material_requirements_shortfall ON build_order_material_requirements(shortfall) WHERE shortfall > 0;

-- ============================================================================
-- PRODUCTION CALENDAR SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS production_calendar_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- Calendar configuration
  google_calendar_id TEXT, -- For dedicated production calendar
  default_duration_hours INTEGER DEFAULT 2,
  default_time_zone TEXT DEFAULT 'America/New_York',
  
  -- Notification settings
  email_reminders_enabled BOOLEAN DEFAULT TRUE,
  reminder_hours_before INTEGER DEFAULT 24,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- ============================================================================
-- UPDATE TRIGGERS
-- ============================================================================

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_material_requirements_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_material_requirements_timestamp ON build_order_material_requirements;
CREATE TRIGGER trigger_update_material_requirements_timestamp
  BEFORE UPDATE ON build_order_material_requirements
  FOR EACH ROW
  EXECUTE FUNCTION update_material_requirements_timestamp();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE build_order_material_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_calendar_settings ENABLE ROW LEVEL SECURITY;

-- Policies for build_order_material_requirements
CREATE POLICY "Users can view all material requirements"
  ON build_order_material_requirements
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert material requirements"
  ON build_order_material_requirements
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update material requirements"
  ON build_order_material_requirements
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete material requirements"
  ON build_order_material_requirements
  FOR DELETE
  TO authenticated
  USING (true);

-- Policies for production_calendar_settings
CREATE POLICY "Users can view own calendar settings"
  ON production_calendar_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own calendar settings"
  ON production_calendar_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own calendar settings"
  ON production_calendar_settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate material requirements for a build order
CREATE OR REPLACE FUNCTION calculate_material_requirements(
  p_build_order_id UUID,
  p_finished_sku TEXT,
  p_quantity INTEGER
)
RETURNS TABLE (
  sku TEXT,
  name TEXT,
  required_quantity INTEGER,
  available_quantity INTEGER,
  vendor_id UUID,
  vendor_name TEXT,
  estimated_cost DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH bom_explosion AS (
    -- Get BOM components for the finished SKU (components stored as JSONB array)
    SELECT
      (jsonb_array_elements(b.components)->>'sku')::TEXT as component_sku,
      (jsonb_array_elements(b.components)->>'name')::TEXT as component_name,
      ((jsonb_array_elements(b.components)->>'quantity')::INTEGER * p_quantity) as total_required
    FROM boms b
    WHERE b.finished_sku = p_finished_sku
      AND b.components IS NOT NULL
      AND jsonb_array_length(b.components) > 0
  )
  SELECT
    be.component_sku::TEXT,
    be.component_name::TEXT,
    be.total_required::INTEGER,
    COALESCE(ii.stock, 0)::INTEGER as available,
    ii.vendor_id::UUID,
    v.name as vendor_name,
    (be.total_required * COALESCE(ii.unit_cost, 0))::DECIMAL as cost
  FROM bom_explosion be
  LEFT JOIN inventory_items ii ON ii.sku = be.component_sku
  LEFT JOIN vendors v ON v.id::TEXT = ii.vendor_id;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-populate material requirements when build order is created
CREATE OR REPLACE FUNCTION auto_populate_material_requirements()
RETURNS TRIGGER AS $$
BEGIN
  -- Only populate for new build orders with finished SKU
  IF TG_OP = 'INSERT' AND NEW.finished_sku IS NOT NULL THEN
    INSERT INTO build_order_material_requirements (
      build_order_id,
      sku,
      name,
      required_quantity,
      available_quantity,
      vendor_id,
      vendor_name,
      estimated_cost
    )
    SELECT 
      NEW.id,
      cr.sku,
      cr.name,
      cr.required_quantity,
      cr.available_quantity,
      cr.vendor_id,
      cr.vendor_name,
      cr.estimated_cost
    FROM calculate_material_requirements(NEW.id, NEW.finished_sku, NEW.quantity) cr;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-populate material requirements
DROP TRIGGER IF EXISTS trigger_auto_populate_material_requirements ON build_orders;
CREATE TRIGGER trigger_auto_populate_material_requirements
  AFTER INSERT ON build_orders
  FOR EACH ROW
  EXECUTE FUNCTION auto_populate_material_requirements();

-- ============================================================================
-- INDEXES AND PERFORMANCE
-- ============================================================================

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_build_orders_status_scheduled ON build_orders(status, scheduled_date) 
  WHERE scheduled_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_build_orders_upcoming ON build_orders(scheduled_date)
  WHERE status IN ('Pending', 'In Progress') AND scheduled_date > NOW();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE build_order_material_requirements IS 'Material sourcing requirements for build orders with vendor information';
COMMENT ON TABLE production_calendar_settings IS 'User-specific settings for Google Calendar integration';

COMMENT ON COLUMN build_orders.scheduled_date IS 'When the build should start';
COMMENT ON COLUMN build_orders.due_date IS 'When the build should be completed';
COMMENT ON COLUMN build_orders.calendar_event_id IS 'Google Calendar event ID for sync';
COMMENT ON COLUMN build_orders.estimated_duration_hours IS 'Expected time to complete the build';

COMMENT ON FUNCTION calculate_material_requirements IS 'Calculates component requirements for a build order based on BOM explosion';
COMMENT ON FUNCTION auto_populate_material_requirements IS 'Automatically populates material requirements when a build order is created';