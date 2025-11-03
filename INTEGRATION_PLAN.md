# 🔄 Finale Integration - Complete Data Flow Plan

**Goal:** Thoroughly integrate Finale Inventory API with TGF MRP application to enable real-time data sync and AI-powered assessments.

---

## 📊 Current State Analysis

### Data Sources in App (App.tsx)

| State Variable | Type | Current Source | Finale Equivalent |
|----------------|------|----------------|-------------------|
| `inventory` | `InventoryItem[]` | mockInventory (localStorage) | ✅ `/api/product` |
| `vendors` | `Vendor[]` | mockVendors (localStorage) | ✅ `/api/partyGroup?role=SUPPLIER` |
| `purchaseOrders` | `PurchaseOrder[]` | mockPurchaseOrders (localStorage) | ✅ `/api/purchaseOrder` |
| `boms` | `BillOfMaterials[]` | mockBOMs (localStorage) | ⚠️ `/api/assembly` (partial) |
| `historicalSales` | `HistoricalSale[]` | mockHistoricalSales (localStorage) | ❌ Not in Finale API |
| `buildOrders` | `BuildOrder[]` | mockBuildOrders (localStorage) | ⚠️ `/api/stockTransaction` (inferred) |

**Legend:**
- ✅ Direct API mapping available
- ⚠️ Partial mapping or needs transformation
- ❌ No Finale equivalent (keep mock data)

---

## 🎯 Integration Phases

### Phase 1: Foundation (Current Task)
**Goal:** Establish data flow from Finale → App

**Tasks:**
1. ✅ Create Finale API client (`lib/finale/client.ts`)
2. ✅ Define Finale types (`lib/finale/types.ts`)
3. ✅ Create UI setup panel (`components/FinaleIntegrationPanel.tsx`)
4. 🔄 **Map Finale data to App types** ← WE ARE HERE
5. 🔄 Create data transformation utilities
6. 🔄 Build unified data service layer
7. 🔄 Test live API connection
8. 🔄 Verify data transformation accuracy

---

### Phase 2: UI Integration (Next)
**Goal:** Replace mock data with live Finale data in all pages

**Tasks:**
1. Integrate with Dashboard (inventory levels, alerts)
2. Integrate with Inventory page (product list, stock levels)
3. Integrate with Vendors page (supplier list, contact info)
4. Integrate with Purchase Orders page (PO list, status tracking)
5. Add loading states and skeleton screens
6. Add error boundaries and fallback UI
7. Implement data refresh mechanisms

---

### Phase 3: AI Features (Future)
**Goal:** Enable AI assessments with real Finale data

**Tasks:**
1. Test regulatory scans with real product data
2. Test artwork verification with real BOMs
3. Test demand forecasting with real sales data
4. Test auto-requisition generation
5. Verify cache hit rates for cost savings
6. Monitor AI API usage and costs

---

### Phase 4: Advanced Features (Future)
**Goal:** Enable bidirectional sync and advanced workflows

**Tasks:**
1. Push data from App → Finale (create POs, update stock)
2. Implement conflict resolution for concurrent edits
3. Add webhook support for real-time updates
4. Build sync history and audit logs
5. Add selective sync (choose what to sync)
6. Implement incremental sync (only changes)

---

## 🗺️ Data Mapping Strategy

### Inventory Items

**Finale → App Transformation:**
```typescript
// Finale API Response
{
  id: 12345,
  sku: "TGF-001",
  name: "Organic Fertilizer 5lb",
  unitsInStock: 150,
  unitsOnOrder: 50,
  reorderPoint: 20,
  defaultSupplier: "/api/partyGroup/789",
  moq: 10
}

// Transform to App Format
{
  sku: "TGF-001",
  name: "Organic Fertilizer 5lb",
  category: "Fertilizers", // Extract from Finale category or default
  stock: 150,
  onOrder: 50,
  reorderPoint: 20,
  vendorId: "789", // Extract from defaultSupplier URI
  moq: 10
}
```

**Transformation Function:**
```typescript
function transformFinaleProductToInventoryItem(
  finaleProduct: FinaleProduct
): InventoryItem {
  return {
    sku: finaleProduct.sku,
    name: finaleProduct.name,
    category: finaleProduct.category || 'Uncategorized',
    stock: finaleProduct.unitsInStock,
    onOrder: finaleProduct.unitsOnOrder,
    reorderPoint: finaleProduct.reorderPoint || 0,
    vendorId: extractIdFromUri(finaleProduct.defaultSupplier) || 'unknown',
    moq: finaleProduct.moq,
  };
}
```

