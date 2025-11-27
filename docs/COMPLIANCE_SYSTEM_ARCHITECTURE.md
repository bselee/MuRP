# Multi-State Compliance System Architecture

## 📋 Overview

The MuRP Compliance System provides AI-powered regulatory compliance checking across all 50 US states, with a focus on agriculture, fertilizer, and organic products. The system is fully configurable through the Settings page and uses a tiered approach (Basic/Full AI).

---

## 🏗️ System Architecture

### 1. Data Acquisition & Update Cycle

```
┌─────────────────────────────────────────────────────────────┐
│          STATE GOVERNMENT WEBSITES (.gov)                   │
│  • ag.colorado.gov, cdfa.ca.gov, agr.wa.gov, etc.          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ (Web Scraping - Configurable in Settings)
                     ↓
┌─────────────────────────────────────────────────────────────┐
│              SCRAPING CONFIGS (Database)                    │
│  • URL patterns for each state's .gov sites                 │
│  • CSS selectors for regulation text extraction            │
│  • Schedule: Weekly/Monthly/Manual                          │
│  • AI extraction enabled: Yes/No                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ (Runs via MCP Server)
                     ↓
┌─────────────────────────────────────────────────────────────┐
│            MCP SERVER (Python/TypeScript)                   │
│  • Fetches HTML from .gov sites                             │
│  • Parses regulation text                                   │
│  • Optionally uses AI to extract key requirements          │
│  • Detects changes from previous version                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ (Saves to database)
                     ↓
┌─────────────────────────────────────────────────────────────┐
│         STATE_REGULATIONS TABLE (Supabase)                  │
│  Columns:                                                   │
│  • state (e.g., 'CO', 'CA', 'WA')                          │
│  • category (organic, fertilizer, labeling, etc.)          │
│  • rule_title                                               │
│  • rule_text (full regulation text)                        │
│  • regulation_code (e.g., 'CO Rev Stat §35-12-106')        │
│  • effective_date                                           │
│  • source_url                                               │
│  • last_verified (when we last checked)                    │
│  • search_vector (for full-text search)                    │
│  • keywords (array for filtering)                          │
│  • strictness_score (1-10, how strict the state is)       │
└─────────────────────────────────────────────────────────────┘
```

### 2. State Strictness Tiers

States are categorized by regulatory strictness (managed in Settings):

**Tier 1: Strictest States** (Score 9-10)
- California (CA) - Most comprehensive labeling requirements
- Oregon (OR) - Strict organic certification
- Washington (WA) - Detailed testing requirements

**Tier 2: High Regulation** (Score 7-8)
- Colorado (CO)
- New York (NY)
- Vermont (VT)

**Tier 3: Moderate Regulation** (Score 5-6)
- Texas (TX)
- Florida (FL)
- Illinois (IL)
- Massachusetts (MA)

**Tier 4: Standard Regulation** (Score 3-4)
- Most other states

**Tier 5: Minimal Regulation** (Score 1-2)
- States with limited specific requirements

---

## ⚙️ How Settings Control the System

### A. AI Provider Configuration (Settings → Developer Settings)

**Location:** Settings page → "Developer Settings" section → "AI Provider Configuration"

**What It Controls:**
- Which AI service processes compliance requests (Gemini, OpenAI, Anthropic, Azure)
- Default: **Gemini 2.5 Flash** (cost-effective, fast)
- Can be changed to any supported provider

**How Data Flows:**
```
User uploads label → OCR extracts text → AI analyzes compliance
                                          ↓
                                    [AI Provider Setting]
                                    • Gemini (default)
                                    • OpenAI
                                    • Anthropic
                                    • Azure OpenAI
```

**When It's Used:**
- Every Full AI Mode compliance check
- OCR text extraction enhancement
- Regulation summarization
- Change detection in regulations

**How to Change:**
1. Go to Settings
2. Scroll to "Developer Settings" (Admin only)
3. Click "AI Provider Configuration"
4. Select provider (Gemini/OpenAI/Anthropic/Azure)
5. Choose model (e.g., "gemini-2.5-flash", "gpt-4", "claude-3-sonnet")
6. Enter API key
7. Set temperature (0.0-2.0, default 0.3 for consistency)
8. Set max tokens (default 4096)
9. Click "Test Connection"
10. Click "Save Provider Settings"

