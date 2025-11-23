# Shopify Sales Injection Integration

> **Executive Summary**: Shopify integration for TGF-MRP treats Shopify as the **source of truth for sales data** and performs inventory verification against internal systems. This is an **admin/ops/purchasing only** feature with autonomous setup workflow.

---

## 🎯 Integration Scope

### What Shopify Provides

**Sales Data (Source of Truth)**
- **Orders**: Complete sales order history with line items, customer info, payment status
- **Products**: Catalog data, SKUs, pricing, variants
- **Inventory Movements**: Sales transactions that affect stock levels
- **Customer Data**: Purchase history, shipping addresses, contact information

**Inventory Verification**
- Compare Shopify inventory levels with Supabase/Finale
- Identify discrepancies between systems
- Flag low stock alerts from Shopify storefront
- Sync inventory adjustments (manual approval required)

### Out of Scope

❌ **Simultaneous Monitoring**: Does not monitor both Shopify and Finale in real-time  
❌ **Automatic Inventory Sync**: Shopify inventory is verified, not automatically updated  
❌ **Bi-directional Sync**: Sales flow Shopify → MRP, inventory verification is one-way check  
❌ **Staff Access**: Integration is restricted to admin/ops/purchasing roles only

---

## 🔐 Permission Model

### Role-Based Access Control

```typescript
// Supabase RLS Policy for Shopify Integration
CREATE POLICY "shopify_admin_ops_purchasing_only" ON shopify_orders
  FOR ALL
  USING (
    auth.jwt() ->> 'role' IN ('admin', 'ops', 'purchasing')
  );

CREATE POLICY "shopify_manager_approval_required" ON shopify_sync_config
  FOR UPDATE
  USING (
    auth.jwt() ->> 'role' IN ('admin', 'ops', 'purchasing') AND
    (auth.jwt() ->> 'role' = 'admin' OR requires_manager_approval = false)
  );

CREATE POLICY "shopify_staff_no_access" ON shopify_orders
  FOR ALL
  USING (
    auth.jwt() ->> 'role' != 'staff'
  );
```

### Access Matrix

| Role | View Orders | Sync Config | Inventory Verification | Manual Sync Trigger |
|------|-------------|-------------|------------------------|---------------------|
| **Admin** | ✅ Full | ✅ Full | ✅ Full | ✅ Yes |
| **Ops** | ✅ Full | ✅ Full | ✅ Full | ✅ Yes |
| **Purchasing** | ✅ Full | ✅ Full | ✅ Full | ✅ Yes |
| **Manager** | 🔒 Approval Required | 🔒 Read-only | ❌ No | ❌ No |
| **Staff** | ❌ No Access | ❌ No Access | ❌ No Access | ❌ No |

---

## 🚀 Autonomous Setup Flow

### 5-Minute Setup Wizard

**User Experience**: Click "Add Shopify Integration" → Follow 3-step wizard → Start syncing

```typescript
// Autonomous Setup Orchestrator
export async function setupShopifyIntegration(
  setupConfig: ShopifySetupConfig
): Promise<SetupResult> {
  const steps = [
    { name: 'OAuth Authentication', fn: authenticateShopify },
    { name: 'Webhook Configuration', fn: configureWebhooks },
    { name: 'Initial Sync', fn: performInitialSync }
  ];

  for (const step of steps) {
    const result = await step.fn(setupConfig);
    if (!result.success) {
      return { success: false, failedAt: step.name, error: result.error };
    }
  }

  return { success: true, message: 'Shopify integration active' };
}
```

### Step 1: OAuth2 Authentication

**Automatic Configuration**
```typescript
// services/shopifyAuthService.ts
import { ShopifyOAuth } from '@shopify/shopify-api';

export async function initializeShopifyOAuth(): Promise<string> {
  const authUrl = await ShopifyOAuth.beginAuth({
    shop: process.env.SHOPIFY_SHOP_DOMAIN,
    callbackPath: '/api/shopify/callback',
    scopes: [
      'read_orders',           // Sales data
      'read_products',         // Product catalog
      'read_inventory',        // Inventory verification
      'read_customers',        // Customer data
      'read_fulfillments'      // Shipping status
    ],
    isOnline: false  // Offline token for background sync
  });

  return authUrl; // Redirect user to Shopify OAuth consent screen
}

export async function handleOAuthCallback(
  code: string,
  shop: string
): Promise<{ success: boolean; accessToken?: string }> {
  try {
    const { session } = await ShopifyOAuth.validateAuthCallback({
      code,
      shop
    });

    // Persist access token in Supabase (encrypted)
    await supabase.from('shopify_credentials').upsert({
      shop_domain: shop,
      access_token: encrypt(session.accessToken),
      scope: session.scope,
      expires_at: session.expires,
      created_at: new Date().toISOString()
    });

    return { success: true, accessToken: session.accessToken };
  } catch (error) {
    console.error('Shopify OAuth failed:', error);
    return { success: false, error: error.message };
  }
}
```

