# TGF Compliance System

## Overview

A comprehensive state-by-state regulatory compliance system for product labels and artwork, featuring:

- **Regulation Database**: Structured storage of state regulations
- **MCP Server**: AI-powered regulation monitoring and extraction
- **Compliance Checker**: Automated label compliance verification
- **Change Detection**: Alerts for regulation updates

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interface                            │
│  (Artwork Page → Compliance Check → Review Results)          │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│              Compliance Service (Frontend)                   │
│  - checkLabelCompliance()                                    │
│  - getComplianceChecks()                                     │
│  - getStateRegulations()                                     │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                  Supabase Database                           │
│  ┌──────────────────┐  ┌────────────────────┐               │
│  │ state_regulations│  │ compliance_checks  │               │
│  │ - rule_text      │  │ - violations       │               │
│  │ - source_url     │  │ - warnings         │               │
│  │ - confidence     │  │ - compliance_score │               │
│  └──────────────────┘  └────────────────────┘               │
│                                                               │
│  ┌──────────────────┐  ┌────────────────────┐               │
│  │extraction_prompts│  │ regulation_changes │               │
│  └──────────────────┘  └────────────────────┘               │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼ (Periodic Updates)
┌─────────────────────────────────────────────────────────────┐
│              MCP Server (Background)                         │
│  Tools:                                                      │
│  - search_state_regulations                                  │
│  - extract_regulation_from_url                               │
│  - update_regulation_database                                │
│  - check_label_compliance                                    │
│  - get_regulation_changes                                    │
└─────────────────────────────────────────────────────────────┘
```

## Phase 1: Foundation (IMPLEMENTED)

### Database Schema ✅

Created `009_compliance_system.sql` migration with:

- **state_regulations**: Store regulatory requirements
- **compliance_checks**: Record compliance scan results
- **extraction_prompts**: Reusable AI prompt templates
- **regulation_changes**: Audit log of updates
- **regulation_update_jobs**: Track scheduled/manual updates

### MCP Server Structure ✅

Created TypeScript MCP server in `/mcp-server/`:

**Tools Available:**
1. `search_state_regulations` - Find regulations on .gov sites
2. `extract_regulation_from_url` - Parse HTML/PDF documents
3. `update_regulation_database` - Save new/changed regulations
4. `check_label_compliance` - Verify label against rules
5. `get_regulation_changes` - Monitor for updates

**Implementation Files:**
- `src/index.ts` - Main MCP server
- `src/tools/web-search.ts` - Government website scraper
- `src/tools/pdf-extractor.ts` - PDF regulation parser
- `src/tools/database-updater.ts` - Supabase integration
- `src/tools/compliance-checker.ts` - Rule matching engine

### Frontend Integration ✅

Created `services/complianceService.ts`:

- `checkLabelCompliance()` - Check label against regulations
- `getComplianceChecks()` - Fetch historical checks
- `getStateRegulations()` - Query regulation database

## Setup Instructions

### 1. Database Migration

```bash
# Run the migration
cd /workspaces/TGF-MRP
# Apply migration to Supabase (via Supabase CLI or dashboard)
```

### 2. MCP Server Setup

```bash
cd mcp-server

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your Supabase credentials
nano .env

# Build the server
npm run build

# Test it
npm run inspector
```

### 3. Seed Initial Regulations

You can manually seed regulations or use the MCP server:

```typescript
// Example: Add California fertilizer registration requirements
const caRegulations = [
  {
    state: 'CA',
    category: 'registration',
    rule_title: 'Fertilizer Product Registration',
    rule_text: 'All commercial fertilizers must be registered with CDFA before sale in California...',
    regulation_code: 'FAC Section 14500',
    source_url: 'https://www.cdfa.ca.gov/is/ffldrs/',
    agency_name: 'California Department of Food and Agriculture',
    agency_contact_email: 'fertilizer@cdfa.ca.gov',
    agency_contact_phone: '916-900-5022',
    confidence_score: 0.95
  }
];

// Use MCP tool: update_regulation_database
```

## Phase 2: Analysis Engine (NEXT STEPS)

### Integrate into Artwork Page

Add "Check Compliance" button to Artwork cards:

```tsx
// In Artwork.tsx
import { checkLabelCompliance } from '../services/complianceService';

