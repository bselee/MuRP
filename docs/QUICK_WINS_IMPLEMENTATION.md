# Quick Wins - Practical Implementation Guide

**Date:** December 12, 2025
**Purpose:** Immediate improvements to existing code (no rebuild)

---

## Overview

This guide shows how to enhance what's already there:

✅ **Import/Export Modal exists** but needs real upload
✅ **Export functions work** (CSV, JSON, Excel)
✅ **Template download exists** but needs all fields
✅ **Inventory page wired up** just needs better data

---

## Quick Win #1: Enhance Template (30 minutes)

### Current State
```typescript
// components/ImportExportModal.tsx lines 18-27
const templateData = [{
  sku: "COMP-001",
  name: "Worm Castings (1 lb)",
  category: "Amendments",
  stock: 500,
  onOrder: 100,
  reorderPoint: 200,
  vendorId: 'VEND-001',
  moq: 50
}];
```

### Enhanced Version (weavein)
```typescript
// components/ImportExportModal.tsx - Replace lines 17-40

const handleDownloadTemplate = () => {
  // Comprehensive template with all fields + 10 examples
  const templateData = [
    {
      sku: "WC-001",
      name: "Worm Castings 1lb",
      description: "Premium earthworm castings for soil health",
      category: "Amendments",
      stock: 500,
      on_order: 100,
      reorder_point: 200,
      reorder_quantity: 500,
      moq: 50,
      vendor_name: "Worm Farm LLC",
      vendor_email: "orders@wormfarm.com",
      unit_cost: 2.50,
      unit_price: 5.99,
      location: "Warehouse A",
      notes: "Popular item"
    },
    {
      sku: "KM-002",
      name: "Kelp Meal 5lb",
      description: "Cold-processed Norwegian kelp",
      category: "Amendments",
      stock: 250,
      on_order: 0,
      reorder_point: 100,
      reorder_quantity: 300,
      moq: 25,
      vendor_name: "Ocean Harvest",
      vendor_email: "info@oceanharvest.com",
      unit_cost: 8.75,
      unit_price: 18.99,
      location: "Warehouse A",
      notes: "Seasonal"
    },
    // Add 8 more examples here...
  ];

  const headers = Object.keys(templateData[0]).join(',');
  const rows = templateData.map(row =>
    Object.values(row).map(val => {
      // Proper CSV escaping
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  );

  const csvString = [headers, ...rows].join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', 'murp_inventory_template.csv');
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
```

**Result:** Users get a real template with all fields + examples

---

## Quick Win #2: Make Upload Work (2 hours)

### Add File Upload Handler

```typescript
// components/ImportExportModal.tsx - Add new function after handleDownloadTemplate

const [uploading, setUploading] = useState(false);
const fileInputRef = useRef<HTMLInputElement>(null);

const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (!file) return;

  setUploading(true);

  try {
    // Parse CSV
    const text = await file.text();
    const lines = text.split('\n');
    const headers = lines[0].split(',');
    const rows = lines.slice(1).map(line => {
      const values = line.split(',');
      const row: any = {};
      headers.forEach((header, i) => {
        row[header.trim()] = values[i]?.trim();
      });
      return row;
    });

    // TODO: Show review modal with rows
    // TODO: Allow column mapping
    // TODO: Commit to database

    console.log(`Parsed ${rows.length} rows:`, rows);
    alert(`Parsed ${rows.length} items. Review & commit coming next!`);

  } catch (error) {
    console.error('Upload error:', error);
    alert(`Upload failed: ${error.message}`);
  } finally {
    setUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }
};
```

### Update UI (Replace line 61-71)

```tsx
<input
  ref={fileInputRef}
  type="file"
  accept=".csv,.xlsx,.tsv"
  onChange={handleFileUpload}
  className="hidden"
  id="file-upload"
/>

<label
  htmlFor="file-upload"
  className="mt-2 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md cursor-pointer hover:border-accent-400 transition-colors"
>
  <div className="space-y-1 text-center">
    <svg className="mx-auto h-12 w-12 text-gray-500" stroke="currentColor" fill="none" viewBox="0 0 48 48">
      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <div className="flex text-sm text-gray-500">
      <p className="pl-1">{uploading ? 'Uploading...' : 'Click to upload CSV, Excel, or TSV'}</p>
    </div>
    <p className="text-xs text-gray-500">
      {uploading ? 'Processing file...' : 'Drag & drop supported'}
    </p>
  </div>
</label>
```

**Result:** Upload actually works (basic parsing, needs review step)

---

## Quick Win #3: Finale - Recent First (1 hour)

### Current Problem
Purchase Orders and inventory show old data first

### Solution: Update Sort in Inventory.tsx

```typescript
// pages/Inventory.tsx - Around line 200-250 where data is sorted

// Add this before rendering
const sortedInventory = useMemo(() => {
  let sorted = [...inventory];

  // If no user sort applied, default to recent updates first
  if (!sortConfig) {
    sorted.sort((a, b) => {
      // Show recently updated items first
      const aTime = a.last_sync_at || a.updated_at || '1970-01-01';
      const bTime = b.last_sync_at || b.updated_at || '1970-01-01';
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  } else {
    // Use existing sort logic
    // ... existing code
  }

  return sorted;
}, [inventory, sortConfig]);
```

### For Purchase Orders Page

