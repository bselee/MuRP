/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🤖 AGENT SERVICE - Client-Side Agent Interface 🤖
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This service provides a clean interface for the frontend to interact
 * with the AI Agent that has access to MCP tools.
 *
 * This REPLACES the manual keyword routing in mcpService.ts
 *
 * Key Improvements:
 * ✨ AI decides which tools to use (not keyword matching)
 * ✨ Returns structured JSON (not stringified responses)
 * ✨ Supports multi-tool orchestration
 * ✨ Type-safe responses
 *
 * @module services/agentService
 */

import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Type Definitions
// ═══════════════════════════════════════════════════════════════════════════

export interface ToolCall {
  tool: string;
  args: Record<string, any>;
  result: any;
}

export interface AgentResponse {
  success: boolean;
  response: string; // AI's natural language summary
  tool_calls: ToolCall[]; // Structured results from tools
  recommendations?: string[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model?: string;
  error?: string;
}

export interface AgentRequest {
  prompt: string;
  userId?: string;
  context?: Record<string, any>;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 Main Agent Interface
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ask the AI agent to help with any task
 * The agent will decide which tools to use based on the prompt
 *
 * @example
 * ```typescript
 * const response = await askAgent({
 *   prompt: "Check if our Organic Fertilizer label is compliant in CA and CO",
 *   userId: "user_123",
 *   context: {
 *     productId: "prod_456"
 *   }
 * });
 *
 * // AI automatically calls check_label_compliance tool
 * console.log(response.response); // "Your label has 2 critical violations in CA..."
 * console.log(response.tool_calls[0].result); // Structured compliance data
 * ```
 */
export async function askAgent(request: AgentRequest): Promise<AgentResponse> {
  try {
    // Call the agent API route
    const response = await fetch('/api/agent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: request.prompt,
        userId: request.userId,
        context: request.context,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Agent request failed');
    }

    const data: AgentResponse = await response.json();
    return data;

  } catch (error: any) {
    console.error('🚨 Agent service error:', error);
    return {
      success: false,
      response: '',
      tool_calls: [],
      error: error.message || 'Failed to communicate with agent',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 Specialized Agent Functions (Convenience Wrappers)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check label compliance for specific states
 * Uses the agent's check_label_compliance tool
 */
export async function checkLabelCompliance(
  userId: string,
  labelData: {
    product_name: string;
    ingredients?: string[];
    claims?: string[];
    warnings?: string[];
    net_weight?: string;
  },
  targetStates: string[]
): Promise<AgentResponse> {
  const prompt = `Check the compliance of this product label for states: ${targetStates.join(', ')}

Product: ${labelData.product_name}
${labelData.ingredients?.length ? `Ingredients: ${labelData.ingredients.join(', ')}` : ''}
${labelData.claims?.length ? `Claims: ${labelData.claims.join(', ')}` : ''}
${labelData.net_weight ? `Net Weight: ${labelData.net_weight}` : ''}

Please analyze the label and provide:
1. Any violations or issues
2. Compliance score
3. Specific recommendations to fix issues`;

  return askAgent({
    prompt,
    userId,
    context: {
      labelData,
      targetStates,
    },
  });
}

/**
 * Detect inventory anomalies
 * Uses the agent's detect_inventory_anomalies tool
 */
export async function detectAnomalies(userId: string): Promise<AgentResponse> {
  return askAgent({
    prompt: 'Analyze our inventory for anomalies. Look for items at risk of stockout, unusual consumption patterns, or data errors. Prioritize by urgency.',
    userId,
  });
}

/**
 * Find purchase order consolidation opportunities
 * Uses the agent's find_consolidation_opportunities tool
 */
export async function findPOOptimizations(
  userId: string,
  vendorId?: string
): Promise<AgentResponse> {
  const prompt = vendorId
    ? `Analyze purchase orders for vendor ${vendorId}. Find opportunities to consolidate orders and save on shipping costs.`
    : 'Analyze all draft purchase orders. Find opportunities to consolidate orders, reach free shipping thresholds, and optimize costs.';

  return askAgent({
    prompt,
    userId,
    context: { vendorId },
  });
}

/**
 * Check if a build is feasible (BOM analysis)
 * Uses the agent's analyze_bom_buildability tool
 */
export async function checkBuildFeasibility(
  userId: string,
  bomId: string,
  quantity: number,
  targetDate: string
): Promise<AgentResponse> {
  const prompt = `I want to build ${quantity} units of BOM ${bomId} by ${targetDate}.

Can I build this? Check:
1. Do we have all components in stock?
2. For any shortages, can we order in time?
3. What purchase orders do I need to create?`;

  return askAgent({
    prompt,
    userId,
    context: {
      bomId,
      quantity,
      targetDate,
    },
  });
}

/**
 * Parse vendor email for tracking info
 * Uses the agent's parse_vendor_email tool
 */
export async function parseVendorEmail(
  userId: string,
  emailContent: string,
  poNumber?: string
): Promise<AgentResponse> {
  const prompt = poNumber
    ? `Extract shipping information from this vendor email about PO ${poNumber}:\n\n${emailContent}`
    : `Extract shipping information from this vendor email:\n\n${emailContent}`;

  return askAgent({
    prompt,
    userId,
    context: {
      emailContent,
      poNumber,
    },
  });
}

/**
 * Search for state regulations
 * Uses the agent's search_state_regulations tool
 */
export async function searchRegulations(
  userId: string,
  state: string,
  category: string,
  keywords?: string[]
): Promise<AgentResponse> {
  const keywordText = keywords?.length ? ` focusing on: ${keywords.join(', ')}` : '';
  const prompt = `Search for ${category} regulations in ${state}${keywordText}. Find official government sources.`;

  return askAgent({
    prompt,
    userId,
    context: {
      state,
      category,
      keywords,
    },
  });
}

/**
 * Monitor regulation changes
 * Uses the agent's get_regulation_changes tool
 */
export async function getRegulationUpdates(
  userId: string,
  state?: string,
  days: number = 30
): Promise<AgentResponse> {
  const stateText = state ? ` in ${state}` : '';
  const prompt = `Show me regulation changes${stateText} from the last ${days} days that I haven't acknowledged yet.`;

  return askAgent({
    prompt,
    userId,
    context: {
      state,
      days,
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract specific tool result from agent response
 */
export function getToolResult(response: AgentResponse, toolName: string): any | null {
  const toolCall = response.tool_calls.find(tc => tc.tool === toolName);
  return toolCall?.result || null;
}

/**
 * Check if agent used a specific tool
 */
export function usedTool(response: AgentResponse, toolName: string): boolean {
  return response.tool_calls.some(tc => tc.tool === toolName);
}

/**
 * Get all tool names that were called
 */
export function getCalledTools(response: AgentResponse): string[] {
  return response.tool_calls.map(tc => tc.tool);
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎁 Export Everything
// ═══════════════════════════════════════════════════════════════════════════

export default {
  // Main function
  askAgent,

  // Specialized functions
  checkLabelCompliance,
  detectAnomalies,
  findPOOptimizations,
  checkBuildFeasibility,
  parseVendorEmail,
  searchRegulations,
  getRegulationUpdates,

  // Helpers
  getToolResult,
  usedTool,
  getCalledTools,
};
