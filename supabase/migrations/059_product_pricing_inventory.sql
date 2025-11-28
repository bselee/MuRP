-- Migration 059: Product Pricing Inventory Structure
-- Description: Creates comprehensive pricing management system with vendor SKU mapping, approval workflow, and audit tracking
-- Author: MuRP Team
-- Date: 2025-11-28
-- Dependencies: 058_vendor_pricelists.sql

BEGIN;

-- =====================================================
-- VENDOR SKU MAPPING TABLE
-- Maps vendor part numbers/SKUs to internal SKUs
-- =====================================================

CREATE TABLE vendor_sku_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  vendor_sku TEXT NOT NULL,
  internal_sku TEXT NOT NULL REFERENCES inventory_items(sku) ON DELETE CASCADE,
  vendor_product_name TEXT,
  vendor_description TEXT,
  mapping_confidence DECIMAL(3,2) DEFAULT 1.0, -- AI confidence score 0.0-1.0
  mapping_source TEXT DEFAULT 'manual' CHECK (mapping_source IN ('manual', 'ai', 'import', 'pricelist')),
  mapping_notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT,

  -- Ensure unique vendor SKU per vendor
  UNIQUE(vendor_id, vendor_sku)
);

-- =====================================================
-- PRODUCT PRICING TABLE
-- Stores approved pricing for inventory items
-- =====================================================

CREATE TABLE product_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_sku TEXT NOT NULL REFERENCES inventory_items(sku) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,

  -- Current approved pricing
  current_unit_cost DECIMAL(12,4),
  current_unit_price DECIMAL(12,4),
  current_currency VARCHAR(3) DEFAULT 'USD',
  current_effective_date DATE DEFAULT CURRENT_DATE,

  -- Pricing metadata
  pricing_strategy TEXT DEFAULT 'cost_plus' CHECK (pricing_strategy IN ('cost_plus', 'market', 'competition', 'fixed')),
  markup_percentage DECIMAL(5,2) DEFAULT 0,
  margin_percentage DECIMAL(5,2) DEFAULT 0,

  -- Vendor pricing source
  vendor_pricelist_id UUID REFERENCES vendor_pricelists(id),
  vendor_sku_mapping_id UUID REFERENCES vendor_sku_mappings(id),

  -- Approval workflow
  approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'auto_approved')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  approval_notes TEXT,

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

-- =====================================================
-- PRICING CHANGE PROPOSALS
-- Proposed pricing changes from vendor pricelists
-- =====================================================

CREATE TABLE pricing_change_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_pricing_id UUID NOT NULL REFERENCES product_pricing(id) ON DELETE CASCADE,
  vendor_pricelist_id UUID NOT NULL REFERENCES vendor_pricelists(id) ON DELETE CASCADE,

  -- Proposed changes
  proposed_unit_cost DECIMAL(12,4),
  proposed_unit_price DECIMAL(12,4),
  proposed_currency VARCHAR(3) DEFAULT 'USD',
  proposed_effective_date DATE,

  -- Change analysis
  cost_change_amount DECIMAL(12,4),
  cost_change_percentage DECIMAL(5,2),
  price_change_amount DECIMAL(12,4),
  price_change_percentage DECIMAL(5,2),
  change_reason TEXT,
  change_impact TEXT CHECK (change_impact IN ('low', 'medium', 'high', 'critical')),

  -- Source information
  vendor_sku TEXT,
  vendor_product_name TEXT,
  pricelist_item_data JSONB, -- Full pricelist item data

  -- Approval workflow
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'implemented')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  implemented_at TIMESTAMPTZ,
  implemented_by TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

-- =====================================================
-- PRICING AUDIT LOG
-- Complete audit trail for all pricing changes
-- =====================================================

