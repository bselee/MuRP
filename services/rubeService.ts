/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🤖 RUBE SERVICE - MCP Tool Integration for AI Agents
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Rube provides MCP (Model Context Protocol) tools that AI agents can use to:
 * - Parse Gmail for PO status updates
 * - Send emails and Slack messages
 * - Execute scheduled recipes
 * - Sync data between external services and MuRP
 *
 * This service wraps Rube's MCP server for use by MuRP's AI agents.
 *
 * Setup:
 * 1. Go to https://rube.app/mcp
 * 2. Copy the MCP URL and JWT token
 * 3. Add to environment:
 *    VITE_RUBE_MCP_URL=https://rube.app/mcp
 *    VITE_RUBE_AUTH_TOKEN=your-jwt-token
 */

import { supabase } from '../lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export interface RubeMCPConfig {
  mcp_url: string;
  auth_token: string;
}

export interface RubeTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface RubeToolCall {
  tool: string;
  arguments: Record<string, unknown>;
}

export interface RubeToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executionTime?: number;
}

export interface RubeRecipe {
  id: string;
  name: string;
  description?: string;
  schedule?: string;
  lastRun?: string;
  status: 'active' | 'paused' | 'error';
  integrations: string[];
}

export interface RubeConnectionStatus {
  connected: boolean;
  mcpUrl?: string;
  toolCount: number;
  lastChecked: string;
  error?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Check if Rube MCP is configured
 */
export function isRubeConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_RUBE_MCP_URL &&
    import.meta.env.VITE_RUBE_AUTH_TOKEN
  );
}

/**
 * Get Rube MCP configuration from environment
 */
export function getRubeConfig(): RubeMCPConfig | null {
  const mcpUrl = import.meta.env.VITE_RUBE_MCP_URL;
  const authToken = import.meta.env.VITE_RUBE_AUTH_TOKEN;

  if (!mcpUrl || !authToken) {
    return null;
  }

  return { mcp_url: mcpUrl, auth_token: authToken };
}

/**
 * Get MCP server configuration for Claude Agent SDK
 */
export function getRubeAgentConfig(): Record<string, unknown> | null {
  const config = getRubeConfig();
  if (!config) return null;

  return {
    rube: {
      type: 'http',
      url: config.mcp_url,
      headers: {
        'Authorization': `Bearer ${config.auth_token}`,
      },
    },
  };
}

// ============================================================================
// MCP COMMUNICATION
// ============================================================================

/**
 * Make a JSON-RPC call to Rube MCP server
 */
