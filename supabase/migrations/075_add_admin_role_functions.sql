-- Migration 075: Add admin role management functions
-- Date: 2025-12-04
-- Purpose: Allow updating user roles via RPC for admin management

-- Create function to update user role (only for current user or admin)
CREATE OR REPLACE FUNCTION update_user_role(
  target_user_id UUID,
  new_role TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  user_id UUID,
  email TEXT,
  role TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_updated_role TEXT;
  v_user_email TEXT;
BEGIN
  -- Check if current user is admin
  SELECT EXISTS(
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() 
    AND (role = 'Admin' OR role = 'SuperAdmin')
  ) INTO v_is_admin;
  
  -- Check if user is trying to update themselves or if they're admin
  IF target_user_id != auth.uid() AND NOT v_is_admin THEN
    RETURN QUERY SELECT false, 'Only admins can update other users', target_user_id, '', '';
    RETURN;
  END IF;
  
  -- Validate role
  IF new_role NOT IN ('Staff', 'Manager', 'Admin', 'SuperAdmin') THEN
    RETURN QUERY SELECT false, 'Invalid role: ' || new_role, target_user_id, '', '';
    RETURN;
  END IF;
  
  -- Update the role
  UPDATE user_profiles 
  SET role = new_role,
      updated_at = NOW()
  WHERE id = target_user_id;
  
  -- Get updated user info
  SELECT email, role INTO v_user_email, v_updated_role
  FROM user_profiles
  WHERE id = target_user_id;
  
  RETURN QUERY SELECT true, 'Role updated successfully', target_user_id, v_user_email, v_updated_role;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_user_role(UUID, TEXT) TO authenticated;

-- Create function to list all users (admin only)
CREATE OR REPLACE FUNCTION get_all_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  department TEXT,
  onboarding_complete BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if current user is admin
  IF NOT EXISTS(
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() 
    AND (role = 'Admin' OR role = 'SuperAdmin')
  ) THEN
    RAISE EXCEPTION 'Only admins can view all users';
  END IF;
  
  RETURN QUERY
  SELECT 
    up.id,
    up.email,
    up.full_name,
    up.role,
    up.department,
    up.onboarding_complete,
    up.created_at,
    up.updated_at
  FROM user_profiles up
  ORDER BY up.created_at DESC;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_all_users() TO authenticated;
