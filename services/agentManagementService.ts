/**
 * Agent Management Service
 *
 * Provides CRUD operations for agents and skills with:
 * - Database persistence (agent_definitions table)
 * - File sync for Claude Code (.claude/agents/, .claude/skills/)
 * - Import/export functionality
 */

import { supabase } from '../lib/supabase/client';
import type {
  AgentDefinition,
  SkillDefinition,
  AgentParameter,
  AgentCapability,
  AgentTrigger,
  AgentCategory,
  SkillCategory,
  AGENT_TEMPLATES,
} from '../types/agents';
import { agentToMarkdown, skillToMarkdown, parseAgentMarkdown } from '../types/agents';

// ============================================================
// BUILT-IN AGENTS (from .claude/agents/)
// ============================================================

const BUILT_IN_AGENTS: AgentDefinition[] = [
  {
    id: 'stock-intelligence-analyst',
    identifier: 'stock-intelligence-analyst',
    name: 'Stock Intelligence Analyst',
    description: 'Expert in inventory forecasting, ROP calculations, and purchasing guidance.',
    category: 'inventory',
    icon: 'chart-bar',
    systemPrompt: `You are an inventory intelligence specialist for the MuRP system.

## Your Expertise

- **Reorder Point (ROP) Calculations**: Z-score methodology in \`sku_purchasing_parameters\`
- **Sales Velocity Analysis**: \`inventory_velocity_summary\` view, 30/90 day comparisons
- **Forecasting**: \`forecastingService.ts\` for trend detection and seasonal patterns
- **Stockout Prevention**: \`stockoutPreventionAgent.ts\` for proactive alerts

## Filtering Rules (CRITICAL)

NEVER include dropship items in Stock Intelligence. Apply these filters:

1. \`is_dropship = false\`
2. Category not in: dropship, drop ship, ds, deprecating, deprecated, discontinued
3. Name doesn't contain "dropship" or "drop ship"
4. Status = 'active'

## Trend Calculation

\`\`\`typescript
const trend30 = (item.sales30Days || 0) / 30;
const trend90 = (item.sales90Days || 0) / 90;
const trendDirection = trend30 > trend90 * 1.15 ? 'up' :
                       trend30 < trend90 * 0.85 ? 'down' : 'stable';
\`\`\``,
    autonomyLevel: 'assist',
    capabilities: [
      { id: 'rop-calculation', name: 'ROP Calculation', description: 'Calculate reorder points using Z-score methodology' },
      { id: 'velocity-analysis', name: 'Velocity Analysis', description: 'Analyze 30/90 day sales velocity trends' },
      { id: 'stockout-prediction', name: 'Stockout Prediction', description: 'Predict potential stockouts before they occur' },
    ],
    triggers: [
      { type: 'keyword', value: 'reorder', description: 'When user asks about reordering' },
      { type: 'keyword', value: 'stock level', description: 'When user asks about stock levels' },
      { type: 'keyword', value: 'forecast', description: 'When user asks for forecasts' },
    ],
    parameters: {
      alertThreshold: { key: 'alertThreshold', label: 'Alert Threshold (days)', type: 'number', value: 7 },
      excludeDropship: { key: 'excludeDropship', label: 'Exclude Dropship', type: 'boolean', value: true },
    },
    mcpTools: ['get_reorder_recommendations', 'calculate_velocity'],
    allowedTools: ['Read', 'Grep', 'Glob', 'Bash'],
    isActive: true,
    trustScore: 0.88,
    isBuiltIn: true,
    version: '1.0.0',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'email-tracking-specialist',
    identifier: 'email-tracking-specialist',
    name: 'Email Tracking Specialist',
    description: 'Expert in PO email monitoring, Gmail integration, and vendor communication tracking.',
    category: 'operations',
    icon: 'mail',
    systemPrompt: `You are an email tracking specialist for the MuRP system.

## Your Expertise

- **Gmail OAuth Integration**: \`google-auth\` edge function, token management
- **Email Thread Correlation**: Linking emails to POs via \`email_threads\` table
- **Tracking Extraction**: Parsing tracking numbers from vendor emails
- **Alert Management**: Creating alerts for delays, backorders, exceptions

## Key Tables

- \`email_inbox_configs\` - Per-user inbox settings with OAuth tokens
- \`email_threads\` - Conversation threads linked to POs
- \`email_thread_messages\` - Individual messages with extracted data
- \`email_tracking_alerts\` - Alerts for delays, backorders, exceptions

## Tracking Number Patterns

- UPS: \`1Z[A-Z0-9]{16}\`
- FedEx: \`\\d{12,15}\`
- USPS: \`9[0-9]{21}\``,
    autonomyLevel: 'assist',
    capabilities: [
      { id: 'email-parsing', name: 'Email Parsing', description: 'Parse vendor emails for relevant information' },
      { id: 'tracking-extraction', name: 'Tracking Extraction', description: 'Extract tracking numbers from email content' },
      { id: 'po-correlation', name: 'PO Correlation', description: 'Match emails to purchase orders' },
    ],
    triggers: [
      { type: 'event', value: 'new_email', description: 'New email received in inbox' },
      { type: 'schedule', value: '*/15 * * * *', description: 'Every 15 minutes' },
    ],
    parameters: {
      inboxFilter: { key: 'inboxFilter', label: 'Inbox Filter', type: 'string', value: 'is:unread' },
    },
    mcpTools: ['get_po_email_threads', 'extract_tracking_from_email'],
    allowedTools: ['Read', 'Grep', 'Glob', 'Bash'],
    isActive: true,
    trustScore: 0.80,
    isBuiltIn: true,
    version: '1.0.0',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'schema-transformer-expert',
    identifier: 'schema-transformer-expert',
    name: 'Schema Transformer Expert',
    description: 'Expert in the 4-layer schema system (Raw → Parsed → Database → Display).',
    category: 'quality',
    icon: 'code',
    systemPrompt: `You are a schema transformation expert for the MuRP system.

## The 4-Layer Schema System

1. **Raw**: External data (CSV columns, API responses) - unvalidated
2. **Parsed**: Validated with Zod schemas, normalized to TypeScript types
3. **Database**: Supabase table format (snake_case), ready for insert/update
4. **Display**: UI-optimized with computed fields for rendering

## Transformation Pattern

\`\`\`typescript
const rawVendor = { 'Name': 'ABC Co.', 'Email address 0': 'test@abc.com' };
const parsed = transformVendorRawToParsed(rawVendor, 0);  // Raw → Parsed
const dbData = transformVendorParsedToDatabase(parsed.data);  // Parsed → Database
await supabase.from('vendors').insert(dbData);
\`\`\`

## Key Files

- \`lib/schema/transformers.ts\` - All transformation functions
- \`lib/schema/vendorSchema.ts\` - Vendor Zod schemas
- \`SCHEMA_ARCHITECTURE.md\` - Complete documentation`,
    autonomyLevel: 'monitor',
    capabilities: [
      { id: 'schema-validation', name: 'Schema Validation', description: 'Validate data against Zod schemas' },
      { id: 'transformation', name: 'Data Transformation', description: 'Transform data between schema layers' },
      { id: 'error-handling', name: 'Error Handling', description: 'Handle and report transformation errors' },
    ],
    triggers: [
      { type: 'keyword', value: 'schema', description: 'When user asks about schemas' },
      { type: 'keyword', value: 'transform', description: 'When user asks about data transformation' },
    ],
    parameters: {},
    allowedTools: ['Read', 'Grep', 'Glob', 'Bash'],
    isActive: true,
    trustScore: 0.92,
    isBuiltIn: true,
    version: '1.0.0',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// ============================================================
// BUILT-IN SKILLS (from .claude/skills/)
// ============================================================

const BUILT_IN_SKILLS: SkillDefinition[] = [
  {
    id: 'deploy',
    identifier: 'deploy',
    name: 'Deploy to Main',
    command: '/deploy',
    description: 'Build the project, commit all changes, and deploy to main via the claude/merge-to-main branch.',
    category: 'deployment',
    icon: 'rocket',
    instructions: `# Deploy to Main

Automates the complete deployment workflow for pushing changes to main.

## Workflow

1. **Build**: Run \`npm run build\` to ensure no compilation errors
2. **Status Check**: Check git status for uncommitted changes
3. **Commit**: Commit changes with a descriptive message
4. **Push**: Push to the current branch
5. **Merge Branch**: Checkout and merge into \`claude/merge-to-main\` branch
6. **Deploy**: Push to trigger PR creation and deployment
7. **Confirm**: Provide PR URL and deployment status`,
    allowedTools: ['Bash', 'Read', 'Glob', 'Write', 'Edit'],
    isActive: true,
    isBuiltIn: true,
    usageCount: 0,
    version: '1.0.0',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'code-review',
    identifier: 'code-review',
    name: 'Code Review',
    command: '/code-review',
    description: 'Review code for quality, security, and best practices.',
    category: 'quality',
    icon: 'code',
    instructions: `# Code Review

Performs comprehensive code review on recent changes.

## Review Criteria

1. **Code Quality**: Clean code principles, DRY, SOLID
2. **Security**: OWASP top 10, input validation, auth checks
3. **Performance**: Efficient algorithms, no memory leaks
4. **Best Practices**: TypeScript strictness, error handling
5. **Tests**: Coverage, edge cases, assertions`,
    allowedTools: ['Read', 'Glob', 'Grep', 'Bash'],
    isActive: true,
    isBuiltIn: true,
    usageCount: 0,
    version: '1.0.0',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'security-review',
    identifier: 'security-review',
    name: 'Security Review',
    command: '/security-review',
    description: 'Security audit for vulnerabilities, compliance issues, and sensitive data exposure.',
    category: 'security',
    icon: 'shield',
    instructions: `# Security Review

Comprehensive security audit of the codebase.

## Review Focus

1. **Authentication/Authorization**: Proper auth checks, session management
2. **Input Validation**: SQL injection, XSS, command injection
3. **Sensitive Data**: API keys, credentials, PII exposure
4. **Dependencies**: Known vulnerabilities in npm packages
5. **Configuration**: Secure defaults, no debug in production`,
    allowedTools: ['Read', 'Glob', 'Grep', 'Bash'],
    isActive: true,
    isBuiltIn: true,
    usageCount: 0,
    version: '1.0.0',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// ============================================================
// SERVICE FUNCTIONS
// ============================================================

/**
 * Get all agents (built-in + user-created from database)
 */
export async function getAllAgents(): Promise<AgentDefinition[]> {
  try {
    // Try to fetch user-created agents from database
    const { data: dbAgents, error } = await supabase
      .from('agent_definitions')
      .select('*')
      .order('name');

    if (error) {
      console.warn('agent_definitions table not found, using built-in only:', error.message);
      return BUILT_IN_AGENTS;
    }

    // Merge built-in with database agents
    const userAgents = (dbAgents || []).map(transformDbToAgent);
    return [...BUILT_IN_AGENTS, ...userAgents];
  } catch (err) {
    console.warn('Failed to fetch agents:', err);
    return BUILT_IN_AGENTS;
  }
}

/**
 * Get all skills (built-in + user-created from database)
 */
export async function getAllSkills(): Promise<SkillDefinition[]> {
  try {
    const { data: dbSkills, error } = await supabase
      .from('skill_definitions')
      .select('*')
      .order('name');

    if (error) {
      console.warn('skill_definitions table not found, using built-in only:', error.message);
      return BUILT_IN_SKILLS;
    }

    const userSkills = (dbSkills || []).map(transformDbToSkill);
    return [...BUILT_IN_SKILLS, ...userSkills];
  } catch (err) {
    console.warn('Failed to fetch skills:', err);
    return BUILT_IN_SKILLS;
  }
}

/**
 * Get a single agent by ID
 */
export async function getAgentById(id: string): Promise<AgentDefinition | null> {
  // Check built-in first
  const builtIn = BUILT_IN_AGENTS.find(a => a.id === id);
  if (builtIn) return builtIn;

  try {
    const { data, error } = await supabase
      .from('agent_definitions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return transformDbToAgent(data);
  } catch {
    return null;
  }
}

/**
 * Create a new agent
 */
export async function createAgent(agent: Omit<AgentDefinition, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; data?: AgentDefinition; error?: string }> {
  try {
    const newAgent = {
      identifier: agent.identifier,
      name: agent.name,
      description: agent.description,
      category: agent.category,
      icon: agent.icon,
      system_prompt: agent.systemPrompt,
      autonomy_level: agent.autonomyLevel,
      capabilities: agent.capabilities,
      triggers: agent.triggers,
      parameters: agent.parameters,
      mcp_tools: agent.mcpTools,
      allowed_tools: agent.allowedTools,
      is_active: agent.isActive,
      trust_score: agent.trustScore,
      is_built_in: false,
      version: agent.version || '1.0.0',
    };

    const { data, error } = await supabase
      .from('agent_definitions')
      .insert(newAgent)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: transformDbToAgent(data) };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Update an existing agent
 */
export async function updateAgent(id: string, updates: Partial<AgentDefinition>): Promise<{ success: boolean; error?: string }> {
  // Don't allow modifying built-in agents in database
  const builtIn = BUILT_IN_AGENTS.find(a => a.id === id);
  if (builtIn) {
    return { success: false, error: 'Cannot modify built-in agents. Clone it to create a custom version.' };
  }

  try {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name) dbUpdates.name = updates.name;
    if (updates.description) dbUpdates.description = updates.description;
    if (updates.category) dbUpdates.category = updates.category;
    if (updates.systemPrompt) dbUpdates.system_prompt = updates.systemPrompt;
    if (updates.autonomyLevel) dbUpdates.autonomy_level = updates.autonomyLevel;
    if (updates.capabilities) dbUpdates.capabilities = updates.capabilities;
    if (updates.triggers) dbUpdates.triggers = updates.triggers;
    if (updates.parameters) dbUpdates.parameters = updates.parameters;
    if (updates.mcpTools) dbUpdates.mcp_tools = updates.mcpTools;
    if (updates.allowedTools) dbUpdates.allowed_tools = updates.allowedTools;
    if (typeof updates.isActive === 'boolean') dbUpdates.is_active = updates.isActive;
    if (typeof updates.trustScore === 'number') dbUpdates.trust_score = updates.trustScore;
    dbUpdates.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('agent_definitions')
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Delete an agent
 */
export async function deleteAgent(id: string): Promise<{ success: boolean; error?: string }> {
  const builtIn = BUILT_IN_AGENTS.find(a => a.id === id);
  if (builtIn) {
    return { success: false, error: 'Cannot delete built-in agents.' };
  }

  try {
    const { error } = await supabase
      .from('agent_definitions')
      .delete()
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Clone a built-in agent to create a customizable version
 */
export async function cloneAgent(sourceId: string, newName: string): Promise<{ success: boolean; data?: AgentDefinition; error?: string }> {
  const source = await getAgentById(sourceId);
  if (!source) {
    return { success: false, error: 'Source agent not found' };
  }

  const cloned = {
    ...source,
    identifier: `${source.identifier}-custom`,
    name: newName,
    isBuiltIn: false,
    version: '1.0.0',
  };

  return createAgent(cloned);
}

/**
 * Export agent to markdown format (for .claude/agents/)
 */
export function exportAgentToMarkdown(agent: AgentDefinition): string {
  return agentToMarkdown(agent);
}

/**
 * Export skill to markdown format (for .claude/skills/)
 */
export function exportSkillToMarkdown(skill: SkillDefinition): string {
  return skillToMarkdown(skill);
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function transformDbToAgent(data: Record<string, unknown>): AgentDefinition {
  return {
    id: data.id as string,
    identifier: data.identifier as string,
    name: data.name as string,
    description: data.description as string,
    category: data.category as AgentCategory,
    icon: data.icon as string | undefined,
    systemPrompt: data.system_prompt as string,
    autonomyLevel: data.autonomy_level as AgentDefinition['autonomyLevel'],
    capabilities: data.capabilities as AgentCapability[] || [],
    triggers: data.triggers as AgentTrigger[] || [],
    parameters: data.parameters as Record<string, AgentParameter> || {},
    mcpTools: data.mcp_tools as string[] | undefined,
    allowedTools: data.allowed_tools as string[] | undefined,
    isActive: data.is_active as boolean,
    trustScore: data.trust_score as number,
    isBuiltIn: data.is_built_in as boolean,
    version: data.version as string,
    createdAt: new Date(data.created_at as string),
    updatedAt: new Date(data.updated_at as string),
    createdBy: data.created_by as string | undefined,
  };
}

function transformDbToSkill(data: Record<string, unknown>): SkillDefinition {
  return {
    id: data.id as string,
    identifier: data.identifier as string,
    name: data.name as string,
    command: data.command as string,
    description: data.description as string,
    category: data.category as SkillCategory,
    icon: data.icon as string | undefined,
    instructions: data.instructions as string,
    allowedTools: data.allowed_tools as string[],
    isActive: data.is_active as boolean,
    isBuiltIn: data.is_built_in as boolean,
    usageCount: data.usage_count as number,
    lastUsedAt: data.last_used_at ? new Date(data.last_used_at as string) : undefined,
    version: data.version as string,
    createdAt: new Date(data.created_at as string),
    updatedAt: new Date(data.updated_at as string),
    createdBy: data.created_by as string | undefined,
  };
}

export { BUILT_IN_AGENTS, BUILT_IN_SKILLS };