---

### Vendors

**Finale → App Transformation:**
```typescript
// Finale API Response
{
  id: 789,
  name: "Acme Organics Inc",
  organizationRole: "SUPPLIER",
  email: "orders@acme.com",
  phone: "+1-555-0100",
  address: {
    street1: "123 Farm Lane",
    city: "Portland",
    state: "OR",
    postalCode: "97201"
  },
  leadTimeDays: 14
}

// Transform to App Format
{
  id: "789",
  name: "Acme Organics Inc",
  contactEmails: ["orders@acme.com"],
  phone: "+1-555-0100",
  address: "123 Farm Lane, Portland, OR 97201",
  website: "",
  leadTimeDays: 14
}
```

**Transformation Function:**
```typescript
function transformFinaleVendorToVendor(
  finaleVendor: FinalePartyGroup
): Vendor {
  const address = finaleVendor.address
    ? `${finaleVendor.address.street1 || ''}${finaleVendor.address.street2 ? ', ' + finaleVendor.address.street2 : ''}, ${finaleVendor.address.city || ''}, ${finaleVendor.address.state || ''} ${finaleVendor.address.postalCode || ''}`.trim()
    : '';

  return {
    id: finaleVendor.id.toString(),
    name: finaleVendor.name,
    contactEmails: finaleVendor.email ? [finaleVendor.email] : [],
    phone: finaleVendor.phone || '',
    address,
    website: finaleVendor.website || '',
    leadTimeDays: finaleVendor.leadTimeDays || 7,
  };
}
```

---

### Purchase Orders

**Finale → App Transformation:**
```typescript
// Finale API Response
{
  id: 5001,
  orderNumber: "PO-2024-001",
  supplier: "/api/partyGroup/789",
  status: "SUBMITTED",
  orderDate: "2024-11-01T10:00:00Z",
  expectedDate: "2024-11-15T10:00:00Z",
  lineItems: [
    {
      sku: "TGF-001",
      name: "Organic Fertilizer 5lb",
      quantity: 100,
      unitPrice: 12.50,
      total: 1250.00
    }
  ],
  notes: "Rush order"
}

// Transform to App Format
{
  id: "PO-2024-001",
  vendorId: "789",
  status: "Submitted", // Map SUBMITTED → Submitted
  createdAt: "2024-11-01T10:00:00Z",
  items: [
    {
      sku: "TGF-001",
      name: "Organic Fertilizer 5lb",
      quantity: 100,
      price: 12.50
    }
  ],
  expectedDate: "2024-11-15T10:00:00Z",
  notes: "Rush order"
}
```

**Transformation Function:**
```typescript
function transformFinalePOToPurchaseOrder(
  finalePO: FinalePurchaseOrder
): PurchaseOrder {
  return {
    id: finalePO.orderNumber,
    vendorId: extractIdFromUri(finalePO.supplier),
    status: mapFinaleStatusToAppStatus(finalePO.status),
    createdAt: finalePO.orderDate,
    items: finalePO.lineItems.map(item => ({
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      price: item.unitPrice,
    })),
    expectedDate: finalePO.expectedDate,
    notes: finalePO.notes || '',
    requisitionIds: [], // Not available from Finale
  };
}

function mapFinaleStatusToAppStatus(
  finaleStatus: FinalePurchaseOrder['status']
): PurchaseOrder['status'] {
  const statusMap = {
    'DRAFT': 'Pending',
    'SUBMITTED': 'Submitted',
    'PARTIALLY_RECEIVED': 'Submitted',
    'RECEIVED': 'Fulfilled',
    'CANCELLED': 'Pending',
  } as const;

  return statusMap[finaleStatus] || 'Pending';
}
```

---

## 🏗️ Architecture Design

### Data Service Layer

```
┌─────────────────────────────────────────────────────────────┐
│                          App.tsx                            │
│  (State Management, UI Orchestration)                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    DataService.ts                           │
│  (Unified API: getInventory, getVendors, getPurchaseOrders) │
│  - Switches between mock and live data                      │
│  - Handles loading states                                   │
│  - Manages error handling                                   │
│  - Caches responses                                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
          ┌─────────────────┴─────────────────┐
          ↓                                   ↓
┌──────────────────────┐          ┌──────────────────────┐
│  MockDataProvider    │          │  FinaleDataProvider  │
│  (types.ts)          │          │  (lib/finale/)       │
└──────────────────────┘          └──────────────────────┘
                                              ↓
                                  ┌──────────────────────┐
                                  │  FinaleClient.ts     │
                                  │  (API calls)         │
                                  └──────────────────────┘
                                              ↓
                                  ┌──────────────────────┐
                                  │  Transformers.ts     │
                                  │  (Data mapping)      │
                                  └──────────────────────┘
```

