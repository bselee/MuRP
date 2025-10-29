Not stuck! Just making sure I get this right for you. Let me adapt everything for **Vercel + Supabase** (and Vercel + Redis/KV as alternatives), with AWS as a future migration path.

---

## **ADAPTED ROADMAP: Vercel/Supabase Edition (AWS-Ready)**

### **Why This Stack Makes Sense**

```
Supabase (Backend-as-a-Service)
✅ PostgreSQL database (production-grade)
✅ Built-in auth
✅ Auto-generated APIs
✅ Real-time subscriptions
✅ Storage for files
✅ Row-level security
✅ Free tier, then scales
✅ Can export and migrate to AWS later

Vercel (Frontend + Serverless Functions)
✅ Next.js optimized
✅ Edge functions
✅ KV store (Redis)
✅ Cron jobs
✅ Preview deployments
✅ Free tier, then scales

Future Migration Path to AWS:
- Supabase data exports to RDS
- Vercel functions → AWS Lambda
- Same code, different infrastructure
```

---

## **Phase 0: Project Setup (Week 0)**

### **Supabase Setup**

**Step 1: Create Supabase Project**

```bash
# Install Supabase CLI
npm install -g supabase

# Initialize project
supabase init

# Link to your Supabase project
supabase link --project-ref your-project-ref

# Generate TypeScript types from your database
supabase gen types typescript --local > types/supabase.ts
```

**Step 2: Database Setup with Migrations**

```sql
-- supabase/migrations/001_initial_schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgcrypto for encryption
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enable audit logging trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Base audit fields (use this pattern for ALL tables)
-- Users table (Supabase Auth integration)
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user', 'viewer')),
    company_name TEXT,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    version INTEGER DEFAULT 1
);

-- Enable Row Level Security (RLS) - CRITICAL for Supabase
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see their own data
CREATE POLICY "Users can view own data"
    ON users FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
    ON users FOR UPDATE
    USING (auth.uid() = id);

-- Trigger for updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Products table
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    category TEXT,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    version INTEGER DEFAULT 1
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Admin and users can view products
CREATE POLICY "Anyone can view products"
    ON products FOR SELECT
    USING (is_deleted = FALSE);

-- Only admins can modify products
CREATE POLICY "Admins can manage products"
    ON products FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes for performance
CREATE INDEX idx_products_sku ON products(sku) WHERE is_deleted = FALSE;
CREATE INDEX idx_products_category ON products(category) WHERE is_deleted = FALSE;
CREATE INDEX idx_products_created_at ON products(created_at DESC);

-- Orders table
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id) NOT NULL,
    
    -- Financial data (NEVER use FLOAT for money!)
    subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
    tax_amount NUMERIC(12, 2) NOT NULL CHECK (tax_amount >= 0),
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
    
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'processing', 'completed', 'cancelled')
    ),
    
    -- Shipping info
    shipping_address JSONB,
    tracking_number TEXT,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    version INTEGER DEFAULT 1,
    
    -- Constraint: total must equal subtotal + tax
    CONSTRAINT orders_totals_match CHECK (total_amount = subtotal + tax_amount)
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Users can only see their own orders
CREATE POLICY "Users can view own orders"
    ON orders FOR SELECT
    USING (auth.uid() = user_id);

-- Admins can see all orders
CREATE POLICY "Admins can view all orders"
    ON orders FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX idx_orders_user ON orders(user_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_orders_status ON orders(status) WHERE is_deleted = FALSE;
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_order_number ON orders(order_number) WHERE is_deleted = FALSE;

-- Order items table
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES products(id) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0),
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_by UUID REFERENCES users(id),
    
    -- Constraint: line_total must equal quantity * unit_price
    CONSTRAINT order_items_total_match CHECK (line_total = quantity * unit_price)
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Users can view order items for their orders
CREATE POLICY "Users can view own order items"
    ON order_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM orders
            WHERE orders.id = order_items.order_id
            AND orders.user_id = auth.uid()
        )
    );

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);
```

**Step 3: Audit Logging Table**

