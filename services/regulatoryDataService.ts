/**
 * Regulatory Data Service
 *
 * Service for gathering, processing, and storing regulatory compliance data
 * from state agricultural agencies. Integrates with MCP tools for web scraping
 * and AI-powered data extraction.
 */

import { supabase } from '@/lib/supabase/client';

// =============================================================================
// TYPES
// =============================================================================

export interface StateRegulatorySource {
  id: string;
  stateCode: string;
  stateName: string;
  sourceName: string;
  sourceType: 'primary' | 'secondary' | 'reference';
  agencyName: string;
  agencyAcronym?: string;
  agencyDivision?: string;
  baseUrl: string;
  regulationsUrl?: string;
  registrationUrl?: string;
  formsUrl?: string;
  feeScheduleUrl?: string;
  contactUrl?: string;
  regulatoryDomain: string;
  contactEmail?: string;
  contactPhone?: string;
  scrapeEnabled: boolean;
  scrapeFrequency: string;
  lastScrapedAt?: string;
  lastScrapeStatus?: string;
  primaryStatutes: string[];
  primaryRegulations: string[];
  registrationRequired: boolean;
  registrationAnnualFee?: number;
  testingRequired: boolean;
  labelingRequirements?: Record<string, unknown>;
  prohibitedClaims: string[];
  requiredStatements: string[];
  enforcementLevel: string;
  dataCompleteness: number;
  notes?: string;
}

export interface ScrapedRegulation {
  stateCode: string;
  category: string;
  ruleTitle: string;
  ruleText: string;
  ruleSummary?: string;
  regulationCode?: string;
  statuteReference?: string;
  sourceUrl: string;
  effectiveDate?: string;
  confidenceScore?: number;
}

export interface RegulatoryScrapingResult {
  success: boolean;
  stateCode: string;
  sourceUrl: string;
  regulationsFound: number;
  regulationsCreated: number;
  regulationsUpdated: number;
  errors?: string[];
  duration: number;
}

interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// =============================================================================
// DATA FETCHING
// =============================================================================

/**
 * Get all state regulatory sources
 */