**Cost Implications:**
- Gemini Flash: ~$0.05 per check (cheapest)
- OpenAI GPT-4: ~$0.15 per check
- Anthropic Claude: ~$0.10 per check
- Azure: Varies by deployment

### B. MCP Server Configuration (Settings → API & Integrations)

**Location:** Database table `mcp_server_configs`
**UI Access:** Settings → "MCP Server Management" (to be added)

**What It Controls:**
- Which MCP server handles compliance operations
- Server endpoint URL or local command
- Per-server AI provider override
- Enable/disable specific servers

**Available MCP Servers:**
1. **tgf-compliance-server** (Python)
   - Main compliance checking
   - State regulation scraping
   - OCR processing
   
2. **tgf-scraping-server** (Python)
   - Generic web scraping
   - Scheduled regulation updates
   - Can use different AI provider than main server

**How to Configure:**
```typescript
// Via settingsService.ts
await updateMCPServer('tgf-compliance-server', {
  is_enabled: true,
  override_ai_provider: true, // Use different AI than app default
  ai_provider_config: {
    provider: 'anthropic',  // Use Claude for this server
    model: 'claude-3-opus',
    apiKey: 'sk-ant-...'
  }
});
```

**Why This Matters:**
- Main app can use Gemini (cheap, fast)
- Compliance server can use Claude (high accuracy for legal text)
- Scraping server can use OpenAI (good at structured extraction)

### C. Scraping Configuration (Settings → Scraping Configs)

**Location:** Database table `scraping_configs`
**UI Access:** Settings → "Web Scraping Configuration" (to be added)

**What It Controls:**
- Which .gov websites to scrape
- How often to check for updates
- AI extraction settings per domain
- Data validation rules

**Example Configuration:**
```typescript
{
  config_name: "Colorado Organic Regulations",
  base_url: "https://ag.colorado.gov",
  url_pattern: "/plants/organic/*",
  domain: "ag.colorado.gov",
  selectors: {
    title: ".regulation-title",
    body: ".regulation-content",
    effective_date: ".date-effective"
  },
  rate_limit_ms: 2000,        // 2 seconds between requests
  use_ai_extraction: true,    // Use AI to parse complex text
  ai_extraction_prompt: "Extract key requirements from this regulation...",
  schedule_cron: "0 0 * * 1", // Run every Monday at midnight
  save_to_table: "state_regulations",
  is_active: true
}
```

**How Update Schedule Works:**
- **Daily:** Critical states (CA, OR, WA) - checks for urgent updates
- **Weekly:** High-regulation states (CO, NY, VT) - routine monitoring
- **Monthly:** Standard states - periodic refresh
- **Manual:** On-demand via Settings UI

### D. State Strictness Scoring

**Location:** Database column `state_regulations.strictness_score`
**Managed By:** Admin users via Settings

**How Scoring Works:**
1. **Automated Initial Scoring:**
   - Count of regulations per state
   - Frequency of updates
   - Average fine amounts
   - Number of required certifications
   
2. **Manual Adjustments:**
   - Admin can override score in Settings
   - Based on real-world experience
   - Industry-specific (organic vs fertilizer vs general)

**Impact on Compliance Checks:**
- Stricter states checked first in multi-state scans
- Warning messages adjusted based on score
- Recommended action urgency scaled by strictness

---

## 🔄 How Compliance Checks Work

### Basic Mode (Free Forever)

**User Flow:**
1. User selects target states (CO, CA, WA)
2. System retrieves user's saved regulation links
3. System suggests relevant .gov links based on industry
4. Returns manual checklist of requirements
5. User verifies compliance themselves

**Data Sources:**
- `user_regulatory_sources` - Links user has saved
- `suggested_regulations` - Curated links by industry/state
- `industry_settings` - Focus areas for checklist

**No AI Used:** Zero API cost

### Full AI Mode ($49/month)

