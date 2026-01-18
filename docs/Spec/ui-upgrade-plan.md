# UI Polish & Consistency Overhaul Plan

**Goal:** Transform the UI so users say "it just feels better" - not "they redesigned it."

## Summary of Changes

| Category | Issues | Impact |
|----------|--------|--------|
| Core UI Components | 9 components lack theme support | Critical |
| Micro-interactions | No transition system, inconsistent states | High |
| Page-Level Fixes | StockIntelligence, Vendors dark-mode only | High |
| Table Bug | Compact mode broken (py-1 always) | Medium |
| New Components | Skeleton, Spinner, EmptyState | Medium |

---

## Phase 1: Design System Foundation

### 1.1 Tailwind Configuration (`tailwind.config.js`)

Add standardized tokens:

```javascript
theme: {
  extend: {
    transitionDuration: {
      'fast': '100ms',    // focus, micro-interactions
      'normal': '200ms',  // most interactions
      'slow': '300ms',    // modals, page transitions
    },
    keyframes: {
      'shimmer': {
        '0%': { backgroundPosition: '-200% 0' },
        '100%': { backgroundPosition: '200% 0' },
      },
      'scale-in': {
        '0%': { opacity: '0', transform: 'scale(0.95)' },
        '100%': { opacity: '1', transform: 'scale(1)' },
      },
      'fade-in': {
        '0%': { opacity: '0' },
        '100%': { opacity: '1' },
      },
      'slide-up': {
        '0%': { opacity: '0', transform: 'translateY(10px)' },
        '100%': { opacity: '1', transform: 'translateY(0)' },
      },
    },
    animation: {
      'shimmer': 'shimmer 2s infinite linear',
      'scale-in': 'scale-in 200ms ease-out',
      'fade-in': 'fade-in 150ms ease-out',
      'slide-up': 'slide-up 200ms ease-out',
    },
  },
}
```

### 1.2 CSS Variables (`src/index.css`)

Add to `@layer base`:

```css
:root {
  --transition-fast: 100ms;
  --transition-normal: 200ms;
  --transition-slow: 300ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

Add utility classes:

```css
@layer utilities {
  .focus-ring {
    @apply focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-500/50;
  }
}
```

---

## Phase 2: Core UI Components (9 files)

**Pattern to follow** (from existing `Button.tsx`):
```typescript
import { useTheme } from '@/components/ThemeProvider';

type ThemeVariant = 'light' | 'dark';

const styles: Record<ThemeVariant, string> = {
  light: '...',
  dark: '...',
};

