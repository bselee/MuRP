-- Migration: Seed Built-in Agents and Skills
-- Purpose: Populate the agent_definitions and skill_definitions tables with
-- the built-in agents and skills that were previously hardcoded in agentManagementService.ts
-- This ensures agents and skills are available from the database, not just in-memory defaults.

-- ============================================================
-- BUILT-IN AGENTS
-- ============================================================

INSERT INTO public.agent_definitions (
    identifier,
    name,
    description,
    category,
    icon,
    system_prompt,
    autonomy_level,
    capabilities,
    triggers,
    parameters,
    mcp_tools,
    allowed_tools,
    is_active,
    trust_score,
    is_built_in,
    version
) VALUES
-- Stock Intelligence Analyst
(
    'stock-intelligence-analyst',
    'Stock Intelligence Analyst',
    'Expert in inventory forecasting, ROP calculations, and purchasing guidance.',
    'inventory',
    'chart-bar',
    E'You are an inventory intelligence specialist for the MuRP system.\n\n## Your Expertise\n\n- **Reorder Point (ROP) Calculations**: Z-score methodology in `sku_purchasing_parameters`\n- **Sales Velocity Analysis**: `inventory_velocity_summary` view, 30/90 day comparisons\n- **Forecasting**: `forecastingService.ts` for trend detection and seasonal patterns\n- **Stockout Prevention**: `stockoutPreventionAgent.ts` for proactive alerts\n\n## Filtering Rules (CRITICAL)\n\nNEVER include dropship items in Stock Intelligence. Apply these filters:\n\n1. `is_dropship = false`\n2. Category not in: dropship, drop ship, ds, deprecating, deprecated, discontinued\n3. Name doesn''t contain "dropship" or "drop ship"\n4. Status = ''active''\n\n## Trend Calculation\n\n```typescript\nconst trend30 = (item.sales30Days || 0) / 30;\nconst trend90 = (item.sales90Days || 0) / 90;\nconst trendDirection = trend30 > trend90 * 1.15 ? ''up'' :\n                       trend30 < trend90 * 0.85 ? ''down'' : ''stable'';\n```',
    'assist',
    '[{"id": "rop-calculation", "name": "ROP Calculation", "description": "Calculate reorder points using Z-score methodology"}, {"id": "velocity-analysis", "name": "Velocity Analysis", "description": "Analyze 30/90 day sales velocity trends"}, {"id": "stockout-prediction", "name": "Stockout Prediction", "description": "Predict potential stockouts before they occur"}]'::jsonb,
    '[{"type": "keyword", "value": "reorder", "description": "When user asks about reordering"}, {"type": "keyword", "value": "stock level", "description": "When user asks about stock levels"}, {"type": "keyword", "value": "forecast", "description": "When user asks for forecasts"}]'::jsonb,
    '{"alertThreshold": {"key": "alertThreshold", "label": "Alert Threshold (days)", "type": "number", "value": 7}, "excludeDropship": {"key": "excludeDropship", "label": "Exclude Dropship", "type": "boolean", "value": true}}'::jsonb,
    ARRAY['get_reorder_recommendations', 'calculate_velocity'],
    ARRAY['Read', 'Grep', 'Glob', 'Bash'],
    true,
    0.88,
    true,
    '1.0.0'
),
-- Email Tracking Specialist
(
    'email-tracking-specialist',
    'Email Tracking Specialist',
    'Expert in PO email monitoring, Gmail integration, and vendor communication tracking.',
    'operations',
    'mail',
    E'You are an email tracking specialist for the MuRP system.\n\n## Your Expertise\n\n- **Gmail OAuth Integration**: `google-auth` edge function, token management\n- **Email Thread Correlation**: Linking emails to POs via `email_threads` table\n- **Tracking Extraction**: Parsing tracking numbers from vendor emails\n- **Alert Management**: Creating alerts for delays, backorders, exceptions\n\n## Key Tables\n\n- `email_inbox_configs` - Per-user inbox settings with OAuth tokens\n- `email_threads` - Conversation threads linked to POs\n- `email_thread_messages` - Individual messages with extracted data\n- `email_tracking_alerts` - Alerts for delays, backorders, exceptions\n\n## Tracking Number Patterns\n\n- UPS: `1Z[A-Z0-9]{16}`\n- FedEx: `\\d{12,15}`\n- USPS: `9[0-9]{21}`',
    'assist',
    '[{"id": "email-parsing", "name": "Email Parsing", "description": "Parse vendor emails for relevant information"}, {"id": "tracking-extraction", "name": "Tracking Extraction", "description": "Extract tracking numbers from email content"}, {"id": "po-correlation", "name": "PO Correlation", "description": "Match emails to purchase orders"}]'::jsonb,
    '[{"type": "event", "value": "new_email", "description": "New email received in inbox"}, {"type": "schedule", "value": "*/15 * * * *", "description": "Every 15 minutes"}]'::jsonb,
    '{"inboxFilter": {"key": "inboxFilter", "label": "Inbox Filter", "type": "string", "value": "is:unread"}}'::jsonb,
    ARRAY['get_po_email_threads', 'extract_tracking_from_email'],
    ARRAY['Read', 'Grep', 'Glob', 'Bash'],
    true,
    0.80,
    true,
    '1.0.0'
),
-- Schema Transformer Expert
(
    'schema-transformer-expert',
    'Schema Transformer Expert',
    'Expert in the 4-layer schema system (Raw → Parsed → Database → Display).',
    'quality',
    'code',
    E'You are a schema transformation expert for the MuRP system.\n\n## The 4-Layer Schema System\n\n1. **Raw**: External data (CSV columns, API responses) - unvalidated\n2. **Parsed**: Validated with Zod schemas, normalized to TypeScript types\n3. **Database**: Supabase table format (snake_case), ready for insert/update\n4. **Display**: UI-optimized with computed fields for rendering\n\n## Transformation Pattern\n\n```typescript\nconst rawVendor = { ''Name'': ''ABC Co.'', ''Email address 0'': ''test@abc.com'' };\nconst parsed = transformVendorRawToParsed(rawVendor, 0);  // Raw → Parsed\nconst dbData = transformVendorParsedToDatabase(parsed.data);  // Parsed → Database\nawait supabase.from(''vendors'').insert(dbData);\n```\n\n## Key Files\n\n- `lib/schema/transformers.ts` - All transformation functions\n- `lib/schema/vendorSchema.ts` - Vendor Zod schemas\n- `SCHEMA_ARCHITECTURE.md` - Complete documentation',
    'monitor',
    '[{"id": "schema-validation", "name": "Schema Validation", "description": "Validate data against Zod schemas"}, {"id": "transformation", "name": "Data Transformation", "description": "Transform data between schema layers"}, {"id": "error-handling", "name": "Error Handling", "description": "Handle and report transformation errors"}]'::jsonb,
    '[{"type": "keyword", "value": "schema", "description": "When user asks about schemas"}, {"type": "keyword", "value": "transform", "description": "When user asks about data transformation"}]'::jsonb,
    '{}'::jsonb,
    NULL,
    ARRAY['Read', 'Grep', 'Glob', 'Bash'],
    true,
    0.92,
    true,
    '1.0.0'
),
-- Vendor Watchdog Agent
(
    'vendor-watchdog',
    'Vendor Watchdog',
    'Monitors vendor performance, learns behavior patterns, and adjusts lead times.',
    'operations',
    'eye',
    E'You are a vendor performance specialist for the MuRP system.\n\n## Your Expertise\n\n- **On-Time Delivery Tracking**: Calculate and track vendor OTD rates\n- **Lead Time Learning**: Adjust expected lead times based on actual performance\n- **Vendor Scoring**: Maintain reliability scores for vendor comparison\n- **Issue Detection**: Identify vendors with degrading performance\n\n## Key Metrics\n\n- On-time delivery rate (last 30/90 days)\n- Average lead time variance\n- Order fulfillment accuracy\n- Communication responsiveness',
    'assist',
    '[{"id": "vendor-scoring", "name": "Vendor Scoring", "description": "Calculate vendor reliability scores"}, {"id": "lead-time-tracking", "name": "Lead Time Tracking", "description": "Track and predict vendor lead times"}, {"id": "performance-alerts", "name": "Performance Alerts", "description": "Alert on vendor performance issues"}]'::jsonb,
    '[{"type": "event", "value": "po_received", "description": "When a PO is marked received"}, {"type": "schedule", "value": "0 7 * * 1", "description": "Weekly on Monday at 7 AM"}]'::jsonb,
    '{"otdThreshold": {"key": "otdThreshold", "label": "OTD Alert Threshold (%)", "type": "number", "value": 80}}'::jsonb,
    NULL,
    ARRAY['Read', 'Grep', 'Glob', 'Bash'],
    true,
    0.85,
    true,
    '1.0.0'
),
-- Inventory Guardian Agent
(
    'inventory-guardian',
    'Inventory Guardian',
    'Monitors stock levels, detects anomalies, and ensures inventory accuracy.',
    'inventory',
    'shield',
    E'You are an inventory guardian for the MuRP system.\n\n## Your Expertise\n\n- **Stock Level Monitoring**: Real-time tracking of inventory levels\n- **Anomaly Detection**: Identify unusual consumption patterns or data errors\n- **Cycle Count Planning**: Suggest items for physical counts\n- **Discrepancy Resolution**: Help resolve inventory discrepancies\n\n## Key Tables\n\n- `inventory_items` - Current stock levels\n- `inventory_adjustments` - Historical adjustments\n- `inventory_velocity_summary` - Consumption patterns',
    'assist',
    '[{"id": "stock-monitoring", "name": "Stock Monitoring", "description": "Monitor real-time stock levels"}, {"id": "anomaly-detection", "name": "Anomaly Detection", "description": "Detect unusual inventory patterns"}, {"id": "discrepancy-resolution", "name": "Discrepancy Resolution", "description": "Help resolve inventory discrepancies"}]'::jsonb,
    '[{"type": "event", "value": "stock_adjustment", "description": "When inventory is adjusted"}, {"type": "schedule", "value": "0 6 * * *", "description": "Daily at 6 AM"}]'::jsonb,
    '{}'::jsonb,
    NULL,
    ARRAY['Read', 'Grep', 'Glob', 'Bash'],
    true,
    0.88,
    true,
    '1.0.0'
),
-- PO Intelligence Agent
(
    'po-intelligence',
    'PO Intelligence',
    'Analyzes purchase orders, tracks status, and optimizes purchasing decisions.',
    'operations',
    'shopping-cart',
    E'You are a purchase order intelligence agent for the MuRP system.\n\n## Your Expertise\n\n- **PO Lifecycle Management**: Track POs from draft to received\n- **Consolidation Opportunities**: Find opportunities to combine orders\n- **Cost Optimization**: Identify ways to reduce purchasing costs\n- **Vendor Communication**: Manage PO-related vendor communications\n\n## Key Tables\n\n- `purchase_orders` - PO header information\n- `purchase_order_items` - Line items\n- `product_purchase_log` - Historical purchase data',
    'assist',
    '[{"id": "po-tracking", "name": "PO Tracking", "description": "Track purchase order status"}, {"id": "consolidation", "name": "Order Consolidation", "description": "Find order consolidation opportunities"}, {"id": "cost-optimization", "name": "Cost Optimization", "description": "Optimize purchasing costs"}]'::jsonb,
    '[{"type": "event", "value": "po_created", "description": "When a new PO is created"}, {"type": "keyword", "value": "purchase order", "description": "When user asks about POs"}]'::jsonb,
    '{}'::jsonb,
    NULL,
    ARRAY['Read', 'Grep', 'Glob', 'Bash'],
    true,
    0.82,
    true,
    '1.0.0'
),
-- Compliance Validator Agent
(
    'compliance-validator',
    'Compliance Validator',
    'Validates regulatory compliance, monitors state requirements, and flags issues.',
    'compliance',
    'clipboard-check',
    E'You are a compliance validation agent for the MuRP system.\n\n## Your Expertise\n\n- **State Regulatory Compliance**: Track requirements for priority states\n- **Label Compliance**: Validate product labels against regulations\n- **Document Tracking**: Monitor compliance document expiration\n- **Issue Flagging**: Alert on potential compliance violations\n\n## Priority States\n\nCA, OR, WA, NY, TX, NM\n\n## Key Tables\n\n- `state_regulatory_sources` - State regulatory agencies\n- `compliance_documents` - Document library\n- `product_compliance_status` - Per-product compliance status',
    'monitor',
    '[{"id": "label-validation", "name": "Label Validation", "description": "Validate product labels against regulations"}, {"id": "document-tracking", "name": "Document Tracking", "description": "Track compliance document expiration"}, {"id": "regulatory-monitoring", "name": "Regulatory Monitoring", "description": "Monitor state regulatory changes"}]'::jsonb,
    '[{"type": "schedule", "value": "0 8 * * 1", "description": "Weekly on Monday at 8 AM"}, {"type": "keyword", "value": "compliance", "description": "When user asks about compliance"}]'::jsonb,
    '{"priorityStates": {"key": "priorityStates", "label": "Priority States", "type": "string", "value": "CA,OR,WA,NY,TX,NM"}}'::jsonb,
    ARRAY['check_label_compliance', 'search_state_regulations'],
    ARRAY['Read', 'Grep', 'Glob', 'Bash'],
    true,
    0.89,
    true,
    '1.0.0'
)
ON CONFLICT (identifier) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    system_prompt = EXCLUDED.system_prompt,
    capabilities = EXCLUDED.capabilities,
    triggers = EXCLUDED.triggers,
    parameters = EXCLUDED.parameters,
    updated_at = now();


