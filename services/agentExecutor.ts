/**
 * Agent Executor Service
 * 
 * ARCHITECTURE: Provides a unified execution interface for all agents.
 * 
 * This service bridges the gap between:
 * - Agent definitions in the database (static configuration)
 * - Actual execution logic (TypeScript functions)
 * 
 * Each agent's capabilities map to specific executor functions.
 */

import { supabase } from '../lib/supabase/client';
import type { AgentDefinition, AgentCapability } from '../types/agents';
import { getCriticalStockoutAlerts, type StockoutAlert } from './stockoutPreventionAgent';
import { assessPODelay, type PODelayAlert } from './airTrafficControllerAgent';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface AgentExecutionContext {
  userId: string;
  parameters: Record<string, any>;
  triggerSource: 'manual' | 'scheduled' | 'event' | 'keyword';
  triggerValue?: string;
}

export interface AgentExecutionResult {
  success: boolean;
  agentId: string;
  agentName: string;
  executedAt: Date;
  durationMs: number;
  findings: AgentFinding[];
  actionsProposed: ProposedAction[];
  actionsExecuted: ExecutedAction[];
  error?: string;
}

export interface AgentFinding {
  type: 'alert' | 'recommendation' | 'info' | 'warning';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  data?: Record<string, any>;
}

export interface ProposedAction {
  id: string;
  type: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  data: Record<string, any>;
  requiresConfirmation: boolean;
}

export interface ExecutedAction {
  id: string;
  type: string;
  description: string;
  result: any;
}

// ═══════════════════════════════════════════════════════════════════════════
// Capability Executors Registry
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Registry of capability executors.
 * Each capability ID maps to a function that executes that capability.
 */
type CapabilityExecutor = (
  context: AgentExecutionContext,
  params: Record<string, any>
) => Promise<{
  findings: AgentFinding[];
  proposedActions: ProposedAction[];
}>;

