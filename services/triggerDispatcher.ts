/**
 * Trigger Dispatcher Service
 * 
 * ARCHITECTURE: Routes events and keywords to appropriate agents.
 * 
 * Reads trigger configurations from agent_definitions table and
 * dispatches incoming events/keywords to matching agents.
 * 
 * Trigger Types:
 * - keyword: Matches user input patterns
 * - event: Matches system events (po_created, stock_low, etc.)
 * - schedule: Cron-based execution (handled by edge functions)
 * - manual: Direct user invocation
 */

import { supabase } from '../lib/supabase/client';
import type { AgentDefinition, AgentTrigger } from '../types/agents';
import { executeAgentByIdentifier, type AgentExecutionContext, type AgentExecutionResult } from './agentExecutor';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface TriggerEvent {
  type: 'keyword' | 'event' | 'manual';
  value: string;
  data?: Record<string, any>;
  userId: string;
}

export interface DispatchResult {
  triggered: boolean;
  matchedAgents: string[];
  executionResults: AgentExecutionResult[];
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Trigger Cache (in-memory cache of trigger mappings)
// ═══════════════════════════════════════════════════════════════════════════

interface TriggerMapping {
  agentIdentifier: string;
  agentName: string;
  trigger: AgentTrigger;
}

let triggerCache: TriggerMapping[] = [];
let cacheLastUpdated: Date | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load trigger mappings from database
 */
async function loadTriggerMappings(): Promise<TriggerMapping[]> {
  const now = new Date();
  
  // Return cached if still valid
  if (cacheLastUpdated && (now.getTime() - cacheLastUpdated.getTime()) < CACHE_TTL_MS) {
    return triggerCache;
  }

  try {
    const { data: agents, error } = await supabase
      .from('agent_definitions')
      .select('identifier, name, triggers')
      .eq('is_active', true);

    if (error) {
      console.error('Failed to load trigger mappings:', error);
      return triggerCache; // Return stale cache
    }

    const mappings: TriggerMapping[] = [];
    
    for (const agent of agents || []) {
      const triggers = agent.triggers as AgentTrigger[] || [];
      for (const trigger of triggers) {
        mappings.push({
          agentIdentifier: agent.identifier,
          agentName: agent.name,
          trigger,
        });
      }
    }

    triggerCache = mappings;
    cacheLastUpdated = now;
    
    return mappings;
  } catch (err) {
    console.error('Error loading trigger mappings:', err);
    return triggerCache;
  }
}

/**
 * Clear the trigger cache (call after agent updates)
 */
export function clearTriggerCache(): void {
  triggerCache = [];
  cacheLastUpdated = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Trigger Matching
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find agents that match a keyword trigger
 */
async function matchKeywordTrigger(keyword: string): Promise<TriggerMapping[]> {
  const mappings = await loadTriggerMappings();
  const normalizedKeyword = keyword.toLowerCase().trim();
  
  return mappings.filter(m => {
    if (m.trigger.type !== 'keyword') return false;
    
    const triggerValue = m.trigger.value.toLowerCase();
    
    // Match if keyword contains the trigger value
    // e.g., "what's my stock level" matches trigger "stock level"
    return normalizedKeyword.includes(triggerValue);
  });
}

/**
 * Find agents that match an event trigger
 */
async function matchEventTrigger(eventName: string): Promise<TriggerMapping[]> {
  const mappings = await loadTriggerMappings();
  
  return mappings.filter(m => {
    if (m.trigger.type !== 'event') return false;
    return m.trigger.value === eventName;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Dispatcher Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dispatch a trigger event to matching agents
 */
export async function dispatch(event: TriggerEvent): Promise<DispatchResult> {
  const result: DispatchResult = {
    triggered: false,
    matchedAgents: [],
    executionResults: [],
    errors: [],
  };

  try {
    let matches: TriggerMapping[] = [];

    switch (event.type) {
      case 'keyword':
        matches = await matchKeywordTrigger(event.value);
        break;
      case 'event':
        matches = await matchEventTrigger(event.value);
        break;
      case 'manual':
        // Manual trigger - execute specific agent by identifier
        matches = [{
          agentIdentifier: event.value,
          agentName: event.value,
          trigger: { type: 'manual', value: event.value },
        }];
        break;
    }

    if (matches.length === 0) {
      return result;
    }

    result.triggered = true;
    result.matchedAgents = matches.map(m => m.agentIdentifier);

    // Execute each matched agent (in parallel for event triggers, sequential for keywords)
    const context: AgentExecutionContext = {
      userId: event.userId,
      parameters: event.data || {},
      triggerSource: event.type,
      triggerValue: event.value,
    };

    if (event.type === 'event') {
      // Events can trigger multiple agents in parallel
      const execPromises = matches.map(m => 
        executeAgentByIdentifier(m.agentIdentifier, context)
          .catch(err => {
            result.errors.push(`${m.agentIdentifier}: ${err}`);
            return null;
          })
      );
      
      const results = await Promise.all(execPromises);
      result.executionResults = results.filter((r): r is AgentExecutionResult => r !== null);
    } else {
      // Keywords execute sequentially (first match wins for now)
      // Could be extended to let user choose which agent to invoke
      const firstMatch = matches[0];
      const execResult = await executeAgentByIdentifier(firstMatch.agentIdentifier, context);
      if (execResult) {
        result.executionResults.push(execResult);
      }
    }

    return result;

  } catch (error) {
    result.errors.push(String(error));
    return result;
  }
}

/**
 * Dispatch a keyword trigger (convenience function)
 */
export async function dispatchKeyword(
  keyword: string,
  userId: string,
  data?: Record<string, any>
): Promise<DispatchResult> {
  return dispatch({
    type: 'keyword',
    value: keyword,
    userId,
    data,
  });
}

/**
 * Dispatch an event trigger (convenience function)
 */
export async function dispatchEvent(
  eventName: string,
  userId: string,
  data?: Record<string, any>
): Promise<DispatchResult> {
  return dispatch({
    type: 'event',
    value: eventName,
    userId,
    data,
  });
}

/**
 * Manually invoke an agent by identifier
 */
export async function invokeAgent(
  agentIdentifier: string,
  userId: string,
  data?: Record<string, any>
): Promise<DispatchResult> {
  return dispatch({
    type: 'manual',
    value: agentIdentifier,
    userId,
    data,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Event Names (commonly used system events)
// ═══════════════════════════════════════════════════════════════════════════

export const SystemEvents = {
  // Purchase Order events
  PO_CREATED: 'po_created',
  PO_SENT: 'po_sent',
  PO_RECEIVED: 'po_received',
  PO_DELAYED: 'po_delayed',
  
  // Inventory events
  STOCK_LOW: 'stock_low',
  STOCK_ADJUSTMENT: 'stock_adjustment',
  STOCKOUT_RISK: 'stockout_risk',
  
  // Email events
  NEW_EMAIL: 'new_email',
  TRACKING_RECEIVED: 'tracking_received',
  BACKORDER_DETECTED: 'backorder_detected',
  
  // Vendor events
  VENDOR_RESPONSE: 'vendor_response',
  LEAD_TIME_UPDATED: 'lead_time_updated',
  
  // Compliance events
  COMPLIANCE_EXPIRING: 'compliance_expiring',
  REGULATION_CHANGE: 'regulation_change',
} as const;

export type SystemEventName = typeof SystemEvents[keyof typeof SystemEvents];
