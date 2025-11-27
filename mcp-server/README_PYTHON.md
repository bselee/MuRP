# MuRP Compliance MCP Server - Python

## Overview

Python-based MCP server with 8 tools for state-by-state compliance management.

## Features

### Basic Mode Tools (Free)
- **onboard_user** - Set up user profile with industry/states
- **add_regulatory_source** - Save regulation links
- **basic_compliance_check** - Return manual checklist

### Full AI Mode Tools ($49/mo)
- **extract_label_text** - OCR text extraction from images
- **full_ai_compliance_check** - AI-powered analysis
- **scrape_state_regulation** - Fetch regulation text from .gov sites

### User Management
- **upgrade_to_full_ai** - Convert free → paid
- **get_compliance_summary** - Usage stats and history

## Installation

```bash
cd mcp-server

# Install Python dependencies
pip install -r requirements.txt

# Install Tesseract OCR (required for label scanning)
# macOS:
brew install tesseract

# Ubuntu/Debian:
sudo apt-get install tesseract-ocr

# Windows:
# Download from: https://github.com/UB-Mannheim/tesseract/wiki

# Configure environment
cp .env.example .env
nano .env
```

## Configuration

Edit `.env`:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Anthropic (for AI analysis)
ANTHROPIC_API_KEY=your-api-key
```

## Usage

### Start MCP Server

```bash
python src/server_python.py
```

### Test with MCP Inspector

```bash
# Install inspector
npm install -g @modelcontextprotocol/inspector

# Run server with inspector
mcp-inspector python src/server_python.py
```

Then open browser to test tools interactively.

### Example Tool Calls

#### 1. Onboard User

```json
{
  "name": "onboard_user",
  "arguments": {
    "user_id": "user_123",
    "email": "jeremy@buildasoil.com",
    "industry": "organic_agriculture",
    "target_states": ["CO", "CA", "WA"],
    "compliance_tier": "basic",
    "certifications": ["OMRI", "USDA_Organic"]
  }
}
```

Response:
```json
{
  "success": true,
  "user_id": "user_123",
  "industry": "organic_agriculture",
  "tier": "basic",
  "trial_checks_remaining": 5,
  "industry_focus_areas": [
    "OMRI certification number",
    "Organic percentage claims",
    "USDA Organic seal usage"
  ]
}
```

#### 2. Basic Compliance Check (Free)

```json
{
  "name": "basic_compliance_check",
  "arguments": {
    "user_id": "user_123",
    "product_name": "Craft Blend Organic Soil",
    "product_type": "soil_amendment",
    "target_states": ["CO", "CA"]
  }
}
```

Returns manual checklist + saved/suggested regulation sources.

#### 3. Full AI Compliance Check

```json
{
  "name": "full_ai_compliance_check",
  "arguments": {
    "user_id": "user_123",
    "product_name": "Craft Blend Organic Soil",
    "product_type": "soil_amendment",
    "target_states": ["CO", "CA", "WA"],
    "label_image_url": "https://storage.../label.png",
    "ingredients": ["Peat Moss", "Compost", "Perlite", "Mycorrhizae"],
    "claims": ["OMRI Listed", "100% Organic"],
    "certifications": ["OMRI"]
  }
}
```

Response:
```json
{
  "success": true,
  "analysis": {
    "overall_compliant": false,
    "confidence_score": 0.92,
    "issues": [
      {
        "severity": "critical",
        "state": "CO",
        "regulation": "CO Rev Stat §35-12-106",
        "finding": "OMRI certification number not displayed",
        "recommendation": "Add OMRI certification number to label"
      }
    ],
    "compliant_elements": [
      "Proper ingredient order by weight",
      "Net weight declaration present"
    ]
  },
  "checks_remaining": 4
}
```

#### 4. Extract Label Text (OCR)

```json
{
  "name": "extract_label_text",
  "arguments": {
    "image_url": "https://storage.supabase.co/.../label.png",
    "product_name": "Craft Blend"
  }
}
```

Returns:
```json
{
  "success": true,
  "full_text": "CRAFT BLEND\nORGANIC SOIL AMENDMENT...",
  "parsed_data": {
    "ingredients": ["Peat Moss 40%", "Compost 30%", "Perlite 20%"],
    "claims": ["OMRI Listed", "100% Organic"],
    "warnings": ["Keep out of reach of children"],
    "net_weight": "1 cu ft (28.3 L)"
  }
}
```

#### 5. Scrape State Regulation

```json
{
  "name": "scrape_state_regulation",
  "arguments": {
    "state_code": "CO",
    "regulation_type": "organic",
    "source_url": "https://ag.colorado.gov/plants/organic"
  }
}
```

Returns scraped regulation text and key sections.

## Integration with Your App

### Example: Check Label on Upload

```python
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def check_uploaded_label(
    user_id: str,
    artwork_url: str,
    product_name: str
):
    # Connect to MCP server
    server_params = StdioServerParameters(
        command="python",
        args=["src/server_python.py"],
        env=None
    )
    
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            # Initialize
            await session.initialize()
            
            # Run AI compliance check
            result = await session.call_tool(
                "full_ai_compliance_check",
                arguments={
                    "user_id": user_id,
                    "product_name": product_name,
                    "product_type": "soil_amendment",
                    "target_states": ["CO", "CA", "WA"],
                    "label_image_url": artwork_url,
                    "certifications": ["OMRI"]
                }
            )
            
            # Parse response
            data = json.loads(result.content[0].text)
            
            if not data["analysis"]["overall_compliant"]:
                # Alert user
                send_notification(
                    user_id,
                    f"Compliance issues found: {len(data['analysis']['issues'])} issues"
                )
            
            return data