```sql
-- supabase/migrations/002_audit_logging.sql

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],
    user_id UUID REFERENCES auth.users(id),
    user_ip INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Indexes for querying audit logs
CREATE INDEX idx_audit_table_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_action ON audit_logs(action);

-- RLS: Only admins can view audit logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
    ON audit_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    old_data JSONB;
    new_data JSONB;
    changed_fields TEXT[];
    current_user_id UUID;
BEGIN
    -- Get current user from Supabase auth
    current_user_id := auth.uid();
    
    -- Capture old and new data
    IF (TG_OP = 'DELETE') THEN
        old_data = to_jsonb(OLD);
        new_data = NULL;
    ELSIF (TG_OP = 'UPDATE') THEN
        old_data = to_jsonb(OLD);
        new_data = to_jsonb(NEW);
        
        -- Find changed fields
        SELECT array_agg(key)
        INTO changed_fields
        FROM jsonb_each(old_data)
        WHERE old_data->key IS DISTINCT FROM new_data->key;
    ELSIF (TG_OP = 'INSERT') THEN
        old_data = NULL;
        new_data = to_jsonb(NEW);
    END IF;
    
    -- Insert audit record
    INSERT INTO audit_logs (
        table_name,
        record_id,
        action,
        old_values,
        new_values,
        changed_fields,
        user_id,
        timestamp
    ) VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        old_data,
        new_data,
        changed_fields,
        current_user_id,
        NOW()
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit trigger to critical tables
CREATE TRIGGER orders_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON orders
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER products_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON products
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER users_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
```

**Step 4: Status Transition Validation**

```sql
-- supabase/migrations/003_status_transitions.sql

-- Valid order status transitions
CREATE TABLE order_status_transitions (
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    PRIMARY KEY (from_status, to_status)
);

INSERT INTO order_status_transitions (from_status, to_status) VALUES
    ('pending', 'processing'),
    ('pending', 'cancelled'),
    ('processing', 'completed'),
    ('processing', 'cancelled');

-- Trigger to enforce valid status transitions
CREATE OR REPLACE FUNCTION validate_order_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS NOT NULL AND NEW.status != OLD.status THEN
        IF NOT EXISTS (
            SELECT 1 FROM order_status_transitions
            WHERE from_status = OLD.status AND to_status = NEW.status
        ) THEN
            RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_order_status_transition
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION validate_order_status_transition();
```

**Run Migrations:**

```bash
# Apply migrations locally
supabase db reset

# Push to remote Supabase project
supabase db push

# Generate fresh TypeScript types
supabase gen types typescript --project-id your-project-ref > types/supabase.ts
```

---

## **Vercel Setup**

### **Project Structure**

```
your-app/
├── .env.local                 # Local environment variables
├── .env.production           # Production variables (use Vercel dashboard)
├── app/                      # Next.js 13+ app directory
│   ├── api/                  # API routes (serverless functions)
│   ├── (auth)/              # Auth routes
│   ├── (dashboard)/         # Dashboard routes
│   └── layout.tsx
├── components/
├── lib/
│   ├── supabase/
│   │   ├── client.ts        # Client-side Supabase
│   │   ├── server.ts        # Server-side Supabase
│   │   └── middleware.ts    # Auth middleware
│   ├── redis.ts             # Vercel KV client
│   └── types.ts
├── supabase/
│   ├── migrations/          # Database migrations
│   ├── functions/           # Edge functions (optional)
│   └── config.toml
├── types/
│   └── supabase.ts          # Auto-generated types
└── vercel.json              # Vercel configuration
```

### **Environment Variables**

```bash
# .env.local (for local development)

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Vercel KV (Redis)
KV_REST_API_URL=https://your-kv-url.kv.vercel-storage.com
KV_REST_API_TOKEN=your-kv-token
KV_REST_API_READ_ONLY_TOKEN=your-readonly-token

# App Config
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

**Vercel Dashboard Setup:**
1. Go to Vercel project settings
2. Add environment variables
3. Check "Production", "Preview", and "Development" as needed
4. Vercel KV can be added via "Storage" tab

---

## **Supabase Client Setup**

```typescript
// lib/supabase/client.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
)

// Server-side client (for API routes)
// lib/supabase/server.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

export const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// For server components and API routes with user context
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

export async function createServerSupabaseClient() {
  const cookieStore = cookies()
  
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )
}
```

---

## **Vercel KV (Redis) Setup**

```typescript
// lib/redis.ts
import { kv } from '@vercel/kv'

export class CacheService {
  // Cache a value with TTL (time to live in seconds)
  async set(key: string, value: any, ttl: number = 3600) {
    try {
      await kv.set(key, value, { ex: ttl })
    } catch (error) {
      console.error('Redis set error:', error)
      // Don't throw - cache failures shouldn't break the app
    }
  }
  
  // Get a cached value
  async get<T>(key: string): Promise<T | null> {
    try {
      return await kv.get<T>(key)
    } catch (error) {
      console.error('Redis get error:', error)
      return null
    }
  }
  
  // Delete a cached value
  async del(key: string) {
    try {
      await kv.del(key)
    } catch (error) {
      console.error('Redis del error:', error)
    }
  }
  
