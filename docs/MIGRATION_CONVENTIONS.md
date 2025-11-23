# Migration Numbering & Workflow

Keeping Supabase migrations in lockstep is critical when multiple people ship schema changes. MuRP follows a **strict, three-digit numbering scheme** that all contributors must respect.

## Numbering Rules

1. **Three-digit prefix**: every file in `supabase/migrations` starts with `NNN_`. Example: `031_po_email_tracking.sql`.
2. **No gaps / rewrites**: once a number is committed it can never be reused or deleted. Create a follow-up migration instead of editing history.
3. **Monotonic**: new migrations always use the next number after the current highest. (see How-To below)

## How to Create a Migration

```bash
# 1. Inspect the highest existing number
ls supabase/migrations | sort

# 2. Use the Supabase CLI to scaffold your change
supabase migration new add_job_templates

# 3. Rename the generated file to match the numbering scheme.
#    If the highest number was 037, rename to:
mv supabase/migrations/<timestamp>_add_job_templates.sql supabase/migrations/038_add_job_templates.sql
```

### Writing & Verifying

1. Put **all** schema changes in the new file. Do not split a single logical change across multiple numbers.
2. Run locally:
   ```bash
   supabase db reset     # optional, to rebuild local schema
   supabase db lint      # sanity check
   ```
3. Update docs / release notes so the new number is referenced (e.g., `docs/SESSION_SUMMARY...`).

### During Review

- Reviewers will reject migrations that skip numbers or edit older files.
- If two branches pick the same number, the second branch must rebase and bump to the next number before merge.

## Why this Matters

- **Deterministic deploys**: Supabase applies migrations in filename order. Numbered prefixes ensure identical order in every environment.
- **Conflict avoidance**: predictable numbering avoids timestamp collisions and makes code reviews easier.
- **Audit trail**: ops can reference migration IDs when diagnosing issues (`030_po_tracking.sql`, etc.).

## Related Guides

- [`SUPABASE_DEPLOYMENT_GUIDE.md`](../SUPABASE_DEPLOYMENT_GUIDE.md) – applying migrations to environments.
- [`README.md`](../README.md#database--supabase) – overview of key migrations in the repo.

Please keep this document handy whenever you scaffold a new migration. A clean, sequential history is the foundation for smooth deployments. 🙌
