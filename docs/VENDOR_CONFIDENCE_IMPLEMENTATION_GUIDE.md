# MuRP Vendor Intelligence & Communication Enhancement - Implementation Guide

**Document:** `docs/VENDOR_CONFIDENCE_IMPLEMENTATION_GUIDE.md`  
**Date:** November 28, 2025  
**Scope:** 7-Phase Vendor Communication System Enhancement

---

## 📋 Executive Summary

This guide documents a comprehensive upgrade to MuRP's vendor communication system, adding:
1. **Vendor Confidence Scoring** (0-10) - Track vendor reliability based on response patterns
2. **Intelligent Email Matching** - AI "detective work" for PO-email correlation  
3. **Tracking Visibility Dashboard** - Staff view of all shipment statuses
4. **Invoice Review Workflow** - Approval chain for vendor invoices
5. **In-Email AI Chat** - Polish responses with AI assistance
6. **PO Commitment System** - Lock PO parameters once sent
7. **Vendor Pricelist Management** - Store and archive vendor pricing

---

## 🏗️ Architecture Overview

### Current Foundation (Already Implemented)

| Component | Location | Status |
|-----------|----------|--------|
| Gmail Webhook | `supabase/functions/gmail-webhook/index.ts` | ✅ Production |
| Response Service | `services/vendorResponseService.ts` | ✅ Production |
| Response Workbench UI | `components/VendorResponseWorkbench.tsx` | ✅ Production |
| 12 Response Categories | Migration 052 | ✅ Deployed |
| Draft Generation | Template + AI | ✅ Working |
| Performance Metrics Table | Migration 026 | ✅ Exists |

### New Components (To Build)

| Component | Migration | Service | UI |
|-----------|-----------|---------|-----|
| Vendor Confidence Profiles | 053 | `vendorConfidenceService.ts` | `VendorConfidenceDashboard.tsx` |
| Multi-Signal Email Matching | 054 | Update gmail-webhook | - |
| Tracking Dashboard | 055 | `poTrackingDashboardService.ts` | `POTrackingStatusDashboard.tsx` |
| Invoice Review | 056 | `invoiceReviewService.ts` | `InvoiceReviewPanel.tsx` |
| Email Chat Editor | - | Update `vendorResponseService.ts` | `EmailEditorWithChat.tsx` |
| PO Commitment | 057 | `poCommitmentService.ts` | Update PO forms |
| Vendor Pricelists | 058 | `vendorPricelistService.ts` | `VendorPricelistPanel.tsx` |

---

## 📊 Phase 1: Vendor Confidence Scoring System

### 1.1 Database Schema (Migration 053)

**File:** `supabase/migrations/053_vendor_confidence_profiles.sql`

Create this migration with the following components:

#### Tables:
- `vendor_confidence_profiles` - Main scoring table with composite and factor scores
- `vendor_confidence_history` - Historical snapshots for trending
- `vendor_interaction_events` - Detailed event logging

#### Confidence Score Breakdown:
- **Response Latency Score** (20% weight): How quickly vendor responds
  - 0-4 hours = 10, 4-8 hours = 9, 8-24 hours = 7, 24-48 = 5, 48-72 = 3, >72 = 1

- **Threading Discipline Score** (15% weight): Do they stay in same thread?
  - 95%+ threaded = 10, 85%+ = 8, 70%+ = 6, 50%+ = 4, <50% = 2

- **Response Completeness Score** (20% weight): AI extraction confidence
  - Maps 0-1 confidence to 0-10 score

- **Invoice Accuracy Score** (25% weight): Do invoice amounts match PO?
  - 100% accurate = 10, 90% = 8, 70% = 6, 50% = 4, <50% = 2

- **Lead Time Adherence Score** (20% weight): On-time delivery rate
  - 95%+ on-time = 10, 85%+ = 8, 70%+ = 6, 50%+ = 4, <50% = 2

#### Enums:
- `vendor_confidence_trend`: improving, stable, declining
- `vendor_communication_status`: fully_automatic, automatic_with_review, needs_review, needs_full_review, suspended

#### Key Functions:
- `calculate_vendor_confidence_score()` - Weighted average of 5 factors
- `get_communication_status_from_score()` - Map score 0-10 to automation level
- `get_template_strictness_from_score()` - Map to template style (relaxed/standard/strict/maximum)
- Trigger: `recalculate_vendor_confidence()` - Auto-updates composite scores

#### Bootstrap:
- Create confidence profile for every existing vendor with default score of 5.0
- Add to `app_settings` with configuration (weights, min interactions, alert thresholds)

### 1.2 Service Layer

**File:** `services/vendorConfidenceService.ts` (~500 lines)

#### Exports:
```typescript
export async function getVendorConfidenceProfile(vendorId: string): Promise<VendorConfidenceProfile | null>
export async function getAllVendorConfidenceProfiles(options?: FilterOptions): Promise<VendorConfidenceProfile[]>
export async function recordInteractionEvent(event: VendorInteractionEvent): Promise<boolean>
export async function recalculateVendorScore(vendorId: string, triggerSource?: string): Promise<void>
export async function getResponseStrategyForVendor(vendorId: string): Promise<ResponseStrategy>
```

