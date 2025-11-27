# MCP (Model Context Protocol) System - Setup Guide

## Overview
The MCP system integrates AI-powered compliance tools into the MuRP application. This document provides a comprehensive guide for Admins to configure and use the MCP server.

---

## Architecture

### Components
1. **Python MCP Server** (`/mcp-server` directory)
   - Runs independently on port 8000 (default)
   - Provides 8 compliance tools via REST-like API
   - Requires Anthropic API key for AI features

2. **TypeScript Wrapper** (`services/mcpService.ts`)
   - Provides React interface to MCP server
   - Type-safe function calls for each tool
   - Error handling and result formatting

3. **Admin Configuration Panel** (`components/MCPServerPanel.tsx`)
   - UI for server connection settings
   - Health monitoring
   - Tool status display
   - Only accessible to Admin role users

4. **Database Tables** (6 new tables)
   - `mcp_server_configs` - Server connection details
   - `user_compliance_profiles` - User onboarding tracking
   - `mcp_tool_calls` - Audit log of all tool invocations
   - `app_settings` - Application-wide config
   - `scraping_configs` - Web scraping configurations
   - `scraping_jobs` - Scraping job execution tracking

---

## Available MCP Tools (8 Total)

### 1. **onboard_user**
- **Purpose**: Initialize compliance profile for a new user
- **Requires AI**: No
- **Input**: User email, profile type
- **Output**: User compliance profile ID
- **Use Case**: First-time setup for users needing compliance access

### 2. **add_regulatory_source**
- **Purpose**: Add state or federal regulatory data source
- **Requires AI**: No
- **Input**: State code, agency name, data URL
- **Output**: Source configuration ID
- **Use Case**: Expanding compliance coverage to new states

### 3. **basic_compliance_check**
- **Purpose**: Quick rule-based compliance verification
- **Requires AI**: No
- **Input**: Product data, state code
- **Output**: Pass/fail result with specific violations
- **Use Case**: Fast initial screening before AI analysis

### 4. **extract_label_text**
- **Purpose**: OCR text extraction from label images
- **Requires AI**: No (uses Tesseract)
- **Input**: Label image URL or file
- **Output**: Extracted text with confidence scores
- **Use Case**: Digitizing physical labels for compliance checks

### 5. **full_ai_compliance_check** ⭐
- **Purpose**: Deep AI-powered compliance analysis
- **Requires AI**: Yes (Anthropic Claude)
- **Input**: Product data, label text, state regulations
- **Output**: Detailed compliance report with recommendations
- **Use Case**: Comprehensive analysis with natural language explanations

### 6. **scrape_state_regulation**
- **Purpose**: Fetch live regulatory data from state websites
- **Requires AI**: No
- **Input**: State code, regulation category
- **Output**: Latest regulation text and metadata
- **Use Case**: Keeping regulatory database up-to-date

### 7. **upgrade_to_full_ai**
- **Purpose**: Switch user from basic to AI compliance mode
- **Requires AI**: No
- **Input**: User ID
- **Output**: Updated user profile
- **Use Case**: Upgrading user access when they need AI features

### 8. **get_compliance_summary**
- **Purpose**: Retrieve overview of compliance status
- **Requires AI**: No
- **Input**: BOM ID or user ID (optional)
- **Output**: Summary of all compliance records
- **Use Case**: Dashboard displays, reporting

---

## Admin Setup Instructions

### Step 1: Start the Python MCP Server
```bash
cd /workspaces/MuRP/mcp-server
python main.py
```

**Expected Output:**
```
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

### Step 2: Apply Database Migration
The migration `006_add_mcp_tables.sql` must be run in your Supabase database:

**Option A: Supabase Dashboard**
1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `supabase/migrations/006_add_mcp_tables.sql`
3. Paste and execute

**Option B: Supabase CLI**
```bash
supabase db push
```

**Verification:**
Check that these tables exist:
- `app_settings`
- `mcp_server_configs`
- `user_compliance_profiles`
- `mcp_tool_calls`
- `scraping_configs`
- `scraping_jobs`

### Step 3: Configure MCP Server in UI
1. **Navigate to Settings** (Admin role required)
2. **Scroll to "MCP Server Configuration"** section (cyan server icon)
3. **Enter Configuration:**
   - **Server URL**: `http://localhost:8000` (or your deployed URL)
   - **Anthropic API Key**: Your Claude API key (sk-ant-...)
     - Get key from: https://console.anthropic.com/
     - Required only for `full_ai_compliance_check` tool
   - **Configuration Notes**: Optional (e.g., "Production MCP server")

4. **Test Connection:**
   - Click "Test Connection" button
   - Should show "Connection successful! MCP server is responsive."
   - Health status changes to "Healthy" (green checkmark)

5. **Enable Integration:**
   - Check "Enable MCP server integration" checkbox
   - Click "Save Configuration"
   - Should show "MCP server configuration saved successfully!"

### Step 4: Verify Setup
Run a test compliance check from the AI chat:
```
"Can you run a basic compliance check for BOM-001 in California?"
```

Check the `mcp_tool_calls` table for the logged call:
```sql
SELECT * FROM mcp_tool_calls ORDER BY called_at DESC LIMIT 5;
```