**Wizard UI Flow**
```tsx
// components/ShopifySetupWizard.tsx
export function ShopifySetupWizard() {
  const [step, setStep] = useState(1);
  
  const handleOAuthStart = async () => {
    const authUrl = await initializeShopifyOAuth();
    window.location.href = authUrl; // Redirect to Shopify
  };

  return (
    <div className="setup-wizard">
      {step === 1 && (
        <div>
          <h2>Step 1: Connect Your Shopify Store</h2>
          <input 
            placeholder="your-store.myshopify.com" 
            value={shopDomain}
            onChange={(e) => setShopDomain(e.target.value)}
          />
          <button onClick={handleOAuthStart}>
            Connect to Shopify
          </button>
        </div>
      )}
      
      {step === 2 && (
        <div>
          <h2>Step 2: Configure Webhooks</h2>
          <p>✅ Webhooks configured automatically</p>
          <LoadingSpinner /> {/* Auto-configuring */}
        </div>
      )}
      
      {step === 3 && (
        <div>
          <h2>Step 3: Initial Data Sync</h2>
          <p>Importing last 90 days of sales data...</p>
          <ProgressBar value={syncProgress} />
        </div>
      )}
    </div>
  );
}
```

### Step 2: Automatic Webhook Registration

**Webhook Configuration Service**
```typescript
// services/shopifyWebhookService.ts
import { ShopifyWebhooks } from '@shopify/shopify-api';

export async function registerWebhooks(
  shop: string,
  accessToken: string
): Promise<void> {
  const webhooks = [
    {
      topic: 'orders/create',
      address: `${process.env.SUPABASE_URL}/functions/v1/shopify-webhook`,
      format: 'json'
    },
    {
      topic: 'orders/updated',
      address: `${process.env.SUPABASE_URL}/functions/v1/shopify-webhook`,
      format: 'json'
    },
    {
      topic: 'inventory_levels/update',
      address: `${process.env.SUPABASE_URL}/functions/v1/shopify-inventory-webhook`,
      format: 'json'
    }
  ];

  for (const webhook of webhooks) {
    await ShopifyWebhooks.register({
      shop,
      accessToken,
      topic: webhook.topic,
      webhookHandler: webhook.address
    });
  }

  console.log('✅ All webhooks registered');
}
```

**Edge Function Webhook Handler**
```typescript
// supabase/functions/shopify-webhook/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';

serve(async (req) => {
  // Verify webhook authenticity
  const hmac = req.headers.get('X-Shopify-Hmac-SHA256');
  const isValid = await verifyWebhookSignature(hmac, await req.text());
  
  if (!isValid) {
    return new Response('Unauthorized', { status: 401 });
  }

  const topic = req.headers.get('X-Shopify-Topic');
  const shop = req.headers.get('X-Shopify-Shop-Domain');
  const body = await req.json();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  switch (topic) {
    case 'orders/create':
    case 'orders/updated':
      await handleOrderWebhook(supabase, body);
      break;
      
    case 'inventory_levels/update':
      await handleInventoryWebhook(supabase, body);
      break;
  }

  return new Response('OK', { status: 200 });
});

async function handleOrderWebhook(supabase, orderData) {
  // Transform Shopify order to internal schema
  const transformedOrder = {
    shopify_order_id: orderData.id,
    order_number: orderData.order_number,
    customer_email: orderData.customer?.email,
    total_price: parseFloat(orderData.total_price),
    currency: orderData.currency,
    financial_status: orderData.financial_status,
    fulfillment_status: orderData.fulfillment_status,
    line_items: orderData.line_items.map(item => ({
      sku: item.sku,
      quantity: item.quantity,
      price: parseFloat(item.price),
      product_id: item.product_id
    })),
    created_at: orderData.created_at,
    raw_data: orderData
  };

  // Insert into Supabase (source of truth for sales)
  await supabase.from('shopify_orders').upsert(transformedOrder);
  
  // Trigger inventory verification
  await triggerInventoryVerification(transformedOrder.line_items);
}
```

