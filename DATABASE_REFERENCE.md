# TGF-MRP Database Quick Reference

## 📋 Table Reference

### Core Tables

```sql
-- Users (RBAC)
users (id, email, name, role, department)
  Roles: Admin | Manager | Staff
  Departments: Production | Purchasing | Quality | Warehouse | Management

-- Vendors
vendors (id, name, contact_emails[], lead_time_days)

-- Inventory
inventory_items (sku, name, category, stock, on_order, reorder_point, moq, vendor_id)

-- Bill of Materials
boms (id, finished_sku, name, components::jsonb, artwork::jsonb, packaging::jsonb)

-- Purchase Orders
purchase_orders (id, po_number, vendor_id, status, items::jsonb, subtotal, tax_amount, total_amount)
  Status: Pending → Submitted → Fulfilled | Cancelled

-- Requisitions
requisitions (id, requisition_number, requester_id, status, items::jsonb, approved_by)
  Status: Pending → Approved → Processed | Rejected

-- Build Orders
build_orders (id, build_number, bom_id, finished_sku, quantity, status, assigned_to)
  Status: Planned → In Progress → Completed | Cancelled

-- Artwork Folders
artwork_folders (id, name, description)
```

---

## 🔒 Security Quick Reference

### Role Permissions

| Action | Admin | Manager | Staff |
|--------|-------|---------|-------|
| View users | ✅ All | ✅ All | ❌ Own only |
| Manage vendors | ✅ | ✅ | ❌ View only |
| Update inventory | ✅ | ✅ | ⚠️ Dept only |
| Create PO | ✅ | ⚠️ Purchasing | ❌ |
| Approve requisition | ✅ | ✅ | ❌ |
| Complete build | ✅ | ✅ | ⚠️ Assigned |

---

## ⚙️ Function Reference

### Business Logic Functions

```sql
-- Create Purchase Order
SELECT create_purchase_order(
  p_vendor_id := 'uuid',
  p_items := '[{"sku": "RAW-001", "quantity": 100, "price": 10.50}]'::jsonb,
  p_requisition_ids := ARRAY['uuid1', 'uuid2']::uuid[],
  p_expected_delivery_date := '2025-11-15',
  p_notes := 'Urgent order'
);

-- Complete Build Order (atomic inventory transaction)
SELECT complete_build_order(
  p_build_order_id := 'build-order-uuid'
);

-- Fulfill Purchase Order (receive inventory)
SELECT fulfill_purchase_order(
  p_po_id := 'po-uuid',
  p_actual_delivery_date := CURRENT_DATE
);

-- Calculate Buildability
SELECT calculate_buildability('WIDGET-A');

-- Generate PO from Requisitions
SELECT generate_po_from_requisitions(
  p_vendor_id := 'vendor-uuid',
  p_requisition_ids := ARRAY['req1', 'req2']::uuid[]
);
```

### Audit Functions

```sql
-- Get audit history for a record
SELECT * FROM get_audit_history('inventory_items', 'item-uuid');

-- Get user activity log
SELECT * FROM get_user_activity('user-uuid', 50);

-- Cleanup old audit logs (365 days default)
SELECT cleanup_old_audit_logs(365);
```

### Status Transitions

```sql
-- Get valid next statuses
SELECT * FROM get_valid_next_statuses('purchase_order', 'Pending');
-- Returns: to_status, requires_role
```

---

## 🔍 Common Queries

### Inventory Management

```sql
-- Items below reorder point
SELECT sku, name, stock, reorder_point
FROM inventory_items
WHERE stock <= reorder_point
AND is_deleted = FALSE
ORDER BY (reorder_point - stock) DESC;

-- Stock value by category
SELECT category, SUM(stock * unit_price) as total_value
FROM inventory_items
WHERE is_deleted = FALSE
GROUP BY category;

-- Items with pending orders
SELECT i.sku, i.name, i.on_order, v.name as vendor
FROM inventory_items i
JOIN vendors v ON i.vendor_id = v.id
WHERE i.on_order > 0 AND i.is_deleted = FALSE;
```

### Purchase Orders

```sql
-- Pending POs by vendor
SELECT po.po_number, v.name, po.total_amount, po.created_at
FROM purchase_orders po
JOIN vendors v ON po.vendor_id = v.id
WHERE po.status = 'Pending'
AND po.is_deleted = FALSE
ORDER BY po.created_at DESC;

-- PO fulfillment rate
SELECT 
  vendor_id,
  COUNT(*) as total_pos,
  COUNT(*) FILTER (WHERE status = 'Fulfilled') as fulfilled,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'Fulfilled') / COUNT(*), 2) as fulfillment_rate
FROM purchase_orders
WHERE is_deleted = FALSE
GROUP BY vendor_id;
```

