-- Migration 035: Secure material requirements access
-- Tighten RLS on build_order_material_requirements so tenants only view data tied
-- to their assigned build orders, while mutations stay limited to admins/service roles.

BEGIN;

-- Remove permissive policies from migration 027 (if they still exist)
DROP POLICY IF EXISTS "Users can view all material requirements"
  ON build_order_material_requirements;

DROP POLICY IF EXISTS "Users can insert material requirements"
  ON build_order_material_requirements;

DROP POLICY IF EXISTS "Users can update material requirements"
  ON build_order_material_requirements;

DROP POLICY IF EXISTS "Users can delete material requirements"
  ON build_order_material_requirements;

-- Users may read material requirements only when they own the build order
CREATE POLICY "Assigned users read material requirements"
  ON build_order_material_requirements
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM build_orders bo
      WHERE bo.id = build_order_material_requirements.build_order_id
        AND bo.assigned_user_id = auth.uid()
    )
  );

-- Service role (or admins) can insert rows (used by automation/trigger logic)
CREATE POLICY "Service roles insert material requirements"
  ON build_order_material_requirements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR auth.role() = 'service_role'
  );

-- Updates restricted to admins or service-role automations
CREATE POLICY "Service roles update material requirements"
  ON build_order_material_requirements
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    public.is_admin()
    OR auth.role() = 'service_role'
  );

-- Deletions also restricted
CREATE POLICY "Service roles delete material requirements"
  ON build_order_material_requirements
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR auth.role() = 'service_role'
  );

COMMIT;
