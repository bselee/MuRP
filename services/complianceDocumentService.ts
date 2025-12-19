/**
 * Compliance Document Service
 *
 * Service layer for managing compliance documents, state selections,
 * product correlations, and alerts.
 */

import { supabase } from '@/lib/supabase/client';
import type {
  ComplianceDocument,
  ComplianceDocumentOverview,
  ProductComplianceDocument,
  ComplianceItemState,
  ComplianceAlert,
  ComplianceDocumentReview,
  ComplianceDocumentVersion,
  ProductDocumentResult,
  ProductComplianceSummary,
  ExpiringDocument,
  StateComplianceMatrix,
  ComplianceDashboardSummary,
  CreateComplianceDocumentInput,
  UpdateComplianceDocumentInput,
  LinkDocumentToProductInput,
  SetProductStateComplianceInput,
  CreateDocumentReviewInput,
  CompleteDocumentReviewInput,
  ComplianceDocumentFilters,
  ComplianceAlertFilters,
  StateSelectionOption,
  BulkStateSelectionResult,
  ComplianceDocumentType,
  ComplianceDocumentStatus,
  ComplianceStatus,
  AlertSeverity,
} from '@/types/complianceDocuments';

// =============================================================================
// SERVICE RESULT TYPE
// =============================================================================

interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// =============================================================================
// DATABASE FIELD MAPPING HELPERS
// =============================================================================

/**
 * Convert camelCase to snake_case for database queries
 */
function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    result[snakeKey] = value;
  }
  return result;
}

/**
 * Convert database row to ComplianceDocument
 */
function rowToComplianceDocument(row: Record<string, unknown>): ComplianceDocument {
  return {
    id: row.id as string,
    documentName: row.document_name as string,
    documentType: row.document_type as ComplianceDocumentType,
    documentNumber: row.document_number as string | undefined,
    description: row.description as string | undefined,
    filePath: row.file_path as string | undefined,
    fileUrl: row.file_url as string | undefined,
    fileName: row.file_name as string,
    fileSize: row.file_size as number | undefined,
    fileMimeType: row.file_mime_type as string | undefined,
    fileHash: row.file_hash as string | undefined,
    thumbnailUrl: row.thumbnail_url as string | undefined,
    applicableStates: (row.applicable_states as string[]) || [],
    isNational: row.is_national as boolean,
    jurisdictionLevel: row.jurisdiction_level as 'federal' | 'state' | 'local' | 'international',
    regulatoryCategory: row.regulatory_category as string | undefined,
    agencyName: row.agency_name as string | undefined,
    agencyContactEmail: row.agency_contact_email as string | undefined,
    agencyContactPhone: row.agency_contact_phone as string | undefined,
    regulationCode: row.regulation_code as string | undefined,
    effectiveDate: row.effective_date as string | undefined,
    expirationDate: row.expiration_date as string | undefined,
    renewalReminderDays: (row.renewal_reminder_days as number) || 30,
    status: row.status as ComplianceDocumentStatus,
    statusChangedAt: row.status_changed_at as string | undefined,
    statusChangedBy: row.status_changed_by as string | undefined,
    statusNotes: row.status_notes as string | undefined,
    version: (row.version as number) || 1,
    supersedesId: row.supersedes_id as string | undefined,
    supersededById: row.superseded_by_id as string | undefined,
    extractedText: row.extracted_text as string | undefined,
    extractedData: row.extracted_data as Record<string, unknown> | undefined,
    extractionMethod: row.extraction_method as string | undefined,
    extractionDate: row.extraction_date as string | undefined,
    tags: (row.tags as string[]) || [],
    keywords: (row.keywords as string[]) || [],
    uploadedBy: row.uploaded_by as string | undefined,
    ownedBy: row.owned_by as string | undefined,
    customFields: (row.custom_fields as Record<string, unknown>) || {},
    notes: row.notes as string | undefined,
    internalNotes: row.internal_notes as string | undefined,
    createdAt: row.created_at as string,
    createdBy: row.created_by as string | undefined,
    updatedAt: row.updated_at as string,
    updatedBy: row.updated_by as string | undefined,
  };
}

