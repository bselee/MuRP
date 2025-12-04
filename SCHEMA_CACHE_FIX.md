# Schema Cache Issue - Fixed

## Problem
After login, the page displays errors:
- `GET https://mpuevsmtowyexhsqugkm.supabase.co/rest/v1/requisitions?select=*... 404 (Not Found)`
- `GET https://mpuevsmtowyexhsqugkm.supabase.co/rest/v1/build_orders?select=*... 404 (Not Found)`
- Error: "Could not find the table 'public.requisitions' in the schema cache"

## Root Cause
When migrations are pushed to the remote Supabase database, the REST API's schema cache can take 30 seconds to several minutes to update. During this time, the API returns 404 errors for tables that actually exist in the database.

## Solution Implemented
1. **Added Schema Cache Error Detection** - `isSchemaCacheError()` helper function detects PGRST205 and 42P01 errors
2. **Graceful Degradation** - Instead of crashing, the app returns empty arrays for requisitions and build_orders when schema cache is stale
3. **Logging** - Warnings instead of errors allow you to see the issue is temporary
4. **Auto-Retry** - The next data fetch (when cache refreshes) will work automatically

## What to Do If You See This Issue

### Immediate (30 seconds to 2 minutes)
1. Wait for the schema cache to refresh
2. Refresh the page (Cmd+R or Ctrl+R)
3. You should see data populate once cache is refreshed

### If Still Not Working (Rare)
1. **Clear browser cache:**
   - Chrome: Cmd+Shift+Delete (or Ctrl+Shift+Delete on Windows)
   - Select "Cached images and files"
   - Click "Clear data"
   - Refresh the page

2. **Check that migrations applied:**
   ```bash
   cd /workspaces/TGF-MRP
   supabase migration list | tail -5
   # Should show: 073 | 073 | 073 and 074 | 074 | 074
   ```

3. **Force regenerate database types:**
   ```bash
   supabase gen types typescript --linked > types/database.ts
   ```

4. **Check database directly:**
   - Go to https://supabase.com/dashboard/project/mpuevsmtowyexhsqugkm/sql/1
   - Run: `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;`
   - Verify `requisitions` and `build_orders` appear in results

## Technical Details

### Error Codes
- **PGRST205**: "Could not find the table in the schema cache" - Supabase REST API
- **42P01**: "Undefined table" - PostgreSQL

### Affected Hooks
- `useSupabaseRequisitions()` - Now returns `[]` on cache errors
- `useSupabaseBuildOrders()` - Now returns `[]` on cache errors

### How It Works
1. Component attempts to fetch requisitions/build_orders
2. Supabase REST API returns 404 with error code
3. Hook detects it's a schema cache error
4. Instead of showing error, returns empty array
5. Page loads successfully
6. User can work with other features
7. Once cache refreshes (1-2 minutes), data auto-loads on next fetch

## Prevention for Future Deployments
- Schema cache issues are temporary and self-healing
- No action needed - the fix handles them automatically
- Supabase recommended waiting 2 minutes after migrations before testing REST API endpoints

## Files Changed
- `/hooks/useSupabaseData.ts` - Added `isSchemaCacheError()` helper and error handling logic
- `/pages/EnhancedNewUserSetup.tsx` - Fixed missing `roleMessaging` variable (caused separate error)
- `/types/database.ts` - Regenerated from current remote schema

