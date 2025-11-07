# Regulatory Compliance & Semantic Search Implementation Plan

**Created:** 2025-11-06
**Status:** In Progress
**Priority:** CRITICAL - Both features are game-changers for business value

---

## Executive Summary

These two features transform TGF-MRP from an inventory system into a **world-class compliance and intelligence platform** for small agriculture/soil amendment companies.

**Business Impact:**
- **Regulatory Compliance:** Proactive protection against costly compliance violations ($1K-$100K+ fines per state)
- **Competitive Advantage:** Only MRP system with built-in agriculture regulatory expertise
- **Time Savings:** Automated compliance scanning vs. 5-10 hours manual research per product per state
- **Semantic Search:** 90% relevance accuracy vs. 60% with keyword matching = better AI decisions

---

## Part 1: Enhanced Regulatory Compliance Features

### Vision
Help small companies navigate the complex web of state agriculture regulations with AI-powered compliance scanning, ingredient analysis, and automated letter drafting.

### Current State (Tier 1 - Already Implemented)
✅ **Compliance Knowledge Base** (`services/regulatoryCacheService.ts`)
- 90-day cache of regulatory analyses
- Fuzzy matching for similar products
- Reduces API costs by 90%

✅ **Regulatory Scan Modal** (`components/RegulatoryScanModal.tsx`)
- Single-product, single-state compliance scanning
- Watchlist integration (Neem, Kelp, "Organic" claims, Heavy Metals testing)
- AI-powered regulatory research via Gemini

✅ **Letter Drafting** (via AI prompts)
- Template-based letter generation
- Addressed to state agriculture departments

### Gaps & Enhancements Needed

#### 1. Proactive BOM Ingredient Compliance Scanner
**Problem:** Users don't know there's a problem until they try to sell
**Solution:** Automatic scanning of ALL BOMs against watchlist + state regulations

**Features:**
- Background job that scans all BOMs on sync/creation
- Flags ingredients that trigger state regulations
- Dashboard showing compliance status across all products
- Red/Yellow/Green indicators per product per state

**Implementation:**
- New service: `services/proactiveComplianceScanner.ts`
- New component: `components/ComplianceDashboard.tsx`
- Database schema: Add `complianceStatus` field to BOMs table
- Auto-scan on BOM create/update

#### 2. Multi-State Batch Compliance Scanning
**Problem:** Users sell to multiple states, need to check all at once
**Solution:** Batch scan across multiple states with comparison matrix

**Features:**
- Select product(s) + select state(s) = compliance matrix
- Shows which states have issues, which are clear
- Identifies common patterns (e.g., "All West Coast states require X")
- Exports to PDF/CSV for recordkeeping

**Implementation:**
- New modal: `components/BatchComplianceScanModal.tsx`
- Parallel API calls (max 5 concurrent states)
- Matrix view with color-coded cells
- Export functionality

#### 3. Regulatory Insights & Pattern Detection
**Problem:** No visibility into trends or common issues
**Solution:** AI-powered analysis of historical compliance scans

**Features:**
- "Top 5 flagged ingredients across all products"
- "States with most restrictions" ranking
- "Recent regulatory changes detected" alerts
- Predictive warnings: "Your Kelp Meal usage is increasing, consider CA testing"

**Implementation:**
- New service: `services/regulatoryInsights.ts`
- Analyze compliance cache for patterns
- Dashboard widget showing insights
- Monthly email digest (future)

#### 4. Enhanced Letter Drafting
**Problem:** Current letters are generic, need customization
**Solution:** Template library + mail merge + tracking

**Features:**
- Template library (Registration, Clarification, Testing Results, Appeal)
- Mail merge with product data, company info, state-specific contacts
- Draft history tracking
- One-click export to PDF
- Integration with Gmail (future: auto-send)

**Implementation:**
- New component: `components/RegulatoryLetterDrafter.tsx`
- Template storage in localStorage
- PDF export via jsPDF or similar
- Version tracking

#### 5. Ingredient-Level Intelligence
**Problem:** No central database of ingredient compliance knowledge
**Solution:** Build ingredient compliance database from AI research

**Features:**
- Database table: `ingredients` with compliance metadata
- Fields: name, cas_number, regulatory_notes, state_restrictions[]
- Auto-populate from AI scans
- Manual override/editing for corrections
- Reusable across products

**Implementation:**
- New Supabase migration: `ingredients` table
- Service: `services/ingredientComplianceDB.ts`
- Admin UI for editing ingredient data

---

## Part 2: Semantic Search Implementation

### Vision
Replace keyword matching with vector embeddings for 90% relevance accuracy in AI chat.

### Current State
❌ Keyword-based filtering: `smartFilter()` in `geminiService.ts`
- Simple keyword matching
- ~60% relevance accuracy
- Fast but imprecise