### Step 3: Initial Data Sync

**Historical Sales Import**
```typescript
// services/shopifyInitialSyncService.ts
export async function performInitialSync(): Promise<SyncResult> {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 90); // Last 90 days

  let page = 1;
  let hasMore = true;
  let totalOrders = 0;

  while (hasMore) {
    const response = await shopifyClient.order.list({
      created_at_min: sinceDate.toISOString(),
      limit: 250,
      page
    });

    if (response.orders.length === 0) {
      hasMore = false;
      break;
    }

    // Batch insert to Supabase
    const transformedOrders = response.orders.map(transformShopifyOrder);
    await supabase.from('shopify_orders').insert(transformedOrders);

    totalOrders += response.orders.length;
    page++;

    // Update progress in UI
    await updateSyncProgress({
      imported: totalOrders,
      status: 'syncing'
    });
  }

  return { success: true, ordersImported: totalOrders };
}
```

---

## 📊 Sales Order Sync Service

### Real-Time Sales Data Flow

```
Shopify Order → Webhook → Edge Function → Transform → Supabase → UI Update
                    ↓
            Verify Signature
                    ↓
            Check Permissions (admin/ops/purchasing)
                    ↓
            Update Inventory Verification Queue
```

### Sales Order Transformation

**Shopify Schema → Internal Schema**
```typescript
// lib/schema/shopifySchemas.ts
import { z } from 'zod';

export const ShopifyOrderSchema = z.object({
  id: z.number(),
  order_number: z.string(),
  email: z.string().email().optional(),
  financial_status: z.enum([
    'pending', 'authorized', 'paid', 'partially_paid', 
    'refunded', 'voided', 'partially_refunded'
  ]),
  fulfillment_status: z.enum([
    'fulfilled', 'partial', 'unfulfilled'
  ]).nullable(),
  line_items: z.array(z.object({
    id: z.number(),
    product_id: z.number(),
    variant_id: z.number(),
    sku: z.string(),
    title: z.string(),
    quantity: z.number(),
    price: z.string(),
    total_discount: z.string()
  })),
  total_price: z.string(),
  subtotal_price: z.string(),
  total_tax: z.string(),
  currency: z.string(),
  created_at: z.string(),
  updated_at: z.string()
});

export const InternalSalesOrderSchema = z.object({
  shopify_order_id: z.string(),
  order_number: z.string(),
  customer_email: z.string().optional(),
  total_amount: z.number(),
  tax_amount: z.number(),
  currency: z.string(),
  status: z.enum(['pending', 'paid', 'fulfilled', 'cancelled']),
  line_items: z.array(z.object({
    sku: z.string(),
    quantity: z.number(),
    unit_price: z.number(),
    subtotal: z.number()
  })),
  order_date: z.string(),
  sync_source: z.literal('shopify')
});

export function transformShopifyOrder(
  shopifyOrder: z.infer<typeof ShopifyOrderSchema>
): z.infer<typeof InternalSalesOrderSchema> {
  return {
    shopify_order_id: shopifyOrder.id.toString(),
    order_number: shopifyOrder.order_number,
    customer_email: shopifyOrder.email,
    total_amount: parseFloat(shopifyOrder.total_price),
    tax_amount: parseFloat(shopifyOrder.total_tax),
    currency: shopifyOrder.currency,
    status: mapShopifyStatus(shopifyOrder),
    line_items: shopifyOrder.line_items.map(item => ({
      sku: item.sku,
      quantity: item.quantity,
      unit_price: parseFloat(item.price),
      subtotal: parseFloat(item.price) * item.quantity
    })),
    order_date: shopifyOrder.created_at,
    sync_source: 'shopify'
  };
}
```

### Scheduled Sync (Backup to Webhooks)