#### Key Calculations:
- `calculateResponseLatencyScore()` - From email timestamp gaps
- `calculateThreadingScore()` - From is_threaded flag in communications
- `calculateCompletenessScore()` - From AI extraction confidence values
- `calculateInvoiceAccuracyScore()` - From invoice variance % vs PO total
- `calculateLeadTimeScore()` - From delivery date vs promised date

#### Response Strategy Recommendations:
- Score 8-10: Relaxed templates, friendly tone, no special instructions
- Score 6-7.9: Standard templates, professional tone, remind of threading if needed
- Score 4-5.9: Strict templates, formal tone, explicit PO reference, require confirmation
- Score 2-3.9: Maximum templates, explicit instructions, threading reminder, confirmation required
- Score <2: Escalate to manager, high-risk vendor, all manual

### 1.3 UI Component

**File:** `components/VendorConfidenceDashboard.tsx` (~600 lines)

#### Features:
- **Confidence Gauge** - Circular gauge 0-10 with color coding (red → yellow → green)
- **Trend Arrow** - ⬆️ improving, → stable, ⬇️ declining (from score_30_days_ago)
- **6-Month Sparkline** - Mini chart from vendor_confidence_history table
- **Factor Breakdown** - Card for each of 5 factors with individual gauge
- **Recent Interactions** - List of 5 most recent events with timing data
- **Recommendations** - AI-generated suggestions in collapsible section
- **Alert Banner** - If score dropped >1 point, show red alert
- **Communications Status Badge** - Color-coded status (green = auto, yellow = review, red = suspended)

#### Data Sources:
- `vendor_confidence_profiles` - Main profile data
- `vendor_confidence_history` - For trend calculation and sparkline
- `vendor_interaction_events` - For recent interactions list

---

## 📧 Phase 2: Multi-Signal Email Matching

### 2.1 Matching Algorithm Priority

The current gmail-webhook uses single-signal matching. Upgrade to multi-signal with confidence thresholds:

| Priority | Signal | Confidence | Description |
|----------|--------|------------|-------------|
| 1 | Thread ID | 95% | Same Gmail thread as original PO email |
| 2 | Subject Line | 80% | Contains PO number pattern (PO-\d{3,6}) |
| 3 | Vendor + Recent Date | 75% | Same vendor, within expected lead time window |
| 4 | Content + SKU | 78% | Email body mentions SKU from recent open PO |
| 5 | Vendor Habits | 72% | Vendor's typical response pattern (e.g., always 2 days) |
| 6 | AI Analysis | 70-85% | Full content analysis for semantic correlation |
| 7 | Unmatched | 50% | Queue for manual review |

### 2.2 Implementation in Gmail Webhook

**File:** `supabase/functions/gmail-webhook/index.ts` - Update `resolvePurchaseOrder()` function

```typescript
async function resolvePurchaseOrder(
  senderEmail: string,
  subject: string,
  body: string,
  threadId: string | null,
  extractedData: any
): Promise<{ poId: string; confidence: number; matchMethod: string } | null> {
  
  // Signal 1: Thread ID match (highest confidence)
  if (threadId) {
    const threadMatch = await matchByThreadId(threadId);
    if (threadMatch) return { ...threadMatch, confidence: 0.95, matchMethod: 'thread_id' };
  }
  
  // Signal 2: Subject line PO number extraction
  const poNumberMatch = extractPONumberFromSubject(subject);
  if (poNumberMatch) {
    const subjectMatch = await matchByPONumber(poNumberMatch);
    if (subjectMatch) return { ...subjectMatch, confidence: 0.80, matchMethod: 'subject_po_number' };
  }
  
  // Signal 3: Vendor + Recent Date (use vendor's lead time ± 3 days)
  const vendorProfile = await getVendorConfidenceProfile(senderEmail);
  const lookbackWindow = (vendorProfile?.recommendedLeadTimeBufferDays || 7) + 3;
  const vendorMatch = await matchByVendorRecent(senderEmail, lookbackWindow);
  if (vendorMatch) return { ...vendorMatch, confidence: 0.75, matchMethod: 'vendor_recent' };
  
  // Signal 4: Content + SKU extraction
  if (extractedData?.items?.length > 0) {
    const skuMatch = await matchBySKUInContent(extractedData.items);
    if (skuMatch) return { ...skuMatch, confidence: 0.78, matchMethod: 'content_sku' };
  }
  
  // Signal 5: Vendor habit patterns
  const habitMatch = await matchByVendorHabits(senderEmail, body);
  if (habitMatch) return { ...habitMatch, confidence: 0.72, matchMethod: 'vendor_habit' };
  
  // Signal 6: AI content analysis (fallback)
  const aiMatch = await matchByAIAnalysis(senderEmail, subject, body);
  if (aiMatch && aiMatch.confidence >= 0.70) {
    return { ...aiMatch, matchMethod: 'ai_analysis' };
  }
  
  // No confident match - queue for manual review
  return null;
}
```

### 2.3 Helper Functions to Add

