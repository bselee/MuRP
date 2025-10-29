-- ============================================================================
-- ROLE-BASED ACCESS CONTROL (RBAC) SETUP
-- ============================================================================
-- This migration implements a comprehensive RBAC system with three roles:
-- 1. Admin: Full access to everything
-- 2. Manager: Read/write access to most data, limited user management
-- 3. Staff: Read-only access to most data, can create requisitions
-- ============================================================================

-- Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Admin', 'Manager', 'Staff')),
  department TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPER FUNCTION: Get current user's role
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM users WHERE id = user_id;
$$ LANGUAGE SQL SECURITY DEFINER;

-- ============================================================================
-- USERS TABLE POLICIES
-- ============================================================================

-- Users can read all other users (needed for assignments, created_by fields)
CREATE POLICY "All authenticated users can read users"
ON users FOR SELECT
TO authenticated
USING (true);

-- Only Admins can insert new users
CREATE POLICY "Only Admins can create users"
ON users FOR INSERT
TO authenticated
WITH CHECK (get_user_role(auth.uid()) = 'Admin');

-- Admins can update any user, users can update themselves
CREATE POLICY "Admins can update users, users can update self"
ON users FOR UPDATE
TO authenticated
USING (
  get_user_role(auth.uid()) = 'Admin' OR
  id = auth.uid()
);

-- Only Admins can delete users
CREATE POLICY "Only Admins can delete users"
ON users FOR DELETE
TO authenticated
USING (get_user_role(auth.uid()) = 'Admin');

-- ============================================================================
-- INVENTORY ITEMS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can view inventory items" ON inventory_items;
DROP POLICY IF EXISTS "Authenticated users can insert inventory items" ON inventory_items;
DROP POLICY IF EXISTS "Authenticated users can update inventory items" ON inventory_items;
DROP POLICY IF EXISTS "Authenticated users can delete inventory items" ON inventory_items;

-- All authenticated users can read inventory
CREATE POLICY "All authenticated users can read inventory"
ON inventory_items FOR SELECT
TO authenticated
USING (true);

-- Admins and Managers can create inventory items
CREATE POLICY "Admins and Managers can create inventory"
ON inventory_items FOR INSERT
TO authenticated
WITH CHECK (
  get_user_role(auth.uid()) IN ('Admin', 'Manager')
);

-- Admins and Managers can update inventory items
CREATE POLICY "Admins and Managers can update inventory"
ON inventory_items FOR UPDATE
TO authenticated
USING (
  get_user_role(auth.uid()) IN ('Admin', 'Manager')
);

-- Only Admins can delete inventory items
CREATE POLICY "Only Admins can delete inventory"
ON inventory_items FOR DELETE
TO authenticated
USING (get_user_role(auth.uid()) = 'Admin');

-- ============================================================================
-- VENDORS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can view vendors" ON vendors;
DROP POLICY IF EXISTS "Authenticated users can insert vendors" ON vendors;
DROP POLICY IF EXISTS "Authenticated users can update vendors" ON vendors;
DROP POLICY IF EXISTS "Authenticated users can delete vendors" ON vendors;

-- All authenticated users can read vendors
CREATE POLICY "All authenticated users can read vendors"
ON vendors FOR SELECT
TO authenticated
USING (true);

-- Admins and Managers can create vendors
CREATE POLICY "Admins and Managers can create vendors"
ON vendors FOR INSERT
TO authenticated
WITH CHECK (
  get_user_role(auth.uid()) IN ('Admin', 'Manager')
);

-- Admins and Managers can update vendors
CREATE POLICY "Admins and Managers can update vendors"
ON vendors FOR UPDATE
TO authenticated
USING (
  get_user_role(auth.uid()) IN ('Admin', 'Manager')
);

-- Only Admins can delete vendors
CREATE POLICY "Only Admins can delete vendors"
ON vendors FOR DELETE
TO authenticated
USING (get_user_role(auth.uid()) = 'Admin');

-- ============================================================================
-- BOM ITEMS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can view bom_items" ON bom_items;
DROP POLICY IF EXISTS "Authenticated users can insert bom_items" ON bom_items;
DROP POLICY IF EXISTS "Authenticated users can update bom_items" ON bom_items;
DROP POLICY IF EXISTS "Authenticated users can delete bom_items" ON bom_items;