**Nightly Reconciliation**
```typescript
// supabase/functions/shopify-nightly-sync/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Get last sync timestamp
  const { data: lastSync } = await supabase
    .from('shopify_sync_log')
    .select('last_sync_at')
    .order('last_sync_at', { ascending: false })
    .limit(1)
    .single();

  const sinceDate = lastSync?.last_sync_at || new Date(Date.now() - 86400000); // Last 24 hours

  // Fetch updated orders from Shopify
  const orders = await fetchShopifyOrders({ updated_at_min: sinceDate });

  // Reconcile with Supabase (detect missed webhooks)
  const { inserted, updated, skipped } = await reconcileOrders(supabase, orders);

  // Log sync results
  await supabase.from('shopify_sync_log').insert({
    sync_type: 'nightly',
    orders_inserted: inserted,
    orders_updated: updated,
    orders_skipped: skipped,
    last_sync_at: new Date().toISOString()
  });

  return new Response(JSON.stringify({ success: true, inserted, updated }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
```

---

## 📦 Inventory Verification

### Comparison Logic

**Shopify Inventory ↔ Supabase/Finale**
```typescript
// services/shopifyInventoryVerificationService.ts
export async function verifyInventoryDiscrepancies(): Promise<InventoryReport> {
  // Fetch Shopify inventory levels
  const shopifyInventory = await fetchShopifyInventoryLevels();

  // Fetch internal inventory (Supabase or Finale)
  const internalInventory = await getInventoryData('supabase');

  const discrepancies: InventoryDiscrepancy[] = [];

  for (const item of shopifyInventory) {
    const internal = internalInventory.find(i => i.sku === item.sku);

    if (!internal) {
      discrepancies.push({
        sku: item.sku,
        issue: 'missing_in_internal',
        shopify_qty: item.quantity,
        internal_qty: 0
      });
      continue;
    }

    const diff = Math.abs(item.quantity - internal.quantity);
    if (diff > 0) {
      discrepancies.push({
        sku: item.sku,
        issue: 'quantity_mismatch',
        shopify_qty: item.quantity,
        internal_qty: internal.quantity,
        difference: diff
      });
    }
  }

  return {
    total_items_checked: shopifyInventory.length,
    discrepancies_found: discrepancies.length,
    discrepancies,
    verified_at: new Date().toISOString()
  };
}
```

### Automated Alerts

**Low Stock Detection**
```typescript
export async function checkLowStockAlerts(): Promise<void> {
  const lowStockItems = await shopifyClient.inventory.list({
    inventory_quantity_lte: 10 // Threshold
  });

  for (const item of lowStockItems) {
    // Check if already on reorder
    const existingPO = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('sku', item.sku)
      .eq('status', 'pending')
      .single();

    if (!existingPO) {
      // Create reorder recommendation
      await supabase.from('reorder_recommendations').insert({
        sku: item.sku,
        current_stock: item.quantity,
        recommended_qty: calculateReorderQty(item),
        source: 'shopify_low_stock',
        requires_approval: true // Admin/purchasing approval
      });

      // Send notification to purchasing team
      await sendNotification({
        to: 'purchasing',
        subject: `Low Stock Alert: ${item.sku}`,
        message: `Shopify reports ${item.quantity} units remaining`
      });
    }
  }
}
```

**Manual Approval Workflow**
```tsx
// components/InventoryDiscrepancyReview.tsx
export function InventoryDiscrepancyReview() {
  const [discrepancies, setDiscrepancies] = useState([]);
  const { user } = useAuth();

  // Only admin/ops/purchasing can view
  if (!['admin', 'ops', 'purchasing'].includes(user.role)) {
    return <AccessDenied />;
  }

  const handleApproveSync = async (sku: string, source: 'shopify' | 'internal') => {
    // Requires manager approval for large discrepancies
    const discrepancy = discrepancies.find(d => d.sku === sku);
    if (discrepancy.difference > 100 && user.role !== 'admin') {
      await requestManagerApproval({ sku, source });
      return;
    }

    // Sync inventory from chosen source
    if (source === 'shopify') {
      await syncInventoryFromShopify(sku);
    } else {
      await updateShopifyInventory(sku);
    }
  };

  return (
    <div>
      <h2>Inventory Discrepancies ({discrepancies.length})</h2>
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Shopify Qty</th>
            <th>Internal Qty</th>
            <th>Difference</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {discrepancies.map(d => (
            <tr key={d.sku}>
              <td>{d.sku}</td>
              <td>{d.shopify_qty}</td>
              <td>{d.internal_qty}</td>
              <td className={d.difference > 50 ? 'text-red-600' : ''}>
                {d.difference}
              </td>
              <td>
                <button onClick={() => handleApproveSync(d.sku, 'shopify')}>
                  Trust Shopify
                </button>
                <button onClick={() => handleApproveSync(d.sku, 'internal')}>
                  Trust Internal
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## 🗄️ Database Schema

### Supabase Tables

```sql
-- Shopify OAuth credentials (encrypted)
CREATE TABLE shopify_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_domain TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL, -- Encrypted
  scope TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sales orders (source of truth)
