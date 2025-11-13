/**
 * Compliance Checker Tool
 * Checks product labels against state regulations
 */

import { SupabaseClient } from '@supabase/supabase-js';

interface LabelData {
  product_name: string;
  ingredients?: string[];
  claims?: string[];
  warnings?: string[];
  net_weight?: string;
  [key: string]: any;
}

export async function performComplianceCheck(
  supabase: SupabaseClient,
  labelData: LabelData,
  states: string[],
  labelId?: string
): Promise<any> {
  const violations: any[] = [];
  const warnings: any[] = [];
  const recommendations: any[] = [];

  // Fetch regulations for specified states
  const { data: regulations, error } = await supabase
    .from('state_regulations')
    .select('*')
    .in('state', states)
    .eq('status', 'active');

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  console.error(`Checking against ${regulations?.length || 0} regulations for states: ${states.join(', ')}`);

  // Check each regulation
  for (const reg of regulations || []) {
    // Basic compliance checks based on category
    const checks = performCategoryChecks(reg, labelData);
    violations.push(...checks.violations);
    warnings.push(...checks.warnings);
    recommendations.push(...checks.recommendations);
  }

  // Calculate compliance score
  const complianceScore = calculateComplianceScore(violations, warnings);
  const overallStatus = determineOverallStatus(violations, warnings);
  const riskLevel = determineRiskLevel(violations);

  // Save compliance check record
  const checkRecord = {
    label_id: labelId,
    check_date: new Date().toISOString(),
    states_checked: states,
    extracted_text: labelData,
    extracted_claims: labelData.claims || [],
    extracted_ingredients: labelData.ingredients || [],
    extracted_warnings: labelData.warnings || [],
    product_name: labelData.product_name,
    net_weight: labelData.net_weight,
    overall_status: overallStatus,
    violations,
    warnings,
    recommendations,
    compliance_score: complianceScore,
    risk_level: riskLevel,
    ai_model_used: 'compliance-checker-v1',
  };

  const { data: savedCheck, error: saveError } = await supabase
    .from('compliance_checks')
    .insert(checkRecord)
    .select()
    .single();

  if (saveError) {
    console.error(`Failed to save compliance check: ${saveError.message}`);
  }

  return {
    success: true,
    check_id: savedCheck?.id,
    overall_status: overallStatus,
    compliance_score: complianceScore,
    risk_level: riskLevel,
    violations,
    warnings,
    recommendations,
    regulations_checked: regulations?.length || 0,
    states_checked: states,
  };
}

