# Component Usage Guide
**How to Use MuRP's Standardized UI Components**

This guide helps you use the design system components correctly and consistently across the application.

---

## 📦 Available Components

### Core UI Components (`/components/ui/`)

1. **PageHeader** - Standardized page headers
2. **Table** - Data tables with sorting
3. **SearchBar** - Search with autocomplete
4. **StatusBadge** - Status indicators
5. **Button** - All button types
6. **Card** - Content containers
7. **CollapsibleSection** - Expandable sections
8. **Input/Select/Textarea** - Form fields

---

## 🎯 When to Use Each Component

### PageHeader

**Use for**: Every page's top section

```tsx
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';

<PageHeader
  title="Purchase Orders"
  description="Manage and track all purchase orders"
  actions={
    <>
      <Button variant="secondary">Export</Button>
      <Button variant="primary">Create PO</Button>
    </>
  }
/>
```

**Features**:
- Responsive (actions stack on mobile)
- Optional breadcrumbs
- Optional icon
- Consistent spacing

**Migration**:
```tsx
// ❌ Before: Custom header
<header className="flex justify-between items-center mb-6">
  <div>
    <h1 className="text-xl font-bold text-white">Purchase Orders</h1>
    <p className="text-sm text-gray-400">Description here</p>
  </div>
  <div className="flex gap-2">
    <button>...</button>
  </div>
</header>

// ✅ After: PageHeader component
<PageHeader
  title="Purchase Orders"
  description="Description here"
  actions={<Button>...</Button>}
/>
```

---

### Table

**Use for**: All data tables

```tsx
import Table, { Column } from '@/components/ui/Table';

const columns: Column<InventoryItem>[] = [
  {
    key: 'sku',
    label: 'SKU',
    sortable: true,
    width: 'w-32',
  },
  {
    key: 'name',
    label: 'Name',
    sortable: true,
  },
  {
    key: 'stock',
    label: 'Stock',
    sortable: true,
    align: 'right',
    render: (row) => (
      <span className={row.stock < row.reorderPoint ? 'text-red-400' : ''}>
        {row.stock}
      </span>
    ),
  },
  {
    key: 'actions',
    label: 'Actions',
    render: (row) => (
      <Button size="sm" onClick={() => handleEdit(row)}>Edit</Button>
    ),
  },
];

<Table
  columns={columns}
  data={inventory}
  getRowKey={(row) => row.id}
  stickyHeader
  hoverable
  onRowClick={(row) => console.log('Clicked:', row)}
/>
```

**Features**:
- Built-in sorting
- Sticky headers
- Follows UI_STANDARDS.md (py-2/py-1 padding)
- Custom cell rendering
- Column visibility
- Theme-aware