-- All authenticated users can read BOMs
CREATE POLICY "All authenticated users can read BOMs"
ON bom_items FOR SELECT
TO authenticated
USING (true);

-- Admins and Managers can create BOMs
CREATE POLICY "Admins and Managers can create BOMs"
ON bom_items FOR INSERT
TO authenticated
WITH CHECK (
  get_user_role(auth.uid()) IN ('Admin', 'Manager')
);

-- Admins and Managers can update BOMs
CREATE POLICY "Admins and Managers can update BOMs"
ON bom_items FOR UPDATE
TO authenticated
USING (
  get_user_role(auth.uid()) IN ('Admin', 'Manager')
);

-- Only Admins can delete BOMs
CREATE POLICY "Only Admins can delete BOMs"
ON bom_items FOR DELETE
TO authenticated
USING (get_user_role(auth.uid()) = 'Admin');

-- ============================================================================
-- PURCHASE ORDERS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can view purchase_orders" ON purchase_orders;
DROP POLICY IF EXISTS "Authenticated users can insert purchase_orders" ON purchase_orders;
DROP POLICY IF EXISTS "Authenticated users can update purchase_orders" ON purchase_orders;
DROP POLICY IF EXISTS "Authenticated users can delete purchase_orders" ON purchase_orders;

-- All authenticated users can read purchase orders
CREATE POLICY "All authenticated users can read purchase_orders"
ON purchase_orders FOR SELECT
TO authenticated
USING (true);

-- Admins and Managers can create purchase orders
CREATE POLICY "Admins and Managers can create purchase_orders"
ON purchase_orders FOR INSERT
TO authenticated
WITH CHECK (
  get_user_role(auth.uid()) IN ('Admin', 'Manager')
);

-- Admins and Managers can update purchase orders
CREATE POLICY "Admins and Managers can update purchase_orders"
ON purchase_orders FOR UPDATE
TO authenticated
USING (
  get_user_role(auth.uid()) IN ('Admin', 'Manager')
);

-- Only Admins can delete purchase orders
CREATE POLICY "Only Admins can delete purchase_orders"
ON purchase_orders FOR DELETE
TO authenticated
USING (get_user_role(auth.uid()) = 'Admin');

-- ============================================================================
-- BUILD ORDERS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can view build_orders" ON build_orders;
DROP POLICY IF EXISTS "Authenticated users can insert build_orders" ON build_orders;
DROP POLICY IF EXISTS "Authenticated users can update build_orders" ON build_orders;
DROP POLICY IF EXISTS "Authenticated users can delete build_orders" ON build_orders;

-- All authenticated users can read build orders
CREATE POLICY "All authenticated users can read build_orders"
ON build_orders FOR SELECT
TO authenticated
USING (true);

-- Admins and Managers can create build orders
CREATE POLICY "Admins and Managers can create build_orders"
ON build_orders FOR INSERT
TO authenticated
WITH CHECK (
  get_user_role(auth.uid()) IN ('Admin', 'Manager')
);

-- Admins, Managers, and Staff can update build order status
CREATE POLICY "All roles can update build_orders"
ON build_orders FOR UPDATE
TO authenticated
USING (true);

-- Only Admins can delete build orders
CREATE POLICY "Only Admins can delete build_orders"
ON build_orders FOR DELETE
TO authenticated
USING (get_user_role(auth.uid()) = 'Admin');

-- ============================================================================
-- REQUISITIONS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can view requisitions" ON requisitions;
DROP POLICY IF EXISTS "Authenticated users can insert requisitions" ON requisitions;
DROP POLICY IF EXISTS "Authenticated users can update requisitions" ON requisitions;
DROP POLICY IF EXISTS "Authenticated users can delete requisitions" ON requisitions;

-- All authenticated users can read requisitions
CREATE POLICY "All authenticated users can read requisitions"
ON requisitions FOR SELECT
TO authenticated
USING (true);

-- All authenticated users can create requisitions
CREATE POLICY "All users can create requisitions"
ON requisitions FOR INSERT
TO authenticated
WITH CHECK (true);

