```css
--rounded-lg: 0.5rem;   /* 8px */
--rounded-xl: 0.75rem;  /* 12px */
--rounded-full: 9999px;
```

## Component Patterns

### Button States
```tsx
// Primary Button
<button className="
  px-4 py-2 
  bg-primary-600 text-white 
  rounded-lg font-medium
  hover:bg-primary-700 
  active:scale-95
  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
  disabled:opacity-50 disabled:cursor-not-allowed
  transition-all duration-200
">
  Button Text
</button>

// States to always include:
✓ Default
✓ Hover
✓ Active/Pressed
✓ Focus (keyboard)
✓ Disabled
✓ Loading
```

### Input Fields
```tsx
// Text Input
<div className="space-y-1">
  <label className="block text-sm font-medium text-gray-900">
    Label Text
    <span className="text-red-500">*</span>
  </label>
  <input
    type="text"
    className="
      w-full px-4 py-2 
      border border-gray-300 rounded-lg
      focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-20
      disabled:bg-gray-50 disabled:text-gray-500
      placeholder:text-gray-400
    "
    placeholder="Placeholder text..."
  />
  <p className="text-sm text-gray-500">Help text goes here</p>
</div>

// Error State
<input className="border-red-300 focus:border-red-500 focus:ring-red-500" />
<p className="text-sm text-red-600 flex items-center gap-1">
  <AlertCircle className="w-4 h-4" />
  Error message here
</p>
```

### Cards
```tsx
<div className="
  p-6 
  bg-white 
  border border-gray-200 
  rounded-lg 
  shadow-sm
  hover:shadow-md
  transition-shadow duration-200
">
  {/* Card content */}
</div>
```

### Modals
```tsx
// Backdrop
<div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-40" />

// Modal
<div className="
  fixed inset-0 z-50 
  flex items-center justify-center 
  p-4
">
  <div className="
    w-full max-w-2xl
    bg-white rounded-xl shadow-2xl
    animate-scale-in
  ">
    {/* Modal content */}
  </div>
</div>
```

### Loading States
```tsx
// Spinner
<svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
  <circle 
    className="opacity-25" 
    cx="12" cy="12" r="10" 
    stroke="currentColor" 
    strokeWidth="4"
  />
  <path 
    className="opacity-75" 
    fill="currentColor" 
    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
  />
</svg>

// Skeleton
<div className="animate-pulse space-y-2">
  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
  <div className="h-4 bg-gray-200 rounded"></div>
  <div className="h-4 bg-gray-200 rounded w-5/6"></div>
</div>
```

## Interaction Patterns

### Animations
- **Duration:** 200ms (fast), 300ms (normal), 500ms (slow)
- **Easing:** ease-out for entrances, ease-in for exits
- **Properties:** Only animate `transform` and `opacity` for performance

### Hover Effects
```css
/* Elevation on hover */
.card {
  transition: box-shadow 200ms ease-out;
}
.card:hover {
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

/* Scale on hover */
.button {
  transition: transform 200ms ease-out;
}
.button:hover {
  transform: scale(1.05);
}
.button:active {
  transform: scale(0.95);
}
```

### Focus Indicators
Always visible, never `outline: none` without replacement:
```css
.interactive-element:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5);
}
```

## Layout Guidelines

### Page Structure
```tsx
<div className="min-h-screen bg-gray-50">
  {/* Navigation */}
  <nav className="bg-white border-b border-gray-200">
    {/* Nav content */}
  </nav>
  
  {/* Main Content */}
  <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    {/* Page content */}
  </main>
</div>
```

### Responsive Grid
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {/* Grid items */}
</div>
```

### Spacing Scale
- Component padding: 16px (p-4) or 24px (p-6)
- Section margins: 32px (mb-8) or 48px (mb-12)
- Element gaps: 8px (gap-2), 12px (gap-3), 16px (gap-4)

## Iconography

### Icon Library
**Lucide React** - Consistent 24x24px icons
```tsx
import { Calendar, User, Settings } from 'lucide-react';

