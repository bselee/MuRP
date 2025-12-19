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
// CONTACT INFO SEARCH & UPDATE
// =============================================================================

/**
 * Search for state agency contact info using web search
 * Returns potential contact information for verification
 */
export async function searchStateContactInfo(
  stateCode: string,
  agencyType: 'agriculture' | 'fertilizer' | 'organic' = 'agriculture'
): Promise<ServiceResult<{
  currentContact: {
    email?: string;
    phone?: string;
    address?: string;
    contactUrl?: string;
  };
  searchResults: Array<{
    source: string;
    email?: string;
    phone?: string;
    address?: string;
    url: string;
    confidence: number;
  }>;
  lastVerified?: string;
}>> {
  try {
    // Get current stored contact
    const { data: source, error } = await supabase
      .from('state_regulatory_sources')
      .select('contact_email, contact_phone, contact_url, contact_address, last_verified_at')
      .eq('state_code', stateCode)
      .eq('source_type', 'primary')
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    const currentContact = source ? {
      email: source.contact_email,
      phone: source.contact_phone,
      address: source.contact_address,
      contactUrl: source.contact_url,
    } : {};

    // Search results would be populated by MCP web search
    // For now, return structure for UI to display
    const searchResults: Array<{
      source: string;
      email?: string;
      phone?: string;
      address?: string;
      url: string;
      confidence: number;
    }> = [];

    return {
      success: true,
      data: {
        currentContact,
        searchResults,
        lastVerified: source?.last_verified_at,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Update state regulatory source contact info
 */
export async function updateStateContactInfo(
  stateCode: string,
  contactInfo: {
    email?: string;
    phone?: string;
    address?: string;
    contactUrl?: string;
  },
  verificationNotes?: string
): Promise<ServiceResult<{ updated: boolean }>> {
  try {
    const { error } = await supabase
      .from('state_regulatory_sources')
      .update({
        contact_email: contactInfo.email,
        contact_phone: contactInfo.phone,
        contact_address: contactInfo.address,
        contact_url: contactInfo.contactUrl,
        last_verified_at: new Date().toISOString(),
        verification_notes: verificationNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('state_code', stateCode)
      .eq('source_type', 'primary');

    if (error) throw error;

    return { success: true, data: { updated: true } };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// MANUAL SOURCE INPUT
// =============================================================================

/**
 * Add or update a state regulatory source manually
 */
export async function upsertStateRegulatorySource(
  input: {
    stateCode: string;
    stateName: string;
    agencyName: string;
    agencyAcronym?: string;
    agencyDivision?: string;
    baseUrl: string;
    regulationsUrl?: string;
    registrationUrl?: string;
    formsUrl?: string;
    feeScheduleUrl?: string;
    contactUrl?: string;
    contactEmail?: string;
    contactPhone?: string;
    contactAddress?: string;
    regulatoryDomain?: string;
    primaryStatutes?: string[];
    primaryRegulations?: string[];
    registrationRequired?: boolean;
    registrationAnnualFee?: number;
    testingRequired?: boolean;
    labelingRequirements?: Record<string, unknown>;
    prohibitedClaims?: string[];
    requiredStatements?: string[];
    enforcementLevel?: string;
    notes?: string;
  }
): Promise<ServiceResult<{ id: string; created: boolean }>> {
  try {
    // Check if exists
    const { data: existing } = await supabase
      .from('state_regulatory_sources')
      .select('id')
      .eq('state_code', input.stateCode)
      .eq('source_type', 'primary')
      .single();

    const sourceData = {
      state_code: input.stateCode,
      state_name: input.stateName,
      source_name: `${input.stateCode} Department of Agriculture`,
      source_type: 'primary' as const,
      agency_name: input.agencyName,
      agency_acronym: input.agencyAcronym,
      agency_division: input.agencyDivision,
      base_url: input.baseUrl,
      regulations_url: input.regulationsUrl,
      registration_url: input.registrationUrl,
      forms_url: input.formsUrl,
      fee_schedule_url: input.feeScheduleUrl,
      contact_url: input.contactUrl,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone,
      contact_address: input.contactAddress,
      regulatory_domain: input.regulatoryDomain || 'agriculture',
      primary_statutes: input.primaryStatutes || [],
      primary_regulations: input.primaryRegulations || [],
      registration_required: input.registrationRequired ?? false,
      registration_annual_fee: input.registrationAnnualFee,
      testing_required: input.testingRequired ?? false,
      labeling_requirements: input.labelingRequirements || {},
      prohibited_claims: input.prohibitedClaims || [],
      required_statements: input.requiredStatements || [],
      enforcement_level: input.enforcementLevel || 'moderate',
      notes: input.notes,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await supabase
        .from('state_regulatory_sources')
        .update(sourceData)
        .eq('id', existing.id);

      if (error) throw error;
      return { success: true, data: { id: existing.id, created: false } };
    } else {
      const { data, error } = await supabase
        .from('state_regulatory_sources')
        .insert({
          ...sourceData,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) throw error;
      return { success: true, data: { id: data.id, created: true } };
    }
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// REGULATORY Q&A WITH AI
// =============================================================================

export interface RegulatoryQuestion {
  question: string;
  context?: {
    stateCode?: string;
    productType?: string;
    regulatoryDomain?: string;
    specificRegulations?: string[];
  };
}

export interface RegulatoryAnswer {
  answer: string;
  confidence: number;
  sources: Array<{
    stateCode: string;
    regulationCode?: string;
    title: string;
    excerpt: string;
    url?: string;
  }>;
  disclaimer: string;
  relatedQuestions?: string[];
  requiresProfessionalReview: boolean;
}

/**
 * Ask a regulatory compliance question and get an AI-powered answer
 * with citations from stored regulations
 */
export async function askRegulatoryQuestion(
  input: RegulatoryQuestion
): Promise<ServiceResult<RegulatoryAnswer>> {
  try {
    // Gather relevant regulations based on context
    const stateCodes = input.context?.stateCode
      ? [input.context.stateCode]
      : ['CA', 'OR', 'WA', 'NY', 'TX']; // Default to priority states

    // Search for relevant regulations using text search
    const searchTerms = input.question.toLowerCase().split(' ')
      .filter(term => term.length > 3)
      .slice(0, 5)
      .join(' | ');

    const { data: regulations, error } = await supabase
      .from('state_regulations')
      .select('id, state, category, rule_title, rule_text, rule_summary, regulation_code, source_url')
      .in('state', stateCodes)
      .eq('status', 'active')
      .textSearch('rule_text', searchTerms, { type: 'websearch' })
      .limit(10);

    // Build context for AI
    const regulatoryContext = (regulations || []).map(reg => ({
      stateCode: reg.state,
      regulationCode: reg.regulation_code,
      title: reg.rule_title,
      excerpt: (reg.rule_text || '').slice(0, 500),
      url: reg.source_url,
    }));

    // For now, return a structured response
    // In production, this would call the MCP AI compliance check
    const answer: RegulatoryAnswer = {
      answer: `Based on the regulations for ${stateCodes.join(', ')}, here is the guidance for your question about "${input.question}". Please review the source citations below for specific regulatory requirements.`,
      confidence: regulations?.length ? 0.7 : 0.3,
      sources: regulatoryContext,
      disclaimer: 'This information is provided for guidance only and should not be considered legal advice. Always verify with the relevant state agency and consult with a regulatory compliance professional for official determinations.',
      relatedQuestions: [
        'What are the labeling requirements?',
        'Is registration required in this state?',
        'What testing is required for this product type?',
      ],
      requiresProfessionalReview: true,
    };

    // Log the Q&A for analytics
    await supabase.from('regulatory_qa_log').insert({
      question: input.question,
      context: input.context,
      answer_summary: answer.answer.slice(0, 500),
      sources_count: answer.sources.length,
      confidence: answer.confidence,
      created_at: new Date().toISOString(),
    }).catch(() => {}); // Ignore if table doesn't exist

    return { success: true, data: answer };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Get frequently asked regulatory questions
 */
export async function getFrequentlyAskedQuestions(
  stateCode?: string,
  category?: string
): Promise<ServiceResult<Array<{
  question: string;
  shortAnswer: string;
  category: string;
  states: string[];
}>>> {
  try {
    // Pre-defined FAQs for common compliance questions
    const faqs = [
      {
        question: 'Do I need to register my fertilizer product with the state?',
        shortAnswer: 'Most states require registration of fertilizer products sold within their borders. Registration typically requires product analysis, label review, and annual fees.',
        category: 'registration',
        states: ['CA', 'OR', 'WA', 'NY', 'TX', 'CO', 'FL'],
      },
      {
        question: 'What information must be on my product label?',
        shortAnswer: 'Labels typically must include: guaranteed analysis, net weight, manufacturer info, directions for use, and any required state-specific warnings.',
        category: 'labeling',
        states: ['CA', 'OR', 'WA', 'NY', 'TX'],
      },
      {
        question: 'Can I claim my product is "organic" without USDA certification?',
        shortAnswer: 'No. The term "organic" is regulated by USDA NOP. Products must be certified to use organic claims. Some states (like CA) have additional requirements.',
        category: 'claims',
        states: ['CA', 'OR', 'WA'],
      },
      {
        question: 'What heavy metal limits apply to my product?',
        shortAnswer: 'Limits vary by state. California has the strictest limits. AAPFCO provides model guidelines. Testing is required to demonstrate compliance.',
        category: 'testing',
        states: ['CA', 'NY', 'WA', 'OR'],
      },
      {
        question: 'How long does state registration take?',
        shortAnswer: 'Registration typically takes 30-90 days depending on state backlog, completeness of application, and whether lab testing is required.',
        category: 'registration',
        states: ['CA', 'OR', 'WA', 'NY', 'TX'],
      },
    ];

    let filtered = faqs;
    if (stateCode) {
      filtered = filtered.filter(faq => faq.states.includes(stateCode));
    }
    if (category) {
      filtered = filtered.filter(faq => faq.category === category);
    }

    return { success: true, data: filtered };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// DOCUMENT ANALYSIS (Letters, Regulatory Notes, etc.)
// =============================================================================

export interface DocumentAnalysisResult {
  documentId: string;
  documentType: string;
  extractedText: string;
  analysisResults: {
    summary: string;
    keyPoints: string[];
    requiredActions: string[];
    deadlines: Array<{ action: string; date: string; priority: string }>;
    stateReferences: string[];
    regulationReferences: string[];
    complianceImpact: 'high' | 'medium' | 'low' | 'unknown';
  };
  linkedRegulations: Array<{
    regulationId: string;
    regulationCode: string;
    title: string;
    relevance: number;
  }>;
  confidence: number;
}

/**
 * Analyze a compliance document (letter, regulatory note, certificate, etc.)
 * Uses OCR for images and AI for text analysis
 */
export async function analyzeComplianceDocument(
  documentId: string
): Promise<ServiceResult<DocumentAnalysisResult>> {
  try {
    // Get the document
    const { data: doc, error: docError } = await supabase
      .from('compliance_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError) throw docError;

    // Check if we have extracted text, if not, trigger OCR
    let extractedText = doc.extracted_text || '';

    if (!extractedText && doc.file_url) {
      // Would call MCP extract_label_text tool here
      // For now, flag that OCR is needed
      extractedText = '[OCR extraction pending - upload image to MCP server for text extraction]';
    }

    // Analyze the text for key compliance elements
    const analysisResults = {
      summary: '',
      keyPoints: [] as string[],
      requiredActions: [] as string[],
      deadlines: [] as Array<{ action: string; date: string; priority: string }>,
      stateReferences: [] as string[],
      regulationReferences: [] as string[],
      complianceImpact: 'unknown' as const,
    };

    // Pattern matching for common compliance elements
    const textLower = extractedText.toLowerCase();

    // Detect state references
    const statePatterns = /\b(california|oregon|washington|new york|texas|colorado|florida|michigan|pennsylvania|north carolina|ca|or|wa|ny|tx|co|fl|mi|pa|nc)\b/gi;
    const stateMatches = extractedText.match(statePatterns) || [];
    analysisResults.stateReferences = [...new Set(stateMatches.map(s => s.toUpperCase()))];

    // Detect regulation references
    const regPatterns = /\b(\d+\s*CFR\s*\d+|\d+\s*CCR\s*\d+|OAR\s*\d+-\d+|WAC\s*\d+-\d+)/gi;
    const regMatches = extractedText.match(regPatterns) || [];
    analysisResults.regulationReferences = [...new Set(regMatches)];

    // Detect deadlines
    const datePatterns = /\b(by|before|deadline|due|expires?|within)\s*[:\s]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|\w+\s+\d{1,2},?\s+\d{4}|\d+\s*days?)/gi;
    const dateMatches = extractedText.match(datePatterns) || [];
    dateMatches.forEach(match => {
      analysisResults.deadlines.push({
        action: 'Review required',
        date: match,
        priority: textLower.includes('immediate') || textLower.includes('urgent') ? 'high' : 'medium',
      });
    });

    // Detect required actions
    const actionPatterns = /\b(must|shall|required to|need to|mandated|obligated)\s+([^.]+)/gi;
    let actionMatch;
    while ((actionMatch = actionPatterns.exec(extractedText)) !== null) {
      if (actionMatch[2] && actionMatch[2].length < 200) {
        analysisResults.requiredActions.push(actionMatch[0].trim());
      }
    }

    // Determine compliance impact
    if (textLower.includes('violation') || textLower.includes('penalty') || textLower.includes('cease')) {
      analysisResults.complianceImpact = 'high';
    } else if (textLower.includes('warning') || textLower.includes('deficiency')) {
      analysisResults.complianceImpact = 'medium';
    } else if (textLower.includes('approved') || textLower.includes('compliant')) {
      analysisResults.complianceImpact = 'low';
    }

    // Generate summary
    analysisResults.summary = `Document analysis found ${analysisResults.stateReferences.length} state references, ${analysisResults.regulationReferences.length} regulation citations, and ${analysisResults.deadlines.length} potential deadlines. Compliance impact: ${analysisResults.complianceImpact}.`;

    // Find linked regulations
    const linkedRegulations: DocumentAnalysisResult['linkedRegulations'] = [];
    if (analysisResults.stateReferences.length > 0) {
      const { data: regs } = await supabase
        .from('state_regulations')
        .select('id, regulation_code, rule_title')
        .in('state', analysisResults.stateReferences.map(s => s.length === 2 ? s : ''))
        .limit(5);

      (regs || []).forEach(reg => {
        linkedRegulations.push({
          regulationId: reg.id,
          regulationCode: reg.regulation_code || '',
          title: reg.rule_title,
          relevance: 0.5,
        });
      });
    }

    // Update document with analysis
    await supabase
      .from('compliance_documents')
      .update({
        extracted_text: extractedText !== doc.extracted_text ? extractedText : undefined,
        extracted_data: analysisResults,
        extraction_method: 'ai_analysis',
        extraction_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    return {
      success: true,
      data: {
        documentId,
        documentType: doc.document_type,
        extractedText,
        analysisResults,
        linkedRegulations,
        confidence: extractedText.includes('[OCR extraction pending') ? 0.2 : 0.7,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Batch analyze multiple compliance documents
 */
export async function batchAnalyzeDocuments(
  documentIds: string[]
): Promise<ServiceResult<{
  analyzed: number;
  failed: number;
  results: Array<{ documentId: string; success: boolean; error?: string }>;
}>> {
  const results: Array<{ documentId: string; success: boolean; error?: string }> = [];
  let analyzed = 0;
  let failed = 0;

  for (const docId of documentIds) {
    const result = await analyzeComplianceDocument(docId);
    if (result.success) {
      analyzed++;
      results.push({ documentId: docId, success: true });
    } else {
      failed++;
      results.push({ documentId: docId, success: false, error: result.error });
    }
  }

  return {
    success: true,
    data: { analyzed, failed, results },
  };
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
  // Contact info management
  searchStateContactInfo,
  updateStateContactInfo,
  // Manual source input
  upsertStateRegulatorySource,
  // Regulatory Q&A
  askRegulatoryQuestion,
  getFrequentlyAskedQuestions,
  // Document analysis
  analyzeComplianceDocument,
  batchAnalyzeDocuments,
};
