# Supabase Migrations Guide
**Product Data & Compliance Management System**

**Status**: Ready to deploy
**Date**: 2025-11-07
**Phase**: Infrastructure (migrations 004-008)

---

## 🎯 Executive Summary

You have **5 new migrations** (004-008) that create the Product Data & Compliance Management System. These migrations will:

- ✅ Create 3 new tables (labels, product_data_sheets, compliance_records)
- ✅ Enhance the existing boms table with compliance tracking
- ✅ Add 15+ database functions for automation
- ✅ Set up Row-Level Security (RLS) policies
- ✅ Create triggers for auto-updates
- ✅ Add helper views for dashboards

**Running these migrations will resolve all 6 remaining TypeScript errors.**

---

## 📋 Migration Overview

| Migration | File | Size | What It Creates | Time to Run |
|-----------|------|------|-----------------|-------------|
| **004** | create_labels_table.sql | 8.5 KB | `labels` table + 2 functions | ~5 sec |
| **005** | create_product_data_sheets_table.sql | 15 KB | `product_data_sheets` table + 4 functions | ~5 sec |
| **006** | create_compliance_records_table.sql | 13 KB | `compliance_records` table + 5 functions | ~5 sec |
| **007** | enhance_boms_table.sql | 11 KB | BOM enhancements + foreign keys | ~5 sec |
| **008** | deploy_all_product_data_system.sql | 16 KB | **All-in-one** (alternative to 004-007) | ~10 sec |

**Total**: 5 migrations, ~30 seconds to run all

---

## 🚀 Quick Start (Option 1: Individual Migrations)

### Step 1: Connect to Supabase

```bash
# If not already linked, connect to your project
npx supabase link --project-ref your-project-ref

# Test connection
npx supabase db remote --status
```

### Step 2: Run Migrations

```bash
# Push migrations in order (004 → 007)
npx supabase db push

# This will automatically detect and run migrations:
# - 004_create_labels_table.sql
# - 005_create_product_data_sheets_table.sql
# - 006_create_compliance_records_table.sql
# - 007_enhance_boms_table.sql
```

### Step 3: Verify Tables Created

```bash
# List all tables
npx supabase db remote --exec "\\dt"

# Should show:
# - labels ✓
# - product_data_sheets ✓
# - compliance_records ✓
# - boms (enhanced) ✓
```

### Step 4: Regenerate TypeScript Types

```bash
# Generate types from your database
npx supabase gen types typescript --project-id your-project-ref > types/database.ts

# Or if using local dev:
npx supabase gen types typescript --local > types/database.ts
```

### Step 5: Verify TypeScript Errors Gone

```bash
npx tsc --noEmit

# Expected output: No errors! (down from 6)
```

---

## 🚀 Quick Start (Option 2: All-in-One Migration)

If you prefer to run everything in a single transaction:

### Run Migration 008 Only

```bash
# Skip 004-007 and run the combined migration
npx supabase db push

# This runs 008_deploy_all_product_data_system.sql
# which includes everything from 004-007 in one file
```

**Note**: Migration 008 is identical to running 004-007 sequentially. Use this if you want atomic deployment (all-or-nothing).

---

## 📊 What Gets Created

### 1. `labels` Table (Migration 004)

**Purpose**: Store all scanned product labels with AI-extracted data

**Columns** (24 total):
- `id` (UUID, PK)
- `file_name`, `file_url`, `file_size`, `mime_type` - File metadata
- `barcode`, `product_name`, `net_weight` - Label identification
- `bom_id` (UUID, FK) - Links to BOM
- `scan_status` - 'pending', 'scanning', 'completed', 'failed'
- `extracted_data` (JSONB) - AI-extracted ingredients, NPK, claims, warnings
- `ingredient_comparison` (JSONB) - BOM vs label comparison results
- `verified`, `verified_by`, `verified_at` - Human verification tracking
- `uploaded_by`, `created_at`, `updated_at` - Audit trail

**Indexes** (10 total):
- B-tree indexes on: bom_id, barcode, scan_status, status, verified, created_at, uploaded_by
- GIN indexes on: extracted_data, ingredient_comparison (for fast JSONB queries)

**Functions**:
- `get_labels_by_bom(p_bom_id UUID)` - Get all labels for a BOM
- `search_labels_by_barcode(p_barcode TEXT)` - Find labels by barcode

**RLS Policies**:
- SELECT: All authenticated users
- INSERT: Users can insert with their own user ID
- UPDATE: Users can update their own uploads
- DELETE: Users can delete their own uploads

**Triggers**:
- Auto-update `updated_at` on every row change

---

### 2. `product_data_sheets` Table (Migration 005)

**Purpose**: Store AI-generated product documentation (SDS, spec sheets, compliance docs)

