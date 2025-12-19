-- Migration 099: Email Inbox Configuration
--
-- Enables dedicated email inbox monitoring for the Email Tracking Agent.
-- Supports multiple inboxes (e.g., po@company.com, purchasing@company.com)
-- with independent OAuth credentials and processing settings.
--
-- Part of: Email Tracking Agent Expansion
-- Goal: NEVER BE OUT OF STOCK

-- ============================================================================
-- EMAIL INBOX CONFIGURATION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_inbox_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Inbox Identity
    inbox_name TEXT NOT NULL,                              -- "purchasing", "po-inbox"
    email_address TEXT NOT NULL UNIQUE,                    -- po@company.com
    display_name TEXT,                                     -- "Purchasing Inbox"
    description TEXT,

    -- Gmail OAuth Configuration
    -- Note: Secrets stored as references to vault/env vars for security
    gmail_client_id TEXT,
    gmail_client_secret_ref TEXT,                          -- Reference key, not actual secret
    gmail_refresh_token_ref TEXT,                          -- Reference key, not actual secret
    gmail_user TEXT DEFAULT 'me',

    -- Webhook Configuration
    gmail_watch_expiration TIMESTAMPTZ,                    -- When Gmail push subscription expires
    gmail_watch_resource_id TEXT,                          -- Resource ID from watch response
    webhook_url TEXT,                                      -- Callback URL for push notifications

    -- Polling Configuration (backup to webhooks)
    poll_enabled BOOLEAN DEFAULT true,
    poll_interval_minutes INTEGER DEFAULT 5,
    last_poll_at TIMESTAMPTZ,
    last_history_id TEXT,                                  -- Gmail history ID for incremental sync
    next_poll_at TIMESTAMPTZ,

    -- Processing Settings
    is_active BOOLEAN DEFAULT true,
    ai_parsing_enabled BOOLEAN DEFAULT true,
    max_emails_per_hour INTEGER DEFAULT 100,
    max_daily_ai_cost_usd DECIMAL(10,2) DEFAULT 5.00,
    ai_confidence_threshold DECIMAL(3,2) DEFAULT 0.65,

    -- Filtering
    keyword_filters TEXT[] DEFAULT ARRAY[
        'tracking', 'shipped', 'ship', 'delivery', 'deliver',
        'invoice', 'confirm', 'confirmation', 'PO', 'purchase order',
        'backorder', 'delay', 'eta', 'arriving', 'arrived'
    ],
    exclude_senders TEXT[],                                -- Blacklist certain senders
    include_only_domains TEXT[],                           -- Whitelist vendor domains (if set)

    -- Vendor Correlation
    auto_correlate_vendors BOOLEAN DEFAULT true,
    vendor_domain_cache JSONB DEFAULT '{}'::jsonb,         -- {domain: vendor_id} learned mapping

    -- Statistics
    total_emails_processed INTEGER DEFAULT 0,
    total_emails_matched INTEGER DEFAULT 0,
    total_pos_correlated INTEGER DEFAULT 0,
    correlation_success_rate DECIMAL(5,2),
    last_email_at TIMESTAMPTZ,

    -- AI Usage Tracking
    daily_ai_cost_usd DECIMAL(10,2) DEFAULT 0,
    daily_ai_cost_reset_at DATE DEFAULT CURRENT_DATE,

    -- Health & Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error', 'setup_required')),
    last_error TEXT,
    last_error_at TIMESTAMPTZ,
    consecutive_errors INTEGER DEFAULT 0,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_email_inbox_active
    ON email_inbox_configs(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_email_inbox_poll
    ON email_inbox_configs(next_poll_at, is_active)
    WHERE is_active = true AND poll_enabled = true;

CREATE INDEX IF NOT EXISTS idx_email_inbox_status
    ON email_inbox_configs(status);

-- ============================================================================
-- VENDOR EMAIL DOMAINS TABLE
-- ============================================================================
-- Learned mapping of email domains to vendors for auto-correlation

CREATE TABLE IF NOT EXISTS vendor_email_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    domain TEXT NOT NULL,                                  -- "acme-supplies.com"
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,

    -- Confidence tracking
    confidence DECIMAL(3,2) DEFAULT 0.80,
    match_count INTEGER DEFAULT 1,                         -- How many times this mapping was used
    last_matched_at TIMESTAMPTZ DEFAULT now(),

    -- Source of mapping
    source TEXT DEFAULT 'auto' CHECK (source IN ('auto', 'manual', 'vendor_record')),

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(domain)
);