- `matchByThreadId(threadId)` - Query po_vendor_communications by gmail_thread_id
- `extractPONumberFromSubject(subject)` - Regex: /PO[#\-\s]?(\d{3,6})/i
- `matchByPONumber(poNumber)` - Query purchase_orders by order_id
- `matchByVendorRecent(email, days)` - Query open POs from vendor sent in last N days
- `matchBySKUInContent(items)` - Extract SKUs from body, cross-reference inventory
- `matchByVendorHabits(email, body)` - Use vendor_communication_profiles table to find pattern
- `matchByAIAnalysis(email, subject, body)` - Call Claude with PO context for semantic match

### 2.4 Create vendor_communication_profiles Table (Migration 054)

Track vendor-specific patterns:
- `average_response_delay_hours`
- `typical_response_pattern` (e.g., "always sends tracking 2 days after PO")
- `preferred_communication_times`
- `common_subjects_used`
- `email_signature_patterns`

This enables intelligent matching ("ABC Corp always sends tracking email 2 days after PO, body contains tracking number")

---

## 📦 Phase 3: PO Tracking Dashboard

### 3.1 Database View (Migration 055)

**File:** `supabase/migrations/055_po_tracking_dashboard.sql`

Create materialized view `po_tracking_dashboard_view`:

```sql
CREATE MATERIALIZED VIEW po_tracking_dashboard_view AS
SELECT 
  po.id AS po_id,
  po.order_id AS po_number,
  po.vendor_name,
  po.vendor_id,
  po.status AS po_status,
  po.order_date,
  po.expected_delivery_date,
  
  -- Latest tracking info from most recent shipment communication
  comm.tracking_number,
  comm.carrier,
  comm.tracking_status,
  comm.expected_delivery AS tracking_expected,
  comm.last_tracking_update,
  
  -- Calculated display status
  CASE 
    WHEN comm.tracking_status = 'delivered' THEN 'delivered'
    WHEN comm.tracking_status IN ('in_transit', 'out_for_delivery') THEN 'in_transit'
    WHEN comm.tracking_number IS NOT NULL THEN 'shipped'
    WHEN po.status = 'sent' THEN 'awaiting_shipment'
    ELSE 'draft'
  END AS display_status,
  
  -- Days tracking
  CASE 
    WHEN po.expected_delivery_date IS NOT NULL 
    THEN po.expected_delivery_date - CURRENT_DATE
    ELSE NULL
  END AS days_until_expected,
  
  -- Vendor reliability indicators
  vcp.confidence_score AS vendor_confidence,
  vcp.communication_status AS vendor_status
  
FROM purchase_orders po
LEFT JOIN LATERAL (
  SELECT 
    (extracted_data->>'trackingNumber') AS tracking_number,
    (extracted_data->>'carrier') AS carrier,
    (extracted_data->>'status') AS tracking_status,
    (extracted_data->>'expectedDelivery')::DATE AS expected_delivery,
    received_at AS last_tracking_update
  FROM po_vendor_communications
  WHERE po_id = po.id 
    AND response_category IN ('shipment_confirmation', 'delivery_update', 'delivery_exception')
    AND extracted_data->>'trackingNumber' IS NOT NULL
  ORDER BY received_at DESC
  LIMIT 1
) comm ON true
LEFT JOIN vendor_confidence_profiles vcp ON vcp.vendor_id = po.vendor_id
WHERE po.status NOT IN ('cancelled', 'draft')
ORDER BY po.expected_delivery_date ASC NULLS LAST;

-- Index for fast queries
CREATE UNIQUE INDEX idx_po_tracking_dashboard_po ON po_tracking_dashboard_view(po_id);
CREATE INDEX idx_po_tracking_dashboard_status ON po_tracking_dashboard_view(display_status);
CREATE INDEX idx_po_tracking_dashboard_vendor ON po_tracking_dashboard_view(vendor_id);
```

### 3.2 Service Layer

**File:** `services/poTrackingDashboardService.ts` (~250 lines)

```typescript
export async function getPOTrackingData(options?: {
  groupBy?: 'vendor' | 'status' | 'expected_date';
  filterStatus?: string;
  filterVendor?: string;
}): Promise<TrackingDataItem[]>

export async function getTrackingStats(): Promise<{
  totalOpen: number;
  awaiting_shipment: number;
  in_transit: number;
  delivered: number;
  overdue: number;
}>
```

### 3.3 UI Component

**File:** `components/POTrackingStatusDashboard.tsx` (~800 lines)

#### Features:
- **Group By Controls** - Tabs/dropdown for: Vendor | Status | Expected Date
- **Status Badges** - Color-coded: Draft (gray) → Awaiting (yellow) → Shipped (blue) → In Transit (cyan) → Delivered (green) → Overdue (red)
- **Expandable Rows** - Click to show: line items, vendor contact, PO notes, communication history
- **Tracking Number** - Clickable link to carrier tracking site (opens in new tab)
- **Days Counter** - Shows +/- days from expected delivery (red if overdue)
- **Vendor Confidence Badge** - Mini gauge showing vendor score
- **Quick Actions** - "View Communications", "Send Follow-up", "Escalate"
- **Role-Based Visibility** - Staff sees only their assigned vendors

#### Data Display:
- PO number (clickable → PO detail page)
- Vendor name (clickable → vendor profile)
- Expected delivery date
- Current status with last update timestamp
- Tracking number + carrier
- Days until/past due
- Vendor confidence score

#### Grouping Logic:
- **By Vendor**: Group rows by vendor_name, show vendor confidence score as group header
- **By Status**: Group rows by display_status, show count for each status
- **By Expected Date**: Group rows by week (this week, next week, overdue)

---

## 💰 Phase 4: Invoice Review Workflow

### 4.1 Database Schema (Migration 056)

**File:** `supabase/migrations/056_invoice_review_workflow.sql`

#### Enums:
```sql
CREATE TYPE invoice_review_status AS ENUM (
  'received',           -- Just received from vendor
  'under_review',       -- Awaiting approval
  'approved',           -- Passed review, ready for AP
  'disputed',           -- Issues found, negotiating
  'forwarded_to_ap',    -- Sent to accounts payable
  'paid'                -- Marked as paid
);
```

#### Table: vendor_invoices
- `vendor_id`, `po_id`, `communication_id` (foreign keys)
- `invoice_number`, `invoice_date`, `due_date`
- `subtotal`, `tax_amount`, `shipping_amount`, `total_amount`
- `po_total` (from PO), `variance_amount`, `variance_percentage`
- `line_items` (JSONB) - [{sku, description, po_qty, inv_qty, po_price, inv_price, variance}]
- `status` (enum)
- `auto_approved` (boolean)
- `reviewed_by`, `reviewed_at`, `review_notes`
- `forwarded_to_ap_at`, `ap_reference_number`
- Timestamps

#### Auto-Approval Rules (in migration):
1. Amount variance ≤ ±0.5%
2. All line items match (qty, SKU)
3. Vendor confidence score ≥ 8.0
4. If all true: set `auto_approved = true`, `status = 'approved'`

#### Indexes:
- `idx_vendor_invoices_vendor` - For vendor dashboard
- `idx_vendor_invoices_po` - For PO cross-reference
- `idx_vendor_invoices_status` - For approval queue
- `idx_vendor_invoices_date` - For date range queries

### 4.2 Service Layer

**File:** `services/invoiceReviewService.ts` (~400 lines)

```typescript
export async function processInvoice(invoice: InvoiceData): Promise<{
  autoApproved: boolean;
  requiresReview: boolean;
  issues: string[];
  recommendation: string;
}>

export async function getInvoiceReviewQueue(status?: string): Promise<Invoice[]>

export async function approveInvoice(invoiceId: string, reviewNotes?: string): Promise<boolean>

export async function forwardToAP(invoiceId: string, apRefNumber: string): Promise<boolean>
```

#### Auto-Approval Logic:
```typescript
function processInvoice(invoice): {
  const issues = [];
  
  // 1. Amount variance (±0.5% tolerance)
  const variance = Math.abs(invoice.totalAmount - invoice.poTotal) / invoice.poTotal;
  if (variance > 0.005) {
    issues.push(`Amount variance: ${(variance * 100).toFixed(2)}%`);
  }
  
  // 2. Line item verification
  const lineItemIssues = verifyLineItems(invoice.lineItems, invoice.poLineItems);
  issues.push(...lineItemIssues);
  
  // 3. Vendor confidence check
  const vendorProfile = await getVendorConfidenceProfile(invoice.vendorId);
  const vendorTrusted = vendorProfile?.communicationStatus === 'fully_automatic';
  
  // Auto-approve: no issues AND vendor trusted
  const autoApproved = issues.length === 0 && vendorTrusted;
  
  return { autoApproved, requiresReview: !autoApproved, issues };
}
```

### 4.3 UI Component

**File:** `components/InvoiceReviewPanel.tsx` (~600 lines)

#### Features:
- **Review Queue** - List of invoices needing action (status = under_review)
- **Invoice Detail Card** - Shows invoice number, date, amounts, variance
- **Line Item Comparison** - Table comparing PO items vs invoice items
- **Variance Highlights** - Red highlight for any mismatches (qty, price, SKU)
- **Auto-Approval Badge** - If auto-approved, show green "Auto-Approved" badge with vendor confidence score
- **Action Buttons** - "Approve & Forward to AP", "Dispute", "Request Correction"
- **Notes Editor** - Optional review notes before approval

---

## ✏️ Phase 5: Email Chat Editor

### 5.1 Component Design

**File:** `components/EmailEditorWithChat.tsx` (~500 lines)

#### Layout (Split View):
```
┌─────────────────────────────────────────────┐
│ EMAIL DRAFT                                 │
├─────────────────────┬───────────────────────┤
│  Subject:           │  AI POLISH CHAT       │
│  [____email__]      │  ┌─────────────────┐  │
│                     │  │ Vendor Score:   │  │
│  Body:              │  │ 6.2 (Standard)  │  │
│  ┌────────────────┐ │  └─────────────────┘  │
│  │                │ │  Quick Actions:       │
│  │ [email body]   │ │  [Concise]  [Formal]  │
│  │                │ │  [Friendly] [Add...] │
│  │                │ │                       │
│  │                │ │  Chat Input:          │
│  │                │ │  "Make more friendly" │
│  │                │ │  [Send] [Clear]       │
│  └────────────────┘ │                       │
│                     │                       │
│ [Save] [Send] [...]  │                       │
└─────────────────────┴───────────────────────┘
```

#### Features:
- **Email Editor** (left 60%) - Textarea for subject and body with syntax highlighting
- **AI Chat Panel** (right 40%) - Quick action buttons + chat interface
- **Quick Action Buttons** - Predefined polish instructions:
  - "Make more concise"
  - "Formal tone"
  - "Friendly tone"
  - "Add tracking request"
  - "Clarify expectations"
  - "Add deadline emphasis"
- **Chat Input** - Free-form instruction: "Make sure to mention the Friday deadline"
- **Vendor Score Display** - Shows vendor confidence and template strictness hint
- **Save/Send/Cancel Buttons** - Action buttons

### 5.2 Integration with Confidence System

The vendor's confidence score determines:
- **Strictness Hint** - "This vendor needs clear, explicit language"
- **Available Actions** - For score <5, hide casual/friendly options
- **Auto-Suggestions** - "This vendor often ignores deadlines - add specific date?"

### 5.3 Service Layer Enhancement

**File:** `services/vendorResponseService.ts` - Add `polishDraftWithAI()` function

```typescript
export async function polishDraftWithAI(
  draftId: string,
  instruction: string,
  vendorScore?: number
): Promise<{ success: boolean; updatedBody: string }> {
  const draft = await getDraft(draftId);
  
  const systemPrompt = `You are an email editing assistant for a purchasing department.
${vendorScore !== undefined ? `The vendor has a reliability score of ${vendorScore}/10.` : ''}
${vendorScore && vendorScore < 5 ? 'Use clear, explicit language. Be very specific about dates and requirements.' : ''}

Modify the email according to the user's instruction while maintaining professionalism.
Return ONLY the updated email body, no explanations.`;

  const response = await sendChatMessage([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Original email:\n${draft.body}\n\nInstruction: ${instruction}` }
  ], 'email_polish');

  // Update draft with new body
  await updateDraft(draftId, { body: response.content });

  return {
    success: true,
    updatedBody: response.content,
  };
}
```

---

## 🔒 Phase 6: PO Commitment System

### 6.1 Database Changes (Migration 057)

**File:** `supabase/migrations/057_po_commitment_tracking.sql`

#### Add to purchase_orders table:
```sql
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS is_committed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS committed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS commitment_hash TEXT,  -- Hash of locked fields
  ADD COLUMN IF NOT EXISTS allow_shipping_updates BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS allow_pricing_updates BOOLEAN DEFAULT TRUE;

