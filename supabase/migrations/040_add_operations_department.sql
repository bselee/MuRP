-- Migration 040: Extend departments with Operations group
-- Ensures Purchasing can hand off to Ops for approvals

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_department_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_department_check
  CHECK (department IN ('Purchasing','Operations','MFG 1','MFG 2','Fulfillment','SHP/RCV'));
