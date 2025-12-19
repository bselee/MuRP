-- Migration: 104_agent_sop_and_learning_system.sql
-- Description: Create agent-accessible SOP system with learning capabilities
-- Purpose: Allow AI agents to understand item classifications, follow SOPs, and learn from patterns
-- Date: 2025-12-19

-- ============================================================================
-- PHASE 1: Create Item Flow SOPs Table
-- Rich, structured SOPs that agents can query and follow
-- ============================================================================

CREATE TABLE IF NOT EXISTS item_flow_sops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_type VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,

  -- Agent-readable SOP content (structured for LLM consumption)
  sop_summary TEXT NOT NULL,  -- One-paragraph summary for quick context
  sop_steps JSONB NOT NULL DEFAULT '[]',  -- Ordered steps: [{step: 1, action: "...", details: "..."}]
  sop_rules JSONB NOT NULL DEFAULT '[]',  -- Business rules: [{rule: "...", priority: "critical|high|medium|low"}]
  sop_exceptions JSONB NOT NULL DEFAULT '[]',  -- Known exceptions: [{condition: "...", handling: "..."}]

  -- Agent behavior configuration
  agent_actions JSONB NOT NULL DEFAULT '{}',  -- What agents can/should do for this flow type
  alert_thresholds JSONB NOT NULL DEFAULT '{}',  -- When to alert for this flow type
  automation_level VARCHAR(20) DEFAULT 'assisted',  -- 'manual', 'assisted', 'autonomous'

  -- Stock Intelligence behavior
  include_in_stock_intel BOOLEAN DEFAULT false,
  stock_intel_exceptions TEXT,  -- When to include despite default exclusion

  -- Reorder behavior
  triggers_reorder_alerts BOOLEAN DEFAULT false,
  reorder_logic TEXT,  -- How reorder works for this flow type

  -- Vendor interaction
  vendor_communication_template TEXT,  -- Template for vendor emails
  requires_vendor_confirmation BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  version INTEGER DEFAULT 1
);

COMMENT ON TABLE item_flow_sops IS 'Standard Operating Procedures for each item flow type - designed for agent consumption';

