/**
 * MCP (Model Context Protocol) Service
 * Integrates with the Python MCP server for compliance operations
 * 
 * Available Tools:
 * 1. onboard_user - Set up user profile with industry/states
 * 2. add_regulatory_source - Save regulation links
 * 3. basic_compliance_check - Return manual checklist
 * 4. extract_label_text - OCR text extraction from images
 * 5. full_ai_compliance_check - AI-powered analysis
 * 6. scrape_state_regulation - Fetch regulation text from .gov sites
 * 7. upgrade_to_full_ai - Convert free → paid
 * 8. get_compliance_summary - Usage stats and history
 */

import { supabase } from '../lib/supabase/client';
// Note: MCP calls require backend proxy via Supabase Edge Function
// Create: supabase/functions/mcp-proxy/index.ts

// ============================================================================
// Types
// ============================================================================

export interface McpToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface McpToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface OnboardUserArgs {
  user_id: string;
  email: string;
  industry: 'organic_agriculture' | 'fertilizer_manufacturing' | 'soil_amendments';
  target_states: string[]; // ['CO', 'CA', 'WA']
  compliance_tier?: 'basic' | 'full_ai';
  certifications?: string[]; // ['OMRI', 'USDA_Organic']
}

export interface AddRegulatorySourceArgs {
  user_id: string;
  state_code: string; // 'CO'
  regulation_type: string; // 'organic'
  source_url: string;
  source_title: string;
  notes?: string;
}

export interface BasicComplianceCheckArgs {
  user_id: string;
  product_name: string;
  product_type: string;
  target_states: string[];
}

export interface ExtractLabelTextArgs {
  image_url: string;
  product_name: string;
}

export interface FullAiComplianceCheckArgs {
  user_id: string;
  product_name: string;
  product_type: string;
  target_states: string[];
  label_image_url?: string;
  ingredients?: string[];
  claims?: string[];
  certifications?: string[];
}

export interface ScrapeStateRegulationArgs {
  state_code: string;
  regulation_type: string;
  source_url: string;
}

export interface UpgradeToFullAiArgs {
  user_id: string;
  payment_method_id: string;
}

export interface GetComplianceSummaryArgs {
  user_id: string;
}

// ============================================================================
// MCP Server Communication
// ============================================================================

/**
 * Check if MCP server is running and configured
 */
export async function isMcpServerAvailable(): Promise<boolean> {
  // TODO: Implement health check when MCP server endpoint is ready
  // For now, always return true to enable testing
  return true;
}

/**
 * Call MCP tool via backend endpoint
 * Note: Direct stdio communication from browser not possible.
 * Requires backend proxy endpoint or Supabase Edge Function.
 */
