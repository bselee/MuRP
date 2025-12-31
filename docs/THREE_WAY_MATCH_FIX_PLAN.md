# Three-Way Match Fix Plan

**Created:** 2025-12-31
**Status:** Ready for Implementation

## Executive Summary

Critical analysis of the PO, Email, and Invoice document handling pipeline revealed **27 issues** - 5 critical failures that make the invoice pipeline non-functional, plus 22 high/medium severity issues causing data integrity risks.

**Bottom Line:** The invoice extraction and three-way match system is **completely broken in production** due to:

1. Cron jobs querying non-existent columns
2. Three-way match referencing tables that don't exist
3. Schema mismatches between services and migrations

---

## What is Three-Way Match?

A three-way match verifies vendor bills by comparing three documents before payment approval:

| Document | What It Represents | Our Source |
|----------|-------------------|------------|
| **Purchase Order (PO)** | What you agreed to buy | `finale_purchase_orders` + `finale_po_line_items` |
| **Receiving Doc (GRN)** | What you actually received | `po_receipt_events` (NEW) |
| **Vendor Invoice** | What vendor is charging | `vendor_invoice_documents` |

The wizard compares quantities, prices, and totals - flagging discrepancies for approval before posting to AP.

---

## Critical Issues Verified

### 1. Invoice Cron Uses Wrong Column Name

**File:** `supabase/migrations/152_invoice_processing_cron.sql` line 159

```sql
WHERE classification IN ('invoice', 'packing_slip')  -- WRONG!
```

**Correct column:** `attachment_type` (from Migration 144)

**Impact:** Invoice extraction runs every 10 minutes but processes ZERO invoices.

### 2. Three-Way Match References Non-Existent Tables

**File:** `supabase/functions/three-way-match-runner/index.ts`

- Line 248: `purchase_order_line_items` - doesn't exist (should be `finale_po_line_items`)
- Line 254: `vendor_invoices` - doesn't exist (should be `vendor_invoice_documents`)
- Line 262: `po_receipts` - never created in any migration

**Impact:** Three-way match runner crashes immediately on execution.

### 3. Regex Extraction Never Populates Line Items

**File:** `services/invoiceExtractionService.ts` line 274

```typescript
line_items: [],  // ALWAYS EMPTY for regex extraction
```

**Impact:** Without line items, three-way match cannot verify quantities. All invoices require manual review.

### 4. No Receipt Timestamp Tracking

Receipt data exists in `finale_po_line_items.quantity_received` but there's no timestamp of WHEN goods were received - critical for compliance auditing.

### 5. 30-Day Hardcoded Correlation Window

**File:** `email-inbox-poller/index.ts` lines 1026-1028

Emails from vendors with 45+ day lead times never correlate to their POs.

---

## Implementation Plan

### Phase 0: Create GRN (Goods Receipt) Table

Create `po_receipt_events` table to track receipt timestamps:

```sql
CREATE TABLE po_receipt_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finale_po_id UUID REFERENCES finale_purchase_orders(id),
  po_id UUID REFERENCES purchase_orders(id),
  sku VARCHAR(100),
  product_id UUID REFERENCES finale_products(id),
  quantity_received DECIMAL(12,4) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source VARCHAR(50) NOT NULL,  -- 'finale_sync', 'manual', 'email_detection', 'packing_slip'
  source_reference TEXT,
  condition VARCHAR(50),
  notes TEXT,
  recorded_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (finale_po_id IS NOT NULL OR po_id IS NOT NULL)
);
```

**Trigger:** Auto-log receipt events when `finale_po_line_items.quantity_received` changes.

### Phase 1: Critical Fixes (P0)

| File | Fix |
|------|-----|
| `supabase/migrations/153_grn_and_invoice_fixes.sql` | NEW - Create GRN table + fix invoice view column |
| `supabase/functions/three-way-match-runner/index.ts` | Fix 3 table references |

### Phase 2: High Priority (P1)

| File | Fix |
|------|-----|
| `supabase/migrations/154_fix_vendor_linkage.sql` | Deterministic ORDER BY in trigger |
| `supabase/functions/email-inbox-poller/index.ts` | Configurable correlation window |

### Phase 3: Medium Priority (P2)

| File | Fix |
|------|-----|
| `services/threeWayMatchService.ts` | Fix table references (frontend) |
| `services/invoiceExtractionService.ts` | Add line item regex extraction |

---

## Expected Outcome

**Before (Broken):**

- Invoice cron processes 0 invoices
- Three-way-match crashes on execution
- No receipt timestamps for auditing
- Slow vendor emails never correlate to POs

**After (Working):**

- Invoice extraction finds attachments correctly
- Three-way-match has all 3 documents: PO + Receipt + Invoice
- GRN events logged automatically with timestamps
- Receipt audit trail for compliance
- Configurable correlation window per vendor

---

## Verification Queries

After implementation, verify with:

```sql
-- Check if invoices are being processed
SELECT status, COUNT(*) FROM vendor_invoice_documents GROUP BY status;

-- Check cron job execution
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- Check PO-email correlation rate
SELECT
  COUNT(*) FILTER (WHERE finale_po_id IS NOT NULL) AS correlated,
  COUNT(*) AS total
FROM email_threads;

-- Check receipt events being logged
SELECT * FROM po_receipt_events ORDER BY received_at DESC LIMIT 20;
```

---

## Full Issue List

See the complete 27-issue analysis in the [original plan file](/home/codespace/.claude/plans/lovely-wiggling-lantern.md).

### High-Severity Issues (Data Corruption Risk)

6. Vendor linkage uses non-deterministic query (LIMIT without ORDER BY)
7. PO order ID substring match too loose (false correlations)
8. Gmail History ID 29-day expiration (mitigated with fallback)
9. OAuth tokens stored in plaintext
10. Hardcoded 30-day correlation window
11. Dual invoice tables create confusion
12. Auto-approval threshold unreachable (95% + missing line items)
13. Dropship detection patterns hardcoded
14. Facility IDs hardcoded
15. 24-month sync vs 18-month is_active mismatch

### Medium-Severity Issues

16-27: Race conditions, broad regex patterns, missing transactions, etc.

---

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) - Main codebase documentation
- [MIGRATION_CONVENTIONS.md](./MIGRATION_CONVENTIONS.md) - Migration numbering rules
- [CRITICAL_ARCHITECTURE.md](./CRITICAL_ARCHITECTURE.md) - System architecture