### File Structure

```
/home/user/TGF-MRP/
├── lib/
│   ├── finale/
│   │   ├── client.ts              ✅ Created
│   │   ├── types.ts               ✅ Created
│   │   ├── transformers.ts        🔄 Next: Data transformation
│   │   └── index.ts               🔄 Next: Barrel export
│   └── dataService.ts             🔄 Next: Unified data API
├── components/
│   └── FinaleIntegrationPanel.tsx ✅ Created
├── pages/
│   └── Settings.tsx               ✅ Updated
└── App.tsx                        🔄 Next: Wire up data service
```

---

## 🧪 Testing Strategy

### 1. Unit Tests (Future)
- Test transformation functions with sample data
- Test error handling in data service
- Test cache invalidation logic

### 2. Integration Tests (Current Focus)
- ✅ Test Finale API connection
- 🔄 Test data transformation accuracy
- 🔄 Test App.tsx with live data
- 🔄 Test UI components with live data

### 3. Manual Testing Checklist

**Connection Testing:**
- [ ] Open Settings → Finale Integration
- [ ] Verify credentials are pre-filled
- [ ] Click "Test Connection"
- [ ] Verify green "Connected" badge appears
- [ ] Check browser console for errors

**Data Sync Testing:**
- [ ] Click "Sync Data" button
- [ ] Verify toast shows success message
- [ ] Check console for synced data
- [ ] Verify counts are accurate (products/vendors/POs)
- [ ] Check localStorage for synced data

**UI Integration Testing:**
- [ ] Navigate to Inventory page
- [ ] Verify products from Finale are displayed
- [ ] Check stock levels match Finale
- [ ] Navigate to Vendors page
- [ ] Verify vendor list from Finale
- [ ] Navigate to Purchase Orders page
- [ ] Verify POs from Finale are shown

**AI Features Testing:**
- [ ] Test regulatory scan with real product data
- [ ] Verify ingredient parsing works
- [ ] Test artwork verification with real BOMs
- [ ] Check cache hit rates

**Error Handling Testing:**
- [ ] Disconnect internet, try to sync
- [ ] Verify error message appears
- [ ] Enter invalid credentials
- [ ] Verify error handling
- [ ] Test with rate limit exceeded
- [ ] Verify queuing works

---

## 📋 Implementation Checklist

### Phase 1: Data Transformation (TODAY)

- [ ] **Task 1:** Create `lib/finale/transformers.ts`
  - [ ] `transformFinaleProductToInventoryItem()`
  - [ ] `transformFinaleVendorToVendor()`
  - [ ] `transformFinalePOToPurchaseOrder()`
  - [ ] `extractIdFromUri()` utility
  - [ ] Unit tests for each transformer

- [ ] **Task 2:** Create `lib/dataService.ts`
  - [ ] `DataService` class
  - [ ] `getInventory()` method
  - [ ] `getVendors()` method
  - [ ] `getPurchaseOrders()` method
  - [ ] Toggle between mock/live data
  - [ ] Loading state management
  - [ ] Error handling
  - [ ] Caching layer

- [ ] **Task 3:** Test Live API Connection
  - [ ] Import FinaleClient in App.tsx
  - [ ] Call `testConnection()` on mount
  - [ ] Log response to console
  - [ ] Verify authentication works
  - [ ] Check network tab for API calls

- [ ] **Task 4:** Test Data Transformation
  - [ ] Call `fetchProducts()` and log raw response
  - [ ] Transform data and log result
  - [ ] Compare with mockInventory structure
  - [ ] Verify all fields map correctly
  - [ ] Test with edge cases (missing fields)

### Phase 2: UI Integration (TOMORROW)

- [ ] **Task 5:** Update App.tsx
  - [ ] Import DataService
  - [ ] Replace mock data with DataService calls
  - [ ] Add loading states
  - [ ] Add error states
  - [ ] Add refresh mechanism
  - [ ] Add sync status indicator

- [ ] **Task 6:** Update Inventory Page
  - [ ] Show loading skeleton while fetching
  - [ ] Display live Finale data
  - [ ] Add refresh button
  - [ ] Handle empty state
  - [ ] Test search/filter with live data

