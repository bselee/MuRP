# MCP Server Setup & Testing Guide

## Quick Start

### 1. Configure Environment

```bash
cd /workspaces/MuRP/mcp-server

# Copy environment template
cp .env.example .env

# Edit with your credentials
nano .env
```

Add your credentials:
```bash
SUPABASE_URL=https://mpuevsmtowyexhsqugkm.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here
ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

### 2. Deploy Database Migration

First, deploy the enhanced migration to Supabase:

```bash
# Option 1: Using Supabase CLI
supabase db push

# Option 2: Copy SQL to Supabase Dashboard
# 1. Go to: https://supabase.com/dashboard/project/mpuevsmtowyexhsqugkm/sql
# 2. Paste contents of: supabase/migrations/009_compliance_system.sql
# 3. Click Run
```

Verify tables created:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE '%compliance%';
```

Should show 15 tables:
- state_regulations
- compliance_checks
- extraction_prompts
- regulation_changes
- regulation_update_jobs
- user_compliance_profiles
- industry_settings
- user_regulatory_sources
- usage_analytics
- suggested_regulations
- ... (and 5 more supporting tables)

### 3. Test Python MCP Server

```bash
cd /workspaces/MuRP/mcp-server

# Test Tesseract OCR
tesseract --version
# Should output: tesseract 5.x

# Test Python imports
python3 -c "from src.server_python import *; print('✅ Imports OK')"

# Run test suite
python test_mcp_tools.py
```

Expected output:
```
=== Test 1: Onboard User ===
{
  "success": true,
  "user_id": "test_user_123",
  "industry": "organic_agriculture",
  "tier": "basic",
  "trial_checks_remaining": 5
}

=== Test 2: Add Regulatory Source ===
{
  "success": true,
  "source_id": "uuid-here",
  "message": "Added organic regulation for CO"
}

=== Test 3: Basic Compliance Check ===
{
  "product_name": "Craft Blend Organic Soil",
  "regulatory_sources_by_state": {...},
  "checklist_items": [...]
}
```

### 4. Test Individual Tools

#### Test Scraping

```bash
python -c "
import asyncio
from src.server_python import scrape_state_regulation

async def test():
    result = await scrape_state_regulation(
        state_code='CO',
        regulation_type='organic',
        source_url='https://ag.colorado.gov/plants/organic'
    )
    print(result[0].text)

asyncio.run(test())
"
```

#### Test OCR

```bash
# Create test image with text
echo "TEST LABEL - OMRI Listed - 100% Organic" | convert -size 500x100 -background white -fill black label:@- test_label.png

# Extract text
python -c "
import pytesseract
from PIL import Image
img = Image.open('test_label.png')
text = pytesseract.image_to_string(img)
print('Extracted:', text)
"
```

### 5. Start MCP Server

```bash
# Run in foreground (for testing)
python src/server_python.py

# Or run with MCP Inspector (browser UI)
npm install -g @modelcontextprotocol/inspector
mcp-inspector python src/server_python.py
# Opens browser at http://localhost:5173
```

### 6. Test from Frontend

Add to your React app:

```typescript
// services/complianceService.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function checkLabelWithMCP(
  userId: string,
  productName: string,
  labelImageUrl: string
) {
  // Connect to MCP server
  const transport = new StdioClientTransport({
    command: 'python',
    args: ['../mcp-server/src/server_python.py'],
  });

  const client = new Client({
    name: 'tgf-compliance-client',
    version: '1.0.0',
  }, {
    capabilities: {},
  });

  await client.connect(transport);

  // Call full_ai_compliance_check tool
  const result = await client.callTool({
    name: 'full_ai_compliance_check',
    arguments: {
      user_id: userId,
      product_name: productName,
      product_type: 'soil_amendment',
      target_states: ['CO', 'CA', 'WA'],
      label_image_url: labelImageUrl,
      certifications: ['OMRI'],
    },
  });

  return JSON.parse(result.content[0].text);
}
```

## Testing Checklist