**User Flow:**
1. User uploads label artwork
2. System extracts text via OCR (Tesseract + AI enhancement)
3. System fetches regulations for target states
4. AI analyzes label against regulations
5. Returns compliance report with violations/warnings/recommendations

**Data Flow:**
```
Label Upload
    ↓
[Tesseract OCR] → Raw text extraction
    ↓
[AI Enhancement] → Clean, structured text (uses current AI provider setting)
    ↓
[Database Query] → Fetch regulations for target states
    ↓               (filtered by industry keywords, ordered by strictness)
    ↓
[AI Analysis] → Compare label vs regulations (uses current AI provider setting)
    ↓
Compliance Report
```

**AI Calls Made:**
1. OCR enhancement: ~200 tokens (~$0.01)
2. Compliance analysis: ~3000 tokens (~$0.09)
3. **Total per check: ~$0.10** (with Gemini Flash)

**Tier Checking:**
```typescript
// In complianceService.ts
if (user.compliance_tier === 'basic' && user.trial_checks_remaining <= 0) {
  return { error: 'Upgrade to Full AI required' };
}

if (user.compliance_tier === 'full_ai' && user.checks_this_month >= user.monthly_check_limit) {
  return { error: 'Monthly limit reached' };
}
```

---

## 📊 Update Frequency & Data Freshness

### How Often is Data Updated?

**Automated Updates (via Scheduled Scraping):**
- **Critical States (CA, OR, WA):** Daily at 2 AM PST
- **High-Regulation States:** Weekly on Mondays
- **Standard States:** Monthly on 1st of month
- **All States:** Manual trigger available in Settings

**Change Detection:**
```typescript
// In regulation_changes table
{
  regulation_id: "uuid-here",
  field_changed: "rule_text",
  old_value: "Must display OMRI certification number",
  new_value: "Must display OMRI certification number and batch code",
  change_date: "2025-01-15",
  detected_by: "automated_scraper",
  ai_change_summary: "Added requirement for batch code display"
}
```

**User Notification:**
- Email sent when regulation changes affect user's products
- Dashboard alert in app
- Can subscribe to specific state/category combinations

### Manual Refresh Options

**In Settings:**
1. **Refresh Single State:** Click "Update Now" next to state name
2. **Refresh All States:** "Sync All Regulations" button
3. **Refresh By Industry:** Filter to your industry, then "Update Selected"

**In Compliance Check:**
- "Force Refresh" checkbox - bypasses cache, fetches latest data
- Recommended when: State legislation session just ended, major law passed

---

## 🎛️ Adjustable Settings Deep Dive

### 1. AI Provider Settings

**Gemini (Default)**
```typescript
{
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  apiKey: process.env.GEMINI_API_KEY,
  temperature: 0.3,
  maxTokens: 4096
}
```

**Why Gemini is Default:**
- Most cost-effective (~$0.05 per compliance check vs $0.15 for GPT-4)
- Fast response times (< 2 seconds)
- Good accuracy for structured data extraction
- High rate limits

**When to Switch to Other Providers:**
- **OpenAI GPT-4:** More nuanced legal interpretation needed
- **Anthropic Claude:** Highest accuracy for complex regulations
- **Azure OpenAI:** Enterprise security/compliance requirements

**Switching Process:**
```
Settings → Developer Settings → AI Provider Configuration
1. Select new provider
2. Enter API key
3. Click "Test Connection" (verifies key and model availability)
4. Save settings
5. All future compliance checks use new provider
```

### 2. State Selection & Prioritization

**User-Controlled:**
- In user profile: Select which states matter for their business
- Saved in `user_compliance_profiles.target_states`

**System Behavior:**
- Regulations fetched ONLY for user's target states
- Ordered by strictness (strictest first)
- Industry keyword filtering applied

**Example:**
```typescript
// User profile
{
  user_id: "user_123",
  industry: "organic_agriculture",
  target_states: ["CA", "OR", "CO"], // User's selling states
  product_types: ["soil_amendment", "compost"]
}

// Compliance check query
SELECT * FROM state_regulations
WHERE state IN ('CA', 'OR', 'CO')
  AND category IN ('organic', 'labeling', 'testing')
  AND keywords && ARRAY['organic', 'OMRI', 'compost', 'soil']
ORDER BY strictness_score DESC, effective_date DESC;
```