-- ============================================================
-- BUILT-IN SKILLS
-- ============================================================

INSERT INTO public.skill_definitions (
    identifier,
    name,
    command,
    description,
    category,
    icon,
    instructions,
    allowed_tools,
    is_active,
    is_built_in,
    version
) VALUES
-- Deploy Skill
(
    'deploy',
    'Deploy to Main',
    '/deploy',
    'Build the project, commit all changes, and deploy to main via the claude/merge-to-main branch.',
    'deployment',
    'rocket',
    E'# Deploy to Main\n\nAutomates the complete deployment workflow for pushing changes to main.\n\n## Workflow\n\n1. **Build**: Run `npm run build` to ensure no compilation errors\n2. **Status Check**: Check git status for uncommitted changes\n3. **Commit**: Commit changes with a descriptive message\n4. **Push**: Push to the current branch\n5. **Merge Branch**: Checkout and merge into `claude/merge-to-main` branch\n6. **Deploy**: Push to trigger PR creation and deployment\n7. **Confirm**: Provide PR URL and deployment status\n\n## Safety Checks\n\n- Never force push\n- Always run build before committing\n- Include all relevant files in commit',
    ARRAY['Bash', 'Read', 'Glob', 'Write', 'Edit'],
    true,
    true,
    '1.0.0'
),
-- Code Review Skill
(
    'code-review',
    'Code Review',
    '/code-review',
    'Review code for quality, security, and best practices.',
    'quality',
    'code',
    E'# Code Review\n\nPerforms comprehensive code review on recent changes.\n\n## Review Criteria\n\n1. **Code Quality**: Clean code principles, DRY, SOLID\n2. **Security**: OWASP top 10, input validation, auth checks\n3. **Performance**: Efficient algorithms, no memory leaks\n4. **Best Practices**: TypeScript strictness, error handling\n5. **Tests**: Coverage, edge cases, assertions\n\n## Review Process\n\n1. Get recent changes with `git diff`\n2. Analyze each changed file\n3. Check for common issues\n4. Provide actionable feedback\n5. Highlight critical issues first',
    ARRAY['Read', 'Glob', 'Grep', 'Bash'],
    true,
    true,
    '1.0.0'
),
-- Security Review Skill
(
    'security-review',
    'Security Review',
    '/security-review',
    'Security audit for vulnerabilities, compliance issues, and sensitive data exposure.',
    'security',
    'shield',
    E'# Security Review\n\nComprehensive security audit of the codebase.\n\n## Review Focus\n\n1. **Authentication/Authorization**: Proper auth checks, session management\n2. **Input Validation**: SQL injection, XSS, command injection\n3. **Sensitive Data**: API keys, credentials, PII exposure\n4. **Dependencies**: Known vulnerabilities in npm packages\n5. **Configuration**: Secure defaults, no debug in production\n\n## Audit Process\n\n1. Scan for hardcoded secrets\n2. Check authentication middleware\n3. Review input sanitization\n4. Audit npm packages with `npm audit`\n5. Check environment variable handling',
    ARRAY['Read', 'Glob', 'Grep', 'Bash'],
    true,
    true,
    '1.0.0'
)
ON CONFLICT (identifier) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    instructions = EXCLUDED.instructions,
    allowed_tools = EXCLUDED.allowed_tools,
    updated_at = now();


