# Finale API → Live Data Migration Plan

## 🎯 Goal
Replace mock data in App.tsx with real-time data from Finale Inventory API

---

## 📋 Current State

### ✅ What We Have
1. **Finale Integration Service** - `services/finaleIngestion.ts` (316 lines)
   - OAuth token management ✅
   - Rate limiting + circuit breaker ✅
   - Retry logic with exponential backoff ✅
   - Data transformation to TGF format ✅

2. **Supabase Backend** - Configured and ready
   - Database schema complete ✅
   - Tables: inventory_items, vendors, purchase_orders, etc. ✅
   - API audit logging ✅

3. **Missing Components**
   - ❌ `lib/supabase/client.ts` - Not created yet
   - ❌ `lib/cache.ts` - Not created yet
   - ❌ Finale credentials in `.env.local`
   - ❌ Connection between Finale → Supabase → App

### 🔑 Required Finale Credentials
Add these to `.env.local`:
```bash
# Finale Inventory API
VITE_FINALE_API_URL=https://app.finaleinventory.com/api/v1
VITE_FINALE_API_SUBDOMAIN=YOUR_SUBDOMAIN
VITE_FINALE_API_CLIENT_ID=YOUR_CLIENT_ID
VITE_FINALE_API_CLIENT_SECRET=YOUR_CLIENT_SECRET
VITE_FINALE_ACCOUNT_ID=YOUR_ACCOUNT_ID
VITE_FINALE_FACILITY_ID=YOUR_FACILITY_ID (optional)
```

---

## 🚀 Implementation Plan

### Phase 1: Foundation Setup (30 minutes)

#### Step 1.1: Add Finale Credentials to .env.local
**Action**: User provides credentials, we add to `.env.local`

**Required Info from User**:
- Finale subdomain
- API Client ID
- API Client Secret  
- Account ID
- Facility ID (if applicable)

#### Step 1.2: Create lib/supabase/client.ts
```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
```

#### Step 1.3: Create lib/cache.ts
```typescript
// Simple in-memory cache with TTL
export enum CacheTTL {
  SHORT = 60_000,      // 1 minute
  MEDIUM = 300_000,    // 5 minutes
  LONG = 3_600_000,    // 1 hour
}

export enum CacheKeys {
  INVENTORY_ALL = 'inventory:all',
  INVENTORY_SKU = 'inventory:sku:',
  INVENTORY_CATEGORY = 'inventory:category:',
  INVENTORY_LOW_STOCK = 'inventory:lowstock',
}

// Implementation...
```

---

### Phase 2: Finale → Supabase Sync (1-2 hours)

#### Step 2.1: Test Finale Connection
**File**: Create `scripts/test-finale-connection.ts`
```typescript
import { FinaleIngestionService } from '../services/finaleIngestion'

const service = new FinaleIngestionService({
  apiUrl: process.env.VITE_FINALE_API_URL!,
  subdomain: process.env.VITE_FINALE_API_SUBDOMAIN!,
  clientId: process.env.VITE_FINALE_API_CLIENT_ID!,
  clientSecret: process.env.VITE_FINALE_API_CLIENT_SECRET!,
})

// Test pulling products
const products = await service.pullInventory()
console.log('✅ Fetched', products.length, 'products from Finale')
```

**Run**: `npx tsx scripts/test-finale-connection.ts`

#### Step 2.2: Create Sync Script
**File**: Create `scripts/sync-finale-to-supabase.ts`

**Purpose**: One-time or scheduled sync of Finale → Supabase

**Flow**:
```
1. Fetch inventory from Finale API
   ↓
2. Transform to Supabase schema
   ↓
3. Bulk upsert to Supabase
   ↓
4. Log audit trail
```

**Functions**:
- `syncInventory()` - Pull inventory items
- `syncVendors()` - Pull vendors
- `syncPurchaseOrders()` - Pull POs
- `runFullSync()` - Sync everything

#### Step 2.3: Schedule Periodic Sync (Optional)
**Options**:
1. **Manual**: Run script on demand
2. **Cron**: Set up cron job (every hour/day)
3. **Vercel Cron**: Use Vercel Cron Jobs (if deployed)
4. **Real-time**: Use Finale webhooks (if available)

---

### Phase 3: App.tsx → Supabase Migration (2-3 hours)

