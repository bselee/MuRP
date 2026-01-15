# UI Congruency

## Overview

Similar UI elements across pages must behave identically. When a user sees "Vendors" dropdown on Inventory and "Vendors" dropdown on BOMs, they expect the same data and behavior.

**Core principle:** If it looks the same, it must work the same.

## When to Use

Apply this skill when:
- Adding filters, dropdowns, or controls to a page
- Creating new pages with similar functionality to existing pages
- Fixing UI bugs that may exist on multiple pages
- Reviewing changes that touch shared UI patterns

## Congruency Checklist

### 1. Data Sources
- [ ] Same entity (vendors, categories, etc.) uses same data source across pages
- [ ] If Page A gets vendors from `vendors` prop, Page B must too
- [ ] Don't derive data differently on different pages (e.g., one page from props, another from inventory items)

### 2. Props & Dependencies
- [ ] Pages displaying same data receive same props from App.tsx
- [ ] If Inventory gets `vendors` prop, BOMs must get `vendors` prop too
- [ ] Lookup maps/helpers should be consistent (vendorNameMap pattern)

### 3. UI Elements
- [ ] Same button types use same styling (no blue pills on one page, gray on another)
- [ ] Dropdown behavior is consistent (z-index, positioning, animations)
- [ ] Filter controls have same options and behavior
- [ ] Empty states show consistent messages

### 4. Button Styling Rules
```typescript
// CORRECT: Plain button with neutral styling
<button
  type="button"
  onClick={handleClick}
  className={`text-xs font-medium px-2 py-1 rounded ${
    isDark
      ? 'text-gray-200 hover:text-white bg-gray-700 hover:bg-gray-600'
      : 'text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200'
  }`}
>
  Select All
</button>

// WRONG: Button component with accent styling in dropdowns
<Button className="text-accent-400 ...">Select All</Button>
```

### 5. Dropdown Z-Index Pattern
```typescript
// Wrapper div raises z-index when dropdown is open
<div className={`relative ${isDropdownOpen ? 'z-50' : 'z-10'}`}>
  <CollapsibleSection ...>
    {/* Dropdown content with z-[100] */}
  </CollapsibleSection>
</div>
```

### 6. Vendor Lookup Pattern
```typescript
// Create lookup map from vendors prop
const vendorNameMap = useMemo(() => {
  const map = new Map<string, string>();
  vendors.forEach(vendor => {
    if (vendor.id) map.set(vendor.id, vendor.name);
  });
  return map;
}, [vendors]);

// Helper to resolve vendorId -> name
const getVendorName = (vendorId?: string | null): string => {
  if (!vendorId) return '';
  return vendorNameMap.get(vendorId) || vendorId;
};
```

## Common Violations

| Issue | Symptom | Fix |
|-------|---------|-----|
| Missing prop | "No vendors found" on one page but works on another | Add missing prop to component interface and App.tsx |
| Different data derivation | Different vendor lists on different pages | Use same vendorNameMap pattern everywhere |
| Inconsistent Button styling | Blue pills on some pages, gray on others | Use plain `<button>` not `<Button>` in dropdowns |
| Z-index issues | Dropdowns hidden behind content | Add dynamic z-index wrapper |

## Audit Process

When adding or fixing UI:

1. **Find similar UI** - Search codebase for same pattern on other pages
2. **Compare implementation** - Check props, data sources, styling
3. **Fix all instances** - Don't just fix one page, fix all
4. **Test across pages** - Verify same behavior everywhere

## Key Files

- `pages/Inventory.tsx` - Reference implementation for filters
- `pages/BOMs.tsx` - Must match Inventory patterns
- `pages/PurchaseOrders.tsx` - Must match filter patterns
- `App.tsx` - Prop distribution to all pages
