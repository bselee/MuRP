// ============================================================================
// Settings Service - Manage app-wide configuration
// ============================================================================

import { supabase } from './supabaseClient';

export interface AppSetting {
  id: string;
  setting_key: string;
  setting_category: string;
  setting_value: any;
  display_name: string;
  description?: string;
  is_secret: boolean;
  is_required: boolean;
  created_at: string;
  updated_at: string;
}

export interface MCPServerConfig {
  id: string;
  server_name: string;
  server_type: string;
  display_name: string;
  description?: string;
  endpoint_url?: string;
  is_local: boolean;
  command?: string;
  working_directory?: string;
  environment_vars?: Record<string, string>;
  settings?: any;
  override_ai_provider: boolean;
  ai_provider_config?: any;
  is_enabled: boolean;
  status: string;
  last_health_check?: string;
  health_status?: string;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
}

export interface ScrapingConfig {
  id: string;
  config_name: string;
  description?: string;
  base_url: string;
  url_pattern?: string;
  domain?: string;
  selectors: Record<string, string>;
  pagination?: any;
  rate_limit_ms: number;
  user_agent: string;
  data_transformations?: any;
  required_keywords?: string[];
  exclude_patterns?: string[];
  use_ai_extraction: boolean;
  ai_extraction_prompt?: string;
  min_content_length: number;
  save_to_table?: string;
  field_mappings?: any;
  is_active: boolean;
  last_run_at?: string;
  last_success_at?: string;
  success_rate?: number;
  schedule_cron?: string;
  next_run_at?: string;
}

export interface ScrapingJob {
  id: string;
  config_id: string;
  job_type: string;
  url: string;
  parameters?: any;
  status: string;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  items_found: number;
  items_saved: number;
  items_skipped: number;
  raw_data?: any;
  processed_data?: any;
  validation_errors?: any[];
  ai_calls_made: number;
  ai_tokens_used: number;
  ai_cost_usd: number;
  error_message?: string;
  created_at: string;
}

// ============================================================================
// App Settings
// ============================================================================

export async function getAppSettings(category?: string): Promise<AppSetting[]> {
  let query = supabase.from('app_settings').select('*');

  if (category) {
    query = query.eq('setting_category', category);
  }

  const { data, error } = await query.order('setting_key');

  if (error) throw new Error(`Failed to fetch settings: ${error.message}`);
  return data || [];
}

export async function getAppSetting(key: string): Promise<AppSetting | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .eq('setting_key', key)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch setting: ${error.message}`);
  }

  return data;
}

export async function updateAppSetting(
  key: string,
  value: any,
  changeReason?: string
): Promise<void> {
  const currentSetting = await getAppSetting(key);

  const { error } = await supabase
    .from('app_settings')
    .update({
      setting_value: value,
      previous_value: currentSetting?.setting_value,
      change_reason: changeReason,
      updated_at: new Date().toISOString(),
    })
    .eq('setting_key', key);

  if (error) throw new Error(`Failed to update setting: ${error.message}`);
}

// ============================================================================
// MCP Server Management
// ============================================================================

export async function getMCPServers(): Promise<MCPServerConfig[]> {
  const { data, error } = await supabase
    .from('mcp_server_configs')
    .select('*')
    .order('server_name');

  if (error) throw new Error(`Failed to fetch MCP servers: ${error.message}`);
  return data || [];
}

export async function getMCPServer(serverName: string): Promise<MCPServerConfig | null> {
  const { data, error } = await supabase
    .from('mcp_server_configs')
    .select('*')
    .eq('server_name', serverName)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch MCP server: ${error.message}`);
  }

  return data;
}

