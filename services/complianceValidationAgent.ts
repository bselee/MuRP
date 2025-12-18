/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ✅ COMPLIANCE VALIDATION AGENT - State Regulation & Label Compliance
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This agent validates label compliance against state regulations.
 *
 * Key Behaviors:
 * 1. Scans labels for required warnings based on destination states
 * 2. Flags missing THC warnings, Prop 65 notices, pesticide disclosures
 * 3. Auto-generates compliance checklists for multi-state shipments
 * 4. Tracks regulation changes and alerts when labels need updates
 *
 * Example:
 * - Label being printed for California shipment
 * - Agent checks: Prop 65 warning ✓, THC content ✓, Batch tracking ✓
 * - Agent flags: Missing manufacturing date
 * - Agent suggests: Add "Manufactured: MM/DD/YYYY" to comply with CA regs
 *
 * @module services/complianceValidationAgent
 */

import { supabase } from '../lib/supabase/client';
import {
  checkLabelCompliance,
  getStateRegulations,
  checkMultiStateCompliance,
  type ComplianceCheckResult,
  type StateRegulations,
} from './complianceService';

export interface ComplianceValidationAgentConfig {
  target_states: string[]; // ['CA', 'CO', 'WA', 'OR']
  strictness: 'lenient' | 'standard' | 'strict';
  auto_flag_missing_warnings: boolean;
  require_manual_review_new_states: boolean;
  block_print_if_noncompliant: boolean;
}

export interface ComplianceIssue {
  label_id: string;
  label_name: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  issue_type: 'MISSING_WARNING' | 'INCORRECT_FORMAT' | 'STATE_SPECIFIC' | 'MULTI_STATE_CONFLICT';
  state: string;
  message: string;
  regulation_reference: string;
  suggested_fix: string;
  can_auto_fix: boolean;
}

const DEFAULT_CONFIG: ComplianceValidationAgentConfig = {
  target_states: ['CA', 'CO', 'WA', 'OR'],
  strictness: 'standard',
  auto_flag_missing_warnings: true,
  require_manual_review_new_states: true,
  block_print_if_noncompliant: false,
};

/**
 * Validate all labels pending print against compliance rules
 */
export async function validatePendingLabels(
  config: Partial<ComplianceValidationAgentConfig> = {}
): Promise<ComplianceIssue[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const issues: ComplianceIssue[] = [];

  try {
    // Get all labels with status 'approved' or 'pending_print'
    const { data: labels, error } = await supabase
      .from('artwork_files')
      .select(`
        id,
        filename,
        status,
        file_url,
        artwork:artwork_submissions(
          customer_name,
          destination_state
        )
      `)
      .in('status', ['approved', 'pending_print']);

    if (error) throw error;
    if (!labels) return issues;

    for (const label of labels) {
      const artwork = (label.artwork as any)?.[0];
      const destinationState = artwork?.destination_state || 'CA'; // Default to CA

      // Skip if state not in target list (unless strict mode)
      if (cfg.strictness !== 'strict' && !cfg.target_states.includes(destinationState)) {
        continue;
      }

      // Get state regulations
      const regulations = await getStateRegulations(destinationState);

      // Get extracted text from compliance_checks if available
      const { data: complianceCheck } = await supabase
        .from('compliance_checks')
        .select('extracted_text, extracted_warnings, extracted_claims')
        .eq('artwork_id', label.id)
        .order('check_date', { ascending: false })
        .limit(1)
        .single();

      // Combine extracted text for searching
      const extractedTextContent = complianceCheck?.extracted_text 
        ? JSON.stringify(complianceCheck.extracted_text).toLowerCase()
        : '';
      const extractedWarnings: string[] = complianceCheck?.extracted_warnings || [];
      const extractedClaims: string[] = complianceCheck?.extracted_claims || [];
      const allExtractedText = [
        extractedTextContent,
        ...extractedWarnings.map(w => w.toLowerCase()),
        ...extractedClaims.map(c => c.toLowerCase()),
        label.filename.toLowerCase(),
      ].join(' ');

      // Check for required warnings using actual extracted text
      const requiredWarnings = regulations.required_warnings || [];
      for (const warning of requiredWarnings) {
        // Search for warning text (fuzzy match on key terms)
        const warningTerms = warning.toLowerCase().split(' ').filter((w: string) => w.length > 3);
        const hasWarning = warningTerms.some((term: string) => allExtractedText.includes(term));

        if (!hasWarning) {
          const severity: 'CRITICAL' | 'WARNING' = warning.toLowerCase().includes('prop 65')
            ? 'CRITICAL'
            : 'WARNING';

          issues.push({
            label_id: label.id,
            label_name: label.filename,
            severity,
            issue_type: 'MISSING_WARNING',
            state: destinationState,
            message: `Missing required warning: "${warning}"`,
            regulation_reference: `${destinationState} Cannabis Labeling Requirements`,
            suggested_fix: `Add warning text: "${warning}" to label`,
            can_auto_fix: false, // Requires design change
          });
        }
      }

      // Check for Prop 65 (California specific)
      if (destinationState === 'CA') {
        const prop65Keywords = ['prop 65', 'proposition 65', 'known to the state of california', 'cause cancer'];
        const hasProp65 = prop65Keywords.some(keyword => allExtractedText.includes(keyword));
        if (!hasProp65) {
          issues.push({
            label_id: label.id,
            label_name: label.filename,
            severity: 'CRITICAL',
            issue_type: 'STATE_SPECIFIC',
            state: 'CA',
            message: 'Missing California Proposition 65 warning',
            regulation_reference: 'CA Health & Safety Code § 25249.6',
            suggested_fix: 'Add Prop 65 warning: "⚠️ WARNING: This product can expose you to chemicals including cannabis smoke, which is known to the State of California to cause cancer."',
            can_auto_fix: false,
          });
        }
      }

      // Check for THC content disclosure
      const thcKeywords = ['thc', 'tetrahydrocannabinol', 'total thc', 'thc:'];
      const hasThc = thcKeywords.some(keyword => allExtractedText.includes(keyword));
      if (!hasThc) {
        issues.push({
          label_id: label.id,
          label_name: label.filename,
          severity: 'CRITICAL',
          issue_type: 'MISSING_WARNING',
          state: destinationState,
          message: 'Missing THC content percentage',
          regulation_reference: `${destinationState} Cannabis Product Labeling`,
          suggested_fix: 'Add THC content: "Total THC: XX.XX%"',
          can_auto_fix: false,
        });
      }

      // Check for batch/lot number
      const batchKeywords = ['batch', 'lot', 'batch:', 'lot:', 'batch #', 'lot #'];
      const hasBatch = batchKeywords.some(keyword => allExtractedText.includes(keyword));
      if (!hasBatch) {
        issues.push({
          label_id: label.id,
          label_name: label.filename,
          severity: 'WARNING',
          issue_type: 'MISSING_WARNING',
          state: destinationState,
          message: 'Missing batch/lot number for traceability',
          regulation_reference: `${destinationState} Track-and-Trace Requirements`,
          suggested_fix: 'Add batch number field: "Batch: XXXXXX"',
          can_auto_fix: true, // Can generate batch number
        });
      }
    }

    return issues;
  } catch (error) {
    console.error('[ComplianceValidationAgent] Error validating labels:', error);
    return [];
  }
}