CREATE TABLE pricing_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_pricing_id UUID REFERENCES product_pricing(id) ON DELETE SET NULL,
  pricing_change_proposal_id UUID REFERENCES pricing_change_proposals(id) ON DELETE SET NULL,

  -- What changed
  change_type TEXT NOT NULL CHECK (change_type IN (
    'initial_pricing', 'cost_update', 'price_update', 'approval', 'rejection',
    'implementation', 'mapping_created', 'mapping_updated', 'mapping_deleted'
  )),

  -- Before/after values
  old_values JSONB,
  new_values JSONB,

  -- Context
  internal_sku TEXT,
  vendor_id UUID,
  vendor_sku TEXT,
  change_reason TEXT,
  change_source TEXT DEFAULT 'manual',

  -- Who and when
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Additional metadata
  ip_address INET,
  user_agent TEXT,
  session_id TEXT
);

-- =====================================================
-- PRICING REVISION HISTORY
-- Versioned snapshots of pricing data
-- =====================================================

CREATE TABLE pricing_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_pricing_id UUID NOT NULL REFERENCES product_pricing(id) ON DELETE CASCADE,

  -- Revision number (auto-incremented per product)
  revision_number INTEGER NOT NULL,

  -- Complete pricing snapshot
  unit_cost DECIMAL(12,4),
  unit_price DECIMAL(12,4),
  currency VARCHAR(3),
  effective_date DATE,
  pricing_strategy TEXT,
  markup_percentage DECIMAL(5,2),
  margin_percentage DECIMAL(5,2),

  -- Change metadata
  change_type TEXT NOT NULL,
  change_reason TEXT,
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Revision notes
  revision_notes TEXT,

  UNIQUE(product_pricing_id, revision_number)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Vendor SKU mappings
CREATE INDEX idx_vendor_sku_mappings_vendor ON vendor_sku_mappings(vendor_id);
CREATE INDEX idx_vendor_sku_mappings_internal ON vendor_sku_mappings(internal_sku);
CREATE INDEX idx_vendor_sku_mappings_active ON vendor_sku_mappings(vendor_id, is_active) WHERE is_active = TRUE;

-- Product pricing
CREATE INDEX idx_product_pricing_sku ON product_pricing(internal_sku);
CREATE INDEX idx_product_pricing_vendor ON product_pricing(vendor_id);
CREATE INDEX idx_product_pricing_status ON product_pricing(approval_status);
CREATE INDEX idx_product_pricing_pricelist ON product_pricing(vendor_pricelist_id);

-- Pricing change proposals
CREATE INDEX idx_pricing_proposals_pricing ON pricing_change_proposals(product_pricing_id);
CREATE INDEX idx_pricing_proposals_pricelist ON pricing_change_proposals(vendor_pricelist_id);
CREATE INDEX idx_pricing_proposals_status ON pricing_change_proposals(status);

-- Audit log
CREATE INDEX idx_pricing_audit_pricing ON pricing_audit_log(product_pricing_id);
CREATE INDEX idx_pricing_audit_proposal ON pricing_audit_log(pricing_change_proposal_id);
CREATE INDEX idx_pricing_audit_changed_at ON pricing_audit_log(changed_at DESC);
CREATE INDEX idx_pricing_audit_type ON pricing_audit_log(change_type);

