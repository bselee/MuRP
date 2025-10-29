# 🚀 Vercel Deployment Guide

## Pre-Deployment Checklist

### ✅ Phase 1-6 Complete
- [x] Foundation (Supabase clients, environment config)
- [x] Database Schema (migrations, RLS policies)
- [x] Connector Architecture (Finale, types, registry)
- [x] Data Transformation (field mapping, batch processing)
- [x] API Layer (sync endpoint, AI query, helpers)
- [x] Settings UI (External Data Sources panel)
- [x] Auth UI (Sign in/up, password reset, session management)
- [x] Frontend Integration (Real Supabase queries, real-time subscriptions)

### 📦 Files Ready for Deployment
- **API Endpoints**: `api/external/sync.ts`, `api/ai/query.ts`
- **Frontend**: Complete React app with Supabase integration
- **Database**: 6 migrations ready to apply
- **Documentation**: Comprehensive setup guides

---

## Step 1: Prepare Supabase Production Database

### 1.1 Apply Migrations
```bash
# Connect to your Supabase project
supabase link --project-ref YOUR_PROJECT_REF

# Apply all migrations
supabase db push
```

### 1.2 Verify Tables Created
```sql
-- Run in Supabase SQL Editor
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Expected tables:
-- audit_logs, boms, build_orders, external_data_sources, 
-- inventory_items, purchase_orders, requisitions, vendors
```

### 1.3 Generate TypeScript Types
```bash
# Generate updated types from production schema
supabase gen types typescript --project-id YOUR_PROJECT_ID > types/database.ts
```

### 1.4 Verify RLS Policies Active
```sql
-- Check RLS is enabled on all tables
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- All tables should have rowsecurity = true
```

---

## Step 2: Configure Vercel Project

### 2.1 Install Vercel CLI (if not already installed)
```bash
npm install -g vercel
```

### 2.2 Login to Vercel
```bash
vercel login
```

### 2.3 Initialize Vercel Project
```bash
cd /workspaces/TGF-MRP
vercel
# Follow prompts:
# - Set up and deploy? Yes
# - Which scope? (your account)
# - Link to existing project? No
# - Project name? tgf-mrp
# - Directory with code? ./
# - Override settings? No
```

---

## Step 3: Environment Variables

### 3.1 Required Environment Variables

Add these to your Vercel project dashboard (Settings > Environment Variables):

#### Supabase Variables
```bash
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**Where to find these:**
- Go to Supabase Dashboard > Project Settings > API
- `VITE_SUPABASE_URL`: Project URL
- `VITE_SUPABASE_ANON_KEY`: `anon` / `public` key
- `SUPABASE_SERVICE_ROLE_KEY`: `service_role` key (⚠️ Keep secret!)

#### AI Integration
```bash
GEMINI_API_KEY=your_google_gemini_api_key
```

**Where to get this:**
- Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
- Create API key for Gemini

#### Vercel KV (Optional - for caching)
```bash
KV_REST_API_URL=your_kv_url
KV_REST_API_TOKEN=your_kv_token
```

**Setup Vercel KV:**
```bash
# From Vercel dashboard:
# Storage > Create Database > KV
# Copy the provided environment variables
```

### 3.2 Set Environment Variables via CLI
```bash
# Set production environment variables
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add GEMINI_API_KEY production

# Set preview environment (optional)
vercel env add VITE_SUPABASE_URL preview
# ... repeat for preview environment
```

---

## Step 4: Deploy to Vercel

### 4.1 Production Deployment
```bash
# Build and deploy to production
vercel --prod
```

### 4.2 Verify Deployment
After deployment, Vercel will provide a URL like: `https://tgf-mrp.vercel.app`

---

## Step 5: Post-Deployment Verification

### 5.1 Smoke Test Checklist

#### ✅ Frontend Tests
1. **Authentication**
   - [ ] Visit deployed URL
   - [ ] Sign up with new account
   - [ ] Verify email confirmation sent
   - [ ] Sign in with credentials
   - [ ] Verify redirect to dashboard
   - [ ] Sign out successfully