**Columns** (24 total):
- `id` (UUID, PK)
- `bom_id` (UUID, FK, NOT NULL) - Always linked to a BOM
- `label_id` (UUID, FK) - Optional link to source label
- `document_type` - 'sds', 'spec_sheet', 'product_info', 'compliance_doc', 'custom'
- `title`, `version`, `description` - Document metadata
- `content` (JSONB, NOT NULL) - Structured document content
- `pdf_url`, `pdf_generated_at`, `pdf_file_size` - PDF export tracking
- `status` - 'draft', 'review', 'approved', 'published', 'archived'
- `is_ai_generated`, `ai_model_used`, `generation_prompt` - AI tracking
- `edit_count`, `edit_history` (JSONB) - Version control
- `tags` (TEXT[]) - Tagging for organization
- `created_by`, `last_edited_by`, `approved_by` - User tracking

**Indexes** (11 total):
- B-tree: bom_id, label_id, document_type, status, created_at, created_by
- Composite: (bom_id, version DESC) for version queries
- GIN: content, edit_history, tags for full-text search
- Full-text search on title

**Functions**:
- `get_data_sheets_by_bom(p_bom_id UUID)` - Get all data sheets for a BOM
- `get_latest_published_sds(p_bom_id UUID)` - Get latest published SDS
- `get_data_sheet_versions(p_bom_id UUID, p_document_type TEXT)` - Version history
- `publish_data_sheet(p_id UUID)` - Publish a data sheet

**RLS Policies**:
- SELECT: All authenticated users
- INSERT: Users can insert with their own user ID
- UPDATE: Creator, last editor, or draft status
- DELETE: Creator only, and only if status = 'draft'

**Triggers**:
- Auto-update `updated_at` and increment `edit_count` on changes

---

### 3. `compliance_records` Table (Migration 006)

**Purpose**: Track state registrations, certifications, EPA, OMRI, renewals, and compliance

**Columns** (38 total):
- `id` (UUID, PK)
- `bom_id` (UUID, FK, NOT NULL)
- `label_id` (UUID, FK)
- `compliance_type` - 'state_registration', 'organic_cert', 'omri', 'epa', 'wsda', 'cdfa', 'custom'
- `category` - 'fertilizer', 'pesticide', 'soil_amendment'
- `issuing_authority`, `state_code`, `state_name` - Authority info
- `registration_number` (NOT NULL), `license_number` - Registration IDs
- `registered_date`, `effective_date`, `expiration_date`, `renewal_date` - Critical dates
- `status` - 'current', 'due_soon', 'urgent', 'expired', 'pending', 'suspended', 'cancelled'
- `days_until_expiration` (INTEGER) - Auto-calculated
- `registration_fee`, `renewal_fee`, `late_fee`, `payment_status` - Financial tracking
- `certificate_url`, `additional_documents` (JSONB) - Document storage
- `due_soon_alert_sent`, `urgent_alert_sent`, `expiration_alert_sent` - Alert tracking
- `alert_email_addresses` (TEXT[]) - Notification recipients
- `requirements`, `restrictions`, `conditions` (JSONB) - Compliance rules
- `assigned_to`, `priority` - Task management
- `last_verified_at`, `last_verified_by` - Verification tracking

**Indexes** (13 total):
- B-tree: bom_id, label_id, compliance_type, status, state_code, expiration_date, renewal_date, registration_number, assigned_to, priority, created_at
- GIN: conditions, additional_documents
- Composite: (status, expiration_date) for expiring-soon queries

**Functions**:
- `get_compliance_by_bom(p_bom_id UUID)` - Get all compliance records for a BOM
- `get_compliance_by_state(p_state_code TEXT)` - Get records for a specific state
- `get_upcoming_renewals(p_days_ahead INTEGER)` - **Used in labelDataService.ts:386**
- `get_expired_compliance()` - Get all expired registrations
- `calculate_compliance_status(p_bom_id UUID)` - Calculate overall compliance status

**RLS Policies**:
- SELECT: All authenticated users
- INSERT: Users can insert with their own user ID
- UPDATE: All authenticated users (for collaborative compliance management)
- DELETE: Creator or assigned user only

**Triggers**:
- Auto-update `updated_at` on changes
- Auto-calculate `days_until_expiration` and `status` daily

---

### 4. Enhanced `boms` Table (Migration 007)

**Purpose**: Add compliance tracking and foreign key relationships to existing BOMs

**New Columns** (6 total):
- `primary_label_id` (UUID, FK) - Links to primary label file
- `primary_data_sheet_id` (UUID, FK) - Links to latest published data sheet
- `compliance_status` - 'compliant', 'due_soon', 'urgent', 'non_compliant', 'unknown'
- `total_state_registrations` (INTEGER) - Count of registrations
- `expiring_registrations_count` (INTEGER) - Count expiring within 90 days
- `compliance_last_checked` (TIMESTAMPTZ) - Last compliance check timestamp