-- Insert default SOPs for each flow type
INSERT INTO item_flow_sops (flow_type, display_name, description, sop_summary, sop_steps, sop_rules, agent_actions, alert_thresholds, include_in_stock_intel, triggers_reorder_alerts)
VALUES
  ('standard', 'Standard Stocked Items',
   'Regular inventory items that are stocked in warehouse and reordered based on consumption',
   'Standard items follow the normal reorder process. Monitor stock levels against ROP (Reorder Point). When stock + on_order falls below ROP, generate a reorder recommendation. Consider lead time, safety stock, and demand variability when calculating order quantities.',
   '[
     {"step": 1, "action": "Monitor Inventory Position", "details": "Track stock + on_order against calculated ROP daily"},
     {"step": 2, "action": "Trigger Reorder Alert", "details": "When inventory position < ROP, add to reorder recommendations"},
     {"step": 3, "action": "Calculate Order Quantity", "details": "Use EOQ or (ROP - current position + safety stock + lead time demand)"},
     {"step": 4, "action": "Generate PO Draft", "details": "Create draft PO for vendor with calculated quantity"},
     {"step": 5, "action": "Track Delivery", "details": "Monitor expected vs actual delivery dates"}
   ]',
   '[
     {"rule": "Never let stock go negative without alerting", "priority": "critical"},
     {"rule": "Include safety stock in all ROP calculations", "priority": "high"},
     {"rule": "Consider vendor MOQ when ordering", "priority": "medium"},
     {"rule": "Aggregate orders to same vendor when possible", "priority": "low"}
   ]',
   '{"can_generate_po_draft": true, "can_send_alerts": true, "can_update_rop": true, "can_suggest_classification_change": true}',
   '{"critical_days": 3, "high_days": 7, "medium_days": 14}',
   true, true),

  ('dropship', 'Dropship Items',
   'Items shipped directly from vendor to customer - not stocked in warehouse',
   'Dropship items are NOT stocked and should NOT appear in Stock Intelligence. When a customer order comes in, generate a PO to the vendor for direct shipment. Track vendor fulfillment but do not track warehouse stock levels. These items have their own workflow separate from standard reordering.',
   '[
     {"step": 1, "action": "Receive Customer Order", "details": "Customer order triggers dropship workflow"},
     {"step": 2, "action": "Generate Vendor PO", "details": "Create PO with customer shipping address"},
     {"step": 3, "action": "Send to Vendor", "details": "Transmit PO to vendor for fulfillment"},
     {"step": 4, "action": "Track Shipment", "details": "Monitor vendor shipment to customer"},
     {"step": 5, "action": "Confirm Delivery", "details": "Verify customer received shipment"}
   ]',
   '[
     {"rule": "NEVER show in Stock Intelligence", "priority": "critical"},
     {"rule": "NEVER generate stock-based reorder alerts", "priority": "critical"},
     {"rule": "Always include customer shipping info in vendor PO", "priority": "high"},
     {"rule": "Track vendor fulfillment separately from stock items", "priority": "high"}
   ]',
   '{"can_generate_po_draft": true, "can_send_alerts": false, "can_update_rop": false, "requires_customer_order": true}',
   '{"vendor_response_hours": 24, "shipment_tracking_days": 3}',
   false, false),

  ('special_order', 'Special Order Items',
   'Items ordered specifically for a customer request - not regularly stocked',
   'Special order items are procured only when a customer requests them. Do not maintain stock or generate automatic reorder alerts. When customer requests item, verify availability with vendor, get customer approval on lead time and price, then order. Track as customer-specific order.',
   '[
     {"step": 1, "action": "Receive Customer Request", "details": "Customer requests item not in regular stock"},
     {"step": 2, "action": "Check Vendor Availability", "details": "Query vendor for availability, price, lead time"},
     {"step": 3, "action": "Get Customer Approval", "details": "Confirm customer accepts terms before ordering"},
     {"step": 4, "action": "Generate Customer-Linked PO", "details": "Create PO linked to specific customer order"},
     {"step": 5, "action": "Notify Customer on Receipt", "details": "Alert customer when item arrives"}
   ]',
   '[
     {"rule": "NEVER auto-reorder special order items", "priority": "critical"},
     {"rule": "Always link PO to customer order", "priority": "high"},
     {"rule": "Get customer approval before ordering", "priority": "high"},
     {"rule": "Track separately from regular inventory", "priority": "medium"}
   ]',
   '{"can_generate_po_draft": true, "can_send_alerts": true, "requires_customer_order": true, "requires_approval": true}',
   '{"customer_response_hours": 48}',
   false, false),

  ('consignment', 'Consignment Items',
   'Vendor-owned inventory stored at our location - pay vendor only when sold',
   'Consignment items are owned by the vendor until sold. Track stock levels but do not generate purchase orders. Report sales to vendor for invoicing. Monitor stock minimums as vendor responsibility.',
   '[
     {"step": 1, "action": "Track Stock Levels", "details": "Monitor consignment stock on hand"},
     {"step": 2, "action": "Record Sales", "details": "Track when consignment items are sold"},
     {"step": 3, "action": "Generate Sales Report", "details": "Report sales to vendor for invoicing"},
     {"step": 4, "action": "Alert Low Stock", "details": "Notify vendor when stock below minimum"},
     {"step": 5, "action": "Receive Replenishment", "details": "Vendor sends more stock as needed"}
   ]',
   '[
     {"rule": "Do NOT generate purchase orders", "priority": "critical"},
     {"rule": "Track sales for vendor invoicing", "priority": "high"},
     {"rule": "Alert vendor (not internal) for low stock", "priority": "high"},
     {"rule": "Different accounting treatment - not our cost until sold", "priority": "medium"}
   ]',
   '{"can_generate_po_draft": false, "can_send_vendor_stock_alert": true, "can_generate_sales_report": true}',
   '{"vendor_stock_alert_days": 7}',
   false, false),

  ('made_to_order', 'Made to Order / Production Items',
   'Items manufactured on demand - no stock maintained',
   'Made-to-order items are produced only when ordered. Do not maintain inventory. When order received, trigger production workflow. Track production schedule and lead times.',
   '[
     {"step": 1, "action": "Receive Order", "details": "Customer or internal order triggers production"},
     {"step": 2, "action": "Create Production Order", "details": "Generate production/work order"},
     {"step": 3, "action": "Check Component Availability", "details": "Verify BOM components are available"},
     {"step": 4, "action": "Schedule Production", "details": "Add to production calendar"},
     {"step": 5, "action": "Track Production", "details": "Monitor production progress and completion"}
   ]',
   '[
     {"rule": "No stock-based reordering", "priority": "critical"},
     {"rule": "Check BOM component availability before committing", "priority": "high"},
     {"rule": "Production lead time determines delivery promise", "priority": "high"}
   ]',
   '{"can_generate_production_order": true, "can_check_bom_availability": true, "can_send_alerts": true}',
   '{"production_delay_hours": 24}',
   false, false),

  ('discontinued', 'Discontinued Items',
   'Items no longer ordered - sell through remaining stock only',
   'Discontinued items should not be reordered. Sell through any remaining stock. Monitor for when stock reaches zero. Consider clearance pricing. Eventually archive when fully depleted.',
   '[
     {"step": 1, "action": "Mark as Discontinued", "details": "Item flagged as discontinued in system"},
     {"step": 2, "action": "Stop Reorder Alerts", "details": "Disable all reorder recommendations"},
     {"step": 3, "action": "Monitor Sell-Through", "details": "Track remaining stock depletion"},
     {"step": 4, "action": "Consider Clearance", "details": "Suggest clearance pricing if stock aging"},
     {"step": 5, "action": "Archive When Depleted", "details": "Move to archive when stock = 0"}
   ]',
   '[
     {"rule": "NEVER generate reorder alerts", "priority": "critical"},
     {"rule": "Track remaining stock for sell-through", "priority": "medium"},
     {"rule": "Suggest clearance if stock > 90 days old", "priority": "low"}
   ]',
   '{"can_generate_po_draft": false, "can_suggest_clearance": true, "can_archive": true}',
   '{"clearance_suggestion_days": 90}',
   false, false)