CREATE TABLE shopify_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shopify_order_id TEXT UNIQUE NOT NULL,
  order_number TEXT NOT NULL,
  customer_email TEXT,
  total_amount NUMERIC(10, 2) NOT NULL,
  tax_amount NUMERIC(10, 2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  status TEXT CHECK (status IN ('pending', 'paid', 'fulfilled', 'cancelled')),
  line_items JSONB NOT NULL,
  order_date TIMESTAMPTZ NOT NULL,
  sync_source TEXT DEFAULT 'shopify',
  raw_data JSONB, -- Full Shopify response
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory verification logs
CREATE TABLE shopify_inventory_verification (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT NOT NULL,
  shopify_qty INTEGER NOT NULL,
  internal_qty INTEGER NOT NULL,
  difference INTEGER NOT NULL,
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sync logs
CREATE TABLE shopify_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sync_type TEXT CHECK (sync_type IN ('webhook', 'nightly', 'manual')),
  orders_inserted INTEGER DEFAULT 0,
  orders_updated INTEGER DEFAULT 0,
  orders_skipped INTEGER DEFAULT 0,
  errors JSONB,
  last_sync_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies (admin/ops/purchasing only)
ALTER TABLE shopify_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shopify_orders_admin_ops_purchasing" ON shopify_orders
  FOR ALL
  USING (
    auth.jwt() ->> 'role' IN ('admin', 'ops', 'purchasing')
  );

CREATE POLICY "shopify_credentials_admin_only" ON shopify_credentials
  FOR ALL
  USING (
    auth.jwt() ->> 'role' = 'admin'
  );
```

---

## 🔧 Service Implementation

### Shopify Client Wrapper

```typescript
// services/shopifyClient.ts
import Shopify from '@shopify/shopify-api';
import { RateLimiter } from './rateLimiter';
import { CircuitBreaker } from './circuitBreaker';
import { retryWithBackoff } from './retryWithBackoff';

export class ShopifyClient {
  private client: Shopify;
  private rateLimiter: RateLimiter;
  private circuitBreaker: CircuitBreaker;

  constructor(shop: string, accessToken: string) {
    this.client = new Shopify.Clients.Rest(shop, accessToken);
    this.rateLimiter = new RateLimiter({ requestsPerSecond: 2 }); // Shopify limit
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000
    });
  }

  async fetchOrders(params: OrderFetchParams): Promise<ShopifyOrder[]> {
    return this.circuitBreaker.execute(async () => {
      await this.rateLimiter.acquire();

      return retryWithBackoff(async () => {
        const response = await this.client.get({
          path: 'orders',
          query: params
        });

        return response.body.orders;
      }, 3);
    });
  }

  async updateInventory(
    inventoryItemId: number,
    quantity: number
  ): Promise<void> {
    await this.circuitBreaker.execute(async () => {
      await this.rateLimiter.acquire();

      return retryWithBackoff(async () => {
        await this.client.post({
          path: 'inventory_levels/set',
          data: {
            inventory_item_id: inventoryItemId,
            location_id: process.env.SHOPIFY_LOCATION_ID,
            available: quantity
          }
        });
      }, 3);
    });
  }
}
```

---

## 🎨 User Interface Components

### Integration Dashboard

```tsx
// components/ShopifyIntegrationPanel.tsx
export function ShopifyIntegrationPanel() {
  const [isConnected, setIsConnected] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const { user } = useAuth();

  // Permission check
  if (!['admin', 'ops', 'purchasing'].includes(user.role)) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded">
        <p className="text-red-700">
          ⚠️ Shopify integration requires admin, ops, or purchasing role.
        </p>
      </div>
    );
  }

  const handleConnect = async () => {
    const authUrl = await initializeShopifyOAuth();
    window.location.href = authUrl;
  };

  const handleManualSync = async () => {
    setSyncStatus('syncing');
    const result = await performManualSync();
    setSyncStatus(result.success ? 'completed' : 'error');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Shopify Integration</h2>
        {isConnected ? (
          <span className="text-green-600">✅ Connected</span>
        ) : (
          <button onClick={handleConnect} className="btn-primary">
            Connect Shopify
          </button>
        )}
      </div>

      {isConnected && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatCard
              label="Orders Synced"
              value={stats.ordersSynced}
              trend="+12% this week"
            />
            <StatCard
              label="Inventory Discrepancies"
              value={stats.discrepancies}
              alert={stats.discrepancies > 0}
            />
            <StatCard
              label="Last Sync"
              value={formatRelativeTime(stats.lastSync)}
            />
          </div>

          <div className="flex gap-4">
            <button onClick={handleManualSync} disabled={syncStatus === 'syncing'}>
              {syncStatus === 'syncing' ? 'Syncing...' : 'Manual Sync'}
            </button>
            <button onClick={() => navigate('/inventory-verification')}>
              Review Discrepancies
            </button>
          </div>

          <WebhookStatusPanel webhooks={webhookStatus} />
        </>
      )}
    </div>
  );
}
```

---

## 🧪 Testing Strategy

### Integration Tests

```typescript
// tests/shopifyIntegration.test.ts
import { describe, test, expect, beforeEach } from 'vitest';
import { transformShopifyOrder } from '../lib/schema/shopifySchemas';
import { mockShopifyOrder } from './fixtures/shopifyMocks';

