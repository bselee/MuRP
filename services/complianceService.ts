/**
 * Compliance Service
 * Handles compliance checking via Supabase Edge Functions or direct database queries
 */

import { supabase } from '../lib/supabase/client';
import type { StateRegulation, ComplianceCheck } from '../types';

export interface UserComplianceProfile {
  id: string;
  user_id: string;
  email: string;
  compliance_tier: 'basic' | 'full_ai';
  subscription_status: string;
  trial_checks_remaining: number;
  industry: string;
  target_states: string[];
  product_types?: string[];
  certifications_held?: string[];
  chat_messages_this_month: number;
  checks_this_month: number;
  monthly_check_limit: number;
  total_checks_lifetime: number;
}
/**
 * Get user compliance profile
 */
export async function getUserProfile(userId: string): Promise<UserComplianceProfile | null> {
  const { data, error } = await supabase
    .from('user_compliance_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('Failed to fetch user profile:', error);
    return null;
  }

  return data as UserComplianceProfile;
}

/**
 * Create or update user compliance profile
 */
export async function upsertUserProfile(profile: Partial<UserComplianceProfile>): Promise<UserComplianceProfile> {
  const { data, error } = await supabase
    .from('user_compliance_profiles')
    .upsert(profile, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save user profile: ${error.message}`);
  }

  return data as UserComplianceProfile;
}

/**
 * Get industry settings
 */
export async function getIndustrySettings(industry?: string): Promise<IndustrySettings[]> {
  let query = supabase.from('industry_settings').select('*');

  if (industry) {
    query = query.eq('industry', industry);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch industry settings: ${error.message}`);
  }

  return (data || []) as IndustrySettings[];
}

/**
 * Basic Mode: Add regulatory source
 */
export async function addRegulatorySource(
  userId: string,
  source: Omit<UserRegulatorySource, 'id' | 'user_id' | 'added_at' | 'updated_at'>
): Promise<UserRegulatorySource> {
  const { data, error } = await supabase
    .from('user_regulatory_sources')
    .insert({
      ...source,
      user_id: userId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to add regulatory source: ${error.message}`);
  }

  return data as UserRegulatorySource;
}

/**
 * Basic Mode: Get user's regulatory sources
 */
export async function getUserRegulatorySources(
  userId: string,
  stateCode?: string
): Promise<UserRegulatorySource[]> {
  let query = supabase
    .from('user_regulatory_sources')
    .select('*')
    .eq('user_id', userId)
    .order('state_code', { ascending: true })
    .order('added_at', { ascending: false });

  if (stateCode) {
    query = query.eq('state_code', stateCode);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch regulatory sources: ${error.message}`);
  }

  return (data || []) as UserRegulatorySource[];
}

/**
 * Get suggested regulations for industry/state
 */