ON CONFLICT (flow_type) DO NOTHING;

-- ============================================================================
-- PHASE 2: Create Agent Classification Context View
-- Single view agents can query to understand any item's classification
-- ============================================================================

CREATE OR REPLACE VIEW agent_classification_context AS
SELECT
  i.sku,
  i.name,
  i.category,
  i.status,
  i.is_dropship,
  COALESCE(i.item_flow_type, 'standard') as flow_type,
  i.stock_intel_exclude,
  i.stock_intel_exclusion_reason,
  i.stock_intel_override,
  i.stock as current_stock,
  i.on_order,
  i.reorder_point,
  i.moq,
  i.lead_time_days,
  i.sales_velocity_consolidated as daily_velocity,
  -- SOP context for agent
  sop.display_name as flow_type_display,
  sop.sop_summary,
  sop.sop_rules,
  sop.agent_actions,
  sop.include_in_stock_intel as sop_includes_in_stock_intel,
  sop.triggers_reorder_alerts as sop_triggers_reorder,
  sop.automation_level,
  -- Derived fields for agent decision-making
  CASE
    WHEN i.stock_intel_override = true THEN
      CASE WHEN i.stock_intel_exclude = true THEN false ELSE true END
    WHEN i.stock_intel_exclude = true THEN false
    WHEN COALESCE(i.item_flow_type, 'standard') IN ('dropship', 'consignment', 'made_to_order', 'discontinued') THEN false
    WHEN i.is_dropship = true THEN false
    WHEN LOWER(COALESCE(i.category, '')) IN ('dropship', 'drop ship', 'deprecating', 'deprecated') THEN false
    ELSE true
  END as visible_in_stock_intel,
  CASE
    WHEN COALESCE(i.item_flow_type, 'standard') IN ('standard') AND i.stock_intel_exclude != true THEN true
    ELSE false
  END as should_trigger_reorder_alerts,
  -- Agent instruction summary
  CASE COALESCE(i.item_flow_type, 'standard')
    WHEN 'standard' THEN 'Monitor stock, generate reorder alerts, can create PO drafts'
    WHEN 'dropship' THEN 'DO NOT show in stock intel, requires customer order to generate PO'
    WHEN 'special_order' THEN 'DO NOT auto-reorder, requires customer request and approval'
    WHEN 'consignment' THEN 'DO NOT create POs, report sales to vendor, vendor manages stock'
    WHEN 'made_to_order' THEN 'DO NOT stock, trigger production workflow on order'
    WHEN 'discontinued' THEN 'DO NOT reorder, sell through remaining, suggest clearance'
    ELSE 'Unknown flow type - treat as standard with caution'
  END as agent_instruction_summary