#### Step 3.1: Create useSupabaseData Hook
**File**: `hooks/useSupabaseData.ts`

```typescript
export function useSupabaseInventory() {
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Initial fetch
    fetchInventory().then(setInventory)
    
    // Subscribe to real-time updates
    const subscription = subscribeToInventory((payload) => {
      // Update inventory state on changes
    })
    
    return () => subscription()
  }, [])

  return { inventory, loading, error }
}
```

#### Step 3.2: Replace Mock Data in App.tsx

**Before** (Mock Data):
```typescript
const [inventory, setInventory] = usePersistentState<InventoryItem[]>(
  'inventory', 
  mockInventory  // ❌ Mock data
);
```

**After** (Live Data):
```typescript
const { 
  inventory, 
  loading: inventoryLoading,
  error: inventoryError 
} = useSupabaseInventory();  // ✅ Live from Supabase
```

**Apply to All Data**:
- ✅ inventory → useSupabaseInventory()
- ✅ vendors → useSupabaseVendors()
- ✅ boms → useSupabaseBOMs()
- ✅ purchaseOrders → useSupabasePurchaseOrders()
- ✅ buildOrders → useSupabaseBuildOrders()
- ✅ requisitions → useSupabaseRequisitions()
- ✅ users → useSupabaseUsers()

#### Step 3.3: Add Loading States
```typescript
if (inventoryLoading || vendorsLoading || bomsLoading) {
  return <LoadingScreen message="Loading data..." />
}

if (inventoryError) {
  return <ErrorScreen error={inventoryError} retry={refetch} />
}
```

---

### Phase 4: Real-Time Updates (1 hour)

#### Step 4.1: Enable Supabase Subscriptions
**Purpose**: Auto-update UI when data changes in Supabase

```typescript
// In useSupabaseInventory hook
const subscription = supabase
  .channel('inventory-changes')
  .on('postgres_changes', 
    { 
      event: '*', 
      schema: 'public', 
      table: 'inventory_items' 
    },
    (payload) => {
      if (payload.eventType === 'INSERT') {
        setInventory(prev => [...prev, payload.new])
      }
      if (payload.eventType === 'UPDATE') {
        setInventory(prev => prev.map(item => 
          item.sku === payload.new.sku ? payload.new : item
        ))
      }
      if (payload.eventType === 'DELETE') {
        setInventory(prev => prev.filter(item => 
          item.sku !== payload.old.sku
        ))
      }
    }
  )
  .subscribe()
```

#### Step 4.2: Add Toast Notifications
```typescript
// Show toast when data updates
.on('postgres_changes', { ... }, (payload) => {
  addToast('Inventory updated', 'info')
  // Update state...
})
```

---

### Phase 5: CRUD Operations → Supabase (2 hours)

#### Step 5.1: Wire Create Operations
**Current**: Creates in localStorage
**New**: Creates in Supabase

**Example - Create PO**:
```typescript
// Old
const handleCreatePo = (poDetails) => {
  const newPO = { id: uuidv4(), ...poDetails }
  setPurchaseOrders([...purchaseOrders, newPO])  // ❌ localStorage
}

// New
const handleCreatePo = async (poDetails) => {
  const newPO = await createPurchaseOrder(poDetails)  // ✅ Supabase
  // Real-time subscription will update state automatically
  addToast('Purchase Order created', 'success')
}
```

#### Step 5.2: Wire Update Operations
- Update inventory stock → `updateInventoryStock()`
- Update PO status → `updatePurchaseOrderStatus()`
- Complete build order → `updateBuildOrderStatus()`
- Approve requisition → `updateRequisitionStatus()`

#### Step 5.3: Wire Delete Operations
- Delete BOM → `softDeleteBOM()`
- Delete vendor → `softDeleteVendor()`

---

### Phase 6: Settings UI for Finale Sync (1 hour)

#### Step 6.1: Add Sync Controls to Settings Page
**File**: `pages/Settings.tsx`

