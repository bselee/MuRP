-- Migration 028: Fix OAuth Profile Creation
-- Date: 2025-11-19
-- Purpose: Add RLS policy and helper function to ensure OAuth users can create their profiles

--------------------------------------------------------------------------------
-- HELPER FUNCTION TO CREATE/UPDATE USER PROFILE (SECURITY DEFINER)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  department TEXT,
  onboarding_complete BOOLEAN,
  tier TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_full_name TEXT;
BEGIN
  -- Get current user info
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get user metadata from auth.users
  SELECT
    email,
    COALESCE(
      raw_user_meta_data->>'full_name',
      raw_user_meta_data->>'name',
      split_part(email, '@', 1)
    )
  INTO v_email, v_full_name
  FROM auth.users
  WHERE id = v_user_id;

  -- Upsert the profile
  INSERT INTO public.user_profiles (id, email, full_name, role, department, onboarding_complete, tier)
  VALUES (
    v_user_id,
    v_email,
    v_full_name,
    'Staff',
    'Purchasing',
    true,
    'basic'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    onboarding_complete = true,
    updated_at = timezone('utc', NOW());

  -- Return the profile as table
  RETURN QUERY
  SELECT
    up.id,
    up.email,
    up.full_name,
    up.role,
    up.department,
    up.onboarding_complete,
    up.tier
  FROM public.user_profiles up
  WHERE up.id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;

COMMENT ON FUNCTION public.ensure_user_profile IS
  'Creates or updates user profile for authenticated user. Safe to call multiple times. Used for OAuth flows where trigger might not fire.';

--------------------------------------------------------------------------------
-- ADD INSERT POLICY FOR USER PROFILES (FALLBACK)
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
CREATE POLICY "Users can insert own profile"
  ON public.user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

COMMENT ON POLICY "Users can insert own profile" ON public.user_profiles IS
  'Allows users to create their own profile record. Used for OAuth flows.';