FROM inventory_items i
LEFT JOIN item_flow_sops sop ON sop.flow_type = COALESCE(i.item_flow_type, 'standard');

COMMENT ON VIEW agent_classification_context IS 'Agent-friendly view of item classification with SOP context - query this before taking action on any item';

-- ============================================================================
-- PHASE 3: Create Agent Classification Suggestions Table
-- For agents to suggest classification changes based on patterns
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_classification_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(100) NOT NULL,
  suggested_flow_type VARCHAR(50) NOT NULL,
  current_flow_type VARCHAR(50),
  confidence_score DECIMAL(5,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
  reasoning TEXT NOT NULL,  -- Agent's explanation for suggestion
  evidence JSONB DEFAULT '{}',  -- Supporting data: patterns, sales data, etc.

  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'auto_applied')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  -- Agent context
  agent_name VARCHAR(100) NOT NULL,  -- Which agent made suggestion
  agent_session_id TEXT,  -- For tracing
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE agent_classification_suggestions IS 'Agent-generated suggestions for item classification changes';

CREATE INDEX IF NOT EXISTS idx_agent_suggestions_sku ON agent_classification_suggestions(sku);
CREATE INDEX IF NOT EXISTS idx_agent_suggestions_status ON agent_classification_suggestions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_suggestions_agent ON agent_classification_suggestions(agent_name, created_at DESC);

-- ============================================================================
-- PHASE 4: Create Agent SOP Interactions Log
-- Track how agents use SOPs for learning and improvement
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_sop_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name VARCHAR(100) NOT NULL,
  flow_type VARCHAR(50) NOT NULL,
  sku VARCHAR(100),  -- Optional: specific item involved

  -- What happened
  interaction_type VARCHAR(50) NOT NULL,  -- 'sop_query', 'rule_followed', 'rule_exception', 'action_taken'
  action_taken TEXT,
  rule_applied TEXT,
  exception_reason TEXT,

  -- Outcome tracking
  outcome VARCHAR(20),  -- 'success', 'partial', 'failed', 'pending'
  outcome_notes TEXT,

  -- Context for learning
  context_snapshot JSONB DEFAULT '{}',  -- Relevant data at time of interaction

  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE agent_sop_interactions IS 'Log of agent interactions with SOPs for learning and improvement';