### Build Orders

```sql
-- Active build orders
SELECT bo.build_number, bo.finished_sku, bo.quantity, 
       bo.status, u.name as assigned_to
FROM build_orders bo
LEFT JOIN users u ON bo.assigned_to = u.id
WHERE bo.status IN ('Planned', 'In Progress')
AND bo.is_deleted = FALSE
ORDER BY bo.scheduled_date;

-- Production output by product
SELECT finished_sku, SUM(quantity) as total_produced
FROM build_orders
WHERE status = 'Completed'
AND completed_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY finished_sku
ORDER BY total_produced DESC;
```

### Requisitions

```sql
-- Pending approvals by department
SELECT department, COUNT(*) as pending_count
FROM requisitions
WHERE status = 'Pending'
AND is_deleted = FALSE
GROUP BY department;

-- User's requisition history
SELECT requisition_number, status, created_at, approved_at
FROM requisitions
WHERE requester_id = auth.uid()
ORDER BY created_at DESC
LIMIT 20;
```

---

## 🚨 Important Constraints

### Data Validation

```sql
-- Prices and quantities must be non-negative
inventory_items.stock >= 0
inventory_items.on_order >= 0
inventory_items.unit_price >= 0
inventory_items.moq > 0

-- Financial totals must match
purchase_orders.total_amount = subtotal + tax_amount + shipping_cost

-- Build orders must have positive quantity
build_orders.quantity > 0
```

### JSONB Structures

```sql
-- BOM Components
{
  "sku": "RAW-001",
  "quantity": 2
}

-- Artwork Files
{
  "id": "uuid",
  "fileName": "label.pdf",
  "revision": 1,
  "url": "https://...",
  "folderId": "uuid"
}

-- PO Items
{
  "sku": "RAW-001",
  "quantity": 100,
  "price": 10.50,
  "lineTotal": 1050.00
}
```

---

## 🔧 Maintenance

### Backup

```sql
-- Export schema
pg_dump -h your-db.supabase.co -U postgres -d postgres --schema-only > schema.sql

-- Export data
pg_dump -h your-db.supabase.co -U postgres -d postgres --data-only > data.sql
```

### Performance

```sql
-- Analyze query performance
EXPLAIN ANALYZE
SELECT * FROM inventory_items WHERE category = 'Raw Materials';

-- Rebuild indexes (if needed)
REINDEX TABLE inventory_items;

-- Vacuum (clean up dead rows)
VACUUM ANALYZE inventory_items;
```

### Audit Log Cleanup

```sql
-- Delete logs older than 1 year
SELECT cleanup_old_audit_logs(365);

-- View audit log size
SELECT 
  pg_size_pretty(pg_total_relation_size('audit_logs')) as total_size,
  COUNT(*) as row_count
FROM audit_logs;
```

---

## 📊 Monitoring Queries

```sql
-- Table sizes
SELECT 
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Row counts
SELECT 
  'users' as table_name, COUNT(*) as rows FROM users WHERE is_deleted = FALSE
UNION ALL
SELECT 'inventory_items', COUNT(*) FROM inventory_items WHERE is_deleted = FALSE
UNION ALL
SELECT 'vendors', COUNT(*) FROM vendors WHERE is_deleted = FALSE
UNION ALL
SELECT 'purchase_orders', COUNT(*) FROM purchase_orders WHERE is_deleted = FALSE
UNION ALL
SELECT 'requisitions', COUNT(*) FROM requisitions WHERE is_deleted = FALSE
UNION ALL
SELECT 'build_orders', COUNT(*) FROM build_orders WHERE is_deleted = FALSE;

-- Recent audit activity
SELECT 
  table_name,
  action,
  COUNT(*) as count
FROM audit_logs
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY table_name, action
ORDER BY count DESC;
```

---

## 🎯 Quick Setup Commands

```bash
# Install Supabase CLI
npm install -g supabase

# Start local Supabase
supabase start

# Create migration
supabase migration new your_migration_name

# Apply migrations
supabase db push

# Generate TypeScript types
supabase gen types typescript --local > types/supabase.ts

# Reset database (CAUTION: deletes all data)
supabase db reset

# Stop local Supabase
supabase stop
```

---

**Database Version:** 1.0  
**Last Updated:** October 28, 2025  
**Migration Files:** 5