---

## Configuration Reference

### Server URL Options
- **Local Development**: `http://localhost:8000`
- **Docker Container**: `http://mcp-server:8000`
- **Remote Server**: `https://mcp.yourcompany.com`

### API Key Requirements
| Tool | Requires Anthropic Key? |
|------|------------------------|
| onboard_user | ❌ No |
| add_regulatory_source | ❌ No |
| basic_compliance_check | ❌ No |
| extract_label_text | ❌ No |
| **full_ai_compliance_check** | ✅ **YES** |
| scrape_state_regulation | ❌ No |
| upgrade_to_full_ai | ❌ No |
| get_compliance_summary | ❌ No |

### Health Check Endpoint
- **URL**: `{SERVER_URL}/health`
- **Method**: GET
- **Response**: `{"status": "healthy", "version": "1.0.0"}`

---

## Tool Permissions (Role-Based Access)

The `mcp_server_configs.tool_permissions` field controls who can use which tools:

```json
{
  "admin": ["*"],  // All tools
  "manager": ["basic_compliance_check", "get_compliance_summary"],
  "user": ["basic_compliance_check"]
}
```

**Default Setup:**
- **Admin**: Full access to all 8 tools
- **Manager**: Basic checks and summaries
- **User**: Basic compliance checks only

---

## Monitoring & Auditing

### View Tool Usage
```sql
-- Most used tools
SELECT 
  tool_name,
  COUNT(*) as usage_count,
  COUNT(CASE WHEN status = 'success' THEN 1 END) as successes,
  COUNT(CASE WHEN status = 'error' THEN 1 END) as errors
FROM mcp_tool_calls
WHERE called_at > NOW() - INTERVAL '7 days'
GROUP BY tool_name
ORDER BY usage_count DESC;
```

### Check Server Health
```sql
SELECT 
  server_name,
  health_status,
  last_health_check,
  is_enabled
FROM mcp_server_configs;
```

### User Compliance Status
```sql
SELECT 
  u.name,
  u.email,
  ucp.compliance_level,
  ucp.total_checks_performed,
  ucp.failed_checks_count,
  ucp.last_compliance_check
FROM user_compliance_profiles ucp
JOIN users u ON u.id = ucp.user_id
WHERE ucp.is_active = true
ORDER BY ucp.last_compliance_check DESC;
```

---

## Troubleshooting

### Issue: "Connection test failed"
**Causes:**
- MCP server not running
- Incorrect server URL
- Firewall blocking port 8000
- Network connectivity issues

**Solutions:**
1. Check server is running: `ps aux | grep python`
2. Verify URL matches actual server location
3. Test manually: `curl http://localhost:8000/health`
4. Check logs: `tail -f /var/log/mcp-server.log`

### Issue: "full_ai_compliance_check failed"
**Causes:**
- Missing Anthropic API key
- Invalid API key
- Anthropic rate limit exceeded
- Insufficient API credits

**Solutions:**
1. Verify API key in Settings
2. Test key: `curl -H "x-api-key: YOUR_KEY" https://api.anthropic.com/v1/messages`
3. Check Anthropic console for rate limits
4. Add credits to Anthropic account

### Issue: Tool calls not logged
**Causes:**
- Database connection lost
- Missing `mcp_tool_calls` table
- Service worker not writing logs

**Solutions:**
1. Check Supabase connection
2. Verify migration 006 was applied
3. Review service logs for write errors

---

## Security Considerations

### API Key Storage
- Anthropic API keys stored encrypted in `mcp_server_configs.anthropic_api_key`
- Never expose keys in client-side code
- Rotate keys periodically (monthly recommended)

### Access Control
- MCP Configuration panel: **Admin only**
- Tool usage: Role-based (see Tool Permissions)
- Audit trail: All calls logged in `mcp_tool_calls`

### Data Privacy
- Compliance checks may process sensitive product data
- Label images stored temporarily during OCR
- Scraped regulatory data cached in database
- Consider GDPR/CCPA requirements for user data

---

## Next Steps

### Immediate Actions
1. ✅ Start Python MCP server
2. ✅ Apply database migration
3. ✅ Configure server in UI
4. ✅ Test connection
5. ✅ Enable integration

### Future Enhancements
- [ ] Integrate MCP tools into AI chat workflow
- [ ] Add MCP tool results to AI context
- [ ] Create compliance dashboard widget
- [ ] Schedule automated compliance scans
- [ ] Build state regulation auto-updater
- [ ] Add email notifications for failed checks

### Integration with AI Chat
Coming soon: The AI assistant will automatically:
- Detect compliance-related questions
- Route to appropriate MCP tool
- Display results in chat interface
- Provide natural language explanations
- Suggest remediation actions

---

## Support

### Documentation
- **MCP Server README**: `/mcp-server/README.md`
- **API Documentation**: `http://localhost:8000/docs` (when server running)
- **Database Schema**: `supabase/migrations/006_add_mcp_tables.sql`

### Contact
- **Technical Issues**: Support team
- **API Questions**: Anthropic documentation
- **Feature Requests**: Product management

---

**Last Updated**: 2025-11-13  
**Version**: 1.0.0  
**Author**: MuRP Development Team