async function callMcpTool(toolName: string, args: Record<string, any>): Promise<McpToolResult> {
  try {
    // Option 1: Call Supabase Edge Function (recommended)
    const { data, error } = await supabase.functions.invoke('mcp-proxy', {
      body: {
        tool: toolName,
        arguments: args,
      },
    });

    if (error) {
      console.error(`MCP tool ${toolName} error:`, error);
      return {
        success: false,
        error: error.message || 'MCP tool call failed',
      };
    }

    return {
      success: true,
      data: data,
    };
  } catch (err) {
    console.error(`MCP tool ${toolName} exception:`, err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Tool 1: Onboard User
// ============================================================================

export async function onboardUser(args: OnboardUserArgs): Promise<McpToolResult> {
  return callMcpTool('onboard_user', {
    user_id: args.user_id,
    email: args.email,
    industry: args.industry,
    target_states: args.target_states,
    compliance_tier: args.compliance_tier || 'basic',
    certifications: args.certifications || [],
  });
}

// ============================================================================
// Tool 2: Add Regulatory Source
// ============================================================================

export async function addRegulatorySource(args: AddRegulatorySourceArgs): Promise<McpToolResult> {
  return callMcpTool('add_regulatory_source', {
    user_id: args.user_id,
    state_code: args.state_code,
    regulation_type: args.regulation_type,
    source_url: args.source_url,
    source_title: args.source_title,
    notes: args.notes || '',
  });
}

// ============================================================================
// Tool 3: Basic Compliance Check (Free)
// ============================================================================

export async function basicComplianceCheck(args: BasicComplianceCheckArgs): Promise<McpToolResult> {
  return callMcpTool('basic_compliance_check', {
    user_id: args.user_id,
    product_name: args.product_name,
    product_type: args.product_type,
    target_states: args.target_states,
  });
}

// ============================================================================
// Tool 4: Extract Label Text (OCR)
// ============================================================================

export async function extractLabelText(args: ExtractLabelTextArgs): Promise<McpToolResult> {
  return callMcpTool('extract_label_text', {
    image_url: args.image_url,
    product_name: args.product_name,
  });
}

// ============================================================================
// Tool 5: Full AI Compliance Check ($49/mo)
// ============================================================================

export async function fullAiComplianceCheck(args: FullAiComplianceCheckArgs): Promise<McpToolResult> {
  return callMcpTool('full_ai_compliance_check', {
    user_id: args.user_id,
    product_name: args.product_name,
    product_type: args.product_type,
    target_states: args.target_states,
    label_image_url: args.label_image_url,
    ingredients: args.ingredients || [],
    claims: args.claims || [],
    certifications: args.certifications || [],
  });
}

// ============================================================================
// Tool 6: Scrape State Regulation
// ============================================================================

export async function scrapeStateRegulation(args: ScrapeStateRegulationArgs): Promise<McpToolResult> {
  return callMcpTool('scrape_state_regulation', {
    state_code: args.state_code,
    regulation_type: args.regulation_type,
    source_url: args.source_url,
  });
}

// ============================================================================
// Tool 7: Upgrade to Full AI
// ============================================================================

export async function upgradeToFullAi(args: UpgradeToFullAiArgs): Promise<McpToolResult> {
  return callMcpTool('upgrade_to_full_ai', {
    user_id: args.user_id,
    payment_method_id: args.payment_method_id,
  });
}

// ============================================================================
// Tool 8: Get Compliance Summary
// ============================================================================

export async function getComplianceSummary(args: GetComplianceSummaryArgs): Promise<McpToolResult> {
  return callMcpTool('get_compliance_summary', {
    user_id: args.user_id,
  });
}

// ============================================================================
// Helper Functions for AI Chat Integration
// ============================================================================

/**
 * Detect if a user question relates to compliance
 */
export function isComplianceQuestion(question: string): boolean {
  const complianceKeywords = [
    'compliance',
    'regulation',
    'legal',
    'state law',
    'requirement',
    'label',
    'certification',
    'omri',
    'organic',
    'usda',
    'packaging',
    'permit',
    'license',
    'approved',
    'allowed',
    'prohibited',
    'restricted',
    'must include',
    'need to show',
    'co law',
    'ca law',
    'colorado',
    'california',
    'washington',
  ];

  const lowerQuestion = question.toLowerCase();
  return complianceKeywords.some(keyword => lowerQuestion.includes(keyword));
}

/**
 * Route compliance question to appropriate MCP tool
 */
export async function routeComplianceQuestion(
  userId: string,
  question: string,
  context?: {
    productName?: string;
    productType?: string;
    targetStates?: string[];
    labelImageUrl?: string;
  }
): Promise<string> {
  const lowerQuestion = question.toLowerCase();

  // Check if user has full AI tier
  // TODO: Query user_compliance_profiles table once types are added
  const hasFullAi = false; // Default to free tier for now

  // Route to appropriate tool based on question intent
  if (lowerQuestion.includes('onboard') || lowerQuestion.includes('setup') || lowerQuestion.includes('sign up')) {
    return 'Use onboard_user tool to set up compliance profile';
  }

  if (lowerQuestion.includes('add source') || lowerQuestion.includes('save regulation')) {
    return 'Use add_regulatory_source tool to save regulation links';
  }

  if (lowerQuestion.includes('scrape') || lowerQuestion.includes('fetch regulation')) {
    return 'Use scrape_state_regulation tool to fetch regulation text';
  }

  if (lowerQuestion.includes('extract') || lowerQuestion.includes('read label') || lowerQuestion.includes('ocr')) {
    if (!hasFullAi) {
      return 'Label extraction requires Full AI tier ($49/mo). Use upgrade_to_full_ai to upgrade.';
    }
    if (context?.labelImageUrl) {
      const result = await extractLabelText({
        image_url: context.labelImageUrl,
        product_name: context.productName || 'Unknown Product',
      });
      return result.success
        ? JSON.stringify(result.data, null, 2)
        : `Error: ${result.error}`;
    }
    return 'Please provide a label image URL to extract text';
  }

  // Full AI compliance check
  if (lowerQuestion.includes('check') || lowerQuestion.includes('compliant') || lowerQuestion.includes('legal')) {
    if (!hasFullAi && (lowerQuestion.includes('ai') || lowerQuestion.includes('analyze'))) {
      return 'AI-powered compliance checking requires Full AI tier ($49/mo). Use basic_compliance_check for free manual checklist, or upgrade_to_full_ai for AI analysis.';
    }

    const checkArgs: BasicComplianceCheckArgs = {
      user_id: userId,
      product_name: context?.productName || 'Unknown Product',
      product_type: context?.productType || 'soil_amendment',
      target_states: context?.targetStates || ['CO'],
    };

    if (hasFullAi && context?.labelImageUrl) {
      // Use full AI check
      const result = await fullAiComplianceCheck({
        ...checkArgs,
        label_image_url: context.labelImageUrl,
      });
      return result.success
        ? JSON.stringify(result.data, null, 2)
        : `Error: ${result.error}`;
    } else {
      // Use basic check
      const result = await basicComplianceCheck(checkArgs);
      return result.success
        ? JSON.stringify(result.data, null, 2)
        : `Error: ${result.error}`;
    }
  }

  if (lowerQuestion.includes('summary') || lowerQuestion.includes('usage') || lowerQuestion.includes('stats')) {
    const result = await getComplianceSummary({ user_id: userId });
    return result.success
      ? JSON.stringify(result.data, null, 2)
      : `Error: ${result.error}`;
  }

  return 'I can help with compliance questions. Try asking about:\n' +
    '- Checking product compliance for specific states\n' +
    '- Adding regulatory sources\n' +
    '- Extracting text from label images (Full AI tier)\n' +
    '- Getting compliance summary and usage stats';
}

// ============================================================================
// Tool 16: Research Ingredient Regulations (Perplexity AI)
// ============================================================================

export interface ResearchIngredientRegulationsArgs {
  ingredient_name: string;
  state_codes: string[];
  cas_number?: string;
  regulation_type?: 'fertilizer' | 'organic' | 'soil_amendment' | 'biostimulant';
}

export interface StateRegulatoryResearch {
  state: string;
  summary: string;
  keyChanges: string[];
  whoIsAffected: string[];
  skuImpact: Array<{
    category: string;
    action: string;
    priority: 'High' | 'Medium' | 'Low' | 'Watch';
  }>;
  nextSteps: string[];
  sources: string[];
  lastUpdated: string;
}

/**
 * Research state-by-state regulations for an ingredient using Perplexity AI
 * Returns detailed regulatory summary with citations
 */
export async function researchIngredientRegulations(
  args: ResearchIngredientRegulationsArgs
): Promise<McpToolResult> {
  return callMcpTool('research_ingredient_regulations', {
    ingredient_name: args.ingredient_name,
    state_codes: args.state_codes,
    cas_number: args.cas_number,
    regulation_type: args.regulation_type || 'fertilizer',
  });
}

// ============================================================================
// Tool 17: Set Ingredient Compliance
// ============================================================================

export interface SetIngredientComplianceArgs {
  ingredient_sku: string;
  ingredient_name: string;
  state_code: string;
  compliance_status: 'compliant' | 'restricted' | 'prohibited' | 'conditional' | 'pending_review';
  restriction_type?: string;
  restriction_details?: string;
  max_concentration_pct?: number;
  regulation_code?: string;
  effective_date?: string;
  notes?: string;
  cas_number?: string;
}

/**
 * Store researched compliance data for an ingredient in a specific state
 */
export async function setIngredientCompliance(
  args: SetIngredientComplianceArgs
): Promise<McpToolResult> {
  return callMcpTool('set_ingredient_compliance', {
    ingredient_sku: args.ingredient_sku,
    ingredient_name: args.ingredient_name,
    state_code: args.state_code,
    compliance_status: args.compliance_status,
    restriction_type: args.restriction_type,
    restriction_details: args.restriction_details,
    max_concentration_pct: args.max_concentration_pct,
    regulation_code: args.regulation_code,
    effective_date: args.effective_date,
    notes: args.notes,
    cas_number: args.cas_number,
  });
}

// ============================================================================
// Tool 18: Research Ingredient SDS (Perplexity AI)
// ============================================================================

export interface ResearchIngredientSDSArgs {
  ingredient_name: string;
  cas_number?: string;
  manufacturer?: string;
}

/**
 * Research SDS/hazard data for an ingredient using Perplexity AI
 * Returns GHS classifications, hazard codes, and safety information
 */
export async function researchIngredientSDS(
  args: ResearchIngredientSDSArgs
): Promise<McpToolResult> {
  return callMcpTool('research_ingredient_sds', {
    ingredient_name: args.ingredient_name,
    cas_number: args.cas_number,
    manufacturer: args.manufacturer,
  });
}

// ============================================================================
// Tool: Research State Regulations (General fertilizer/ag law)
// ============================================================================

export interface ResearchStateRegulationsArgs {
  state_code: string;
  regulation_type?: 'fertilizer' | 'organic' | 'soil_amendment' | 'biostimulant' | 'general';
  focus_area?: string; // e.g., "nitrogen management", "labeling requirements"
}

/**
 * Research state-level regulatory requirements using Perplexity AI
 * Returns comprehensive summary with recent changes, affected parties, and action items
 */
export async function researchStateRegulations(
  args: ResearchStateRegulationsArgs
): Promise<McpToolResult> {
  // Build a research query for the state
  const query = `${args.state_code} state ${args.regulation_type || 'fertilizer'} regulations ${args.focus_area || ''} 2025 recent changes requirements`;

  return callMcpTool('research_ingredient_regulations', {
    ingredient_name: query, // Repurposing the ingredient field for general state research
    state_codes: [args.state_code],
    regulation_type: args.regulation_type || 'fertilizer',
  });
}

// ============================================================================
// Export all tools
// ============================================================================

export const mcpTools = {
  onboardUser,
  addRegulatorySource,
  basicComplianceCheck,
  extractLabelText,
  fullAiComplianceCheck,
  scrapeStateRegulation,
  upgradeToFullAi,
  getComplianceSummary,
  researchIngredientRegulations,
  setIngredientCompliance,
  researchIngredientSDS,
  researchStateRegulations,
};

export default mcpTools;
