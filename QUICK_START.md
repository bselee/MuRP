# 🚀 Quick Start - Deploy in 5 Minutes

This guide gets your TGF MRP system deployed to production in just a few commands.

## Prerequisites

- Node.js 18+ installed
- A [Supabase](https://supabase.com) account and project
- A [Vercel](https://vercel.com) account
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
- [Vercel CLI](https://vercel.com/cli) installed (or will be auto-installed)

---

## 🎯 One-Command Deployment

```bash
# Make scripts executable
chmod +x scripts/*.sh

# Run the automated deployment (interactive)
./scripts/deploy.sh production
```

That's it! The script will:
1. ✅ Verify your environment
2. ✅ Build the project
3. ✅ Deploy to Vercel
4. ✅ Give you the live URL

---

## 📋 Step-by-Step Guide

If you prefer manual control, follow these steps:

### Step 1: Environment Setup (2 minutes)

```bash
# Copy environment template
cp .env.example .env.local

# Edit .env.local with your values
nano .env.local
```

Required variables:
```bash
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_api_key
```

**Where to find these:**
- Supabase: Dashboard > Project Settings > API
- Gemini: [Google AI Studio](https://makersuite.google.com/app/apikey)

### Step 2: Database Setup (2 minutes)

```bash
# Automated setup
./scripts/setup-database.sh

# Or manual:
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase gen types typescript --local > types/database.ts
```

**Optional - Add test data:**
```bash
supabase db execute --file scripts/seed-database.sql
```

### Step 3: Verify Everything Works (1 minute)

```bash
# Run pre-deployment checks
./scripts/verify-deployment.sh

# Expected output: All green checkmarks ✓
```

### Step 4: Deploy to Vercel (1 minute)

```bash
# Preview deployment (test first)
./scripts/deploy.sh preview

# Production deployment (live)
./scripts/deploy.sh production

# Or use Vercel CLI directly:
vercel --prod
```

---

## 🔧 Manual Vercel Setup (Alternative)

If you prefer using the Vercel dashboard:

### 1. Import Project
- Go to [vercel.com/new](https://vercel.com/new)
- Import your GitHub repository
- Framework Preset: **Vite**
- Build Command: `npm run build`
- Output Directory: `dist`

### 2. Environment Variables
Add these in Vercel Dashboard > Settings > Environment Variables:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Deploy
Click "Deploy" button. Done!

---

## ✅ Post-Deployment Checklist

After deployment, verify these work:

### 1. Authentication (2 minutes)
- [ ] Visit your deployment URL
- [ ] Click "Sign up" 
- [ ] Create account with email
- [ ] Check email for verification
- [ ] Sign in successfully
- [ ] Dashboard loads

### 2. Data Loading (1 minute)
- [ ] Inventory page shows items
- [ ] Vendors page shows vendors
- [ ] BOMs page shows BOMs
- [ ] Purchase Orders page loads
- [ ] No console errors

### 3. Settings (1 minute)
- [ ] Navigate to Settings
- [ ] External Data Sources panel visible
- [ ] Can add new data source (don't save yet)

### 4. API Endpoints (1 minute)

Test AI endpoint:
```bash
# Get your JWT token from browser DevTools (Application > Local Storage > supabase.auth.token)
curl -X POST https://YOUR-APP.vercel.app/api/ai/query \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is in inventory?"}'
```

Expected: JSON response with AI answer

### 5. Logs (ongoing)
```bash
# Stream live logs
vercel logs --follow

# Or view in dashboard
# https://vercel.com/YOUR-USERNAME/tgf-mrp/logs
```

---

## 🐛 Troubleshooting

### Build Fails
```bash
# Test build locally first
npm run build

# Check for errors
npm run type-check
```

### Database Connection Issues
```bash
# Verify Supabase project is active
supabase projects list

# Test connection
supabase db ping
```

### Environment Variables Not Working
```bash
# Verify in Vercel
vercel env ls

# Add missing variables
vercel env add VARIABLE_NAME production
```

### Deployment URL Shows 404
- Check `vercel.json` exists
- Verify build output in `dist/` directory
- Check Vercel deployment logs

---

## 🎉 Success Indicators

Your deployment is successful when:
- ✅ Sign up flow completes
- ✅ Data loads from Supabase
- ✅ Settings UI accessible
- ✅ No 500 errors in logs
- ✅ Real-time updates work (edit inventory in Supabase, see update in UI)

---

## 🚀 Next Steps

After successful deployment:

1. **Configure Finale Integration** (if using)
   - Go to Settings > External Data Sources
   - Add Finale credentials
   - Test connection
   - Set sync schedule

2. **Invite Team Members**
   - They can sign up at your deployment URL
   - Assign roles via Supabase dashboard

3. **Customize for Your Business**
   - Add your actual inventory
   - Import vendor list
   - Create your BOMs
   - Set up purchase order workflow

4. **Monitor Performance**
   - Watch Vercel Analytics
   - Check Supabase usage
   - Monitor API rate limits

---

## 📚 Additional Resources

- **Full Guide**: See `DEPLOYMENT_GUIDE.md` for detailed instructions
- **API Docs**: See `Backend-doc2.md` for API reference
- **Database Schema**: See `supabase/migrations/` for table structure
- **Troubleshooting**: See DEPLOYMENT_GUIDE.md Section "Troubleshooting Common Issues"

---

## 💡 Pro Tips

### Faster Iterations
```bash
# Deploy preview for testing
vercel

# Deploy to production when ready
vercel --prod
```

### Environment Management
```bash
# Copy production env to preview
vercel env pull .env.local

# Different configs per environment
vercel env add VAR_NAME preview
vercel env add VAR_NAME production
```

### Rollback if Needed
```bash
# List deployments
vercel ls

# Rollback to previous
vercel rollback
```

### Monitoring
```bash
# Real-time logs
vercel logs --follow

# Filter by function
vercel logs --filter="/api/external/sync"
```

---

## 🎯 Expected Timeline

- **Setup**: 5 minutes
- **Database**: 2 minutes
- **First Deploy**: 2 minutes
- **Testing**: 5 minutes
- **Total**: **~15 minutes** to production! 🚀

---

**Need Help?**
- Check `DEPLOYMENT_GUIDE.md` for detailed troubleshooting
- Review logs: `vercel logs`
- Verify environment: `./scripts/verify-deployment.sh`