function performCategoryChecks(regulation: any, labelData: LabelData): any {
  const violations: any[] = [];
  const warnings: any[] = [];
  const recommendations: any[] = [];

  const ruleText = regulation.rule_text?.toLowerCase() || '';
  const ruleTitle = regulation.rule_title?.toLowerCase() || '';

  // Check based on regulation category
  switch (regulation.category) {
    case 'labeling':
      // Check for required label elements
      if (ruleText.includes('net weight') && !labelData.net_weight) {
        violations.push({
          severity: 'high',
          state: regulation.state,
          category: 'labeling',
          regulation_id: regulation.id,
          issue: 'Missing required net weight declaration',
          regulation_text: regulation.rule_text?.substring(0, 200),
          regulation_code: regulation.regulation_code,
          recommendation: 'Add net weight to label in compliance with ' + regulation.regulation_code,
        });
      }

      if (ruleText.includes('manufacturer name') || ruleText.includes('contact information')) {
        recommendations.push({
          severity: 'low',
          state: regulation.state,
          category: 'labeling',
          regulation_id: regulation.id,
          issue: 'Verify manufacturer contact information is present',
          recommendation: 'Ensure label includes manufacturer name and address',
        });
      }
      break;

    case 'ingredients':
      // Check ingredient-related regulations
      const ingredients = labelData.ingredients || [];
      
      if (ruleText.includes('guaranteed analysis') && ingredients.length > 0) {
        recommendations.push({
          severity: 'medium',
          state: regulation.state,
          category: 'ingredients',
          regulation_id: regulation.id,
          issue: 'May require guaranteed analysis',
          regulation_text: regulation.rule_text?.substring(0, 200),
          recommendation: 'Verify if guaranteed analysis is required for these ingredients',
        });
      }

      // Check for restricted ingredients
      const restrictedKeywords = ['pesticide', 'prohibited', 'banned', 'restricted'];
      if (restrictedKeywords.some(kw => ruleText.includes(kw))) {
        for (const ingredient of ingredients) {
          if (ruleText.includes(ingredient.toLowerCase())) {
            violations.push({
              severity: 'critical',
              state: regulation.state,
              category: 'ingredients',
              regulation_id: regulation.id,
              issue: `Ingredient "${ingredient}" may be restricted in ${regulation.state}`,
              regulation_text: regulation.rule_text?.substring(0, 200),
              recommendation: 'Review state regulations for this ingredient immediately',
            });
          }
        }
      }
      break;

    case 'claims':
      // Check claims compliance
      const claims = labelData.claims || [];
      
      for (const claim of claims) {
        const claimLower = claim.toLowerCase();
        
        // Check for regulated claims
        if (claimLower.includes('organic') && ruleText.includes('organic')) {
          warnings.push({
            severity: 'high',
            state: regulation.state,
            category: 'claims',
            regulation_id: regulation.id,
            issue: `"Organic" claim requires certification in ${regulation.state}`,
            regulation_text: regulation.rule_text?.substring(0, 200),
            recommendation: 'Verify USDA Organic certification is valid and displayed',
          });
        }

        if ((claimLower.includes('natural') || claimLower.includes('all natural')) 
            && ruleText.includes('natural')) {
          warnings.push({
            severity: 'medium',
            state: regulation.state,
            category: 'claims',
            regulation_id: regulation.id,
            issue: `"Natural" claim may be regulated in ${regulation.state}`,
            recommendation: 'Review state definition of "natural" claims',
          });
        }
      }
      break;

    case 'registration':
      // Product registration requirements
      if (ruleText.includes('registration required') || ruleText.includes('must be registered')) {
        warnings.push({
          severity: 'high',
          state: regulation.state,
          category: 'registration',
          regulation_id: regulation.id,
          issue: `Product may require registration in ${regulation.state}`,
          regulation_text: regulation.rule_text?.substring(0, 200),
          recommendation: `Check if product type requires registration with ${regulation.agency_name}`,
        });
      }
      break;
  }

  return { violations, warnings, recommendations };
}

function calculateComplianceScore(violations: any[], warnings: any[]): number {
  let score = 100;

  // Deduct points based on severity
  for (const v of violations) {
    if (v.severity === 'critical') score -= 20;
    else if (v.severity === 'high') score -= 10;
    else if (v.severity === 'medium') score -= 5;
  }

  for (const w of warnings) {
    if (w.severity === 'high') score -= 5;
    else if (w.severity === 'medium') score -= 2;
  }

  return Math.max(0, Math.min(100, score));
}

function determineOverallStatus(violations: any[], warnings: any[]): string {
  const criticalViolations = violations.filter(v => v.severity === 'critical').length;
  const highViolations = violations.filter(v => v.severity === 'high').length;

  if (criticalViolations > 0) return 'fail';
  if (highViolations > 0) return 'fail';
  if (violations.length > 0) return 'warning';
  if (warnings.length > 0) return 'warning';
  return 'pass';
}

function determineRiskLevel(violations: any[]): string {
  const criticalCount = violations.filter(v => v.severity === 'critical').length;
  const highCount = violations.filter(v => v.severity === 'high').length;

  if (criticalCount > 0) return 'critical';
  if (highCount > 1) return 'high';
  if (highCount === 1 || violations.length > 2) return 'medium';
  return 'low';
}