### Target State
✅ Vector embeddings + pgvector similarity search
- Semantic understanding of queries
- ~90% relevance accuracy
- <200ms response time (pre-computed embeddings)

### Implementation Plan (Option 2: Pre-computed with pgvector)

#### Step 1: Database Setup (30 min)
**Enable pgvector extension in Supabase:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding columns to existing tables
ALTER TABLE inventory ADD COLUMN embedding vector(768);
ALTER TABLE boms ADD COLUMN embedding vector(768);
ALTER TABLE vendors ADD COLUMN embedding vector(768);

-- Create vector similarity search function
CREATE OR REPLACE FUNCTION match_inventory_items(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  sku text,
  name text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    inventory.sku,
    inventory.name,
    1 - (inventory.embedding <=> query_embedding) as similarity
  FROM inventory
  WHERE 1 - (inventory.embedding <=> query_embedding) > match_threshold
  ORDER BY inventory.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

#### Step 2: Embedding Generation Service (1-2 hours)
**Create:** `services/embeddingService.ts`

**Features:**
- `generateEmbedding(text: string): Promise<number[]>` - Call Gemini Embedding API
- `generateInventoryEmbeddings()` - Batch process all inventory items
- `generateBOMEmbeddings()` - Batch process all BOMs
- `updateItemEmbedding(itemId, text)` - Single item update

**API Used:**
```typescript
const response = await ai.models.embedContent({
  model: 'gemini-embedding-001',
  contents: text,
});
// Returns 768-dimensional vector
```

**Optimization:**
- Batch processing (100 items at a time)
- Rate limiting (60 requests/minute)
- Progress tracking
- Error handling & retry logic

#### Step 3: Semantic Search Service (1 hour)
**Create:** `services/semanticSearch.ts`

**Features:**
- `searchInventory(query: string, limit: number): Promise<InventoryItem[]>`
- `searchBOMs(query: string, limit: number): Promise<BillOfMaterials[]>`
- `searchVendors(query: string, limit: number): Promise<Vendor[]>`

**Implementation:**
1. Generate embedding for user's query
2. Call pgvector similarity function
3. Fetch full records for matching IDs
4. Return sorted by relevance

#### Step 4: Integration with AI Chat (30 min)
**Modify:** `services/geminiService.ts`

Replace `smartFilter()` with semantic search:
```typescript
// Before (Phase 0)
const relevantInventory = smartFilter(inventory, question, 20);

// After (Phase 1.5 + Semantic Search)
const relevantInventory = await searchInventory(question, aiSettings.maxContextItems);
```

#### Step 5: Background Embedding Generation (1 hour)
**Create:** `hooks/useEmbeddingSync.ts`

**Features:**
- Auto-generate embeddings on data sync
- Detect items without embeddings
- Progress indicator in UI
- Manual re-sync button in Settings

**Triggers:**
- After Finale CSV sync completes
- After manual item creation
- On Settings → "Sync Embeddings" button click

---

## Implementation Timeline

### Week 1: Regulatory Enhancements (Priority 1)
**Days 1-2: Proactive BOM Scanner**
- [ ] Create `proactiveComplianceScanner.ts`
- [ ] Add `complianceStatus` to BOM schema
- [ ] Build `ComplianceDashboard.tsx` component
- [ ] Auto-scan on BOM sync

**Day 3: Multi-State Batch Scanning**
- [ ] Create `BatchComplianceScanModal.tsx`
- [ ] Implement parallel state scanning
- [ ] Build compliance matrix view
- [ ] Add PDF/CSV export

**Day 4: Regulatory Insights**
- [ ] Create `regulatoryInsights.ts` service
- [ ] Build pattern detection algorithms
- [ ] Add insights dashboard widget
- [ ] Create top issues summary

**Day 5: Enhanced Letter Drafting**
- [ ] Create `RegulatoryLetterDrafter.tsx`
- [ ] Build template library
- [ ] Add mail merge logic
- [ ] Implement PDF export

### Week 2: Semantic Search (Priority 2)
**Day 1: Database Setup**
- [ ] Enable pgvector in Supabase
- [ ] Add embedding columns
- [ ] Create similarity functions
- [ ] Test vector search performance

**Days 2-3: Embedding Service**
- [ ] Create `embeddingService.ts`
- [ ] Implement Gemini Embedding API calls
- [ ] Build batch processing
- [ ] Add progress tracking

**Day 4: Semantic Search Integration**
- [ ] Create `semanticSearch.ts`
- [ ] Integrate with AI chat
- [ ] Replace `smartFilter()` calls
- [ ] Add fallback to keyword search

**Day 5: Testing & Optimization**
- [ ] Test relevance accuracy (target 90%)
- [ ] Optimize query performance
- [ ] Add background embedding sync
- [ ] Documentation & user guide

---

## Success Metrics

### Regulatory Compliance
- **Coverage:** 100% of BOMs scanned for compliance issues
- **Response Time:** <30 seconds per state scan
- **Accuracy:** 95%+ match with manual regulatory research
- **User Adoption:** 80%+ of users run compliance scans before launch
- **Cost Savings:** $10K+ in avoided fines per year per customer

### Semantic Search
- **Relevance Accuracy:** 90%+ (measured by user satisfaction ratings)
- **Response Time:** <200ms for vector search
- **Token Reduction:** 30%+ additional savings (more precise filtering)
- **User Satisfaction:** 4.5+ star rating for AI chat quality

---

## Technical Architecture

### Regulatory Compliance Flow
```
┌─────────────────┐
│  BOM Created/   │
│    Updated      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│ ProactiveComplianceScanner      │
│ - Extract ingredients from BOM  │
│ - Check against watchlist       │
│ - Scan for regulatory triggers  │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ ComplianceCache (90-day)        │
│ - Check for existing analysis   │
│ - Return cached if match >85%   │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Gemini AI Regulatory Research   │
│ - Search state regulations      │
│ - Identify compliance issues    │
│ - Generate recommendations      │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Update BOM complianceStatus     │
│ - Set red/yellow/green flag     │
│ - Store issues in metadata      │
│ - Trigger dashboard refresh     │
└─────────────────────────────────┘
```

### Semantic Search Flow
```
┌─────────────────┐
│  User Query:    │
│ "low stock kelp"│
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Generate Query Embedding        │
│ Gemini Embedding API            │
│ → [0.23, -0.15, 0.87, ...]     │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ pgvector Similarity Search      │
│ SELECT * FROM inventory         │
│ ORDER BY embedding <=> query    │
│ LIMIT 20                        │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Return Semantically Relevant    │
│ Items to AI Chat                │
│ - Kelp Meal (1 lb) - stock: 80 │
│ - Kelp Extract - stock: 5       │
└─────────────────────────────────┘
```

---

## Cost Analysis

### Regulatory Features
**API Costs (Gemini):**
- Compliance scan: ~5K tokens/scan
- Cost: ~$0.0006 per scan (Flash model)
- With 90-day cache: 90% reduction
- **Estimated:** $5-10/month for 50 products

**Value Created:**
- Avoid 1 compliance fine: $1,000-$100,000
- Time savings: 5-10 hours per product = $500-1,000
- **ROI:** 100x-1000x

### Semantic Search
**API Costs (Gemini Embeddings):**
- Embedding generation: FREE (within limits)
- 768 dimensions, ~2048 token max input
- **Cost:** $0 (free tier covers typical usage)

**Storage Costs (Supabase):**
- pgvector: 768 dimensions × 4 bytes = 3KB per item
- 10,000 items = 30MB
- **Cost:** Negligible (within free tier)

**Value Created:**
- Better AI recommendations = fewer stockouts
- Reduced token usage (30% savings) = $20-50/month
- Improved user experience = higher adoption
- **ROI:** 10x-50x

---

## Risk Mitigation

### Regulatory Compliance Risks
**Risk:** AI provides incorrect regulatory advice → customer gets fined
**Mitigation:**
- Disclaimer: "AI suggestions are not legal advice, consult attorney"
- Source citations: Always show URLs to regulations
- Human review workflow: Flag high-risk items for manual review
- Version tracking: Record all AI outputs for audit trail

**Risk:** Regulatory changes make cached data stale
**Mitigation:**
- 90-day cache expiration
- "Last scanned" timestamp visible to user
- Manual re-scan button
- Quarterly batch re-scan of all products

### Semantic Search Risks
**Risk:** Vector search slower than expected
**Mitigation:**
- HNSW index on embedding column (Supabase default)
- Fallback to keyword search if >500ms
- Pre-compute embeddings (don't generate on-the-fly)

**Risk:** Embedding generation fails mid-batch
**Mitigation:**
- Resume capability (track last processed ID)
- Error logging to Supabase
- Retry logic with exponential backoff
- Manual re-sync UI

---

## Next Steps

**Immediate (Today):**
1. ✅ Create this plan document
2. 🔄 Start with Proactive BOM Compliance Scanner
3. 🔄 Build ComplianceDashboard component

**This Week:**
- Complete all regulatory enhancements
- User testing with real BOMs
- Iterate based on feedback

**Next Week:**
- Implement semantic search
- Performance testing
- Production deployment

---

**Let's build world-class regulatory compliance for small agriculture companies! 🚀**