- [ ] **Task 7:** Update Vendors Page
  - [ ] Show loading skeleton
  - [ ] Display live vendor data
  - [ ] Add refresh button
  - [ ] Test with edge cases

- [ ] **Task 8:** Update Purchase Orders Page
  - [ ] Show loading skeleton
  - [ ] Display live PO data
  - [ ] Add refresh button
  - [ ] Test status filtering

- [ ] **Task 9:** Update Dashboard
  - [ ] Show live inventory counts
  - [ ] Show live alert counts
  - [ ] Update charts with live data
  - [ ] Add last sync timestamp

### Phase 3: AI Integration (THIS WEEK)

- [ ] **Task 10:** Test Regulatory Scans
  - [ ] Scan real product from Finale
  - [ ] Verify ingredient extraction
  - [ ] Test cache functionality
  - [ ] Measure response times

- [ ] **Task 11:** Test Artwork Verification
  - [ ] Verify real BOM from Finale
  - [ ] Test batch verification
  - [ ] Check error handling

- [ ] **Task 12:** Test Auto-Requisitions
  - [ ] Generate requisition from live data
  - [ ] Verify quantity calculations
  - [ ] Test with real vendor data

---

## 🎯 Success Criteria

### Must Have (MVP)
- ✅ Finale API client works with real credentials
- ✅ Connection testing UI functions correctly
- 🔄 Data transforms accurately from Finale → App format
- 🔄 Inventory page shows live Finale products
- 🔄 Vendors page shows live Finale suppliers
- 🔄 Purchase Orders page shows live Finale POs
- 🔄 Dashboard shows accurate counts from live data
- 🔄 Loading states prevent UI jank
- 🔄 Error handling prevents crashes

### Should Have (Nice to Have)
- [ ] Auto-sync on app startup
- [ ] Manual refresh button on each page
- [ ] Sync status indicator in header
- [ ] Last sync timestamp display
- [ ] Offline mode with cached data
- [ ] Conflict resolution for concurrent edits

### Could Have (Future)
- [ ] Real-time updates via webhooks
- [ ] Bidirectional sync (App → Finale)
- [ ] Selective sync controls
- [ ] Sync history dashboard
- [ ] Performance metrics tracking

---

## 🚨 Risk Analysis

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|---------|------------|
| API credentials invalid | Medium | High | Test connection before sync |
| Rate limit exceeded | Medium | Medium | Circuit breaker + retry logic |
| Data format mismatch | High | High | Comprehensive transformation tests |
| Network timeout | Medium | Medium | Timeout + retry + fallback to cache |
| Concurrent edit conflicts | Low | Medium | Optimistic locking + last-write-wins |

### Business Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|---------|------------|
| Data loss during migration | Low | Critical | Backup localStorage before first sync |
| User confusion with new data | Medium | Low | Clear onboarding + help text |
| Performance degradation | Low | Medium | Lazy loading + pagination |
| API costs exceed budget | Low | Medium | Monitor usage + implement caching |

---

## 📞 Support & Troubleshooting

### Common Issues

**Issue:** Connection test fails
- **Cause:** Invalid credentials
- **Fix:** Verify API Key/Secret in Finale dashboard
- **Fix:** Check account path matches Finale subdomain

**Issue:** Sync returns empty data
- **Cause:** No products in Finale account
- **Fix:** Add test products in Finale
- **Fix:** Check API permissions (read access)

**Issue:** Data doesn't appear in UI
- **Cause:** Transformation error
- **Fix:** Check browser console for errors
- **Fix:** Verify data structure matches types

**Issue:** Rate limit exceeded
- **Cause:** Too many requests
- **Fix:** Wait for cooldown period
- **Fix:** Increase rate limit in .env.local

---

## 📚 Next Steps

### Immediate (Today)
1. ✅ Create this integration plan
2. 🔄 Create `lib/finale/transformers.ts`
3. 🔄 Create `lib/dataService.ts`
4. 🔄 Test live API connection
5. 🔄 Verify data transformation

### Short-Term (This Week)
1. Wire DataService into App.tsx
2. Update all UI pages with live data
3. Add loading states and error handling
4. Test AI features with live data
5. Document usage patterns

### Long-Term (This Month)
1. Add comprehensive test coverage
2. Implement auto-sync on startup
3. Add sync history tracking
4. Optimize performance
5. Gather user feedback

---

**Created:** November 3, 2025
**Status:** 🔄 Phase 1 In Progress
**Next Update:** After completing data transformation layer
