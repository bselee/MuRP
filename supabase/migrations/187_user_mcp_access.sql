-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 187: User MCP Access Controls
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Allows admins to enable/disable MCP features for specific users.
-- MCP features are developer tools that should be restricted by default.
--
-- Tables:
--   user_mcp_access - Per-user MCP feature toggles

-- User MCP Access table
CREATE TABLE IF NOT EXISTS user_mcp_access (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    rube_enabled BOOLEAN DEFAULT FALSE NOT NULL,
    compliance_mcp_enabled BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE user_mcp_access ENABLE ROW LEVEL SECURITY;

-- Admin read policy
CREATE POLICY "Admins can read all user MCP access"
    ON user_mcp_access FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND (users.role = 'Admin' OR users.department = 'Operations')
        )
    );

-- Admin write policy
CREATE POLICY "Admins can manage user MCP access"
    ON user_mcp_access FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND (users.role = 'Admin' OR users.department = 'Operations')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND (users.role = 'Admin' OR users.department = 'Operations')
        )
    );

-- Users can read their own access
CREATE POLICY "Users can read own MCP access"
    ON user_mcp_access FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_user_mcp_access_user_id ON user_mcp_access(user_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_user_mcp_access_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_mcp_access_updated_at ON user_mcp_access;
CREATE TRIGGER trigger_update_user_mcp_access_updated_at
    BEFORE UPDATE ON user_mcp_access
    FOR EACH ROW
    EXECUTE FUNCTION update_user_mcp_access_updated_at();

-- Comments
COMMENT ON TABLE user_mcp_access IS 'Per-user MCP feature access controls (admin-managed)';
COMMENT ON COLUMN user_mcp_access.rube_enabled IS 'User can access Rube MCP tools (Gmail, Slack integration)';
COMMENT ON COLUMN user_mcp_access.compliance_mcp_enabled IS 'User can access compliance MCP server tools';