const capabilityExecutors: Record<string, CapabilityExecutor> = {
  // Stock Intelligence capabilities
  'rop-calculation': async (ctx, params) => {
    // Placeholder - would call actual ROP calculation
    return {
      findings: [{
        type: 'info',
        severity: 'medium',
        title: 'ROP Calculation',
        description: 'Reorder point calculation completed',
      }],
      proposedActions: [],
    };
  },

  'velocity-analysis': async (ctx, params) => {
    // Placeholder - would call velocity analysis
    return {
      findings: [],
      proposedActions: [],
    };
  },

  'stockout-prediction': async (ctx, params) => {
    const alerts = await getCriticalStockoutAlerts();
    return {
      findings: alerts.map((alert: StockoutAlert) => ({
        type: 'alert' as const,
        severity: alert.daysUntilStockout <= 7 ? 'critical' as const : 'high' as const,
        title: `Stockout Risk: ${alert.sku}`,
        description: `${alert.productName} - ${alert.daysUntilStockout} days until stockout`,
        data: alert,
      })),
      proposedActions: alerts
        .filter((a: StockoutAlert) => a.suggestedOrderQty > 0)
        .map((alert: StockoutAlert) => ({
          id: `po-${alert.sku}-${Date.now()}`,
          type: 'create-po',
          description: `Create PO for ${alert.sku} - Qty: ${alert.suggestedOrderQty}`,
          priority: alert.daysUntilStockout <= 3 ? 'critical' as const : 'high' as const,
          data: {
            sku: alert.sku,
            quantity: alert.suggestedOrderQty,
            vendorId: alert.vendorId,
          },
          requiresConfirmation: true,
        })),
    };
  },

  // Email Tracking capabilities
  'email-parsing': async (ctx, params) => {
    return { findings: [], proposedActions: [] };
  },

  'tracking-extraction': async (ctx, params) => {
    return { findings: [], proposedActions: [] };
  },

  'po-correlation': async (ctx, params) => {
    return { findings: [], proposedActions: [] };
  },

  // Vendor Watchdog capabilities
  'vendor-scoring': async (ctx, params) => {
    return { findings: [], proposedActions: [] };
  },

  'lead-time-tracking': async (ctx, params) => {
    return { findings: [], proposedActions: [] };
  },

  'performance-alerts': async (ctx, params) => {
    return { findings: [], proposedActions: [] };
  },

  // PO Intelligence capabilities
  'po-tracking': async (ctx, params) => {
    return { findings: [], proposedActions: [] };
  },

  'consolidation': async (ctx, params) => {
    return { findings: [], proposedActions: [] };
  },

  'cost-optimization': async (ctx, params) => {
    return { findings: [], proposedActions: [] };
  },

  // Compliance capabilities
  'label-validation': async (ctx, params) => {
    return { findings: [], proposedActions: [] };
  },

  'document-tracking': async (ctx, params) => {
    return { findings: [], proposedActions: [] };
  },

  'regulatory-monitoring': async (ctx, params) => {
    return { findings: [], proposedActions: [] };
  },

  // Inventory Guardian capabilities
  'stock-monitoring': async (ctx, params) => {
    return { findings: [], proposedActions: [] };
  },

  'anomaly-detection': async (ctx, params) => {
    return { findings: [], proposedActions: [] };
  },

  'discrepancy-resolution': async (ctx, params) => {
    return { findings: [], proposedActions: [] };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Agent Executor
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute an agent by running all its capabilities
 */
export async function executeAgent(
  agent: AgentDefinition,
  context: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const allFindings: AgentFinding[] = [];
  const allProposed: ProposedAction[] = [];
  const allExecuted: ExecutedAction[] = [];

  try {
    // Execute each capability
    for (const capability of agent.capabilities) {
      const executor = capabilityExecutors[capability.id];
      
      if (!executor) {
        console.warn(`No executor found for capability: ${capability.id}`);
        continue;
      }

      try {
        const result = await executor(context, agent.parameters);
        allFindings.push(...result.findings);
        allProposed.push(...result.proposedActions);
      } catch (capError) {
        console.error(`Error executing capability ${capability.id}:`, capError);
        allFindings.push({
          type: 'warning',
          severity: 'medium',
          title: `Capability Error: ${capability.name}`,
          description: String(capError),
        });
      }
    }

    // If autonomy is 'autonomous' and trust score is high enough, execute actions
    if (agent.autonomyLevel === 'autonomous' && agent.trustScore >= 0.8) {
      for (const action of allProposed.filter(a => !a.requiresConfirmation)) {
        try {
          const result = await executeAction(action, context);
          allExecuted.push({
            id: action.id,
            type: action.type,
            description: action.description,
            result,
          });
        } catch (actionError) {
          console.error(`Error executing action ${action.id}:`, actionError);
        }
      }
    }

    // Log execution
    await logAgentExecution(agent.identifier, 'success', Date.now() - startTime, {
      findingsCount: allFindings.length,
      proposedCount: allProposed.length,
      executedCount: allExecuted.length,
    });

    return {
      success: true,
      agentId: agent.id,
      agentName: agent.name,
      executedAt: new Date(),
      durationMs: Date.now() - startTime,
      findings: allFindings,
      actionsProposed: allProposed,
      actionsExecuted: allExecuted,
    };

  } catch (error) {
    await logAgentExecution(agent.identifier, 'error', Date.now() - startTime, {
      error: String(error),
    });

    return {
      success: false,
      agentId: agent.id,
      agentName: agent.name,
      executedAt: new Date(),
      durationMs: Date.now() - startTime,
      findings: allFindings,
      actionsProposed: allProposed,
      actionsExecuted: allExecuted,
      error: String(error),
    };
  }
}

/**
 * Execute a single proposed action
 */
async function executeAction(
  action: ProposedAction,
  context: AgentExecutionContext
): Promise<any> {
  switch (action.type) {
    case 'create-po':
      // Would call PO creation service
      console.log('Creating PO:', action.data);
      return { success: true, poId: 'mock-po-id' };

    case 'send-email':
      // Would call email service
      console.log('Sending email:', action.data);
      return { success: true };

    case 'update-inventory':
      // Would call inventory update
      console.log('Updating inventory:', action.data);
      return { success: true };

    default:
      console.warn(`Unknown action type: ${action.type}`);
      return { success: false, error: 'Unknown action type' };
  }
}

/**
 * Log agent execution to database
 */
async function logAgentExecution(
  agentIdentifier: string,
  status: 'success' | 'error',
  durationMs: number,
  details: Record<string, any>
): Promise<void> {
  try {
    await supabase
      .from('agent_usage_tracking')
      .insert({
        agent_identifier: agentIdentifier,
        execution_status: status,
        execution_duration_ms: durationMs,
        execution_details: details,
      });
  } catch (error) {
    console.error('Failed to log agent execution:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Agent Lookup & Loading
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load an agent by identifier and execute it
 */
export async function executeAgentByIdentifier(
  identifier: string,
  context: AgentExecutionContext
): Promise<AgentExecutionResult | null> {
  const { data: agent, error } = await supabase
    .from('agent_definitions')
    .select('*')
    .eq('identifier', identifier)
    .eq('is_active', true)
    .single();

  if (error || !agent) {
    console.error(`Agent not found: ${identifier}`);
    return null;
  }

  // Transform database record to AgentDefinition
  const agentDef: AgentDefinition = {
    id: agent.id,
    identifier: agent.identifier,
    name: agent.name,
    description: agent.description,
    category: agent.category,
    icon: agent.icon,
    systemPrompt: agent.system_prompt,
    autonomyLevel: agent.autonomy_level,
    capabilities: agent.capabilities || [],
    triggers: agent.triggers || [],
    parameters: agent.parameters || {},
    mcpTools: agent.mcp_tools,
    allowedTools: agent.allowed_tools,
    isActive: agent.is_active,
    trustScore: agent.trust_score,
    isBuiltIn: agent.is_built_in,
    version: agent.version,
    createdAt: new Date(agent.created_at),
    updatedAt: new Date(agent.updated_at),
    createdBy: agent.created_by,
  };

  return executeAgent(agentDef, context);
}

/**
 * Register a new capability executor
 */
export function registerCapabilityExecutor(
  capabilityId: string,
  executor: CapabilityExecutor
): void {
  capabilityExecutors[capabilityId] = executor;
}

export { capabilityExecutors };
