# MuRP Agentic Architecture

## Overview

This document describes the transformation of MuRP from a **Database Interface** to an **Agentic Workspace** where AI actively makes decisions about which tools to use and how to help manage the supply chain.

## The Problem

### Before (Manual Routing)

The original architecture in `services/mcpService.ts` used manual keyword matching:

```typescript
// ❌ OLD WAY: Manual if/else routing
export async function routeComplianceQuestion(userId, question, context) {
  const lowerQuestion = question.toLowerCase();

  if (lowerQuestion.includes('check') || lowerQuestion.includes('compliant')) {
    // Call check tool
  } else if (lowerQuestion.includes('extract') || lowerQuestion.includes('ocr')) {
    // Call extract tool
  }
  // ... more if/else chains
}
```

**Problems:**
1. ❌ Brittle keyword matching
2. ❌ Can't handle complex queries
3. ❌ No multi-tool orchestration
4. ❌ Returns stringified JSON instead of structured data
5. ❌ No reasoning - just pattern matching

### After (Agentic Routing)

The new architecture uses Vercel AI SDK's tool calling:

```typescript
// ✅ NEW WAY: AI decides which tools to use
const response = await askAgent({
  prompt: "Check if our Product X label is compliant with CA and CO laws",
  userId: "user_123"
});

// AI automatically:
// 1. Understands intent
// 2. Calls check_label_compliance tool
// 3. Synthesizes results
// 4. Returns structured JSON + natural language summary
```

**Benefits:**
1. ✅ AI understands intent
2. ✅ Handles complex multi-step tasks
3. ✅ Can call multiple tools in sequence
4. ✅ Returns structured JSON for UI components
5. ✅ Natural language + structured data

---

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           User Prompt                                    │
│  "Check if our Product X label is compliant with CA and CO laws"        │
└────────────────────────────────┬────────────────────────────────────────┘
                                  │
                        ┌─────────▼─────────┐
                        │  Frontend         │
                        │  agentService.ts  │
                        └─────────┬─────────┘
                                  │ HTTP POST /api/agent
                        ┌─────────▼─────────┐
                        │  Backend          │
                        │  api/agent.ts     │
                        └─────────┬─────────┘
                                  │
                   ┌──────────────┼──────────────┐
                   │              │              │
             ┌─────▼─────┐  ┌────▼────┐  ┌─────▼─────┐
             │ AI Model  │  │  Tools  │  │ Reasoning │
             │ (Claude)  │  │Available│  │   Loop    │
             └─────┬─────┘  └────┬────┘  └─────┬─────┘
                   │              │              │
                   └──────────────┼──────────────┘
                                  │
                        AI Decides to Call:
                        1. check_label_compliance
                        2. get_regulation_changes (if needed)
                                  │
                        ┌─────────▼─────────┐
                        │  Structured JSON  │
                        │  + NL Summary     │
                        └─────────┬─────────┘
                                  │
                        ┌─────────▼─────────┐
                        │  UI Components    │
                        │  • ComplianceRiskCard
                        │  • BuildShortageTable
                        │  • ConsolidationCard
                        └───────────────────┘
```

---

## Components

### 1. Backend: `/api/agent.ts`

**Purpose:** Agentic API endpoint that binds MCP tools to AI

**Key Features:**
- Exposes all MCP tools as AI-callable functions using Vercel AI SDK
- Uses `tool()` from `ai` package with Zod schemas
- Supports multi-step reasoning (AI can call multiple tools)
- Returns structured JSON + natural language summary

**Available Tools:**
1. `check_label_compliance` - Verify product labels against regulations
2. `search_state_regulations` - Find specific regulations
3. `get_regulation_changes` - Monitor regulation updates
4. `detect_inventory_anomalies` - Find unusual inventory patterns
5. `find_consolidation_opportunities` - Optimize POs
6. `parse_vendor_email` - Extract tracking info
7. `analyze_bom_buildability` - Check if build is feasible

**Example:**
```typescript
// AI Gateway call with tools
const result = await generateText({
  model: gateway(modelId),
  system: systemPrompt,
  prompt: userPrompt,
  tools, // All tools available to AI
  maxSteps: 5, // Allow multi-step reasoning
});
```

### 2. Frontend: `/services/agentService.ts`

**Purpose:** Client-side interface to the agent API

**Key Functions:**

```typescript
// Generic agent query
await askAgent({
  prompt: "What should I order this week?",
  userId: "user_123"
});

