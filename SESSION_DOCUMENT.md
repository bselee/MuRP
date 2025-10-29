# TGF MRP System - Complete Session Document

## Project Overview
**TGF MRP (Material Requirements Planning)** - A full-stack manufacturing resource planning application for The Goodest Fungus, deployed on Vercel with Supabase backend.

**Production URL:** https://tgf-mrp.vercel.app  
**Repository:** https://github.com/bselee/TGF-MRP  
**Tech Stack:** React 19, TypeScript, Vite, Supabase (PostgreSQL + Auth), Vercel, Tailwind CSS (CDN)

---

## Current System Status

### ✅ Completed & Working
1. **Deployment**
   - Production: Vercel (https://tgf-mrp.vercel.app)
   - Database: Supabase PostgreSQL (project ref: mpuevsmtowyexhsqugkm)
   - Environment variables configured in Vercel
   - Automated deployment via GitHub integration

2. **Authentication**
   - Supabase Auth with email/password
   - Login/logout working
   - User roles fetched from `public.users` table
   - Session management with timeout handling

3. **Role-Based Access Control (RBAC)**
   - Three roles: Admin, Manager, Staff
   - RLS policies on all tables
   - Helper function: `get_user_role(user_id UUID)`
   - Permissions:
     - **Admin:** Full CRUD on everything, user management
     - **Manager:** Read all, create/update most data (no delete)
     - **Staff:** Read all, create requisitions, update own items

4. **Database Structure**
   - Tables: users, inventory_items, vendors, bom_items, purchase_orders, build_orders, requisitions, artwork_folders, external_data_sources
   - RLS enabled on all tables
   - Real-time subscriptions working
   - Test data seeded

5. **Core Features Working**
   - Dashboard with inventory overview
   - Inventory management
   - Purchase Orders
   - Vendors
   - Production/Build Orders
   - BOMs (Bill of Materials)
   - Settings page
   - User Management (Admin/Manager)

### ⚠️ Known Issues

1. **Password Reset - PARTIALLY WORKING**
   - Email sends correctly ✓
   - Link redirects to app ✓
   - Session detection timing out ✗
   - **Current Status:** Stuck on "Verifying reset link..." screen
   - **Root Cause:** Supabase's `detectSessionInUrl` not working with their redirect flow
   - **Attempted Fixes:** 
     - Manual `setSession()` (hangs)
     - Query param detection (working but session not establishing)
     - Timeout handling (prevents infinite hang)
   - **Next Steps Needed:** See "Password Reset Fix" section below

2. **Tailwind CSS Warning**
   - Using CDN version (not recommended for production)
   - Should migrate to PostCSS setup
   - Not critical, just a performance/size optimization

3. **Bundle Size**
   - 723KB (180KB gzipped)
   - Should implement code splitting
   - Not urgent but would improve load times

---

## Database Schema

### Users Table (`public.users`)
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Admin', 'Manager', 'Staff')),
  department TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Current Users:**
- `bill.selee@buildasoil.com` - Admin, Management dept
- `admin@tgfmrp.com` - Admin
- `production@tgfmrp.com` - Manager

### Other Key Tables
- `inventory_items` - SKU, stock levels, reorder points
- `vendors` - Supplier information
- `bom_items` - Bill of materials/recipes
- `purchase_orders` - PO tracking
- `build_orders` - Production orders
- `requisitions` - Internal purchase requests
- `artwork_folders` - Product artwork management

---

## Environment Variables

### Required in Vercel
```bash
VITE_SUPABASE_URL=https://mpuevsmtowyexhsqugkm.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
VITE_GEMINI_API_KEY=<optional_for_ai_features>
```

### Required in Supabase
- **Site URL:** `https://tgf-mrp.vercel.app`
- **Redirect URLs:** `https://tgf-mrp.vercel.app/**`
- Email confirmation: Currently disabled for easier testing

---

## File Structure

```
/workspaces/TGF-MRP/
├── App.tsx                 # Main app with routing & auth
├── index.tsx              # Entry point
├── index.html             # HTML shell
├── vite.config.ts         # Build config
├── package.json           # Dependencies
├── types.ts               # TypeScript types
│
├── components/
│   ├── AiAssistant.tsx
│   ├── BomExplosionView.tsx
│   ├── BuildabilityTable.tsx
│   ├── ExecutiveSummary.tsx
│   ├── Header.tsx
│   ├── Modal.tsx
│   ├── Sidebar.tsx
│   ├── Toast.tsx
│   ├── UserManagementPanel.tsx
│   └── icons.tsx
│
├── pages/
│   ├── Analytics.tsx
│   ├── Dashboard.tsx
│   ├── Inventory.tsx
│   ├── LoginScreen.tsx
│   ├── MRP.tsx
│   ├── PlanningForecast.tsx
│   ├── Production.tsx
│   ├── PurchaseOrders.tsx
│   ├── ResetPassword.tsx    # PASSWORD RESET COMPONENT
│   ├── Settings.tsx
│   ├── StockIntelligence.tsx
│   └── Vendors.tsx
│
├── services/
│   ├── buildabilityService.ts
│   ├── dataService.ts         # Supabase data fetching
│   ├── forecastingService.ts
│   ├── geminiService.ts
│   └── mrpService.ts
│
├── lib/
│   └── supabase/
│       └── client.ts          # Supabase client config
│
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       ├── 002_add_vendors.sql
│       ├── 003_add_bom_items.sql
│       ├── 004_add_purchase_orders.sql
│       ├── 005_add_build_orders.sql
│       ├── 006_add_requisitions.sql
│       └── 007_role_based_access_control.sql
│
├── scripts/
│   ├── deploy.sh
│   ├── check-user-roles.sql
│   ├── set-bill-admin.sql
│   └── fix-user-access.sql
│
└── docs/
    ├── PASSWORD_RESET_COMPLETE_FIX.md
    └── supabase-email-template-fix.md
```

---

## Key Code Locations

### Authentication Flow
**File:** `/App.tsx` (Lines 108-200)
- `useEffect` monitors URL for password reset mode
- `initAuth()` fetches current user and profile
- `onAuthStateChange` handles session updates
- Fetches user role from `public.users` table (not auth.users metadata)

### Password Reset Component
**File:** `/pages/ResetPassword.tsx`
- Detects `?type=recovery` in URL (query params)
- Waits for Supabase `detectSessionInUrl` to establish session
- Checks session after 1.5s delay
- Shows error if session not found
- **ISSUE:** Session never establishes, times out

### Supabase Client
**File:** `/lib/supabase/client.ts`
```typescript
{
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,  // Should auto-handle password reset
    storage: window.localStorage,
  }
}
```

### User Data Fetching
**File:** `/services/dataService.ts`
- `fetchUserById(userId)` - Get single user profile (Lines 485-505)
- `fetchUsers()` - Get all users (Lines 460-477)
- `fetchInventory()`, `fetchVendors()`, etc.
- Real-time subscriptions for live updates

---

## Password Reset Fix - CRITICAL ISSUE

### Current Flow (Not Working)
1. User requests reset → Supabase sends email ✓
2. Email link: `https://mpuevsmtowyexhsqugkm.supabase.co/auth/v1/verify?token=...&type=recovery&redirect_to=https://tgf-mrp.vercel.app` ✓
3. Supabase redirects to: `https://tgf-mrp.vercel.app?type=recovery&...` ✓
4. App detects `type=recovery` and shows ResetPassword component ✓
5. ResetPassword waits for Supabase to establish session ✗ **HANGS HERE**
6. `supabase.auth.getSession()` returns null ✗
7. Stuck on "Verifying reset link..." screen ✗

### Why It's Failing
Supabase's `detectSessionInUrl` is designed for **hash-based routing** (`#access_token=...`) but their email redirect uses **query parameters** (`?type=recovery`). The tokens aren't in the URL at all - they need to be exchanged server-side.

### Potential Solutions

#### Option A: Update Email Template (RECOMMENDED)
Change Supabase email template to include tokens in hash:

**Go to:** Supabase Dashboard → Authentication → Email Templates → Reset Password

**Update template to:**
```html
<h2>Reset Password</h2>
<p>Follow this link to reset your password:</p>
<p><a href="{{ .SiteURL }}/#access_token={{ .TokenHash }}&type=recovery">Reset Password</a></p>
```

This puts the tokens in the hash fragment where `detectSessionInUrl` can find them.

#### Option B: Use PKCE Flow
Switch to Supabase's PKCE (Proof Key for Code Exchange) flow which is more secure and reliable for SPAs.

**In Supabase client config:**
```typescript
auth: {
  flowType: 'pkce',  // Add this
  detectSessionInUrl: true,
}
```

#### Option C: Manual Token Exchange (Complex)
Extract tokens from redirect and manually exchange them. Requires understanding Supabase's token format.

### Recommended Next Steps
1. **Try Option A first** - Update email template
2. **Test thoroughly** - Request new reset email after template change
3. **If Option A fails** - Try Option B (PKCE flow)
4. **Last resort** - Implement custom token exchange

---

## Development Workflow

### Local Development
```bash
cd /workspaces/TGF-MRP
npm install
npm run dev  # Starts Vite dev server on port 3000
```

### Build & Deploy
```bash
npm run build                    # Build for production
git add -A
git commit -m "Your message"
git push origin main            # Triggers Vercel deployment
vercel --prod --yes             # Manual deploy (if needed)
```

### Database Migrations
```bash
# Run SQL files in Supabase SQL Editor
# Located in /supabase/migrations/
```

### Checking Logs
- **Console logs:** Browser DevTools (F12)
- **Vercel logs:** https://vercel.com/will-selees-projects/tgf-mrp
- **Supabase logs:** Supabase Dashboard → Logs

---

## Recent Changes & Fixes

### Session 1: Initial Deployment (Completed)
- Linked Supabase project
- Applied all migrations
- Seeded test data
- Deployed to Vercel
- Fixed black screen (import map issue)
- Fixed Gemini API env variable

### Session 2: Authentication & RBAC (Completed)
- Implemented role-based access control
- Created `public.users` table
- Fixed user role fetching (was using metadata, now uses DB)
- Fixed Settings page (removed `is_deleted` filter that didn't exist)
- Login working for all users

### Session 3: Password Reset (IN PROGRESS)
- Created ResetPassword component
- Added URL hash/query detection
- Added session timeout handling (5s)
- Added comprehensive logging
- **STATUS:** Still hanging on session establishment
- **NEXT:** Need to fix session detection (see Options A/B/C above)

---

## Testing Checklist

### Authentication
- [x] Login with email/password
- [x] Logout
- [ ] Password reset (BROKEN - see above)
- [x] Session persistence across refreshes
- [x] Proper role display

### RBAC
- [x] Admin sees all features
- [x] Manager sees limited features
- [x] Staff sees read-only view
- [x] Settings page loads for Admin/Manager
- [x] User Management panel works

### Data Operations
- [x] Inventory loads
- [x] Vendors load
- [x] Purchase Orders load
- [x] BOMs load
- [x] Real-time updates work
- [x] Dashboard displays data

---

## Common Commands

```bash
# Build and deploy
npm run build && git add -A && git commit -m "message" && git push && vercel --prod --yes

# Check user roles in Supabase
# Run /scripts/check-user-roles.sql

# Set user as Admin
# Run /scripts/set-bill-admin.sql

# View current branch
git branch

# Check git status
git status

# Pull latest
git pull origin main

# View recent commits
git log --oneline -10
```

---

## Important URLs

- **Production App:** https://tgf-mrp.vercel.app
- **Vercel Dashboard:** https://vercel.com/will-selees-projects/tgf-mrp
- **Supabase Dashboard:** https://supabase.com/dashboard/project/mpuevsmtowyexhsqugkm
- **GitHub Repo:** https://github.com/bselee/TGF-MRP

---

## Next Session TODO

1. **FIX PASSWORD RESET** - Top priority
   - Try Option A: Update email template
   - Test with new reset email
   - If fails, try Option B: PKCE flow
   
2. **Clean up logging** - Remove debug console.logs from production

3. **Optimize bundle** - Implement code splitting

4. **Migrate Tailwind** - Move from CDN to PostCSS

5. **Add tests** - No test coverage currently

6. **Email confirmation** - Currently disabled, may want to re-enable

7. **Enhanced features:**
   - MRP calculations
   - Forecasting
   - Analytics dashboard
   - Stock intelligence

---

## Critical Information for Next Developer

### Don't Break These:
- User role fetching from `public.users` (NOT from auth.users metadata)
- RLS policies - all tables require proper role checks
- Real-time subscriptions - used for live updates
- Environment variables in Vercel

### Quick Fixes:
- If deployment breaks: Check Vercel logs
- If auth breaks: Check Supabase Site URL matches production
- If data not loading: Check RLS policies and user roles
- If styles break: Tailwind CSS loaded from CDN in index.html

### Getting Unstuck:
1. Check browser console (F12)
2. Check Vercel deployment logs
3. Check Supabase logs
4. Clear browser cache / try incognito
5. Verify environment variables in Vercel

---

## Contact & Access

- **Supabase Project:** mpuevsmtowyexhsqugkm
- **Admin User:** bill.selee@buildasoil.com
- **Vercel Account:** will-selees-projects
- **GitHub Repo:** bselee/TGF-MRP

---

**Document Version:** 1.0  
**Last Updated:** October 29, 2025  
**Status:** Password reset issue in progress, otherwise fully functional
