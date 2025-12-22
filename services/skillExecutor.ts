/**
 * Skill Executor Service
 * 
 * ARCHITECTURE: Skills are documented workflows that can be invoked via commands.
 * 
 * Unlike agents (which have autonomous capabilities), skills are:
 * - Triggered by explicit commands (/deploy, /code-review, etc.)
 * - Contain step-by-step instructions in markdown format
 * - Guide the AI through a specific workflow
 * 
 * This service provides:
 * - Skill lookup by command or identifier
 * - Instruction parsing and validation
 * - Usage tracking
 */

import { supabase } from '../lib/supabase/client';
import type { SkillDefinition } from '../types/agents';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface SkillInvocation {
  skillId: string;
  command: string;
  instructions: string;
  allowedTools: string[];
  metadata: {
    name: string;
    description: string;
    version: string;
  };
}

export interface SkillMatch {
  found: boolean;
  skill?: SkillInvocation;
  suggestions?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Skill Cache
// ═══════════════════════════════════════════════════════════════════════════

let skillCache: Map<string, SkillDefinition> = new Map();
let cacheLastUpdated: Date | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function loadSkills(): Promise<Map<string, SkillDefinition>> {
  const now = new Date();
  
  if (cacheLastUpdated && (now.getTime() - cacheLastUpdated.getTime()) < CACHE_TTL_MS) {
    return skillCache;
  }

  try {
    const { data: skills, error } = await supabase
      .from('skill_definitions')
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.error('Failed to load skills:', error);
      return skillCache;
    }

    const cache = new Map<string, SkillDefinition>();
    
    for (const skill of skills || []) {
      const transformed: SkillDefinition = {
        id: skill.id,
        identifier: skill.identifier,
        name: skill.name,
        command: skill.command,
        description: skill.description,
        category: skill.category,
        icon: skill.icon,
        instructions: skill.instructions,
        allowedTools: skill.allowed_tools || [],
        isActive: skill.is_active,
        isBuiltIn: skill.is_built_in,
        usageCount: skill.usage_count || 0,
        version: skill.version,
        createdAt: new Date(skill.created_at),
        updatedAt: new Date(skill.updated_at),
        createdBy: skill.created_by,
      };
      
      // Index by both command and identifier
      cache.set(skill.command, transformed);
      cache.set(skill.identifier, transformed);
    }

    skillCache = cache;
    cacheLastUpdated = now;
    
    return cache;
  } catch (err) {
    console.error('Error loading skills:', err);
    return skillCache;
  }
}

