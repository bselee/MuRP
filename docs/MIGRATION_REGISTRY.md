# Migration Registry

This file tracks all database migrations in sequential order, documenting their purpose, dependencies, and impact.

## Migration Numbering Rules
- **Format**: `XXX_descriptive_name.sql` (e.g., `001_initial_schema.sql`)
- **Sequential**: No gaps allowed (001, 002, 003... not 001, 003, 005)
- **Descriptive**: Name should clearly indicate what the migration does
- **No Timestamps**: Use sequential numbers, not timestamps

## Migration History

### 001_initial_schema.sql
- **Date**: 2024-XX-XX
- **Purpose**: Initial database schema setup
- **Tables Created**: users, organizations, basic RLS policies
- **Dependencies**: None
- **Impact**: Core authentication and organization structure

### 002_inventory_tables.sql
- **Date**: 2024-XX-XX
- **Purpose**: Inventory management tables
- **Tables Created**: inventory_items, inventory_categories, stock_levels
- **Dependencies**: 001_initial_schema.sql
- **Impact**: Basic inventory tracking functionality

### 003_vendor_management.sql
- **Date**: 2024-XX-XX
- **Purpose**: Vendor and supplier management
- **Tables Created**: vendors, vendor_contacts, vendor_ratings
- **Dependencies**: 001_initial_schema.sql
- **Impact**: Vendor relationship management

### 004_purchase_orders.sql
- **Date**: 2024-XX-XX
- **Purpose**: Purchase order workflow
- **Tables Created**: purchase_orders, po_line_items, po_approvals
- **Dependencies**: 002_inventory_tables.sql, 003_vendor_management.sql
- **Impact**: Complete PO lifecycle management

### 005_compliance_tracking.sql
- **Date**: 2024-XX-XX
- **Purpose**: Regulatory compliance tracking
- **Tables Created**: compliance_requirements, compliance_checks, audit_logs
- **Dependencies**: 001_initial_schema.sql
- **Impact**: State regulatory compliance monitoring

### 006_bom_management.sql
- **Date**: 2024-XX-XX
- **Purpose**: Bill of Materials management
- **Tables Created**: boms, bom_components, bom_versions
- **Dependencies**: 002_inventory_tables.sql
- **Impact**: Product structure and costing

### 007_ai_gateway_tables.sql
- **Date**: 2024-XX-XX
- **Purpose**: AI service integration tables
- **Tables Created**: ai_requests, ai_responses, usage_tracking
- **Dependencies**: 001_initial_schema.sql
- **Impact**: AI-powered features and analytics

### 008_external_integrations.sql
- **Date**: 2024-XX-XX
- **Purpose**: External API integrations
- **Tables Created**: api_connections, sync_logs, external_data_cache
- **Dependencies**: 001_initial_schema.sql
- **Impact**: Finale, Google Sheets, and other external integrations

### 009_user_permissions.sql
- **Date**: 2024-XX-XX
- **Purpose**: Granular user permissions system
- **Tables Created**: user_permissions, role_permissions, permission_audit
- **Dependencies**: 001_initial_schema.sql
- **Impact**: Advanced access control and security

### 010_workflow_automation.sql
- **Date**: 2024-XX-XX
- **Purpose**: Workflow automation tables
- **Tables Created**: workflows, workflow_steps, automation_rules
- **Dependencies**: 004_purchase_orders.sql, 006_bom_management.sql
- **Impact**: Automated business processes

### 011_notification_system.sql
- **Date**: 2024-XX-XX
- **Purpose**: Notification and alert system
- **Tables Created**: notifications, notification_templates, user_preferences
- **Dependencies**: 001_initial_schema.sql
- **Impact**: User notifications and alerts

### 012_reporting_analytics.sql
- **Date**: 2024-XX-XX
- **Purpose**: Reporting and analytics tables
- **Tables Created**: reports, report_schedules, analytics_cache
- **Dependencies**: Multiple tables from previous migrations
- **Impact**: Business intelligence and reporting

### 013_document_management.sql
- **Date**: 2024-XX-XX
- **Purpose**: Document storage and management
- **Tables Created**: documents, document_versions, document_permissions
- **Dependencies**: 001_initial_schema.sql
- **Impact**: File storage and version control

### 014_quality_control.sql
- **Date**: 2024-XX-XX
- **Purpose**: Quality control and testing
- **Tables Created**: qc_tests, qc_results, quality_standards
- **Dependencies**: 002_inventory_tables.sql
- **Impact**: Product quality assurance

### 015_maintenance_tracking.sql
- **Date**: 2024-XX-XX
- **Purpose**: Equipment maintenance tracking
- **Tables Created**: equipment, maintenance_schedules, maintenance_logs
- **Dependencies**: 001_initial_schema.sql
- **Impact**: Equipment lifecycle management

