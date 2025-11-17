# Filter Preset System - Elegant Category Management

## Overview
Comprehensive filtering solution for Inventory page with saved presets, category visibility management, and smart defaults.

## Features

### 1. **Category Management Modal**
- **Visible/Hidden Categories**: Control which categories appear in dropdown
- **Excluded Categories**: Categories that bypass filtering (always shown)
- **Smart Defaults**: Auto-hide empty or irrelevant categories

### 2. **Filter Presets**
Users can save commonly-used filter combinations:
- **Quick Access**: One-click to apply preset
- **Named Views**: E.g., "Production Materials", "Packaging Only", "Raw Ingredients"
- **Multi-Filter**: Saves categories, vendors, BOM filter, and risk filter
- **Persistent**: Stored in localStorage

### 3. **Modern UX**
- **Preset Dropdown**: Quick selector in toolbar
- **Keyboard Shortcuts**: Quick access to presets (Ctrl+1, Ctrl+2, etc.)
- **Visual Badges**: Show active preset name
- **Smooth Transitions**: Animated filter application

## Data Structure

### CategoryConfig
```typescript
interface CategoryConfig {
  name: string;
  visible: boolean;    // Show in dropdown menu
  excluded: boolean;   // Never filter (always show these items)
  order: number;       // Display order in dropdown
}
```

### FilterPreset
```typescript
interface FilterPreset {
  id: string;
  name: string;
  description?: string;
  filters: {
    categories: string[];
    vendors: string[];
    bomFilter: 'all' | 'with-bom' | 'without-bom';
    riskFilter: 'all' | 'needs-order';
  };
  createdAt: string;
}
```

## User Workflows

### Create Preset
1. Apply desired filters manually
2. Click "Save Preset" button
3. Enter name and description
4. Preset saved and available in dropdown

### Apply Preset
1. Click preset dropdown in toolbar
2. Select saved preset
3. All filters applied instantly
4. Active preset badge shown

### Manage Categories
1. Click "Manage Categories" in filter toolbar
2. Toggle visibility/exclusion for each category
3. Save changes
4. Dropdown reflects new configuration

## Storage
- **Category Config**: `localStorage.getItem('inventory-category-config')`
- **Filter Presets**: `localStorage.getItem('inventory-filter-presets')`
- **Active Preset**: `localStorage.getItem('inventory-active-preset-id')`

## Benefits
1. **Efficiency**: No repeated checkbox clicking
2. **Consistency**: Team members can share preset configs
3. **Flexibility**: Hide irrelevant categories without losing data
4. **Scalability**: Works with 100+ categories
5. **User-Friendly**: Intuitive modal-based management

## Implementation Notes

### Filtering Logic
```typescript
// Apply category filters with exclusions
if (selectedCategories.size > 0) {
  filteredItems = filteredItems.filter(item => {
    const category = normalizeCategory(item.category);
    const config = categoryConfig[category];
    
    // Always show excluded categories
    if (config?.excluded) return true;
    
    // Filter by selected categories
    return selectedCategories.has(category);
  });
}
```

### Preset Application
```typescript
const applyPreset = (preset: FilterPreset) => {
  setSelectedCategories(new Set(preset.filters.categories));
  setSelectedVendors(new Set(preset.filters.vendors));
  setBomFilter(preset.filters.bomFilter);
  setRiskFilter(preset.filters.riskFilter);
  setActivePresetId(preset.id);
};
```

## Future Enhancements
- [ ] Export/import presets for team sharing
- [ ] Server-side preset storage (user profiles)
- [ ] Preset analytics (most-used filters)
- [ ] Auto-suggest presets based on usage patterns
- [ ] Preset permissions (admin-only presets)
