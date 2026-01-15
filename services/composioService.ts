/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔗 COMPOSIO MCP SERVICE - Full Rube/Composio Integration
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Integrates MuRP with Composio's MCP (Model Context Protocol) for:
 * - Two-way Slack communication with interactive buttons
 * - Recipe execution and data exchange with Rube
 * - OAuth-managed connections to 500+ apps
 *
 * Usage Patterns:
 * 1. MuRP Agent → Composio → Slack (send messages, create threads)
 * 2. Slack → Composio → MuRP (slash commands, button clicks)
 * 3. Rube Recipe → Composio → MuRP Webhook (scheduled data sync)
 */

import { supabase } from '../lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export interface ComposioConfig {
  api_key: string;
  user_id?: string;
  session_id?: string;
  mcp_url?: string;
}

export interface ComposioSession {
  id: string;
  mcp_url: string;
  tools_available: string[];
  connections: ComposioConnection[];
  expires_at: string;
}

export interface ComposioConnection {
  app: string;
  status: 'connected' | 'pending' | 'expired';
  scopes: string[];
  auth_url?: string;
}

export interface SlackMessageOptions {
  channel: string;
  text: string;
  blocks?: Record<string, unknown>[];
  thread_ts?: string;
  // Interactive features
  buttons?: Array<{
    text: string;
    action_id: string;
    style?: 'primary' | 'danger';
    url?: string;
  }>;
  // Mentions
  mention_users?: string[];
}

export interface SlackInteraction {
  type: 'button_click' | 'slash_command' | 'message';
  action_id?: string;
  user_id: string;
  channel_id: string;
  text?: string;
  response_url: string;
}

export interface RecipeExecutionRequest {
  recipe_id: string;
  input_data?: Record<string, unknown>;
  webhook_url?: string;
}

export interface RecipeExecutionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  execution_id?: string;
}

// ============================================================================
// COMPOSIO CLIENT
// ============================================================================

class ComposioClient {
  private apiKey: string;
  private baseUrl = 'https://backend.composio.dev/api/v1';
  private sessionCache: ComposioSession | null = null;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Check if Composio is properly configured
   */
  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 10);
  }

  /**
   * Make authenticated request to Composio API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `API error: ${response.status} - ${errorText}` };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Create or get existing session for MCP tools
   */
  async getSession(userId: string = 'default'): Promise<ComposioSession | null> {
    // Check cache
    if (this.sessionCache && new Date(this.sessionCache.expires_at) > new Date()) {
      return this.sessionCache;
    }

    const result = await this.request<ComposioSession>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });

    if (result.success && result.data) {
      this.sessionCache = result.data;
      return result.data;
    }

    console.error('[ComposioService] Failed to create session:', result.error);
    return null;
  }

  /**
   * Get MCP server URL for agent integration
   */
  async getMCPUrl(userId: string = 'default'): Promise<string | null> {
    const session = await this.getSession(userId);
    return session?.mcp_url || null;
  }

  /**
   * Check connection status for a specific app (e.g., 'slack')
   */
  async checkConnection(app: string): Promise<ComposioConnection | null> {
    const result = await this.request<{ connections: ComposioConnection[] }>(`/connections?app=${app}`);

    if (result.success && result.data?.connections) {
      return result.data.connections.find(c => c.app === app) || null;
    }
    return null;
  }

  /**
   * Get OAuth authorization URL for connecting an app
   */
  async getAuthUrl(app: string, redirectUri?: string): Promise<string | null> {
    const result = await this.request<{ auth_url: string }>(`/auth/${app}/url`, {
      method: 'POST',
      body: JSON.stringify({ redirect_uri: redirectUri }),
    });

    return result.data?.auth_url || null;
  }

  /**
   * Execute a tool via MCP (e.g., send Slack message)
   */
  async executeTool(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    const result = await this.request<{ result: unknown }>('/tools/execute', {
      method: 'POST',
      body: JSON.stringify({
        tool_name: toolName,
        parameters: params,
      }),
    });

    if (result.success) {
      return { success: true, result: result.data?.result };
    }
    return { success: false, error: result.error };
  }

  /**
   * Execute a Rube recipe
   */
  async executeRecipe(
    recipeId: string,
    inputData?: Record<string, unknown>
  ): Promise<RecipeExecutionResult> {
    const result = await this.request<RecipeExecutionResult>(`/recipes/${recipeId}/execute`, {
      method: 'POST',
      body: JSON.stringify({ input_data: inputData }),
    });

    if (result.success && result.data) {
      return result.data;
    }
    return { success: false, error: result.error };
  }

  /**
   * List available recipes
   */
  async listRecipes(): Promise<Array<{ id: string; name: string; description?: string }>> {
    const result = await this.request<{ recipes: Array<{ id: string; name: string; description?: string }> }>('/recipes');
    return result.data?.recipes || [];
  }
}

