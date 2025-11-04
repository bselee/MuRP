# 🚀 Quick Deploy - Supabase Migration

## ⚡ 5-Minute Deployment

### 1️⃣ Copy Migration (30 seconds)
```bash
cat supabase/migrations/002_enhance_vendor_schema.sql
```
**Copy the entire output** (151 lines of SQL)

### 2️⃣ Apply in Supabase (2 minutes)
1. Open: https://supabase.com/dashboard/project/mpuevsmtowyexhsqugkm
2. Click: **SQL Editor** → **New Query**
3. Paste the SQL
4. Click: **Run** ▶️
5. Wait for: ✅ Success

### 3️⃣ Verify (30 seconds)
Run in SQL Editor:
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'vendors' AND column_name IN 
('address_line1', 'city', 'state', 'phone', 'website');
```
**Expected:** 5 rows returned

### 4️⃣ Deploy Code (1 minute)
```bash
git add .
git commit -m "feat: Supabase vendor integration complete"
git push origin main
```
Vercel will auto-deploy in ~2 minutes.

### 5️⃣ Test Sync (1 minute)
1. Open: https://tgf-mrp.vercel.app
2. Go to: **Settings** → **Finale Integration**
3. Click: **"Test Connection"** → Should show ✅ Connected
4. Click: **"Sync Data"** → Should show ✅ Synced X vendors

## ✅ Done!

**Check Supabase data:**
```sql
SELECT name, city, state, phone, data_source 
FROM vendors 
ORDER BY updated_at DESC 
LIMIT 5;
```

## 📚 Full Documentation
- **Complete Guide:** `SUPABASE_DEPLOYMENT_GUIDE.md`
- **Summary:** `DEPLOYMENT_SUMMARY.md`
- **Schema Docs:** `SCHEMA_ARCHITECTURE.md`

## 🆘 Help
**Issue:** Migration error?  
**Solution:** Check `SUPABASE_DEPLOYMENT_GUIDE.md` → Troubleshooting section

**Issue:** No vendors synced?  
**Solution:** Verify Finale credentials in Settings, test connection first

**Issue:** Build fails?  
**Solution:** Run `npm run build` locally, check TypeScript errors