// =============================================================================
// DOCUMENT CRUD OPERATIONS
// =============================================================================

/**
 * Create a new compliance document
 */
export async function createComplianceDocument(
  input: CreateComplianceDocumentInput
): Promise<ServiceResult<ComplianceDocument>> {
  try {
    const { data, error } = await supabase
      .from('compliance_documents')
      .insert({
        document_name: input.documentName,
        document_type: input.documentType,
        document_number: input.documentNumber,
        description: input.description,
        file_name: input.fileName,
        file_path: input.filePath,
        file_url: input.fileUrl,
        file_size: input.fileSize,
        file_mime_type: input.fileMimeType,
        applicable_states: input.applicableStates || [],
        is_national: input.isNational || false,
        jurisdiction_level: input.jurisdictionLevel || 'state',
        regulatory_category: input.regulatoryCategory,
        agency_name: input.agencyName,
        agency_contact_email: input.agencyContactEmail,
        agency_contact_phone: input.agencyContactPhone,
        regulation_code: input.regulationCode,
        effective_date: input.effectiveDate,
        expiration_date: input.expirationDate,
        renewal_reminder_days: input.renewalReminderDays || 30,
        tags: input.tags || [],
        notes: input.notes,
        status: 'draft',
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: rowToComplianceDocument(data) };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Update a compliance document
 */
export async function updateComplianceDocument(
  input: UpdateComplianceDocumentInput
): Promise<ServiceResult<ComplianceDocument>> {
  try {
    const updateData: Record<string, unknown> = {};

    if (input.documentName !== undefined) updateData.document_name = input.documentName;
    if (input.documentType !== undefined) updateData.document_type = input.documentType;
    if (input.documentNumber !== undefined) updateData.document_number = input.documentNumber;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.applicableStates !== undefined) updateData.applicable_states = input.applicableStates;
    if (input.isNational !== undefined) updateData.is_national = input.isNational;
    if (input.jurisdictionLevel !== undefined) updateData.jurisdiction_level = input.jurisdictionLevel;
    if (input.regulatoryCategory !== undefined) updateData.regulatory_category = input.regulatoryCategory;
    if (input.agencyName !== undefined) updateData.agency_name = input.agencyName;
    if (input.effectiveDate !== undefined) updateData.effective_date = input.effectiveDate;
    if (input.expirationDate !== undefined) updateData.expiration_date = input.expirationDate;
    if (input.tags !== undefined) updateData.tags = input.tags;
    if (input.notes !== undefined) updateData.notes = input.notes;

    if (input.status !== undefined) {
      updateData.status = input.status;
      updateData.status_changed_at = new Date().toISOString();
      if (input.statusNotes) updateData.status_notes = input.statusNotes;
    }

    const { data, error } = await supabase
      .from('compliance_documents')
      .update(updateData)
      .eq('id', input.id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: rowToComplianceDocument(data) };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Get a single compliance document by ID
 */
export async function getComplianceDocument(
  id: string
): Promise<ServiceResult<ComplianceDocument>> {
  try {
    const { data, error } = await supabase
      .from('compliance_documents')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return { success: true, data: rowToComplianceDocument(data) };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Get compliance documents with filters
 */
export async function getComplianceDocuments(
  filters?: ComplianceDocumentFilters
): Promise<ServiceResult<ComplianceDocumentOverview[]>> {
  try {
    let query = supabase
      .from('compliance_documents_overview')
      .select('*');

    if (filters) {
      if (filters.documentType) {
        const types = Array.isArray(filters.documentType) ? filters.documentType : [filters.documentType];
        query = query.in('document_type', types);
      }
      if (filters.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        query = query.in('status', statuses);
      }
      if (filters.applicableStates?.length) {
        query = query.overlaps('applicable_states', filters.applicableStates);
      }
      if (filters.regulatoryCategory) {
        query = query.eq('regulatory_category', filters.regulatoryCategory);
      }
      if (filters.agencyName) {
        query = query.ilike('agency_name', `%${filters.agencyName}%`);
      }
      if (filters.tags?.length) {
        query = query.overlaps('tags', filters.tags);
      }
      if (filters.isNational !== undefined) {
        query = query.eq('is_national', filters.isNational);
      }
      if (filters.expiringWithinDays) {
        query = query.lte('days_until_expiry', filters.expiringWithinDays);
        query = query.gt('days_until_expiry', 0);
      }
      if (filters.searchText) {
        query = query.textSearch('search_vector', filters.searchText);
      }
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) throw error;

    const documents: ComplianceDocumentOverview[] = (data || []).map((row) => ({
      ...rowToComplianceDocument(row),
      daysUntilExpiry: row.days_until_expiry as number | undefined,
      linkedProductsCount: row.linked_products_count as number,
      pendingReviewsCount: row.pending_reviews_count as number,
      activeAlertsCount: row.active_alerts_count as number,
    }));

    return { success: true, data: documents };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Delete a compliance document
 */
export async function deleteComplianceDocument(id: string): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase
      .from('compliance_documents')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// PRODUCT-DOCUMENT CORRELATION
// =============================================================================

/**
 * Link a document to a product
 */
export async function linkDocumentToProduct(
  input: LinkDocumentToProductInput
): Promise<ServiceResult<ProductComplianceDocument>> {
  try {
    if (!input.sku && !input.bomId && !input.productGroup) {
      return { success: false, error: 'At least one product reference (sku, bomId, or productGroup) is required' };
    }

    const { data, error } = await supabase
      .from('product_compliance_documents')
      .insert({
        document_id: input.documentId,
        sku: input.sku,
        bom_id: input.bomId,
        product_group: input.productGroup,
        relationship_type: input.relationshipType,
        applicable_states: input.applicableStates || [],
        effective_date: input.effectiveDate,
        expiration_date: input.expirationDate,
        priority: input.priority || 0,
        notes: input.notes,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      data: {
        id: data.id,
        documentId: data.document_id,
        sku: data.sku,
        bomId: data.bom_id,
        productGroup: data.product_group,
        relationshipType: data.relationship_type,
        applicableStates: data.applicable_states || [],
        effectiveDate: data.effective_date,
        expirationDate: data.expiration_date,
        isActive: data.is_active,
        priority: data.priority,
        notes: data.notes,
        createdAt: data.created_at,
        createdBy: data.created_by,
        updatedAt: data.updated_at,
        updatedBy: data.updated_by,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Unlink a document from a product
 */
export async function unlinkDocumentFromProduct(
  linkId: string
): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase
      .from('product_compliance_documents')
      .update({ is_active: false })
      .eq('id', linkId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Get documents for a product using the database function
 */
export async function getProductDocuments(
  sku?: string,
  bomId?: string,
  stateCode?: string,
  documentType?: string
): Promise<ServiceResult<ProductDocumentResult[]>> {
  try {
    const { data, error } = await supabase.rpc('get_product_compliance_documents', {
      p_sku: sku || null,
      p_bom_id: bomId || null,
      p_state_code: stateCode || null,
      p_document_type: documentType || null,
    });

    if (error) throw error;

    const results: ProductDocumentResult[] = (data || []).map((row: Record<string, unknown>) => ({
      documentId: row.document_id as string,
      documentName: row.document_name as string,
      documentType: row.document_type as ComplianceDocumentType,
      documentNumber: row.document_number as string | undefined,
      status: row.status as ComplianceDocumentStatus,
      relationshipType: row.relationship_type as string,
      effectiveDate: row.effective_date as string | undefined,
      expirationDate: row.expiration_date as string | undefined,
      fileUrl: row.file_url as string | undefined,
      applicableStates: row.applicable_states as string[],
      agencyName: row.agency_name as string | undefined,
    }));

    return { success: true, data: results };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// STATE SELECTION OPERATIONS
// =============================================================================

/**
 * Set compliance status for a product in a state
 */
export async function setProductStateCompliance(
  input: SetProductStateComplianceInput
): Promise<ServiceResult<ComplianceItemState>> {
  try {
    if (!input.sku && !input.bomId && !input.productGroup) {
      return { success: false, error: 'At least one product reference is required' };
    }

    const { data, error } = await supabase
      .from('compliance_item_states')
      .upsert({
        sku: input.sku,
        bom_id: input.bomId,
        product_group: input.productGroup,
        state_code: input.stateCode,
        compliance_status: input.complianceStatus || 'unknown',
        is_registered: input.isRegistered || false,
        registration_number: input.registrationNumber,
        registration_date: input.registrationDate,
        registration_expiry: input.registrationExpiry,
        state_specific_notes: input.stateSpecificNotes,
        special_requirements: input.specialRequirements || [],
        is_active: input.isActive ?? true,
        market_priority: input.marketPriority || 0,
      }, {
        onConflict: 'sku,bom_id,product_group,state_code',
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      data: {
        id: data.id,
        sku: data.sku,
        bomId: data.bom_id,
        productGroup: data.product_group,
        stateCode: data.state_code,
        complianceStatus: data.compliance_status,
        isRegistered: data.is_registered,
        registrationNumber: data.registration_number,
        registrationDate: data.registration_date,
        registrationExpiry: data.registration_expiry,
        registrationFeePaid: data.registration_fee_paid,
        stateSpecificNotes: data.state_specific_notes,
        specialRequirements: data.special_requirements || [],
        requiredWarnings: data.required_warnings || [],
        prohibitedClaims: data.prohibited_claims || [],
        lastAssessmentDate: data.last_assessment_date,
        lastAssessmentBy: data.last_assessment_by,
        nextReviewDate: data.next_review_date,
        isActive: data.is_active,
        marketPriority: data.market_priority,
        createdAt: data.created_at,
        createdBy: data.created_by,
        updatedAt: data.updated_at,
        updatedBy: data.updated_by,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Bulk set states for a product
 */
export async function bulkSetProductStates(
  productRef: { sku?: string; bomId?: string; productGroup?: string },
  stateCodes: string[],
  deactivateOthers: boolean = false
): Promise<ServiceResult<BulkStateSelectionResult>> {
  try {
    const statesAdded: string[] = [];
    const errors: Array<{ stateCode: string; error: string }> = [];

    // Add selected states
    for (const stateCode of stateCodes) {
      const result = await setProductStateCompliance({
        ...productRef,
        stateCode,
        isActive: true,
      });

      if (result.success) {
        statesAdded.push(stateCode);
      } else {
        errors.push({ stateCode, error: result.error || 'Unknown error' });
      }
    }

    // Optionally deactivate states not in the list
    const statesRemoved: string[] = [];
    if (deactivateOthers) {
      let query = supabase
        .from('compliance_item_states')
        .update({ is_active: false })
        .eq('is_active', true);

      if (productRef.sku) query = query.eq('sku', productRef.sku);
      if (productRef.bomId) query = query.eq('bom_id', productRef.bomId);
      if (productRef.productGroup) query = query.eq('product_group', productRef.productGroup);

      if (stateCodes.length > 0) {
        query = query.not('state_code', 'in', `(${stateCodes.join(',')})`);
      }

      const { data, error } = await query.select('state_code');

      if (!error && data) {
        statesRemoved.push(...data.map((row) => row.state_code));
      }
    }

    return {
      success: errors.length === 0,
      data: { success: errors.length === 0, statesAdded, statesRemoved, errors: errors.length > 0 ? errors : undefined },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Get compliance summary for a product
 */
export async function getProductComplianceSummary(
  sku?: string,
  bomId?: string
): Promise<ServiceResult<ProductComplianceSummary[]>> {
  try {
    const { data, error } = await supabase.rpc('get_product_compliance_summary', {
      p_sku: sku || null,
      p_bom_id: bomId || null,
    });

    if (error) throw error;

    const results: ProductComplianceSummary[] = (data || []).map((row: Record<string, unknown>) => ({
      stateCode: row.state_code as string,
      stateName: row.state_name as string,
      complianceStatus: row.compliance_status as ComplianceStatus,
      isRegistered: row.is_registered as boolean,
      registrationExpiry: row.registration_expiry as string | undefined,
      documentCount: row.document_count as number,
      missingDocumentTypes: row.missing_document_types as string[],
      alertsCount: row.alerts_count as number,
      lastAssessment: row.last_assessment as string | undefined,
    }));

    return { success: true, data: results };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Get state selection options with current status
 */
export async function getStateSelectionOptions(
  productRef?: { sku?: string; bomId?: string; productGroup?: string }
): Promise<ServiceResult<StateSelectionOption[]>> {
  try {
    // Get all states with ratings
    const { data: statesData, error: statesError } = await supabase
      .from('state_compliance_ratings')
      .select('state_code, state_name, strictness_level, strictness_score, registration_required')
      .order('strictness_score', { ascending: false });

    if (statesError) throw statesError;

    // Get selected states for product if provided
    let selectedStates: Set<string> = new Set();
    let stateStatus: Map<string, ComplianceStatus> = new Map();
    let stateDocs: Map<string, number> = new Map();

    if (productRef && (productRef.sku || productRef.bomId || productRef.productGroup)) {
      let query = supabase
        .from('compliance_item_states')
        .select('state_code, compliance_status, is_active')
        .eq('is_active', true);

      if (productRef.sku) query = query.eq('sku', productRef.sku);
      if (productRef.bomId) query = query.eq('bom_id', productRef.bomId);
      if (productRef.productGroup) query = query.eq('product_group', productRef.productGroup);

      const { data: selectedData } = await query;

      if (selectedData) {
        selectedData.forEach((row) => {
          selectedStates.add(row.state_code);
          stateStatus.set(row.state_code, row.compliance_status);
        });
      }
    }

    const options: StateSelectionOption[] = (statesData || []).map((state) => ({
      stateCode: state.state_code,
      stateName: state.state_name,
      strictnessLevel: state.strictness_level,
      strictnessScore: state.strictness_score,
      registrationRequired: state.registration_required,
      isSelected: selectedStates.has(state.state_code),
      complianceStatus: stateStatus.get(state.state_code),
      documentCount: stateDocs.get(state.state_code),
    }));

    return { success: true, data: options };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// ALERTS OPERATIONS
// =============================================================================

/**
 * Get active compliance alerts
 */
export async function getComplianceAlerts(
  filters?: ComplianceAlertFilters
): Promise<ServiceResult<ComplianceAlert[]>> {
  try {
    let query = supabase
      .from('compliance_alerts_dashboard')
      .select('*');

    if (filters) {
      if (filters.alertType) {
        const types = Array.isArray(filters.alertType) ? filters.alertType : [filters.alertType];
        query = query.in('alert_type', types);
      }
      if (filters.severity) {
        const severities = Array.isArray(filters.severity) ? filters.severity : [filters.severity];
        query = query.in('severity', severities);
      }
      if (filters.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        query = query.in('status', statuses);
      }
      if (filters.applicableStates?.length) {
        query = query.overlaps('applicable_states', filters.applicableStates);
      }
      if (filters.documentId) {
        query = query.eq('document_id', filters.documentId);
      }
      if (filters.deadlineBefore) {
        query = query.lte('action_deadline', filters.deadlineBefore);
      }
    }

    const { data, error } = await query;

    if (error) throw error;

    const alerts: ComplianceAlert[] = (data || []).map((row) => ({
      id: row.id,
      documentId: row.document_id,
      itemStateId: row.item_state_id,
      regulationId: row.regulation_id,
      alertType: row.alert_type,
      severity: row.severity,
      title: row.title,
      message: row.message,
      actionRequired: row.action_required,
      actionDeadline: row.action_deadline,
      applicableStates: row.applicable_states || [],
      affectedSkus: row.affected_skus || [],
      affectedBomIds: row.affected_bom_ids || [],
      status: row.status,
      snoozedUntil: row.snoozed_until,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by,
      resolutionNotes: row.resolution_notes,
      notificationSent: row.notification_sent,
      notificationSentAt: row.notification_sent_at,
      notificationRecipients: row.notification_recipients || [],
      createdAt: row.created_at,
      createdBy: row.created_by,
    }));

    return { success: true, data: alerts };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Resolve an alert
 */
export async function resolveAlert(
  alertId: string,
  resolutionNotes?: string
): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase
      .from('compliance_alerts')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolution_notes: resolutionNotes,
      })
      .eq('id', alertId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Snooze an alert
 */
export async function snoozeAlert(
  alertId: string,
  snoozeDays: number
): Promise<ServiceResult<void>> {
  try {
    const snoozeUntil = new Date();
    snoozeUntil.setDate(snoozeUntil.getDate() + snoozeDays);

    const { error } = await supabase
      .from('compliance_alerts')
      .update({
        status: 'snoozed',
        snoozed_until: snoozeUntil.toISOString().split('T')[0],
      })
      .eq('id', alertId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Generate expiration alerts
 */
export async function generateExpirationAlerts(): Promise<ServiceResult<number>> {
  try {
    const { data, error } = await supabase.rpc('generate_expiration_alerts');

    if (error) throw error;
    return { success: true, data: data as number };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// DOCUMENT REVIEW OPERATIONS
// =============================================================================

/**
 * Create a document review request
 */
export async function createDocumentReview(
  input: CreateDocumentReviewInput
): Promise<ServiceResult<ComplianceDocumentReview>> {
  try {
    const { data, error } = await supabase
      .from('compliance_document_reviews')
      .insert({
        document_id: input.documentId,
        review_type: input.reviewType,
        reviewer_name: input.reviewerName,
        reviewer_email: input.reviewerEmail,
        reviewer_role: input.reviewerRole,
        reviewer_organization: input.reviewerOrganization,
        due_date: input.dueDate,
        review_status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      data: {
        id: data.id,
        documentId: data.document_id,
        reviewType: data.review_type,
        reviewerName: data.reviewer_name,
        reviewerEmail: data.reviewer_email,
        reviewerRole: data.reviewer_role,
        reviewerOrganization: data.reviewer_organization,
        reviewStatus: data.review_status,
        requestedAt: data.requested_at,
        dueDate: data.due_date,
        completedAt: data.completed_at,
        comments: data.comments,
        requestedChanges: data.requested_changes || [],
        attachmentUrls: data.attachment_urls || [],
        createdAt: data.created_at,
        createdBy: data.created_by,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Complete a document review
 */
export async function completeDocumentReview(
  input: CompleteDocumentReviewInput
): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase
      .from('compliance_document_reviews')
      .update({
        review_status: input.reviewStatus,
        comments: input.comments,
        requested_changes: input.requestedChanges || [],
        completed_at: new Date().toISOString(),
      })
      .eq('id', input.reviewId);

    if (error) throw error;

    // If review is approved, update document status
    if (input.reviewStatus === 'approved') {
      const { data: review } = await supabase
        .from('compliance_document_reviews')
        .select('document_id, review_type')
        .eq('id', input.reviewId)
        .single();

      if (review?.review_type === 'final') {
        await supabase
          .from('compliance_documents')
          .update({
            status: 'approved',
            status_changed_at: new Date().toISOString(),
          })
          .eq('id', review.document_id);
      }
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// EXPIRING DOCUMENTS
// =============================================================================

/**
 * Get expiring documents
 */
export async function getExpiringDocuments(
  daysAhead: number = 30,
  stateCode?: string
): Promise<ServiceResult<ExpiringDocument[]>> {
  try {
    const { data, error } = await supabase.rpc('get_expiring_documents', {
      p_days_ahead: daysAhead,
      p_state_code: stateCode || null,
    });

    if (error) throw error;

    const results: ExpiringDocument[] = (data || []).map((row: Record<string, unknown>) => ({
      documentId: row.document_id as string,
      documentName: row.document_name as string,
      documentType: row.document_type as ComplianceDocumentType,
      documentNumber: row.document_number as string | undefined,
      expirationDate: row.expiration_date as string,
      daysUntilExpiry: row.days_until_expiry as number,
      applicableStates: row.applicable_states as string[],
      affectedProducts: row.affected_products as Array<{
        sku?: string;
        bomId?: string;
        relationship: string;
      }>,
    }));

    return { success: true, data: results };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// STATE COMPLIANCE MATRIX
// =============================================================================

/**
 * Get state compliance matrix
 */
export async function getStateComplianceMatrix(): Promise<ServiceResult<StateComplianceMatrix[]>> {
  try {
    const { data, error } = await supabase
      .from('state_compliance_matrix')
      .select('*')
      .order('strictness_score', { ascending: false });

    if (error) throw error;

    const results: StateComplianceMatrix[] = (data || []).map((row) => ({
      stateCode: row.state_code,
      stateName: row.state_name,
      strictnessLevel: row.strictness_level,
      strictnessScore: row.strictness_score,
      registrationRequired: row.registration_required,
      activeProducts: row.active_products,
      compliantProducts: row.compliant_products,
      registeredProducts: row.registered_products,
      documentCount: row.document_count,
      activeAlerts: row.active_alerts,
    }));

    return { success: true, data: results };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// DASHBOARD SUMMARY
// =============================================================================

/**
 * Get compliance dashboard summary
 */
export async function getComplianceDashboardSummary(): Promise<ServiceResult<ComplianceDashboardSummary>> {
  try {
    // Get document counts by type and status
    const { data: docStats, error: docError } = await supabase
      .from('compliance_documents')
      .select('document_type, status')
      .not('status', 'eq', 'archived');

    if (docError) throw docError;

    // Get expiring documents
    const { data: expiring30 } = await supabase
      .from('compliance_documents')
      .select('id')
      .eq('status', 'approved')
      .lte('expiration_date', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .gte('expiration_date', new Date().toISOString().split('T')[0]);

    const { data: expiring90 } = await supabase
      .from('compliance_documents')
      .select('id')
      .eq('status', 'approved')
      .lte('expiration_date', new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .gte('expiration_date', new Date().toISOString().split('T')[0]);

    // Get alert counts
    const { data: alertStats, error: alertError } = await supabase
      .from('compliance_alerts')
      .select('severity')
      .eq('status', 'active');

    if (alertError) throw alertError;

    // Get product compliance stats
    const { data: productStats, error: productError } = await supabase
      .from('compliance_item_states')
      .select('compliance_status')
      .eq('is_active', true);

    if (productError) throw productError;

    // Get pending reviews
    const { data: reviews } = await supabase
      .from('compliance_document_reviews')
      .select('id')
      .eq('review_status', 'pending');

    // Get states covered
    const { data: statesCovered } = await supabase
      .from('compliance_item_states')
      .select('state_code')
      .eq('is_active', true);

    // Build summary
    const documentsByType: Record<ComplianceDocumentType, number> = {} as Record<ComplianceDocumentType, number>;
    const documentsByStatus: Record<ComplianceDocumentStatus, number> = {} as Record<ComplianceDocumentStatus, number>;

    (docStats || []).forEach((doc) => {
      documentsByType[doc.document_type as ComplianceDocumentType] = (documentsByType[doc.document_type as ComplianceDocumentType] || 0) + 1;
      documentsByStatus[doc.status as ComplianceDocumentStatus] = (documentsByStatus[doc.status as ComplianceDocumentStatus] || 0) + 1;
    });

    const alertsBySeverity: Record<AlertSeverity, number> = {} as Record<AlertSeverity, number>;
    (alertStats || []).forEach((alert) => {
      alertsBySeverity[alert.severity as AlertSeverity] = (alertsBySeverity[alert.severity as AlertSeverity] || 0) + 1;
    });

    const compliantProducts = (productStats || []).filter((p) => p.compliance_status === 'compliant').length;
    const nonCompliantProducts = (productStats || []).filter((p) => p.compliance_status === 'non_compliant').length;

    const uniqueStates = new Set((statesCovered || []).map((s) => s.state_code));

    return {
      success: true,
      data: {
        totalDocuments: docStats?.length || 0,
        documentsByType,
        documentsByStatus,
        expiringWithin30Days: expiring30?.length || 0,
        expiringWithin90Days: expiring90?.length || 0,
        activeAlerts: alertStats?.length || 0,
        alertsBySeverity,
        totalProducts: productStats?.length || 0,
        compliantProducts,
        nonCompliantProducts,
        statesCovered: uniqueStates.size,
        pendingReviews: reviews?.length || 0,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