export async function getSuggestedRegulations(
  industry: string,
  states: string[]
): Promise<any[]> {
  const { data, error } = await supabase
    .from('suggested_regulations')
    .select('*')
    .eq('industry', industry)
    .in('state_code', states)
    .order('display_order', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch suggested regulations: ${error.message}`);
  }

  return data || [];
}

/**
 * Basic Mode: Run manual compliance check
 * Returns checklist and sources to verify against (no AI)
 */
export async function basicComplianceCheck(
  userId: string,
  productName: string,
  productType: string,
  targetStates: string[]
): Promise<BasicComplianceCheckResult> {
  // Get user profile for industry context
  const profile = await getUserProfile(userId);
  if (!profile) {
    throw new Error('User profile not found');
  }

  // Get user's saved regulatory sources
  const userSources = await getUserRegulatorySources(userId);
  
  // Get suggested sources for their industry/states
  const suggestedSources = await getSuggestedRegulations(profile.industry, targetStates);

  // Get industry settings for checklist
  const [industrySettings] = await getIndustrySettings(profile.industry);

  // Organize sources by state
  const sourcesByState: Record<string, UserRegulatorySource[]> = {};
  const suggestedByState: Record<string, any[]> = {};

  for (const state of targetStates) {
    sourcesByState[state] = userSources.filter(s => s.state_code === state);
    suggestedByState[state] = suggestedSources.filter(s => s.state_code === state);
  }

  // Generate checklist from industry focus areas
  const checklist = industrySettings?.focus_areas || [
    'Product registration requirements',
    'Label format and content',
    'Required statements and warnings',
    'Font size and prominence rules',
    'Net weight declaration',
    'Manufacturer contact information',
  ];

  return {
    user_id: userId,
    product_name: productName,
    target_states: targetStates,
    regulatory_sources_by_state: sourcesByState,
    suggested_sources_by_state: suggestedByState,
    checklist_items: checklist,
    created_at: new Date().toISOString(),
  };
}

/**
 * Industry settings interface
 */
export interface IndustrySettings {
  industry: string;
  display_name: string;
  default_product_types: string[];
  common_certifications: string[];
  focus_areas: string[];
  search_keywords: string[];
  industry_prompt_context: string;
  example_violations?: string[];
}

export interface UserRegulatorySource {
  id: string;
  user_id: string;
  state_code: string;
  regulation_type: string;
  source_url: string;
  source_title: string;
  source_description?: string;
  user_notes?: string;
  key_requirements?: string;
  tags?: string[];
  is_favorite: boolean;
}

export interface LabelComplianceRequest {
  product_name: string;
  product_type?: string;
  ingredients?: string[];
  claims?: string[];
  warnings?: string[];
  net_weight?: string;
  certifications?: string[];
  states: string[]; // State codes to check against
  label_id?: string;
  artwork_id?: string;
  bom_id?: string;
  user_id?: string; // For tier checking
  check_tier?: 'basic' | 'full_ai';
  industry?: string;
}

export interface BasicComplianceCheckResult {
  user_id: string;
  product_name: string;
  target_states: string[];
  regulatory_sources_by_state: Record<string, UserRegulatorySource[]>;
  suggested_sources_by_state: Record<string, any[]>;
  checklist_items: string[];
  created_at: string;
}

/**
 * Check label compliance against state regulations
 */
export async function checkLabelCompliance(
  request: LabelComplianceRequest
): Promise<ComplianceCheck> {
  try {
    // Check tier and usage limits if user_id provided
    if (request.user_id) {
      const profile = await getUserProfile(request.user_id);
      
      if (profile) {
        // Check if user has access to Full AI
        if (profile.compliance_tier === 'basic' && profile.trial_checks_remaining <= 0) {
          throw new Error('Upgrade to Full AI mode to use automated compliance checking');
        }

        // Check monthly limits for paid users
        if (profile.compliance_tier === 'full_ai' && 
            profile.checks_this_month >= profile.monthly_check_limit) {
          throw new Error('Monthly check limit reached. Contact support to increase your limit.');
        }

        // Decrement trial checks or increment usage
        if (profile.compliance_tier === 'basic') {
          await supabase
            .from('user_compliance_profiles')
            .update({ 
              trial_checks_remaining: profile.trial_checks_remaining - 1,
              last_check_at: new Date().toISOString()
            })
            .eq('user_id', request.user_id);
        } else {
          await supabase
            .from('user_compliance_profiles')
            .update({ 
              checks_this_month: profile.checks_this_month + 1,
              total_checks_lifetime: profile.total_checks_lifetime + 1,
              last_check_at: new Date().toISOString()
            })
            .eq('user_id', request.user_id);
        }
      }
    }

    // Get industry settings for AI context
    let industryContext = '';
    if (request.industry) {
      const [settings] = await getIndustrySettings(request.industry);
      if (settings) {
        industryContext = settings.industry_prompt_context;
      }
    }

    // Fetch active regulations for specified states
    // Filter by keywords if industry is known
    let regQuery = supabase
      .from('state_regulations')
      .select('*')
      .in('state', request.states)
      .eq('status', 'active');

    // Add keyword filtering for better relevance
    if (request.industry) {
      const [settings] = await getIndustrySettings(request.industry);
      if (settings && settings.search_keywords.length > 0) {
        // Use full-text search with industry keywords
        const searchQuery = settings.search_keywords.slice(0, 3).join(' | ');
        regQuery = regQuery.textSearch('search_vector', searchQuery);
      }
    }

    const { data: regulations, error: regError } = await regQuery.limit(100);

    if (regError) {
      throw new Error(`Failed to fetch regulations: ${regError.message}`);
    }

    console.log(`Found ${regulations?.length || 0} relevant regulations for ${request.states.join(', ')}`);

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
      user_id: request.user_id,
      check_tier: request.check_tier || 'full_ai',
      industry: request.industry,
      product_type: request.product_type,
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

    // Track analytics
    if (request.user_id) {
      await supabase.from('usage_analytics').insert({
        user_id: request.user_id,
        event_type: 'check_run',
        event_data: {
          check_tier: request.check_tier || 'full_ai',
          states_count: request.states.length,
          compliance_score: complianceScore,
          risk_level: riskLevel,
        },
        compliance_tier: request.check_tier || 'full_ai',
      });
    }

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
  if (high > 0 || warnings.length > 3) return 'requires_review';
  if (warnings.length > 0) return 'warning';
  return 'pass';
}

/**
 * Upgrade user to Full AI tier
 */
export async function upgradeToFullAI(
  userId: string,
  stripeCustomerId?: string
): Promise<UserComplianceProfile> {
  const { data, error } = await supabase
    .from('user_compliance_profiles')
    .update({
      compliance_tier: 'full_ai',
      subscription_status: 'active',
      subscription_start_date: new Date().toISOString(),
      stripe_customer_id: stripeCustomerId,
      checks_this_month: 0,
      monthly_check_limit: 50,
    })
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upgrade user: ${error.message}`);
  }

  // Track upgrade event
  await supabase.from('usage_analytics').insert({
    user_id: userId,
    event_type: 'upgraded_to_full_ai',
    event_data: { timestamp: new Date().toISOString() },
    compliance_tier: 'full_ai',
  });

  return data as UserComplianceProfile;
}