-- Admins and Managers can update any requisition, Staff can only update their own
CREATE POLICY "Admins/Managers update any, Staff update own requisitions"
ON requisitions FOR UPDATE
TO authenticated
USING (
  get_user_role(auth.uid()) IN ('Admin', 'Manager') OR
  created_by = auth.uid()
);

-- Only Admins can delete requisitions
CREATE POLICY "Only Admins can delete requisitions"
ON requisitions FOR DELETE
TO authenticated
USING (get_user_role(auth.uid()) = 'Admin');

-- ============================================================================
-- ARTWORK FOLDERS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can view artwork_folders" ON artwork_folders;
DROP POLICY IF EXISTS "Authenticated users can insert artwork_folders" ON artwork_folders;
DROP POLICY IF EXISTS "Authenticated users can update artwork_folders" ON artwork_folders;
DROP POLICY IF EXISTS "Authenticated users can delete artwork_folders" ON artwork_folders;

-- All authenticated users can read artwork folders
CREATE POLICY "All authenticated users can read artwork_folders"
ON artwork_folders FOR SELECT
TO authenticated
USING (true);

-- Admins and Managers can create artwork folders
CREATE POLICY "Admins and Managers can create artwork_folders"
ON artwork_folders FOR INSERT
TO authenticated
WITH CHECK (
  get_user_role(auth.uid()) IN ('Admin', 'Manager')
);

-- Admins and Managers can update artwork folders
CREATE POLICY "Admins and Managers can update artwork_folders"
ON artwork_folders FOR UPDATE
TO authenticated
USING (
  get_user_role(auth.uid()) IN ('Admin', 'Manager')
);

-- Only Admins can delete artwork folders
CREATE POLICY "Only Admins can delete artwork_folders"
ON artwork_folders FOR DELETE
TO authenticated
USING (get_user_role(auth.uid()) = 'Admin');

-- ============================================================================
-- EXTERNAL DATA SOURCES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can view external_data_sources" ON external_data_sources;
DROP POLICY IF EXISTS "Authenticated users can insert external_data_sources" ON external_data_sources;
DROP POLICY IF EXISTS "Authenticated users can update external_data_sources" ON external_data_sources;
DROP POLICY IF EXISTS "Authenticated users can delete external_data_sources" ON external_data_sources;

-- Admins and Managers can read external data sources
CREATE POLICY "Admins and Managers can read external_data_sources"
ON external_data_sources FOR SELECT
TO authenticated
USING (get_user_role(auth.uid()) IN ('Admin', 'Manager'));

-- Only Admins can create external data sources
CREATE POLICY "Only Admins can create external_data_sources"
ON external_data_sources FOR INSERT
TO authenticated
WITH CHECK (get_user_role(auth.uid()) = 'Admin');

-- Only Admins can update external data sources
CREATE POLICY "Only Admins can update external_data_sources"
ON external_data_sources FOR UPDATE
TO authenticated
USING (get_user_role(auth.uid()) = 'Admin');

-- Only Admins can delete external data sources
CREATE POLICY "Only Admins can delete external_data_sources"
ON external_data_sources FOR DELETE
TO authenticated
USING (get_user_role(auth.uid()) = 'Admin');

-- ============================================================================
-- CREATE INITIAL ADMIN USER FUNCTION
-- ============================================================================

-- Function to create a user entry when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role, department)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'Staff'),
    COALESCE(NEW.raw_user_meta_data->>'department', 'General')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create user entry on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================================================
-- SUMMARY OF PERMISSIONS
-- ============================================================================
-- 
-- ADMIN:
--   - Full CRUD access to all tables
--   - Can manage users, external data sources
--   - Can delete any records
--
-- MANAGER:
--   - Read all data
--   - Create/update inventory, vendors, BOMs, POs, build orders, artwork
--   - Cannot delete records or manage users
--
-- STAFF:
--   - Read all data (inventory, vendors, BOMs, POs, build orders)
--   - Create requisitions
--   - Update their own requisitions
--   - Update build order status (for production workers)
--   - Cannot create/update/delete other records
--
-- ============================================================================
