# 🚀 Deploy Finale Sync to Supabase

## Step-by-Step Deployment Guide

### **Step 1: Install Supabase CLI**

```bash
# Install globally
npm install -g supabase

# Verify installation
supabase --version
```

---

### **Step 2: Login to Supabase**

```bash
supabase login
```

This will open a browser window to authenticate.

---

### **Step 3: Link Your Project**

```bash
# Link to your Supabase project
supabase link --project-ref mpuevsmtowyexhsqugkm

# You'll be prompted for your database password
# Use: IOngZtT66GLmqHlQ
```

---

### **Step 4: Set Secrets in Supabase**

```bash
# Set Finale API credentials
supabase secrets set FINALE_API_KEY="I9TVdRvblFod"
supabase secrets set FINALE_API_SECRET="63h4TCI62vlQUYM3btEA7bycoIflGQUz"
supabase secrets set FINALE_ACCOUNT_PATH="buildasoilorganics"
supabase secrets set FINALE_BASE_URL="https://app.finaleinventory.com"

# Supabase credentials (auto-set, but verify)
supabase secrets set SUPABASE_URL="https://mpuevsmtowyexhsqugkm.supabase.co"
```

**Verify secrets are set:**
```bash
supabase secrets list
```

---

### **Step 5: Deploy the Edge Function**

```bash
# Deploy sync-finale-data function
supabase functions deploy sync-finale-data

# You should see:
# ✅ Deploying sync-finale-data (version xxx)
# ✅ Deployed successfully
```

---

### **Step 6: Test the Function**

```bash
# Test the deployed function
supabase functions invoke sync-finale-data \
  --method POST \
  --body '{"fullSync": true}'
```

**Expected output:**
```json
{
  "success": true,
  "results": [
    {"dataType": "vendors", "success": true, "itemCount": 100},
    {"dataType": "inventory", "success": true, "itemCount": 10000},
    {"dataType": "purchaseOrders", "success": true, "itemCount": 500}
  ]
}
```

---

### **Step 7: Set Up Supabase Cron**

Go to: **Supabase Dashboard → Database → Extensions**

Enable the **pg_cron** extension:
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

Then create a cron job:
```sql
-- Run sync every 4 hours
SELECT cron.schedule(
  'finale-sync-every-4-hours',
  '0 */4 * * *',  -- Every 4 hours
  $$
  SELECT
    net.http_post(
      url := 'https://mpuevsmtowyexhsqugkm.supabase.co/functions/v1/sync-finale-data',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object('fullSync', false)
    );
  $$
);

-- View scheduled jobs
SELECT * FROM cron.job;
```

---

### **Step 8: Verify Data**

After running the function, check Supabase:

```sql
-- Check row counts
SELECT
  (SELECT COUNT(*) FROM finale_products) as products,
  (SELECT COUNT(*) FROM finale_vendors) as vendors,
  (SELECT COUNT(*) FROM finale_purchase_orders) as purchase_orders;

-- Check recent sync log
SELECT * FROM sync_metadata
ORDER BY last_sync_time DESC
LIMIT 5;
```

---

## 🔧 Troubleshooting

### **If deployment fails:**

```bash
# Check function logs
supabase functions logs sync-finale-data --tail
```

### **If secrets are missing:**

```bash
# List all secrets
supabase secrets list

# Re-set any missing ones
supabase secrets set FINALE_API_KEY="your-key"
```

### **If sync fails:**

Check logs in **Supabase Dashboard → Edge Functions → sync-finale-data → Logs**

---

## ✅ Expected Results

After successful deployment and first sync:

**Supabase Tables:**
- `finale_products`: 10,000+ rows
- `finale_vendors`: 100+ rows
- `finale_purchase_orders`: 500+ rows
- `finale_inventory`: 10,000+ rows

**Vercel Cron:**
- Still works! Calls Supabase Edge Function every 4 hours
- Vercel `/api/sync-finale` → Supabase Edge Function → Finale API

**MuRP App:**
- Displays data from Supabase
- No CORS errors
- Purchase orders page works like basauto example!

---

## 📝 Quick Command Reference

```bash
# Full deployment flow
supabase login
supabase link --project-ref mpuevsmtowyexhsqugkm
supabase secrets set FINALE_API_KEY="I9TVdRvblFod"
supabase secrets set FINALE_API_SECRET="63h4TCI62vlQUYM3btEA7bycoIflGQUz"
supabase secrets set FINALE_ACCOUNT_PATH="buildasoilorganics"
supabase functions deploy sync-finale-data
supabase functions invoke sync-finale-data --method POST --body '{"fullSync": true}'
```

---

That's it! Once deployed, your Finale data will sync automatically every 4 hours. 🎉