// In component:
const { resolvedTheme } = useTheme();
const themeKey: ThemeVariant = resolvedTheme === 'light' ? 'light' : 'dark';
```

### 2.1 Card (`components/ui/card.tsx`)

| Element | Light | Dark |
|---------|-------|------|
| Background | `bg-white` | `bg-gray-800/50` |
| Border | `border-gray-200` | `border-gray-700` |
| Shadow | `shadow-sm` | (none) |

### 2.2 Badge (`components/ui/badge.tsx`)

Add variants: `default`, `secondary`, `destructive`, `outline`, `success`, `warning`, `info`

| Variant | Light | Dark |
|---------|-------|------|
| success | `bg-green-100 text-green-700` | `bg-emerald-500/20 text-emerald-300` |
| warning | `bg-yellow-100 text-yellow-700` | `bg-amber-500/20 text-amber-300` |
| destructive | `bg-red-100 text-red-800` | `bg-red-500/20 text-red-300` |

### 2.3 Input (`components/ui/input.tsx`)

| Element | Light | Dark |
|---------|-------|------|
| Background | `bg-white` | `bg-gray-900` |
| Border | `border-gray-300` | `border-gray-700` |
| Text | `text-gray-900` | `text-white` |
| Placeholder | `text-gray-400` | `text-gray-500` |
| Focus ring offset | `ring-offset-white` | `ring-offset-gray-900` |

### 2.4 Textarea (`components/ui/textarea.tsx`)
Same pattern as Input.

### 2.5 Select (`components/ui/select.tsx`)

| Element | Light | Dark |
|---------|-------|------|
| Trigger bg | `bg-white` | `bg-gray-900` |
| Content bg | `bg-white` | `bg-gray-800` |
| Item hover | `hover:bg-gray-100` | `hover:bg-gray-700` |
| Content shadow | `shadow-lg` | `shadow-[0_8px_32px_rgba(0,0,0,0.5)]` |

### 2.6 Dialog (`components/ui/dialog.tsx`)

| Element | Light | Dark |
|---------|-------|------|
| Backdrop | `bg-black/50` | `bg-black/70` |
| Content bg | `bg-white` | `bg-gray-800` |
| Content border | (none) | `border-gray-700` |

### 2.7 Checkbox (`components/ui/checkbox.tsx`)

| Element | Light | Dark |
|---------|-------|------|
| Border | `border-gray-300` | `border-gray-600` |
| Background | `bg-white` | `bg-gray-800` |
| Checked | `text-accent-600` | `text-accent-500` |

### 2.8 Alert (`components/ui/alert.tsx`)

Add variants: `default`, `destructive`, `success`, `warning`, `info`

### 2.9 Progress (`components/ui/progress.tsx`)

| Element | Light | Dark |
|---------|-------|------|
| Track | `bg-gray-200` | `bg-gray-700` |
| Indicator | `bg-accent-500` | `bg-accent-500` |

---

## Phase 3: Micro-interactions & Polish

### 3.1 Button Enhancements (`components/ui/Button.tsx`)

Add to base classes:
```
transition-all duration-normal ease-out
hover:scale-[1.02]
active:scale-[0.98]
active:transition-none
```

### 3.2 New Skeleton Component (`components/ui/Skeleton.tsx`)

```typescript
interface SkeletonProps {
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  animation?: 'pulse' | 'shimmer' | 'none';
}
```

Shimmer gradient:
- Light: `from-gray-200 via-gray-100 to-gray-200`
- Dark: `from-gray-700 via-gray-600 to-gray-700`

Export presets: `SkeletonText`, `SkeletonCard`, `SkeletonTable`

### 3.3 New Spinner Component (`components/ui/Spinner.tsx`)

Sizes: `xs`, `sm`, `md`, `lg`, `xl`
Two variants: CSS border-based and SVG-based (for buttons)

### 3.4 New EmptyState Component (`components/ui/EmptyState.tsx`)

Pattern: Icon + Title + Description + Action button
Dashed border, centered content, theme-aware colors

### 3.5 Table Interactions (`components/ui/Table.tsx`)

**Bug fix line 209:**
```typescript
// CURRENT (broken):
const cellPadding = compact ? 'py-1' : 'py-1';
// FIXED:
const cellPadding = compact ? 'py-1' : 'py-2';
```

Add row interactions:
```
transition-all duration-normal
hover:bg-gray-700/50 (dark) | hover:bg-gray-50 (light)
hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]
```

Add keyboard focus for clickable rows:
```
tabIndex={onRowClick ? 0 : undefined}
focus-visible:ring-2 focus-visible:ring-inset
```

### 3.6 Dialog Animations (`components/ui/dialog.tsx`)

Backdrop: `transition-opacity duration-normal`
Content: `transition-all duration-normal ease-out`
- Open: `opacity-100 scale-100`
- Closed: `opacity-0 scale-95`

---

## Phase 4: Page-Level Fixes

### 4.1 StockIntelligence.tsx (CRITICAL - 54 hardcoded dark classes)

**Add:**
```typescript
import { useTheme } from '../components/ThemeProvider';
const { resolvedTheme } = useTheme();
const isDark = resolvedTheme !== 'light';
```

**Key replacements:**

| Line | Current | Fixed |
|------|---------|-------|
| 285 | `text-white` | `isDark ? 'text-white' : 'text-gray-900'` |
| 293+ | `bg-gray-800/50 border-gray-700` | `isDark ? '...' : 'bg-white border-gray-200 shadow-sm'` |
| 273+ | `text-gray-400` | `isDark ? 'text-gray-400' : 'text-gray-600'` |
| 356 | `hover:bg-gray-700/50` | `isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-100'` |

### 4.2 Vendors.tsx (Has isDark but doesn't use it)

Apply `isDark` conditionals to:
- Filter bar container (line 135)
- Table container (line 161)
- Table header (line 164)
- Table body/rows (lines 174-176)
- All `text-gray-300/400/500` occurrences

---

## Phase 5: Focus & Accessibility

Apply consistent focus pattern to all interactive elements:

```
focus:outline-none
focus-visible:ring-2
focus-visible:ring-accent-500/50
focus-visible:ring-offset-2
focus-visible:ring-offset-white (light)
focus-visible:ring-offset-gray-900 (dark)
```

---

## Files to Modify

### Core Components (9 files):
- `components/ui/card.tsx`
- `components/ui/badge.tsx`
- `components/ui/input.tsx`
- `components/ui/textarea.tsx`
- `components/ui/select.tsx`
- `components/ui/dialog.tsx`
- `components/ui/checkbox.tsx`
- `components/ui/alert.tsx`
- `components/ui/progress.tsx`

### Interaction Components:
- `components/ui/Button.tsx` - Add micro-interactions
- `components/ui/Table.tsx` - Bug fix + row interactions

### New Components:
- `components/ui/Skeleton.tsx` - Create
- `components/ui/Spinner.tsx` - Create
- `components/ui/EmptyState.tsx` - Create
- `components/ui/PageLoader.tsx` - Create

### Config:
- `tailwind.config.js` - Add tokens, keyframes
- `src/index.css` - Add variables, utilities

### Pages:
- `pages/StockIntelligence.tsx` - Full theme support
- `pages/Vendors.tsx` - Apply isDark conditionals

---

## Verification

1. **Build Check:** `npm run build` passes
2. **Type Check:** `npx tsc --noEmit` passes
3. **Visual Test - Light Mode:**
   - Navigate to each page
   - Verify readable text, visible borders, proper contrast
4. **Visual Test - Dark Mode:**
   - Toggle theme
   - Verify same pages have proper dark styling
5. **Interaction Test:**
   - Hover buttons (scale effect)
   - Tab through forms (focus rings visible)
   - Click table rows (feedback visible)
6. **Loading States:**
   - Test skeleton/spinner components render correctly in both themes
