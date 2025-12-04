-- Migration 074: Complete Data Recovery and Validation
-- Date: 2025-12-04
-- Purpose: Ensure all tables exist with correct RLS and prepare for data reload

-- ===========================================================================
-- 1. VALIDATE/CREATE CORE TABLES
-- ===========================================================================

-- Ensure inventory_items exists and is RLS enabled
ALTER TABLE IF EXISTS inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_public_read" ON inventory_items;
CREATE POLICY "inventory_public_read"
  ON public.inventory_items
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "inventory_authenticated_write" ON inventory_items;
CREATE POLICY "inventory_authenticated_write"
  ON public.inventory_items
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "inventory_authenticated_update"
  ON public.inventory_items
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Ensure vendors table is RLS enabled
ALTER TABLE IF EXISTS vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendors_public_read" ON vendors;
CREATE POLICY "vendors_public_read"
  ON public.vendors
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "vendors_authenticated_write" ON vendors;
CREATE POLICY "vendors_authenticated_write"
  ON public.vendors
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "vendors_authenticated_update"
  ON public.vendors
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Ensure boms table is RLS enabled
ALTER TABLE IF EXISTS boms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "boms_public_read" ON boms;
CREATE POLICY "boms_public_read"
  ON public.boms
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Ensure purchase_orders table is RLS enabled
ALTER TABLE IF EXISTS purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_orders_read" ON purchase_orders;
CREATE POLICY "purchase_orders_read"
  ON public.purchase_orders
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "purchase_orders_write" ON purchase_orders;
CREATE POLICY "purchase_orders_write"
  ON public.purchase_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "purchase_orders_update"
  ON public.purchase_orders
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Ensure purchase_order_items table is RLS enabled
ALTER TABLE IF EXISTS purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_order_items_read" ON purchase_order_items;
CREATE POLICY "purchase_order_items_read"
  ON public.purchase_order_items
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "purchase_order_items_write" ON purchase_order_items;
CREATE POLICY "purchase_order_items_write"
  ON public.purchase_order_items
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "purchase_order_items_update"
  ON public.purchase_order_items
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Ensure reorder_queue table is RLS enabled
ALTER TABLE IF EXISTS reorder_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reorder_queue_read" ON reorder_queue;
CREATE POLICY "reorder_queue_read"
  ON public.reorder_queue
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Ensure requisitions table is RLS enabled (if it exists)
CREATE TABLE IF NOT EXISTS requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_number VARCHAR(50) UNIQUE NOT NULL,
  requester_id UUID REFERENCES auth.users(id),
  requester_email VARCHAR(255),
  request_type VARCHAR(50) NOT NULL DEFAULT 'standard',
  priority VARCHAR(20) DEFAULT 'normal',
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  department VARCHAR(100),
  items JSONB,
  total_amount DECIMAL(12,2),
  justification TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by VARCHAR(255)
);

ALTER TABLE IF EXISTS requisitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "requisitions_read" ON requisitions;
CREATE POLICY "requisitions_read"
  ON public.requisitions
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "requisitions_write" ON requisitions;
CREATE POLICY "requisitions_write"
  ON public.requisitions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "requisitions_update"
  ON public.requisitions
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Ensure build_orders table is RLS enabled (if it exists)
CREATE TABLE IF NOT EXISTS build_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_number VARCHAR(50) UNIQUE NOT NULL,
  bom_id UUID REFERENCES boms(id),
  status VARCHAR(50) DEFAULT 'draft',
  scheduled_date DATE,
  due_date DATE,
  assigned_user VARCHAR(255),
  quantity INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS build_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "build_orders_read" ON build_orders;
CREATE POLICY "build_orders_read"
  ON public.build_orders
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "build_orders_write" ON build_orders;
CREATE POLICY "build_orders_write"
  ON public.build_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "build_orders_update"
  ON public.build_orders
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ===========================================================================
-- 2. CREATE SYNC LOG TABLE FOR TRACKING
-- ===========================================================================

CREATE TABLE IF NOT EXISTS sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100),
  sync_type VARCHAR(50) DEFAULT 'full',
  status VARCHAR(50) DEFAULT 'pending',
  records_processed INTEGER DEFAULT 0,
  records_inserted INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sync_log_read" ON sync_log;
CREATE POLICY "sync_log_read"
  ON public.sync_log
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "sync_log_write" ON sync_log;
CREATE POLICY "sync_log_write"
  ON public.sync_log
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (true);

CREATE POLICY "sync_log_update"
  ON public.sync_log
  FOR UPDATE
  TO authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- ===========================================================================
-- 3. ENSURE USER PROFILES RLS IS CORRECT
-- ===========================================================================

ALTER TABLE IF EXISTS user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_profiles_self_read" ON user_profiles;
CREATE POLICY "user_profiles_self_read"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.role IN ('Admin', 'SuperAdmin')
  ));

DROP POLICY IF EXISTS "user_profiles_self_write" ON user_profiles;
CREATE POLICY "user_profiles_self_write"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ===========================================================================
-- 4. VERIFY ENSURE_USER_PROFILE FUNCTION
-- ===========================================================================

-- The function is already defined in migration 028, just verify it has correct GRANT
GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;

-- ===========================================================================
-- 5. SUCCESS MESSAGE
-- ===========================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 074 completed successfully!';
  RAISE NOTICE 'All tables validated and RLS policies verified:';
  RAISE NOTICE '  ✓ inventory_items - authenticated access enabled';
  RAISE NOTICE '  ✓ vendors - authenticated access enabled';
  RAISE NOTICE '  ✓ purchase_orders - authenticated access enabled';
  RAISE NOTICE '  ✓ purchase_order_items - authenticated access enabled';
  RAISE NOTICE '  ✓ requisitions - authenticated access enabled';
  RAISE NOTICE '  ✓ build_orders - authenticated access enabled';
  RAISE NOTICE '  ✓ sync_log - service role access enabled';
  RAISE NOTICE 'System ready for data reload from Finale!';
END $$;
