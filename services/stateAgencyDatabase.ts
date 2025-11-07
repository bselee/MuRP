// State Agency Database Service
// In-memory storage for state agency contact information
// In production, this would be backed by Supabase

import type { StateAgency, StateCorrespondence, StateRegulation } from '../types/stateRegulatory';
import { ALL_US_STATES, STATE_NAMES } from '../types/stateRegulatory';

// In-memory storage
const stateAgencies = new Map<string, StateAgency>();
const stateCorrespondence = new Map<string, StateCorrespondence>();
const stateRegulations = new Map<string, StateRegulation>();

/**
 * Initialize database with skeleton entries for all 50 states
 */
export function initializeStateDatabase(): void {
  for (const stateCode of ALL_US_STATES) {
    if (!stateAgencies.has(stateCode)) {
      // Create placeholder agency
      const agency: StateAgency = {
        id: `agency-${stateCode}`,
        stateCode,
        stateName: STATE_NAMES[stateCode],
        departmentName: `${STATE_NAMES[stateCode]} Department of Agriculture`,
        mailingAddress: {
          street: '',
          city: '',
          state: stateCode,
          zip: ''
        },
        phone: '',
        email: '',
        website: '',
        regulatoryNotes: 'Not yet researched',
        commonIssues: [],
        averageResponseTime: 'Unknown',
        strictnessLevel: 'medium',
        registrationProcess: {
          steps: [],
          requiredForms: [],
          fees: 'Unknown',
          typicalTimeline: 'Unknown',
          notes: 'Not yet researched'
        },
        lastVerified: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        dataSource: 'manual_entry',
        updateHistory: []
      };

      stateAgencies.set(stateCode, agency);
    }
  }

  console.log('[State Database] Initialized with 50 state placeholders');
}

/**
 * Get agency by state code
 */
export function getStateAgency(stateCode: string): StateAgency | null {
  return stateAgencies.get(stateCode) || null;
}

/**
 * Get all state agencies
 */
export function getAllStateAgencies(): StateAgency[] {
  return Array.from(stateAgencies.values());
}

/**
 * Save or update state agency
 */
export function saveStateAgency(agency: StateAgency): void {
  stateAgencies.set(agency.stateCode, agency);
  console.log(`[State Database] Saved agency for ${agency.stateName}`);
}

/**
 * Update specific fields of a state agency
 */
export function updateStateAgency(
  stateCode: string,
  updates: Partial<StateAgency>,
  updatedBy: string
): StateAgency | null {
  const existing = stateAgencies.get(stateCode);
  if (!existing) return null;

  // Track what changed
  const updateHistory = [...existing.updateHistory];
  for (const [key, value] of Object.entries(updates)) {
    const oldValue = (existing as any)[key];
    if (oldValue !== value) {
      updateHistory.push({
        date: new Date().toISOString(),
        field: key,
        oldValue: JSON.stringify(oldValue),
        newValue: JSON.stringify(value),
        updatedBy
      });
    }
  }

  const updated: StateAgency = {
    ...existing,
    ...updates,
    lastUpdated: new Date().toISOString(),
    updateHistory
  };

  stateAgencies.set(stateCode, updated);
  console.log(`[State Database] Updated agency for ${updated.stateName}`);

  return updated;
}

/**
 * Mark agency as verified by user
 */
export function verifyStateAgency(stateCode: string, verifiedBy: string): StateAgency | null {
  return updateStateAgency(stateCode, {
    lastVerified: new Date().toISOString(),
    verifiedBy
  }, verifiedBy);
}

/**
 * Get states that need updating (haven't been verified in N days)
 */
export function getStaleStateAgencies(daysOld: number = 90): StateAgency[] {
  const now = new Date();
  const cutoff = new Date(now.getTime() - daysOld * 24 * 60 * 60 * 1000);

  return Array.from(stateAgencies.values()).filter(agency => {
    const lastVerified = new Date(agency.lastVerified);
    return lastVerified < cutoff;
  });
}

/**
 * Get states by strictness level
 */
export function getStatesByStrictness(level: StateAgency['strictnessLevel']): StateAgency[] {
  return Array.from(stateAgencies.values()).filter(
    agency => agency.strictnessLevel === level
  );
}

/**
 * Search agencies by keyword
 */
