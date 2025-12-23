// services/ingredientComplianceService.ts
// Service for ingredient-level compliance tracking, SDS management, and agentic querying

import { supabase } from '@/lib/supabase/client';
import type {
  IngredientComplianceRecord,
  IngredientSDSDocument,
  ArtworkExtractedIngredients,
  BOMIngredientCompliance,
  BOMComplianceSummary,
  BOMComplianceCheckResult,
  CreateIngredientComplianceInput,
  CreateSDSDocumentInput,
  SDSSearchParams,
  IngredientSearchParams,
  IngredientHazardResult,
  CrossUseIngredientInfo,
  BlockingIngredient,
  ParsedIngredient,
  IngredientDiscrepancy,
} from '@/types/ingredientCompliance';

interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// INGREDIENT COMPLIANCE STATUS CRUD
// ============================================================================

/**
 * Create or update ingredient compliance status for a specific state
 */
export async function setIngredientCompliance(
  input: CreateIngredientComplianceInput
): Promise<ServiceResult<IngredientComplianceRecord>> {
  try {
    const { data, error } = await supabase
      .from('ingredient_compliance_status')
      .upsert(
        {
          ingredient_sku: input.ingredientSku,
          ingredient_name: input.ingredientName,
          cas_number: input.casNumber,
          state_code: input.stateCode,
          compliance_status: input.complianceStatus || 'unknown',
          restriction_type: input.restrictionType,
          restriction_details: input.restrictionDetails,
          max_concentration: input.maxConcentration,
          concentration_unit: input.concentrationUnit || 'percent',
          regulation_code: input.regulationCode,
          sds_required: input.sdsRequired ?? true,
          notes: input.notes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'ingredient_sku,state_code' }
      )
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      data: transformComplianceRecord(data),
    };
  } catch (err) {
    console.error('[ingredientComplianceService] setIngredientCompliance error:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Bulk set compliance status for multiple ingredients across states
 */
export async function bulkSetIngredientCompliance(
  inputs: CreateIngredientComplianceInput[]
): Promise<ServiceResult<{ created: number; updated: number; errors: string[] }>> {
  try {
    const records = inputs.map((input) => ({
      ingredient_sku: input.ingredientSku,
      ingredient_name: input.ingredientName,
      cas_number: input.casNumber,
      state_code: input.stateCode,
      compliance_status: input.complianceStatus || 'unknown',
      restriction_type: input.restrictionType,
      restriction_details: input.restrictionDetails,
      max_concentration: input.maxConcentration,
      concentration_unit: input.concentrationUnit || 'percent',
      regulation_code: input.regulationCode,
      sds_required: input.sdsRequired ?? true,
      notes: input.notes,
    }));

    const { data, error } = await supabase
      .from('ingredient_compliance_status')
      .upsert(records, { onConflict: 'ingredient_sku,state_code' })
      .select();

    if (error) throw error;

    return {
      success: true,
      data: {
        created: data?.length || 0,
        updated: 0, // Upsert doesn't distinguish
        errors: [],
      },
    };
  } catch (err) {
    console.error('[ingredientComplianceService] bulkSetIngredientCompliance error:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Get compliance status for an ingredient across all states
 */
export async function getIngredientCompliance(
  ingredientSku: string,
  stateCodes?: string[]
): Promise<ServiceResult<IngredientComplianceRecord[]>> {
  try {
    let query = supabase
      .from('ingredient_compliance_status')
      .select('*')
      .eq('ingredient_sku', ingredientSku);

    if (stateCodes && stateCodes.length > 0) {
      query = query.in('state_code', stateCodes);
    }

    const { data, error } = await query.order('state_code');

    if (error) throw error;

    return {
      success: true,
      data: (data || []).map(transformComplianceRecord),
    };
  } catch (err) {
    console.error('[ingredientComplianceService] getIngredientCompliance error:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Search ingredients by compliance criteria (for agent queries)
 */
export async function searchIngredientsByCompliance(
  params: IngredientSearchParams
): Promise<ServiceResult<IngredientComplianceRecord[]>> {
  try {
    let query = supabase.from('ingredient_compliance_status').select('*');

    if (params.stateCode) {
      query = query.eq('state_code', params.stateCode);
    }
    if (params.complianceStatus) {
      query = query.eq('compliance_status', params.complianceStatus);
    }
    if (params.restrictionType) {
      query = query.eq('restriction_type', params.restrictionType);
    }
    if (params.sdsMissing) {
      query = query.eq('sds_status', 'missing');
    }

    const { data, error } = await query.order('ingredient_sku');

    if (error) throw error;

    return {
      success: true,
      data: (data || []).map(transformComplianceRecord),
    };
  } catch (err) {
    console.error('[ingredientComplianceService] searchIngredientsByCompliance error:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Get all prohibited or restricted ingredients for a state
 */
export async function getProblematicIngredients(
  stateCode: string
): Promise<ServiceResult<IngredientComplianceRecord[]>> {
  try {
    const { data, error } = await supabase
      .from('ingredient_compliance_status')
      .select('*')
      .eq('state_code', stateCode)
      .in('compliance_status', ['prohibited', 'restricted', 'conditional'])
      .order('compliance_status');

    if (error) throw error;

    return {
      success: true,
      data: (data || []).map(transformComplianceRecord),
    };
  } catch (err) {
    console.error('[ingredientComplianceService] getProblematicIngredients error:', err);
    return { success: false, error: String(err) };
  }
}

// ============================================================================
// SDS DOCUMENT MANAGEMENT
// ============================================================================

/**
 * Create or update an SDS document for an ingredient
 */
export async function createSDSDocument(
  input: CreateSDSDocumentInput
): Promise<ServiceResult<IngredientSDSDocument>> {
  try {
    // If marking as primary, unset any existing primary SDS for this ingredient
    if (input.isPrimary !== false) {
      await supabase
        .from('ingredient_sds_documents')
        .update({ is_primary: false })
        .eq('ingredient_sku', input.ingredientSku)
        .eq('is_primary', true);
    }

    const { data, error } = await supabase
      .from('ingredient_sds_documents')
      .insert({
        ingredient_sku: input.ingredientSku,
        ingredient_name: input.ingredientName,
        cas_number: input.casNumber,
        sds_file_url: input.sdsFileUrl,
        sds_source: input.sdsSource || 'uploaded',
        sds_source_url: input.sdsSourceUrl,
        manufacturer_name: input.manufacturerName,
        supplier_name: input.supplierName,
        supplier_sku: input.supplierSku,
        sds_revision_date: input.sdsRevisionDate,
        sds_expiration_date: input.sdsExpirationDate,
        sds_format: input.sdsFormat || 'ghs',
        ghs_hazard_codes: input.ghsHazardCodes || [],
        ghs_precautionary_codes: input.ghsPrecautionaryCodes || [],
        signal_word: input.signalWord,
        hazard_statements: input.hazardStatements || [],
        is_primary: input.isPrimary ?? true,
        status: 'active',
      })
      .select()
      .single();

    if (error) throw error;

    // Update the compliance status to reflect SDS availability
    await supabase
      .from('ingredient_compliance_status')
      .update({ sds_status: 'current' })
      .eq('ingredient_sku', input.ingredientSku);

    return {
      success: true,
      data: transformSDSDocument(data),
    };
  } catch (err) {
    console.error('[ingredientComplianceService] createSDSDocument error:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Get SDS document for an ingredient
 */
export async function getSDSDocument(
  ingredientSku: string,
  primaryOnly: boolean = true
): Promise<ServiceResult<IngredientSDSDocument | IngredientSDSDocument[]>> {
  try {
    let query = supabase
      .from('ingredient_sds_documents')
      .select('*')
      .eq('ingredient_sku', ingredientSku);

    if (primaryOnly) {
      query = query.eq('is_primary', true).single();
    }

    const { data, error } = await query;

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows

    if (primaryOnly) {
      return {
        success: true,
        data: data ? transformSDSDocument(data) : undefined,
      };
    }

    return {
      success: true,
      data: (data || []).map(transformSDSDocument),
    };
  } catch (err) {
    console.error('[ingredientComplianceService] getSDSDocument error:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Search SDS documents by various criteria (for agent queries)
 */
export async function searchSDSDocuments(
  params: SDSSearchParams
): Promise<ServiceResult<IngredientSDSDocument[]>> {
  try {
    let query = supabase.from('ingredient_sds_documents').select('*');

    if (params.ingredientSku) {
      query = query.eq('ingredient_sku', params.ingredientSku);
    }
    if (params.casNumber) {
      query = query.eq('cas_number', params.casNumber);
    }
    if (params.manufacturerName) {
      query = query.ilike('manufacturer_name', `%${params.manufacturerName}%`);
    }
    if (params.hazardCode) {
      query = query.contains('ghs_hazard_codes', [params.hazardCode]);
    }
    if (params.signalWord) {
      query = query.eq('signal_word', params.signalWord);
    }
    if (params.status) {
      query = query.eq('status', params.status);
    }
    if (params.expiringSoon) {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      query = query
        .lte('sds_expiration_date', thirtyDaysFromNow.toISOString().split('T')[0])
        .eq('status', 'active');
    }

    const { data, error } = await query.order('ingredient_sku');

    if (error) throw error;

    return {
      success: true,
      data: (data || []).map(transformSDSDocument),
    };
  } catch (err) {
    console.error('[ingredientComplianceService] searchSDSDocuments error:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Get ingredients missing SDS documents
 */
export async function getIngredientsMissingSDS(): Promise<ServiceResult<string[]>> {
  try {
    // Get all unique ingredient SKUs from compliance status
    const { data: complianceData, error: complianceError } = await supabase
      .from('ingredient_compliance_status')
      .select('ingredient_sku')
      .eq('sds_required', true);

    if (complianceError) throw complianceError;

    // Get all ingredient SKUs that have primary SDS
    const { data: sdsData, error: sdsError } = await supabase
      .from('ingredient_sds_documents')
      .select('ingredient_sku')
      .eq('is_primary', true)
      .eq('status', 'active');

    if (sdsError) throw sdsError;

    const sdsSkus = new Set((sdsData || []).map((d) => d.ingredient_sku));
    const missingSDS = [...new Set((complianceData || []).map((d) => d.ingredient_sku))].filter(
      (sku) => !sdsSkus.has(sku)
    );

    return { success: true, data: missingSDS };
  } catch (err) {
    console.error('[ingredientComplianceService] getIngredientsMissingSDS error:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Get SDS documents expiring soon
 */
export async function getExpiringSDSDocuments(
  daysAhead: number = 30
): Promise<ServiceResult<IngredientSDSDocument[]>> {
  try {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysAhead);

    const { data, error } = await supabase
      .from('ingredient_sds_documents')
      .select('*')
      .eq('status', 'active')
      .lte('sds_expiration_date', targetDate.toISOString().split('T')[0])
      .gte('sds_expiration_date', new Date().toISOString().split('T')[0])
      .order('sds_expiration_date');

    if (error) throw error;

    return {
      success: true,
      data: (data || []).map(transformSDSDocument),
    };
  } catch (err) {
    console.error('[ingredientComplianceService] getExpiringSDSDocuments error:', err);
    return { success: false, error: String(err) };
  }
}

// ============================================================================
// BOM COMPLIANCE CHECKING
// ============================================================================

/**
 * Get ingredient compliance for all components in a BOM
 */
export async function getBOMIngredientCompliance(
  bomId: string,
  stateCodes?: string[]
): Promise<ServiceResult<BOMIngredientCompliance[]>> {
  try {
    let query = supabase
      .from('bom_ingredient_compliance')
      .select('*')
      .eq('bom_id', bomId);

    if (stateCodes && stateCodes.length > 0) {
      query = query.in('state_code', stateCodes);
    }

    const { data, error } = await query.order('ingredient_sku');

    if (error) throw error;

    return {
      success: true,
      data: (data || []).map(transformBOMIngredientCompliance),
    };
  } catch (err) {
    console.error('[ingredientComplianceService] getBOMIngredientCompliance error:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Get compliance summary for a BOM across specified states
 */
export async function getBOMComplianceSummary(
  bomId: string,
  stateCodes?: string[]
): Promise<ServiceResult<BOMComplianceSummary[]>> {
  try {
    const { data, error } = await supabase.rpc('get_bom_ingredient_compliance_summary', {
      p_bom_id: bomId,
      p_state_codes: stateCodes || null,
    });

    if (error) throw error;

    return {
      success: true,
      data: (data || []).map((row: Record<string, unknown>) => ({
        stateCode: row.state_code as string,
        totalIngredients: row.total_ingredients as number,
        compliantCount: row.compliant_count as number,
        restrictedCount: row.restricted_count as number,
        prohibitedCount: row.prohibited_count as number,
        unknownCount: row.unknown_count as number,
        sdsMissingCount: row.sds_missing_count as number,
        sdsExpiredCount: row.sds_expired_count as number,
        overallStatus: row.overall_status as BOMComplianceSummary['overallStatus'],
        blockingIngredients: row.blocking_ingredients as BlockingIngredient[],
      })),
    };
  } catch (err) {
    console.error('[ingredientComplianceService] getBOMComplianceSummary error:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Full BOM compliance check with recommendations
 */
export async function checkBOMCompliance(
  bomId: string,
  targetStates: string[]
): Promise<ServiceResult<BOMComplianceCheckResult>> {
  try {
    // Get BOM details
    const { data: bomData, error: bomError } = await supabase
      .from('boms')
      .select('id, name, finished_sku')
      .eq('id', bomId)
      .single();

    if (bomError) throw bomError;

    // Get ingredient compliance details
    const complianceResult = await getBOMIngredientCompliance(bomId, targetStates);
    if (!complianceResult.success) throw new Error(complianceResult.error);

    // Get summary per state
    const summaryResult = await getBOMComplianceSummary(bomId, targetStates);
    if (!summaryResult.success) throw new Error(summaryResult.error);

    const ingredientDetails = complianceResult.data || [];
    const stateSummaries = summaryResult.data || [];

    // Aggregate issues
    const prohibitedIngredients: BlockingIngredient[] = [];
    const restrictedIngredients: BlockingIngredient[] = [];
    const missingSDSIngredients: string[] = [];
    const expiredSDSIngredients: string[] = [];
    const seenSkus = new Set<string>();

    for (const detail of ingredientDetails) {
      if (!seenSkus.has(detail.ingredientSku)) {
        seenSkus.add(detail.ingredientSku);

        if (detail.complianceStatus === 'prohibited') {
          prohibitedIngredients.push({
            sku: detail.ingredientSku,
            name: detail.ingredientName,
            status: detail.complianceStatus,
            restriction: detail.restrictionDetails,
          });
        } else if (detail.complianceStatus === 'restricted') {
          restrictedIngredients.push({
            sku: detail.ingredientSku,
            name: detail.ingredientName,
            status: detail.complianceStatus,
            restriction: detail.restrictionDetails,
          });
        }

        if (detail.sdsMissing) {
          missingSDSIngredients.push(detail.ingredientSku);
        }
        if (detail.sdsExpired) {
          expiredSDSIngredients.push(detail.ingredientSku);
        }
      }
    }

    // Determine overall status
    let overallStatus: BOMComplianceCheckResult['overallStatus'] = 'compliant';
    if (prohibitedIngredients.length > 0) {
      overallStatus = 'non_compliant';
    } else if (restrictedIngredients.length > 0) {
      overallStatus = 'needs_attention';
    } else if (missingSDSIngredients.length > 0 || expiredSDSIngredients.length > 0) {
      overallStatus = 'pending_review';
    }

    // Generate recommendations
    const recommendations: string[] = [];
    if (prohibitedIngredients.length > 0) {
      recommendations.push(
        `Remove or replace ${prohibitedIngredients.length} prohibited ingredient(s) before selling in target states.`
      );
    }
    if (restrictedIngredients.length > 0) {
      recommendations.push(
        `Review ${restrictedIngredients.length} restricted ingredient(s) to ensure compliance with concentration limits.`
      );
    }
    if (missingSDSIngredients.length > 0) {
      recommendations.push(
        `Obtain SDS documents for ${missingSDSIngredients.length} ingredient(s) to complete compliance review.`
      );
    }
    if (expiredSDSIngredients.length > 0) {
      recommendations.push(
        `Update ${expiredSDSIngredients.length} expired SDS document(s) to maintain compliance records.`
      );
    }

    return {
      success: true,
      data: {
        bomId: bomData.id,
        bomName: bomData.name,
        finishedSku: bomData.finished_sku,
        stateSummaries,
        ingredientDetails,
        overallStatus,
        issues: {
          prohibitedIngredients,
          restrictedIngredients,
          missingSDSIngredients,
          expiredSDSIngredients,
        },
        recommendations,
      },
    };
  } catch (err) {
    console.error('[ingredientComplianceService] checkBOMCompliance error:', err);
    return { success: false, error: String(err) };
  }
}

// ============================================================================
// ARTWORK INGREDIENT COMPARISON
// ============================================================================

/**
 * Store extracted ingredients from artwork/label
 */
export async function storeArtworkIngredients(
  bomId: string,
  parsedIngredients: ParsedIngredient[],
  rawText: string,
  extractionMethod: 'ocr' | 'ai' | 'manual' | 'hybrid',
  confidence?: number,
  sourceFileUrl?: string
): Promise<ServiceResult<ArtworkExtractedIngredients>> {
  try {
    const { data, error } = await supabase
      .from('artwork_extracted_ingredients')
      .insert({
        bom_id: bomId,
        raw_ingredient_list: rawText,
        parsed_ingredients: parsedIngredients,
        extraction_method: extractionMethod,
        extraction_confidence: confidence,
        source_file_url: sourceFileUrl,
        source_type: 'artwork',
        extraction_date: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      data: transformArtworkIngredients(data),
    };
  } catch (err) {
    console.error('[ingredientComplianceService] storeArtworkIngredients error:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Compare BOM ingredients with artwork-extracted ingredients
 */
export async function compareIngredientLists(
  bomId: string
): Promise<ServiceResult<{ matches: boolean; discrepancies: IngredientDiscrepancy[] }>> {
  try {
    // Get BOM components
    const { data: bomData, error: bomError } = await supabase
      .from('boms')
      .select('components')
      .eq('id', bomId)
      .single();

    if (bomError) throw bomError;

    // Get latest artwork extraction
    const { data: artworkData, error: artworkError } = await supabase
      .from('artwork_extracted_ingredients')
      .select('*')
      .eq('bom_id', bomId)
      .order('extraction_date', { ascending: false })
      .limit(1)
      .single();

    if (artworkError && artworkError.code !== 'PGRST116') throw artworkError;

    if (!artworkData) {
      return {
        success: true,
        data: { matches: true, discrepancies: [] }, // No artwork to compare
      };
    }

    const bomComponents = (bomData.components || []) as Array<{ sku: string; name: string; quantity: number }>;
    const artworkIngredients = (artworkData.parsed_ingredients || []) as ParsedIngredient[];

    const discrepancies: IngredientDiscrepancy[] = [];

    // Normalize names for comparison
    const normalize = (name: string) => name.toLowerCase().trim().replace(/[^a-z0-9]/g, '');

    const bomNames = new Set(bomComponents.map((c) => normalize(c.name || c.sku)));
    const artworkNames = new Set(artworkIngredients.map((i) => normalize(i.name)));

    // Check for ingredients in BOM but not in artwork
    for (const component of bomComponents) {
      const normalizedName = normalize(component.name || component.sku);
      if (!artworkNames.has(normalizedName)) {
        discrepancies.push({
          type: 'missing_in_artwork',
          ingredientName: component.name || component.sku,
          bomValue: component.name || component.sku,
          details: `Ingredient "${component.name || component.sku}" is in BOM but not found on artwork label`,
        });
      }
    }

    // Check for ingredients in artwork but not in BOM
    for (const ingredient of artworkIngredients) {
      const normalizedName = normalize(ingredient.name);
      if (!bomNames.has(normalizedName)) {
        discrepancies.push({
          type: 'missing_in_bom',
          ingredientName: ingredient.name,
          artworkValue: ingredient.name,
          details: `Ingredient "${ingredient.name}" is on artwork label but not in BOM`,
        });
      }
    }

    const matches = discrepancies.length === 0;

    // Update artwork record with discrepancy info
    if (discrepancies.length > 0) {
      await supabase
        .from('artwork_extracted_ingredients')
        .update({
          has_discrepancy: true,
          discrepancy_details: discrepancies,
          discrepancy_severity: discrepancies.some((d) => d.type === 'missing_in_bom') ? 'high' : 'medium',
        })
        .eq('id', artworkData.id);
    }

    return { success: true, data: { matches, discrepancies } };
  } catch (err) {
    console.error('[ingredientComplianceService] compareIngredientLists error:', err);
    return { success: false, error: String(err) };
  }
}

// ============================================================================
// AGENT QUERY FUNCTIONS
// ============================================================================

/**
 * Get comprehensive hazard information for an ingredient (for agent queries)
 */
export async function getIngredientHazardInfo(
  ingredientSku: string
): Promise<ServiceResult<IngredientHazardResult>> {
  try {
    // Get SDS document
    const sdsResult = await getSDSDocument(ingredientSku, true);
    const sds = sdsResult.success ? (sdsResult.data as IngredientSDSDocument) : null;

    // Get compliance records across all states
    const complianceResult = await getIngredientCompliance(ingredientSku);
    const complianceRecords = complianceResult.success ? complianceResult.data || [] : [];

    // Get state restrictions
    const stateRestrictions = complianceRecords
      .filter((r) => r.complianceStatus !== 'compliant' && r.complianceStatus !== 'unknown')
      .map((r) => ({
        stateCode: r.stateCode,
        status: r.complianceStatus,
        restriction: r.restrictionDetails,
      }));

    return {
      success: true,
      data: {
        ingredientSku,
        ingredientName: sds?.ingredientName || complianceRecords[0]?.ingredientName || null,
        casNumber: sds?.casNumber || complianceRecords[0]?.casNumber || null,
        hazards: {
          hazardCodes: sds?.ghsHazardCodes || [],
          precautionaryCodes: sds?.ghsPrecautionaryCodes || [],
          signalWord: sds?.signalWord || null,
          hazardStatements: sds?.hazardStatements || [],
        },
        physicalProperties: {
          physicalState: (sds?.physicalState as 'solid' | 'liquid' | 'gas') || null,
          appearance: sds?.appearance || null,
          odor: sds?.odor || null,
          ph: sds?.ph || null,
          flashPoint: sds?.flashPoint || null,
          flashPointUnit: sds?.flashPointUnit || 'C',
        },
        stateRestrictions,
        sdsAvailable: !!sds,
        sdsExpirationDate: sds?.sdsExpirationDate || null,
      },
    };
  } catch (err) {
    console.error('[ingredientComplianceService] getIngredientHazardInfo error:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Find all BOMs using a specific ingredient (cross-use analysis)
 */
export async function getCrossUseIngredientInfo(
  ingredientSku: string
): Promise<ServiceResult<CrossUseIngredientInfo>> {
  try {
    // Find all BOMs containing this ingredient
    const { data: bomData, error: bomError } = await supabase
      .from('boms')
      .select('id, name, finished_sku, components')
      .not('components', 'is', null);

    if (bomError) throw bomError;

    const usedInBOMs: CrossUseIngredientInfo['usedInBOMs'] = [];

    for (const bom of bomData || []) {
      const components = bom.components as Array<{ sku: string; name: string; quantity: number }>;
      const match = components.find((c) => c.sku === ingredientSku);
      if (match) {
        usedInBOMs.push({
          bomId: bom.id,
          bomName: bom.name,
          finishedSku: bom.finished_sku,
          quantity: match.quantity,
        });
      }
    }

    // Get compliance issues
    const complianceResult = await getIngredientCompliance(ingredientSku);
    const complianceRecords = complianceResult.success ? complianceResult.data || [] : [];

    const complianceIssues: CrossUseIngredientInfo['complianceIssues'] = complianceRecords
      .filter((r) => r.complianceStatus === 'prohibited' || r.complianceStatus === 'restricted')
      .map((r) => ({
        stateCode: r.stateCode,
        status: r.complianceStatus,
        affectedBOMs: usedInBOMs.map((b) => b.finishedSku),
      }));

    // Get ingredient name from compliance or SDS
    const ingredientName = complianceRecords[0]?.ingredientName || null;

    return {
      success: true,
      data: {
        ingredientSku,
        ingredientName,
        usedInBOMs,
        complianceIssues,
      },
    };
  } catch (err) {
    console.error('[ingredientComplianceService] getCrossUseIngredientInfo error:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Agent query: Find all ingredients with specific hazard codes
 */
export async function findIngredientsByHazard(
  hazardCodes: string[]
): Promise<ServiceResult<IngredientSDSDocument[]>> {
  try {
    const { data, error } = await supabase
      .from('ingredient_sds_documents')
      .select('*')
      .overlaps('ghs_hazard_codes', hazardCodes)
      .eq('status', 'active');

    if (error) throw error;

    return {
      success: true,
      data: (data || []).map(transformSDSDocument),
    };
  } catch (err) {
    console.error('[ingredientComplianceService] findIngredientsByHazard error:', err);
    return { success: false, error: String(err) };
  }
}

// ============================================================================
// TRANSFORM FUNCTIONS
// ============================================================================

function transformComplianceRecord(row: Record<string, unknown>): IngredientComplianceRecord {
  return {
    id: row.id as string,
    ingredientSku: row.ingredient_sku as string,
    ingredientName: row.ingredient_name as string | null,
    casNumber: row.cas_number as string | null,
    stateCode: row.state_code as string,
    complianceStatus: row.compliance_status as IngredientComplianceRecord['complianceStatus'],
    restrictionType: row.restriction_type as string | null,
    restrictionDetails: row.restriction_details as string | null,
    maxConcentration: row.max_concentration as number | null,
    concentrationUnit: (row.concentration_unit as IngredientComplianceRecord['concentrationUnit']) || 'percent',
    regulationCode: row.regulation_code as string | null,
    regulationSourceId: row.regulation_source_id as string | null,
    effectiveDate: row.effective_date as string | null,
    expirationDate: row.expiration_date as string | null,
    sdsDocumentId: row.sds_document_id as string | null,
    sdsRequired: row.sds_required as boolean,
    sdsStatus: (row.sds_status as IngredientComplianceRecord['sdsStatus']) || 'missing',
    lastReviewedAt: row.last_reviewed_at as string | null,
    lastReviewedBy: row.last_reviewed_by as string | null,
    reviewNotes: row.review_notes as string | null,
    nextReviewDate: row.next_review_date as string | null,
    notes: row.notes as string | null,
    customFields: (row.custom_fields as Record<string, unknown>) || {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function transformSDSDocument(row: Record<string, unknown>): IngredientSDSDocument {
  return {
    id: row.id as string,
    ingredientSku: row.ingredient_sku as string,
    ingredientName: row.ingredient_name as string | null,
    casNumber: row.cas_number as string | null,
    complianceDocumentId: row.compliance_document_id as string | null,
    sdsFileUrl: row.sds_file_url as string | null,
    sdsFilePath: row.sds_file_path as string | null,
    sdsSource: row.sds_source as IngredientSDSDocument['sdsSource'],
    sdsSourceUrl: row.sds_source_url as string | null,
    manufacturerName: row.manufacturer_name as string | null,
    supplierName: row.supplier_name as string | null,
    supplierSku: row.supplier_sku as string | null,
    sdsRevisionDate: row.sds_revision_date as string | null,
    sdsExpirationDate: row.sds_expiration_date as string | null,
    sdsLanguage: (row.sds_language as string) || 'en',
    sdsFormat: (row.sds_format as IngredientSDSDocument['sdsFormat']) || 'ghs',
    ghsHazardCodes: (row.ghs_hazard_codes as string[]) || [],
    ghsPrecautionaryCodes: (row.ghs_precautionary_codes as string[]) || [],
    signalWord: row.signal_word as IngredientSDSDocument['signalWord'],
    hazardStatements: (row.hazard_statements as string[]) || [],
    physicalState: row.physical_state as string | null,
    appearance: row.appearance as string | null,
    odor: row.odor as string | null,
    ph: row.ph as number | null,
    flashPoint: row.flash_point as number | null,
    flashPointUnit: (row.flash_point_unit as 'C' | 'F') || 'C',
    extractedIngredients: row.extracted_ingredients as IngredientSDSDocument['extractedIngredients'],
    extractedHazards: row.extracted_hazards as Record<string, unknown> | null,
    fullExtractedText: row.full_extracted_text as string | null,
    extractionMethod: row.extraction_method as IngredientSDSDocument['extractionMethod'],
    extractionDate: row.extraction_date as string | null,
    status: (row.status as IngredientSDSDocument['status']) || 'active',
    isPrimary: row.is_primary as boolean,
    createdAt: row.created_at as string,
    createdBy: row.created_by as string | null,
    updatedAt: row.updated_at as string,
    updatedBy: row.updated_by as string | null,
  };
}

function transformBOMIngredientCompliance(row: Record<string, unknown>): BOMIngredientCompliance {
  return {
    bomId: row.bom_id as string,
    finishedSku: row.finished_sku as string,
    bomName: row.bom_name as string,
    ingredientSku: row.ingredient_sku as string,
    ingredientName: row.ingredient_name as string | null,
    quantity: row.quantity as number,
    stateCode: row.state_code as string | null,
    complianceStatus: (row.compliance_status as BOMIngredientCompliance['complianceStatus']) || 'unknown',
    restrictionType: row.restriction_type as string | null,
    restrictionDetails: row.restriction_details as string | null,
    sdsRevisionDate: row.sds_revision_date as string | null,
    sdsExpirationDate: row.sds_expiration_date as string | null,
    sdsStatus: row.sds_status as BOMIngredientCompliance['sdsStatus'],
    ghsHazardCodes: row.ghs_hazard_codes as string[] | null,
    signalWord: row.signal_word as BOMIngredientCompliance['signalWord'],
    sdsMissing: row.sds_missing as boolean,
    sdsExpired: row.sds_expired as boolean,
  };
}

function transformArtworkIngredients(row: Record<string, unknown>): ArtworkExtractedIngredients {
  return {
    id: row.id as string,
    bomId: row.bom_id as string,
    artworkAssetId: row.artwork_asset_id as string | null,
    complianceDocumentId: row.compliance_document_id as string | null,
    sourceType: (row.source_type as ArtworkExtractedIngredients['sourceType']) || 'artwork',
    sourceFileUrl: row.source_file_url as string | null,
    rawIngredientList: row.raw_ingredient_list as string | null,
    parsedIngredients: (row.parsed_ingredients as ParsedIngredient[]) || [],
    extractionConfidence: row.extraction_confidence as number | null,
    extractionMethod: (row.extraction_method as ArtworkExtractedIngredients['extractionMethod']) || 'manual',
    extractionDate: row.extraction_date as string,
    extractedBy: row.extracted_by as string | null,
    isVerified: row.is_verified as boolean,
    verifiedAt: row.verified_at as string | null,
    verifiedBy: row.verified_by as string | null,
    verificationNotes: row.verification_notes as string | null,
    hasDiscrepancy: row.has_discrepancy as boolean,
    discrepancyDetails: row.discrepancy_details as IngredientDiscrepancy[] | null,
    discrepancySeverity: row.discrepancy_severity as ArtworkExtractedIngredients['discrepancySeverity'],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
