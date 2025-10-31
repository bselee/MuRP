# API Ingestion Usage Examples

Quick reference for using the secure API ingestion services in your code.

## 📦 Importing Services

```typescript
// Rate Limiting
import { perUserLimiter, applicationLimiter, RateLimiter } from './services/rateLimiter';

// Circuit Breaker
import { CircuitBreaker, geminiCircuitBreaker, finaleCircuitBreaker } from './services/circuitBreaker';

// Retry with Backoff
import { retryWithBackoff } from './services/retryWithBackoff';

// Finale Ingestion
import { createFinaleService, FinaleIngestionService } from './services/finaleIngestion';

// Secure API Client (for frontend)
import { getSecureApiClient } from './services/secureApiClient';
```

## 🚦 Rate Limiting Examples

### Basic Usage

```typescript
import { perUserLimiter } from './services/rateLimiter';

async function makeApiCall() {
  // Wait if rate limit is hit (request will be queued automatically)
  await perUserLimiter.checkLimit('my-api');
  
  // Make your API call
  const response = await fetch('https://api.example.com/data');
  return response.json();
}
```

### Check Rate Limit Status

```typescript
const status = perUserLimiter.getStatus('my-api');
console.log(`Remaining requests: ${status.remaining}`);
console.log(`Resets at: ${new Date(status.resetTime)}`);
```

### Custom Rate Limiter

```typescript
import { RateLimiter } from './services/rateLimiter';

const customLimiter = new RateLimiter({
  maxRequestsPerWindow: 10,  // 10 requests
  windowMs: 60000,           // per minute
  userId: currentUser.id,    // optional: per-user tracking
});

await customLimiter.checkLimit('custom-api');
```

## 🛡️ Circuit Breaker Examples

### Basic Usage

```typescript
import { finaleCircuitBreaker } from './services/circuitBreaker';

async function callFinaleApi() {
  try {
    const result = await finaleCircuitBreaker.execute(async () => {
      const response = await fetch('https://finale-api.com/endpoint');
      if (!response.ok) throw new Error('API error');
      return response.json();
    });
    
    return result;
  } catch (error) {
    // Circuit breaker is open or API call failed
    console.error('Circuit breaker error:', error);
    throw error;
  }
}
```

### Check Circuit Breaker Status

```typescript
const stats = finaleCircuitBreaker.getStats();
console.log('State:', stats.state);           // CLOSED, OPEN, or HALF_OPEN
console.log('Failures:', stats.failures);
console.log('Successes:', stats.successes);

if (stats.nextAttemptTime) {
  console.log('Will retry at:', new Date(stats.nextAttemptTime));
}
```

### Manual Reset

```typescript
// Reset circuit breaker if you know the issue is resolved
finaleCircuitBreaker.reset();
```

### Custom Circuit Breaker

```typescript
import { CircuitBreaker } from './services/circuitBreaker';

const myBreaker = new CircuitBreaker({
  failureThreshold: 3,    // Open after 3 failures
  timeout: 30000,         // Wait 30 seconds before retry
  name: 'my-service',     // For logging
});

const result = await myBreaker.execute(() => myApiCall());
```

## 🔄 Retry with Backoff Examples

### Basic Usage

```typescript
import { retryWithBackoff } from './services/retryWithBackoff';

const data = await retryWithBackoff(
  async () => {
    const response = await fetch('https://api.example.com/data');
    if (!response.ok) throw new Error('Request failed');
    return response.json();
  },
  {
    maxRetries: 5,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
  }
);
```

### Custom Configuration

```typescript
const result = await retryWithBackoff(
  () => myApiCall(),
  {
    maxRetries: 3,
    initialDelayMs: 2000,      // Start with 2 second delay
    maxDelayMs: 60000,         // Max 60 seconds
    backoffMultiplier: 3,      // 2s → 6s → 18s → 54s
    retryableStatuses: [408, 429, 500, 502, 503, 504],
  }
);
```

### With Detailed Results

```typescript
import { retryWithBackoffDetailed } from './services/retryWithBackoff';

const result = await retryWithBackoffDetailed(() => myApiCall());

if (result.success) {
  console.log('Data:', result.data);
  console.log('Took', result.attempts, 'attempts');
} else {
  console.error('Failed after', result.attempts, 'attempts');
  console.error('Error:', result.error);
}
```

## 🏪 Finale Integration Examples

### Initialize Finale Service