<Calendar className="w-5 h-5" /> // 20px for inline
<User className="w-6 h-6" />     // 24px for standalone
```

### Icon Usage
- Always include `aria-label` for icon-only buttons
- Use consistent icon sizes within sections
- Pair icons with text when possible for clarity

## Accessibility Checklist

### Color & Contrast
- ✓ Text contrast ≥4.5:1
- ✓ Large text contrast ≥3:1
- ✓ UI component contrast ≥3:1
- ✓ Never use color alone to convey meaning

### Keyboard Navigation
- ✓ All interactive elements focusable
- ✓ Tab order logical
- ✓ Focus indicators visible
- ✓ Escape key closes modals
- ✓ Enter/Space activates buttons

### Screen Readers
- ✓ Semantic HTML (`<header>`, `<nav>`, `<main>`)
- ✓ ARIA labels on icons
- ✓ Form labels properly associated
- ✓ Error messages announced
- ✓ Loading states announced

### Motion
- ✓ Respect `prefers-reduced-motion`
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Content Guidelines

### Writing Style
- **Tone:** Professional but friendly
- **Voice:** Active, direct
- **Tense:** Present tense
- **Person:** Second person ("You can...")

### Button Labels
✓ "Save Changes" (specific action)
✗ "Submit" (vague)

✓ "Delete Order" (clear consequence)
✗ "Delete" (ambiguous)

✓ "Export to CSV" (specific format)
✗ "Export" (unclear)

### Error Messages
✓ "Email address is required"
✗ "Invalid input"

✓ "Password must be at least 8 characters"
✗ "Password invalid"

✓ "This order is already scheduled for that time"
✗ "Conflict detected"

### Empty States
```tsx
<div className="text-center py-12">
  <EmptyStateIllustration />
  <h3 className="mt-4 text-lg font-medium text-gray-900">
    No orders scheduled yet
  </h3>
  <p className="mt-2 text-sm text-gray-500">
    Get started by creating your first production order.
  </p>
  <button className="mt-6 px-4 py-2 bg-primary-600 text-white rounded-lg">
    Create Order
  </button>
</div>
```
```

### 7.2 Developer Handoff Documentation

```markdown
# UI/UX Enhancement - Developer Handoff

## Overview
This document contains all information needed to maintain and extend the enhanced UI/UX components.

## Architecture Changes

### New Components Added
```
src/
├── components/
│   ├── ui/                      # Reusable UI primitives
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   ├── Modal.tsx
│   │   ├── Toast.tsx
│   │   ├── Skeleton.tsx
│   │   └── Spinner.tsx
│   │
│   ├── forms/                   # Enhanced form components
│   │   ├── FormField.tsx
│   │   ├── DateTimePicker.tsx
│   │   ├── SearchableSelect.tsx
│   │   └── FileUpload.tsx
│   │
│   ├── tables/                  # Advanced table components
│   │   ├── EnhancedTable.tsx
│   │   ├── TableFilters.tsx
│   │   ├── ColumnVisibility.tsx
│   │   └── ExportButton.tsx
│   │
│   ├── calendar/                # Production calendar
│   │   ├── EnhancedCalendar.tsx
│   │   ├── EventComponent.tsx
│   │   ├── CustomToolbar.tsx
│   │   └── CalendarFilters.tsx
│   │
│   └── ai/                      # AI assistant
│       ├── AIChat.tsx
│       ├── MessageBubble.tsx
│       └── TypingIndicator.tsx
│
├── hooks/                       # Custom React hooks
│   ├── useDebounce.ts
│   ├── useMediaQuery.ts
│   ├── useLocalStorage.ts
│   └── useOnClickOutside.ts
│
├── utils/                       # Utility functions
│   ├── formatters.ts           # Date, currency, number formatting
│   ├── validators.ts           # Form validation helpers
│   └── performance.ts          # Performance monitoring
│
└── types/                       # TypeScript definitions
    ├── ui.types.ts
    ├── production.types.ts
    └── api.types.ts
```

### State Management Patterns

**Component State (useState)**
Use for UI-only state that doesn't need to persist:
- Modal open/closed
- Form input values (before submission)
- Loading states
- Error messages

**Context API**
Use for app-wide state that many components need:
- User authentication
- Theme preferences
- Feature flags
- Notification queue

**Supabase Real-time**
Use for data that updates from the server:
- Production orders
- Inventory levels
- Machine status

```tsx
// Example: Real-time data pattern
function useProductionOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Initial fetch
    async function fetchOrders() {
      const { data } = await supabase
        .from('production_orders')
        .select('*');
      setOrders(data || []);
      setLoading(false);
    }
    fetchOrders();
    
    // Real-time subscription
    const channel = supabase
      .channel('orders')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'production_orders'
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setOrders(prev => [...prev, payload.new]);
        } else if (payload.eventType === 'UPDATE') {
          setOrders(prev => prev.map(o => 
            o.id === payload.new.id ? payload.new : o
          ));
        } else if (payload.eventType === 'DELETE') {
          setOrders(prev => prev.filter(o => o.id !== payload.old.id));
        }
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
  
  return { orders, loading };
}
```

## Critical Integration Points

### 1. Supabase Edge Functions
All UI components that modify data must respect RLS policies:

```typescript
// ✅ CORRECT - Let RLS handle permissions
await supabase
  .from('production_orders')
  .update({ status: 'completed' })
  .eq('id', orderId);