-- Audit log for changes post-commitment
CREATE TABLE po_change_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Change details
  change_type TEXT NOT NULL,  -- 'field_update', 'line_item_add', 'line_item_remove'
  field_name TEXT,
  old_value JSONB,
  new_value JSONB,
  
  -- Commitment context
  was_committed BOOLEAN,
  change_reason TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approval_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_po_change_audit_po ON po_change_audit(po_id);
CREATE INDEX idx_po_change_audit_committed ON po_change_audit(was_committed);
```

### 6.2 Commitment Logic

**File:** `services/poCommitmentService.ts` (~300 lines)

When PO status changes to 'sent':
1. Set `is_committed = true`
2. Set `committed_at = NOW()`
3. Record `commitment_hash = SHA256(vendor_id + items + quantities + prices)`
4. Block UI editing of: vendor, line items, quantities, prices
5. Allow updates to: shipping address, expected date, notes
6. Log first commitment in po_change_audit

#### Manager Override:
- Manager can approve changes post-commitment
- Creates audit record with override reason
- If amount changes >5%: automatically notify vendor
- Track: who changed, when, reason, who approved

#### Validation Rules:
```typescript
function validatePOChange(poId, fieldName, oldValue, newValue) {
  // If not committed: allow all changes
  const po = getPO(poId);
  if (!po.is_committed) return { allowed: true };
  
  // If committed, only allow certain fields
  const allowedFields = [
    'expected_delivery_date',
    'shipping_address',
    'notes',
    'purchase_notes'
  ];
  
  if (!allowedFields.includes(fieldName)) {
    return { 
      allowed: false, 
      reason: 'This field is locked after PO sent' 
    };
  }
  
  return { allowed: true };
}
```

---

## 📋 Phase 7: Vendor Pricelist Management

### 7.1 Database Schema (Migration 058)

**File:** `supabase/migrations/058_vendor_pricelists.sql`

```sql
CREATE TABLE vendor_pricelists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  
  -- Document metadata
  name TEXT NOT NULL,  -- e.g., "Q4 2025 Pricing"
  effective_date DATE,
  expiration_date DATE,
  
  -- File storage
  file_url TEXT,
  file_type TEXT,      -- 'pdf', 'xlsx', 'csv', 'google_doc'
  google_doc_id TEXT,  -- If Google Docs integration
  
  -- Extracted structured data
  items JSONB DEFAULT '[]'::jsonb,  -- [{sku, description, price, unit, moq}]
  extraction_status TEXT DEFAULT 'pending',  -- 'pending', 'extracted', 'error'
  extraction_confidence NUMERIC(3,2),
  extraction_error TEXT,
  
  -- Versioning
  version INTEGER DEFAULT 1,
  previous_version_id UUID REFERENCES vendor_pricelists(id),
  is_current BOOLEAN DEFAULT TRUE,
  
  -- Metadata
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure only one current pricelist per vendor
CREATE UNIQUE INDEX idx_vendor_pricelists_current 
  ON vendor_pricelists(vendor_id) 
  WHERE is_current = TRUE;