/**
 * Track when user views upgrade prompt (for conversion analytics)
 */
export async function trackUpgradeView(userId: string, location: string): Promise<void> {
  await supabase.from('usage_analytics').insert({
    user_id: userId,
    event_type: 'upgrade_viewed',
    event_data: { location },
    compliance_tier: 'basic',
    page_location: location,
  });
}

export default {
  // User management
  getUserProfile,
  upsertUserProfile,
  upgradeToFullAI,
  trackUpgradeView,
  
  // Industry intelligence
  getIndustrySettings,
  getSuggestedRegulations,
  
  // Basic Mode
  addRegulatorySource,
  getUserRegulatorySources,
  basicComplianceCheck,
  
  // Full AI Mode
  checkLabelCompliance,
  getComplianceChecks,
  getStateRegulations,
  getStateStrictnessRankings,
  checkMultiStateCompliance,
  
  // Helper functions
  determineComplianceStatus,
  determineRiskLevel,
};

function determineComplianceStatus(violations: any[], warnings: any[]): 'pass' | 'warning' | 'fail' {
  if (violations.length > 0) return 'fail';
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

/**
 * Get state strictness rankings for compliance planning
 */
export async function getStateStrictnessRankings(
  filterLevel?: string,
  states?: string[]
): Promise<any> {
  try {
    let query = supabase
      .from('state_compliance_ratings')
      .select('*')
      .order('strictness_score', { ascending: false });

    if (filterLevel) {
      query = query.eq('strictness_level', filterLevel);
    }

    if (states && states.length > 0) {
      query = query.in('state_code', states);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Group by strictness level
    const grouped = {
      'Very Strict': [] as any[],
      'Strict': [] as any[],
      'Moderate': [] as any[],
      'Lenient': [] as any[],
      'Very Lenient': [] as any[],
    };

    data?.forEach((state) => {
      grouped[state.strictness_level as keyof typeof grouped].push(state);
    });

    return {
      total_states: data?.length || 0,
      grouped_by_strictness: grouped,
      all_states: data,
      recommendation:
        'Start with Very Strict states (CA, OR, WA). Meeting their requirements will typically satisfy less strict states.',
    };
  } catch (error) {
    console.error('Error fetching state strictness rankings:', error);
    throw error;
  }
}

/**
 * Check compliance across multiple states (prioritizes strictest)
 */
export async function checkMultiStateCompliance(
  userId: string,
  productName: string,
  productType: string,
  targetStates: string[],
  labelImageUrl?: string,
  ingredients?: string[],
  claims?: string[],
  certifications?: string[],
  prioritizeStrict: boolean = true
): Promise<any> {
  try {
    // Get user profile
    const profile = await getUserProfile(userId);
    if (!profile) {
      throw new Error('User profile not found');
    }

    // Check tier and usage limits
    if (profile.compliance_tier === 'basic' && profile.trial_checks_remaining <= 0) {
      return {
        error: 'Upgrade to Full AI mode required',
        trial_checks_remaining: 0,
        upgrade_url: '/settings/compliance',
      };
    }

    if (
      profile.compliance_tier === 'full_ai' &&
      profile.checks_this_month >= profile.monthly_check_limit
    ) {
      return {
        error: 'Monthly check limit reached',
        limit: profile.monthly_check_limit,
        upgrade_url: '/settings/compliance',
      };
    }

    // Get state ratings for target states
    const { data: stateRatings, error: stateError } = await supabase
      .from('state_compliance_ratings')
      .select('*')
      .in('state_code', targetStates);

    if (stateError) throw stateError;

    if (!stateRatings || stateRatings.length === 0) {
      throw new Error('No state ratings found for target states');
    }

    // Sort by strictness if requested
    const sortedStates = prioritizeStrict
      ? [...stateRatings].sort((a, b) => b.strictness_score - a.strictness_score)
      : stateRatings;

    // Get regulations for all states
    const regulationsByState: Record<string, any> = {};

    for (const state of sortedStates) {
      const { data: regs } = await supabase
        .from('state_regulations')
        .select('*')
        .eq('state', state.state_code)
        .eq('status', 'active')
        .limit(20);

      regulationsByState[state.state_code] = {
        state_name: state.state_name,
        strictness_level: state.strictness_level,
        strictness_score: state.strictness_score,
        key_focus_areas: state.key_focus_areas,
        regulations: regs || [],
        registration_required: state.registration_required,
        labeling_requirements: state.labeling_requirements,
      };
    }

    // Identify strictest requirements
    const strictestState = sortedStates[0];

    // Save check record
    const { data: checkRecord } = await supabase
      .from('compliance_checks')
      .insert({
        user_id: userId,
        product_name: productName,
        product_type: productType,
        check_tier: profile.compliance_tier,
        industry: profile.industry,
        states_checked: targetStates,
        extracted_ingredients: ingredients || [],
        extracted_claims: claims || [],
        overall_status: 'pending', // Will be updated by AI analysis
      })
      .select()
      .single();

    // Update usage
    if (profile.compliance_tier === 'basic') {
      await supabase
        .from('user_compliance_profiles')
        .update({
          trial_checks_remaining: profile.trial_checks_remaining - 1,
        })
        .eq('user_id', userId);
    } else {
      await supabase
        .from('user_compliance_profiles')
        .update({
          checks_this_month: profile.checks_this_month + 1,
          total_checks_lifetime: profile.total_checks_lifetime + 1,
        })
        .eq('user_id', userId);
    }

    // Track analytics
    await supabase.from('usage_analytics').insert({
      user_id: userId,
      event_type: 'multi_state_check',
      event_data: {
        states: targetStates,
        product_type: productType,
      },
      compliance_tier: profile.compliance_tier,
    });

    return {
      success: true,
      check_id: checkRecord?.id,
      product_name: productName,
      states_analyzed: targetStates.length,
      strictest_state: {
        code: strictestState.state_code,
        name: strictestState.state_name,
        level: strictestState.strictness_level,
        score: strictestState.strictness_score,
        key_focus_areas: strictestState.key_focus_areas,
      },
      state_breakdown: regulationsByState,
      recommendation: `Focus on meeting ${strictestState.state_name} requirements first. As the strictest state (Level: ${strictestState.strictness_level}), compliance there will likely satisfy most other states.`,
      user_tier: profile.compliance_tier,
      checks_remaining:
        profile.compliance_tier === 'basic'
          ? profile.trial_checks_remaining - 1
          : null,
      checks_this_month:
        profile.compliance_tier === 'full_ai'
          ? profile.checks_this_month + 1
          : null,
    };
  } catch (error) {
    console.error('Error in multi-state compliance check:', error);
    throw error;
  }
}