CREATE INDEX IF NOT EXISTS idx_vendor_email_domain ON vendor_email_domains(domain);
CREATE INDEX IF NOT EXISTS idx_vendor_email_vendor ON vendor_email_domains(vendor_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE email_inbox_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_email_domains ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated users to read email inbox configs" ON email_inbox_configs;
DROP POLICY IF EXISTS "Allow authenticated users to manage email inbox configs" ON email_inbox_configs;
DROP POLICY IF EXISTS "Allow authenticated users to read vendor email domains" ON vendor_email_domains;
DROP POLICY IF EXISTS "Allow authenticated users to manage vendor email domains" ON vendor_email_domains;

-- Email inbox configs policies
CREATE POLICY "Allow authenticated users to read email inbox configs"
    ON email_inbox_configs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage email inbox configs"
    ON email_inbox_configs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Vendor email domains policies
CREATE POLICY "Allow authenticated users to read vendor email domains"
    ON vendor_email_domains FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage vendor email domains"
    ON vendor_email_domains FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to reset daily AI cost at midnight
CREATE OR REPLACE FUNCTION reset_inbox_daily_ai_cost()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.daily_ai_cost_reset_at < CURRENT_DATE THEN
        NEW.daily_ai_cost_usd := 0;
        NEW.daily_ai_cost_reset_at := CURRENT_DATE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inbox_daily_ai_cost_reset ON email_inbox_configs;
CREATE TRIGGER inbox_daily_ai_cost_reset
    BEFORE UPDATE ON email_inbox_configs
    FOR EACH ROW
    EXECUTE FUNCTION reset_inbox_daily_ai_cost();

-- Function to update correlation success rate
CREATE OR REPLACE FUNCTION update_inbox_correlation_rate()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.total_emails_processed > 0 THEN
        NEW.correlation_success_rate :=
            (NEW.total_pos_correlated::DECIMAL / NEW.total_emails_processed::DECIMAL) * 100;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inbox_correlation_rate_update ON email_inbox_configs;
CREATE TRIGGER inbox_correlation_rate_update
    BEFORE UPDATE ON email_inbox_configs
    FOR EACH ROW
    WHEN (NEW.total_emails_processed <> OLD.total_emails_processed
          OR NEW.total_pos_correlated <> OLD.total_pos_correlated)
    EXECUTE FUNCTION update_inbox_correlation_rate();

-- Function to learn vendor domain from successful correlation
CREATE OR REPLACE FUNCTION learn_vendor_email_domain(
    p_sender_email TEXT,
    p_vendor_id UUID,
    p_confidence DECIMAL DEFAULT 0.85
) RETURNS UUID AS $$
DECLARE
    v_domain TEXT;
    v_domain_id UUID;
BEGIN
    -- Extract domain from email
    v_domain := lower(split_part(p_sender_email, '@', 2));

    IF v_domain IS NULL OR v_domain = '' THEN
        RETURN NULL;
    END IF;

    -- Upsert the domain mapping
    INSERT INTO vendor_email_domains (domain, vendor_id, confidence, source)
    VALUES (v_domain, p_vendor_id, p_confidence, 'auto')
    ON CONFLICT (domain) DO UPDATE SET
        vendor_id = CASE
            WHEN vendor_email_domains.confidence < p_confidence THEN p_vendor_id
            ELSE vendor_email_domains.vendor_id
        END,
        confidence = GREATEST(vendor_email_domains.confidence, p_confidence),
        match_count = vendor_email_domains.match_count + 1,
        last_matched_at = now(),
        updated_at = now()
    RETURNING id INTO v_domain_id;

    RETURN v_domain_id;
END;
$$ LANGUAGE plpgsql;

-- Function to lookup vendor by sender email domain
CREATE OR REPLACE FUNCTION lookup_vendor_by_email_domain(p_sender_email TEXT)
RETURNS TABLE (
    vendor_id UUID,
    vendor_name TEXT,
    confidence DECIMAL
) AS $$
DECLARE
    v_domain TEXT;
BEGIN
    v_domain := lower(split_part(p_sender_email, '@', 2));

    RETURN QUERY
    SELECT
        ved.vendor_id,
        v.name as vendor_name,
        ved.confidence
    FROM vendor_email_domains ved
    JOIN vendors v ON v.id = ved.vendor_id
    WHERE ved.domain = v_domain
    ORDER BY ved.confidence DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_email_inbox_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS email_inbox_configs_updated_at ON email_inbox_configs;
CREATE TRIGGER email_inbox_configs_updated_at
    BEFORE UPDATE ON email_inbox_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_email_inbox_updated_at();

-- ============================================================================
-- SEED DEFAULT INBOX (uses existing env vars)
-- ============================================================================

INSERT INTO email_inbox_configs (
    inbox_name,
    email_address,
    display_name,
    description,
    gmail_client_id,
    gmail_client_secret_ref,
    gmail_refresh_token_ref,
    gmail_user,
    is_active,
    status
) VALUES (
    'primary',
    'purchasing@murp.io',  -- Placeholder, will be updated with actual email
    'Primary Purchasing Inbox',
    'Main inbox for vendor communications. Uses existing Gmail webhook credentials.',
    'env:GMAIL_WEBHOOK_CLIENT_ID',
    'env:GMAIL_WEBHOOK_CLIENT_SECRET',
    'env:GMAIL_WEBHOOK_REFRESH_TOKEN',
    'env:GMAIL_WEBHOOK_USER',
    true,
    'setup_required'
) ON CONFLICT (email_address) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE email_inbox_configs IS
    'Configuration for dedicated email inbox monitoring. Supports multiple inboxes with independent OAuth and processing settings.';

COMMENT ON TABLE vendor_email_domains IS
    'Learned mapping of email domains to vendors for automatic email-to-PO correlation.';

COMMENT ON COLUMN email_inbox_configs.gmail_client_secret_ref IS
    'Reference to secret (env var name or vault key), NOT the actual secret value';

COMMENT ON COLUMN email_inbox_configs.last_history_id IS
    'Gmail API history ID for incremental sync - only fetch emails newer than this';

COMMENT ON COLUMN email_inbox_configs.vendor_domain_cache IS
    'Quick-access cache of domain->vendor_id mappings for this inbox';

COMMENT ON FUNCTION learn_vendor_email_domain IS
    'Automatically learns vendor email domains from successful PO correlations';

COMMENT ON FUNCTION lookup_vendor_by_email_domain IS
    'Looks up vendor by sender email domain for auto-correlation';