// ❌ INCORRECT - Don't try to manually add user_id
await supabase
  .from('production_orders')
  .update({ 
    status: 'completed',
    user_id: currentUser.id  // RLS should handle this
  })
  .eq('id', orderId);
```

### 2. Vercel AI Gateway
AI chat component uses streaming responses:

```typescript
// API Route: /api/ai/chat
export async function POST(req: Request) {
  const { messages, context } = await req.json();
  
  const response = await fetch('https://gateway.ai.cloudflare.com/v1/YOUR_ACCOUNT/YOUR_GATEWAY/openai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a production management assistant. Current context: ${JSON.stringify(context)}`
        },
        ...messages
      ],
      stream: true
    })
  });
  
  // Return streaming response
  return new Response(response.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
```

### 3. React Big Calendar Integration
Custom components for calendar events:

```typescript
// Must maintain this event shape
interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource?: any; // Additional data (order details, etc.)
  allDay?: boolean;
}

// Transform Supabase data to calendar format
function transformToCalendarEvent(order: ProductionOrder): CalendarEvent {
  return {
    id: order.id,
    title: `${order.order_number} - ${order.customer_name}`,
    start: new Date(order.start_date),
    end: new Date(order.end_date),
    resource: {
      orderId: order.id,
      status: order.status,
      priority: order.priority,
      machineId: order.machine_id
    }
  };
}
```

## Performance Optimization

### Code Splitting
```typescript
// Lazy load heavy components
const EnhancedCalendar = lazy(() => import('@/components/calendar/EnhancedCalendar'));
const AIChat = lazy(() => import('@/components/ai/AIChat'));

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Route path="/schedule" component={EnhancedCalendar} />
      <Route path="/ai" component={AIChat} />
    </Suspense>
  );
}
```

### Memoization
```typescript
// Memoize expensive calculations
const filteredOrders = useMemo(() => {
  return orders.filter(order => 
    order.status === filterStatus &&
    moment(order.start_date).isBetween(dateRange.start, dateRange.end)
  );
}, [orders, filterStatus, dateRange]);