describe('Shopify Integration', () => {
  test('transforms Shopify order to internal schema', () => {
    const result = transformShopifyOrder(mockShopifyOrder);

    expect(result.shopify_order_id).toBe(mockShopifyOrder.id.toString());
    expect(result.total_amount).toBe(parseFloat(mockShopifyOrder.total_price));
    expect(result.line_items).toHaveLength(mockShopifyOrder.line_items.length);
    expect(result.sync_source).toBe('shopify');
  });

  test('handles missing customer email gracefully', () => {
    const orderWithoutEmail = { ...mockShopifyOrder, email: null };
    const result = transformShopifyOrder(orderWithoutEmail);

    expect(result.customer_email).toBeUndefined();
  });

  test('calculates line item subtotals correctly', () => {
    const result = transformShopifyOrder(mockShopifyOrder);
    const firstItem = result.line_items[0];

    expect(firstItem.subtotal).toBe(firstItem.unit_price * firstItem.quantity);
  });
});
```

### E2E Tests

```typescript
// e2e/shopify-integration.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Shopify Integration (Admin)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?e2e=1&role=admin');
  });

  test('shows connect button when not authenticated', async ({ page }) => {
    await page.goto('/settings/integrations?e2e=1');
    
    const connectBtn = page.locator('button:has-text("Connect Shopify")');
    await expect(connectBtn).toBeVisible();
  });

  test('displays sync statistics after connection', async ({ page }) => {
    // Mock connected state
    await page.evaluate(() => {
      localStorage.setItem('shopify_connected', 'true');
    });

    await page.goto('/settings/integrations?e2e=1');

    await expect(page.locator('text=Orders Synced')).toBeVisible();
    await expect(page.locator('text=Inventory Discrepancies')).toBeVisible();
  });

  test('triggers manual sync', async ({ page }) => {
    await page.goto('/settings/integrations?e2e=1');
    
    await page.click('button:has-text("Manual Sync")');
    await expect(page.locator('text=Syncing...')).toBeVisible();
  });
});