  // Cache with automatic refresh
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = 3600
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key)
    if (cached !== null) {
      return cached
    }
    
    // Fetch fresh data
    const fresh = await fetchFn()
    
    // Cache it
    await this.set(key, fresh, ttl)
    
    return fresh
  }
  
  // Invalidate multiple keys by pattern
  async invalidatePattern(pattern: string) {
    try {
      const keys = await kv.keys(pattern)
      if (keys.length > 0) {
        await kv.del(...keys)
      }
    } catch (error) {
      console.error('Redis invalidate pattern error:', error)
    }
  }
}

export const cache = new CacheService()

// Usage examples:
// await cache.set('user:123', userData, 3600) // 1 hour
// const user = await cache.get('user:123')
// await cache.del('user:123')
// await cache.invalidatePattern('user:*')
```

---

## **API Route Example (Serverless Function)**

```typescript
// app/api/orders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { cache } from '@/lib/redis'

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  
  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }
  
  // Try cache first
  const cacheKey = `orders:user:${user.id}`
  const cachedOrders = await cache.get(cacheKey)
  
  if (cachedOrders) {
    return NextResponse.json({
      data: cachedOrders,
      cached: true
    })
  }
  
  // Fetch from database (RLS automatically filters to user's orders)
  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (
        *,
        products (*)
      )
    `)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Database error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    )
  }
  
  // Cache for 5 minutes
  await cache.set(cacheKey, orders, 300)
  
  return NextResponse.json({
    data: orders,
    cached: false
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  
  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }
  
  const body = await request.json()
  
  // Validate input
  if (!body.items || body.items.length === 0) {
    return NextResponse.json(
      { error: 'Order must contain items' },
      { status: 400 }
    )
  }
  
  // Use Supabase RPC for complex transaction
  const { data: order, error } = await supabase
    .rpc('create_order', {
      p_user_id: user.id,
      p_items: body.items,
      p_shipping_address: body.shippingAddress
    })
  
  if (error) {
    console.error('Order creation error:', error)
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    )
  }
  
  // Invalidate user's orders cache
  await cache.invalidatePattern(`orders:user:${user.id}`)
  
  return NextResponse.json({ data: order }, { status: 201 })
}
```

---

## **Database Functions (Stored Procedures)**

```sql
-- supabase/migrations/004_order_functions.sql

-- Create order with transaction safety
CREATE OR REPLACE FUNCTION create_order(
    p_user_id UUID,
    p_items JSONB,
    p_shipping_address JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_id UUID;
    v_order_number TEXT;
    v_subtotal NUMERIC(12, 2) := 0;
    v_tax_amount NUMERIC(12, 2) := 0;
    v_total_amount NUMERIC(12, 2) := 0;
    v_item JSONB;
    v_product RECORD;
    v_line_total NUMERIC(12, 2);
    v_result JSONB;
BEGIN
    -- Generate unique order number
    v_order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(NEXTVAL('order_number_seq')::TEXT, 6, '0');
    
    -- Calculate totals and validate inventory
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Get product with row lock
        SELECT * INTO v_product
        FROM products
        WHERE id = (v_item->>'product_id')::UUID
        AND is_deleted = FALSE
        FOR UPDATE;
        
        IF v_product IS NULL THEN
            RAISE EXCEPTION 'Product not found: %', v_item->>'product_id';
        END IF;
        
        -- Check inventory
        IF v_product.stock_quantity < (v_item->>'quantity')::INTEGER THEN
            RAISE EXCEPTION 'Insufficient stock for product: % (available: %, requested: %)',
                v_product.name, v_product.stock_quantity, v_item->>'quantity';
        END IF;
        
        -- Calculate line total
        v_line_total := v_product.price * (v_item->>'quantity')::INTEGER;
        v_subtotal := v_subtotal + v_line_total;
        
        -- Decrement inventory
        UPDATE products
        SET stock_quantity = stock_quantity - (v_item->>'quantity')::INTEGER,
            updated_at = NOW(),
            updated_by = p_user_id,
            version = version + 1
        WHERE id = v_product.id;
    END LOOP;
    
    -- Calculate tax (example: 10%)
    v_tax_amount := ROUND(v_subtotal * 0.10, 2);
    v_total_amount := v_subtotal + v_tax_amount;
    
    -- Create order
    INSERT INTO orders (
        order_number,
        user_id,
        subtotal,
        tax_amount,
        total_amount,
        status,
        shipping_address,
        created_by,
        updated_by
    ) VALUES (
        v_order_number,
        p_user_id,
        v_subtotal,
        v_tax_amount,
        v_total_amount,
        'pending',
        p_shipping_address,
        p_user_id,
        p_user_id
    )
    RETURNING id INTO v_order_id;
    
    -- Create order items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT * INTO v_product
        FROM products
        WHERE id = (v_item->>'product_id')::UUID;
        
        v_line_total := v_product.price * (v_item->>'quantity')::INTEGER;
        
        INSERT INTO order_items (
            order_id,
            product_id,
            quantity,
            unit_price,
            line_total,
            created_by
        ) VALUES (
            v_order_id,
            v_product.id,
            (v_item->>'quantity')::INTEGER,
            v_product.price,
            v_line_total,
            p_user_id
        );
    END LOOP;
    
    -- Return order details
    SELECT jsonb_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'total_amount', o.total_amount,
        'status', o.status,
        'created_at', o.created_at
    ) INTO v_result
    FROM orders o
    WHERE o.id = v_order_id;
    
    RETURN v_result;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log error
        RAISE NOTICE 'Order creation failed: %', SQLERRM;
        RAISE;
END;
$$;

-- Create sequence for order numbers
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;
```