export function clearSkillCache(): void {
  skillCache.clear();
  cacheLastUpdated = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Skill Lookup Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find a skill by its command (e.g., /deploy)
 */
export async function findSkillByCommand(command: string): Promise<SkillMatch> {
  const cache = await loadSkills();
  
  // Normalize command (ensure starts with /)
  const normalizedCommand = command.startsWith('/') ? command : `/${command}`;
  
  const skill = cache.get(normalizedCommand);
  
  if (skill) {
    await trackUsage(skill.identifier);
    
    return {
      found: true,
      skill: {
        skillId: skill.id,
        command: skill.command,
        instructions: skill.instructions,
        allowedTools: skill.allowedTools,
        metadata: {
          name: skill.name,
          description: skill.description,
          version: skill.version,
        },
      },
    };
  }

  // No exact match - provide suggestions
  const allSkills = Array.from(cache.values());
  const uniqueSkills = allSkills.filter((s, i, arr) => 
    arr.findIndex(x => x.identifier === s.identifier) === i
  );
  
  const suggestions = uniqueSkills
    .map(s => s.command)
    .filter(cmd => cmd.includes(normalizedCommand.slice(1))); // Remove / for matching

  return {
    found: false,
    suggestions: suggestions.length > 0 ? suggestions : uniqueSkills.map(s => s.command),
  };
}

/**
 * Find a skill by identifier
 */
export async function findSkillByIdentifier(identifier: string): Promise<SkillDefinition | null> {
  const cache = await loadSkills();
  return cache.get(identifier) || null;
}

/**
 * Get all available skills
 */
export async function getAllSkills(): Promise<SkillDefinition[]> {
  const cache = await loadSkills();
  
  // Get unique skills (since we index by both command and identifier)
  const seen = new Set<string>();
  const skills: SkillDefinition[] = [];
  
  for (const skill of cache.values()) {
    if (!seen.has(skill.identifier)) {
      seen.add(skill.identifier);
      skills.push(skill);
    }
  }
  
  return skills;
}

/**
 * Get skills by category
 */
export async function getSkillsByCategory(category: string): Promise<SkillDefinition[]> {
  const skills = await getAllSkills();
  return skills.filter(s => s.category === category);
}

// ═══════════════════════════════════════════════════════════════════════════
// Usage Tracking
// ═══════════════════════════════════════════════════════════════════════════

async function trackUsage(skillIdentifier: string): Promise<void> {
  try {
    await supabase
      .from('skill_definitions')
      .update({
        usage_count: supabase.rpc('increment_usage_count'),
        last_used_at: new Date().toISOString(),
      })
      .eq('identifier', skillIdentifier);
  } catch (err) {
    // Non-critical - don't fail skill lookup if tracking fails
    console.warn('Failed to track skill usage:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Skill Instruction Parsing
// ═══════════════════════════════════════════════════════════════════════════

export interface ParsedSkillInstructions {
  title: string;
  description: string;
  steps: string[];
  safetyChecks: string[];
  requiredTools: string[];
}

/**
 * Parse skill instructions markdown into structured format
 */
export function parseSkillInstructions(instructions: string): ParsedSkillInstructions {
  const lines = instructions.split('\n');
  
  const result: ParsedSkillInstructions = {
    title: '',
    description: '',
    steps: [],
    safetyChecks: [],
    requiredTools: [],
  };

  let currentSection = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Title (# heading)
    if (trimmed.startsWith('# ')) {
      result.title = trimmed.slice(2);
      continue;
    }
    
    // Section headers (## heading)
    if (trimmed.startsWith('## ')) {
      currentSection = trimmed.slice(3).toLowerCase();
      continue;
    }
    
    // Skip empty lines
    if (!trimmed) continue;
    
    // Description (text before first section)
    if (!currentSection && !trimmed.startsWith('-') && !trimmed.startsWith('*')) {
      result.description += (result.description ? ' ' : '') + trimmed;
      continue;
    }
    
    // List items
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const item = trimmed.slice(2);
      
      if (currentSection.includes('workflow') || currentSection.includes('step')) {
        result.steps.push(item);
      } else if (currentSection.includes('safety') || currentSection.includes('check')) {
        result.safetyChecks.push(item);
      }
    }
    
    // Numbered items
    const numberedMatch = trimmed.match(/^\d+\.\s+\*\*(.+?)\*\*:\s*(.+)$/);
    if (numberedMatch) {
      result.steps.push(`${numberedMatch[1]}: ${numberedMatch[2]}`);
    } else {
      const simpleNumbered = trimmed.match(/^\d+\.\s+(.+)$/);
      if (simpleNumbered) {
        result.steps.push(simpleNumbered[1]);
      }
    }
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Skill Registration (for custom skills)
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateSkillInput {
  identifier: string;
  name: string;
  command: string;
  description: string;
  category: string;
  instructions: string;
  allowedTools: string[];
  icon?: string;
}

export async function createSkill(input: CreateSkillInput): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('skill_definitions')
      .insert({
        identifier: input.identifier,
        name: input.name,
        command: input.command,
        description: input.description,
        category: input.category,
        instructions: input.instructions,
        allowed_tools: input.allowedTools,
        icon: input.icon,
        is_active: true,
        is_built_in: false,
        version: '1.0.0',
      });

    if (error) {
      return { success: false, error: error.message };
    }

    clearSkillCache();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