2. **Data Loading**
   - [ ] Dashboard loads without errors
   - [ ] Inventory page displays data
   - [ ] Vendors page displays data
   - [ ] Purchase Orders page displays data
   - [ ] Production page displays data

3. **Settings Access**
   - [ ] Navigate to Settings page
   - [ ] External Data Sources panel visible
   - [ ] Can add new data source (don't submit real credentials yet)

#### ✅ API Endpoint Tests

1. **AI Query Endpoint**
```bash
# Test AI query (requires authentication)
curl -X POST https://tgf-mrp.vercel.app/api/ai/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"query": "What is the current inventory status?"}'

# Expected: 200 OK with AI-generated response
```

2. **External Sync Endpoint**
```bash
# Test sync status (admin only)
curl -X GET https://tgf-mrp.vercel.app/api/external/sync \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"

# Expected: 200 OK with sync summary
```

### 5.2 Monitor Vercel Logs
```bash
# Stream live logs
vercel logs --follow

# Or view in Vercel Dashboard:
# Project > Deployments > [Latest] > Logs
```

### 5.3 Check Error Tracking
- Go to Vercel Dashboard > Project > Logs
- Filter by "Error" level
- Ensure no critical errors

---

## Step 6: Finale Integration Testing

### 6.1 Add Finale Test Credentials

1. Sign in to your deployed app
2. Navigate to Settings > External Data Sources
3. Click "Add Source"
4. Select "Finale Inventory"
5. Enter test credentials:
   - **API URL**: `https://app.finaleinventory.com/api`
   - **API Key**: Your Finale API key
   - **API Secret**: Your Finale API secret
6. Set Sync Frequency: "Manual" (for testing)
7. Click "Save"

### 6.2 Test Connection
- Click "Test Connection" button
- Verify green checkmark appears
- Check browser console for any errors

### 6.3 Trigger Manual Sync
- Click "Sync Now" button
- Monitor sync progress indicator
- Verify success message appears

### 6.4 Verify Data Imported
1. Navigate to Inventory page
2. Check for Finale inventory items
3. Verify quantities match Finale system
4. Navigate to Vendors page
5. Verify Finale vendors imported
6. Navigate to Purchase Orders
7. Verify Finale POs imported

### 6.5 Check Sync Logs
```bash
# View sync execution logs
vercel logs --filter="/api/external/sync"

# Expected output:
# - Authentication successful
# - Connector created
# - Data fetched from Finale
# - Transformation applied
# - Upsert to database
# - Sync status updated
```

---

## Step 7: Production Monitoring Setup

### 7.1 Set Up Alerts (Vercel Dashboard)
1. Go to Project Settings > Notifications
2. Enable:
   - **Deployment Failed**
   - **Deployment Succeeded**
   - **Build Errors**

### 7.2 Performance Monitoring
- Monitor response times in Vercel Analytics
- Check function execution times
- Verify within limits:
  - Sync endpoint: < 30 seconds
  - AI query: < 10 seconds
  - Standard pages: < 2 seconds

### 7.3 Database Monitoring (Supabase)
- Dashboard > Database > Performance
- Monitor query performance
- Check connection pool usage
- Verify no slow queries (>1s)

---

## Step 8: Security Validation

### 8.1 Environment Variable Check
- [ ] No secrets committed to Git
- [ ] `.env.local` in `.gitignore`
- [ ] All production secrets in Vercel dashboard only

### 8.2 API Security Check
- [ ] All endpoints require authentication
- [ ] Admin-only endpoints check roles
- [ ] CORS configured properly
- [ ] Rate limiting active on connectors

### 8.3 Database Security Check
```sql
-- Verify RLS policies prevent unauthorized access
-- Test as different users to ensure isolation
```

---

## Step 9: Client Onboarding

### 9.1 Create Client Account
1. Sign up first client user
2. Verify email confirmation
3. Test login

### 9.2 Configure Finale Integration
1. Add Finale credentials
2. Set sync schedule (e.g., Hourly)
3. Run initial sync
4. Verify data accuracy

### 9.3 Train Client
- Dashboard overview
- Inventory management
- Purchase order creation
- External data source management
- Sync schedule configuration

---

## Troubleshooting Common Issues

### Issue 1: Build Fails on Vercel
**Symptom**: Deployment fails at build stage

**Solution**:
```bash
# Test build locally first
npm run build

# Check for TypeScript errors
npm run type-check

# Fix errors and redeploy
git commit -am "fix: resolve build errors"
git push origin main
```

### Issue 2: Environment Variables Not Working
**Symptom**: App can't connect to Supabase

**Solution**:
- Verify variables in Vercel Dashboard
- Check variable names match exactly (case-sensitive)
- Redeploy after adding variables:
  ```bash
  vercel --prod --force
  ```

### Issue 3: API Endpoint 404
**Symptom**: `/api/*` routes return 404

**Solution**:
- Verify `vercel.json` in root directory
- Check API files in `api/` directory
- Ensure file names match routes exactly
- Redeploy

### Issue 4: Database Connection Fails
**Symptom**: "Failed to connect to database"

**Solution**:
- Check Supabase project is not paused
- Verify connection string correct
- Check RLS policies not blocking queries
- Test with service role key for debugging

### Issue 5: Finale Sync Fails
**Symptom**: Sync status shows "failed"

**Solution**:
- Verify Finale credentials correct
- Check API rate limits not exceeded
- Review sync logs in Vercel
- Test connection manually via Postman
- Check connector code for errors

---

## Performance Optimization (Post-Launch)

### Code Splitting
```typescript
// Use dynamic imports for large components
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Inventory = lazy(() => import('./pages/Inventory'));
```

### Caching Strategy
- Enable Vercel KV for connector caching
- Set appropriate cache TTLs (1 hour default)
- Monitor cache hit rates

### Database Optimization
- Add indexes on frequently queried columns
- Optimize JSONB queries
- Consider materialized views for complex reports

---

## Rollback Procedure

### If Issues Found in Production

1. **Immediate Rollback**
```bash
# Revert to previous deployment
vercel rollback
```

2. **Fix Issues Locally**
```bash
# Fix bugs
# Test thoroughly
npm run build
npm run dev
```

3. **Redeploy**
```bash
git commit -am "fix: resolve production issues"
git push origin main
vercel --prod
```

---

## Success Criteria

✅ **Deployment Successful If:**
- [ ] Frontend loads without errors
- [ ] Authentication works (sign up, sign in, sign out)
- [ ] Real data loads from Supabase
- [ ] Settings UI accessible
- [ ] External data sources can be configured
- [ ] Finale sync completes successfully
- [ ] Data appears in inventory/vendors/POs
- [ ] No critical errors in logs
- [ ] Response times acceptable (<5s for sync, <2s for pages)

---

## Next Steps After Successful Deployment

1. **Documentation**
   - Create user guide
   - Document API endpoints
   - Write troubleshooting guide for clients

2. **Feature Enhancements**
   - Add QuickBooks connector
   - Implement CSV import
   - Add JSON API connector
   - Build custom webhook support

3. **Monitoring & Analytics**
   - Set up Sentry for error tracking
   - Add custom analytics events
   - Monitor sync success rates
   - Track user engagement

4. **Testing**
   - Write unit tests for connectors
   - Add E2E tests with Playwright
   - Performance testing under load
   - Security penetration testing

---

## Support & Resources

- **Vercel Docs**: https://vercel.com/docs
- **Supabase Docs**: https://supabase.com/docs
- **Finale API Docs**: https://support.finaleinventory.com/hc/en-us/articles/115005231766-API-Developer-Resources
- **React Docs**: https://react.dev

---

**Deployment Date**: _[To be filled after deployment]_  
**Deployed URL**: _[To be filled after deployment]_  
**Deployed By**: bselee  
**Version**: Phase 6 Complete (Auth + Frontend Integration)
