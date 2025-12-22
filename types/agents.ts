/**
 * Agent & Skill Type Definitions
 *
 * Unified type system for managing AI agents and skills across:
 * - Claude Code CLI (.claude/agents/, .claude/skills/)
 * - In-app Agent Command Center
 * - MCP tool integrations
 */

// ============================================================
// AGENT TYPES
// ============================================================

export type AgentCategory =
  | 'inventory'      // Stock, purchasing, forecasting
  | 'compliance'     // Regulatory, labels, certifications
  | 'operations'     // PO tracking, email, vendors
  | 'quality'        // Code review, testing
  | 'analytics'      // Reporting, trends, metrics
  | 'custom';        // User-created

export type AutonomyLevel = 'monitor' | 'assist' | 'autonomous';

export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  mcpTool?: string;        // Optional MCP tool this capability uses
}

export interface AgentTrigger {
  type: 'keyword' | 'schedule' | 'event' | 'manual';
  value: string;           // Keyword phrase, cron expression, event name
  description?: string;
}

export interface AgentDefinition {
  // Identity
  id: string;
  identifier: string;      // Machine-readable: 'stock-intelligence'
  name: string;            // Display: 'Stock Intelligence Analyst'
  description: string;
  category: AgentCategory;
  icon?: string;           // Icon identifier or emoji

  // Behavior
  systemPrompt: string;
  autonomyLevel: AutonomyLevel;
  capabilities: AgentCapability[];
  triggers: AgentTrigger[];

  // Configuration
  parameters: Record<string, AgentParameter>;
  mcpTools?: string[];     // MCP tools this agent can access
  allowedTools?: string[]; // Claude Code tools (Bash, Read, etc.)

  // State
  isActive: boolean;
  trustScore: number;      // 0-1 confidence score
  isBuiltIn: boolean;      // System vs user-created
  version: string;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export interface AgentParameter {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'json';
  value: string | number | boolean | object;
  defaultValue?: string | number | boolean | object;
  options?: { label: string; value: string }[];  // For select type
  description?: string;
  required?: boolean;
}

// ============================================================
// SKILL TYPES
// ============================================================

export type SkillCategory = 'deployment' | 'quality' | 'security' | 'automation' | 'custom';

export interface SkillDefinition {
  // Identity
  id: string;
  identifier: string;      // Machine-readable: 'deploy'
  name: string;            // Display: 'Deploy to Main'
  command: string;         // CLI command: '/deploy'
  description: string;
  category: SkillCategory;
  icon?: string;

  // Behavior
  instructions: string;    // Markdown instructions (SKILL.md content)
  allowedTools: string[];  // ['Bash', 'Read', 'Glob', 'Write', 'Edit']

  // State
  isActive: boolean;
  isBuiltIn: boolean;
  usageCount: number;
  lastUsedAt?: Date;