CREATE INDEX idx_vendor_pricelists_vendor ON vendor_pricelists(vendor_id);
CREATE INDEX idx_vendor_pricelists_effective ON vendor_pricelists(effective_date);
```

### 7.2 Service Layer

**File:** `services/vendorPricelistService.ts` (~350 lines)

```typescript
export async function uploadPricelist(
  vendorId: string,
  file: File,
  name: string,
  effectiveDate: Date
): Promise<{ id: string; status: string }>

export async function extractPricelistItems(pricelistId: string): Promise<boolean>

export async function getCurrentPricelist(vendorId: string): Promise<Pricelist | null>

export async function getPricelistHistory(vendorId: string): Promise<Pricelist[]>

export async function archivePricelist(pricelistId: string): Promise<boolean>
```

#### Extraction Logic:
- If PDF: Use MCP OCR service (already integrated)
- If XLSX/CSV: Parse with Papa Parse
- If Google Doc: Fetch via Google Docs API
- Extract: SKU, description, price, unit, MOQ
- Store as JSONB in `items` column

### 7.3 UI Component

**File:** `components/VendorPricelistPanel.tsx` (~400 lines)

#### Features:
- **Upload Section** - Drag-drop or file picker for PDF/XLSX/CSV/Google Doc URL
- **Current Pricelist Display** - Shows effective date, version, item count
- **Price Table** - Searchable/sortable table: SKU | Description | Price | Unit | MOQ
- **Version History** - List of previous pricelists with dates and archive links
- **Download Button** - Download current pricelist as CSV export
- **Extraction Status** - Shows "Extracting..." progress or "Extracted 127 items" confirmation

---

## 🚀 Implementation Order

Based on dependencies and business value:

| Priority | Phase | Reason | Dependencies |
|----------|-------|--------|--------------|
| 1️⃣ | Phase 6 (PO Commitment) | Foundational - affects all other features | None |
| 2️⃣ | Phase 1 (Confidence Scoring) | Enables smart automation decisions | Phase 6 (uses PO data) |
| 3️⃣ | Phase 3 (Tracking Dashboard) | Highest staff impact, uses existing data | Phase 1 (for vendor scores) |
| 4️⃣ | Phase 4 (Invoice Review) | Critical for AP workflow | Phase 1 (confidence for auto-approval) |
| 5️⃣ | Phase 2 (Email Matching) | Most complex, builds on confidence | Phase 1 (uses confidence for matching) |
| 6️⃣ | Phase 5 (Email Chat) | UX improvement, can be done anytime | Phase 1 (uses confidence for hints) |
| 7️⃣ | Phase 7 (Pricelists) | Lower priority, vendor data enhancement | None |

---

## 🛠️ Key Implementation Patterns

### Pattern 1: Event-Driven Score Recalculation
```
Email received → Record interaction event → Trigger recalculation → Update confidence profile
Delivery confirmed → Record interaction event → Trigger recalculation → Update confidence profile
Invoice approved → Record interaction event → Trigger recalculation → Update confidence profile
```

### Pattern 2: Graduated Automation
```
Score 8-10 → Auto-send responses, auto-approve invoices, relaxed templates
Score 6-7.9 → Generate drafts, require review, standard templates
Score 4-5.9 → Queue for review, strict templates, explicit instructions
Score <4 → Manager review only, maximum oversight
```

### Pattern 3: Bootstrap Confidence
```
New vendor → Create profile with score 5.0 (neutral)
Existing vendor → Import vendor_performance_metrics.reliability_score ÷ 10 as seed
Minimum 5 interactions before showing score publicly (avoid bias on small sample)
```

### Pattern 4: Materialized Views
```
po_tracking_dashboard_view - Refresh daily or on PO/communication updates
inventory_trends - Refresh daily via cron (already exists)
Both use CONCURRENTLY to avoid locks
```

---

## ✅ Testing Checklist

For each phase:

### Database
- [ ] Migration applies cleanly: `supabase db reset`
- [ ] All indexes created and functional
- [ ] RLS policies correctly scoped
- [ ] Triggers execute without errors
- [ ] Bootstrap data properly seeded

### TypeScript
- [ ] Types generated: `supabase gen types typescript`
- [ ] No `any` types - all explicit
- [ ] Service functions have error handling
- [ ] Return type matches export signature

### Components
- [ ] Wrapped in ErrorBoundary
- [ ] Props match interface definitions
- [ ] Loading/error states handled
- [ ] Responsive on mobile/tablet

### E2E Tests
- [ ] Create tests in `e2e/` directory
- [ ] Use `?e2e=1` query param for auth bypass
- [ ] Test happy path
- [ ] Test error cases
- [ ] Test permission edge cases (Staff vs Manager vs Admin)

### Integration
- [ ] Service calls work with real Supabase data
- [ ] UI state syncs with database
- [ ] Emails actually send to test vendors
- [ ] Costs within budget limits

---

## 📎 File Structure Summary

### New Migrations
```
supabase/migrations/
  053_vendor_confidence_profiles.sql      (~300 lines)
  054_vendor_communication_profiles.sql   (~100 lines)
  055_po_tracking_dashboard.sql           (~150 lines)
  056_invoice_review_workflow.sql         (~200 lines)
  057_po_commitment_tracking.sql          (~150 lines)
  058_vendor_pricelists.sql               (~120 lines)
