# Google OAuth Fix - Quick Guide

## Problem
Users signing in with Google OAuth were seeing errors and being redirected back to login, then successfully accessing the dashboard on the second click.

## Root Cause
Race condition: The database trigger creates user profiles asynchronously after OAuth, but the app tried to fetch the profile before it existed.

## Solution
1. Simplified the AuthCallback and AuthContext code
2. Added `ensure_user_profile()` server function that creates/updates profiles safely
3. Both files now call this function if profile doesn't exist

## How to Apply the Fix

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click "New Query"
4. Copy and paste the contents of: `supabase/migrations/028_fix_oauth_profile_creation.sql`
5. Click "Run"

### Option 2: Using Supabase CLI

```bash
# Make sure you're logged in to Supabase CLI
supabase login

# Link your project (if not already linked)
supabase link --project-ref your-project-ref

# Apply the migration
supabase db push
```

### Option 3: Using the Script (if psql is available)

```bash
# Make sure your .env file has SUPABASE_SERVICE_ROLE_KEY set
chmod +x scripts/apply-oauth-fix.sh
./scripts/apply-oauth-fix.sh
```

## What Changed

### Files Modified:
- `pages/AuthCallback.tsx` - Simplified to use `ensure_user_profile()` RPC
- `lib/auth/AuthContext.tsx` - Removed retry logic, uses `ensure_user_profile()` as fallback
- `supabase/migrations/028_fix_oauth_profile_creation.sql` - New migration

### Database Changes:
- Added `ensure_user_profile()` function (SECURITY DEFINER)
- Added INSERT policy for `user_profiles` table

## Testing

After applying the migration:

1. Click "Sign in with Google" on the login screen
2. Complete the Google OAuth flow
3. You should be redirected directly to the dashboard without errors

## Rollback (if needed)

If you need to rollback the migration:

```sql
-- Remove the function
DROP FUNCTION IF EXISTS public.ensure_user_profile();

-- Remove the INSERT policy
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
```

## Need Help?

If you're still seeing errors:
1. Check browser console for specific error messages
2. Verify the migration was applied: `SELECT routine_name FROM information_schema.routines WHERE routine_name = 'ensure_user_profile';`
3. Check Supabase logs in the dashboard