test.describe('Shopify Integration (Staff - Access Denied)', () => {
  test('blocks staff access', async ({ page }) => {
    await page.goto('/?e2e=1&role=staff');
    await page.goto('/settings/integrations?e2e=1');

    await expect(page.locator('text=requires admin, ops, or purchasing role')).toBeVisible();
  });
});
```

---

## 📈 Analytics & Monitoring

### Sales Analytics Dashboard

```typescript
// services/shopifySalesAnalyticsService.ts
export async function generateSalesReport(
  dateRange: { start: Date; end: Date }
): Promise<SalesReport> {
  const { data: orders } = await supabase
    .from('shopify_orders')
    .select('*')
    .gte('order_date', dateRange.start.toISOString())
    .lte('order_date', dateRange.end.toISOString())
    .eq('status', 'paid');

  const totalRevenue = orders.reduce((sum, o) => sum + o.total_amount, 0);
  const totalTax = orders.reduce((sum, o) => sum + o.tax_amount, 0);
  const averageOrderValue = totalRevenue / orders.length;

  // Top selling SKUs
  const skuCounts = new Map<string, number>();
  orders.forEach(order => {
    order.line_items.forEach(item => {
      skuCounts.set(item.sku, (skuCounts.get(item.sku) || 0) + item.quantity);
    });
  });

  const topSellers = Array.from(skuCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return {
    totalOrders: orders.length,
    totalRevenue,
    totalTax,
    averageOrderValue,
    topSellers,
    dateRange
  };
}
```

### Sync Health Monitoring

```typescript
// services/shopifySyncHealthService.ts
export async function checkSyncHealth(): Promise<HealthReport> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600000);

  // Check for recent syncs
  const { data: recentSyncs } = await supabase
    .from('shopify_sync_log')
    .select('*')
    .gte('last_sync_at', oneHourAgo.toISOString());

  // Check webhook delivery
  const { data: webhookErrors } = await supabase
    .from('shopify_sync_log')
    .select('*')
    .not('errors', 'is', null)
    .gte('last_sync_at', oneHourAgo.toISOString());

  const isHealthy = recentSyncs.length > 0 && webhookErrors.length === 0;

  return {
    status: isHealthy ? 'healthy' : 'degraded',
    lastSyncAge: recentSyncs[0]?.last_sync_at,
    webhookErrors: webhookErrors.length,
    recommendations: !isHealthy
      ? ['Check Shopify webhook configuration', 'Verify API credentials']
      : []
  };
}
```

---

## 🚨 Troubleshooting

### Common Issues & Solutions

#### Issue: OAuth Callback Fails

**Symptoms**: Redirect to `/api/shopify/callback` returns 500 error

**Diagnosis**:
```bash
# Check Supabase Edge Function logs
supabase functions logs shopify-webhook --tail

# Verify environment variables
supabase secrets list
```

**Fix**:
1. Ensure `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` are set in Supabase secrets
2. Verify callback URL matches Shopify app settings exactly
3. Check for CORS issues in Edge Function response headers

#### Issue: Webhooks Not Received

**Symptoms**: Orders created in Shopify don't appear in MRP

**Diagnosis**:
```typescript
// Check webhook registration status
const webhooks = await shopifyClient.webhook.list();
console.log('Registered webhooks:', webhooks);
```

**Fix**:
1. Re-register webhooks via `registerWebhooks()` function
2. Verify Supabase Edge Function is deployed and accessible
3. Check Shopify webhook delivery attempts in Shopify admin

#### Issue: Inventory Discrepancies Growing

**Symptoms**: Verification report shows increasing mismatches

**Root Cause**: Missed webhook deliveries or sync failures

**Fix**:
```typescript
// Run reconciliation sync
await performInitialSync(); // Re-import all orders

// Force inventory sync from Shopify
await syncAllInventoryFromShopify();
```

#### Issue: Permission Denied Errors

**Symptoms**: Users see "Access Denied" when viewing orders

**Diagnosis**:
```sql
-- Check user role
SELECT auth.jwt() ->> 'role' AS user_role;