### 3. MCP Server Control

**Start/Stop Servers:**
```typescript
// In Settings UI (to be implemented)
await startMCPServer('tgf-compliance-server');
await stopMCPServer('tgf-scraping-server');
await restartMCPServer('tgf-compliance-server');
```

**Health Monitoring:**
- Automatic health checks every 5 minutes
- Status: running, stopped, error, starting
- Metrics tracked: requests, success rate, avg response time

**Server-Specific AI Override:**
```typescript
// Compliance server uses Claude for high accuracy
{
  server_name: 'tgf-compliance-server',
  override_ai_provider: true,
  ai_provider_config: {
    provider: 'anthropic',
    model: 'claude-3-sonnet'
  }
}

// Scraping server uses Gemini for cost efficiency
{
  server_name: 'tgf-scraping-server',
  override_ai_provider: true,
  ai_provider_config: {
    provider: 'gemini',
    model: 'gemini-2.5-flash'
  }
}
```

### 4. Scraping Schedule Management

**Adjust Update Frequency:**
```typescript
await updateScrapingConfig('colorado-organic', {
  schedule_cron: '0 */6 * * *', // Every 6 hours instead of daily
  rate_limit_ms: 5000,          // 5 seconds between requests (be polite)
  use_ai_extraction: false      // Turn off AI to save costs
});
```

**Cost Control:**
- `use_ai_extraction: false` - Use regex only, no AI (free but less accurate)
- `use_ai_extraction: true` - AI parses complex HTML (~$0.02 per page)

**Monitoring:**
```typescript
// In scraping_jobs table
{
  config_id: "config-uuid",
  status: "completed",
  items_found: 25,        // 25 regulations scraped
  items_saved: 23,        // 23 new or updated
  items_skipped: 2,       // 2 unchanged
  ai_calls_made: 25,      // Used AI 25 times
  ai_tokens_used: 12500,
  ai_cost_usd: 0.50       // Cost of this scraping job
}
```

---

## 🔧 Settings Page Implementation

### Required Components (To Be Built)

#### 1. MCP Server Management Panel
```tsx
<MCPServerPanel>
  <ServerCard server="tgf-compliance-server">
    <StatusIndicator /> {/* Green = running, Red = stopped */}
    <MetricsDisplay>
      <Metric label="Requests" value={1234} />
      <Metric label="Success Rate" value="98.5%" />
      <Metric label="Avg Response" value="1.2s" />
    </MetricsDisplay>
    <Actions>
      <Button onClick={startServer}>Start</Button>
      <Button onClick={stopServer}>Stop</Button>
      <Button onClick={restartServer}>Restart</Button>
      <Button onClick={viewLogs}>View Logs</Button>
    </Actions>
    <AIProviderOverride>
      <Checkbox checked={overrideAI} />
      <Select value="anthropic" /> {/* Provider for this server only */}
    </AIProviderOverride>
  </ServerCard>
</MCPServerPanel>
```

#### 2. Scraping Configuration Panel
```tsx
<ScrapingConfigPanel>
  <ConfigList>
    <ConfigCard config="Colorado Organic">
      <Schedule value="Weekly" onEdit={editSchedule} />
      <LastRun value="2 days ago" status="success" />
      <NextRun value="in 5 days" />
      <Stats>
        <Stat label="Success Rate" value="95%" />
        <Stat label="AI Cost (last 30d)" value="$12.50" />
      </Stats>
      <Actions>
        <Button onClick={runNow}>Run Now</Button>
        <Button onClick={editConfig}>Edit</Button>
        <Button onClick={viewJobs}>View History</Button>
      </Actions>
    </ConfigCard>
  </ConfigList>
  <AddNewConfig>
    <Form>
      <Input label="Config Name" />
      <Input label="Base URL" />
      <JSONEditor label="CSS Selectors" />
      <CronSelector label="Schedule" />
      <Toggle label="Use AI Extraction" />
      <Button>Create Config</Button>
    </Form>
  </AddNewConfig>
</ScrapingConfigPanel>
```