---

## **AUTONOMOUS DATA PRACTICES (Supabase Edition)**

### **1. Automated Backups**

**Supabase Built-in:**
- Daily automated backups (included in paid plans)
- Point-in-time recovery (PITR) available
- Can download backups manually from dashboard

**Additional Backup Script (Vercel Cron):**

```typescript
// app/api/cron/backup/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

// This endpoint will be called by Vercel Cron
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    // Export critical data
    const tables = ['orders', 'products', 'users', 'audit_logs']
    const backupData: any = {}
    
    for (const table of tables) {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select('*')
      
      if (error) throw error
      backupData[table] = data
    }
    
    // Save to S3 (or Vercel Blob Storage)
    const timestamp = new Date().toISOString()
    const filename = `backup-${timestamp}.json`
    
    // Option 1: Save to S3
    const s3 = new S3Client({ region: 'us-east-1' })
    await s3.send(new PutObjectCommand({
      Bucket: 'your-backup-bucket',
      Key: `supabase-backups/${filename}`,
      Body: JSON.stringify(backupData),
      ServerSideEncryption: 'AES256'
    }))
    
    // Option 2: Save to Vercel Blob (simpler)
    // import { put } from '@vercel/blob'
    // await put(filename, JSON.stringify(backupData), {
    //   access: 'private',
    //   addRandomSuffix: false
    // })
    
    return NextResponse.json({ 
      success: true, 
      message: `Backup created: ${filename}` 
    })
    
  } catch (error) {
    console.error('Backup failed:', error)
    
    // Send alert (using your notification service)
    // await sendAlert('Backup failed', error.message)
    
    return NextResponse.json(
      { error: 'Backup failed' },
      { status: 500 }
    )
  }
}
```

**Configure Vercel Cron:**

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/backup",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/cron/health-check",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/cleanup-old-data",
      "schedule": "0 3 * * 0"
    }
  ]
}
```

---

### **2. Monitoring & Alerting**

```typescript
// app/api/cron/health-check/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { kv } from '@vercel/kv'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const health: any = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    checks: {}
  }
  
  // Check database
  try {
    const start = Date.now()
    const { error } = await supabaseAdmin
      .from('users')
      .select('count')
      .limit(1)
      .single()
    
    if (error) throw error
    
    health.checks.database = {
      status: 'healthy',
      responseTime: Date.now() - start
    }
  } catch (error) {
    health.status = 'unhealthy'
    health.checks.database = {
      status: 'unhealthy',
      error: error.message
    }
  }
  
  // Check Redis
  try {
    const start = Date.now()
    await kv.ping()
    health.checks.redis = {
      status: 'healthy',
      responseTime: Date.now() - start
    }
  } catch (error) {
    health.status = 'degraded'
    health.checks.redis = {
      status: 'unhealthy',
      error: error.message
    }
  }
  
  // Check API response time
  try {
    const start = Date.now()
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/health`)
    health.checks.api = {
      status: response.ok ? 'healthy' : 'unhealthy',
      responseTime: Date.now() - start,
      statusCode: response.status
    }
  } catch (error) {
    health.status = 'unhealthy'
    health.checks.api = {
      status: 'unhealthy',
      error: error.message
    }
  }
  
  // Alert if unhealthy
  if (health.status === 'unhealthy') {
    await sendAlert('System Health Alert', JSON.stringify(health, null, 2))
  }
  
  return NextResponse.json(health)
}

async function sendAlert(subject: string, message: string) {
  // Option 1: Send email via Resend
  // const resend = new Resend(process.env.RESEND_API_KEY)
  // await resend.emails.send({
  //   from: 'alerts@yourapp.com',
  //   to: 'ops@yourapp.com',
  //   subject,
  //   text: message
  // })
  
  // Option 2: Send to Slack
  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `🚨 ${subject}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${subject}*\n\`\`\`${message}\`\`\``
          }
        }
      ]
    })
  })
  
  // Option 3: Send SMS via Twilio
  // const twilio = require('twilio')(
  //   process.env.TWILIO_ACCOUNT_SID,
  //   process.env.TWILIO_AUTH_TOKEN
  // )
  // await twilio.messages.create({
  //   body: `${subject}: ${message}`,
  //   from: process.env.TWILIO_PHONE_NUMBER,
  //   to: process.env.ALERT_PHONE_NUMBER
  // })
}
```

---

### **3. Analytics & Logging**

**Vercel Analytics:**

```typescript
// app/layout.tsx
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
```

**Custom Event Tracking:**

```typescript
// lib/analytics.ts
import { track } from '@vercel/analytics'