export async function getStateRegulatorySources(
  stateCodes?: string[],
  regulatoryDomain?: string
): Promise<ServiceResult<StateRegulatorySource[]>> {
  try {
    let query = supabase
      .from('state_regulatory_sources')
      .select('*')
      .eq('is_active', true)
      .eq('source_type', 'primary');

    if (stateCodes?.length) {
      query = query.in('state_code', stateCodes);
    }

    if (regulatoryDomain) {
      query = query.eq('regulatory_domain', regulatoryDomain);
    }

    query = query.order('state_code');

    const { data, error } = await query;

    if (error) throw error;

    const sources: StateRegulatorySource[] = (data || []).map((row) => ({
      id: row.id,
      stateCode: row.state_code,
      stateName: row.state_name,
      sourceName: row.source_name,
      sourceType: row.source_type,
      agencyName: row.agency_name,
      agencyAcronym: row.agency_acronym,
      agencyDivision: row.agency_division,
      baseUrl: row.base_url,
      regulationsUrl: row.regulations_url,
      registrationUrl: row.registration_url,
      formsUrl: row.forms_url,
      feeScheduleUrl: row.fee_schedule_url,
      contactUrl: row.contact_url,
      regulatoryDomain: row.regulatory_domain,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      scrapeEnabled: row.scrape_enabled,
      scrapeFrequency: row.scrape_frequency,
      lastScrapedAt: row.last_scraped_at,
      lastScrapeStatus: row.last_scrape_status,
      primaryStatutes: row.primary_statutes || [],
      primaryRegulations: row.primary_regulations || [],
      registrationRequired: row.registration_required,
      registrationAnnualFee: row.registration_annual_fee,
      testingRequired: row.testing_required,
      labelingRequirements: row.labeling_requirements,
      prohibitedClaims: row.prohibited_claims || [],
      requiredStatements: row.required_statements || [],
      enforcementLevel: row.enforcement_level,
      dataCompleteness: row.data_completeness,
      notes: row.notes,
    }));

    return { success: true, data: sources };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Get priority states for compliance (strictest states)
 */
export async function getPriorityStates(
  limit: number = 10
): Promise<ServiceResult<StateRegulatorySource[]>> {
  try {
    const { data, error } = await supabase
      .from('regulatory_sources_overview')
      .select('*')
      .order('strictness_score', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const sources: StateRegulatorySource[] = (data || []).map((row) => ({
      id: '',
      stateCode: row.state_code,
      stateName: row.state_name,
      sourceName: '',
      sourceType: 'primary' as const,
      agencyName: '',
      agencyAcronym: row.agency_acronym,
      baseUrl: row.base_url,
      regulationsUrl: row.regulations_url,
      registrationUrl: row.registration_url,
      regulatoryDomain: row.regulatory_domain,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      scrapeEnabled: false,
      scrapeFrequency: 'weekly',
      lastScrapedAt: row.last_scraped_at,
      lastScrapeStatus: row.last_scrape_status,
      primaryStatutes: [],
      primaryRegulations: [],
      registrationRequired: row.registration_required,
      registrationAnnualFee: row.registration_annual_fee,
      testingRequired: false,
      prohibitedClaims: [],
      requiredStatements: [],
      enforcementLevel: row.enforcement_level,
      dataCompleteness: row.data_completeness,
    }));

    return { success: true, data: sources };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// MCP INTEGRATION FOR DATA GATHERING
// =============================================================================

/**
 * Request MCP server to scrape regulations from a state source
 * This function integrates with the MCP server's scraping capabilities
 */
export async function requestRegulatoryScrape(
  sourceId: string,
  targetUrl?: string
): Promise<ServiceResult<RegulatoryScrapingResult>> {
  try {
    // Get the source configuration
    const { data: source, error: sourceError } = await supabase
      .from('state_regulatory_sources')
      .select('*')
      .eq('id', sourceId)
      .single();

    if (sourceError) throw sourceError;

    const urlToScrape = targetUrl || source.regulations_url || source.base_url;

    // Create a scraping job record
    const { data: job, error: jobError } = await supabase
      .from('scraping_jobs')
      .insert({
        config_id: null, // Will link to generic scraper
        job_type: 'manual',
        url: urlToScrape,
        parameters: {
          state_code: source.state_code,
          regulatory_domain: source.regulatory_domain,
          agency_name: source.agency_name,
          selectors: source.scrape_selectors,
        },
        status: 'pending',
      })
      .select()
      .single();

    if (jobError) throw jobError;

    // Call MCP server to perform scraping
    // In production, this would call the MCP server's scraping endpoint
    // For now, we'll simulate the process and return a pending status
    const result: RegulatoryScrapingResult = {
      success: true,
      stateCode: source.state_code,
      sourceUrl: urlToScrape,
      regulationsFound: 0,
      regulationsCreated: 0,
      regulationsUpdated: 0,
      duration: 0,
    };

    // Update source with last scrape attempt
    await supabase
      .from('state_regulatory_sources')
      .update({
        last_scraped_at: new Date().toISOString(),
        last_scrape_status: 'pending',
      })
      .eq('id', sourceId);

    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Save scraped regulations to the database
 */
export async function saveScrapedRegulations(
  regulations: ScrapedRegulation[]
): Promise<ServiceResult<{ created: number; updated: number }>> {
  try {
    let created = 0;
    let updated = 0;

    for (const reg of regulations) {
      // Check if regulation exists (by state + regulation code)
      const { data: existing } = await supabase
        .from('state_regulations')
        .select('id')
        .eq('state', reg.stateCode)
        .eq('regulation_code', reg.regulationCode)
        .single();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('state_regulations')
          .update({
            rule_title: reg.ruleTitle,
            rule_text: reg.ruleText,
            rule_summary: reg.ruleSummary,
            source_url: reg.sourceUrl,
            effective_date: reg.effectiveDate,
            confidence_score: reg.confidenceScore,
            last_verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (!error) updated++;
      } else {
        // Create new
        const { error } = await supabase.from('state_regulations').insert({
          state: reg.stateCode,
          category: reg.category,
          rule_title: reg.ruleTitle,
          rule_text: reg.ruleText,
          rule_summary: reg.ruleSummary,
          regulation_code: reg.regulationCode,
          statute_reference: reg.statuteReference,
          source_url: reg.sourceUrl,
          source_type: 'mcp_scraper',
          effective_date: reg.effectiveDate,
          confidence_score: reg.confidenceScore,
          extraction_method: 'mcp_scraper',
          status: 'pending_review',
        });

        if (!error) created++;
      }
    }

    return { success: true, data: { created, updated } };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// LABELING REQUIREMENTS
// =============================================================================

/**
 * Get combined labeling requirements for selected states
 * Returns the union of all requirements (most restrictive)
 */
export async function getCombinedLabelingRequirements(
  stateCodes: string[]
): Promise<ServiceResult<{
  requiredElements: string[];
  prohibitedClaims: string[];
  registrationRequired: boolean;
  testingRequired: boolean;
  strictestState: string;
  requirements: Record<string, unknown>;
}>> {
  try {
    const { data, error } = await supabase
      .from('state_regulatory_sources')
      .select('state_code, labeling_requirements, required_statements, prohibited_claims, registration_required, testing_required, enforcement_level')
      .in('state_code', stateCodes)
      .eq('is_active', true)
      .eq('source_type', 'primary');

    if (error) throw error;

    // Combine all requirements (union - most restrictive)
    const allRequiredElements = new Set<string>();
    const allProhibitedClaims = new Set<string>();
    let registrationRequired = false;
    let testingRequired = false;
    let strictestState = '';
    let strictestEnforcement = '';
    const combinedRequirements: Record<string, unknown> = {};

    const enforcementOrder = ['strict', 'moderate', 'lenient'];

    for (const source of data || []) {
      // Add required statements
      (source.required_statements || []).forEach((s: string) => allRequiredElements.add(s));

      // Add prohibited claims
      (source.prohibited_claims || []).forEach((c: string) => allProhibitedClaims.add(c));

      // Track registration/testing requirements
      if (source.registration_required) registrationRequired = true;
      if (source.testing_required) testingRequired = true;

      // Track strictest state
      const currentEnforcementIdx = enforcementOrder.indexOf(source.enforcement_level);
      const strictestEnforcementIdx = enforcementOrder.indexOf(strictestEnforcement);
      if (currentEnforcementIdx !== -1 && (strictestEnforcementIdx === -1 || currentEnforcementIdx < strictestEnforcementIdx)) {
        strictestEnforcement = source.enforcement_level;
        strictestState = source.state_code;
      }

      // Merge labeling requirements
      if (source.labeling_requirements) {
        Object.entries(source.labeling_requirements).forEach(([key, value]) => {
          if (!combinedRequirements[key]) {
            combinedRequirements[key] = value;
          } else if (typeof value === 'object' && value !== null) {
            combinedRequirements[key] = { ...combinedRequirements[key] as object, ...value as object };
          }
        });
      }
    }

    return {
      success: true,
      data: {
        requiredElements: Array.from(allRequiredElements),
        prohibitedClaims: Array.from(allProhibitedClaims),
        registrationRequired,
        testingRequired,
        strictestState,
        requirements: combinedRequirements,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// STATE COVERAGE ANALYSIS
// =============================================================================

/**
 * Analyze regulatory coverage for a product across states
 */
export async function analyzeStateCoverage(
  targetStates: string[]
): Promise<ServiceResult<{
  coveredStates: string[];
  uncoveredStates: string[];
  stateDetails: Array<{
    stateCode: string;
    stateName: string;
    hasPrimarySource: boolean;
    registrationRequired: boolean;
    dataCompleteness: number;
    enforcementLevel: string;
  }>;
}>> {
  try {
    // Get all state ratings for target states
    const { data: ratings, error: ratingsError } = await supabase
      .from('state_compliance_ratings')
      .select('state_code, state_name, registration_required')
      .in('state_code', targetStates);

    if (ratingsError) throw ratingsError;

    // Get regulatory sources for target states
    const { data: sources, error: sourcesError } = await supabase
      .from('state_regulatory_sources')
      .select('state_code, data_completeness, enforcement_level')
      .in('state_code', targetStates)
      .eq('is_active', true)
      .eq('source_type', 'primary');

    if (sourcesError) throw sourcesError;

    const sourceMap = new Map(sources?.map((s) => [s.state_code, s]) || []);

    const stateDetails = (ratings || []).map((rating) => {
      const source = sourceMap.get(rating.state_code);
      return {
        stateCode: rating.state_code,
        stateName: rating.state_name,
        hasPrimarySource: !!source,
        registrationRequired: rating.registration_required,
        dataCompleteness: source?.data_completeness || 0,
        enforcementLevel: source?.enforcement_level || 'unknown',
      };
    });

    const coveredStates = stateDetails
      .filter((s) => s.hasPrimarySource && s.dataCompleteness >= 50)
      .map((s) => s.stateCode);

    const uncoveredStates = stateDetails
      .filter((s) => !s.hasPrimarySource || s.dataCompleteness < 50)
      .map((s) => s.stateCode);

    return {
      success: true,
      data: {
        coveredStates,
        uncoveredStates,
        stateDetails,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// REGULATORY UPDATES MONITORING
// =============================================================================

/**
 * Check for regulatory updates since last check
 */
export async function checkForRegulatoryUpdates(
  stateCodes?: string[],
  sinceDays: number = 30
): Promise<ServiceResult<{
  updates: Array<{
    stateCode: string;
    regulationId: string;
    changeType: string;
    title: string;
    effectiveDate?: string;
    severity: string;
  }>;
  totalUpdates: number;
}>> {
  try {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - sinceDays);

    let query = supabase
      .from('regulation_changes')
      .select(`
        id,
        regulation_id,
        change_type,
        change_summary,
        created_at,
        state_regulations!inner(state, rule_title, effective_date)
      `)
      .gte('created_at', sinceDate.toISOString())
      .order('created_at', { ascending: false });

    // Note: The filter by state_codes would need to be done post-query
    // due to the join structure

    const { data, error } = await query;

    if (error) throw error;

    let updates = (data || []).map((change: Record<string, unknown>) => {
      const regulation = change.state_regulations as Record<string, unknown>;
      return {
        stateCode: regulation?.state as string,
        regulationId: change.regulation_id as string,
        changeType: change.change_type as string,
        title: regulation?.rule_title as string,
        effectiveDate: regulation?.effective_date as string,
        severity: change.change_type === 'major_revision' ? 'high' : 'medium',
      };
    });

    // Filter by state codes if provided
    if (stateCodes?.length) {
      updates = updates.filter((u) => stateCodes.includes(u.stateCode));
    }

    return {
      success: true,
      data: {
        updates,
        totalUpdates: updates.length,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  getStateRegulatorySources,
  getPriorityStates,
  requestRegulatoryScrape,
  saveScrapedRegulations,
  getCombinedLabelingRequirements,
  analyzeStateCoverage,
  checkForRegulatoryUpdates,
};
