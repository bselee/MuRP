-- Migration 025: Supabase Auth User Profiles & Role-Based RLS
-- Date: 2025-11-18
-- Purpose: Introduce first-class user profiles linked to Supabase Auth,
--          helper functions for role checks, and hardened RLS policies.

--------------------------------------------------------------------------------
-- USER PROFILE TABLE
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'Staff' CHECK (role IN ('Admin','Manager','Staff')),
  department TEXT NOT NULL DEFAULT 'Purchasing' CHECK (department IN ('Purchasing','MFG 1','MFG 2','Fulfillment','SHP/RCV')),
  onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
  agreements JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_department ON public.user_profiles(department);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);

--------------------------------------------------------------------------------
-- TRIGGERS
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := timezone('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_profiles_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := NEW.email;
  v_full_name TEXT := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    v_email,
    v_full_name,
    COALESCE(NEW.raw_user_meta_data->>'role', 'Staff')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

--------------------------------------------------------------------------------
-- ROLE HELPERS
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_user_department()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT department FROM public.user_profiles WHERE id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.current_user_department() TO authenticated;

CREATE OR REPLACE FUNCTION public.has_role(required_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.user_profiles WHERE id = auth.uid();

  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  IF required_role = 'Admin' THEN
    RETURN v_role = 'Admin';
  ELSIF required_role = 'Manager' THEN
    RETURN v_role IN ('Admin','Manager');
  ELSE
    RETURN TRUE;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.has_role(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(role = 'Admin', FALSE) FROM public.user_profiles WHERE id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

--------------------------------------------------------------------------------
-- RLS POLICIES FOR USER PROFILES
--------------------------------------------------------------------------------

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select self profile" ON public.user_profiles;
CREATE POLICY "Users select self profile"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins select all profiles" ON public.user_profiles;
CREATE POLICY "Admins select all profiles"
  ON public.user_profiles FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Users update self profile" ON public.user_profiles;
CREATE POLICY "Users update self profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins manage profiles" ON public.user_profiles;
CREATE POLICY "Admins manage profiles"
  ON public.user_profiles FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

--------------------------------------------------------------------------------
-- SAFETY TRIGGER TO PREVENT UNAUTHORIZED ROLE CHANGES
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_user_profile_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.role <> OLD.role OR NEW.department <> OLD.department OR NEW.is_active <> OLD.is_active THEN
      RAISE EXCEPTION 'Only admins may change role, department, or activation state.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_profiles_guard ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_guard
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role
        OR OLD.department IS DISTINCT FROM NEW.department
        OR OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION public.guard_user_profile_changes();

--------------------------------------------------------------------------------
-- POLICY HARDENING FOR CORE TABLES
--------------------------------------------------------------------------------

-- Inventory Items
ALTER TABLE IF EXISTS public.inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_public_read ON public.inventory_items;
CREATE POLICY inventory_role_read
  ON public.inventory_items FOR SELECT
  TO authenticated
  USING (public.has_role('Staff'));

DROP POLICY IF EXISTS inventory_role_write ON public.inventory_items;
CREATE POLICY inventory_role_write
  ON public.inventory_items FOR ALL
  TO authenticated
  USING (public.has_role('Admin'))
  WITH CHECK (public.has_role('Admin'));

-- Vendors
ALTER TABLE IF EXISTS public.vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendors_public_read ON public.vendors;
CREATE POLICY vendors_role_read
  ON public.vendors FOR SELECT
  TO authenticated
  USING (public.has_role('Staff'));

-- BOMs
ALTER TABLE IF EXISTS public.boms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS boms_public_read ON public.boms;
CREATE POLICY boms_role_read
  ON public.boms FOR SELECT
  TO authenticated
  USING (public.has_role('Staff'));

-- Purchase Orders & Items
ALTER TABLE IF EXISTS public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read purchase_orders" ON public.purchase_orders;
CREATE POLICY purchase_orders_read_role
  ON public.purchase_orders FOR SELECT
  TO authenticated
  USING (public.has_role('Staff'));

DROP POLICY IF EXISTS "Allow authenticated write purchase_orders" ON public.purchase_orders;
CREATE POLICY purchase_orders_manage_role
  ON public.purchase_orders FOR ALL
  TO authenticated
  USING (public.has_role('Manager'))
  WITH CHECK (public.has_role('Manager'));

DROP POLICY IF EXISTS "Allow authenticated read purchase_order_items" ON public.purchase_order_items;
CREATE POLICY purchase_order_items_read_role
  ON public.purchase_order_items FOR SELECT
  TO authenticated
  USING (public.has_role('Staff'));

DROP POLICY IF EXISTS "Allow authenticated write purchase_order_items" ON public.purchase_order_items;
CREATE POLICY purchase_order_items_manage_role
  ON public.purchase_order_items FOR ALL
  TO authenticated
  USING (public.has_role('Manager'))
  WITH CHECK (public.has_role('Manager'));

-- Reorder Queue
ALTER TABLE IF EXISTS public.reorder_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated read reorder_queue" ON public.reorder_queue;
CREATE POLICY reorder_queue_role_read
  ON public.reorder_queue FOR SELECT
  TO authenticated
  USING (public.has_role('Manager'));

-- Finale Sync Log
ALTER TABLE IF EXISTS public.finale_sync_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated read finale_sync_log" ON public.finale_sync_log;
CREATE POLICY finale_sync_log_role_read
  ON public.finale_sync_log FOR SELECT
  TO authenticated
  USING (public.has_role('Manager'));

-- Requisitions (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'requisitions'
  ) THEN
    ALTER TABLE public.requisitions ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS requisitions_read_policy ON public.requisitions;
    CREATE POLICY requisitions_read_policy
      ON public.requisitions FOR SELECT
      TO authenticated
      USING (
        public.has_role('Manager')
        OR requester_id = auth.uid()
      );

    DROP POLICY IF EXISTS requisitions_write_policy ON public.requisitions;
    CREATE POLICY requisitions_write_policy
      ON public.requisitions FOR INSERT
      TO authenticated
      WITH CHECK (
        requester_id = auth.uid()
        OR public.has_role('Manager')
      );

    DROP POLICY IF EXISTS requisitions_update_policy ON public.requisitions;
    CREATE POLICY requisitions_update_policy
      ON public.requisitions FOR UPDATE
      TO authenticated
      USING (public.has_role('Manager'))
      WITH CHECK (public.has_role('Manager'));
  END IF;
END $$;

--------------------------------------------------------------------------------
-- OPTIONAL DEV SEED (NO-OP IF USERS EXIST)
--------------------------------------------------------------------------------

INSERT INTO public.user_profiles (id, email, full_name, role, department, onboarding_complete)
SELECT id, email, COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)), 'Admin', 'Purchasing', TRUE
FROM auth.users
WHERE email ILIKE '%admin%'
  AND id NOT IN (SELECT id FROM public.user_profiles)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.user_profiles IS 'Application specific metadata for Supabase-authenticated users';
COMMENT ON FUNCTION public.has_role IS 'Helper to evaluate hierarchy: Admin > Manager > Staff';