```typescript
import { createFinaleService } from './services/finaleIngestion';

// Automatically loads credentials from environment
const finaleService = createFinaleService();

if (!finaleService) {
  console.error('Finale credentials not configured');
  return;
}
```

### Sync Inventory

```typescript
const inventory = await finaleService.pullInventory();
console.log(`Synced ${inventory.length} inventory items`);

// Use the inventory data
inventory.forEach(item => {
  console.log(`${item.sku}: ${item.name} (${item.stock} in stock)`);
});
```

### Sync Vendors

```typescript
const vendors = await finaleService.pullVendors();
console.log(`Synced ${vendors.length} vendors`);
```

### Sync Purchase Orders

```typescript
const purchaseOrders = await finaleService.pullPurchaseOrders();
console.log(`Synced ${purchaseOrders.length} purchase orders`);
```

### Sync Everything

```typescript
try {
  const { inventory, vendors, purchaseOrders } = await finaleService.syncAll();
  
  console.log('Sync complete!');
  console.log(`- ${inventory.length} inventory items`);
  console.log(`- ${vendors.length} vendors`);
  console.log(`- ${purchaseOrders.length} purchase orders`);
  
  // Update your app state
  setInventory(inventory);
  setVendors(vendors);
  setPurchaseOrders(purchaseOrders);
  
} catch (error) {
  console.error('Sync failed:', error);
}
```

### Check Sync Status

```typescript
const status = finaleService.getStatus();

console.log('Circuit Breaker:', status.circuitBreaker.state);
console.log('Rate Limit:', status.rateLimit.perUser.remaining, 'requests remaining');
console.log('Token Valid:', status.tokenValid);
```

## 🔐 Secure API Client Examples (Frontend)

### Initialize Client

```typescript
import { getSecureApiClient } from './services/secureApiClient';

const apiClient = getSecureApiClient();

// Set auth token after user logs in
apiClient.setAuthToken(userAuthToken);
```

### Use Pre-built Methods

```typescript
// Sync all Finale data through secure backend
const data = await apiClient.syncFinaleAll();

// Or sync individually
const inventory = await apiClient.pullFinaleInventory();
const vendors = await apiClient.pullFinaleVendors();
const pos = await apiClient.pullFinalePurchaseOrders();
```

### Custom API Requests

```typescript
// Make custom requests through the secure proxy
const result = await apiClient.request(
  'finale',              // service name
  'customAction',        // action name
  { param1: 'value1' }   // parameters
);
```

### Check Service Status

```typescript
const status = await apiClient.getFinaleStatus();
console.log('Service health:', status);
```

## 🎯 Complete Integration Example

Here's a complete example of using all services together:

```typescript
import { useState } from 'react';
import { getSecureApiClient } from './services/secureApiClient';
import { createFinaleService } from './services/finaleIngestion';
import type { InventoryItem, Vendor, PurchaseOrder } from './types';

export function SyncComponent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);

  const handleSync = async () => {
    setLoading(true);
    setError(null);

    try {
      // Option 1: Use secure API client (routes through backend)
      const apiClient = getSecureApiClient();
      const data = await apiClient.syncFinaleAll();
      
      setInventory(data.inventory);
      setVendors(data.vendors);
      setPOs(data.purchaseOrders);
      
      console.log('Sync completed successfully!');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync failed';
      setError(errorMessage);
      console.error('Sync error:', err);
      
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    try {
      const finaleService = createFinaleService();
      if (!finaleService) {
        setError('Finale not configured');
        return;
      }

      const status = finaleService.getStatus();
      
      if (status.circuitBreaker.state === 'OPEN') {
        setError('Service temporarily unavailable. Please try again later.');
      } else if (status.rateLimit.perUser.remaining === 0) {
        setError('Rate limit reached. Please wait before retrying.');
      } else {
        console.log('Service is healthy');
      }
      
    } catch (err) {
      console.error('Status check failed:', err);
    }
  };

  return (
    <div>
      <button onClick={handleSync} disabled={loading}>
        {loading ? 'Syncing...' : 'Sync from Finale'}
      </button>
      
      <button onClick={checkStatus}>
        Check Status
      </button>
      
      {error && <div className="error">{error}</div>}
      
      {inventory.length > 0 && (
        <div>
          <h3>Synced {inventory.length} items</h3>
          <p>Latest sync: {new Date().toLocaleString()}</p>
        </div>
      )}
    </div>
  );
}
```

## 🧪 Testing Examples

