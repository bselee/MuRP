/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🤖 AGENTIC API - AI-Powered Tool Orchestration 🤖
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This API route creates a true "Agent" that can:
 * 1. Understand user intent from natural language
 * 2. Decide which tool(s) to use
 * 3. Call multiple tools in sequence
 * 4. Synthesize results into actionable insights
 *
 * This replaces the manual keyword routing in mcpService.ts
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                           User Prompt                                    │
 * │  "Check if our Product X label is compliant with CA and CO laws"        │
 * └────────────────────────────────┬────────────────────────────────────────┘
 *                                   │
 *                         ┌─────────▼─────────┐
 *                         │  Agent API Route  │
 *                         │  (This File)      │
 *                         └─────────┬─────────┘
 *                                   │
 *                    ┌──────────────┼──────────────┐
 *                    │              │              │
 *              ┌─────▼─────┐  ┌────▼────┐  ┌─────▼─────┐
 *              │ AI Model  │  │  Tools  │  │ Reasoning │
 *              │ (Claude)  │  │Available│  │   Loop    │
 *              └─────┬─────┘  └────┬────┘  └─────┬─────┘
 *                    │              │              │
 *                    └──────────────┼──────────────┘
 *                                   │
 *                         AI Decides to Call:
 *                         1. check_label_compliance
 *                         2. get_regulation_changes
 *                                   │
 *                         ┌─────────▼─────────┐
 *                         │  Structured JSON  │
 *                         │  Response         │
 *                         └─────────┬─────────┘
 *                                   │
 *                         ┌─────────▼─────────┐
 *                         │  UI Components    │
 *                         │  Render Results   │
 *                         └───────────────────┘
 *
 * @module api/agent
 * @author MuRP Development Team
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateText, tool } from 'ai';
import { createGatewayProvider } from '@ai-sdk/gateway';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase (server-side with service key)
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Initialize AI Gateway
const gateway = createGatewayProvider({
  baseURL: process.env.AI_GATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1/ai',
});

// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ Tool Definitions - Exposing MCP Tools to AI
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Define all available tools that the AI can use
 * These correspond to the MCP server tools but are now AI-accessible
 */