async function mcpCall<T>(
  method: string,
  params: Record<string, unknown> = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  const config = getRubeConfig();
  if (!config) {
    return { success: false, error: 'Rube MCP not configured' };
  }

  try {
    const response = await fetch(config.mcp_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.auth_token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    if (data.error) {
      return { success: false, error: data.error.message || 'MCP error' };
    }

    return { success: true, data: data.result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// TOOL DISCOVERY
// ============================================================================

/**
 * List all available tools from Rube MCP server
 */
export async function listTools(): Promise<RubeTool[]> {
  const result = await mcpCall<{ tools: RubeTool[] }>('tools/list');
  if (!result.success || !result.data) {
    return [];
  }
  return result.data.tools || [];
}

/**
 * Get detailed info about a specific tool
 */
export async function getToolInfo(toolName: string): Promise<RubeTool | null> {
  const tools = await listTools();
  return tools.find(t => t.name === toolName) || null;
}

/**
 * Check connection status
 */
export async function checkConnection(): Promise<RubeConnectionStatus> {
  const config = getRubeConfig();
  const status: RubeConnectionStatus = {
    connected: false,
    toolCount: 0,
    lastChecked: new Date().toISOString(),
  };

  if (!config) {
    status.error = 'Not configured';
    return status;
  }

  status.mcpUrl = config.mcp_url;

  try {
    const tools = await listTools();
    status.connected = true;
    status.toolCount = tools.length;
  } catch (error) {
    status.error = String(error);
  }

  return status;
}

// ============================================================================
// TOOL EXECUTION
// ============================================================================

/**
 * Execute a Rube tool with given arguments
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<RubeToolResult> {
  const startTime = Date.now();

  const result = await mcpCall<unknown>('tools/call', {
    name: toolName,
    arguments: args,
  });

  const executionTime = Date.now() - startTime;

  // Log execution for audit
  await logToolExecution(toolName, args, result.success, result.error, executionTime);

  if (!result.success) {
    return { success: false, error: result.error, executionTime };
  }

  return { success: true, result: result.data, executionTime };
}

/**
 * Execute multiple tools in sequence
 */
export async function executeToolChain(
  calls: RubeToolCall[]
): Promise<RubeToolResult[]> {
  const results: RubeToolResult[] = [];

  for (const call of calls) {
    const result = await executeTool(call.tool, call.arguments);
    results.push(result);

    // Stop chain on first failure
    if (!result.success) {
      break;
    }
  }

  return results;
}

// ============================================================================
// GMAIL-SPECIFIC TOOLS
// ============================================================================

/**
 * Parse Gmail for PO-related emails using Rube
 */
export async function parseGmailForPOUpdates(options: {
  query?: string;
  maxResults?: number;
  sinceDays?: number;
}): Promise<RubeToolResult> {
  const query = options.query || 'subject:(PO OR "purchase order" OR shipping OR tracking)';
  const maxResults = options.maxResults || 50;
  const since = options.sinceDays || 7;

  // This assumes Rube has a Gmail parsing tool
  // The actual tool name will depend on your Rube configuration
  return executeTool('gmail_search_and_parse', {
    query,
    max_results: maxResults,
    since_days: since,
    extract_fields: ['po_number', 'tracking_number', 'shipping_status', 'eta', 'vendor'],
  });
}

/**
 * Get unread emails from vendor domains
 */
export async function getUnreadVendorEmails(vendorDomains: string[]): Promise<RubeToolResult> {
  const query = vendorDomains.map(d => `from:${d}`).join(' OR ');

  return executeTool('gmail_search', {
    query: `is:unread (${query})`,
    max_results: 100,
  });
}

// ============================================================================
// SLACK-SPECIFIC TOOLS
// ============================================================================

/**
 * Send a Slack message via Rube
 */
export async function sendSlackMessage(options: {
  channel: string;
  text: string;
  blocks?: Record<string, unknown>[];
}): Promise<RubeToolResult> {
  return executeTool('slack_send_message', {
    channel: options.channel,
    text: options.text,
    blocks: options.blocks,
  });
}

/**
 * Post to Slack with rich formatting
 */
export async function postPOSummaryToSlack(options: {
  channel: string;
  summary: {
    totalPOs: number;
    overdue: number;
    pendingShipment: number;
    inTransit: number;
    highlights: string[];
  };
}): Promise<RubeToolResult> {
  const { summary } = options;

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'PO Status Summary' },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Total POs:* ${summary.totalPOs}` },
        { type: 'mrkdwn', text: `*Overdue:* ${summary.overdue}` },
        { type: 'mrkdwn', text: `*Pending Shipment:* ${summary.pendingShipment}` },
        { type: 'mrkdwn', text: `*In Transit:* ${summary.inTransit}` },
      ],
    },
  ];

  if (summary.highlights.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Highlights:*\n' + summary.highlights.map(h => `• ${h}`).join('\n'),
      },
    } as any);
  }

  return sendSlackMessage({
    channel: options.channel,
    text: `PO Summary: ${summary.totalPOs} total, ${summary.overdue} overdue`,
    blocks,
  });
}

// ============================================================================
// RECIPE MANAGEMENT
// ============================================================================

/**
 * List available Rube recipes (if supported by MCP)
 */
export async function listRecipes(): Promise<RubeRecipe[]> {
  const result = await mcpCall<{ recipes: RubeRecipe[] }>('recipes/list');
  if (!result.success || !result.data) {
    return [];
  }
  return result.data.recipes || [];
}

/**
 * Trigger a recipe execution
 */
export async function triggerRecipe(
  recipeId: string,
  inputData?: Record<string, unknown>
): Promise<RubeToolResult> {
  return executeTool('recipe_execute', {
    recipe_id: recipeId,
    input: inputData || {},
  });
}

// ============================================================================
// AGENT INTEGRATION HELPERS
// ============================================================================

/**
 * Get tool descriptions formatted for AI agent context
 */
export async function getToolDescriptionsForAgent(): Promise<string> {
  const tools = await listTools();

  if (tools.length === 0) {
    return 'No Rube tools available.';
  }

  const descriptions = tools.map(t => {
    const desc = t.description || 'No description';
    return `- **${t.name}**: ${desc}`;
  });

  return `## Available Rube Tools\n\n${descriptions.join('\n')}`;
}

/**
 * Create a tool call request for an agent
 */
export function createToolCallRequest(
  toolName: string,
  args: Record<string, unknown>
): { type: 'tool_use'; name: string; input: Record<string, unknown> } {
  return {
    type: 'tool_use',
    name: `rube_${toolName}`,
    input: args,
  };
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

/**
 * Log tool execution for audit trail
 */
async function logToolExecution(
  toolName: string,
  args: Record<string, unknown>,
  success: boolean,
  error?: string,
  executionTime?: number
): Promise<void> {
  try {
    await supabase.from('rube_tool_executions').insert({
      tool_name: toolName,
      arguments: args,
      success,
      error,
      execution_time_ms: executionTime,
      executed_at: new Date().toISOString(),
    });
  } catch {
    // Table might not exist yet - ignore silently
    console.debug('[RubeService] Could not log tool execution:', toolName);
  }
}

/**
 * Get recent tool executions
 */
export async function getRecentExecutions(limit: number = 50): Promise<Array<{
  tool_name: string;
  success: boolean;
  executed_at: string;
  execution_time_ms?: number;
}>> {
  try {
    const { data } = await supabase
      .from('rube_tool_executions')
      .select('tool_name, success, executed_at, execution_time_ms')
      .order('executed_at', { ascending: false })
      .limit(limit);

    return data || [];
  } catch {
    return [];
  }
}

// ============================================================================
// MURP-SPECIFIC WORKFLOWS
// ============================================================================

/**
 * Parse vendor email for PO updates and sync to MuRP
 * This is a high-level workflow that combines multiple tools
 */
export async function syncPOStatusFromEmail(poNumber: string): Promise<{
  success: boolean;
  updates?: {
    status?: string;
    tracking?: string;
    eta?: string;
  };
  error?: string;
}> {
  // Search for emails mentioning this PO
  const searchResult = await executeTool('gmail_search', {
    query: `"${poNumber}" OR subject:${poNumber}`,
    max_results: 10,
  });

  if (!searchResult.success) {
    return { success: false, error: searchResult.error };
  }

  // Parse the emails for status info
  const parseResult = await executeTool('extract_po_status', {
    emails: searchResult.result,
    po_number: poNumber,
  });

  if (!parseResult.success) {
    return { success: false, error: parseResult.error };
  }

  const updates = parseResult.result as {
    status?: string;
    tracking?: string;
    eta?: string;
  };

  return { success: true, updates };
}

/**
 * Send daily PO summary via Rube
 */
export async function sendDailyPOSummary(options: {
  channel: string;
  data: {
    openPOs: number;
    overdueCount: number;
    shippingToday: number;
    arrivingToday: number;
    criticalItems: string[];
  };
}): Promise<RubeToolResult> {
  const { data } = options;

  return executeTool('slack_send_message', {
    channel: options.channel,
    text: `Daily PO Summary - ${new Date().toLocaleDateString()}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `Daily PO Summary - ${new Date().toLocaleDateString()}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Open POs:* ${data.openPOs}` },
          { type: 'mrkdwn', text: `*Overdue:* ${data.overdueCount}` },
          { type: 'mrkdwn', text: `*Shipping Today:* ${data.shippingToday}` },
          { type: 'mrkdwn', text: `*Arriving Today:* ${data.arrivingToday}` },
        ],
      },
      ...(data.criticalItems.length > 0 ? [{
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Critical Items:*\n' + data.criticalItems.map(i => `• ${i}`).join('\n'),
        },
      }] : []),
    ],
  });
}
