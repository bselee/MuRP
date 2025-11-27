# API Ingestion Setup Guide

This guide walks you through setting up the secure API ingestion architecture for MuRP.

## 🔐 Security-First Architecture

**Critical Principle: API Keys NEVER in Frontend**

```
❌ Insecure:
Frontend → External API (keys exposed in browser)

✅ Secure:
Frontend → Backend Proxy → External API (keys server-side only)
```

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Environment Configuration](#environment-configuration)
3. [Supabase Setup](#supabase-setup)
4. [Finale Inventory Integration](#finale-inventory-integration)
5. [Using the Secure API Client](#using-the-secure-api-client)
6. [Rate Limiting](#rate-limiting)
7. [Monitoring & Audit Logs](#monitoring--audit-logs)
8. [Troubleshooting](#troubleshooting)

## 🚀 Quick Start

### 1. Update Your Existing .env.local

You already have a `.env.local` file. Add these new variables to it (see `.env.local.example` for reference):

### 2. Configure Environment Variables

Edit your existing `.env.local` and add any new credentials you need:

```bash
# Gemini AI (for existing features)
VITE_GEMINI_API_KEY=your_gemini_api_key_here

# Supabase (optional, for backend proxy)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Finale Inventory
FINALE_API_URL=https://app.finaleinventory.com/api/v1
FINALE_API_SUBDOMAIN=your_subdomain
FINALE_API_CLIENT_ID=your_client_id
FINALE_API_CLIENT_SECRET=your_client_secret
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

## 🔧 Environment Configuration

### Required Variables (Already in your .env.local)

| Variable | Description | Where to Get It |
|----------|-------------|-----------------|
| `API_KEY` or `VITE_GEMINI_API_KEY` | Google Gemini API key | [Google AI Studio](https://makersuite.google.com/app/apikey) |

**Note**: The code supports both `API_KEY` (existing) and `VITE_GEMINI_API_KEY` (Vite standard) for backward compatibility.

### Optional (for Supabase Backend)

| Variable | Description | Where to Get It |
|----------|-------------|-----------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL | [Supabase Dashboard → Settings → API](https://app.supabase.com) |
| `VITE_SUPABASE_ANON_KEY` | Public anonymous key | Same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin service key | Same as above (keep secret!) |

### New Variables (Add to your existing .env.local if using Finale)

| Variable | Description | Where to Get It |
|----------|-------------|-----------------|
| `VITE_FINALE_API_URL` | Finale API base URL | Usually `https://app.finaleinventory.com/api/v1` |
| `VITE_FINALE_API_SUBDOMAIN` | Your Finale subdomain | Your account settings |
| `VITE_FINALE_API_CLIENT_ID` | OAuth client ID | Finale API settings |
| `VITE_FINALE_API_CLIENT_SECRET` | OAuth client secret | Finale API settings |

## 🗄️ Supabase Setup

### Option 1: Using Supabase (Recommended for Production)

1. **Create a Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Click "New Project"
   - Note your project URL and API keys

2. **Install Supabase CLI**
   ```bash
   npm install -g supabase
   ```

3. **Link Your Project**
   ```bash
   supabase link --project-ref your-project-ref
   ```

4. **Run Migrations**
   ```bash
   supabase db push
   ```

5. **Deploy Edge Function**
   ```bash
   supabase functions deploy api-proxy
   ```

6. **Set Environment Secrets**
   ```bash
   supabase secrets set FINALE_API_URL=https://app.finaleinventory.com/api/v1
   supabase secrets set FINALE_API_SUBDOMAIN=your_subdomain
   supabase secrets set FINALE_API_CLIENT_ID=your_client_id
   supabase secrets set FINALE_API_CLIENT_SECRET=your_client_secret
   supabase secrets set GEMINI_API_KEY=your_gemini_key
   ```

### Option 2: Without Supabase (Development Only)

For development without Supabase:

1. **Direct API Access** (NOT for production)
   - Frontend services will use credentials from `.env.local`
   - Circuit breaker and rate limiting still apply
   - ⚠️ API keys will be exposed in browser bundle

2. **Custom Backend Proxy**
   - Implement your own backend proxy using the pattern in `supabase/functions/api-proxy/index.ts`
   - Deploy to your preferred platform (Vercel, AWS Lambda, etc.)
   - Set `VITE_BACKEND_API_URL` to your proxy endpoint

## 🏪 Finale Inventory Integration

### Getting Finale API Credentials

1. **Log in to Finale Inventory**
   - Go to your Finale account
   - Navigate to Settings → API

2. **Create OAuth Client**
   - Click "Create New Application"
   - Note your Client ID and Client Secret
   - Set appropriate scopes (inventory:read, vendors:read, purchase_orders:read)

3. **Test Connection**
   ```typescript
   import { createFinaleService } from './services/finaleIngestion';
   
   const finaleService = createFinaleService();
   if (finaleService) {
     const status = finaleService.getStatus();
     console.log('Finale connection:', status);
   }
   ```

### Sync Data from Finale

```typescript
import { getSecureApiClient } from './services/secureApiClient';

const client = getSecureApiClient();

// Sync all data
const data = await client.syncFinaleAll();
console.log('Synced:', data);

// Or sync individually
const inventory = await client.pullFinaleInventory();
const vendors = await client.pullFinaleVendors();
const pos = await client.pullFinalePurchaseOrders();
```

## 🚦 Rate Limiting

The system implements multi-layer rate limiting:

### Per-User Limits
- **Default**: 60 requests per minute per user
- **Purpose**: Prevent individual users from overwhelming the system
- **Configure**: Set `VITE_RATE_LIMIT_PER_USER` in `.env.local`

### Application-Wide Limits
- **Default**: 1,000 requests per hour total
- **Purpose**: Stay within external API quotas
- **Configure**: Set `VITE_RATE_LIMIT_TOTAL_HOUR` in `.env.local`

### Request Queuing
When rate limits are hit:
1. Requests are automatically queued
2. Processed when the window resets
3. No requests are dropped

### Circuit Breaker
After repeated failures:
1. **Threshold**: 5 failures by default
2. **Open Circuit**: Stops calling API for 1 minute
3. **Half-Open**: Tests if service recovered
4. **Auto-Recovery**: Resumes normal operation

Configure circuit breaker:
```bash
VITE_CIRCUIT_BREAKER_THRESHOLD=5
VITE_CIRCUIT_BREAKER_TIMEOUT=60000
```

## 📊 Monitoring & Audit Logs

### Viewing Audit Logs

All API requests are logged to the `api_audit_log` table.

**Query Examples:**

```sql
-- Recent API calls
SELECT * FROM api_audit_log 
ORDER BY timestamp DESC 
LIMIT 100;

-- Failed requests
SELECT * FROM api_audit_log 
WHERE success = false 
ORDER BY timestamp DESC;

-- Cost summary by service
SELECT * FROM api_cost_summary 
ORDER BY date DESC;

-- User usage statistics
SELECT * FROM user_api_usage 
WHERE user_id = 'your-user-id';
```

### Monitoring Dashboard

Key metrics to monitor:

1. **Request Rate**: Requests per minute
2. **Error Rate**: Percentage of failed requests
3. **Latency**: Average execution time
4. **Cost**: Estimated API costs
5. **Rate Limit Hits**: How often limits are reached

### Alerts

Set up alerts for:
- Circuit breaker trips
- High error rates (>5%)
- Approaching rate limits
- Unusual cost spikes

## 🔍 Troubleshooting

### "Circuit breaker is OPEN"

**Cause**: Too many API failures
**Solution**:
```typescript
import { finaleCircuitBreaker } from './services/circuitBreaker';

// Check status
console.log(finaleCircuitBreaker.getStats());

// Manual reset (if issue resolved)
finaleCircuitBreaker.reset();
```

### "Rate limit exceeded"

**Cause**: Too many requests in time window
**Solution**:
```typescript
import { perUserLimiter } from './services/rateLimiter';

// Check status
const status = perUserLimiter.getStatus('finale-api');
console.log('Remaining:', status.remaining);
console.log('Reset at:', new Date(status.resetTime));

// Wait for window to reset, or requests will be auto-queued
```

### "Finale credentials not configured"

**Cause**: Missing environment variables
**Solution**:
1. Verify `.env.local` has all Finale variables
2. Restart dev server after changing `.env.local`
3. Check Supabase secrets if using Edge Functions

### "Unauthorized: Invalid authentication token"

**Cause**: Missing or invalid Supabase auth token
**Solution**:
```typescript
import { getSecureApiClient } from './services/secureApiClient';

const client = getSecureApiClient();

// Set auth token after user login
client.setAuthToken(userAuthToken);
```

### Testing Without Finale

If you don't have Finale credentials yet:

1. **Use Mock Data**: The app already has mock data in `App.tsx`
2. **Skip Sync**: Don't call Finale sync methods
3. **Test Other Features**: Rate limiting and circuit breaker work independently

## 🧪 Testing

### Test Rate Limiter

```typescript
import { RateLimiter } from './services/rateLimiter';

const limiter = new RateLimiter({
  maxRequestsPerWindow: 5,
  windowMs: 10000, // 10 seconds
});

// Make requests
for (let i = 0; i < 10; i++) {
  await limiter.checkLimit('test');
  console.log(`Request ${i + 1} processed`);
}
```

### Test Circuit Breaker

```typescript
import { CircuitBreaker } from './services/circuitBreaker';

const breaker = new CircuitBreaker({
  failureThreshold: 3,
  timeout: 5000,
  name: 'test-service',
});

// Simulate failures
for (let i = 0; i < 5; i++) {
  try {
    await breaker.execute(async () => {
      throw new Error('Simulated failure');
    });
  } catch (error) {
    console.log('Expected error:', error.message);
  }
}

console.log('Stats:', breaker.getStats());
```

### Test Retry Logic

```typescript
import { retryWithBackoff } from './services/retryWithBackoff';

let attempts = 0;

const result = await retryWithBackoff(async () => {
  attempts++;
  if (attempts < 3) {
    throw new Error('Simulated failure');
  }
  return 'Success!';
}, {
  maxRetries: 5,
  initialDelayMs: 1000,
});

console.log('Result:', result);
console.log('Total attempts:', attempts);
```

## 📚 Architecture Details

For detailed architecture information, see:
- `ARCHITECTURE_ANALYSIS.md` - Complete project analysis
- `DATA_FLOW_ARCHITECTURE.md` - Data flow diagrams
- `API_SECURITY_RATE_LIMITING.md` - Security patterns
- `backend_documentation.md` - Backend API specification

## 🔒 Security Best Practices

1. **Never commit `.env.local`** - Already in `.gitignore`
2. **Rotate keys regularly** - Update credentials periodically
3. **Use Supabase Vault** - For production deployments
4. **Enable RLS** - Row Level Security on all tables
5. **Monitor audit logs** - Watch for suspicious activity
6. **Sanitize inputs** - All user inputs validated
7. **Rate limit aggressively** - Better safe than sorry
8. **Use HTTPS only** - No plain HTTP in production

## 🚀 Next Steps

1. **Configure Environment** - Set up `.env.local`
2. **Test Locally** - Run `npm run dev`
3. **Set Up Supabase** - For production deployment
4. **Deploy Edge Function** - API proxy to Supabase
5. **Configure Finale** - Connect to inventory system
6. **Monitor Usage** - Set up dashboards and alerts
7. **Scale Gradually** - Start with low rate limits

## 📞 Support

For issues or questions:
1. Check this documentation
2. Review audit logs for errors
3. Test circuit breaker status
4. Verify environment configuration
5. Contact system administrator

---

**Remember**: Security first! Never expose API keys in frontend code.
