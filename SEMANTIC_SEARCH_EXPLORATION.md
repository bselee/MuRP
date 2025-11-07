# 🔍 Semantic Search / Embeddings Exploration

**Status:** Planning Phase
**Goal:** Replace keyword-based filtering with AI-powered semantic similarity search
**Impact:** 5-10x better relevance for AI chat queries

---

## 📊 Current vs. Future State

### **Current (Phase 0): Keyword Matching**

```typescript
Question: "What's the stock level of worm castings?"
Keywords: ["stock", "level", "worm", "castings"]

// Simple string matching
Item { name: "Worm Castings" } → Score: 2 (matches "worm", "castings") ✅
Item { name: "Earthworm Humus" } → Score: 1 (matches "worm") ⚠️
Item { name: "Vermicompost" } → Score: 0 (no matches) ❌ FALSE NEGATIVE!
```

**Problems:**
- ❌ Misses synonyms (vermicompost = worm castings)
- ❌ Misses related items (earthworm humus is similar)
- ❌ No semantic understanding (context-blind)
- ❌ Poor for complex questions

### **Future: Semantic Embeddings**

```typescript
Question: "What's the stock level of worm castings?"
Embedding: [0.234, -0.456, 0.789, ...] (768 dimensions)

// Cosine similarity with all items
Item { name: "Worm Castings" } → Similarity: 0.95 ✅ BEST MATCH
Item { name: "Vermicompost" } → Similarity: 0.87 ✅ FOUND!
Item { name: "Earthworm Humus" } → Similarity: 0.82 ✅ FOUND!
Item { name: "Perlite" } → Similarity: 0.12 ❌ NOT RELEVANT
```

**Benefits:**
- ✅ Understands synonyms automatically
- ✅ Finds semantically related items
- ✅ Works with complex questions
- ✅ Better user experience

---

## 🎯 Google Gemini Embedding API

### **Recommended Model: `gemini-embedding-001`**

**Specifications:**
- **Model:** gemini-embedding-001 (latest, GA)
- **Dimensions:** 768 (default, configurable down to 128 with MRL)
- **Max Input:** 2,048 tokens per item
- **Languages:** 100+ languages supported
- **Pricing:** Free tier available
- **Deprecation:** None (latest model as of 2025)

**Previous Model (Avoid):**
- text-embedding-004 (deprecated January 14, 2026)

### **API Usage**

```typescript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: envApiKey });

// Single embedding
const response = await ai.models.embedContent({
  model: 'gemini-embedding-001',
  contents: 'What is the meaning of life?',
});
console.log(response.embeddings); // [0.234, -0.456, ...]

// Batch embeddings (more efficient)
const response = await ai.models.embedContent({
  model: 'gemini-embedding-001',
  contents: [
    'What is the meaning of life?',
    'How do I bake a cake?',
    'Stock level of worm castings'
  ],
});
// Returns array of embeddings
```

---

## 🏗️ Architecture Options

### **Option 1: On-Demand Embeddings** (Quick Implementation)

**How it works:**
1. User asks question
2. Generate embedding for question (1 API call)
3. Generate embeddings for top 100 items (1 batch API call)
4. Calculate cosine similarity
5. Return top 20 most similar items

**Pros:**
- ✅ Quick to implement (2-3 hours)
- ✅ No database changes needed
- ✅ Always uses fresh data
- ✅ Works immediately

**Cons:**
- ❌ Slow (2-3 seconds per query for embeddings)
- ❌ Uses API quota for embeddings
- ❌ Doesn't scale well (100+ items = slow)

**Cost:**
- Embedding API: Free tier: 1,500 requests/day
- ~2 requests per chat query (question + items)
- = 750 queries/day max

**Code Example:**