```

### New Services
```
services/
  vendorConfidenceService.ts              (~500 lines)
  poTrackingDashboardService.ts           (~250 lines)
  invoiceReviewService.ts                 (~400 lines)
  poCommitmentService.ts                  (~300 lines)
  vendorPricelistService.ts               (~350 lines)
  vendorResponseService.ts                (ENHANCED ~100 new lines)
```

### New UI Components
```
components/
  VendorConfidenceDashboard.tsx           (~600 lines)
  POTrackingStatusDashboard.tsx           (~800 lines)
  InvoiceReviewPanel.tsx                  (~600 lines)
  EmailEditorWithChat.tsx                 (~500 lines)
  VendorPricelistPanel.tsx                (~400 lines)
```

### Enhanced Existing Files
```
supabase/functions/gmail-webhook/index.ts    (add multi-signal matching ~200 lines)
services/vendorResponseService.ts             (add AI polish ~80 lines)
components/VendorResponseWorkbench.tsx        (integrate confidence hints ~50 lines)
```

### Types
```
types/
  vendor.ts                               (add confidence types)
  purchaseOrder.ts                        (add commitment types)
  invoice.ts                              (add invoice types - NEW FILE)
```

### Tests
```
e2e/
  vendor-confidence.spec.ts               (~200 lines)
  po-tracking.spec.ts                     (~150 lines)
  invoice-review.spec.ts                  (~150 lines)
  email-matching.spec.ts                  (~200 lines)

