-- Migration: 002_row_level_security.sql
-- Description: Implement Row-Level Security policies for all tables
-- Created: 2025-10-28

-- =============================================================================
-- ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- =============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE artwork_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE boms ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE build_orders ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- HELPER FUNCTION: GET CURRENT USER ROLE
-- =============================================================================

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
BEGIN
    RETURN (SELECT role FROM users WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_department()
RETURNS TEXT AS $$
BEGIN
    RETURN (SELECT department FROM users WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- USERS TABLE POLICIES
-- =============================================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
    ON users FOR SELECT
    USING (auth.uid() = id);

-- Users can update their own profile (except role)
CREATE POLICY "Users can update own profile"
    ON users FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id 
        AND role = (SELECT role FROM users WHERE id = auth.uid())
    );

-- Admins can view all users
CREATE POLICY "Admins can view all users"
    ON users FOR SELECT
    USING (get_user_role() = 'Admin');

-- Admins can insert users
CREATE POLICY "Admins can insert users"
    ON users FOR INSERT
    WITH CHECK (get_user_role() = 'Admin');

-- Admins can update all users
CREATE POLICY "Admins can update all users"
    ON users FOR UPDATE
    USING (get_user_role() = 'Admin');

-- Admins can delete users (soft delete)
CREATE POLICY "Admins can delete users"
    ON users FOR DELETE
    USING (get_user_role() = 'Admin');

-- =============================================================================
-- VENDORS TABLE POLICIES
-- =============================================================================

-- All authenticated users can view vendors
CREATE POLICY "All users can view vendors"
    ON vendors FOR SELECT
    USING (auth.role() = 'authenticated' AND is_deleted = FALSE);

-- Admin and Manager can manage vendors
CREATE POLICY "Admin and Manager can insert vendors"
    ON vendors FOR INSERT
    WITH CHECK (get_user_role() IN ('Admin', 'Manager'));

CREATE POLICY "Admin and Manager can update vendors"
    ON vendors FOR UPDATE
    USING (get_user_role() IN ('Admin', 'Manager'));

CREATE POLICY "Admin can delete vendors"
    ON vendors FOR DELETE
    USING (get_user_role() = 'Admin');

-- =============================================================================
-- INVENTORY_ITEMS TABLE POLICIES
-- =============================================================================

-- All authenticated users can view inventory
CREATE POLICY "All users can view inventory"
    ON inventory_items FOR SELECT
    USING (auth.role() = 'authenticated' AND is_deleted = FALSE);

-- Admin, Manager, and Production can update inventory
CREATE POLICY "Authorized users can update inventory"
    ON inventory_items FOR UPDATE
    USING (
        get_user_role() IN ('Admin', 'Manager') 
        OR get_user_department() IN ('Production', 'Warehouse')
    );

-- Admin and Manager can insert inventory items
CREATE POLICY "Admin and Manager can insert inventory"
    ON inventory_items FOR INSERT
    WITH CHECK (get_user_role() IN ('Admin', 'Manager'));

-- Admin can delete inventory items
CREATE POLICY "Admin can delete inventory"
    ON inventory_items FOR DELETE
    USING (get_user_role() = 'Admin');

-- =============================================================================
-- ARTWORK_FOLDERS TABLE POLICIES
-- =============================================================================

-- All authenticated users can view folders
CREATE POLICY "All users can view artwork folders"
    ON artwork_folders FOR SELECT
    USING (auth.role() = 'authenticated' AND is_deleted = FALSE);

-- Admin and Manager can manage folders
CREATE POLICY "Admin and Manager can manage artwork folders"
    ON artwork_folders FOR ALL
    USING (get_user_role() IN ('Admin', 'Manager'));

-- =============================================================================
-- BOMS TABLE POLICIES
-- =============================================================================

-- All authenticated users can view BOMs
CREATE POLICY "All users can view BOMs"
    ON boms FOR SELECT
    USING (auth.role() = 'authenticated' AND is_deleted = FALSE);

-- Admin, Manager, and Production can update BOMs
CREATE POLICY "Authorized users can update BOMs"
    ON boms FOR UPDATE
    USING (
        get_user_role() IN ('Admin', 'Manager')
        OR get_user_department() = 'Production'
    );

-- Admin and Manager can insert BOMs
CREATE POLICY "Admin and Manager can insert BOMs"
    ON boms FOR INSERT
    WITH CHECK (get_user_role() IN ('Admin', 'Manager'));

-- Admin can delete BOMs
CREATE POLICY "Admin can delete BOMs"
    ON boms FOR DELETE
    USING (get_user_role() = 'Admin');

-- =============================================================================
-- PURCHASE_ORDERS TABLE POLICIES
-- =============================================================================

-- Users can view POs from their department (Admin sees all)
CREATE POLICY "Users can view relevant purchase orders"
    ON purchase_orders FOR SELECT
    USING (
        get_user_role() = 'Admin'
        OR get_user_role() = 'Manager'
        OR get_user_department() = 'Purchasing'
    )
    AND is_deleted = FALSE;

-- Admin and Purchasing can create POs
CREATE POLICY "Authorized users can create purchase orders"
    ON purchase_orders FOR INSERT
    WITH CHECK (
        get_user_role() = 'Admin'
        OR get_user_department() = 'Purchasing'
    );

-- Admin and Purchasing can update POs
CREATE POLICY "Authorized users can update purchase orders"
    ON purchase_orders FOR UPDATE
    USING (
        get_user_role() = 'Admin'
        OR get_user_department() = 'Purchasing'
    );

-- Admin can delete POs
CREATE POLICY "Admin can delete purchase orders"
    ON purchase_orders FOR DELETE
    USING (get_user_role() = 'Admin');

-- =============================================================================
-- REQUISITIONS TABLE POLICIES
-- =============================================================================

-- Users can view their own requisitions
CREATE POLICY "Users can view own requisitions"
    ON requisitions FOR SELECT
    USING (
        requester_id = auth.uid()
        OR get_user_role() IN ('Admin', 'Manager')
        OR (get_user_role() = 'Manager' AND department = get_user_department())
    )
    AND is_deleted = FALSE;

-- All authenticated users can create requisitions
CREATE POLICY "Users can create requisitions"
    ON requisitions FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Admin and Manager can update requisitions
CREATE POLICY "Admin and Manager can update requisitions"
    ON requisitions FOR UPDATE
    USING (
        get_user_role() IN ('Admin', 'Manager')
        OR requester_id = auth.uid()
    );

-- Admin can delete requisitions
CREATE POLICY "Admin can delete requisitions"
    ON requisitions FOR DELETE
    USING (get_user_role() = 'Admin');

-- =============================================================================
-- BUILD_ORDERS TABLE POLICIES
-- =============================================================================

-- Users can view build orders relevant to their role
CREATE POLICY "Users can view relevant build orders"
    ON build_orders FOR SELECT
    USING (
        get_user_role() = 'Admin'
        OR get_user_role() = 'Manager'
        OR get_user_department() = 'Production'
        OR assigned_to = auth.uid()
    )
    AND is_deleted = FALSE;

-- Admin, Manager, Production can create build orders
CREATE POLICY "Authorized users can create build orders"
    ON build_orders FOR INSERT
    WITH CHECK (
        get_user_role() IN ('Admin', 'Manager')
        OR get_user_department() = 'Production'
    );

-- Admin, Manager, Production can update build orders
CREATE POLICY "Authorized users can update build orders"
    ON build_orders FOR UPDATE
    USING (
        get_user_role() IN ('Admin', 'Manager')
        OR get_user_department() = 'Production'
        OR assigned_to = auth.uid()
    );

-- Admin can delete build orders
CREATE POLICY "Admin can delete build orders"
    ON build_orders FOR DELETE
    USING (get_user_role() = 'Admin');

-- =============================================================================
-- GRANT NECESSARY PERMISSIONS
-- =============================================================================

-- Allow authenticated users to read from all tables
GRANT SELECT ON users TO authenticated;
GRANT SELECT ON vendors TO authenticated;
GRANT SELECT ON inventory_items TO authenticated;
GRANT SELECT ON artwork_folders TO authenticated;
GRANT SELECT ON boms TO authenticated;
GRANT SELECT ON purchase_orders TO authenticated;
GRANT SELECT ON requisitions TO authenticated;
GRANT SELECT ON build_orders TO authenticated;

-- Allow insert/update/delete through RLS policies
GRANT INSERT, UPDATE, DELETE ON users TO authenticated;
GRANT INSERT, UPDATE, DELETE ON vendors TO authenticated;
GRANT INSERT, UPDATE, DELETE ON inventory_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON artwork_folders TO authenticated;
GRANT INSERT, UPDATE, DELETE ON boms TO authenticated;
GRANT INSERT, UPDATE, DELETE ON purchase_orders TO authenticated;
GRANT INSERT, UPDATE, DELETE ON requisitions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON build_orders TO authenticated;