```

### Example: Scheduled Regulation Updates

```python
# Daily cron job
async def update_state_regulations():
    states_to_update = ["CO", "CA", "OR", "WA"]
    
    for state in states_to_update:
        # Scrape official sources
        result = await session.call_tool(
            "scrape_state_regulation",
            arguments={
                "state_code": state,
                "regulation_type": "organic",
                "source_url": get_official_url(state)
            }
        )
        
        # Parse and save to database
        # (Implementation varies based on your needs)
```

## Architecture

```
Your React App
    ↓
MCP Client (JavaScript)
    ↓ (stdio)
Python MCP Server
    ↓
┌─────────────────────┐
│  8 Tools Available  │
├─────────────────────┤
│ • User onboarding   │
│ • Add sources       │
│ • Basic checks      │
│ • OCR extraction    │
│ • AI analysis       │
│ • Web scraping      │
│ • Upgrades          │
│ • Analytics         │
└─────────────────────┘
    ↓
Supabase Database
```

## Costs

### Free (Basic Mode)
- No API costs
- Unlimited manual checks
- 5 trial AI checks

### Full AI ($49/mo)
- Anthropic API: ~$0.10/check
- 50 checks/month included = ~$5 API cost
- Additional checks: ~$0.12 each (cost + 20% markup)

## Development

### Run Tests

```bash
# Test OCR
python -c "import pytesseract; print(pytesseract.get_tesseract_version())"

# Test Anthropic API
python -c "from anthropic import Anthropic; print('API OK')"

# Test Supabase connection
python -c "from supabase import create_client; print('Supabase OK')"
```

### Debug Mode

Set environment variable:
```bash
export MCP_DEBUG=1
python src/server_python.py
```

## Troubleshooting

### "Tesseract not found"
Install Tesseract OCR for your platform (see Installation section).

### "Anthropic API error"
Check your `ANTHROPIC_API_KEY` in `.env`.

### "Supabase connection failed"
Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in `.env`.

### "Tool not found"
Make sure you're using the latest MCP SDK version: `pip install --upgrade mcp`

## Production Deployment

### Option 1: Long-running Process

```bash
# Run with supervisor or systemd
python src/server_python.py
```

### Option 2: Serverless (AWS Lambda, Cloud Functions)

```python
# Adapt for serverless - use Lambda handler
# (Contact for serverless template)
```

### Option 3: Docker

```dockerfile
FROM python:3.11-slim

# Install Tesseract
RUN apt-get update && apt-get install -y tesseract-ocr

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY src/ ./src/
CMD ["python", "src/server_python.py"]
```

## Support

For issues:
1. Check logs: `tail -f mcp-server.log`
2. Test individual tools with inspector
3. Verify environment variables
4. Check Supabase connectivity

## License

Proprietary - MuRP Internal Use Only