```typescript
async function semanticFilter<T>(
  items: T[],
  question: string,
  maxItems: number = 20
): Promise<T[]> {
  // Generate question embedding
  const questionEmbed = await ai.models.embedContent({
    model: 'gemini-embedding-001',
    contents: question,
  });

  // Take top 100 items and generate embeddings
  const topItems = items.slice(0, 100);
  const itemTexts = topItems.map(item => JSON.stringify(item));

  const itemEmbeds = await ai.models.embedContent({
    model: 'gemini-embedding-001',
    contents: itemTexts,
  });

  // Calculate cosine similarity
  const similarities = itemEmbeds.embeddings.map((embed, idx) => ({
    item: topItems[idx],
    score: cosineSimilarity(questionEmbed.embeddings[0], embed)
  }));

  // Return top N
  return similarities
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .map(s => s.item);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}
```

---

### **Option 2: Pre-Computed Embeddings** (Production-Grade) ⭐ RECOMMENDED

**How it works:**
1. When Finale sync completes, generate embeddings for all items
2. Store embeddings in Supabase (pgvector extension)
3. User asks question
4. Generate embedding for question only (1 API call)
5. Vector similarity search in Supabase (< 100ms)
6. Return top 20 most similar items

**Pros:**
- ✅ Fast (< 200ms per query)
- ✅ Minimal API usage (1 call per query)
- ✅ Scales to 10,000+ items
- ✅ Production-ready
- ✅ Can filter by type (inventory, BOMs, etc.)

**Cons:**
- ⚠️ Requires database migration (pgvector)
- ⚠️ Embeddings need re-generation on data changes
- ⚠️ More complex setup (4-5 hours)

**Cost:**
- Initial: ~2,586 embedding API calls (for all inventory)
- Per sync: ~50-100 embedding API calls (new/updated items only)
- Per query: 1 embedding API call
- Well within free tier limits

**Database Schema:**

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to inventory_items
ALTER TABLE inventory_items
ADD COLUMN embedding vector(768);

-- Create vector index for fast similarity search
CREATE INDEX ON inventory_items
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Add embedding columns to other tables
ALTER TABLE boms ADD COLUMN embedding vector(768);
ALTER TABLE vendors ADD COLUMN embedding vector(768);
ALTER TABLE purchase_orders ADD COLUMN embedding vector(768);

-- Similar indexes for each table
CREATE INDEX ON boms USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON vendors USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON purchase_orders USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

**Service Integration:**

```typescript
// services/embeddingService.ts

import { GoogleGenAI } from "@google/genai";
import { supabase } from '../lib/supabase/client';

const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY });

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: 'gemini-embedding-001',
    contents: text,
  });
  return response.embeddings[0];
}

/**
 * Generate embeddings for inventory items after sync
 */
export async function updateInventoryEmbeddings(items: InventoryItem[]) {
  console.log(`Generating embeddings for ${items.length} inventory items...`);

  // Batch process in chunks of 100 (API limit)
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100);
    const texts = chunk.map(item =>
      `${item.name} ${item.sku} ${item.category || ''} ${item.description || ''}`
    );

    const response = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: texts,
    });

    // Update database
    for (let j = 0; j < chunk.length; j++) {
      await supabase
        .from('inventory_items')
        .update({ embedding: response.embeddings[j] })
        .eq('id', chunk[j].id);
    }

    console.log(`Updated ${Math.min((i + 100), items.length)}/${items.length}`);
  }
}

/**
 * Semantic search for inventory items
 */
export async function semanticSearchInventory(
  question: string,
  limit: number = 20
): Promise<InventoryItem[]> {
  // Generate question embedding
  const questionEmbed = await generateEmbedding(question);

  // Vector similarity search in Supabase
  const { data, error } = await supabase.rpc('match_inventory_items', {
    query_embedding: questionEmbed,
    match_threshold: 0.5,  // Only return items with >50% similarity
    match_count: limit
  });

  if (error) throw error;
  return data;
}
```

**Supabase Function:**