#### 3. State Strictness Manager
```tsx
<StateStrictnessManager>
  <StateList sortBy="strictness" descending>
    <StateCard state="CA">
      <StrictnessScore value={10} editable />
      <RegulationCount value={234} />
      <LastUpdated value="3 days ago" />
      <UpdateFrequency value="Daily" editable />
      <Actions>
        <Button onClick={updateNow}>Update Now</Button>
        <Button onClick={viewRegulations}>View All Regulations</Button>
      </Actions>
    </StateCard>
    {/* Repeat for all 50 states */}
  </StateList>
  <BulkActions>
    <Button onClick={updateAllStates}>Update All States</Button>
    <Button onClick={recalculateScores}>Recalculate Strictness Scores</Button>
  </BulkActions>
</StateStrictnessManager>
```

---

## 📈 Cost & Performance Optimization

### Current Costs (with Gemini Flash as default)

**Per User Per Month:**
- Basic users: $0 (no AI usage)
- Full AI users (50 checks/month): ~$5 in AI costs

**Infrastructure:**
- Supabase Pro: $25/month (unlimited API calls, 8GB database)
- MCP server hosting: $20/month (VPS or serverless)
- **Total at 100 users: $525/month costs, $4,900 revenue = 89% margin**

### Optimization Strategies

**1. Smart Caching:**
```typescript
// Check cache first
const cached = await redis.get(`regulation:${state}:${category}`);
if (cached && isFresh(cached.timestamp, 7 * 24 * 60 * 60 * 1000)) { // 7 days
  return cached.data; // Skip AI call
}

// Only call AI if cache miss or stale
```

**2. Batch Processing:**
```typescript
// Instead of 10 separate AI calls for 10 regulations:
const batchResult = await aiProvider.analyze({
  prompt: "Check this label against these 10 regulations...",
  regulations: [reg1, reg2, ...reg10]
});
// Saves: 10 calls → 1 call (90% cost reduction)
```

**3. Tiered AI Usage:**
```typescript
// Use cheap model for initial screening
const quickCheck = await geminiFlash.quickScan(label, regulations); // $0.01

if (quickCheck.potentialIssuesFound) {
  // Only use expensive model if issues detected
  const detailedAnalysis = await claude3Opus.deepAnalyze(label, regulations); // $0.15
}
```

---

## 🚀 Adding New States

**Manual Process:**
1. Research state's agriculture department website
2. Create scraping config in Settings
3. Test scraping with "Run Now"
4. Review extracted regulations
5. Set strictness score
6. Enable automatic updates

**Example: Adding New Mexico (NM)**
```typescript
await createScrapingConfig({
  config_name: "New Mexico Organic",
  base_url: "https://www.nmda.nmsu.edu",
  url_pattern: "/organic/*",
  domain: "nmda.nmsu.edu",
  selectors: {
    title: "h1.regulation-title",
    body: "div.regulation-body",
    code: "span.statute-number"
  },
  use_ai_extraction: true,
  schedule_cron: "0 0 * * 1", // Weekly
  save_to_table: "state_regulations",
  field_mappings: {
    state: "NM",
    category: "organic",
    strictness_score: 5 // Moderate
  }
});
```

---

## 🎯 Summary: How to Adjust Settings

### For End Users:
1. **Select Target States:** User profile → Pick states where you sell
2. **Choose Compliance Tier:** Basic (free) or Full AI ($49/mo)
3. **Save Regulation Links:** Basic mode → Add your own sources

### For Admins:
1. **AI Provider:** Settings → Developer Settings → AI Provider Configuration
2. **Update Schedule:** Settings → Scraping Configs → Edit schedule per state
3. **State Strictness:** Settings → State Management → Adjust scores
4. **MCP Servers:** Settings → MCP Management → Start/stop/configure servers
5. **Cost Control:** Toggle AI extraction on/off per scraping config

### For Developers:
- **Database:** All settings in `app_settings`, `mcp_server_configs`, `scraping_configs` tables
- **API:** Use `settingsService.ts` functions
- **Environment:** `.env` file for API keys (falls back to database settings)