### Test Rate Limiter

```typescript
import { RateLimiter } from './services/rateLimiter';

async function testRateLimiter() {
  const limiter = new RateLimiter({
    maxRequestsPerWindow: 5,
    windowMs: 10000, // 10 seconds
  });

  console.log('Making 10 requests (limit is 5 per 10s)...');
  
  for (let i = 0; i < 10; i++) {
    const start = Date.now();
    await limiter.checkLimit('test');
    const elapsed = Date.now() - start;
    
    console.log(`Request ${i + 1}: ${elapsed}ms`);
  }
  
  // First 5 should be instant, next 5 should wait
}
```

### Test Circuit Breaker

```typescript
import { CircuitBreaker } from './services/circuitBreaker';

async function testCircuitBreaker() {
  const breaker = new CircuitBreaker({
    failureThreshold: 3,
    timeout: 5000,
    name: 'test',
  });

  // Simulate failures
  for (let i = 0; i < 5; i++) {
    try {
      await breaker.execute(async () => {
        throw new Error('Simulated failure');
      });
    } catch (error) {
      console.log(`Attempt ${i + 1}:`, error.message);
    }
    
    console.log('Stats:', breaker.getStats());
  }
}
```

### Test Retry Logic

```typescript
import { retryWithBackoff } from './services/retryWithBackoff';

async function testRetry() {
  let attempts = 0;
  
  const result = await retryWithBackoff(async () => {
    attempts++;
    console.log(`Attempt ${attempts}`);
    
    if (attempts < 3) {
      throw new Error('Simulated failure');
    }
    
    return 'Success!';
  });
  
  console.log('Result:', result);
  console.log('Total attempts:', attempts);
}
```

## 📊 Monitoring Examples

### Log API Usage

```typescript
// Track API calls for analytics
const startTime = Date.now();

try {
  const result = await apiClient.pullFinaleInventory();
  
  const duration = Date.now() - startTime;
  console.log('API call succeeded in', duration, 'ms');
  
  // Log to your analytics service
  logAnalytics('api_call', {
    service: 'finale',
    action: 'pullInventory',
    duration,
    success: true,
  });
  
} catch (error) {
  const duration = Date.now() - startTime;
  
  logAnalytics('api_call', {
    service: 'finale',
    action: 'pullInventory',
    duration,
    success: false,
    error: error.message,
  });
}
```

### Monitor Rate Limits

```typescript
// Check rate limits before making calls
function canMakeRequest(): boolean {
  const status = perUserLimiter.getStatus('api');
  
  if (status.remaining === 0) {
    const waitTime = status.resetTime - Date.now();
    console.log(`Rate limit hit. Wait ${waitTime}ms`);
    return false;
  }
  
  if (status.remaining < 5) {
    console.warn(`Only ${status.remaining} requests remaining`);
  }
  
  return true;
}
```

### Monitor Circuit Breaker Health

```typescript
// Dashboard health check
function getServiceHealth() {
  const finaleHealth = finaleCircuitBreaker.getStats();
  const geminiHealth = geminiCircuitBreaker.getStats();
  
  return {
    finale: {
      status: finaleHealth.state,
      healthy: finaleHealth.state === 'CLOSED',
      failures: finaleHealth.failures,
    },
    gemini: {
      status: geminiHealth.state,
      healthy: geminiHealth.state === 'CLOSED',
      failures: geminiHealth.failures,
    },
  };
}
```

## 🔧 Troubleshooting Tips

### Rate Limit Issues

```typescript
// If experiencing rate limit issues, increase the window
const limiter = new RateLimiter({
  maxRequestsPerWindow: 100,  // Increase limit
  windowMs: 60000,
});
```

### Circuit Breaker Tripping

```typescript
// If circuit breaker trips too easily, adjust threshold
const breaker = new CircuitBreaker({
  failureThreshold: 10,    // Allow more failures
  timeout: 120000,         // Wait longer before retry
  name: 'my-service',
});
```

### Retry Exhaustion

```typescript
// If retries exhaust too quickly, increase attempts
await retryWithBackoff(() => apiCall(), {
  maxRetries: 10,          // More attempts
  initialDelayMs: 500,     // Start faster
  maxDelayMs: 60000,       // Allow longer waits
});
```

---

For more details, see:
- `API_INGESTION_SETUP.md` - Complete setup guide
- `services/*.ts` - Source code with inline documentation
- `.env.local.example` - Configuration options