// ============================================================================
// SLACK-SPECIFIC FUNCTIONS
// ============================================================================

let composioClient: ComposioClient | null = null;

/**
 * Get or create Composio client
 */
function getClient(): ComposioClient | null {
  if (composioClient) return composioClient;

  const apiKey = import.meta.env.VITE_COMPOSIO_API_KEY;
  if (!apiKey) return null;

  composioClient = new ComposioClient(apiKey);
  return composioClient;
}

/**
 * Check if Composio Slack is available
 */
export async function isSlackConnected(): Promise<boolean> {
  const client = getClient();
  if (!client) return false;

  const connection = await client.checkConnection('slack');
  return connection?.status === 'connected';
}

/**
 * Get Slack authorization URL (for OAuth connect flow)
 */
export async function getSlackAuthUrl(): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  return client.getAuthUrl('slack');
}

/**
 * Send interactive Slack message via Composio
 */
export async function sendInteractiveMessage(
  options: SlackMessageOptions
): Promise<{ success: boolean; ts?: string; error?: string }> {
  const client = getClient();
  if (!client) {
    return { success: false, error: 'Composio not configured' };
  }

  // Build Slack blocks with buttons if specified
  const blocks = options.blocks || [];

  if (options.buttons && options.buttons.length > 0) {
    blocks.push({
      type: 'actions',
      elements: options.buttons.map(btn => ({
        type: 'button',
        text: { type: 'plain_text', text: btn.text, emoji: true },
        action_id: btn.action_id,
        ...(btn.style && { style: btn.style }),
        ...(btn.url && { url: btn.url }),
      })),
    });
  }

  const result = await client.executeTool('SLACK_SEND_MESSAGE', {
    channel: options.channel,
    text: options.text,
    blocks: blocks.length > 0 ? blocks : undefined,
    thread_ts: options.thread_ts,
  });

  if (result.success) {
    return { success: true, ts: (result.result as any)?.ts };
  }
  return { success: false, error: result.error };
}

/**
 * Reply to a Slack thread
 */
export async function replyToThread(
  channel: string,
  threadTs: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  return sendInteractiveMessage({
    channel,
    text,
    thread_ts: threadTs,
  });
}

/**
 * Send direct message to user
 */
export async function sendDirectMessage(
  userId: string,
  text: string,
  blocks?: Record<string, unknown>[]
): Promise<{ success: boolean; error?: string }> {
  const client = getClient();
  if (!client) {
    return { success: false, error: 'Composio not configured' };
  }

  const result = await client.executeTool('SLACK_SEND_DM', {
    user_id: userId,
    text,
    blocks,
  });

  return { success: result.success, error: result.error };
}

/**
 * React to a message with emoji
 */
export async function addReaction(
  channel: string,
  timestamp: string,
  emoji: string
): Promise<{ success: boolean; error?: string }> {
  const client = getClient();
  if (!client) {
    return { success: false, error: 'Composio not configured' };
  }

  const result = await client.executeTool('SLACK_ADD_REACTION', {
    channel,
    timestamp,
    name: emoji.replace(/:/g, ''),
  });

  return { success: result.success, error: result.error };
}

/**
 * Upload file to Slack channel
 */