**Add Section**:
```tsx
<div className="bg-gray-800 rounded-lg p-6">
  <h2 className="text-xl font-bold mb-4">Finale Inventory Sync</h2>
  
  <div className="space-y-4">
    <div>
      <label>Last Sync: {lastSyncTime}</label>
    </div>
    
    <button 
      onClick={handleSyncNow}
      disabled={syncing}
      className="bg-blue-600 px-4 py-2 rounded"
    >
      {syncing ? 'Syncing...' : 'Sync Now'}
    </button>
    
    <div>
      <label>Auto-sync frequency:</label>
      <select value={syncFrequency} onChange={...}>
        <option value="manual">Manual only</option>
        <option value="hourly">Every hour</option>
        <option value="daily">Daily</option>
      </select>
    </div>
  </div>
</div>
```

#### Step 6.2: Create Sync Status Dashboard
- Show last sync time
- Show number of items synced
- Show sync errors if any
- Show next scheduled sync

---

## 📊 Data Flow Architecture

### Current (Mock Data)
```
mockInventory (types.ts)
    ↓
usePersistentState
    ↓
localStorage
    ↓
App.tsx state
    ↓
Pages (Inventory.tsx, etc.)
```

### New (Live Data)
```
Finale API
    ↓
finaleIngestion.ts (OAuth + Rate Limiting)
    ↓
Supabase PostgreSQL
    ↓
dataService.ts (with cache)
    ↓
useSupabaseData hooks
    ↓
App.tsx state (real-time subscriptions)
    ↓
Pages (Inventory.tsx, etc.)
```

---

## ✅ Testing Checklist

### Phase 1 Tests
- [ ] Supabase client connects successfully
- [ ] Cache implementation works
- [ ] No TypeScript errors

### Phase 2 Tests
- [ ] Finale OAuth token obtained successfully
- [ ] Can fetch inventory from Finale
- [ ] Can fetch vendors from Finale
- [ ] Can fetch POs from Finale
- [ ] Data transforms correctly to Supabase schema
- [ ] Bulk upsert to Supabase works
- [ ] Audit log records sync events

### Phase 3 Tests
- [ ] App loads data from Supabase (not mock)
- [ ] Loading states show correctly
- [ ] Error handling works
- [ ] All pages display live data

### Phase 4 Tests
- [ ] Real-time updates work (change in Supabase → UI updates)
- [ ] Multiple tabs stay in sync
- [ ] Toast notifications show on updates

### Phase 5 Tests
- [ ] Creating PO saves to Supabase
- [ ] Updating inventory saves to Supabase
- [ ] Deleting records soft-deletes in Supabase
- [ ] Multi-user edits don't conflict

### Phase 6 Tests
- [ ] Manual sync works from Settings page
- [ ] Sync status shows correctly
- [ ] Errors display properly

---

## 🚨 Rollback Plan

If issues arise, we can rollback in stages:

1. **Feature Flag**: Add `VITE_USE_LIVE_DATA=false` to `.env.local`
2. **Revert to Mock**: Change hooks back to `usePersistentState`
3. **Keep Supabase**: Data stays in Supabase for next attempt

---

## 📝 Estimated Timeline

| Phase | Task | Time |
|-------|------|------|
| 1 | Foundation Setup | 30 min |
| 2 | Finale → Supabase Sync | 1-2 hrs |
| 3 | App.tsx Migration | 2-3 hrs |
| 4 | Real-Time Updates | 1 hr |
| 5 | CRUD Operations | 2 hrs |
| 6 | Settings UI | 1 hr |
| **Total** | | **7-9.5 hours** |

---

## 🎯 Next Immediate Steps

1. **User provides Finale credentials** (you mentioned you have them)
2. **Add credentials to .env.local** (5 minutes)
3. **Create lib/supabase/client.ts** (10 minutes)
4. **Create lib/cache.ts** (15 minutes)
5. **Test Finale connection** (10 minutes)
6. **Run first sync script** (20 minutes)

**Total for immediate start**: ~1 hour

---

## 📞 Information Needed from You

Please provide:

1. **Finale Subdomain**: `___________.finaleinventory.com`
2. **API Client ID**: `___________`
3. **API Client Secret**: `___________`
4. **Account ID**: `___________`
5. **Facility ID** (if applicable): `___________`
6. **Finale API Documentation URL** (if you have custom endpoints)

Once I have these, I can:
- Add them to `.env.local`
- Test the connection
- Start pulling real data immediately

---

**Ready to start? Provide credentials and I'll begin with Phase 1!**