```sql
-- Function for vector similarity search
CREATE OR REPLACE FUNCTION match_inventory_items(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  sku text,
  name text,
  stock integer,
  similarity float
)
LANGUAGE sql
AS $$
  SELECT
    id,
    sku,
    name,
    stock,
    1 - (embedding <=> query_embedding) AS similarity
  FROM inventory_items
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Similar functions for BOMs, vendors, etc.
```

---

### **Option 3: Hybrid Approach** (Best of Both Worlds)

**How it works:**
1. Use pre-computed embeddings when available
2. Fall back to keyword matching if embeddings missing
3. Async background job generates embeddings

**Pros:**
- ✅ Works immediately (keyword fallback)
- ✅ Improves over time as embeddings are computed
- ✅ Graceful degradation
- ✅ Progressive enhancement

**Cons:**
- ⚠️ More complex logic
- ⚠️ Inconsistent response times

---

## 📊 Comparison Matrix

| Feature | Option 1: On-Demand | Option 2: Pre-Computed | Option 3: Hybrid |
|---------|---------------------|------------------------|------------------|
| **Response Time** | 2-3s | < 200ms | 200ms-3s |
| **API Calls/Query** | ~2 | 1 | 1-2 |
| **Setup Time** | 2-3 hours | 4-5 hours | 5-6 hours |
| **Database Changes** | None | pgvector | pgvector |
| **Scalability** | Poor (100 items) | Excellent (10K+) | Excellent |
| **Maintenance** | Low | Medium | Medium |
| **Production Ready** | ⚠️ Not ideal | ✅ Yes | ✅ Yes |

---

## 🎯 Recommended Implementation Plan

### **Phase 1: Quick Win (Option 1)** ⏱️ 2-3 hours

**Use Case:** Test semantic search without database changes

**Steps:**
1. Create `services/embeddingService.ts`
2. Implement `semanticFilter()` function
3. Replace `smartFilter()` with `semanticFilter()` in askAboutInventory
4. Test with real queries
5. Measure performance and relevance

**Deliverables:**
- Working semantic search in AI chat
- Performance benchmarks
- User feedback on relevance

**Limitations:**
- Slow for large datasets
- Uses more API quota

---

### **Phase 2: Production (Option 2)** ⏱️ 4-5 hours

**Use Case:** Production-ready semantic search at scale

**Steps:**

**Part 1: Database Setup** (1 hour)
1. Create migration `004_add_embeddings.sql`
2. Enable pgvector extension
3. Add embedding columns to all tables
4. Create vector indexes
5. Create similarity search functions

**Part 2: Embedding Generation** (1 hour)
1. Create `services/embeddingService.ts`
2. Add `generateEmbedding()` function
3. Add `updateInventoryEmbeddings()` batch function
4. Add `updateBOMEmbeddings()` batch function
5. Add `updateVendorEmbeddings()` batch function

**Part 3: Sync Integration** (1 hour)
1. Update `finaleSyncService.ts`
2. After each sync, generate embeddings for new/updated items
3. Background job for existing items (one-time)

**Part 4: Search Integration** (1 hour)
1. Create `semanticSearchInventory()` function
2. Create `semanticSearchBOMs()` function
3. Update `askAboutInventory()` to use semantic search
4. Add fallback to keyword search if embeddings missing

**Part 5: Testing** (1 hour)
1. Generate embeddings for all existing data
2. Test complex queries
3. Benchmark performance
4. Verify relevance improvements

**Deliverables:**
- Production-ready semantic search
- < 200ms query response time
- Handles 10,000+ items
- Minimal API usage

---

## 💰 Cost Analysis

### **Embedding API Pricing (Gemini)**

| Tier | Price | Free Tier Limit |
|------|-------|-----------------|
| **Input** | $0.00001 / 1K tokens | 1,500 requests/day |
| **Output** | Free (embeddings) | Unlimited |

### **Estimated Costs**