export async function uploadFile(
  channel: string,
  filename: string,
  content: string,
  title?: string
): Promise<{ success: boolean; error?: string }> {
  const client = getClient();
  if (!client) {
    return { success: false, error: 'Composio not configured' };
  }

  const result = await client.executeTool('SLACK_UPLOAD_FILE', {
    channels: channel,
    filename,
    content,
    title: title || filename,
  });

  return { success: result.success, error: result.error };
}

// ============================================================================
// RUBE RECIPE INTEGRATION
// ============================================================================

/**
 * Execute a Rube recipe and get results
 */
export async function executeRubeRecipe(
  recipeId: string,
  inputData?: Record<string, unknown>
): Promise<RecipeExecutionResult> {
  const client = getClient();
  if (!client) {
    return { success: false, error: 'Composio not configured' };
  }

  return client.executeRecipe(recipeId, inputData);
}

/**
 * List available Rube recipes
 */
export async function listRubeRecipes(): Promise<Array<{ id: string; name: string; description?: string }>> {
  const client = getClient();
  if (!client) return [];

  return client.listRecipes();
}

// ============================================================================
// MCP INTEGRATION FOR AI AGENTS
// ============================================================================

/**
 * Get MCP configuration for AI agent integration
 */
export async function getMCPConfig(): Promise<{
  available: boolean;
  url?: string;
  tools?: string[];
}> {
  const client = getClient();
  if (!client || !client.isConfigured()) {
    return { available: false };
  }

  const session = await client.getSession();
  if (!session) {
    return { available: false };
  }

  return {
    available: true,
    url: session.mcp_url,
    tools: session.tools_available,
  };
}

/**
 * Get full MCP server configuration for Claude Agent SDK
 */
export async function getAgentMCPConfig(): Promise<Record<string, unknown> | null> {
  const client = getClient();
  if (!client) return null;

  const mcpUrl = await client.getMCPUrl();
  if (!mcpUrl) return null;

  return {
    composio: {
      type: 'http',
      url: mcpUrl,
      headers: {
        'X-API-Key': import.meta.env.VITE_COMPOSIO_API_KEY,
      },
    },
  };
}

// ============================================================================
// WEBHOOK HANDLER FOR RUBE CALLBACKS
// ============================================================================

/**
 * Process incoming Rube webhook payload
 * Called by /rube-webhook edge function
 */
export interface RubeWebhookPayload {
  recipe_id: string;
  execution_id: string;
  output: Record<string, unknown>;
  timestamp: string;
}

export async function processRubeWebhook(
  payload: RubeWebhookPayload
): Promise<{ success: boolean; actions_taken?: string[] }> {
  const actions: string[] = [];

  // Log the webhook
  await supabase.from('rube_webhook_log').insert({
    recipe_id: payload.recipe_id,
    execution_id: payload.execution_id,
    payload: payload.output,
    received_at: new Date().toISOString(),
  }).catch(() => {
    // Table might not exist
  });

  // Process based on output schema
  const output = payload.output;

  // Example: If recipe returns PO status updates
  if (output.po_updates && Array.isArray(output.po_updates)) {
    for (const update of output.po_updates) {
      await supabase
        .from('po_tracking_events')
        .insert({
          po_id: update.po_id,
          event_type: 'rube_update',
          event_data: update,
          source: 'rube',
        });
      actions.push(`Updated PO ${update.po_id}`);
    }
  }

  // Example: If recipe returns inventory alerts
  if (output.inventory_alerts && Array.isArray(output.inventory_alerts)) {
    for (const alert of output.inventory_alerts) {
      await supabase
        .from('slack_alert_queue')
        .insert({
          alert_type: 'stockout',
          severity: alert.severity || 'medium',
          payload: alert,
          dedup_key: `rube:${alert.sku}:${payload.execution_id}`,
        });
      actions.push(`Queued alert for ${alert.sku}`);
    }
  }

  return { success: true, actions_taken: actions };
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

export function isComposioAvailable(): boolean {
  return Boolean(import.meta.env.VITE_COMPOSIO_API_KEY);
}

export { ComposioClient };
