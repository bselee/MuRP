# MuRP User Role & Purchase Order Setup Guide

## Part 1: Promote Yourself to Admin

Your current role is **Staff**, which only gives you access to 4 sidebar items (Dashboard, Projects, and a couple others). To get full access, you need to be promoted to **Admin**.

### Option 1: Using the New Admin Panel (Easiest!)

1. **Go to Settings** (bottom of sidebar)
2. Look for **"User Roles & Permissions"** section (only visible to admins initially)
   - ⚠️ You won't see this yet since you're Staff - use Option 2 first
3. Once you're Admin, you'll see a dropdown to change your role

### Option 2: Using Supabase SQL Console (Do This First!)

1. Go to **Supabase Dashboard**: https://supabase.com/dashboard/project/mpuevsmtowyexhsqugkm/sql
2. Click **New Query**
3. Paste this SQL:

```sql
-- List all users to find your ID
SELECT id, email, full_name, role, department 
FROM public.user_profiles 
ORDER BY created_at DESC;
```

4. Click **Run**
5. Find your email in the results, copy your `id`
6. Replace `YOUR_USER_ID` below and run:

```sql
-- Update your role to Admin
UPDATE public.user_profiles 
SET role = 'Admin', updated_at = NOW() 
WHERE id = 'YOUR_USER_ID';

-- Verify it worked
SELECT id, email, full_name, role 
FROM public.user_profiles 
WHERE id = 'YOUR_USER_ID';
```

7. **Refresh the page** in your browser (Cmd+R or Ctrl+R)
8. You should now see all sidebar items!

---

## Part 2: Set Up Finale Purchase Order Sync

### Why No Purchase Orders?

Purchase orders don't show up because:
1. **Finale API credentials aren't configured** in environment variables
2. Without credentials, the auto-sync service can't fetch data from Finale

### What You Need

You'll need these from your Finale Inventory account:
- **API Key**
- **API Secret**  
- **Account Path** (e.g., "acme-manufacturing")

### How to Get Finale Credentials

1. **Log in to Finale Inventory**: https://app.finaleinventory.com
2. Go to **Settings** → **API** or **Integrations**
3. Create or find your API credentials:
   - API Key (looks like: `key_xxx...`)
   - API Secret (looks like: `secret_xxx...`)
4. Your **Account Path** is in the URL when logged in (e.g., `https://app.finaleinventory.com/`**`acme-manufacturing`**`/...`)

### Configure Environment Variables

#### For Development:

1. Create/edit `.env.local` in the project root:

```bash
# Finale Configuration
VITE_FINALE_API_KEY=your-api-key-here
VITE_FINALE_API_SECRET=your-api-secret-here
VITE_FINALE_ACCOUNT_PATH=your-account-path
VITE_FINALE_BASE_URL=https://app.finaleinventory.com
```

2. **Save and restart the dev server**:
   ```bash
   npm run dev
   ```

3. Open the browser console (F12 or Cmd+Option+I) and look for messages like:
   ```
   [FinaleAutoSync] ✅ Credentials detected. Initializing...
   [FinaleAutoSync] Starting Purchase Order sync (GraphQL)...
   [FinaleAutoSync] ✅ GraphQL PO sync initiated
   ```

4. **Refresh the page** and check the **Purchase Orders** tab

#### For Production (Vercel):

1. Go to **Vercel Dashboard**: https://vercel.com
2. Select your MuRP project
3. Go to **Settings** → **Environment Variables**
4. Add these variables:
   - `VITE_FINALE_API_KEY`
   - `VITE_FINALE_API_SECRET`
   - `VITE_FINALE_ACCOUNT_PATH`

5. Redeploy or wait for next deployment

---

## Part 3: Verify Everything Works

### Check Admin Access

- [ ] Sidebar shows **10+ items** (Dashboard, Inventory, Purchase Orders, Production, BOMs, Artwork, Inventory Intelligence, Settings, etc.)
- [ ] Settings page shows **"User Roles & Permissions"** section
- [ ] You can see all users and their current roles

### Check Purchase Order Sync

- [ ] Go to **Purchase Orders** page
- [ ] You see a list of POs from Finale
- [ ] The page shows sync status and metrics
- [ ] Data updates automatically (every 15 minutes)

### Check Browser Console

- [ ] No errors in console (F12 → Console tab)
- [ ] You see messages like:
  ```
  [FinaleAutoSync] ✅ Credentials detected
  [FinaleAutoSync] REST API sync complete
  [FinaleAutoSync] GraphQL PO sync initiated
  ```

---

## Troubleshooting

### Still Can't See Admin Panel?

1. Make sure you **actually updated your role** in SQL above
2. **Hard refresh** the page: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
3. Check the browser console for errors

### Still No Purchase Orders?

1. **Check environment variables are set**:
   - In VS Code terminal: `echo $VITE_FINALE_API_KEY`
   - Should print your API key (not blank)

2. **Restart dev server**:
   ```bash
   # Stop: Ctrl+C
   npm run dev
   ```

3. **Check console for errors** (F12 → Console):
   - Look for `[FinaleAutoSync]` messages
   - Look for red error messages

4. **Verify Finale credentials work**:
   - Test in Finale directly: https://app.finaleinventory.com/api/docs
   - Try making an API call with your key/secret

5. **Check database has tables**:
   - Go to Supabase: https://supabase.com/dashboard/project/mpuevsmtowyexhsqugkm/sql
   - Run: `SELECT COUNT(*) FROM public.purchase_orders;`
   - Should return a number (might be 0 if no data synced yet)

### Getting Errors About "Could not find table"?

This is the schema cache issue from before. It usually clears in 1-2 minutes:
- Wait 1-2 minutes
- Refresh the page
- Check the `/SCHEMA_CACHE_FIX.md` file for details

---

## Quick Reference

### Sidebar Items by Role

- **Staff**: Dashboard, Projects (4 items total)
- **Manager**: ↑ + Inventory, Purchase Orders, Production, BOMs, Artwork (9 items)
- **Admin**: ↑ + Inventory Intelligence, Settings (11 items - full access!)

### Auto-Sync Schedule

Once Finale is configured:
- **Inventory/Vendors/BOMs**: Syncs every 4 hours via REST API
- **Purchase Orders**: Syncs every 15 minutes via GraphQL
- **First sync**: Runs immediately on app launch

### Support

If you need help:
1. Check `/SCHEMA_CACHE_FIX.md` for schema issues
2. Check `ADMIN_SETUP.md` for SQL commands
3. Review console messages (F12 → Console)
4. Check that Finale API credentials are correct