  // Metadata
  version: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

// ============================================================
// WORKFLOW TYPES
// ============================================================

export interface WorkflowStep {
  id: string;
  type: 'agent' | 'skill' | 'condition' | 'action';
  agentId?: string;
  skillId?: string;
  action?: string;
  condition?: string;
  nextStepId?: string;
  onErrorStepId?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  icon?: string;
  schedule?: string;       // Cron expression
  steps: WorkflowStep[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// EXECUTION TYPES
// ============================================================

export interface AgentExecutionLog {
  id: string;
  agentId: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  tokensUsed?: number;
  error?: string;
}

export interface SkillExecutionLog {
  id: string;
  skillId: string;
  executedAt: Date;
  duration: number;        // milliseconds
  status: 'success' | 'failed';
  command: string;
  output?: string;
  error?: string;
}

// ============================================================
// TEMPLATE TYPES (for creating new agents/skills)
// ============================================================

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: AgentCategory;
  baseSystemPrompt: string;
  suggestedCapabilities: string[];
  suggestedTriggers: AgentTrigger[];
  suggestedParameters: AgentParameter[];
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'inventory-monitor',
    name: 'Inventory Monitor',
    description: 'Monitor stock levels and alert on low inventory',
    category: 'inventory',
    baseSystemPrompt: `You are an inventory monitoring agent for the MuRP system.

Your responsibilities:
- Monitor stock levels across all SKUs
- Alert when items fall below reorder points
- Track velocity trends and predict stockouts
- Suggest reorder quantities based on demand

Always filter out dropship items (is_dropship=true or category contains "dropship").
Use the inventory_velocity_summary view for sales velocity data.`,
    suggestedCapabilities: ['stock_monitoring', 'reorder_alerts', 'velocity_analysis'],
    suggestedTriggers: [
      { type: 'schedule', value: '0 6 * * *', description: 'Daily at 6 AM' },
      { type: 'keyword', value: 'stock level', description: 'User asks about stock' },
    ],
    suggestedParameters: [
      { key: 'alertThreshold', label: 'Alert Threshold (days)', type: 'number', value: 7 },
    ],
  },
  {
    id: 'email-processor',
    name: 'Email Processor',
    description: 'Process vendor emails and extract PO updates',
    category: 'operations',
    baseSystemPrompt: `You are an email processing agent for the MuRP system.

Your responsibilities:
- Monitor purchasing email inbox for vendor communications
- Extract tracking numbers, ETAs, and order confirmations
- Correlate emails to purchase orders
- Flag urgent issues requiring human attention

Key extraction patterns:
- Tracking numbers: UPS (1Z...), FedEx (7...), USPS (9...)
- Order references: PO-XXXX, Order #XXXX
- Dates: Shipping dates, expected delivery dates`,
    suggestedCapabilities: ['email_parsing', 'tracking_extraction', 'po_correlation'],
    suggestedTriggers: [
      { type: 'schedule', value: '*/15 * * * *', description: 'Every 15 minutes' },
      { type: 'event', value: 'new_email', description: 'New email received' },
    ],
    suggestedParameters: [
      { key: 'inboxFilter', label: 'Inbox Filter', type: 'string', value: 'from:vendor' },
    ],
  },
  {
    id: 'compliance-checker',
    name: 'Compliance Checker',
    description: 'Validate products against state regulations',
    category: 'compliance',
    baseSystemPrompt: `You are a regulatory compliance agent for the MuRP system.

Your responsibilities:
- Check product labels against state-specific requirements
- Monitor for regulatory updates from priority states
- Flag missing warnings or registration requirements
- Generate compliance reports for audits

Priority states: CA, OR, WA, NY, TX, NM
Regulatory domain: Fertilizer products`,
    suggestedCapabilities: ['label_validation', 'regulation_monitoring', 'compliance_reporting'],
    suggestedTriggers: [
      { type: 'keyword', value: 'compliance', description: 'User asks about compliance' },
      { type: 'manual', value: 'run_audit', description: 'Manual audit trigger' },
    ],
    suggestedParameters: [
      { key: 'priorityStates', label: 'Priority States', type: 'string', value: 'CA,OR,WA,NY,TX,NM' },
    ],
  },
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Convert an AgentDefinition to Claude Code agent markdown format
 */
export function agentToMarkdown(agent: AgentDefinition): string {
  return `---
name: ${agent.identifier}
description: ${agent.description}
tools: ${agent.allowedTools?.join(', ') || 'Read, Grep, Glob'}
model: inherit
---

${agent.systemPrompt}

## Capabilities

${agent.capabilities.map(c => `- **${c.name}**: ${c.description}`).join('\n')}

## Key Parameters

${Object.entries(agent.parameters).map(([key, param]) =>
    `- \`${key}\`: ${param.label} (${param.type}) = ${JSON.stringify(param.value)}`
  ).join('\n')}
`;
}

/**
 * Convert a SkillDefinition to Claude Code skill markdown format
 */
export function skillToMarkdown(skill: SkillDefinition): string {
  return `---
name: ${skill.identifier}
description: ${skill.description}
allowed-tools: ${skill.allowedTools.join(', ')}
---

# ${skill.name}

${skill.instructions}

## When to Use

- "${skill.command}"
`;
}

/**
 * Parse Claude Code agent markdown into AgentDefinition
 */
export function parseAgentMarkdown(markdown: string, id: string): Partial<AgentDefinition> {
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return { id };

  const frontmatter = frontmatterMatch[1];
  const body = markdown.slice(frontmatterMatch[0].length).trim();

  const nameMatch = frontmatter.match(/name:\s*(.+)/);
  const descMatch = frontmatter.match(/description:\s*(.+)/);
  const toolsMatch = frontmatter.match(/tools:\s*(.+)/);

  return {
    id,
    identifier: nameMatch?.[1]?.trim() || id,
    name: nameMatch?.[1]?.trim().replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || id,
    description: descMatch?.[1]?.trim() || '',
    systemPrompt: body,
    allowedTools: toolsMatch?.[1]?.split(',').map(t => t.trim()) || ['Read', 'Grep', 'Glob'],
    isBuiltIn: true,
    isActive: true,
    trustScore: 0.8,
    version: '1.0.0',
    category: 'custom',
    capabilities: [],
    triggers: [],
    parameters: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