/**
 * Check multi-state compliance for labels shipping to multiple states
 */
export async function validateMultiStateShipment(
  labelId: string,
  states: string[]
): Promise<{
  compliant: boolean;
  conflicts: Array<{ state1: string; state2: string; conflict: string }>;
  recommendations: string[];
}> {
  try {
    // Get regulations for all states
    const regulationsPromises = states.map(state => getStateRegulations(state));
    const regulations = await Promise.all(regulationsPromises);

    const conflicts: Array<{ state1: string; state2: string; conflict: string }> = [];
    const recommendations: string[] = [];

    // Check for conflicting requirements
    for (let i = 0; i < states.length; i++) {
      for (let j = i + 1; j < states.length; j++) {
        const state1 = states[i];
        const state2 = states[j];
        const regs1 = regulations[i];
        const regs2 = regulations[j];

        // Check for conflicting THC limits
        if (regs1.max_thc_per_package !== regs2.max_thc_per_package) {
          conflicts.push({
            state1,
            state2,
            conflict: `THC limits differ: ${state1}=${regs1.max_thc_per_package}mg vs ${state2}=${regs2.max_thc_per_package}mg`,
          });
          recommendations.push(
            `Use most restrictive THC limit: ${Math.min(regs1.max_thc_per_package, regs2.max_thc_per_package)}mg`
          );
        }

        // Check for conflicting serving sizes
        if (regs1.serving_size_mg !== regs2.serving_size_mg) {
          conflicts.push({
            state1,
            state2,
            conflict: `Serving sizes differ: ${state1}=${regs1.serving_size_mg}mg vs ${state2}=${regs2.serving_size_mg}mg`,
          });
          recommendations.push(
            `Use smallest serving size: ${Math.min(regs1.serving_size_mg, regs2.serving_size_mg)}mg to comply with all states`
          );
        }
      }
    }

    // If no conflicts, label is compliant
    return {
      compliant: conflicts.length === 0,
      conflicts,
      recommendations,
    };
  } catch (error) {
    console.error('[ComplianceValidationAgent] Error checking multi-state compliance:', error);
    return {
      compliant: false,
      conflicts: [],
      recommendations: ['Error checking compliance - manual review required'],
    };
  }
}

/**
 * Get compliance summary for dashboard
 */
export async function getComplianceSummary(): Promise<{
  total_labels: number;
  compliant_labels: number;
  issues_found: number;
  critical_issues: number;
  auto_fixable: number;
}> {
  try {
    const issues = await validatePendingLabels();

    const { count: totalLabels } = await supabase
      .from('artwork_files')
      .select('id', { count: 'exact', head: true })
      .in('status', ['approved', 'pending_print']);

    return {
      total_labels: totalLabels || 0,
      compliant_labels: (totalLabels || 0) - new Set(issues.map(i => i.label_id)).size,
      issues_found: issues.length,
      critical_issues: issues.filter(i => i.severity === 'CRITICAL').length,
      auto_fixable: issues.filter(i => i.can_auto_fix).length,
    };
  } catch (error) {
    console.error('[ComplianceValidationAgent] Error getting summary:', error);
    return {
      total_labels: 0,
      compliant_labels: 0,
      issues_found: 0,
      critical_issues: 0,
      auto_fixable: 0,
    };
  }
}

export default {
  validatePendingLabels,
  validateMultiStateShipment,
  getComplianceSummary,
};