### 016_financial_integration.sql
- **Date**: 2024-XX-XX
- **Purpose**: Financial data integration
- **Tables Created**: financial_transactions, budgets, cost_centers
- **Dependencies**: 004_purchase_orders.sql
- **Impact**: Financial reporting and budgeting

### 017_sop_repository_tables.sql
- **Date**: 2024-XX-XX
- **Purpose**: SOP repository with department/role categorization
- **Tables Created**: sop_repository, sop_departments, sop_roles, sop_templates
- **Dependencies**: 001_initial_schema.sql
- **Impact**: Standardized operating procedures management

### 064_sop_workflow_system.sql
- **Date**: 2024-11-28
- **Purpose**: SOP approval and workflow system with interdepartmental notifications
- **Tables Created**: sop_submissions, sop_approvals, sop_reviews, department_notifications, sop_change_history
- **Dependencies**: 017_sop_repository_tables.sql, 011_notification_system.sql
- **Impact**: Enables collaborative SOP creation, approval workflows, and interdepartmental coordination

### 019_sop_workflow_system.sql
- **Date**: 2024-XX-XX
- **Purpose**: SOP approval and workflow system
- **Tables Created**: sop_submissions, sop_approvals, sop_reviews, department_notifications
- **Dependencies**: 017_sop_repository_tables.sql, 011_notification_system.sql
- **Impact**: Collaborative SOP creation and approval workflows

### 020_advanced_analytics.sql
- **Date**: 2024-XX-XX
- **Purpose**: Advanced analytics and AI insights
- **Tables Created**: analytics_models, prediction_results, ai_insights
- **Dependencies**: 007_ai_gateway_tables.sql, 012_reporting_analytics.sql
- **Impact**: Predictive analytics and business intelligence

## Migration Validation Script

Run this script before deployment to validate migration sequencing:

```bash
#!/bin/bash
# validate_migrations.sh

echo "🔍 Validating migration sequence..."

# Get all migration files
migrations=$(ls supabase/migrations/*.sql | sort)

# Check for sequential numbering
expected_num=1
for migration in $migrations; do
    filename=$(basename "$migration")
    actual_num=$(echo "$filename" | cut -d'_' -f1 | sed 's/^0*//')
    
    if [ "$actual_num" -ne "$expected_num" ]; then
        echo "❌ Migration sequence broken!"
        echo "Expected: $expected_num, Found: $actual_num in $filename"
        exit 1
    fi
    
    expected_num=$((expected_num + 1))
done

echo "✅ All migrations follow sequential numbering"
echo "📊 Total migrations: $((expected_num - 1))"
```

## Adding New Migrations

1. **Check the next number**:
   ```bash
   ls supabase/migrations/ | sort | tail -1
   # Output: 020_advanced_analytics.sql
   # Next number: 021
   ```

2. **Create migration**:
   ```bash
   supabase migration new descriptive_name
   # This creates: supabase/migrations/[timestamp]_descriptive_name.sql
   ```

3. **Rename to sequential**:
   ```bash
   mv supabase/migrations/[timestamp]_descriptive_name.sql supabase/migrations/021_descriptive_name.sql
   ```

4. **Update this registry**:
   - Add new entry with date, purpose, tables created, dependencies, impact
   - Update validation script if needed

5. **Test migration**:
   ```bash
   supabase db reset  # Local testing
   supabase db lint   # Syntax check
   npm test           # Full test suite
   ```

## Migration Dependencies Graph

```
001_initial_schema.sql
├── 002_inventory_tables.sql
│   ├── 004_purchase_orders.sql
│   │   ├── 010_workflow_automation.sql
│   │   └── 016_financial_integration.sql
│   ├── 006_bom_management.sql
│   └── 014_quality_control.sql
├── 003_vendor_management.sql
│   └── 004_purchase_orders.sql
├── 005_compliance_tracking.sql
├── 007_ai_gateway_tables.sql
│   └── 020_advanced_analytics.sql
├── 008_external_integrations.sql
├── 009_user_permissions.sql
├── 011_notification_system.sql
│   └── 064_sop_workflow_system.sql
├── 012_reporting_analytics.sql
│   └── 020_advanced_analytics.sql
├── 013_document_management.sql
├── 015_maintenance_tracking.sql
└── 017_sop_repository_tables.sql
    ├── 063_sop_template_system.sql
    └── 064_sop_workflow_system.sql
```

## Emergency Rollback Procedures

If a migration needs to be rolled back:

1. **Identify the migration number** to rollback to
2. **Create a new migration** that undoes the changes
3. **Test rollback locally** first
4. **Document the rollback** in this registry
5. **Apply rollback** to production with caution

Example rollback migration:
```sql
-- 021_rollback_feature_x.sql
-- Undoes changes from 020_feature_x.sql

DROP TABLE IF EXISTS new_table;
ALTER TABLE existing_table DROP COLUMN new_column;
-- ... additional rollback statements
```