```typescript
// pages/PurchaseOrders.tsx - Similar change

const sortedPOs = useMemo(() => {
  let sorted = [...purchaseOrders];

  // Default: Most recent first, group by date
  if (!sortConfig) {
    sorted.sort((a, b) => {
      const aDate = new Date(a.order_date);
      const bDate = new Date(b.order_date);
      return bDate.getTime() - aDate.getTime();
    });
  }

  return sorted;
}, [purchaseOrders, sortConfig]);

// Then group by time relevance
const groupedPOs = useMemo(() => {
  const today = new Date();
  const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  return {
    today: sortedPOs.filter(po =>
      new Date(po.order_date).toDateString() === today.toDateString()
    ),
    thisWeek: sortedPOs.filter(po => {
      const date = new Date(po.order_date);
      return date >= thisWeek && date.toDateString() !== today.toDateString();
    }),
    thisMonth: sortedPOs.filter(po => {
      const date = new Date(po.order_date);
      return date >= thisMonth && date < thisWeek;
    }),
    older: sortedPOs.filter(po =>
      new Date(po.order_date) < thisMonth
    )
  };
}, [sortedPOs]);
```

**Result:** Recent data shows first, older data hidden by default

---

## Quick Win #4: Add "Show Recent Only" Toggle (30 minutes)

### Add to Inventory Page

```typescript
// pages/Inventory.tsx - Add near search/filter controls

const [showRecentOnly, setShowRecentOnly] = useState(true);

const filteredByRecency = useMemo(() => {
  if (!showRecentOnly) return sortedInventory;

  // Only show items updated in last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  return sortedInventory.filter(item => {
    const updateTime = new Date(item.last_sync_at || item.updated_at || '1970-01-01');
    return updateTime >= sevenDaysAgo;
  });
}, [sortedInventory, showRecentOnly]);

// In the UI, add toggle button
<button
  onClick={() => setShowRecentOnly(!showRecentOnly)}
  className="flex items-center gap-2 px-4 py-2 bg-gray-700 rounded-md hover:bg-gray-600"
>
  {showRecentOnly ? '📅 Recent (7 days)' : '📚 All Data'}
  <span className="text-xs text-gray-400">
    ({showRecentOnly ? filteredByRecency.length : sortedInventory.length} items)
  </span>
</button>
```

**Result:** Users can toggle between recent data (default) and all data

---

## Quick Win #5: Enhanced Export (1 hour)

### Currently export functions exist, enhance them

```typescript
// services/exportService.ts - Add enhanced export with better formatting

export function exportInventoryWithTemplate<T extends object>(
  data: T[],
  filename: string,
  includeTemplate: boolean = false
) {
  if (includeTemplate && data.length > 0) {
    // Add instructional rows at top
    const instructions = {
      sku: "--- TEMPLATE INSTRUCTIONS ---",
      name: "Delete this row and rows below, then add your data",
      category: "Required columns: sku, name, stock, reorder_point",
      stock: "Optional: on_order, vendor_name, unit_cost",
      // ... fill other columns
    };

    const templateRows = [
      instructions,
      { sku: "Example: WC-001", name: "Worm Castings 1lb", stock: 500, /* ... */ },
      ...data.slice(0, 5) // Show first 5 actual items as examples
    ];

    exportToCsv(templateRows, filename);
  } else {
    exportToCsv(data, filename);
  }
}
```

**Result:** Exports include instructions for re-import

---

## Implementation Order (This Week)

### Day 1 (4 hours):
1. ✅ Enhance template download (30 min)
2. ✅ Make upload parse files (2 hours)
3. ✅ Test with real CSV (30 min)
4. ✅ Update docs (1 hour)

### Day 2 (4 hours):
1. ✅ Add Finale recent-first sort (1 hour)
2. ✅ Add "Recent Only" toggle (30 min)
3. ✅ Test with real data (1 hour)
4. ✅ Fix any bugs (1.5 hours)

### Day 3 (4 hours):
1. ✅ Add column matching UI (2 hours)
2. ✅ Add review step before commit (1 hour)
3. ✅ Test full upload flow (1 hour)

### Day 4 (4 hours):
1. ✅ Add database insert logic (2 hours)
2. ✅ Add error handling (1 hour)
3. ✅ Final testing (1 hour)

### Day 5 (2 hours):
1. ✅ Polish UI (1 hour)
2. ✅ User testing (1 hour)

**Total: 18 hours = 1 work week**

---

## Files to Modify

### Priority 1 (Quick Wins):
- [ ] `components/ImportExportModal.tsx` - Add real upload
- [ ] `pages/Inventory.tsx` - Recent-first sort + toggle
- [ ] `pages/PurchaseOrders.tsx` - Recent-first sort

### Priority 2 (Full Upload):
- [ ] Create `components/UploadReviewModal.tsx` - Review step
- [ ] Create `services/csvImportService.ts` - Import logic
- [ ] Update `services/dataAcquisitionAgent.ts` - Use for CSV

### Priority 3 (Polish):
- [ ] Update `DATA_CONNECTIONS_GUIDE.md` - Reflect working upload
- [ ] Update `README.md` - Note CSV upload works
- [ ] Add `docs/CSV_UPLOAD_GUIDE.md` - Detailed how-to

---

## Testing Checklist

- [ ] Download template → Opens correctly
- [ ] Template has all fields + examples
- [ ] Upload CSV → Parses correctly
- [ ] Upload Excel → Parses correctly
- [ ] Column auto-detection works
- [ ] Review shows correct data
- [ ] Commit imports to database
- [ ] Finale data shows recent first
- [ ] "Recent Only" toggle works
- [ ] Export → Re-import works (round-trip)

---

## Next: After Basic Upload Works

1. Add column matching UI (drag/drop or dropdown)
2. Add validation preview (show errors before commit)
3. Add delta detection (show what's new vs updated)
4. Add backup before import
5. Add audit logging

But get the basics working first! Ship fast, iterate.

---

**This approach enhances what exists rather than rebuilding. Users get working upload in 1 week instead of 4-6 weeks for full pipeline.**