export function searchStateAgencies(query: string): StateAgency[] {
  const lowerQuery = query.toLowerCase();

  return Array.from(stateAgencies.values()).filter(agency => {
    const searchText = [
      agency.stateName,
      agency.departmentName,
      agency.regulatoryNotes,
      agency.commonIssues.join(' ')
    ].join(' ').toLowerCase();

    return searchText.includes(lowerQuery);
  });
}

// ============================================================================
// CORRESPONDENCE MANAGEMENT
// ============================================================================

/**
 * Save state correspondence (letter)
 */
export function saveCorrespondence(letter: StateCorrespondence): void {
  stateCorrespondence.set(letter.id, letter);
  console.log(`[State Database] Saved correspondence ${letter.id} for ${letter.stateCode}`);
}

/**
 * Get correspondence by ID
 */
export function getCorrespondence(id: string): StateCorrespondence | null {
  return stateCorrespondence.get(id) || null;
}

/**
 * Get all correspondence for a state
 */
export function getCorrespondenceByState(stateCode: string): StateCorrespondence[] {
  return Array.from(stateCorrespondence.values()).filter(
    letter => letter.stateCode === stateCode
  );
}

/**
 * Get correspondence by severity
 */
export function getCorrespondenceBySeverity(
  severity: 'info' | 'warning' | 'urgent' | 'critical'
): StateCorrespondence[] {
  return Array.from(stateCorrespondence.values()).filter(
    letter => letter.aiAnalysis?.severity === severity
  );
}

/**
 * Get unresolved correspondence
 */
export function getUnresolvedCorrespondence(): StateCorrespondence[] {
  return Array.from(stateCorrespondence.values()).filter(
    letter => letter.status !== 'resolved' && letter.status !== 'archived'
  );
}

/**
 * Update correspondence status
 */
export function updateCorrespondenceStatus(
  id: string,
  status: StateCorrespondence['status'],
  resolution?: string
): StateCorrespondence | null {
  const existing = stateCorrespondence.get(id);
  if (!existing) return null;

  const updated: StateCorrespondence = {
    ...existing,
    status,
    resolution,
    updatedAt: new Date().toISOString()
  };

  stateCorrespondence.set(id, updated);
  return updated;
}

// ============================================================================
// REGULATIONS MANAGEMENT
// ============================================================================

/**
 * Save regulation
 */
export function saveRegulation(regulation: StateRegulation): void {
  stateRegulations.set(regulation.id, regulation);
  console.log(`[State Database] Saved regulation ${regulation.id} for ${regulation.stateCode}`);
}

/**
 * Get regulations for a state
 */
export function getRegulationsByState(stateCode: string): StateRegulation[] {
  return Array.from(stateRegulations.values()).filter(
    reg => reg.stateCode === stateCode
  );
}

/**
 * Get regulations affecting a specific ingredient
 */
export function getRegulationsByIngredient(ingredient: string): StateRegulation[] {
  const lowerIngredient = ingredient.toLowerCase();

  return Array.from(stateRegulations.values()).filter(reg =>
    reg.appliesToIngredients.some(i => i.toLowerCase().includes(lowerIngredient))
  );
}

/**
 * Get regulations by type
 */
export function getRegulationsByType(type: StateRegulation['regulationType']): StateRegulation[] {
  return Array.from(stateRegulations.values()).filter(
    reg => reg.regulationType === type
  );
}

// ============================================================================
// DATABASE STATISTICS
// ============================================================================

/**
 * Get database statistics
 */
export function getDatabaseStats() {
  const agencies = Array.from(stateAgencies.values());

  return {
    totalStates: agencies.length,
    fullyResearched: agencies.filter(a => a.dataSource === 'ai_research' || a.dataSource === 'state_website').length,
    verified: agencies.filter(a => a.verifiedBy).length,
    needsUpdate: getStaleStateAgencies(90).length,
    totalCorrespondence: stateCorrespondence.size,
    unresolvedCorrespondence: getUnresolvedCorrespondence().length,
    criticalCorrespondence: getCorrespondenceBySeverity('critical').length,
    totalRegulations: stateRegulations.size,
    byStrictness: {
      low: getStatesByStrictness('low').length,
      medium: getStatesByStrictness('medium').length,
      high: getStatesByStrictness('high').length,
      very_high: getStatesByStrictness('very_high').length,
    }
  };
}

/**
 * Clear all data (for testing)
 */
export function clearDatabase(): void {
  stateAgencies.clear();
  stateCorrespondence.clear();
  stateRegulations.clear();
  console.log('[State Database] All data cleared');
}

// Initialize on module load
initializeStateDatabase();