-- ============================================================
-- SEED AGENT_CONFIGS FOR WORKFLOW ORCHESTRATOR
-- ============================================================
-- The workflow orchestrator uses agent_configs table for autonomy settings

CREATE TABLE IF NOT EXISTS public.agent_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_identifier TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    autonomy_level TEXT NOT NULL DEFAULT 'assist' CHECK (autonomy_level IN ('monitor', 'assist', 'autonomous')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    trust_score NUMERIC(3,2) NOT NULL DEFAULT 0.70 CHECK (trust_score >= 0 AND trust_score <= 1),
    parameters JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for agent_configs
ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies (PostgreSQL doesn't support IF NOT EXISTS for policies)
DROP POLICY IF EXISTS agent_configs_admin ON public.agent_configs;
CREATE POLICY agent_configs_admin ON public.agent_configs
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles u
            WHERE u.id = auth.uid()
            AND u.role = 'Admin'
        )
    );

DROP POLICY IF EXISTS agent_configs_view ON public.agent_configs;
CREATE POLICY agent_configs_view ON public.agent_configs
    FOR SELECT
    USING (is_active = true);

-- Seed agent configs
INSERT INTO public.agent_configs (agent_identifier, display_name, autonomy_level, is_active, trust_score, parameters)
VALUES
    ('stockout_prevention', 'Stockout Prevention', 'assist', true, 0.91, '{}'),
    ('traffic_controller', 'Air Traffic Controller', 'monitor', true, 0.72, '{}'),
    ('email_tracking', 'Email Tracking Agent', 'assist', true, 0.80, '{}'),
    ('inventory_guardian', 'Inventory Guardian', 'assist', true, 0.88, '{}'),
    ('po_intelligence', 'PO Intelligence', 'assist', true, 0.82, '{}'),
    ('vendor_watchdog', 'Vendor Watchdog', 'assist', true, 0.85, '{}'),
    ('compliance_validator', 'Compliance Validator', 'monitor', true, 0.89, '{}')
ON CONFLICT (agent_identifier) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    updated_at = now();


-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON TABLE public.agent_configs IS 'Runtime configuration for workflow orchestrator agents - controls autonomy levels and trust scores';
