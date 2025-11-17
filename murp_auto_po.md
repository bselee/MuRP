# MuRP Auto Purchase Order System
## Complete Implementation Guide

**Version:** 1.0  
**Last Updated:** November 17, 2025  
**System:** MuRP (Ultra Material Requirements Planning)  
**Stack:** Next.js 14, TypeScript, Supabase, Tailwind CSS

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Database Schema](#database-schema)
3. [Auto PO Generation Engine](#auto-po-generation-engine)
4. [Purchase Orders Page UI](#purchase-orders-page-ui)
5. [Expandable Row Component](#expandable-row-component)
6. [Floating Reorder Guidance Widget](#floating-reorder-guidance-widget)
7. [Email Draft System](#email-draft-system)
8. [Complete Implementation Steps](#complete-implementation-steps)
9. [API Routes](#api-routes)
10. [Testing Procedures](#testing-procedures)

---

## System Overview

### The Auto PO Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. INVENTORY MONITORING (Background Job - Runs Daily at 6am)   │
│     - Checks all items against consumption velocity              │
│     - Calculates days_until_order_needed                         │
│     - Identifies items requiring reorder                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. AUTO PO GENERATION                                           │
│     - Groups items by vendor                                     │
│     - Creates draft POs with status: 'draft'                     │
│     - Calculates totals and line items                           │
│     - Applies consolidation logic                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. PURCHASE ORDERS PAGE                                         │
│     - Shows all draft POs in collapsed list view                │
│     - User expands to review line items                          │
│     - Floating guidance widget shows AI insights                 │
│     - User approves or edits POs                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. EMAIL DRAFT GENERATION                                       │
│     - Creates vendor-specific email with PO details              │
│     - Includes tracking response instructions                    │
│     - User reviews and sends via email client                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. TRACKING & FULFILLMENT                                       │
│     - Vendor responds with tracking info                         │
│     - System updates PO status                                   │
│     - Inventory updated upon receipt                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Core Tables

```sql
-- ============================================================================
-- PURCHASE ORDERS TABLE
-- ============================================================================
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number VARCHAR(20) UNIQUE NOT NULL, -- Format: PO-YYYYMMDD-XXX
  
  -- Vendor relationship
  vendor_id UUID REFERENCES vendors(id) ON DELETE RESTRICT,
  vendor_name VARCHAR(255) NOT NULL, -- Denormalized for speed
  
  -- Status workflow
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN (
    'draft',        -- Auto-generated, needs review
    'pending',      -- Approved, ready to send
    'sent',         -- Email sent to vendor
    'confirmed',    -- Vendor confirmed receipt
    'partial',      -- Partially received
    'received',     -- Fully received
    'cancelled'     -- Cancelled by user
  )),
  
  -- Financial data
  subtotal DECIMAL(12,2) NOT NULL,
  shipping_cost DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(12,2) NOT NULL,
  
  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  expected_delivery_date DATE,
  actual_delivery_date DATE,
  
  -- Notes and tracking
  internal_notes TEXT,
  vendor_notes TEXT, -- Sent to vendor in email
  tracking_number VARCHAR(100),
  shipping_carrier VARCHAR(50),
  
  -- Auto-generation metadata
  auto_generated BOOLEAN DEFAULT FALSE,
  generation_reason TEXT, -- e.g., "Critical reorder: 5 items below 7 days stock"
  
  -- User who created/approved
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  
  -- Email tracking
  email_draft TEXT, -- Generated email content
  email_sent BOOLEAN DEFAULT FALSE,
  email_sent_at TIMESTAMPTZ,
  
  CONSTRAINT positive_amounts CHECK (
    subtotal >= 0 AND 
    total >= 0 AND 
    shipping_cost >= 0 AND 
    tax >= 0
  )
);

-- Indexes for performance
CREATE INDEX idx_po_status ON purchase_orders(status);
CREATE INDEX idx_po_vendor ON purchase_orders(vendor_id);
CREATE INDEX idx_po_created ON purchase_orders(created_at DESC);
CREATE INDEX idx_po_number ON purchase_orders(po_number);

-- ============================================================================
-- PURCHASE ORDER LINE ITEMS
-- ============================================================================
CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  
  -- Item details
  sku VARCHAR(50) REFERENCES inventory_items(sku) ON DELETE RESTRICT,
  description VARCHAR(500) NOT NULL,
  
  -- Quantities
  qty_ordered INTEGER NOT NULL CHECK (qty_ordered > 0),
  qty_received INTEGER DEFAULT 0 CHECK (qty_received >= 0),
  qty_cancelled INTEGER DEFAULT 0 CHECK (qty_cancelled >= 0),
  
  -- Pricing
  unit_cost DECIMAL(10,4) NOT NULL CHECK (unit_cost >= 0),
  line_total DECIMAL(12,2) NOT NULL CHECK (line_total >= 0),
  
  -- Reorder context (why this was ordered)
  days_of_stock_when_ordered DECIMAL(5,1), -- Historical context
  consumption_rate_when_ordered DECIMAL(10,2), -- Units per day
  urgency_level VARCHAR(20), -- 'OVERDUE', 'CRITICAL', 'URGENT', etc.
  
  -- Receipt tracking
  received_date DATE,
  received_by UUID REFERENCES auth.users(id),
  
  -- Notes
  line_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT qty_logic CHECK (
    qty_received + qty_cancelled <= qty_ordered
  )
);

CREATE INDEX idx_po_items_po ON purchase_order_items(po_id);
CREATE INDEX idx_po_items_sku ON purchase_order_items(sku);

-- ============================================================================
-- REORDER QUEUE (Items Needing Purchase)
-- ============================================================================
CREATE TABLE reorder_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(50) REFERENCES inventory_items(sku) ON DELETE CASCADE,
  
  -- Current state snapshot
  current_stock INTEGER NOT NULL,
  consumption_30day DECIMAL(10,2),
  consumption_60day DECIMAL(10,2),
  consumption_90day DECIMAL(10,2),
  daily_consumption_rate DECIMAL(10,2) GENERATED ALWAYS AS (
    (consumption_30day * 0.5 + consumption_60day * 0.3 + consumption_90day * 0.2) / 30
  ) STORED,
  
  -- Calculated urgency
  days_until_stockout DECIMAL(5,1),
  days_until_order_needed DECIMAL(5,1),
  order_trigger_date DATE,
  urgency_level VARCHAR(20),
  
  -- Suggested order
  suggested_qty INTEGER,
  suggested_order_cost DECIMAL(10,2),
  
  -- Vendor info
  vendor_id UUID REFERENCES vendors(id),
  vendor_lead_time INTEGER,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
    'pending',     -- Needs PO creation
    'po_created',  -- PO draft created
    'ordered',     -- PO sent to vendor
    'resolved'     -- No longer needs reorder
  )),
  
  -- Timestamps
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  
  -- AI insights
  ai_recommendation TEXT,
  consolidation_opportunity BOOLEAN DEFAULT FALSE,
  
  CONSTRAINT unique_pending_sku UNIQUE (sku, status) 
    WHERE status IN ('pending', 'po_created')
);

CREATE INDEX idx_reorder_urgency ON reorder_queue(urgency_level, order_trigger_date);
CREATE INDEX idx_reorder_vendor ON reorder_queue(vendor_id, status);
CREATE INDEX idx_reorder_status ON reorder_queue(status);

-- ============================================================================
-- AUTO PO GENERATION LOG
-- ============================================================================
CREATE TABLE auto_po_generation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  -- What was processed
  items_analyzed INTEGER,
  items_needing_reorder INTEGER,
  vendors_affected INTEGER,
  
  -- What was created
  pos_created INTEGER,
  total_value_generated DECIMAL(12,2),
  
  -- Execution details
  execution_time_ms INTEGER,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  
  -- Generated PO IDs (for reference)
  po_ids UUID[]
);

-- ============================================================================
-- VENDORS TABLE (Enhanced)
-- ============================================================================
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS standard_lead_time_days INTEGER 
  DEFAULT 21 CHECK (standard_lead_time_days IN (14, 21, 30));

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS min_order_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS free_shipping_threshold DECIMAL(10,2);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50) DEFAULT 'Net 30';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS email_contact VARCHAR(255);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS purchase_email VARCHAR(255); -- Different from general email
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS auto_po_enabled BOOLEAN DEFAULT TRUE;

-- ============================================================================
-- INVENTORY ITEMS TABLE (Enhanced)
-- ============================================================================
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS is_bulk_item BOOLEAN DEFAULT FALSE;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS bulk_lead_time_days INTEGER 
  CHECK (bulk_lead_time_days IN (90, 120));
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS bulk_item_notes TEXT;

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS safety_stock_days INTEGER DEFAULT 7;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS reorder_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS consumption_30day DECIMAL(10,2) DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS consumption_60day DECIMAL(10,2) DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS consumption_90day DECIMAL(10,2) DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS last_consumption_update TIMESTAMPTZ;

-- Computed effective lead time
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS effective_lead_time_days INTEGER 
  GENERATED ALWAYS AS (
    COALESCE(
      bulk_lead_time_days,
      (SELECT standard_lead_time_days FROM vendors WHERE id = vendor_id)
    )
  ) STORED;
```

---

## Auto PO Generation Engine

### Core TypeScript Types

```typescript
// types/purchase-orders.ts

export type POStatus = 
  | 'draft' 
  | 'pending' 
  | 'sent' 
  | 'confirmed' 
  | 'partial' 
  | 'received' 
  | 'cancelled';

export type UrgencyLevel = 
  | 'OVERDUE' 
  | 'CRITICAL' 
  | 'URGENT' 
  | 'UPCOMING' 
  | 'SUFFICIENT';

export interface ReorderItem {
  sku: string;
  description: string;
  vendor_id: string;
  vendor_name: string;
  
  // Stock data
  current_stock: number;
  consumption_30day: number;
  consumption_60day: number;
  consumption_90day: number;
  
  // Calculated fields
  daily_consumption_rate: number;
  days_until_stockout: number;
  days_until_order_needed: number;
  order_trigger_date: Date;
  urgency_level: UrgencyLevel;
  
  // Order details
  suggested_qty: number;
  unit_cost: number;
  suggested_order_cost: number;
  
  // Lead time
  vendor_lead_time: number;
  safety_stock_days: number;
  is_bulk_item: boolean;
  bulk_lead_time_days?: number;
  effective_lead_time: number;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor_id: string;
  vendor_name: string;
  status: POStatus;
  
  subtotal: number;
  shipping_cost: number;
  tax: number;
  total: number;
  
  created_at: Date;
  approved_at?: Date;
  sent_at?: Date;
  expected_delivery_date?: Date;
  
  internal_notes?: string;
  vendor_notes?: string;
  generation_reason?: string;
  
  auto_generated: boolean;
  email_draft?: string;
  
  items: POLineItem[];
}

export interface POLineItem {
  id: string;
  po_id: string;
  sku: string;
  description: string;
  
  qty_ordered: number;
  qty_received: number;
  qty_cancelled: number;
  
  unit_cost: number;
  line_total: number;
  
  days_of_stock_when_ordered?: number;
  consumption_rate_when_ordered?: number;
  urgency_level?: UrgencyLevel;
  
  line_notes?: string;
}

export interface VendorPOGroup {
  vendor_id: string;
  vendor_name: string;
  vendor_email: string;
  vendor_lead_time: number;
  
  items: ReorderItem[];
  
  overdue_items: ReorderItem[];
  critical_items: ReorderItem[];
  urgent_items: ReorderItem[];
  upcoming_items: ReorderItem[];
  
  subtotal: number;
  min_order_amount: number;
  free_shipping_threshold: number;
  
  consolidation_opportunities: string[];
  ai_insights: string;
}
```

### Auto PO Generation Service

```typescript
// lib/services/autoPOGenerator.ts

import { createClient } from '@/lib/supabase/server';
import type { ReorderItem, VendorPOGroup, PurchaseOrder } from '@/types/purchase-orders';

export class AutoPOGenerator {
  
  /**
   * Main entry point: Analyze inventory and generate POs
   */
  async generateAutoPOs(): Promise<{ 
    success: boolean; 
    pos_created: number;
    error?: string;
  }> {
    const startTime = Date.now();
    const supabase = createClient();
    
    try {
      // Step 1: Populate reorder queue
      await this.updateReorderQueue();
      
      // Step 2: Get items needing reorder
      const reorderItems = await this.getReorderItems();
      
      if (reorderItems.length === 0) {
        console.log('✅ No items need reordering');
        return { success: true, pos_created: 0 };
      }
      
      // Step 3: Group by vendor
      const vendorGroups = this.groupItemsByVendor(reorderItems);
      
      // Step 4: Generate POs for each vendor
      const createdPOs: PurchaseOrder[] = [];
      
      for (const group of vendorGroups) {
        const po = await this.createDraftPO(group);
        if (po) {
          createdPOs.push(po);
        }
      }
      
      // Step 5: Log generation run
      await this.logGeneration({
        items_analyzed: reorderItems.length,
        items_needing_reorder: reorderItems.length,
        vendors_affected: vendorGroups.length,
        pos_created: createdPOs.length,
        total_value_generated: createdPOs.reduce((sum, po) => sum + po.total, 0),
        execution_time_ms: Date.now() - startTime,
        po_ids: createdPOs.map(po => po.id)
      });
      
      console.log(`✅ Generated ${createdPOs.length} draft POs`);
      
      return { 
        success: true, 
        pos_created: createdPOs.length 
      };
      
    } catch (error) {
      console.error('❌ Auto PO generation failed:', error);
      
      await this.logGeneration({
        items_analyzed: 0,
        items_needing_reorder: 0,
        vendors_affected: 0,
        pos_created: 0,
        total_value_generated: 0,
        execution_time_ms: Date.now() - startTime,
        success: false,
        error_message: error.message
      });
      
      return { 
        success: false, 
        pos_created: 0,
        error: error.message 
      };
    }
  }
  
  /**
   * Step 1: Scan inventory and populate reorder_queue table
   */
  private async updateReorderQueue(): Promise<void> {
    const supabase = createClient();
    
    // Get all items with consumption data
    const { data: items, error } = await supabase
      .from('inventory_items')
      .select(`
        sku,
        current_stock,
        consumption_30day,
        consumption_60day,
        consumption_90day,
        vendor_id,
        safety_stock_days,
        effective_lead_time_days,
        vendors (
          id,
          name,
          standard_lead_time_days
        )
      `)
      .eq('reorder_enabled', true)
      .gt('consumption_30day', 0); // Only items with recent sales
    
    if (error) throw error;
    
    const reorderItems = [];
    
    for (const item of items) {
      const analysis = this.analyzeReorderNeed(item);
      
      // Only add to queue if order is needed
      if (analysis.needs_reorder) {
        reorderItems.push({
          sku: item.sku,
          current_stock: item.current_stock,
          consumption_30day: item.consumption_30day,
          consumption_60day: item.consumption_60day,
          consumption_90day: item.consumption_90day,
          daily_consumption_rate: analysis.daily_consumption,
          days_until_stockout: analysis.days_until_stockout,
          days_until_order_needed: analysis.days_until_order_needed,
          order_trigger_date: analysis.order_trigger_date,
          urgency_level: analysis.urgency_level,
          suggested_qty: analysis.suggested_qty,
          suggested_order_cost: analysis.suggested_cost,
          vendor_id: item.vendor_id,
          vendor_lead_time: item.effective_lead_time_days,
          status: 'pending',
          ai_recommendation: analysis.ai_insight
        });
      }
    }
    
    // Bulk upsert to reorder_queue
    if (reorderItems.length > 0) {
      const { error: upsertError } = await supabase
        .from('reorder_queue')
        .upsert(reorderItems, { 
          onConflict: 'sku,status',
          ignoreDuplicates: false 
        });
      
      if (upsertError) throw upsertError;
    }
  }
  
  /**
   * Analyze if an item needs reordering
   */
  private analyzeReorderNeed(item: any): {
    needs_reorder: boolean;
    daily_consumption: number;
    days_until_stockout: number;
    days_until_order_needed: number;
    order_trigger_date: Date;
    urgency_level: string;
    suggested_qty: number;
    suggested_cost: number;
    ai_insight: string;
  } {
    // Weighted consumption (recent data = more weight)
    const daily_consumption = (
      (item.consumption_30day * 0.50) +
      (item.consumption_60day * 0.30) +
      (item.consumption_90day * 0.20)
    ) / 30;
    
    if (daily_consumption === 0) {
      return {
        needs_reorder: false,
        daily_consumption: 0,
        days_until_stockout: 999,
        days_until_order_needed: 999,
        order_trigger_date: new Date(),
        urgency_level: 'SUFFICIENT',
        suggested_qty: 0,
        suggested_cost: 0,
        ai_insight: 'No consumption - no reorder needed'
      };
    }
    
    // Days of stock remaining
    const days_until_stockout = item.current_stock / daily_consumption;
    
    // When we need to ORDER (not when we run out)
    const order_trigger_threshold = 
      item.effective_lead_time_days + 
      item.safety_stock_days;
    
    const days_until_order_needed = days_until_stockout - order_trigger_threshold;
    
    // Calculate urgency
    let urgency_level: string;
    if (days_until_order_needed <= 0) {
      urgency_level = 'OVERDUE';
    } else if (days_until_order_needed <= 7) {
      urgency_level = 'CRITICAL';
    } else if (days_until_order_needed <= 14) {
      urgency_level = 'URGENT';
    } else if (days_until_order_needed <= 30) {
      urgency_level = 'UPCOMING';
    } else {
      urgency_level = 'SUFFICIENT';
    }
    
    const needs_reorder = days_until_order_needed <= 30; // 30-day window
    
    // Suggested order quantity
    // Cover: lead time + safety stock + 60 days forward consumption
    const coverage_days = 
      item.effective_lead_time_days + 
      item.safety_stock_days + 
      60;
    
    const suggested_qty = Math.ceil(daily_consumption * coverage_days);
    
    // Get unit cost (would come from vendor pricing table)
    const unit_cost = 10; // Placeholder - fetch from actual pricing
    const suggested_cost = suggested_qty * unit_cost;
    
    // Order trigger date
    const order_trigger_date = new Date();
    order_trigger_date.setDate(
      order_trigger_date.getDate() + Math.floor(days_until_order_needed)
    );
    
    // AI insight
    let ai_insight = '';
    if (urgency_level === 'OVERDUE') {
      ai_insight = `⚠️ OVERDUE: Should have ordered ${Math.abs(days_until_order_needed).toFixed(0)} days ago. Expedite shipping.`;
    } else if (urgency_level === 'CRITICAL') {
      ai_insight = `🔴 CRITICAL: Order this week. Only ${days_until_stockout.toFixed(0)} days of stock remaining.`;
    } else if (urgency_level === 'URGENT') {
      ai_insight = `🟡 URGENT: Order within 2 weeks to maintain buffer stock.`;
    }
    
    return {
      needs_reorder,
      daily_consumption,
      days_until_stockout,
      days_until_order_needed,
      order_trigger_date,
      urgency_level,
      suggested_qty,
      suggested_cost,
      ai_insight
    };
  }
  
  /**
   * Step 2: Get items from reorder queue
   */
  private async getReorderItems(): Promise<ReorderItem[]> {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('reorder_queue')
      .select(`
        *,
        inventory_items (
          sku,
          description,
          unit_cost,
          is_bulk_item,
          bulk_lead_time_days
        ),
        vendors (
          id,
          name,
          email,
          purchase_email,
          standard_lead_time_days,
          min_order_amount,
          free_shipping_threshold
        )
      `)
      .in('status', ['pending'])
      .order('days_until_order_needed', { ascending: true });
    
    if (error) throw error;
    
    return data.map(item => ({
      sku: item.sku,
      description: item.inventory_items.description,
      vendor_id: item.vendor_id,
      vendor_name: item.vendors.name,
      current_stock: item.current_stock,
      consumption_30day: item.consumption_30day,
      consumption_60day: item.consumption_60day,
      consumption_90day: item.consumption_90day,
      daily_consumption_rate: item.daily_consumption_rate,
      days_until_stockout: item.days_until_stockout,
      days_until_order_needed: item.days_until_order_needed,
      order_trigger_date: new Date(item.order_trigger_date),
      urgency_level: item.urgency_level,
      suggested_qty: item.suggested_qty,
      unit_cost: item.inventory_items.unit_cost || 0,
      suggested_order_cost: item.suggested_order_cost,
      vendor_lead_time: item.vendor_lead_time,
      safety_stock_days: 7, // From inventory_items
      is_bulk_item: item.inventory_items.is_bulk_item,
      bulk_lead_time_days: item.inventory_items.bulk_lead_time_days,
      effective_lead_time: item.vendor_lead_time
    }));
  }
  
  /**
   * Step 3: Group items by vendor
   */
  private groupItemsByVendor(items: ReorderItem[]): VendorPOGroup[] {
    const groups = new Map<string, VendorPOGroup>();
    
    for (const item of items) {
      if (!groups.has(item.vendor_id)) {
        groups.set(item.vendor_id, {
          vendor_id: item.vendor_id,
          vendor_name: item.vendor_name,
          vendor_email: '', // Fetch from vendor
          vendor_lead_time: item.vendor_lead_time,
          items: [],
          overdue_items: [],
          critical_items: [],
          urgent_items: [],
          upcoming_items: [],
          subtotal: 0,
          min_order_amount: 0,
          free_shipping_threshold: 0,
          consolidation_opportunities: [],
          ai_insights: ''
        });
      }
      
      const group = groups.get(item.vendor_id)!;
      group.items.push(item);
      group.subtotal += item.suggested_order_cost;
      
      // Categorize by urgency
      switch (item.urgency_level) {
        case 'OVERDUE':
        case 'CRITICAL':
          group.critical_items.push(item);
          break;
        case 'URGENT':
          group.urgent_items.push(item);
          break;
        case 'UPCOMING':
          group.upcoming_items.push(item);
          break;
      }
    }
    
    return Array.from(groups.values());
  }
  
  /**
   * Step 4: Create draft PO for a vendor group
   */
  private async createDraftPO(group: VendorPOGroup): Promise<PurchaseOrder | null> {
    const supabase = createClient();
    
    // Generate PO number
    const po_number = await this.generatePONumber();
    
    // Calculate totals
    const subtotal = group.items.reduce(
      (sum, item) => sum + (item.suggested_qty * item.unit_cost), 
      0
    );
    const shipping_cost = 0; // Calculate based on vendor rules
    const tax = 0; // Calculate if applicable
    const total = subtotal + shipping_cost + tax;
    
    // Generation reason
    const generation_reason = this.buildGenerationReason(group);
    
    // Create PO record
    const { data: po, error: poError } = await supabase
      .from('purchase_orders')
      .insert({
        po_number,
        vendor_id: group.vendor_id,
        vendor_name: group.vendor_name,
        status: 'draft',
        subtotal,
        shipping_cost,
        tax,
        total,
        auto_generated: true,
        generation_reason,
        expected_delivery_date: this.calculateExpectedDelivery(group.vendor_lead_time)
      })
      .select()
      .single();
    
    if (poError || !po) {
      console.error('Failed to create PO:', poError);
      return null;
    }
    
    // Create line items
    const lineItems = group.items.map(item => ({
      po_id: po.id,
      sku: item.sku,
      description: item.description,
      qty_ordered: item.suggested_qty,
      unit_cost: item.unit_cost,
      line_total: item.suggested_qty * item.unit_cost,
      days_of_stock_when_ordered: item.days_until_stockout,
      consumption_rate_when_ordered: item.daily_consumption_rate,
      urgency_level: item.urgency_level
    }));
    
    const { error: itemsError } = await supabase
      .from('purchase_order_items')
      .insert(lineItems);
    
    if (itemsError) {
      console.error('Failed to create line items:', itemsError);
      return null;
    }
    
    // Update reorder_queue status
    await supabase
      .from('reorder_queue')
      .update({ status: 'po_created' })
      .in('sku', group.items.map(i => i.sku))
      .eq('status', 'pending');
    
    return {
      ...po,
      items: lineItems
    };
  }
  
  /**
   * Generate unique PO number
   */
  private async generatePONumber(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    
    const supabase = createClient();
    
    // Get today's PO count
    const { count } = await supabase
      .from('purchase_orders')
      .select('*', { count: 'exact', head: true })
      .like('po_number', `PO-${dateStr}-%`);
    
    const sequence = String((count || 0) + 1).padStart(3, '0');
    
    return `PO-${dateStr}-${sequence}`;
  }
  
  /**
   * Build human-readable generation reason
   */
  private buildGenerationReason(group: VendorPOGroup): string {
    const reasons: string[] = [];
    
    if (group.critical_items.length > 0) {
      reasons.push(`${group.critical_items.length} critical items requiring immediate reorder`);
    }
    if (group.urgent_items.length > 0) {
      reasons.push(`${group.urgent_items.length} urgent items (order within 2 weeks)`);
    }
    if (group.upcoming_items.length > 0) {
      reasons.push(`${group.upcoming_items.length} items approaching reorder point`);
    }
    
    return reasons.join('; ');
  }
  
  /**
   * Calculate expected delivery date
   */
  private calculateExpectedDelivery(leadTimeDays: number): Date {
    const today = new Date();
    today.setDate(today.getDate() + leadTimeDays);
    return today;
  }
  
  /**
   * Log generation run to database
   */
  private async logGeneration(log: any): Promise<void> {
    const supabase = createClient();
    
    await supabase
      .from('auto_po_generation_log')
      .insert(log);
  }
}
```

---

## Purchase Orders Page UI

### Main Page Component

```typescript
// app/purchase-orders/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { POListItem } from '@/components/purchase-orders/POListItem';
import { FloatingReorderGuidance } from '@/components/purchase-orders/FloatingReorderGuidance';
import { POStatusFilter } from '@/components/purchase-orders/POStatusFilter';
import { GeneratePOsButton } from '@/components/purchase-orders/GeneratePOsButton';
import type { PurchaseOrder, POStatus } from '@/types/purchase-orders';

export default function PurchaseOrdersPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [filteredPOs, setFilteredPOs] = useState<PurchaseOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState<POStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [showGuidance, setShowGuidance] = useState(true);
  const [expandedPOId, setExpandedPOId] = useState<string | null>(null);
  
  // Load POs on mount
  useEffect(() => {
    loadPurchaseOrders();
  }, []);
  
  // Filter POs when status filter changes
  useEffect(() => {
    if (statusFilter === 'all') {
      setFilteredPOs(purchaseOrders);
    } else {
      setFilteredPOs(
        purchaseOrders.filter(po => po.status === statusFilter)
      );
    }
  }, [statusFilter, purchaseOrders]);
  
  const loadPurchaseOrders = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/purchase-orders');
      const data = await response.json();
      
      if (data.success) {
        setPurchaseOrders(data.purchase_orders);
      }
    } catch (error) {
      console.error('Failed to load purchase orders:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleGeneratePOs = async () => {
    try {
      const response = await fetch('/api/purchase-orders/generate', {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert(`✅ Generated ${data.pos_created} new purchase orders!`);
        loadPurchaseOrders(); // Refresh list
      } else {
        alert(`❌ Failed to generate POs: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to generate POs:', error);
      alert('❌ Failed to generate purchase orders');
    }
  };
  
  const handlePOExpand = (poId: string) => {
    setExpandedPOId(expandedPOId === poId ? null : poId);
  };
  
  const handlePOUpdate = (updatedPO: PurchaseOrder) => {
    setPurchaseOrders(prev =>
      prev.map(po => po.id === updatedPO.id ? updatedPO : po)
    );
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-800 mb-2">
              Purchase Orders
            </h1>
            <p className="text-slate-600">
              Review and manage automatically generated purchase orders
            </p>
          </div>
          
          <GeneratePOsButton onClick={handleGeneratePOs} />
        </div>
      </div>
      
      {/* Filters */}
      <div className="max-w-7xl mx-auto mb-6">
        <POStatusFilter 
          currentFilter={statusFilter}
          onFilterChange={setStatusFilter}
          counts={{
            all: purchaseOrders.length,
            draft: purchaseOrders.filter(po => po.status === 'draft').length,
            pending: purchaseOrders.filter(po => po.status === 'pending').length,
            sent: purchaseOrders.filter(po => po.status === 'sent').length,
            received: purchaseOrders.filter(po => po.status === 'received').length
          }}
        />
      </div>
      
      {/* PO List */}
      <div className="max-w-7xl mx-auto">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
            <p className="mt-4 text-slate-600">Loading purchase orders...</p>
          </div>
        ) : filteredPOs.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="text-6xl mb-4">📦</div>
            <h3 className="text-xl font-semibold text-slate-700 mb-2">
              No Purchase Orders
            </h3>
            <p className="text-slate-600 mb-6">
              {statusFilter === 'all' 
                ? "No purchase orders have been created yet."
                : `No purchase orders with status "${statusFilter}".`}
            </p>
            {statusFilter === 'all' && (
              <button
                onClick={handleGeneratePOs}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Generate Purchase Orders
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPOs.map(po => (
              <POListItem
                key={po.id}
                purchaseOrder={po}
                isExpanded={expandedPOId === po.id}
                onExpand={() => handlePOExpand(po.id)}
                onUpdate={handlePOUpdate}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Floating Guidance Widget */}
      {showGuidance && filteredPOs.some(po => po.status === 'draft') && (
        <FloatingReorderGuidance
          draftPOCount={filteredPOs.filter(po => po.status === 'draft').length}
          onClose={() => setShowGuidance(false)}
        />
      )}
    </div>
  );
}
```

---

## Expandable Row Component

### PO List Item (Collapsed/Expanded)

```typescript
// components/purchase-orders/POListItem.tsx

'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Mail, Check, X, Edit2 } from 'lucide-react';
import type { PurchaseOrder, POLineItem } from '@/types/purchase-orders';

interface POListItemProps {
  purchaseOrder: PurchaseOrder;
  isExpanded: boolean;
  onExpand: () => void;
  onUpdate: (po: PurchaseOrder) => void;
}

export function POListItem({ 
  purchaseOrder, 
  isExpanded, 
  onExpand,
  onUpdate 
}: POListItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedNotes, setEditedNotes] = useState(purchaseOrder.vendor_notes || '');
  
  const statusColors = {
    draft: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    pending: 'bg-blue-100 text-blue-800 border-blue-300',
    sent: 'bg-purple-100 text-purple-800 border-purple-300',
    confirmed: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    partial: 'bg-orange-100 text-orange-800 border-orange-300',
    received: 'bg-green-100 text-green-800 border-green-300',
    cancelled: 'bg-red-100 text-red-800 border-red-300'
  };
  
  const handleApprovePO = async () => {
    try {
      const response = await fetch(`/api/purchase-orders/${purchaseOrder.id}/approve`, {
        method: 'POST'
      });
      
      const data = await response.json();
      if (data.success) {
        onUpdate(data.purchase_order);
      }
    } catch (error) {
      console.error('Failed to approve PO:', error);
    }
  };
  
  const handleGenerateEmail = async () => {
    try {
      const response = await fetch(`/api/purchase-orders/${purchaseOrder.id}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_notes: editedNotes })
      });
      
      const data = await response.json();
      if (data.success) {
        // Open email draft in new window
        const emailWindow = window.open('', '_blank', 'width=800,height=600');
        emailWindow?.document.write(data.email_html);
      }
    } catch (error) {
      console.error('Failed to generate email:', error);
    }
  };
  
  const handleCancelPO = async () => {
    if (!confirm('Are you sure you want to cancel this purchase order?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/purchase-orders/${purchaseOrder.id}/cancel`, {
        method: 'POST'
      });
      
      const data = await response.json();
      if (data.success) {
        onUpdate(data.purchase_order);
      }
    } catch (error) {
      console.error('Failed to cancel PO:', error);
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
      {/* Collapsed Row */}
      <div 
        className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={onExpand}
      >
        <div className="flex items-center justify-between">
          {/* Left: Expand button + PO Info */}
          <div className="flex items-center gap-4 flex-1">
            <button 
              className="text-slate-400 hover:text-slate-600 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onExpand();
              }}
            >
              {isExpanded ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </button>
            
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="font-bold text-lg text-slate-800">
                  {purchaseOrder.po_number}
                </h3>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusColors[purchaseOrder.status]}`}>
                  {purchaseOrder.status.toUpperCase()}
                </span>
                {purchaseOrder.auto_generated && (
                  <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded border border-blue-200">
                    🤖 Auto-Generated
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-6 text-sm text-slate-600">
                <span className="font-medium">{purchaseOrder.vendor_name}</span>
                <span>{purchaseOrder.items?.length || 0} items</span>
                <span>Created {new Date(purchaseOrder.created_at).toLocaleDateString()}</span>
                {purchaseOrder.expected_delivery_date && (
                  <span className="text-blue-600">
                    Expected: {new Date(purchaseOrder.expected_delivery_date).toLocaleDateString()}
                  </span>
                )}
              </div>
              
              {purchaseOrder.generation_reason && (
                <p className="text-xs text-slate-500 mt-1 italic">
                  {purchaseOrder.generation_reason}
                </p>
              )}
            </div>
          </div>
          
          {/* Right: Total */}
          <div className="text-right">
            <div className="text-2xl font-bold text-slate-800">
              ${purchaseOrder.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-slate-500">
              Total
            </div>
          </div>
        </div>
      </div>
      
      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-slate-200 bg-slate-50">
          {/* Action Buttons */}
          <div className="p-4 bg-white border-b border-slate-200">
            <div className="flex items-center gap-3">
              {purchaseOrder.status === 'draft' && (
                <>
                  <button
                    onClick={handleApprovePO}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    <Check className="w-4 h-4" />
                    Approve PO
                  </button>
                  
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit Notes
                  </button>
                </>
              )}
              
              {['pending', 'approved'].includes(purchaseOrder.status) && (
                <button
                  onClick={handleGenerateEmail}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                >
                  <Mail className="w-4 h-4" />
                  Generate Email
                </button>
              )}
              
              {['draft', 'pending'].includes(purchaseOrder.status) && (
                <button
                  onClick={handleCancelPO}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium ml-auto"
                >
                  <X className="w-4 h-4" />
                  Cancel PO
                </button>
              )}
            </div>
          </div>
          
          {/* Notes Editor (if editing) */}
          {isEditing && (
            <div className="p-4 bg-yellow-50 border-b border-yellow-200">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Vendor Notes (included in email):
              </label>
              <textarea
                value={editedNotes}
                onChange={(e) => setEditedNotes(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                placeholder="Add special instructions for the vendor..."
              />
              <button
                onClick={async () => {
                  // Save notes
                  const response = await fetch(`/api/purchase-orders/${purchaseOrder.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ vendor_notes: editedNotes })
                  });
                  
                  if (response.ok) {
                    setIsEditing(false);
                    onUpdate({ ...purchaseOrder, vendor_notes: editedNotes });
                  }
                }}
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save Notes
              </button>
            </div>
          )}
          
          {/* Line Items Table */}
          <div className="p-4">
            <h4 className="font-semibold text-slate-700 mb-3">Order Details:</h4>
            
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-100 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                      SKU
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                      Description
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                      Urgency
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                      Days Stock
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                      Qty
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                      Unit Cost
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {purchaseOrder.items?.map((item: POLineItem) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">
                        {item.sku}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {item.description}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.urgency_level && (
                          <UrgencyBadge level={item.urgency_level} />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-600">
                        {item.days_of_stock_when_ordered?.toFixed(1) || '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-slate-800">
                        {item.qty_ordered}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-600">
                        ${item.unit_cost.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-slate-800">
                        ${item.line_total.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-right font-semibold text-slate-700">
                      Subtotal:
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800">
                      ${purchaseOrder.subtotal.toFixed(2)}
                    </td>
                  </tr>
                  {purchaseOrder.shipping_cost > 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-2 text-right text-sm text-slate-600">
                        Shipping:
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-slate-800">
                        ${purchaseOrder.shipping_cost.toFixed(2)}
                      </td>
                    </tr>
                  )}
                  {purchaseOrder.tax > 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-2 text-right text-sm text-slate-600">
                        Tax:
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-slate-800">
                        ${purchaseOrder.tax.toFixed(2)}
                      </td>
                    </tr>
                  )}
                  <tr className="border-t border-slate-300">
                    <td colSpan={6} className="px-4 py-3 text-right font-bold text-slate-800 text-lg">
                      Total:
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800 text-lg">
                      ${purchaseOrder.total.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Urgency Badge Component
function UrgencyBadge({ level }: { level: string }) {
  const badges = {
    OVERDUE: 'bg-red-100 text-red-800 border-red-300',
    CRITICAL: 'bg-orange-100 text-orange-800 border-orange-300',
    URGENT: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    UPCOMING: 'bg-blue-100 text-blue-800 border-blue-300',
    SUFFICIENT: 'bg-green-100 text-green-800 border-green-300'
  };
  
  return (
    <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold border ${badges[level] || badges.SUFFICIENT}`}>
      {level}
    </span>
  );
}
```

---

## Floating Reorder Guidance Widget

```typescript
// components/purchase-orders/FloatingReorderGuidance.tsx

'use client';

import { useState, useEffect } from 'react';
import { X, TrendingUp, AlertTriangle, DollarSign, Calendar } from 'lucide-react';

interface FloatingReorderGuidanceProps {
  draftPOCount: number;
  onClose: () => void;
}

export function FloatingReorderGuidance({ 
  draftPOCount, 
  onClose 
}: FloatingReorderGuidanceProps) {
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadInsights();
  }, []);
  
  const loadInsights = async () => {
    try {
      const response = await fetch('/api/purchase-orders/insights');
      const data = await response.json();
      
      if (data.success) {
        setInsights(data.insights);
      }
    } catch (error) {
      console.error('Failed to load insights:', error);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <div className="fixed bottom-6 right-6 bg-white rounded-lg shadow-2xl border border-slate-200 p-6 w-96 animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-3/4 mb-4" />
        <div className="h-3 bg-slate-200 rounded w-full mb-2" />
        <div className="h-3 bg-slate-200 rounded w-5/6" />
      </div>
    );
  }
  
  return (
    <div className="fixed bottom-6 right-6 bg-gradient-to-br from-blue-50 to-white rounded-lg shadow-2xl border-2 border-blue-200 w-96 z-50 animate-slide-up">
      {/* Header */}
      <div className="p-4 bg-blue-600 text-white rounded-t-lg flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          <h3 className="font-bold">Reorder Guidance</h3>
        </div>
        <button
          onClick={onClose}
          className="text-white hover:bg-blue-700 rounded p-1 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      
      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Draft PO Count */}
        <div className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-yellow-900">
              {draftPOCount} Draft Purchase Orders
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              Review and approve these auto-generated POs to maintain optimal inventory levels.
            </p>
          </div>
        </div>
        
        {/* Capital Required */}
        {insights?.total_capital_required && (
          <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <DollarSign className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-900">
                ${insights.total_capital_required.toLocaleString()} Required
              </p>
              <p className="text-xs text-blue-700 mt-1">
                Total capital needed for pending purchase orders.
              </p>
            </div>
          </div>
        )}
        
        {/* Urgent Items */}
        {insights?.critical_items_count > 0 && (
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-900">
                {insights.critical_items_count} Critical Items
              </p>
              <p className="text-xs text-red-700 mt-1">
                These items need immediate ordering (&lt;7 days stock remaining).
              </p>
            </div>
          </div>
        )}
        
        {/* Expected Deliveries */}
        {insights?.next_delivery_date && (
          <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <Calendar className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-green-900">
                Next Delivery: {new Date(insights.next_delivery_date).toLocaleDateString()}
              </p>
              <p className="text-xs text-green-700 mt-1">
                {insights.items_arriving} items arriving from {insights.vendors_arriving} vendors.
              </p>
            </div>
          </div>
        )}
        
        {/* AI Recommendations */}
        {insights?.ai_recommendations && insights.ai_recommendations.length > 0 && (
          <div className="border-t border-slate-200 pt-4">
            <h4 className="text-xs font-semibold text-slate-600 uppercase mb-2">
              AI Recommendations:
            </h4>
            <ul className="space-y-2">
              {insights.ai_recommendations.map((rec: string, idx: number) => (
                <li key={idx} className="text-xs text-slate-700 flex items-start gap-2">
                  <span className="text-blue-600 flex-shrink-0">•</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Action Button */}
        <button
          onClick={onClose}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
        >
          Got It!
        </button>
      </div>
    </div>
  );
}
```

---

## Email Draft System

### Email Template Generator

```typescript
// lib/services/emailGenerator.ts

import type { PurchaseOrder, POLineItem } from '@/types/purchase-orders';

export class EmailGenerator {
  
  /**
   * Generate vendor email draft for a purchase order
   */
  generatePOEmail(po: PurchaseOrder, vendorEmail: string): {
    subject: string;
    body_text: string;
    body_html: string;
  } {
    const subject = `Purchase Order ${po.po_number} - BuildASoil`;
    
    const body_text = this.generateTextEmail(po, vendorEmail);
    const body_html = this.generateHTMLEmail(po, vendorEmail);
    
    return {
      subject,
      body_text,
      body_html
    };
  }
  
  /**
   * Plain text version
   */
  private generateTextEmail(po: PurchaseOrder, vendorEmail: string): string {
    const items = po.items.map((item: POLineItem) => 
      `${item.sku} | ${item.description} | Qty: ${item.qty_ordered} | $${item.line_total.toFixed(2)}`
    ).join('\n');
    
    return `
Hello ${po.vendor_name},

Please find our purchase order below:

═══════════════════════════════════════
PURCHASE ORDER: ${po.po_number}
DATE: ${new Date(po.created_at).toLocaleDateString()}
═══════════════════════════════════════

SHIP TO:
BuildASoil
[Your Address]
[City, State ZIP]

ITEMS ORDERED:
${items}

SUBTOTAL: $${po.subtotal.toFixed(2)}
SHIPPING: $${po.shipping_cost.toFixed(2)}
TAX: $${po.tax.toFixed(2)}
TOTAL: $${po.total.toFixed(2)}

${po.vendor_notes ? `SPECIAL INSTRUCTIONS:\n${po.vendor_notes}\n\n` : ''}
═══════════════════════════════════════

IMPORTANT - PLEASE RESPOND TO THIS EMAIL WITH:
1. Order confirmation
2. Expected ship date
3. Tracking number (when available)

Please reply to this email ONLY (do not start a new thread) so we can track this order properly.

Expected delivery: ${po.expected_delivery_date ? new Date(po.expected_delivery_date).toLocaleDateString() : 'TBD'}

Thank you,
BuildASoil Purchasing Team

PO Reference: ${po.po_number}
    `.trim();
  }
  
  /**
   * HTML version (better formatting)
   */
  private generateHTMLEmail(po: PurchaseOrder, vendorEmail: string): string {
    const itemsHTML = po.items.map((item: POLineItem) => `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 12px; text-align: left;">${item.sku}</td>
        <td style="padding: 12px; text-align: left;">${item.description}</td>
        <td style="padding: 12px; text-align: center; font-weight: 600;">${item.qty_ordered}</td>
        <td style="padding: 12px; text-align: right;">$${item.unit_cost.toFixed(2)}</td>
        <td style="padding: 12px; text-align: right; font-weight: 600;">$${item.line_total.toFixed(2)}</td>
      </tr>
    `).join('');
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Purchase Order ${po.po_number}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 28px; font-weight: 700;">BuildASoil</h1>
    <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">Purchase Order</p>
  </div>
  
  <!-- Main Content -->
  <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    
    <!-- Greeting -->
    <p style="font-size: 16px; margin: 0 0 20px 0;">Hello ${po.vendor_name},</p>
    <p style="font-size: 14px; margin: 0 0 30px 0; color: #6b7280;">
      Please find our purchase order below. We look forward to receiving these items by 
      <strong>${po.expected_delivery_date ? new Date(po.expected_delivery_date).toLocaleDateString() : 'TBD'}</strong>.
    </p>
    
    <!-- PO Details -->
    <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; font-weight: 600; color: #374151;">PO Number:</td>
          <td style="padding: 8px 0; text-align: right; font-family: monospace; font-size: 16px; color: #1f2937;">${po.po_number}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: 600; color: #374151;">Date:</td>
          <td style="padding: 8px 0; text-align: right; color: #1f2937;">${new Date(po.created_at).toLocaleDateString()}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: 600; color: #374151;">Expected Delivery:</td>
          <td style="padding: 8px 0; text-align: right; color: #1f2937;">${po.expected_delivery_date ? new Date(po.expected_delivery_date).toLocaleDateString() : 'TBD'}</td>
        </tr>
      </table>
    </div>
    
    <!-- Ship To Address -->
    <div style="margin-bottom: 30px; padding: 15px; border-left: 4px solid #3b82f6; background: #eff6ff;">
      <h3 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: #1e40af; text-transform: uppercase;">Ship To:</h3>
      <p style="margin: 0; font-size: 14px; color: #1f2937;">
        <strong>BuildASoil</strong><br>
        [Your Address]<br>
        [City, State ZIP]<br>
        [Phone Number]
      </p>
    </div>
    
    <!-- Order Items -->
    <h2 style="font-size: 18px; font-weight: 600; color: #1f2937; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e5e7eb;">
      Items Ordered
    </h2>
    
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <thead>
        <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
          <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; font-size: 12px; text-transform: uppercase;">SKU</th>
          <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; font-size: 12px; text-transform: uppercase;">Description</th>
          <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151; font-size: 12px; text-transform: uppercase;">Qty</th>
          <th style="padding: 12px; text-align: right; font-weight: 600; color: #374151; font-size: 12px; text-transform: uppercase;">Unit Price</th>
          <th style="padding: 12px; text-align: right; font-weight: 600; color: #374151; font-size: 12px; text-transform: uppercase;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHTML}
      </tbody>
      <tfoot>
        <tr style="background: #f9fafb; border-top: 2px solid #e5e7eb;">
          <td colspan="4" style="padding: 12px; text-align: right; font-weight: 600; color: #374151;">Subtotal:</td>
          <td style="padding: 12px; text-align: right; font-weight: 600; color: #1f2937;">$${po.subtotal.toFixed(2)}</td>
        </tr>
        ${po.shipping_cost > 0 ? `
        <tr style="background: #f9fafb;">
          <td colspan="4" style="padding: 8px 12px; text-align: right; color: #6b7280; font-size: 14px;">Shipping:</td>
          <td style="padding: 8px 12px; text-align: right; color: #1f2937; font-size: 14px;">$${po.shipping_cost.toFixed(2)}</td>
        </tr>
        ` : ''}
        ${po.tax > 0 ? `
        <tr style="background: #f9fafb;">
          <td colspan="4" style="padding: 8px 12px; text-align: right; color: #6b7280; font-size: 14px;">Tax:</td>
          <td style="padding: 8px 12px; text-align: right; color: #1f2937; font-size: 14px;">$${po.tax.toFixed(2)}</td>
        </tr>
        ` : ''}
        <tr style="background: #dbeafe; border-top: 2px solid #3b82f6;">
          <td colspan="4" style="padding: 15px 12px; text-align: right; font-weight: 700; color: #1e40af; font-size: 16px;">TOTAL:</td>
          <td style="padding: 15px 12px; text-align: right; font-weight: 700; color: #1e40af; font-size: 18px;">$${po.total.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>
    
    <!-- Special Instructions -->
    ${po.vendor_notes ? `
    <div style="margin-bottom: 30px; padding: 15px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
      <h3 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: #92400e; text-transform: uppercase;">Special Instructions:</h3>
      <p style="margin: 0; font-size: 14px; color: #78350f; white-space: pre-wrap;">${po.vendor_notes}</p>
    </div>
    ` : ''}
    
    <!-- Response Instructions -->
    <div style="background: #fee2e2; border: 2px solid #ef4444; border-radius: 8px; padding: 20px; margin-top: 30px;">
      <h3 style="margin: 0 0 15px 0; font-size: 16px; font-weight: 700; color: #991b1b;">
        ⚠️ IMPORTANT - Please Respond to This Email
      </h3>
      <p style="margin: 0 0 15px 0; font-size: 14px; color: #7f1d1d; font-weight: 600;">
        Please <strong>REPLY TO THIS EMAIL</strong> (do not start a new thread) with the following:
      </p>
      <ol style="margin: 0; padding-left: 20px; color: #7f1d1d; font-size: 14px;">
        <li style="margin-bottom: 8px;"><strong>Order Confirmation</strong> - Confirm you received this PO</li>
        <li style="margin-bottom: 8px;"><strong>Expected Ship Date</strong> - When will this order ship?</li>
        <li style="margin-bottom: 8px;"><strong>Tracking Number</strong> - Provide tracking info when available</li>
      </ol>
      <p style="margin: 15px 0 0 0; font-size: 13px; color: #991b1b; font-style: italic;">
        Replying to this exact email helps us track this order automatically in our system.
      </p>
    </div>
    
    <!-- Footer -->
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px;">
      <p style="margin: 0 0 5px 0;">Thank you for your partnership!</p>
      <p style="margin: 0;"><strong>BuildASoil Purchasing Team</strong></p>
      <p style="margin: 10px 0 0 0; font-family: monospace; color: #9ca3af;">
        Reference: ${po.po_number}
      </p>
    </div>
    
  </div>
  
</body>
</html>
    `.trim();
  }
  
  /**
   * Save email draft to database
   */
  async saveEmailDraft(poId: string, emailData: any): Promise<void> {
    const supabase = createClient();
    
    await supabase
      .from('purchase_orders')
      .update({
        email_draft: emailData.body_html
      })
      .eq('id', poId);
  }
}
```

---

## API Routes

### Generate POs Endpoint

```typescript
// app/api/purchase-orders/generate/route.ts

import { NextResponse } from 'next/server';
import { AutoPOGenerator } from '@/lib/services/autoPOGenerator';

export async function POST(request: Request) {
  try {
    const generator = new AutoPOGenerator();
    const result = await generator.generateAutoPOs();
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Auto PO generation error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

### Get POs Endpoint

```typescript
// app/api/purchase-orders/route.ts

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const supabase = createClient();
    
    const { data: purchase_orders, error } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        purchase_order_items (*)
      `)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    // Group items with their POs
    const formattedPOs = purchase_orders.map(po => ({
      ...po,
      items: po.purchase_order_items
    }));
    
    return NextResponse.json({
      success: true,
      purchase_orders: formattedPOs
    });
  } catch (error) {
    console.error('Failed to load purchase orders:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

### Approve PO Endpoint

```typescript
// app/api/purchase-orders/[id]/approve/route.ts

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    
    const { data: po, error } = await supabase
      .from('purchase_orders')
      .update({
        status: 'pending',
        approved_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json({
      success: true,
      purchase_order: po
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

### Generate Email Endpoint

```typescript
// app/api/purchase-orders/[id]/email/route.ts

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EmailGenerator } from '@/lib/services/emailGenerator';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const body = await request.json();
    
    // Get PO with items
    const { data: po, error } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        purchase_order_items (*),
        vendors (
          email,
          purchase_email
        )
      `)
      .eq('id', params.id)
      .single();
    
    if (error) throw error;
    
    // Update vendor notes if provided
    if (body.vendor_notes) {
      await supabase
        .from('purchase_orders')
        .update({ vendor_notes: body.vendor_notes })
        .eq('id', params.id);
      
      po.vendor_notes = body.vendor_notes;
    }
    
    // Generate email
    const generator = new EmailGenerator();
    const vendorEmail = po.vendors.purchase_email || po.vendors.email;
    const emailData = generator.generatePOEmail({
      ...po,
      items: po.purchase_order_items
    }, vendorEmail);
    
    // Save draft
    await generator.saveEmailDraft(params.id, emailData);
    
    // Update PO status
    await supabase
      .from('purchase_orders')
      .update({ 
        status: 'sent',
        sent_at: new Date().toISOString(),
        email_sent: true,
        email_sent_at: new Date().toISOString()
      })
      .eq('id', params.id);
    
    return NextResponse.json({
      success: true,
      email_html: emailData.body_html,
      email_subject: emailData.subject,
      vendor_email: vendorEmail
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

---

## Complete Implementation Steps

### Phase 1: Database Setup (30 minutes)

```bash
# 1. Connect to your Supabase project
# 2. Run the SQL schema from the Database Schema section above
# 3. Verify tables were created:

SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'purchase_orders',
  'purchase_order_items',
  'reorder_queue',
  'auto_po_generation_log'
);
```

### Phase 2: TypeScript Types (15 minutes)

```bash
# Create types file
mkdir -p types
touch types/purchase-orders.ts

# Copy the TypeScript interfaces from the "Core TypeScript Types" section
```

### Phase 3: Backend Services (1 hour)

```bash
# Create services directory
mkdir -p lib/services

# Create the auto PO generator
touch lib/services/autoPOGenerator.ts
# Copy code from "Auto PO Generation Service" section

# Create email generator
touch lib/services/emailGenerator.ts
# Copy code from "Email Template Generator" section
```

### Phase 4: API Routes (30 minutes)

```bash
# Create API endpoints
mkdir -p app/api/purchase-orders/\[id\]/{approve,email,cancel}

# Create each route file:
touch app/api/purchase-orders/route.ts
touch app/api/purchase-orders/generate/route.ts
touch app/api/purchase-orders/[id]/approve/route.ts
touch app/api/purchase-orders/[id]/email/route.ts
touch app/api/purchase-orders/[id]/cancel/route.ts

# Copy respective code from "API Routes" section
```

### Phase 5: UI Components (2 hours)

```bash
# Create components directory
mkdir -p components/purchase-orders

# Create component files
touch components/purchase-orders/POListItem.tsx
touch components/purchase-orders/FloatingReorderGuidance.tsx
touch components/purchase-orders/POStatusFilter.tsx
touch components/purchase-orders/GeneratePOsButton.tsx

# Copy code from respective sections above
```

### Phase 6: Main Page (30 minutes)

```bash
# Create the purchase orders page
mkdir -p app/purchase-orders
touch app/purchase-orders/page.tsx

# Copy code from "Main Page Component" section
```

### Phase 7: Scheduled Job Setup (45 minutes)

```bash
# Option A: Use Supabase Edge Functions (Recommended)

# Create edge function
npx supabase functions new auto-generate-pos

# Function code:
```

```typescript
// supabase/functions/auto-generate-pos/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // Call your auto PO generation logic here
    // This would be a simplified version that calls the same logic
    
    const response = await fetch(`${Deno.env.get('APP_URL')}/api/purchase-orders/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('CRON_SECRET')}`
      }
    });
    
    const data = await response.json();
    
    return new Response(
      JSON.stringify(data),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
```

```bash
# Deploy function
npx supabase functions deploy auto-generate-pos

# Set up cron job in Supabase dashboard:
# Go to Database > Cron Jobs
# Create new job: Run daily at 6:00 AM
# Call: SELECT net.http_post(url := 'YOUR_FUNCTION_URL')
```

### Phase 8: Testing (1 hour)

```bash
# Test checklist:

# ✓ Verify database tables exist
# ✓ Test auto PO generation manually
# ✓ Verify POs appear in UI
# ✓ Test expanding/collapsing rows
# ✓ Test approval workflow
# ✓ Test email generation
# ✓ Test status filters
# ✓ Verify floating guidance widget
# ✓ Test with bulk items (90-120 day lead times)
```

---

## Testing Procedures

### Manual Testing Script

```typescript
// scripts/test-auto-po-generation.ts

/**
 * Run this script to test the auto PO generation system
 * 
 * Usage: npx tsx scripts/test-auto-po-generation.ts
 */

import { AutoPOGenerator } from '@/lib/services/autoPOGenerator';

async function runTest() {
  console.log('🧪 Starting Auto PO Generation Test\n');
  
  const generator = new AutoPOGenerator();
  
  console.log('1️⃣ Analyzing inventory...');
  const result = await generator.generateAutoPOs();
  
  if (result.success) {
    console.log(`✅ SUCCESS: Generated ${result.pos_created} purchase orders\n`);
    
    if (result.pos_created > 0) {
      console.log('✉️ Next steps:');
      console.log('1. Check your Purchase Orders page');
      console.log('2. Review and approve draft POs');
      console.log('3. Generate and send vendor emails');
    } else {
      console.log('ℹ️  No items need reordering at this time');
    }
  } else {
    console.log(`❌ FAILED: ${result.error}`);
  }
}

runTest().catch(console.error);
```

---

## Summary

This complete system provides:

✅ **Automatic PO Generation** - Daily scans create draft POs grouped by vendor  
✅ **Smart Reorder Logic** - Accounts for consumption velocity, lead times, and urgency  
✅ **Expandable UI** - Clean list view with detailed breakdowns on expansion  
✅ **Floating Guidance** - AI-powered insights and recommendations  
✅ **Professional Emails** - Vendor-ready templates with tracking instructions  
✅ **Status Workflow** - Draft → Pending → Sent → Received  
✅ **Bulk Item Support** - Special handling for 90-120 day lead time items  

**Total Implementation Time: ~6-8 hours**

---

## Next Enhancements (Future)

1. **Vendor Portal** - Allow vendors to update status via link
2. **SMS Notifications** - Alert on critical stockouts
3. **Receiving Module** - Scan barcodes to mark items received
4. **Cost Analysis** - Track price changes over time
5. **Seasonal Adjustments** - Auto-adjust quantities for known patterns
6. **Multi-currency** - Support international vendors

---

**Document Version:** 1.0  
**Last Updated:** November 17, 2025  
**Maintained By:** BuildASoil Tech Team / MuRP Development