**Foreign Keys Added**:
- labels → boms (bom_id)
- labels → users (uploaded_by, verified_by, approved_by)
- product_data_sheets → boms (bom_id)
- product_data_sheets → labels (label_id)
- product_data_sheets → users (created_by, last_edited_by, approved_by)
- compliance_records → boms (bom_id)
- compliance_records → labels (label_id)
- compliance_records → users (created_by, assigned_to, last_verified_by)

**Functions**:
- `update_bom_compliance_summary(p_bom_id UUID)` - Update compliance fields for one BOM
- `update_all_boms_compliance()` - Batch update all BOMs (for scheduled jobs)

**Triggers**:
- Auto-update BOM compliance summary when compliance_records change

**Views**:
- `boms_with_compliance` - BOMs joined with primary label and data sheet
- `compliance_dashboard` - Aggregate compliance stats across all products

---

## 🔍 Detailed Schema Diagrams

### Entity Relationships

```
┌─────────────┐
│    boms     │◄──────────┐
│             │           │
│ • primary_  │           │
│   label_id  │──┐        │
│ • primary_  │  │        │
│   data_     │  │        │
│   sheet_id  │  │        │
│ • compliance│  │        │
│   _status   │  │        │
└─────────────┘  │        │
       ▲         │        │
       │         │        │
       │         │        │
┌──────┴──────┐  │  ┌─────┴──────────────┐
│   labels    │◄─┘  │ product_data_sheets│
│             │     │                    │
│ • bom_id    │     │ • bom_id           │
│ • extracted_│     │ • label_id         │
│   data      │     │ • content (JSONB)  │
│ • verified  │     │ • pdf_url          │
└─────────────┘     └────────────────────┘
       ▲                     ▲
       │                     │
       │                     │
┌──────┴────────────┐        │
│ compliance_records│        │
│                   │        │
│ • bom_id          │────────┘
│ • label_id        │
│ • expiration_date │
│ • status          │
└───────────────────┘
```

### Data Flow

```
1. Upload Label
   ↓
2. AI Scans Label → extracted_data (JSONB)
   ↓
3. Compare with BOM → ingredient_comparison (JSONB)
   ↓
4. User Verifies → verified = true
   ↓
5. AI Generates Data Sheet → product_data_sheets.content (JSONB)
   ↓
6. Generate PDF → pdf_url
   ↓
7. Track Compliance → compliance_records
   ↓
8. Auto-Update BOM → compliance_status, expiring_count
```

---

## ⚙️ Configuration After Migration

### 1. Supabase Storage Bucket Setup

Create storage bucket for PDFs and labels:

```sql
-- Run in Supabase SQL Editor

-- Create bucket for product documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-documents', 'product-documents', true);

-- Set up RLS policies for storage
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-documents');

CREATE POLICY "Public can view"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-documents');
```

### 2. Setup Scheduled Jobs (Optional)

For automatic compliance checking and renewals:

```sql
-- Run daily to update compliance statuses
SELECT cron.schedule(
  'update-compliance-daily',
  '0 2 * * *',  -- 2 AM daily
  $$SELECT update_all_boms_compliance();$$
);

-- Run weekly to send renewal alerts
SELECT cron.schedule(
  'send-renewal-alerts',
  '0 8 * * 1',  -- 8 AM every Monday
  $$SELECT send_upcoming_renewal_alerts();$$
);
```

### 3. Environment Variables

Add to your `.env.local`:

```bash
# Supabase (already configured)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Feature flags to enable new features
VITE_ENABLE_LABEL_SCANNING=1
VITE_ENABLE_PDF_GENERATION=1
VITE_ENABLE_COMPLIANCE=1
```

---

## 🧪 Testing After Migration

### Test 1: Verify Tables Exist

```sql
-- Run in Supabase SQL Editor
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('labels', 'product_data_sheets', 'compliance_records')
ORDER BY table_name;

-- Expected: 3 rows
```

### Test 2: Verify Foreign Keys

```sql
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('labels', 'product_data_sheets', 'compliance_records', 'boms')
ORDER BY tc.table_name;

-- Expected: 14 foreign keys
```

### Test 3: Verify Functions Exist

```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE '%label%' OR routine_name LIKE '%compliance%' OR routine_name LIKE '%data_sheet%'
ORDER BY routine_name;

-- Expected: 15+ functions
```

### Test 4: Verify RLS Policies

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename IN ('labels', 'product_data_sheets', 'compliance_records')
ORDER BY tablename, policyname;

-- Expected: 12+ policies
```

### Test 5: Insert Sample Data

```sql
-- Test labels table
INSERT INTO labels (file_name, file_url, scan_status)
VALUES ('test-label.png', 'https://example.com/test.png', 'pending')
RETURNING id;