tests/
  vendorConfidenceService.test.ts         (~250 lines)
  invoiceReviewService.test.ts            (~200 lines)
```

---

## 🎯 Success Metrics

Once implemented, you should be able to:

1. **Vendor Confidence** - View any vendor's 0-10 score and see which factors need improvement
2. **Email Matching** - 90%+ of vendor emails automatically matched to correct PO
3. **Tracking Visibility** - Staff can see all open PO statuses in one dashboard, grouped as needed
4. **Invoice Processing** - 80%+ of invoices auto-approved within 1 minute of receipt
5. **Response Quality** - 100% of outgoing emails reviewed before send, AI polish reduces edits by 40%
6. **PO Accountability** - Full audit trail of any post-commitment changes, no surprise modifications
7. **Vendor Behavior** - Detect patterns (e.g., "ABC always ships Wed", "XYZ ignores threading")
8. **Smart Automation** - Auto-send confidence + auto-approve invoice confidence enables hands-off purchasing

---

**Document Created:** November 28, 2025  
**Implementation Start:** Ready for phase-by-phase development  
**Estimated Effort:** 4-6 weeks for all 7 phases (4-5 days per phase)

---

## 📄 Appendix A — Pricelist Extraction From Vendor Emails

> This appendix extends **Phase 7 (Vendor Pricelist Management)** with a full lifecycle for capturing, extracting, and operationalizing vendor price updates that arrive through email. It reuses the vendor confidence signals so pricelist changes influence downstream automation.

### A.1 Detection & Classification Enhancements
1. **New Response Category:** Add `price_list_update` to the Gmail webhook classifier and Vendor Response Workbench.
2. **Signals for Classification:**
   - Subject contains “pricelist”, “price list”, “new pricing”, “tariff”, “quote update”.
   - Attachments with MIME types `application/pdf`, `text/csv`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
   - Inline tables with ≥3 columns that include headers like SKU, Item, Price, Cost, MOQ.
3. **Recommended Actions (Workbench Chips):**
   - `store_pricelist`
   - `review_price_changes`
   - `update_bom_costs`

### A.2 Extraction Pipeline Overview

| Stage | Responsibility | Implementation Notes |
|-------|----------------|----------------------|
| Ingestion | Gmail webhook (`gmail-webhook/index.ts`) | Flag message as `price_list_update`, store metadata + attachments in Supabase storage bucket `vendor-pricelists`. |
| Orchestration | `vendorPricelistService.extractPricelistItems()` | Accepts attachment metadata or inline body, routes to extractor functions, persists results. |
| Extraction Methods | 1) Inline text 2) PDF OCR 3) XLSX/CSV parsing 4) Google Sheets URL 5) AI fallback | Each method returns `PricelistExtractionResult` with `items`, `confidence`, `warnings`. |
| Post-Processing | Diff engine | Compare against current pricelist, calculate deltas, trigger alerts. |

#### A.2.1 Inline Text Extractor
- Regex detect CSV-like rows (`sku,desc,price,unit`).
- Support pipe-delimited or tab-delimited tables.
- Convert to normalized item objects `{ sku, description, price, unit, moq }`.

#### A.2.2 PDF Extractor
- Use existing MCP OCR pipeline (same as label/packing extraction).
- Post-process text into table by detecting header line then splitting rows.

#### A.2.3 Spreadsheet Extractor
- Accept `xlsx`, `xls`, `csv`.
- Auto-detect column headers (case-insensitive match for SKU, Description, Price, MOQ, UOM).
- Skip hidden sheets; prefer first sheet containing SKU + Price columns.

#### A.2.4 Google Sheets Extractor
- If email contains Google Sheets link + vendor authorized, fetch via Sheets API using service account.
- Convert sheet rows into standard item objects.

#### A.2.5 AI Fallback
- When none of the structured extractors succeed, call Claude “table extraction” prompt with raw text and request JSON output.
- Require minimum `0.70` confidence; otherwise mark extraction as `needs_review`.

### A.3 Storage, Versioning, Alerts

#### Tables (Migration 058 already outlined)
- `vendor_pricelists` stores metadata, version number, and structured `items` JSONB.
- `vendor_pricelist_items` *(optional materialized table)* if we need row-level queries (SKU, price, effective date).

#### Workflow
1. **Store Version:** Save new list with `is_current = TRUE`, flip previous record to `FALSE`.
2. **Change Detection:** Compare new items to previous version:
   - Price variance percentage.
   - New SKUs added, SKUs removed.
   - MOQ changes.
3. **Alerts:** 
   - Variance >3% → post yellow alert in Workbench.
   - Variance >5% → raise red alert + notify purchasing Slack channel.
4. **Vendor Confidence Hook:** Record interaction event `pricelist_update` so confidence score learns from proactive vendors.

### A.4 UI & Review Experience

#### Vendor Response Workbench Card
- New panel: “Extracted Pricelist”
  - Displays summary: version name, effective date, item count, extraction confidence.
  - Actions: `Approve & Store`, `Request Clarification`, `Ignore`.

#### Vendor Pricelist Panel (`VendorPricelistPanel.tsx`)
- **Upload Section:** Drag & drop + Gmail auto-ingest toggle.
- **Current Pricelist Table:** searchable, sortable columns (SKU, Description, Current Price, Previous Price, Δ%).
- **Version History:** timeline showing effective date, uploader, confidence, download link.
- **BOM Impact Drawer:** list BOMs affected (if SKUs mapped), show before/after component cost.

### A.5 BOM Synchronization
1. Map extracted SKUs to inventory/bom components via `sku` or alternate codes.
2. For each match, calculate new component cost and update BOM roll-up cost (pending approval).
3. Provide “Apply to BOM” action that:
   - Updates component cost in `boms.components[*].unit_cost`.
   - Logs entry in `bom_cost_change_audit`.
4. Optionally push cost updates to Forecasting/AI pipelines.

### A.6 Service & Type Additions

```ts
// types.ts
export interface PricelistItem {
  sku: string;
  description?: string;
  unit?: string;
  price: number;
  currency?: string;
  moq?: number;
  notes?: string;
  confidence?: number;
}