// Specialized wrappers
await checkLabelCompliance(userId, labelData, ['CA', 'CO']);
await detectAnomalies(userId);
await findPOOptimizations(userId);
await checkBuildFeasibility(userId, bomId, 100, '2025-12-15');
```

### 3. UI Components

#### `/components/ComplianceRiskCard.tsx`

Renders compliance check results:
- Color-coded by risk level (critical/high/medium/low)
- Compliance score circle
- Violations with recommendations
- Warnings and suggestions
- Click to view full report

**Usage:**
```tsx
import ComplianceRiskCard from './ComplianceRiskCard';

const response = await checkLabelCompliance(userId, labelData, ['CA']);
const result = getToolResult(response, 'check_label_compliance');

<ComplianceRiskCard
  result={result}
  productName="Organic Fertilizer"
  onViewDetails={(checkId) => navigateToReport(checkId)}
/>
```

#### `/components/BuildShortageTable.tsx`

Visualizes BOM buildability analysis:
- Feasibility score gauge
- Critical shortages (red)
- Warnings (yellow)
- Components in stock (green)
- Create PO button for all shortages

**Usage:**
```tsx
import BuildShortageTable from './BuildShortageTable';

const response = await checkBuildFeasibility(userId, bomId, 100, '2025-12-15');
const result = getToolResult(response, 'analyze_bom_buildability');

<BuildShortageTable
  result={result}
  onCreatePO={(items) => createPurchaseOrder(items)}
/>
```

#### `/components/ConsolidationOpportunityCard.tsx`

Displays PO consolidation opportunities:
- Total potential savings
- Shipping threshold progress bars
- Recommended items to add
- Urgency indicators
- Apply optimization button

**Usage:**
```tsx
import ConsolidationOpportunityCard from './ConsolidationOpportunityCard';

const response = await findPOOptimizations(userId);
const opportunities = getToolResult(response, 'find_consolidation_opportunities').opportunities;

<ConsolidationOpportunityCard
  opportunities={opportunities}
  onApplyOptimization={(opp) => addItemsToPO(opp)}
/>
```

---

## Key Improvements

### 1. Tool Results are Structured, Not Stringified

**Before:**
```typescript
// ❌ Returns string
return JSON.stringify(result, null, 2);

// In UI:
<pre>{response}</pre> // Just a JSON dump
```

**After:**
```typescript
// ✅ Returns structured object
return {
  success: true,
  overall_status: 'fail',
  violations: [...],
  warnings: [...],
  compliance_score: 65
};

// In UI:
<ComplianceRiskCard result={result} /> // Beautiful visualization
```

### 2. AI Makes Decisions, Not Keywords

**Before:**
```typescript
if (question.includes('check')) { ... }
if (question.includes('compliance')) { ... }
```

**After:**
```typescript
// AI analyzes intent and decides which tools to use
// Can combine multiple tools:
// "Check compliance AND find recent regulation changes"
// → calls check_label_compliance + get_regulation_changes
```

### 3. Multi-Tool Orchestration

**Example Query:**
> "I want to build 500 units of Product A next month. Can I do it, and if not, what should I order?"

**AI's Response:**
1. Calls `analyze_bom_buildability` → Finds 3 shortages
2. Calls `find_consolidation_opportunities` → Suggests combining orders
3. Returns synthesis: "You're blocked on 3 components. Order X, Y, Z from Vendor A together to save $45 on shipping."

### 4. Type-Safe Responses

All tool parameters and responses are validated with Zod schemas:

```typescript
check_label_compliance: tool({
  parameters: z.object({
    product_name: z.string(),
    target_states: z.array(z.string()),
    ingredients: z.array(z.string()).optional(),
  }),
  execute: async (params) => { ... }
})
```

---

## Migration Guide

### Updating Existing Code

If you have code using the old `mcpService.ts`:

**Before:**
```typescript
import { routeComplianceQuestion } from './services/mcpService';

const response = await routeComplianceQuestion(
  userId,
  "Check compliance for CA",
  { productName: "Product X" }
);

console.log(response); // Stringified JSON
```

**After:**
```typescript
import { checkLabelCompliance, getToolResult } from './services/agentService';

const response = await checkLabelCompliance(
  userId,
  { product_name: "Product X" },
  ['CA']
);

const result = getToolResult(response, 'check_label_compliance');