- [ ] Database migration deployed (15 tables)
- [ ] Environment variables configured (.env)
- [ ] Tesseract OCR installed and working
- [ ] Python dependencies installed (mcp, supabase, anthropic)
- [ ] Test suite passes (python test_mcp_tools.py)
- [ ] Web scraping works (test CO/CA/WA .gov sites)
- [ ] OCR extraction works (test with sample label)
- [ ] MCP server starts without errors
- [ ] Tools callable from MCP Inspector
- [ ] Integration with React frontend tested

## Next Steps After Testing

### 1. Seed Initial Regulations

```bash
# Run scraper for key states
python -c "
import asyncio
from src.scrapers import get_scraper

async def seed_regulations():
    for state in ['CO', 'CA', 'WA', 'OR']:
        scraper = get_scraper(state)
        if scraper:
            organic_data = scraper.scrape_organic_regs()
            print(f'{state}: {len(organic_data.get(\"full_text\", \"\"))} chars')
            # Save to database (implement save logic)

asyncio.run(seed_regulations())
"
```

### 2. Add Stripe Payment Integration

```typescript
// components/ComplianceTierSelector.tsx
const handleUpgrade = async () => {
  // Create Stripe checkout session
  const { data: session } = await supabase.functions.invoke('create-checkout', {
    body: { 
      userId,
      priceId: 'price_1234567890', // Your Stripe price ID
      successUrl: window.location.origin + '/compliance?upgraded=true',
      cancelUrl: window.location.origin + '/compliance',
    }
  });
  
  // Redirect to Stripe
  window.location.href = session.url;
};
```

### 3. Add Scheduled Regulation Updates

```bash
# Create cron job or scheduled function
# Run weekly to check for regulation changes
0 0 * * 0 cd /path/to/mcp-server && python scripts/update_regulations.py
```

## Troubleshooting

### "ModuleNotFoundError: No module named 'mcp'"

```bash
cd /workspaces/MuRP/mcp-server
pip install -r requirements.txt
```

### "Tesseract not found"

```bash
# Ubuntu/Debian
sudo apt-get install tesseract-ocr

# macOS
brew install tesseract

# Verify
tesseract --version
```

### "Anthropic API error"

- Check API key is set in .env
- Verify key is valid: https://console.anthropic.com/settings/keys
- Check API usage limits

### "Supabase connection failed"

- Verify SUPABASE_URL in .env
- Use SERVICE_KEY (not anon key)
- Check RLS policies allow service role access

### "Scraping returns empty text"

- Website structure may have changed
- Check if site requires JavaScript (use selenium instead)
- Verify URL is correct
- Check for rate limiting

## Cost Estimates

### Development/Testing Phase
- Anthropic API: ~$0.10 per test check
- Supabase: Free tier (up to 500 MB database)
- Total: <$10/month for testing

### Production (100 paying users)
- Anthropic API: 5,000 checks/mo × $0.10 = $500/mo
- Supabase: Pro plan = $25/mo
- Server hosting (if needed): $20/mo
- **Total costs: ~$545/mo**
- **Revenue: 100 × $49 = $4,900/mo**
- **Profit: $4,355/mo (89% margin)**

## Production Deployment Options

### Option 1: Long-Running Process (Simplest)

```bash
# Use supervisor or systemd
sudo systemctl start tgf-compliance-mcp
```

### Option 2: Serverless (AWS Lambda)

Convert to Lambda handler:
```python
def lambda_handler(event, context):
    # Parse MCP request
    # Call appropriate tool
    # Return MCP response
```

### Option 3: Docker Container

```dockerfile
FROM python:3.11-slim
RUN apt-get update && apt-get install -y tesseract-ocr
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY src/ ./src/
CMD ["python", "src/server_python.py"]
```

## Support

Questions? Check:
1. MCP docs: https://modelcontextprotocol.io/
2. Test logs: `tail -f mcp-server.log`
3. Supabase dashboard for database errors
4. Anthropic console for API usage