const tools = {
  check_label_compliance: tool({
    description: 'Check a product label against state regulations. Returns violations, warnings, and recommendations in structured JSON format.',
    parameters: z.object({
      product_name: z.string().describe('The product name'),
      target_states: z.array(z.string()).describe('Array of state codes to check (e.g., ["CA", "CO", "WA"])'),
      ingredients: z.array(z.string()).optional().describe('List of ingredients on the label'),
      claims: z.array(z.string()).optional().describe('Marketing claims on the label (e.g., "Organic", "All Natural")'),
      warnings: z.array(z.string()).optional().describe('Warning statements on the label'),
      net_weight: z.string().optional().describe('Net weight declaration'),
    }),
    execute: async ({ product_name, target_states, ingredients, claims, warnings, net_weight }) => {
      // Import the compliance checker tool
      const { performComplianceCheck } = await import('../mcp-server/src/tools/compliance-checker.js');

      const result = await performComplianceCheck(
        supabase,
        {
          product_name,
          ingredients: ingredients || [],
          claims: claims || [],
          warnings: warnings || [],
          net_weight,
        },
        target_states
      );

      return result;
    },
  }),

  search_state_regulations: tool({
    description: 'Search for state regulations on official government websites. Returns URLs and snippets of relevant regulations.',
    parameters: z.object({
      state: z.string().describe('Two-letter state code (e.g., CA, OR, WA)'),
      category: z.enum(['labeling', 'ingredients', 'claims', 'registration', 'packaging', 'testing', 'all'])
        .describe('Category of regulations to search for'),
      keywords: z.array(z.string()).optional().describe('Specific keywords to search for'),
    }),
    execute: async ({ state, category, keywords }) => {
      const { searchWebForRegulations } = await import('../mcp-server/src/tools/web-search.js');

      const result = await searchWebForRegulations(state, category, keywords || []);
      return result;
    },
  }),

  get_regulation_changes: tool({
    description: 'Get recent changes to regulations for monitoring and alerting',
    parameters: z.object({
      state: z.string().optional().describe('Filter by state code'),
      days: z.number().default(30).describe('Number of days to look back'),
      unacknowledged_only: z.boolean().default(true).describe('Only show unacknowledged changes'),
    }),
    execute: async ({ state, days, unacknowledged_only }) => {
      let query = supabase
        .from('regulation_changes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (state) {
        query = query.eq('state', state);
      }

      if (unacknowledged_only) {
        query = query.is('acknowledged_at', null);
      }

      if (days) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        query = query.gte('created_at', cutoffDate.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        changes: data,
        count: data?.length || 0,
      };
    },
  }),

  detect_inventory_anomalies: tool({
    description: 'Detect unusual inventory patterns such as consumption spikes/drops, items below reorder point, or stockout risks. Returns critical, warning, and info level anomalies.',
    parameters: z.object({
      limit: z.number().optional().default(500).describe('Number of top items to analyze'),
    }),
    execute: async ({ limit }) => {
      const { detectInventoryAnomalies } = await import('../services/aiPurchasingService');

      const result = await detectInventoryAnomalies();
      return result;
    },
  }),

  find_consolidation_opportunities: tool({
    description: 'Find purchase order consolidation opportunities to save on shipping costs. Analyzes draft POs and suggests items to add to reach free shipping thresholds.',
    parameters: z.object({
      vendor_id: z.string().optional().describe('Optional vendor ID to analyze specific vendor'),
    }),
    execute: async ({ vendor_id }) => {
      const { findConsolidationOpportunities } = await import('../services/aiPurchasingService');

      const opportunities = await findConsolidationOpportunities(vendor_id);
      return {
        success: true,
        opportunities,
        count: opportunities.length,
      };
    },
  }),

  parse_vendor_email: tool({
    description: 'Extract tracking numbers, backorder information, and status updates from vendor emails',
    parameters: z.object({
      email_content: z.string().describe('The raw email content to parse'),
      po_number: z.string().optional().describe('Purchase order number if known'),
    }),
    execute: async ({ email_content, po_number }) => {
      const { parseVendorEmail } = await import('../services/aiPurchasingService');

      const result = await parseVendorEmail(email_content, po_number);
      return {
        success: true,
        ...result,
      };
    },
  }),

  analyze_bom_buildability: tool({
    description: 'Analyze a Bill of Materials (BOM) to determine if a production build is feasible. Identifies shortages, lead time issues, and suggests purchase orders.',
    parameters: z.object({
      bom_id: z.string().describe('The BOM ID to analyze'),
      quantity: z.number().describe('Number of units to build'),
      target_date: z.string().describe('Target build date (YYYY-MM-DD)'),
    }),
    execute: async ({ bom_id, quantity, target_date }) => {
      // Fetch BOM and components
      const { data: bom, error: bomError } = await supabase
        .from('bill_of_materials')
        .select(`
          *,
          components:bom_components(
            *,
            inventory_item:inventory_items(*)
          )
        `)
        .eq('id', bom_id)
        .single();

      if (bomError || !bom) {
        return {
          success: false,
          error: 'BOM not found',
        };
      }

      const buildDate = new Date(target_date);
      const shortages: any[] = [];
      const warnings: any[] = [];
      const feasible_items: any[] = [];

      for (const component of bom.components || []) {
        const item = component.inventory_item;
        const requiredQty = component.quantity * quantity;
        const availableStock = item.stock || 0;
        const leadTimeDays = item.vendors?.lead_time_days || 14;

        // Check if we have enough stock
        if (availableStock < requiredQty) {
          const shortage = requiredQty - availableStock;
          const daysUntilBuild = Math.ceil((buildDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

          if (daysUntilBuild < leadTimeDays) {
            // Critical: Can't get parts in time
            shortages.push({
              sku: item.sku,
              name: item.name,
              required: requiredQty,
              available: availableStock,
              shortage,
              lead_time_days: leadTimeDays,
              days_until_build: daysUntilBuild,
              status: 'critical',
              recommendation: `Order ${shortage} units immediately. Lead time (${leadTimeDays} days) exceeds build date.`,
            });
          } else {
            // Warning: Cutting it close
            warnings.push({
              sku: item.sku,
              name: item.name,
              required: requiredQty,
              available: availableStock,
              shortage,
              lead_time_days: leadTimeDays,
              days_until_build: daysUntilBuild,
              status: 'warning',
              recommendation: `Order ${shortage} units soon. You have ${daysUntilBuild - leadTimeDays} days of buffer.`,
            });
          }
        } else {
          feasible_items.push({
            sku: item.sku,
            name: item.name,
            required: requiredQty,
            available: availableStock,
            status: 'ok',
          });
        }
      }

      return {
        success: true,
        bom_id,
        bom_name: bom.name,
        target_quantity: quantity,
        target_date,
        overall_status: shortages.length > 0 ? 'blocked' : warnings.length > 0 ? 'caution' : 'ready',
        shortages,
        warnings,
        feasible_items,
        build_feasibility_score: Math.round((feasible_items.length / (bom.components?.length || 1)) * 100),
      };
    },
  }),
};

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 Main API Handler
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, userId, context } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Get user profile to determine tier
    const { data: profile } = await supabase
      .from('user_compliance_profiles')
      .select('compliance_tier')
      .eq('user_id', userId)
      .single();

    const tier = profile?.compliance_tier || 'basic';

    // Select model based on tier
    const modelId = tier === 'full_ai'
      ? 'anthropic/claude-3-5-sonnet-20241022'
      : 'google/gemini-2.0-flash-exp';

    // Create system prompt that explains available tools
    const systemPrompt = `You are MuRP AI, an intelligent assistant for manufacturing resource planning.

You have access to several tools to help users:

**Compliance Tools:**
- check_label_compliance: Verify product labels against state regulations
- search_state_regulations: Find specific regulations on government websites
- get_regulation_changes: Monitor regulation updates

**Purchasing Intelligence:**
- detect_inventory_anomalies: Find unusual inventory patterns and stockout risks
- find_consolidation_opportunities: Optimize POs to save shipping costs
- parse_vendor_email: Extract tracking info from vendor communications

**Production Planning:**
- analyze_bom_buildability: Check if you can build a product with current inventory

Your job:
1. Understand the user's intent
2. Decide which tool(s) to call
3. Call tools in the right order
4. Synthesize results into clear, actionable insights

Return responses in this format:
{
  "summary": "Human-readable summary of what you found",
  "tool_calls": [
    {
      "tool": "tool_name",
      "result": { ... structured result ... }
    }
  ],
  "recommendations": ["Action item 1", "Action item 2"]
}

Additional context: ${context ? JSON.stringify(context) : 'None'}
`;

    // Call AI with tool binding
    const result = await generateText({
      model: gateway(modelId),
      system: systemPrompt,
      prompt,
      tools,
      maxSteps: 5, // Allow multi-step reasoning
      temperature: 0.3,
    });

    // Extract tool results
    const toolResults = result.toolResults || [];

    // Return structured response
    return res.status(200).json({
      success: true,
      response: result.text,
      tool_calls: toolResults.map((tr: any) => ({
        tool: tr.toolName,
        args: tr.args,
        result: tr.result,
      })),
      usage: {
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
      },
      model: modelId,
    });

  } catch (error: any) {
    console.error('🚨 Agent API error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
}