<ComplianceRiskCard result={result} />
```

---

## Adding New Tools

To add a new tool to the agentic system:

### 1. Define Tool in `/api/agent.ts`

```typescript
my_new_tool: tool({
  description: 'What this tool does',
  parameters: z.object({
    param1: z.string().describe('Description'),
    param2: z.number().optional(),
  }),
  execute: async ({ param1, param2 }) => {
    // Tool logic here
    return {
      success: true,
      data: { ... }
    };
  },
})
```

### 2. Add Convenience Wrapper in `/services/agentService.ts`

```typescript
export async function callMyNewTool(
  userId: string,
  param1: string
): Promise<AgentResponse> {
  return askAgent({
    prompt: `Use my_new_tool with param1: ${param1}`,
    userId,
    context: { param1 },
  });
}
```

### 3. Create UI Component (if needed)

```tsx
// /components/MyNewToolCard.tsx
export default function MyNewToolCard({ result }: { result: any }) {
  return (
    <div className="bg-white rounded-lg p-4">
      {/* Visualize result */}
    </div>
  );
}
```

---

## Best Practices

### 1. Let the AI Decide

✅ **Do:**
```typescript
await askAgent({
  prompt: "Help me optimize my purchase orders"
});
```

❌ **Don't:**
```typescript
if (userWantsOptimization) {
  await findPOOptimizations();
}
```

### 2. Use Specialized Wrappers for Common Tasks

✅ **Do:**
```typescript
await checkLabelCompliance(userId, labelData, ['CA', 'CO']);
```

❌ **Don't:**
```typescript
await askAgent({
  prompt: JSON.stringify(labelData) + " check compliance CA CO"
});
```

### 3. Extract Tool Results for UI Components

```typescript
const response = await askAgent({ prompt: "..." });
const complianceResult = getToolResult(response, 'check_label_compliance');

if (complianceResult) {
  <ComplianceRiskCard result={complianceResult} />
}
```

### 4. Handle Multi-Tool Responses

```typescript
const response = await askAgent({ prompt: "..." });

// Check which tools were called
if (usedTool(response, 'check_label_compliance')) {
  const complianceResult = getToolResult(response, 'check_label_compliance');
  // Render compliance card
}

if (usedTool(response, 'find_consolidation_opportunities')) {
  const opportunities = getToolResult(response, 'find_consolidation_opportunities');
  // Render consolidation card
}
```

---

## Performance & Cost

### Token Usage

The agentic approach uses slightly more tokens due to:
- Tool definitions in system prompt (~500 tokens)
- Multi-step reasoning (~200 tokens per step)

**Mitigation:**
- Use `maxSteps: 5` to limit reasoning loops
- Cache tool definitions using prompt caching (90% cost reduction)
- Use tier-based model selection (Gemini for basic, Claude for full_ai)

### Response Time

- **Simple queries:** 1-2s (single tool call)
- **Complex queries:** 3-5s (multi-tool orchestration)

### Cost Estimates

Based on Claude Sonnet pricing:

| Operation | Tokens | Cost |
|-----------|--------|------|
| Simple compliance check | ~2,000 | $0.006 |
| BOM analysis | ~3,000 | $0.009 |
| Multi-tool orchestration | ~5,000 | $0.015 |

**Monthly estimate for active user:** $5-10/month

---

## Future Enhancements

### 1. Streaming Responses

```typescript
const stream = await streamAgent({
  prompt: "Analyze inventory",
  userId
});

for await (const chunk of stream) {
  console.log(chunk); // Show progress to user
}
```

### 2. Memory & Context

```typescript
// Agent remembers previous conversation
await askAgent({
  prompt: "What else should I check?",
  userId,
  conversationId: "conv_123" // Maintains context
});
```

### 3. Scheduled Agent Tasks

```typescript
// Nightly autonomous operations
scheduleAgent({
  prompt: "Scan inventory for anomalies and create draft POs",
  schedule: "0 6 * * *", // Daily at 6am
  autoApprove: true
});
```

---

## Troubleshooting

### Tool not being called

**Problem:** AI doesn't call your tool even when it should

**Solution:**
- Improve tool `description` - be very specific
- Add examples to system prompt
- Check parameter descriptions are clear

### Results not rendering

**Problem:** UI component not showing data

**Solution:**
```typescript
// Debug the response
console.log('Tool calls:', response.tool_calls);
console.log('Tool result:', getToolResult(response, 'your_tool_name'));
```

### AI calling wrong tool

**Problem:** AI calls a different tool than expected

**Solution:**
- Use specialized wrapper functions (they guide the AI)
- Improve prompt specificity
- Add context to help AI understand intent

---

## Summary

This agentic architecture transforms MuRP from a passive database interface into an active assistant that:

✅ **Understands** user intent from natural language
✅ **Decides** which tools to use
✅ **Orchestrates** multiple tools for complex tasks
✅ **Synthesizes** results into actionable insights
✅ **Visualizes** data with specialized UI components

The result is a system where users can ask questions naturally and get beautiful, actionable responses.
