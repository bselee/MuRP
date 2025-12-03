# Seeding Finale Data

## Quick Start

The database should be pre-seeded with Finale data **before users access the app**. This ensures data is immediately available on first page load.

## Option 1: Run Seed Script (Recommended)

```bash
# Run once after deployment or setup
npm run dev

# Then in browser console, manually trigger first sync:
# Open DevTools (F12) → Console → Run:
import('../services/finaleAutoSync').then(({ triggerManualSync }) => triggerManualSync());
```

## Option 2: Pre-Seed from CI/CD

Add to your deployment workflow (GitHub Actions, Vercel, etc.):

```yaml
# .github/workflows/deploy.yml
- name: Seed Finale Data
  run: |
    npm install
    npm run dev &
    sleep 10
    curl http://localhost:5173  # Triggers auto-sync
    sleep 60                     # Wait for sync to complete
    kill %1
```

## Option 3: Vercel Build Hook

Create a Vercel Deploy Hook that runs after build:

1. Go to Vercel Project Settings → Git → Deploy Hooks
2. Create hook: "Seed Database"
3. Add to package.json:

```json
{
  "scripts": {
    "vercel-build": "vite build && npm run trigger-seed",
    "trigger-seed": "curl YOUR_DEPLOY_HOOK_URL"
  }
}
```

## Verify Data Was Seeded

```bash
# Check database counts
npx tsx check-finale-data.js

# Expected output:
# 📦 Inventory items: 2586
# 🏢 Vendors: 142
# 📋 Purchase Orders: 23
# 🔧 BOMs: 347
```

## How Auto-Sync Works After Seeding

Once data is seeded, auto-sync keeps it updated:

- **Inventory**: Every 5 minutes
- **Purchase Orders**: Every 15 minutes
- **Vendors & BOMs**: Every 1 hour

No manual intervention needed after initial seed!

## Troubleshooting

**No data after deployment?**
- Check environment variables are set (VITE_FINALE_*)
- Verify app has been opened in browser at least once
- Check browser console for "[FinaleAutoSync]" messages

**Seed failed?**
- Verify Finale API credentials are correct
- Check network connectivity to app.finaleinventory.com
- Ensure Supabase connection is working