-- Test product_data_sheets table
INSERT INTO product_data_sheets (bom_id, document_type, title, content)
SELECT
  id,
  'sds',
  'Test SDS',
  '{"productName": "Test Product"}'::jsonb
FROM boms
LIMIT 1
RETURNING id;

-- Test compliance_records table
INSERT INTO compliance_records (bom_id, compliance_type, registration_number)
SELECT
  id,
  'state_registration',
  'TEST-12345'
FROM boms
LIMIT 1
RETURNING id;

-- Clean up
DELETE FROM labels WHERE file_name = 'test-label.png';
DELETE FROM product_data_sheets WHERE title = 'Test SDS';
DELETE FROM compliance_records WHERE registration_number = 'TEST-12345';
```

---

## 🐛 Troubleshooting

### Issue: Migration fails with "table already exists"

**Cause**: Migrations 004-007 OR migration 008 was already run

**Solution**:
```bash
# Check migration history
npx supabase migration list

# If migrations show as applied, skip to regenerating types
npx supabase gen types typescript --project-id your-project-ref > types/database.ts
```

### Issue: Foreign key constraint fails

**Cause**: `boms` or `users` table doesn't exist

**Solution**:
```bash
# Run migrations 001-003 first
npx supabase db push

# Then run 004-007
```

### Issue: RLS policy blocks inserts

**Cause**: Not authenticated or user ID mismatch

**Solution**:
```sql
-- Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('labels', 'product_data_sheets', 'compliance_records');

-- Disable RLS temporarily for testing (NOT recommended for production)
ALTER TABLE labels DISABLE ROW LEVEL SECURITY;
```

### Issue: TypeScript errors still present after migration

**Cause**: TypeScript types not regenerated

**Solution**:
```bash
# Regenerate types
npx supabase gen types typescript --project-id your-project-ref > types/database.ts

# Restart TypeScript server in VS Code
# Command Palette → TypeScript: Restart TS Server

# Verify errors gone
npx tsc --noEmit
```

---

## 📚 Additional Resources

### Migration Files

- **004_create_labels_table.sql** (268 lines)
  - Tables: labels
  - Functions: get_labels_by_bom, search_labels_by_barcode
  - Triggers: update_labels_updated_at

- **005_create_product_data_sheets_table.sql** (383 lines)
  - Tables: product_data_sheets
  - Functions: get_data_sheets_by_bom, get_latest_published_sds, get_data_sheet_versions, publish_data_sheet
  - Triggers: update_pds_updated_at (auto-increments edit_count)

- **006_create_compliance_records_table.sql** (371 lines)
  - Tables: compliance_records
  - Functions: get_compliance_by_bom, get_compliance_by_state, get_upcoming_renewals, get_expired_compliance, calculate_compliance_status
  - Triggers: update_compliance_updated_at, calculate_days_until_expiration

- **007_enhance_boms_table.sql** (281 lines)
  - Columns: primary_label_id, primary_data_sheet_id, compliance_status, total_state_registrations, expiring_registrations_count, compliance_last_checked
  - Functions: update_bom_compliance_summary, update_all_boms_compliance
  - Views: boms_with_compliance, compliance_dashboard
  - Triggers: trigger_compliance_update_bom

- **008_deploy_all_product_data_system.sql** (452 lines)
  - All-in-one migration (combines 004-007)
  - Use this OR 004-007, not both

### Related Documentation

- `TESTING_PLAN.md` - Full testing checklist for all features
- `PRODUCT_DATA_SYSTEM_PLAN.md` - Original architecture document
- `types/database.ts` - Auto-generated TypeScript types (after migration)

---

## ✅ Success Checklist

After running migrations, you should have:

- [x] 3 new tables: labels, product_data_sheets, compliance_records
- [x] 6 new columns on boms table
- [x] 15+ database functions
- [x] 12+ RLS policies
- [x] 5+ triggers for automation
- [x] 2 dashboard views
- [x] 30+ indexes for performance
- [x] 14 foreign key constraints
- [x] 0 TypeScript errors (down from 6)
- [x] Updated `types/database.ts` file

---

## 🎯 Next Steps After Migration

1. **Test Label Scanning**
   - Navigate to Label Scanner page
   - Upload a test label image
   - Verify AI extraction works

2. **Test Product Data Sheet Generator**
   - Open BOM detail modal
   - Go to "Data Sheets" tab
   - Generate a test SDS

3. **Test Compliance Tracking**
   - Add a state registration to a BOM
   - Set expiration date 30 days out
   - Verify appears in compliance dashboard

4. **Enable Production Features**
   - Install jsPDF: `npm install jspdf jspdf-autotable`
   - Set up Supabase storage bucket
   - Configure scheduled jobs for compliance checks

---

**Migration Author**: TGF MRP Team
**Last Updated**: 2025-11-07
**Version**: 1.0.0