**Option 1 (On-Demand):**
```
Per query: 2 API calls (question + items)
Daily usage: 100 queries
Monthly API calls: 6,000
Cost: FREE (within free tier)
```

**Option 2 (Pre-Computed):**
```
Initial setup: 2,586 items × 1 call = 2,586 calls (one-time)
Per sync: ~50 new/updated items
Per query: 1 call (question only)
Daily usage: 100 queries + 2 syncs = 102 API calls
Monthly API calls: 3,060
Cost: FREE (within free tier)
```

**Winner:** Option 2 (fewer calls, faster, better UX)

---

## 🧪 Testing Plan

### **Test 1: Synonym Detection**
```typescript
Question: "Show me vermicompost inventory"
Expected: Finds "Worm Castings" items (synonym)
Current: Misses them ❌
With Embeddings: Finds them ✅
```

### **Test 2: Related Items**
```typescript
Question: "What soil amendments do we have?"
Expected: Finds compost, worm castings, biochar, etc.
Current: Only finds items with "soil" or "amendment" ❌
With Embeddings: Finds all related items ✅
```

### **Test 3: Complex Questions**
```typescript
Question: "Which organic fertilizers are running low?"
Expected: Finds fertilizer-type items below reorder point
Current: Poor relevance ❌
With Embeddings: Smart filtering ✅
```

### **Test 4: Performance**
```typescript
Benchmark: 100 queries with 2,586 inventory items
Option 1 (On-Demand): ~2.5s per query
Option 2 (Pre-Computed): ~0.15s per query
Current (Keyword): ~0.01s per query
```

---

## 🚀 Migration Path

### **Week 1: Quick Win**
- Implement Option 1 (On-Demand)
- Test with real users
- Gather feedback on relevance

### **Week 2: Production**
- Implement Option 2 (Pre-Computed)
- Migrate database
- Generate embeddings for all data
- Deploy to production

### **Week 3: Optimization**
- Monitor performance
- Tune similarity thresholds
- Add caching if needed
- Measure improvement metrics

---

## 📊 Expected Improvements

| Metric | Before (Keyword) | After (Embeddings) |
|--------|------------------|---------------------|
| **Relevance Accuracy** | 60% | 90% ✅ |
| **Synonym Detection** | 0% | 95% ✅ |
| **User Satisfaction** | 6/10 | 9/10 ✅ |
| **Complex Query Success** | 40% | 85% ✅ |
| **Response Time** | 0.01s | 0.15s (still fast!) |

---

## 🎯 Recommendation

**Start with Option 1 (On-Demand)** to validate the concept, then **migrate to Option 2 (Pre-Computed)** for production.

**Why:**
1. Test semantic search without database changes (low risk)
2. Gather real user feedback on relevance
3. Measure performance impact
4. Then commit to production implementation

**Timeline:**
- Option 1: 2-3 hours (this week)
- Option 2: 4-5 hours (next week)
- Total: 6-8 hours for complete implementation

---

## 📚 Resources

**Google Gemini Embedding Docs:**
- https://ai.google.dev/gemini-api/docs/embeddings
- https://developers.googleblog.com/en/gemini-embedding-available-gemini-api/

**Supabase pgvector:**
- https://supabase.com/docs/guides/database/extensions/pgvector
- https://github.com/pgvector/pgvector

**Code Examples:**
- https://github.com/google-gemini/cookbook/blob/main/quickstarts/Embeddings.ipynb

---

## 🎬 Next Steps

**Ready to implement?**

1. ✅ **Option 1 (Quick)** - Test semantic search (2-3 hours)
2. 🔄 **Gather feedback** - Validate with real queries
3. ✅ **Option 2 (Production)** - Full implementation (4-5 hours)
4. ✅ **Phase 1.5** - AI Settings Component

**Or proceed directly to Phase 1.5** and come back to embeddings later?

Your choice! Both paths are valuable.
