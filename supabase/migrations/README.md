# Database Migrations

This directory contains all database schema migrations for the TGF-MRP system.

## Migration Files

Apply migrations in order:

1. **`001_initial_schema.sql`** - Core database tables
   - Creates 8 main tables (users, vendors, inventory_items, boms, etc.)
   - Sets up sequences for auto-numbering
   - Adds audit fields to all tables
   - Creates performance indexes

2. **`002_row_level_security.sql`** - Security policies
   - Enables RLS on all tables
   - Implements role-based access control (RBAC)
   - Creates department-level filtering
   - Adds helper functions for security checks

3. **`003_audit_logging.sql`** - Change tracking
   - Creates audit_logs table
   - Implements automatic change tracking triggers
   - Adds audit query helper functions
   - Enables admin-only audit log access

4. **`004_status_transitions.sql`** - Workflow validation
   - Creates status transition tables
   - Implements validation triggers
   - Enforces role-based status changes
   - Auto-populates approval timestamps

5. **`005_stored_procedures.sql`** - Business logic
   - Creates PO creation function with inventory updates
   - Implements atomic build order completion
   - Adds buildability calculation
   - Enables PO fulfillment processing

## How to Apply Migrations

### Using Supabase CLI (Recommended)

```bash
# Apply all migrations to local database
supabase db reset

# Apply migrations to remote database
supabase db push
```

### Manual Application

```bash
# Connect to your database
psql -h your-db.supabase.co -U postgres -d postgres

# Apply each migration in order
\i 001_initial_schema.sql
\i 002_row_level_security.sql
\i 003_audit_logging.sql
\i 004_status_transitions.sql
\i 005_stored_procedures.sql
```

## Migration Guidelines

### Creating New Migrations

1. **Use sequential numbering:** `006_description.sql`, `007_description.sql`
2. **Include rollback commands** (if possible)
3. **Test locally first:** `supabase db reset`
4. **Document changes** in comments

### Example Migration Template

```sql
-- Migration: 006_add_feature.sql
-- Description: Brief description of changes
-- Created: YYYY-MM-DD

-- =============================================================================
-- MIGRATION START
-- =============================================================================

-- Your changes here

-- =============================================================================
-- ROLLBACK (optional)
-- =============================================================================
-- Instructions to undo this migration if needed
```

## Database Objects Created

After applying all migrations:

- **Tables:** 11 (8 core + 3 status transition tables)
- **Sequences:** 3 (po_number_seq, requisition_number_seq, build_number_seq)
- **Functions:** 10+ (stored procedures, helpers, validation)
- **Triggers:** 15+ (audit logging, status validation, updated_at)
- **Indexes:** 20+ (performance optimization)
- **RLS Policies:** 15+ (security enforcement)

## Troubleshooting

### Migration Fails

```bash
# Check current migration status
supabase migration list

# View database logs
supabase db logs

# Rollback and retry
supabase db reset
```

### Permission Errors

Ensure your database user has necessary permissions:

```sql
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
```

### RLS Blocking Operations

If RLS policies are too restrictive during testing:

```sql
-- Temporarily disable RLS (development only!)
ALTER TABLE table_name DISABLE ROW LEVEL SECURITY;

-- Re-enable when done
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
```

## Version Control

- All migrations are version controlled in Git
- Never modify existing migrations after they've been applied to production
- Create new migrations to alter existing schema
- Use descriptive commit messages

## Testing Migrations

Before pushing to production:

1. ✅ Apply locally: `supabase db reset`
2. ✅ Run test queries
3. ✅ Verify RLS policies work
4. ✅ Test stored procedures
5. ✅ Check audit logging
6. ✅ Validate status transitions
7. ✅ Generate TypeScript types: `supabase gen types typescript`

## Production Deployment

```bash
# 1. Backup production database
pg_dump -h prod-db.supabase.co -U postgres > backup.sql

# 2. Link to production project
supabase link --project-ref prod-project-ref

# 3. Push migrations
supabase db push

# 4. Verify changes
# Check Supabase Studio dashboard
```

## Support

For issues with migrations:
1. Check Supabase logs in dashboard
2. Review migration file for syntax errors
3. Verify all referenced tables/functions exist
4. Ensure proper user permissions

---

**Last Updated:** October 28, 2025  
**Schema Version:** 1.0  
**Total Migrations:** 5