**Important**: Table uses **py-2 for headers** and **py-1 for body** (0.24" row height standard)

---

### SearchBar

**Use for**: Any search input with or without autocomplete

```tsx
import SearchBar, { SearchSuggestion } from '@/components/ui/SearchBar';

const [searchQuery, setSearchQuery] = useState('');
const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);

<SearchBar
  value={searchQuery}
  onChange={setSearchQuery}
  placeholder="Search inventory..."
  suggestions={suggestions}
  onSelectSuggestion={(suggestion) => {
    console.log('Selected:', suggestion);
    // Navigate or filter based on selection
  }}
  debounceMs={300}
  loading={isSearching}
/>
```

**Features**:
- Debounced input (300ms default)
- Autocomplete dropdown
- Keyboard navigation (arrow keys, enter, escape)
- Clear button
- Loading state
- Theme-aware

---

### StatusBadge

**Use for**: All status indicators (replaces custom badge implementations)

```tsx
import StatusBadge, { getVariantForStatus, formatStatusText } from '@/components/ui/StatusBadge';

// Manual variant
<StatusBadge variant="success">Completed</StatusBadge>
<StatusBadge variant="warning">Pending</StatusBadge>
<StatusBadge variant="danger">Cancelled</StatusBadge>

// Auto-detect from status string
<StatusBadge status={order.status}>
  {formatStatusText(order.status)}
</StatusBadge>

// With icon
<StatusBadge variant="warning" icon={<AlertIcon className="w-3 h-3" />}>
  Attention Needed
</StatusBadge>
```

**Available Variants**:
- `default` - Gray (unknown/neutral)
- `primary` - Accent blue (draft, new, open)
- `success` - Green (completed, approved, received, delivered)
- `warning` - Amber (pending, partial, needs review)
- `danger` - Red (cancelled, rejected, failed, exception)
- `info` - Cyan (committed, submitted)
- `processing` - Blue (processing, sent)
- `shipped` - Purple (shipped, in transit)
- `delivered` - Green (delivered)

**Auto-Detection** works for:
- PO statuses: draft, pending, committed, sent, confirmed, partial, received, cancelled
- Tracking: awaiting_confirmation, processing, shipped, in_transit, out_for_delivery, delivered, exception
- Inventory: in_stock, low_stock, out_of_stock

**Migration**:
```tsx
// ❌ Before: Custom status badge
const PO_STATUS_STYLES = {
  pending: { label: 'Pending', className: 'bg-yellow-500/20 text-yellow-400...' },
  // ...
};
<span className={PO_STATUS_STYLES[status].className}>
  {PO_STATUS_STYLES[status].label}
</span>

// ✅ After: StatusBadge component
<StatusBadge status={status}>
  {formatStatusText(status)}
</StatusBadge>
```

---

### CollapsibleSection

**Use for**: Expandable sections (Dashboard, Settings, PurchaseOrders)

```tsx
import CollapsibleSection from '@/components/CollapsibleSection';
import { ChartBarIcon } from '@/components/icons';

const [isOpen, setIsOpen] = useState(false);

// Default variant (Settings style)
<CollapsibleSection
  title="User Management"
  icon={<UsersIcon />}
  isOpen={isOpen}
  onToggle={() => setIsOpen(!isOpen)}
>
  {/* Content */}
</CollapsibleSection>

// Card variant (Dashboard style)
<CollapsibleSection
  variant="card"
  title="Production Overview"
  icon={<ChartBarIcon />}
  isOpen={isOpen}
  onToggle={() => setIsOpen(!isOpen)}
>
  {/* Content */}
</CollapsibleSection>

// Section variant with count (PurchaseOrders style)
<CollapsibleSection
  variant="section"
  title="Pending Requisitions"
  count={pendingCount}
  isOpen={isOpen}
  onToggle={() => setIsOpen(!isOpen)}
>
  {/* Content */}
</CollapsibleSection>
```

**Variants**:
- `default` - Simple border-bottom (Settings)
- `card` - Full card with background (Dashboard)
- `section` - Section with background and border (PurchaseOrders)

**New in this release**: `count` prop for badge display!

---

### Button

**Use for**: All interactive buttons (already well-adopted ✅)

```tsx
import Button from '@/components/ui/Button';

<Button variant="primary">Save</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="ghost">More Options</Button>
<Button variant="danger">Delete</Button>

<Button size="sm">Small</Button>
<Button size="md">Medium (default)</Button>
<Button size="lg">Large</Button>

<Button loading={isSaving}>Save Changes</Button>
<Button disabled>Unavailable</Button>
<Button fullWidth>Full Width</Button>

<Button
  leftIcon={<PlusIcon className="w-4 h-4" />}
>
  Add Item
</Button>
```

**Already used in 80% of pages** ✅ - Keep using it!

---

### Card

**Use for**: Content containers (currently only 5% adoption ❌)

```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Executive Summary</CardTitle>
  </CardHeader>
  <CardContent>
    {/* Your content */}
  </CardContent>
</Card>
```

**Replace**:
```tsx
// ❌ Before: Manual div
<div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-6">
  <h3 className="text-lg font-semibold mb-4">Title</h3>
  {/* content */}
</div>

// ✅ After: Card component
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>
    {/* content */}
  </CardContent>
</Card>
```

---

## 🚨 Don't Do This

### ❌ Manual HTML Elements Instead of Components

```tsx
// ❌ BAD: Manual button
<button className="px-4 py-2 bg-blue-500 rounded-lg hover:bg-blue-600">
  Click Me
</button>

// ✅ GOOD: Button component
<Button variant="primary">Click Me</Button>
```

### ❌ Custom Status Badges

```tsx
// ❌ BAD: Custom status badge implementation
const STATUS_STYLES = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  // ...
};
<span className={`px-3 py-1 rounded-full ${STATUS_STYLES[status]}`}>
  {status}
</span>

// ✅ GOOD: StatusBadge component
<StatusBadge status={status}>{formatStatusText(status)}</StatusBadge>
```

### ❌ Custom Table Implementations

```tsx
// ❌ BAD: Manual table markup
<table className="w-full">
  <thead className="bg-gray-800">
    <tr>
      <th className="px-6 py-3 text-left">SKU</th>
      {/* more headers */}
    </tr>
  </thead>
  <tbody>
    {data.map(row => (
      <tr key={row.id}>
        <td className="px-6 py-4">{row.sku}</td>
      </tr>
    ))}
  </tbody>
</table>

// ✅ GOOD: Table component
<Table
  columns={columns}
  data={data}
  getRowKey={(row) => row.id}
/>
```

### ❌ Non-Standard Spacing

```tsx
// ❌ BAD: Random padding values
<div className="p-5 gap-5 space-y-5">  // Non-standard 20px

// ✅ GOOD: Standard spacing from design system
<div className="p-4 gap-4 space-y-4">  // Standard 16px
// or
<div className="p-6 gap-3 space-y-6">  // Standard 24px
```

**Standard Spacing**:
- Padding: `p-4` (16px) or `p-6` (24px) only
- Gaps: `gap-2` (8px), `gap-3` (12px), `gap-4` (16px)
- Vertical: `space-y-4`, `space-y-6`, `space-y-8`

---

## 📋 Migration Checklist

When refactoring a page:

- [ ] Replace custom header with `<PageHeader />`
- [ ] Replace custom tables with `<Table />`
- [ ] Replace custom status badges with `<StatusBadge />`
- [ ] Replace manual card divs with `<Card />`
- [ ] Use `<Button />` for all buttons
- [ ] Use `<SearchBar />` for search inputs
- [ ] Use standard spacing (p-4/p-6, gap-2/3/4)
- [ ] Remove custom `CollapsibleSection` implementations
- [ ] Use `<Input />`, `<Select />`, `<Textarea />` for forms

---

## 🎨 Design System Rules

### Spacing
- **Component padding**: `p-4` (16px) or `p-6` (24px)
- **Section margins**: `mb-6`, `mb-8`, `mb-12`
- **Element gaps**: `gap-2` (8px), `gap-3` (12px), `gap-4` (16px)

### Border Radius
- **Buttons**: `rounded-full` (pill shape)
- **Cards**: `rounded-lg` (8px)
- **Modals**: `rounded-xl` (12px)
- **Inputs**: `rounded-lg` (8px)

### Colors
- **Accent**: Use `accent-500` for primary actions
- **Success**: `emerald-500` or `green-500`
- **Warning**: `amber-500` or `yellow-500`
- **Danger**: `red-500`
- **Info**: `cyan-500`

**Don't use**: Multiple blue variants interchangeably (no mixing `blue-`, `cyan-`, `sky-`)

### Table Padding (UI_STANDARDS.md)
- **Headers**: `py-2` (8px)
- **Body cells**: `py-1` (4px)
- **Target row height**: ~0.24 inches (6mm)

---

## 💡 Tips

1. **Always import from the design system first**
   ```tsx
   import Button from '@/components/ui/Button';
   import { Card, CardHeader } from '@/components/ui/card';
   ```

2. **Check if a component exists before building custom**
   - Look in `/components/ui/` first
   - Check this guide
   - Ask the team

3. **Use TypeScript interfaces**
   ```tsx
   import type { Column } from '@/components/ui/Table';
   import type { SearchSuggestion } from '@/components/ui/SearchBar';
   ```

4. **Theme-aware by default**
   - All components automatically support light/dark mode
   - Don't add manual theme checks unless necessary

5. **Accessibility built-in**
   - Components have proper ARIA labels
   - Keyboard navigation works
   - Focus management included

---

## 📚 Examples

See these pages for reference implementations:

- **PageHeader**: (Coming soon - Dashboard, PurchaseOrders refactors)
- **Table**: (Coming soon - Inventory refactor)
- **StatusBadge**: Use throughout Dashboard, PurchaseOrders
- **CollapsibleSection**: Dashboard (card variant), Settings (default variant)
- **Button**: Dashboard, Settings, PurchaseOrders (80% adoption ✅)

---

## 🆘 Getting Help

1. Check this guide first
2. Look at existing component usage in other pages
3. Read component file comments (TSDoc format)
4. Ask in #frontend Slack channel
5. Check `UI_FLOW_ANALYSIS.md` for design system audit

---

## 📈 Progress

**Current Design System Adoption**: 30%

**Target After Week 1**: 60%

**Components with Good Adoption**:
- ✅ Button (80%)
- ✅ CollapsibleSection (70%)
- ✅ Toast (80%)

**Components Needing Adoption**:
- ❌ Card (5% → target 60%)
- ❌ Table (0% → target 80%)
- ❌ StatusBadge (10% → target 80%)
- ❌ PageHeader (NEW → target 100%)
- ❌ SearchBar (NEW → target 40%)

---

**Last Updated**: December 4, 2025
**Related Documents**: `UI_FLOW_ANALYSIS.md`, `ui_design.md`, `docs/UI_STANDARDS.md`