-- Verify RLS policies
SELECT * FROM pg_policies WHERE tablename = 'shopify_orders';
```

**Fix**:
1. Ensure user role is set correctly in `auth.users` metadata
2. Verify RLS policy includes user's role in `USING` clause
3. Check if user has been explicitly granted permission

---

## 💰 Cost Analysis

### Shopify API Pricing

- **Basic Shopify**: 2 requests/second rate limit
- **Shopify Plus**: 4 requests/second rate limit
- **Webhook Delivery**: Free, unlimited

### Estimated Integration Costs

| Component | Monthly Cost | Notes |
|-----------|--------------|-------|
| Shopify API Calls | $0 | Webhooks are primary sync method |
| Supabase Database | ~$5-10 | 100K orders/month storage |
| Supabase Edge Functions | ~$2-5 | 50K webhook invocations/month |
| Nightly Sync Job | ~$1 | 1 scheduled function run/day |
| **Total** | **~$8-16/month** | Scales with order volume |

### ROI Calculation

**Time Savings**:
- Manual order entry: ~5 minutes/order
- Average orders/month: 200
- Time saved: 200 × 5 = 1000 minutes/month (16.7 hours)
- Hourly rate (purchasing): $25/hour
- **Monthly savings: $417**

**ROI**: ($417 - $16) / $16 = **2,506% monthly ROI**

---

## 🎯 Next Steps

### Phase 1: Core Setup (Week 1)
- [x] OAuth2 authentication flow
- [x] Webhook registration service
- [x] Initial data sync (90 days)
- [x] Database schema creation
- [x] RLS policies (admin/ops/purchasing)

### Phase 2: Sales Integration (Week 2)
- [ ] Real-time webhook handlers
- [ ] Order transformation pipeline
- [ ] Sales analytics dashboard
- [ ] Nightly reconciliation sync

### Phase 3: Inventory Verification (Week 3)
- [ ] Inventory comparison service
- [ ] Discrepancy detection & alerts
- [ ] Manual approval workflow
- [ ] Low stock notifications

### Phase 4: Advanced Features (Week 4)
- [ ] Multi-location inventory support
- [ ] Product catalog sync
- [ ] Customer data integration
- [ ] Advanced analytics & forecasting

---

## 📚 References

### External Documentation
- [Shopify Admin API Reference](https://shopify.dev/api/admin-rest)
- [Shopify OAuth Guide](https://shopify.dev/apps/auth/oauth)
- [Shopify Webhooks](https://shopify.dev/api/admin-rest/webhooks)

### Internal Documentation
- [`FINALE_DATA_SYNC_RESEARCH.md`](./FINALE_DATA_SYNC_RESEARCH.md) - Integration pattern reference
- [`GOOGLE_SHEETS_INTEGRATION.md`](./GOOGLE_SHEETS_INTEGRATION.md) - OAuth flow reference
- [`SCHEMA_ARCHITECTURE.md`](./SCHEMA_ARCHITECTURE.md) - Data transformation patterns
- [`.github/copilot-instructions.md`](../.github/copilot-instructions.md) - Autonomous deployment workflows

### Service Layer Files
- `services/shopifyAuthService.ts` - OAuth2 implementation
- `services/shopifyWebhookService.ts` - Webhook management
- `services/shopifyInitialSyncService.ts` - Historical data import
- `services/shopifyInventoryVerificationService.ts` - Inventory reconciliation
- `lib/schema/shopifySchemas.ts` - Zod validation schemas

---

## ✅ Deployment Checklist

Before going live with Shopify integration:

**Environment Configuration**
- [ ] `SHOPIFY_SHOP_DOMAIN` set in environment variables
- [ ] `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` configured
- [ ] `SHOPIFY_ACCESS_TOKEN` stored securely (encrypted)
- [ ] Supabase Edge Functions deployed (`shopify-webhook`, `shopify-nightly-sync`)

**Database Setup**
- [ ] Run Supabase migrations for Shopify tables
- [ ] RLS policies enabled and tested
- [ ] Admin/ops/purchasing users have correct role metadata

**Shopify App Configuration**
- [ ] App created in Shopify Partners dashboard
- [ ] OAuth redirect URL matches Supabase callback
- [ ] Required scopes granted (orders, products, inventory, customers)
- [ ] Webhooks registered and verified

**Testing**
- [ ] Unit tests passing for schema transformations
- [ ] E2E tests passing for permission checks
- [ ] Manual test: Create order in Shopify → Verify in MRP
- [ ] Manual test: Inventory discrepancy detection works

**Monitoring**
- [ ] Sync health dashboard accessible
- [ ] Webhook delivery logs monitored
- [ ] Error alerts configured (Slack/email)

**Documentation**
- [ ] User setup guide shared with admin/ops/purchasing team
- [ ] Troubleshooting runbook available
- [ ] Cost tracking dashboard configured

---

**Status**: ✅ Ready for Implementation  
**Estimated Setup Time**: 5 minutes (autonomous wizard)  
**Estimated Development Time**: 4 weeks (phased rollout)  
**Permissions**: Admin, Ops, Purchasing only (enforced via RLS)  
**Source of Truth**: Shopify for sales data, internal systems for inventory verification