-- Revisions
CREATE INDEX idx_pricing_revisions_pricing ON pricing_revisions(product_pricing_id);
CREATE INDEX idx_pricing_revisions_number ON pricing_revisions(product_pricing_id, revision_number DESC);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to create pricing change proposal from pricelist
CREATE OR REPLACE FUNCTION create_pricing_proposal_from_pricelist(
  p_vendor_pricelist_id UUID,
  p_vendor_sku TEXT,
  p_internal_sku TEXT,
  p_proposed_cost DECIMAL,
  p_proposed_price DECIMAL DEFAULT NULL,
  p_change_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_product_pricing_id UUID;
  v_current_cost DECIMAL;
  v_current_price DECIMAL;
  v_proposal_id UUID;
BEGIN
  -- Get or create product pricing record
  SELECT id, current_unit_cost, current_unit_price
  INTO v_product_pricing_id, v_current_cost, v_current_price
  FROM product_pricing
  WHERE internal_sku = p_internal_sku;

  IF v_product_pricing_id IS NULL THEN
    -- Create new product pricing record
    INSERT INTO product_pricing (
      internal_sku,
      current_unit_cost,
      current_unit_price,
      approval_status
    ) VALUES (
      p_internal_sku,
      p_proposed_cost,
      COALESCE(p_proposed_price, p_proposed_cost * 1.3), -- Default 30% markup
      'pending'
    ) RETURNING id INTO v_product_pricing_id;

    -- Log initial pricing creation
    INSERT INTO pricing_audit_log (
      product_pricing_id,
      change_type,
      new_values,
      internal_sku,
      change_reason,
      change_source
    ) VALUES (
      v_product_pricing_id,
      'initial_pricing',
      jsonb_build_object(
        'unit_cost', p_proposed_cost,
        'unit_price', COALESCE(p_proposed_price, p_proposed_cost * 1.3)
      ),
      p_internal_sku,
      'Created from vendor pricelist',
      'pricelist'
    );
  END IF;

  -- Calculate change amounts
  INSERT INTO pricing_change_proposals (
    product_pricing_id,
    vendor_pricelist_id,
    proposed_unit_cost,
    proposed_unit_price,
    cost_change_amount,
    cost_change_percentage,
    price_change_amount,
    price_change_percentage,
    change_reason,
    vendor_sku,
    change_impact
  ) VALUES (
    v_product_pricing_id,
    p_vendor_pricelist_id,
    p_proposed_cost,
    COALESCE(p_proposed_price, v_current_price),
    p_proposed_cost - COALESCE(v_current_cost, 0),
    CASE WHEN v_current_cost > 0 THEN
      ROUND(((p_proposed_cost - v_current_cost) / v_current_cost * 100)::numeric, 2)
    ELSE NULL END,
    COALESCE(p_proposed_price, v_current_price) - COALESCE(v_current_price, 0),
    CASE WHEN v_current_price > 0 THEN
      ROUND(((COALESCE(p_proposed_price, v_current_price) - v_current_price) / v_current_price * 100)::numeric, 2)
    ELSE NULL END,
    COALESCE(p_change_reason, 'Vendor pricelist update'),
    p_vendor_sku,
    CASE
      WHEN ABS(COALESCE(p_proposed_cost - v_current_cost, 0) / GREATEST(v_current_cost, 1) * 100) > 20 THEN 'critical'
      WHEN ABS(COALESCE(p_proposed_cost - v_current_cost, 0) / GREATEST(v_current_cost, 1) * 100) > 10 THEN 'high'
      WHEN ABS(COALESCE(p_proposed_cost - v_current_cost, 0) / GREATEST(v_current_cost, 1) * 100) > 5 THEN 'medium'
      ELSE 'low'
    END
  ) RETURNING id INTO v_proposal_id;

  RETURN v_proposal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to approve and implement pricing change
CREATE OR REPLACE FUNCTION approve_pricing_change(
  p_proposal_id UUID,
  p_approved_by TEXT,
  p_approval_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_proposal RECORD;
  v_old_values JSONB;
BEGIN
  -- Get proposal details
  SELECT * INTO v_proposal
  FROM pricing_change_proposals
  WHERE id = p_proposal_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Get current values for audit
  SELECT jsonb_build_object(
    'unit_cost', current_unit_cost,
    'unit_price', current_unit_price,
    'currency', current_currency,
    'effective_date', current_effective_date
  ) INTO v_old_values
  FROM product_pricing
  WHERE id = v_proposal.product_pricing_id;

  -- Update product pricing
  UPDATE product_pricing
  SET
    current_unit_cost = v_proposal.proposed_unit_cost,
    current_unit_price = v_proposal.proposed_unit_price,
    current_currency = v_proposal.proposed_currency,
    current_effective_date = COALESCE(v_proposal.proposed_effective_date, CURRENT_DATE),
    approval_status = 'approved',
    approved_by = p_approved_by,
    approved_at = NOW(),
    approval_notes = p_approval_notes,
    updated_at = NOW(),
    updated_by = p_approved_by
  WHERE id = v_proposal.product_pricing_id;

  -- Update proposal status
  UPDATE pricing_change_proposals
  SET
    status = 'implemented',
    reviewed_by = p_approved_by,
    reviewed_at = NOW(),
    review_notes = p_approval_notes,
    implemented_at = NOW(),
    implemented_by = p_approved_by,
    updated_at = NOW()
  WHERE id = p_proposal_id;

  -- Create revision record
  INSERT INTO pricing_revisions (
    product_pricing_id,
    revision_number,
    unit_cost,
    unit_price,
    currency,
    effective_date,
    change_type,
    change_reason,
    changed_by
  )
  SELECT
    v_proposal.product_pricing_id,
    COALESCE(MAX(revision_number), 0) + 1,
    v_proposal.proposed_unit_cost,
    v_proposal.proposed_unit_price,
    v_proposal.proposed_currency,
    COALESCE(v_proposal.proposed_effective_date, CURRENT_DATE),
    'cost_update',
    v_proposal.change_reason,
    p_approved_by
  FROM pricing_revisions
  WHERE product_pricing_id = v_proposal.product_pricing_id;

  -- Log audit entry
  INSERT INTO pricing_audit_log (
    product_pricing_id,
    pricing_change_proposal_id,
    change_type,
    old_values,
    new_values,
    change_reason,
    changed_by,
    change_source
  ) VALUES (
    v_proposal.product_pricing_id,
    p_proposal_id,
    'implementation',
    v_old_values,
    jsonb_build_object(
      'unit_cost', v_proposal.proposed_unit_cost,
      'unit_price', v_proposal.proposed_unit_price,
      'currency', v_proposal.proposed_currency,
      'effective_date', COALESCE(v_proposal.proposed_effective_date, CURRENT_DATE)
    ),
    v_proposal.change_reason,
    p_approved_by,
    'approval'
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get pricing dashboard data
CREATE OR REPLACE FUNCTION get_pricing_dashboard_data()
RETURNS TABLE (
  total_products INTEGER,
  pending_proposals INTEGER,
  approved_today INTEGER,
  critical_changes INTEGER,
  total_inventory_value DECIMAL,
  avg_margin_percentage DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM product_pricing) as total_products,
    (SELECT COUNT(*) FROM pricing_change_proposals WHERE status = 'pending') as pending_proposals,
    (SELECT COUNT(*) FROM pricing_change_proposals
     WHERE status = 'implemented' AND DATE(implemented_at) = CURRENT_DATE) as approved_today,
    (SELECT COUNT(*) FROM pricing_change_proposals
     WHERE status = 'pending' AND change_impact = 'critical') as critical_changes,
    (SELECT COALESCE(SUM(ii.units_in_stock * pp.current_unit_cost), 0)
     FROM inventory_items ii
     JOIN product_pricing pp ON ii.sku = pp.internal_sku) as total_inventory_value,
    (SELECT ROUND(AVG(
       CASE WHEN pp.current_unit_cost > 0
       THEN ((pp.current_unit_price - pp.current_unit_cost) / pp.current_unit_cost * 100)
       ELSE 0 END
     ), 2) FROM product_pricing pp) as avg_margin_percentage;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_pricing_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vendor_sku_mappings_updated
  BEFORE UPDATE ON vendor_sku_mappings
  FOR EACH ROW EXECUTE FUNCTION update_pricing_timestamp();

CREATE TRIGGER trg_product_pricing_updated
  BEFORE UPDATE ON product_pricing
  FOR EACH ROW EXECUTE FUNCTION update_pricing_timestamp();

CREATE TRIGGER trg_pricing_proposals_updated
  BEFORE UPDATE ON pricing_change_proposals
  FOR EACH ROW EXECUTE FUNCTION update_pricing_timestamp();

-- Audit trigger for pricing changes
CREATE OR REPLACE FUNCTION audit_pricing_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO pricing_audit_log (
      product_pricing_id,
      change_type,
      new_values,
      internal_sku,
      vendor_id,
      change_reason,
      changed_by,
      change_source
    ) VALUES (
      NEW.id,
      'initial_pricing',
      row_to_json(NEW)::jsonb,
      NEW.internal_sku,
      NEW.vendor_id,
      'Product pricing created',
      NEW.created_by,
      'system'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO pricing_audit_log (
      product_pricing_id,
      change_type,
      old_values,
      new_values,
      internal_sku,
      vendor_id,
      change_reason,
      changed_by,
      change_source
    ) VALUES (
      NEW.id,
      CASE
        WHEN OLD.approval_status != NEW.approval_status THEN 'approval'
        ELSE 'price_update'
      END,
      row_to_json(OLD)::jsonb,
      row_to_json(NEW)::jsonb,
      NEW.internal_sku,
      NEW.vendor_id,
      COALESCE(NEW.approval_notes, 'Pricing updated'),
      COALESCE(NEW.updated_by, NEW.approved_by),
      'system'
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_product_pricing_audit
  AFTER INSERT OR UPDATE ON product_pricing
  FOR EACH ROW EXECUTE FUNCTION audit_pricing_changes();

-- =====================================================
-- RLS POLICIES
-- =====================================================

ALTER TABLE vendor_sku_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_change_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_revisions ENABLE ROW LEVEL SECURITY;

-- Vendor SKU mappings - authenticated users can read, managers can write
CREATE POLICY "Staff can view vendor SKU mappings"
  ON vendor_sku_mappings FOR SELECT
  USING (auth.jwt() ->> 'role' IN ('staff', 'manager', 'admin'));

CREATE POLICY "Managers can manage vendor SKU mappings"
  ON vendor_sku_mappings FOR ALL
  USING (auth.jwt() ->> 'role' IN ('manager', 'admin'));

-- Product pricing - authenticated users can read, managers can write
CREATE POLICY "Staff can view product pricing"
  ON product_pricing FOR SELECT
  USING (auth.jwt() ->> 'role' IN ('staff', 'manager', 'admin'));

CREATE POLICY "Managers can manage product pricing"
  ON product_pricing FOR ALL
  USING (auth.jwt() ->> 'role' IN ('manager', 'admin'));

-- Pricing proposals - authenticated users can read, managers can approve
CREATE POLICY "Staff can view pricing proposals"
  ON pricing_change_proposals FOR SELECT
  USING (auth.jwt() ->> 'role' IN ('staff', 'manager', 'admin'));

CREATE POLICY "Managers can manage pricing proposals"
  ON pricing_change_proposals FOR ALL
  USING (auth.jwt() ->> 'role' IN ('manager', 'admin'));

-- Audit log - read-only for all authenticated users
CREATE POLICY "Authenticated users can view pricing audit"
  ON pricing_audit_log FOR SELECT
  USING (auth.role() = 'authenticated');

-- Revisions - read-only for authenticated users
CREATE POLICY "Authenticated users can view pricing revisions"
  ON pricing_revisions FOR SELECT
  USING (auth.role() = 'authenticated');

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- Add pricing configuration settings
INSERT INTO app_settings (key, value, description)
VALUES
  ('pricing_config', '{
    "auto_approve_under_percentage": 5,
    "require_manager_approval_over_percentage": 10,
    "default_markup_percentage": 30,
    "currency": "USD",
    "audit_retention_days": 365,
    "notification_channels": ["email", "dashboard"]
  }', 'Product pricing system configuration'),
  ('pricing_notifications', '{
    "notify_on_critical_changes": true,
    "notify_on_pending_proposals": true,
    "daily_summary_enabled": true,
    "weekly_report_enabled": true
  }', 'Pricing change notification settings')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- VIEWS FOR UI
-- =====================================================

-- Comprehensive pricing view
CREATE OR REPLACE VIEW pricing_management_view AS
SELECT
  pp.id,
  pp.internal_sku,
  ii.name as product_name,
  ii.description as product_description,
  pp.vendor_id,
  v.name as vendor_name,
  pp.current_unit_cost,
  pp.current_unit_price,
  pp.current_currency,
  pp.current_effective_date,
  pp.pricing_strategy,
  pp.markup_percentage,
  pp.margin_percentage,
  pp.approval_status,
  pp.approved_by,
  pp.approved_at,
  pp.approval_notes,

  -- Pending proposals
  pcp.id as pending_proposal_id,
  pcp.proposed_unit_cost,
  pcp.proposed_unit_price,
  pcp.cost_change_percentage,
  pcp.price_change_percentage,
  pcp.change_impact,
  pcp.change_reason,
  pcp.created_at as proposal_created_at,

  -- Vendor SKU mapping
  vsm.vendor_sku,
  vsm.vendor_product_name,
  vsm.mapping_confidence,

  -- Calculated fields
  CASE WHEN pp.current_unit_cost > 0
    THEN ROUND(((pp.current_unit_price - pp.current_unit_cost) / pp.current_unit_cost * 100)::numeric, 2)
    ELSE 0
  END as current_margin_pct,

  CASE WHEN pcp.proposed_unit_cost > 0
    THEN ROUND(((pcp.proposed_unit_price - pcp.proposed_unit_cost) / pcp.proposed_unit_cost * 100)::numeric, 2)
    ELSE 0
  END as proposed_margin_pct

FROM product_pricing pp
LEFT JOIN inventory_items ii ON pp.internal_sku = ii.sku
LEFT JOIN vendors v ON pp.vendor_id = v.id
LEFT JOIN vendor_sku_mappings vsm ON pp.vendor_sku_mapping_id = vsm.id
LEFT JOIN pricing_change_proposals pcp ON pp.id = pcp.product_pricing_id
  AND pcp.status = 'pending'
ORDER BY pp.updated_at DESC;

COMMENT ON VIEW pricing_management_view IS 'Comprehensive view for pricing management UI';

-- Pricing proposals queue
CREATE OR REPLACE VIEW pricing_proposals_queue AS
SELECT
  pcp.*,
  pp.internal_sku,
  ii.name as product_name,
  v.name as vendor_name,
  vsm.vendor_sku,
  vsm.vendor_product_name,
  CASE
    WHEN pcp.change_impact = 'critical' THEN 4
    WHEN pcp.change_impact = 'high' THEN 3
    WHEN pcp.change_impact = 'medium' THEN 2
    ELSE 1
  END as priority_score
FROM pricing_change_proposals pcp
JOIN product_pricing pp ON pcp.product_pricing_id = pp.id
LEFT JOIN inventory_items ii ON pp.internal_sku = ii.sku
LEFT JOIN vendors v ON pp.vendor_id = v.id
LEFT JOIN vendor_sku_mappings vsm ON pp.vendor_sku_mapping_id = vsm.id
WHERE pcp.status = 'pending'
ORDER BY priority_score DESC, pcp.created_at ASC;

COMMENT ON VIEW pricing_proposals_queue IS 'Prioritized queue of pending pricing change proposals';

COMMIT;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

COMMENT ON SCHEMA public IS 'Migration 059: Product Pricing Inventory Structure - Complete';

</content>
<parameter name="filePath">/workspaces/TGF-MRP/supabase/migrations/059_product_pricing_inventory.sql