export const analytics = {
  trackOrderCreated: (orderId: string, amount: number) => {
    track('order_created', { orderId, amount })
  },
  
  trackPaymentFailed: (reason: string) => {
    track('payment_failed', { reason })
  },
  
  trackProductViewed: (productId: string) => {
    track('product_viewed', { productId })
  }
}

// Usage:
// analytics.trackOrderCreated(order.id, order.total_amount)
```

**Structured Logging:**

```typescript
// lib/logger.ts
export const logger = {
  info: (message: string, meta?: any) => {
    console.log(JSON.stringify({
      level: 'info',
      message,
      timestamp: new Date().toISOString(),
      ...meta
    }))
  },
  
  error: (message: string, error: Error, meta?: any) => {
    console.error(JSON.stringify({
      level: 'error',
      message,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      timestamp: new Date().toISOString(),
      ...meta
    }))
  },
  
  warn: (message: string, meta?: any) => {
    console.warn(JSON.stringify({
      level: 'warn',
      message,
      timestamp: new Date().toISOString(),
      ...meta
    }))
  }
}
```

---

### **4. Migration to AWS (Future)**

**Export Data from Supabase:**

```bash
# Export schema
pg_dump -h db.your-project.supabase.co \
  -U postgres \
  -d postgres \
  --schema-only \
  > schema.sql

# Export data
pg_dump -h db.your-project.supabase.co \
  -U postgres \
  -d postgres \
  --data-only \
  --column-inserts \
  > data.sql
```

**Import to AWS RDS:**

```bash
# Import schema
psql -h your-rds-instance.amazonaws.com \
  -U postgres \
  -d your_database \
  < schema.sql

# Import data
psql -h your-rds-instance.amazonaws.com \
  -U postgres \
  -d your_database \
  < data.sql
```

**Update Connection Strings:**

```typescript
// Just update environment variables:
// NEXT_PUBLIC_SUPABASE_URL → DATABASE_URL (AWS RDS)
// Update API clients to use direct PostgreSQL client

// lib/db.ts (AWS version)
import { Pool } from 'pg'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})
```

---

## **Complete Deployment Checklist**

```markdown
## Pre-Launch Checklist

### Database (Supabase)
- [ ] All migrations applied
- [ ] RLS policies configured and tested
- [ ] Audit logging enabled
- [ ] Indexes created for performance
- [ ] Backup schedule configured

### Application (Vercel)
- [ ] Environment variables set
- [ ] API routes tested
- [ ] Authentication flow working
- [ ] Error handling implemented
- [ ] Rate limiting configured

### Monitoring
- [ ] Health check endpoints created
- [ ] Cron jobs configured
- [ ] Alert recipients configured
- [ ] Analytics installed

### Security
- [ ] HTTPS enforced
- [ ] CORS configured properly
- [ ] API keys rotated
- [ ] RLS tested thoroughly
- [ ] SQL injection prevention verified

### Data Integrity
- [ ] Transaction handling tested
- [ ] Audit logs working
- [ ] Status transitions validated
- [ ] Financial calculations verified
- [ ] Inventory management tested

### Performance
- [ ] Database queries optimized
- [ ] Caching strategy implemented
- [ ] Images optimized
- [ ] Bundle size checked
- [ ] Load testing completed
```

---

Want me to add anything specific like authentication flows, payment integration (Stripe), email notifications (Resend), or specific business logic for your purchasing/logistics use case?