// Memoize callback functions passed to child components
const handleOrderUpdate = useCallback((orderId: string, updates: Partial<Order>) => {
  setOrders(prev => prev.map(o => 
    o.id === orderId ? { ...o, ...updates } : o
  ));
}, []);
```

### Virtual Scrolling
For large tables (>1000 rows):

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualizedTable({ data }: { data: any[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50, // Row height
    overscan: 10
  });
  
  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map(virtualRow => (
          <div
            key={virtualRow.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`
            }}
          >
            <TableRow data={data[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Error Handling Patterns

### Global Error Boundary
```typescript
// ErrorBoundary.tsx
export class ErrorBoundary extends React.Component<Props, State> {
  state = { hasError: false, error: null };
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to error tracking service
    console.error('Error caught by boundary:', error, errorInfo);
    
    // Send to Sentry, LogRocket, etc.
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.captureException(error, { extra: errorInfo });
    }
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Something went wrong
            </h1>
            <p className="text-gray-600 mb-6">
              We've been notified and are working on a fix.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    
    return this.props.children;
  }
}
```

### API Error Handling
```typescript
// utils/api.ts
export async function apiRequest<T>(
  url: string, 
  options?: RequestInit
): Promise<T> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new APIError(error.message, response.status, error);
    }
    
    return await response.json();
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    
    // Network error or parsing error
    throw new APIError('Network request failed', 0, error);
  }
}

class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public originalError?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// Usage in component
async function handleSubmit(data: FormData) {
  try {
    const result = await apiRequest('/api/orders', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    toast.success('Order created successfully');
  } catch (error) {
    if (error instanceof APIError) {
      if (error.statusCode === 409) {
        toast.error('Order ID already exists');
      } else if (error.statusCode === 403) {
        toast.error('You don\'t have permission to create orders');
      } else {
        toast.error(error.message);
      }
    } else {
      toast.error('An unexpected error occurred');
    }
  }
}
```

## Maintenance Guidelines

### Adding New Components
1. **Create TypeScript interface first**
```typescript
// types/ui.types.ts
export interface NewComponentProps {
  title: string;
  onSave: (data: SomeData) => Promise<void>;
  initialData?: SomeData;
  className?: string;
}
```

2. **Build component with all states**
```typescript
// components/NewComponent.tsx
export function NewComponent({ 
  title, 
  onSave, 
  initialData,
  className 
}: NewComponentProps) {
  // Always handle these states:
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Component logic...
  
  return (
    <div className={className}>
      {loading && <Loader />}
      {error && <ErrorMessage message={error} />}
      {/* Main content */}
    </div>
  );
}
```

3. **Write tests**
```typescript
// __tests__/NewComponent.test.tsx
describe('NewComponent', () => {
  it('renders with initial data', () => {
    render(<NewComponent title="Test" onSave={jest.fn()} />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
  
  it('handles save action', async () => {
    const handleSave = jest.fn();
    render(<NewComponent title="Test" onSave={handleSave} />);
    
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(handleSave).toHaveBeenCalled();
  });
});
```

4. **Document in Storybook** (if using)
```typescript
// NewComponent.stories.tsx
export default {
  title: 'Components/NewComponent',
  component: NewComponent
};

export const Default = {
  args: {
    title: 'Example Title',
    onSave: async (data) => console.log('Saved:', data)
  }
};

export const WithInitialData = {
  args: {
    ...Default.args,
    initialData: { /* ... */ }
  }
};
```

### Modifying Existing Components
1. **Never break existing API contracts**
2. **Add new props as optional with defaults**
3. **Deprecate old props before removing**
4. **Update tests to cover new behavior**
5. **Document changes in component comments**

### Common Pitfalls to Avoid

❌ **Don't:**
- Remove TypeScript types to "make it work"
- Use `any` type
- Inline styles instead of Tailwind classes
- Skip error handling
- Forget loading states
- Break Supabase RLS policies
- Add dependencies without checking bundle size
- Commit console.logs
- Skip accessibility attributes

✅ **Do:**
- Keep components under 300 lines
- Extract repeated logic to hooks
- Use semantic HTML
- Add ARIA labels
- Test on mobile devices
- Profile performance changes
- Write commit messages following conventional commits
- Update documentation

## Deployment Checklist

Before pushing UI/UX changes to production:

```typescript
// Pre-deployment checklist
const DEPLOYMENT_CHECKLIST = [
  // Testing
  '✓ All unit tests passing',
  '✓ Integration tests passing',
  '✓ E2E tests passing',
  '✓ Visual regression tests reviewed',
  '✓ Manual testing on Chrome, Firefox, Safari',
  '✓ Mobile testing on iOS and Android',
  
  // Performance
  '✓ Lighthouse score >90 on all metrics',
  '✓ Bundle size checked (no large increases)',
  '✓ Images optimized',
  '✓ No console errors or warnings',
  
  // Accessibility
  '✓ axe DevTools shows 0 violations',
  '✓ Keyboard navigation works',
  '✓ Screen reader tested',
  '✓ Color contrast validated',
  
  // Code Quality
  '✓ TypeScript errors resolved',
  '✓ ESLint warnings addressed',
  '✓ Code reviewed by peer',
  '✓ No debug code left',
  
  // Documentation
  '✓ Component documentation updated',
  '✓ API changes documented',
  '✓ Breaking changes noted',
  '✓ Migration guide written (if needed)',
  
  // Integration
  '✓ Supabase RLS policies unchanged',
  '✓ API endpoints still functional',
  '✓ Real-time subscriptions working',
  '✓ Feature flags configured'
];
```

## Support & Escalation

### Getting Help
1. **Check this documentation first**
2. **Review component source code comments**
3. **Search closed GitHub issues/PRs**
4. **Ask in team Slack #frontend channel**
5. **Create detailed issue with reproduction steps**

### Reporting Bugs
Include:
- Browser and version
- Device (if mobile)
- Steps to reproduce
- Expected vs actual behavior
- Screenshots/video
- Console errors
- Network requests (if relevant)

### Requesting Features
Include:
- User story ("As a [role], I want [feature] so that [benefit]")
- Mockups or wireframes
- Acceptance criteria
- Priority level
- Technical considerations

---

## Conclusion

This UI/UX enhancement maintains all existing functionality while significantly improving:
- Visual design and consistency
- User experience and workflows
- Performance and responsiveness
- Accessibility compliance
- Code maintainability

All changes are backward-compatible, thoroughly tested, and documented. The system is now positioned for scalable growth with a solid foundation of reusable components and established patterns.

For questions or issues, contact the frontend team lead.
```

---

## FINAL SUMMARY

This comprehensive guide provides a **complete framework** for evaluating, critiquing, and enhancing your SaaS production management system's UI/UX while ensuring:

1. **Zero Breaking Changes** - All integrations (Supabase, Vercel, APIs) remain intact
2. **Thorough Testing** - Multi-layered testing strategy catches issues before deployment
3. **Performance First** - Optimizations and monitoring built-in
4. **Accessibility Compliant** - WCAG 2.1 AA standards met
5. **Scalable Architecture** - Component library and patterns for future growth
6. **Complete Documentation** - Style guide and developer handoff materials

Follow each phase sequentially, never skip testing, and always validate that existing functionality remains operational. The phased rollout strategy minimizes risk while gathering real user feedback.