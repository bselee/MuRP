# MuRP UI Standards

## Table Row Height Standard

**Target Row Height**: ~0.24 inches (approximately 6mm)

### Implementation
All table rows use:
- **`py-2`** padding for headers to provide visual separation
- **`py-1`** padding for body cells to maximize information density while maintaining readability

#### Before (Old Standard)
```tsx
// Headers used py-3
<th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">

// Body cells used py-4
<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
```

#### After (Current Standard)
```tsx
// Headers use py-2 for better visual separation
<th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">

// Body cells use py-1 for maximum density
<td className="px-6 py-1 whitespace-nowrap text-sm text-gray-300">
```

### Files Updated
All primary table components have been updated to this standard:

**Pages:**
- `pages/Inventory.tsx` - Main inventory table
- `pages/Vendors.tsx` - Vendor management table
- `pages/PurchaseOrders.tsx` - PO and requisition tables
- `pages/BOMs.tsx` - Bill of materials table
- `pages/Production.tsx` - Build order table
- `pages/StockIntelligence.tsx` - Stock risk table

**Components:**
- `components/BuildabilityTable.tsx` - Buildability analysis table
- `components/BomDetailModal.tsx` - BOM detail view table
- `components/BomEditModal.tsx` - BOM editing table
- `components/ReorderQueueDashboard.tsx` - Reorder queue table
- `components/UserManagementPanel.tsx` - User management table

### Benefits
1. **Higher Information Density**: More rows visible without scrolling
2. **Improved Scanning**: Easier to scan across multiple rows
3. **Better Screen Utilization**: Maximizes use of available vertical space
4. **Visual Hierarchy**: Headers with `py-2` provide clear separation from body rows with `py-1`
5. **Consistent UX**: All tables follow the same compact pattern

### Usage Guidelines
When creating new table components:
1. Use `py-2` for all `<th>` elements (headers)
2. Use `py-1` for all `<td>` elements (body cells)
3. Keep horizontal padding at `px-4` or `px-6` for adequate column spacing
4. Use `text-sm` or `text-xs` font sizes for body content
5. Maintain uppercase, tracked headers with `text-xs font-medium uppercase tracking-wider`

### Accessibility Considerations
- The `py-2` padding on headers (0.5rem = 8px) provides clear visual separation
- The `py-1` padding on body cells (0.25rem = 4px) provides sufficient touch target size when combined with text content
- Color contrast ratios remain compliant with WCAG AA standards
- Screen readers are unaffected by vertical padding changes