const handleComplianceCheck = async (artwork: Artwork) => {
  const result = await checkLabelCompliance({
    product_name: artwork.extractedData?.productName || 'Unknown',
    ingredients: artwork.extractedData?.ingredients?.map(i => i.name) || [],
    claims: artwork.extractedData?.claims || [],
    warnings: artwork.extractedData?.warnings || [],
    net_weight: artwork.extractedData?.netWeight,
    states: ['CA', 'OR', 'WA'], // User selectable
    artwork_id: artwork.id
  });

  // Show results in modal
  setComplianceResult(result);
};
```

### OCR Integration

Enhance label scanning to extract compliance-relevant data:

- Product claims ("Organic", "Natural", "OMRI Listed")
- Warnings and precautionary statements
- Contact information
- Net weight declarations

## Phase 3: Automation (FUTURE)

### Scheduled Regulation Monitoring

```typescript
// Cron job (monthly)
- Check top 10 state .gov sites
- Compare with database
- Flag changes for review
- Alert team via email
```

### Change Detection System

- Diff checker for regulation text
- Email notifications
- Approval workflow before applying changes

## API Usage Examples

### Check Label Compliance

```typescript
import { checkLabelCompliance } from './services/complianceService';

const result = await checkLabelCompliance({
  product_name: 'Build-A-Soil Craft Blend',
  ingredients: ['Worm Castings', 'Kelp Meal', 'Neem Seed Meal'],
  claims: ['Organic', 'OMRI Listed'],
  warnings: ['Keep out of reach of children'],
  net_weight: '1 lb (454g)',
  states: ['CA', 'OR', 'WA', 'CO'],
  bom_id: 'bom_110105'
});

console.log(`Compliance Score: ${result.compliance_score}/100`);
console.log(`Status: ${result.overall_status}`);
console.log(`Violations: ${result.violations.length}`);
console.log(`Warnings: ${result.warnings.length}`);
```

### Get Regulations for a State

```typescript
import { getStateRegulations } from './services/complianceService';

const caRegs = await getStateRegulations('CA', 'labeling');

for (const reg of caRegs) {
  console.log(`${reg.regulation_code}: ${reg.rule_title}`);
}
```

### Monitor Regulation Changes

```typescript
// Via MCP server tool
const changes = await mcpClient.callTool('get_regulation_changes', {
  state: 'CA',
  days: 30,
  unacknowledged_only: true
});

// Alert user if changes detected
if (changes.count > 0) {
  notify('New regulation changes require review');
}
```

## MCP Server Commands

```bash
# Start MCP server
npm start

# Run with inspector (for testing)
npm run inspector

# Watch mode (development)
npm run dev
```

## Configuration

### Adjustable Prompt Templates

Edit prompts in database:

```sql
UPDATE extraction_prompts 
SET prompt_template = 'Your custom prompt here...'
WHERE name = 'CA Fertilizer Registration Extractor';
```

### Compliance Thresholds

Adjust scoring in `complianceService.ts`:

```typescript
// Current: critical = -20, high = -10, medium = -5
// Customize based on your risk tolerance
```

## Best Practices

1. **Manual Review**: Always review AI-extracted regulations before applying
2. **Source Citations**: Keep source URLs for legal defensibility
3. **Quarterly Updates**: Run regulation updates at least quarterly
4. **Test Labels**: Use BuildASoil labels as test cases
5. **State Priority**: Focus on CA, OR, WA, CO first (biggest markets)

## Troubleshooting

### MCP Server Won't Start

```bash
# Check environment variables
cat .env

# Verify Supabase connection
npm run inspector
# Then try: search_state_regulations("CA", "labeling")
```

### No Regulations Found

- Check database: `SELECT count(*) FROM state_regulations;`
- Seed initial data manually
- Run MCP update job for target states

### Low Confidence Scores

- Review extraction prompts
- Improve search keywords
- Use more specific regulation categories

## Roadmap

- [ ] Phase 1: Database + MCP Server ✅
- [ ] Phase 2: OCR + Compliance UI (Week 3-4)
- [ ] Phase 3: Scheduled Jobs + Alerts (Week 5-6)
- [ ] Phase 4: Vector Search (Semantic Matching)
- [ ] Phase 5: Multi-State Report Generator
- [ ] Phase 6: Regulation Change Subscriptions

## Support

For issues or questions:
- Check logs: `tail -f mcp-server/logs/server.log`
- Review Supabase dashboard for database errors
- Test MCP tools individually via inspector

## License

Proprietary - TGF Internal Use Only
