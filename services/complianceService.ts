/**
 * Compliance Service
 * Handles compliance checking via Supabase Edge Functions or direct database queries
 */

import { createClient } from '@supabase/supabase-js';
import type { StateRegulation, ComplianceCheck } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface LabelComplianceRequest {
  product_name: string;
  ingredients?: string[];
  claims?: string[];
  warnings?: string[];
  net_weight?: string;
  states: string[]; // State codes to check against
  label_id?: string;
  artwork_id?: string;
  bom_id?: string;
}

/**
 * Check label compliance against state regulations
 */
export async function checkLabelCompliance(
  request: LabelComplianceRequest
): Promise<ComplianceCheck> {
  try {
    // Fetch active regulations for specified states
    const { data: regulations, error: regError } = await supabase
      .from('state_regulations')
      .select('*')
      .in('state', request.states)
      .eq('status', 'active');

    if (regError) {
      throw new Error(`Failed to fetch regulations: ${regError.message}`);
    }

    // Perform compliance checks
    const violations: any[] = [];
    const warnings: any[] = [];
    const recommendations: any[] = [];

    for (const reg of regulations || []) {
      const checks = performRegulationCheck(reg, request);
      violations.push(...checks.violations);
      warnings.push(...checks.warnings);
      recommendations.push(...checks.recommendations);
    }

    // Calculate scores
    const complianceScore = calculateComplianceScore(violations, warnings);
    const overallStatus = determineOverallStatus(violations, warnings);
    const riskLevel = determineRiskLevel(violations);

    // Save compliance check
    const checkRecord = {
      artwork_id: request.artwork_id,
      label_id: request.label_id,
      bom_id: request.bom_id,
      check_date: new Date().toISOString(),
      states_checked: request.states,
      extracted_claims: request.claims || [],
      extracted_ingredients: request.ingredients || [],
      extracted_warnings: request.warnings || [],
      product_name: request.product_name,
      net_weight: request.net_weight,
      overall_status: overallStatus,
      violations,
      warnings,
      recommendations,
      compliance_score: complianceScore,
      risk_level: riskLevel,
      ai_model_used: 'compliance-checker-frontend-v1',
    };

    const { data: savedCheck, error: saveError } = await supabase
      .from('compliance_checks')
      .insert(checkRecord)
      .select()
      .single();

    if (saveError) {
      console.error('Failed to save compliance check:', saveError);
      // Return the check result even if save failed
      return {
        id: 'unsaved',
        ...checkRecord,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as ComplianceCheck;
    }

    return savedCheck as ComplianceCheck;
  } catch (error: any) {
    console.error('Compliance check error:', error);
    throw error;
  }
}

/**
 * Get recent compliance checks for a label or BOM
 */
export async function getComplianceChecks(
  params: { label_id?: string; artwork_id?: string; bom_id?: string; limit?: number }
): Promise<ComplianceCheck[]> {
  let query = supabase
    .from('compliance_checks')
    .select('*')
    .order('check_date', { ascending: false });

  if (params.label_id) {
    query = query.eq('label_id', params.label_id);
  }
  if (params.artwork_id) {
    query = query.eq('artwork_id', params.artwork_id);
  }
  if (params.bom_id) {
    query = query.eq('bom_id', params.bom_id);
  }

  query = query.limit(params.limit || 10);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch compliance checks: ${error.message}`);
  }

  return (data || []) as ComplianceCheck[];
}

/**
 * Get state regulations by state and category
 */
export async function getStateRegulations(
  state?: string,
  category?: string
): Promise<StateRegulation[]> {
  let query = supabase
    .from('state_regulations')
    .select('*')
    .eq('status', 'active')
    .order('state', { ascending: true })
    .order('category', { ascending: true });

  if (state) {
    query = query.eq('state', state);
  }
  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch regulations: ${error.message}`);
  }

  return (data || []) as StateRegulation[];
}

// Helper functions

function performRegulationCheck(
  regulation: StateRegulation,
  labelData: LabelComplianceRequest
): any {
  const violations: any[] = [];
  const warnings: any[] = [];
  const recommendations: any[] = [];

  const ruleText = regulation.rule_text?.toLowerCase() || '';

  switch (regulation.category) {
    case 'labeling':
      if (ruleText.includes('net weight') && !labelData.net_weight) {
        violations.push({
          severity: 'high',
          state: regulation.state,
          category: 'labeling',
          regulation_id: regulation.id,
          issue: 'Missing required net weight declaration',
          regulation_text: regulation.rule_text?.substring(0, 200),
          regulation_code: regulation.regulation_code,
          recommendation: `Add net weight to label per ${regulation.regulation_code}`,
        });
      }
      break;

    case 'ingredients':
      const ingredients = labelData.ingredients || [];
      if (ruleText.includes('guaranteed analysis') && ingredients.length > 0) {
        recommendations.push({
          severity: 'medium',
          state: regulation.state,
          category: 'ingredients',
          regulation_id: regulation.id,
          issue: 'May require guaranteed analysis',
          recommendation: 'Verify if guaranteed analysis is required',
        });
      }
      break;

    case 'claims':
      const claims = labelData.claims || [];
      for (const claim of claims) {
        if (claim.toLowerCase().includes('organic') && ruleText.includes('organic')) {
          warnings.push({
            severity: 'high',
            state: regulation.state,
            category: 'claims',
            regulation_id: regulation.id,
            issue: `"Organic" claim requires certification in ${regulation.state}`,
            recommendation: 'Verify USDA Organic certification is valid',
          });
        }
      }
      break;
  }

  return { violations, warnings, recommendations };
}

function calculateComplianceScore(violations: any[], warnings: any[]): number {
  let score = 100;
  for (const v of violations) {
    if (v.severity === 'critical') score -= 20;
    else if (v.severity === 'high') score -= 10;
    else if (v.severity === 'medium') score -= 5;
  }
  for (const w of warnings) {
    if (w.severity === 'high') score -= 5;
    else if (w.severity === 'medium') score -= 2;
  }
  return Math.max(0, score);
}

function determineOverallStatus(violations: any[], warnings: any[]): 'pass' | 'warning' | 'fail' | 'requires_review' {
  const critical = violations.filter((v: any) => v.severity === 'critical').length;
  const high = violations.filter((v: any) => v.severity === 'high').length;

  if (critical > 0) return 'fail';
  if (high > 0) return 'fail';
  if (violations.length > 0) return 'warning';
  if (warnings.length > 0) return 'warning';
  return 'pass';
}

function determineRiskLevel(violations: any[]): 'low' | 'medium' | 'high' | 'critical' {
  const critical = violations.filter((v: any) => v.severity === 'critical').length;
  const high = violations.filter((v: any) => v.severity === 'high').length;

  if (critical > 0) return 'critical';
  if (high > 1) return 'high';
  if (high === 1 || violations.length > 2) return 'medium';
  return 'low';
}

export default {
  checkLabelCompliance,
  getComplianceChecks,
  getStateRegulations,
};