export interface PricelistExtractionResult {
  items: PricelistItem[];
  confidence: number;
  method: 'inline' | 'pdf' | 'spreadsheet' | 'google_sheet' | 'ai_fallback';
  warnings?: string[];
  rawAttachmentId?: string;
}
```

```ts
// services/vendorPricelistService.ts
export async function extractPricelistFromEmail(messageId: string): Promise<PricelistExtractionResult>;
export async function savePricelistVersion(vendorId: string, payload: PricelistExtractionResult): Promise<string>;
export async function diffPricelist(pricelistId: string): Promise<PricelistDiffSummary>;
export async function notifyPricelistChanges(pricelistId: string): Promise<void>;
```

### A.7 Automated Flow Summary
1. **Email Received** → classify as `price_list_update`.
2. **Attachments Stored** → call `extractPricelistFromEmail`.
3. **Extraction Result** → persisted as draft version.
4. **Diff Engine** → compute change summary, push notifications.
5. **Workbench Actions** → user approves/rejects.
6. **Approval** → version marked current, BOM cost updates queued.
7. **Audit & Confidence** → interaction event logged, vendor score updated.

### A.8 Testing Strategy

| Layer | Tests |
|-------|-------|
| Unit  | Extractor functions (inline, pdf, csv, ai fallback) with fixtures, diff engine logic, BOM mapping utilities. |
| Integration | Gmail webhook → extraction pipeline end-to-end using mocked Supabase storage. |
| UI | Component tests for Workbench panel + Pricelist panel, e2e test verifying approve flow (`e2e/pricelist-extraction.spec.ts`). |
| Regression | Verify vendor confidence recalculates after pricelist interaction events. |

### A.9 Observability
- Log extraction confidence, method, and duration to `vendor_pricelist_extraction_logs`.
- Dashboard chart: extraction success rate per vendor.
- Alert on repeated extraction failures for same vendor (3 failures in 7 days).

---

This appendix gives engineering a detailed blueprint to implement pricelist extraction as a native part of the vendor communication system, ensuring Phase 7 launches with full automation, traceability, and BOM cost synchronization.