CREATE INDEX IF NOT EXISTS idx_agent_sop_interactions_agent ON agent_sop_interactions(agent_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_sop_interactions_flow ON agent_sop_interactions(flow_type, created_at DESC);

-- ============================================================================
-- PHASE 5: Create Helper Functions for Agents
-- ============================================================================

-- Function: Get SOP for a specific item
CREATE OR REPLACE FUNCTION get_item_sop(p_sku VARCHAR)
RETURNS TABLE (
  sku VARCHAR,
  flow_type VARCHAR,
  sop_summary TEXT,
  sop_steps JSONB,
  sop_rules JSONB,
  agent_actions JSONB,
  agent_instruction TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ctx.sku,
    ctx.flow_type,
    ctx.sop_summary,
    sop.sop_steps,
    ctx.sop_rules,
    ctx.agent_actions,
    ctx.agent_instruction_summary
  FROM agent_classification_context ctx
  LEFT JOIN item_flow_sops sop ON sop.flow_type = ctx.flow_type
  WHERE ctx.sku = p_sku;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_item_sop IS 'Get the applicable SOP for a specific item - use this before taking action';

-- Function: Log agent SOP interaction
CREATE OR REPLACE FUNCTION log_agent_sop_interaction(
  p_agent_name VARCHAR,
  p_flow_type VARCHAR,
  p_interaction_type VARCHAR,
  p_sku VARCHAR DEFAULT NULL,
  p_action_taken TEXT DEFAULT NULL,
  p_rule_applied TEXT DEFAULT NULL,
  p_exception_reason TEXT DEFAULT NULL,
  p_context JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO agent_sop_interactions (
    agent_name, flow_type, sku, interaction_type,
    action_taken, rule_applied, exception_reason, context_snapshot
  ) VALUES (
    p_agent_name, p_flow_type, p_sku, p_interaction_type,
    p_action_taken, p_rule_applied, p_exception_reason, p_context
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_agent_sop_interaction IS 'Log an agent interaction with SOP for learning purposes';

-- Function: Suggest classification change
CREATE OR REPLACE FUNCTION suggest_classification_change(
  p_sku VARCHAR,
  p_suggested_flow_type VARCHAR,
  p_agent_name VARCHAR,
  p_confidence DECIMAL,
  p_reasoning TEXT,
  p_evidence JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_current_flow_type VARCHAR;
BEGIN
  -- Get current flow type
  SELECT COALESCE(item_flow_type, 'standard') INTO v_current_flow_type
  FROM inventory_items
  WHERE sku = p_sku;

  -- Don't suggest if already this type
  IF v_current_flow_type = p_suggested_flow_type THEN
    RETURN NULL;
  END IF;

  -- Insert suggestion
  INSERT INTO agent_classification_suggestions (
    sku, suggested_flow_type, current_flow_type,
    confidence_score, reasoning, evidence, agent_name
  ) VALUES (
    p_sku, p_suggested_flow_type, v_current_flow_type,
    p_confidence, p_reasoning, p_evidence, p_agent_name
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION suggest_classification_change IS 'Agent function to suggest a classification change for review';

-- ============================================================================
-- PHASE 6: Create Agent Learning Summary View
-- ============================================================================

CREATE OR REPLACE VIEW agent_sop_learning_summary AS
SELECT
  agent_name,
  flow_type,
  COUNT(*) as total_interactions,
  COUNT(CASE WHEN outcome = 'success' THEN 1 END) as successful,
  COUNT(CASE WHEN outcome = 'failed' THEN 1 END) as failed,
  COUNT(CASE WHEN interaction_type = 'rule_exception' THEN 1 END) as exceptions,
  MAX(created_at) as last_interaction,
  ROUND(
    100.0 * COUNT(CASE WHEN outcome = 'success' THEN 1 END) / NULLIF(COUNT(*), 0),
    1
  ) as success_rate
FROM agent_sop_interactions
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY agent_name, flow_type;

COMMENT ON VIEW agent_sop_learning_summary IS 'Summary of agent SOP interactions for performance monitoring';

-- ============================================================================
-- PHASE 7: Verification
-- ============================================================================

DO $$
DECLARE
  v_sop_count INTEGER;
  v_items_with_context INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_sop_count FROM item_flow_sops;
  SELECT COUNT(*) INTO v_items_with_context FROM agent_classification_context;

  RAISE NOTICE 'Migration 104 completed successfully!';
  RAISE NOTICE 'SOPs defined: %', v_sop_count;
  RAISE NOTICE 'Items with classification context: %', v_items_with_context;
END $$;