export async function updateMCPServer(
  serverName: string,
  updates: Partial<MCPServerConfig>
): Promise<void> {
  const { error } = await supabase
    .from('mcp_server_configs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('server_name', serverName);

  if (error) throw new Error(`Failed to update MCP server: ${error.message}`);
}

export async function startMCPServer(serverName: string): Promise<void> {
  // Update status to starting
  await updateMCPServer(serverName, {
    status: 'starting',
  } as any);

  // TODO: Implement actual server start logic
  // This would typically call a backend endpoint that spawns the process
  console.log(`Starting MCP server: ${serverName}`);

  // Simulate start delay
  setTimeout(async () => {
    await updateMCPServer(serverName, {
      status: 'running',
      health_status: 'healthy',
      last_health_check: new Date().toISOString(),
    } as any);
  }, 2000);
}

export async function stopMCPServer(serverName: string): Promise<void> {
  await updateMCPServer(serverName, {
    status: 'stopped',
  } as any);

  // TODO: Implement actual server stop logic
  console.log(`Stopping MCP server: ${serverName}`);
}

export async function restartMCPServer(serverName: string): Promise<void> {
  await stopMCPServer(serverName);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await startMCPServer(serverName);
}

export async function checkMCPServerHealth(serverName: string): Promise<boolean> {
  const server = await getMCPServer(serverName);
  if (!server) return false;

  // TODO: Implement actual health check (ping endpoint, check process)
  const isHealthy = server.status === 'running';

  await updateMCPServer(serverName, {
    health_status: isHealthy ? 'healthy' : 'unhealthy',
    last_health_check: new Date().toISOString(),
  } as any);

  return isHealthy;
}

// ============================================================================
// Scraping Configuration Management
// ============================================================================

export async function getScrapingConfigs(): Promise<ScrapingConfig[]> {
  const { data, error } = await supabase
    .from('scraping_configs')
    .select('*')
    .order('config_name');

  if (error) throw new Error(`Failed to fetch scraping configs: ${error.message}`);
  return data || [];
}

export async function getScrapingConfig(id: string): Promise<ScrapingConfig | null> {
  const { data, error } = await supabase
    .from('scraping_configs')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch scraping config: ${error.message}`);
  }

  return data;
}

export async function createScrapingConfig(
  config: Omit<ScrapingConfig, 'id' | 'created_at' | 'updated_at'>
): Promise<string> {
  const { data, error } = await supabase
    .from('scraping_configs')
    .insert(config)
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create scraping config: ${error.message}`);
  return data.id;
}

export async function updateScrapingConfig(
  id: string,
  updates: Partial<ScrapingConfig>
): Promise<void> {
  const { error } = await supabase
    .from('scraping_configs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`Failed to update scraping config: ${error.message}`);
}

export async function deleteScrapingConfig(id: string): Promise<void> {
  const { error } = await supabase.from('scraping_configs').delete().eq('id', id);

  if (error) throw new Error(`Failed to delete scraping config: ${error.message}`);
}

// ============================================================================
// Scraping Job Management
// ============================================================================

export async function getScrapingJobs(configId?: string): Promise<ScrapingJob[]> {
  let query = supabase.from('scraping_jobs').select('*');

  if (configId) {
    query = query.eq('config_id', configId);
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(100);

  if (error) throw new Error(`Failed to fetch scraping jobs: ${error.message}`);
  return data || [];
}

export async function getScrapingJob(id: string): Promise<ScrapingJob | null> {
  const { data, error } = await supabase
    .from('scraping_jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch scraping job: ${error.message}`);
  }

  return data;
}

export async function createScrapingJob(
  configId: string,
  url: string,
  parameters?: any
): Promise<string> {
  const { data, error } = await supabase
    .from('scraping_jobs')
    .insert({
      config_id: configId,
      job_type: 'manual',
      url,
      parameters,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create scraping job: ${error.message}`);
  return data.id;
}

export async function runScrapingJob(configId: string, url: string): Promise<string> {
  const jobId = await createScrapingJob(configId, url);

  // TODO: Trigger actual scraping via MCP server
  console.log(`Running scraping job: ${jobId}`);

  // Simulate job execution
  setTimeout(async () => {
    const { error } = await supabase
      .from('scraping_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        duration_ms: 5000,
        items_found: 10,
        items_saved: 10,
      })
      .eq('id', jobId);

    if (error) console.error('Failed to update job status:', error);
  }, 5000);

  return jobId;
}

// ============================================================================
// MCP Tool Call Logging
// ============================================================================

export async function logMCPToolCall(
  serverName: string,
  toolName: string,
  args: any,
  result: any,
  status: 'success' | 'error',
  durationMs: number,
  aiUsage?: { provider: string; model: string; tokens: number; costUsd: number }
): Promise<void> {
  const { error } = await supabase.from('mcp_tool_calls').insert({
    server_name: serverName,
    tool_name: toolName,
    arguments: args,
    status,
    result: status === 'success' ? result : null,
    error_message: status === 'error' ? result?.message : null,
    error_stack: status === 'error' ? result?.stack : null,
    started_at: new Date(Date.now() - durationMs).toISOString(),
    completed_at: new Date().toISOString(),
    duration_ms: durationMs,
    ai_provider: aiUsage?.provider,
    ai_model: aiUsage?.model,
    ai_tokens_used: aiUsage?.tokens || 0,
    ai_cost_usd: aiUsage?.costUsd || 0,
  });

  if (error) console.error('Failed to log MCP tool call:', error);
}

export async function getMCPToolCalls(
  serverName?: string,
  limit: number = 100
): Promise<any[]> {
  let query = supabase.from('mcp_tool_calls').select('*');

  if (serverName) {
    query = query.eq('server_name', serverName);
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);

  if (error) throw new Error(`Failed to fetch MCP tool calls: ${error.message}`);
  return data || [];
}
