# 🤖 Deployment Automation

This directory contains scripts to automate the deployment process for TGF MRP.

## 📋 Available Scripts

### 1. `verify-deployment.sh`
**Pre-deployment verification and safety checks**

```bash
./scripts/verify-deployment.sh
```

**What it checks:**
- ✅ Node.js version
- ✅ Environment variables configured
- ✅ Dependencies installed
- ✅ Production build succeeds
- ✅ TypeScript compiles
- ✅ Git status (uncommitted changes warning)
- ✅ Supabase CLI available
- ✅ Vercel CLI available
- ✅ Required files present
- ✅ API endpoints exist

**When to use:** Before every deployment to catch issues early

---

### 2. `deploy.sh`
**Automated deployment to Vercel**

```bash
# Preview deployment (for testing)
./scripts/deploy.sh preview

# Production deployment (live site)
./scripts/deploy.sh production
```

**What it does:**
1. Runs verification checks
2. Checks Vercel CLI installation
3. Verifies authentication
4. Builds the project
5. Deploys to Vercel
6. Provides deployment URL

**When to use:** Every time you want to deploy

---

### 3. `setup-database.sh`
**Interactive database setup**

```bash
./scripts/setup-database.sh
```

**What it does:**
1. Checks Supabase CLI
2. Links your Supabase project
3. Applies all migrations
4. Generates TypeScript types
5. Optionally seeds test data

**When to use:** First-time setup or when database schema changes

---

### 4. `seed-database.sql`
**Test data for your database**

```bash
# Via setup script
./scripts/setup-database.sh

# Or directly
supabase db execute --file scripts/seed-database.sql
```

**What it creates:**
- 3 sample vendors
- 8 inventory items
- 2 BOMs (Bills of Materials)
- 3 artwork folders

**When to use:** After fresh database setup for testing

---

## 🚀 Quick Commands

Use these npm scripts for convenience:

```bash
# Pre-deployment check
npm run verify

# Setup database (first time)
npm run setup:db

# Deploy to preview
npm run deploy:preview

# Deploy to production
npm run deploy:prod

# Full deployment (verify + deploy)
npm run deploy
```

---

## 📖 Usage Examples

### First-Time Deployment

```bash
# 1. Setup environment
cp .env.example .env.local
nano .env.local  # Add your keys

# 2. Setup database
npm run setup:db

# 3. Verify everything
npm run verify

# 4. Deploy to preview first (test)
npm run deploy:preview

# 5. Test the preview URL
# Visit URL, sign up, test features

# 6. Deploy to production
npm run deploy:prod
```

### Regular Updates

```bash
# After making code changes:
npm run deploy
```

That's it! The script handles everything.

### Database Schema Changes

```bash
# 1. Create new migration file
# supabase/migrations/007_your_change.sql

# 2. Apply migration
./scripts/setup-database.sh

# 3. Regenerate types
supabase gen types typescript --local > types/database.ts

# 4. Deploy
npm run deploy
```

---

## 🛡️ Safety Features

### Pre-Deployment Checks
The scripts won't let you deploy if:
- ❌ Environment variables are missing
- ❌ Build fails
- ❌ Required files are missing

### Confirmation Prompts
You'll be asked to confirm:
- Production deployments (safety against accidental deploys)
- Database migrations (safety against data loss)
- Database seeding (prevents duplicate data)

### Git Safety
- Warns if you have uncommitted changes
- Asks if you want to continue
- Prevents accidental deployment of WIP code

---

## 🔧 Customization

### Add Your Own Checks

Edit `verify-deployment.sh`:

```bash
# Add custom check
step "Checking custom requirement..."
if [ custom_check ]; then
    check_pass "Custom check passed"
else
    check_fail "Custom check failed"
fi
```

### Change Deployment Behavior

Edit `deploy.sh`:

```bash
# Add post-deployment actions
step "Running smoke tests..."
curl https://your-app.vercel.app/health

step "Sending deployment notification..."
# Add your notification logic
```

### Modify Seed Data

Edit `seed-database.sql`:

```sql
-- Add your own test data
INSERT INTO inventory_items (sku, name, category, ...)
VALUES ('YOUR-SKU', 'Your Product', 'Your Category', ...);
```

---

## 🐛 Troubleshooting

### Script Won't Run
```bash
# Make executable
chmod +x scripts/*.sh

# Check shell
bash --version  # Should be bash 4+
```

### Verification Fails
```bash
# Run manually to see full output
./scripts/verify-deployment.sh

# Fix reported issues one by one
```

### Deployment Hangs
```bash
# Check Vercel authentication
vercel whoami

# Re-login if needed
vercel login
```

### Database Setup Fails
```bash
# Check Supabase connection
supabase projects list

# Re-link project
supabase link --project-ref YOUR_REF
```

---

## 📊 Script Output

### Successful Verification
```
✓ Node.js version: v20.10.0
✓ .env.local file exists
✓ All environment variables set
✓ Dependencies installed
✓ Production build succeeds
✓ No TypeScript errors
✓ Working directory clean
✓ Supabase CLI installed
✓ Vercel CLI installed
✓ All required files present
✓ API endpoints exist

✅ Pre-deployment verification complete!
```

### Successful Deployment
```
✓ Vercel CLI ready
✓ Already logged in to Vercel
✓ Build complete

🌐 Deploying to PRODUCTION...
✓ Deployment complete

✅ Deployment complete!
URL: https://tgf-mrp-xyz.vercel.app
```

---

## 🎯 Best Practices

1. **Always verify before deploying**
   ```bash
   npm run verify
   ```

2. **Test in preview first**
   ```bash
   npm run deploy:preview
   ```

3. **Keep environment variables updated**
   ```bash
   vercel env ls
   ```

4. **Monitor logs after deployment**
   ```bash
   vercel logs --follow
   ```

5. **Commit scripts with your code**
   - Scripts are version controlled
   - Team members get same automation
   - Consistent deployment process

---

## 🔗 Related Documentation

- **Quick Start**: See `QUICK_START.md` for 5-minute deployment
- **Full Guide**: See `DEPLOYMENT_GUIDE.md` for detailed instructions
- **Database Schema**: See `supabase/migrations/` for table structure
- **API Reference**: See `Backend-doc2.md` for API documentation

---

## 💡 Pro Tips

### Faster Workflow
```bash
# Create alias in your shell profile
alias deploy-preview='npm run deploy:preview'
alias deploy-prod='npm run deploy:prod'
```

### CI/CD Integration
Add to GitHub Actions:

```yaml
- name: Verify deployment
  run: npm run verify

- name: Deploy to Vercel
  run: npm run deploy:prod
```

### Multiple Environments
```bash
# Copy scripts for staging
cp scripts/deploy.sh scripts/deploy-staging.sh

# Modify for staging environment
# Add to package.json:
# "deploy:staging": "./scripts/deploy-staging.sh"
```

---

**Last Updated**: October 29, 2025
