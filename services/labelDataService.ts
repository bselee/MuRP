/**
 * Label Data Service
 *
 * Service layer for managing label data in Supabase
 * Handles CRUD operations for labels, product data sheets, and compliance records
 */

import { supabase } from '../lib/supabase/client';
import type { Label, ProductDataSheet, ComplianceRecord } from '../types';
import type { Database } from '../types/database';

type LabelInsert = Database['public']['Tables']['labels']['Insert'];
type LabelUpdate = Database['public']['Tables']['labels']['Update'];
type ProductDataSheetInsert = Database['public']['Tables']['product_data_sheets']['Insert'];
type ComplianceRecordInsert = Database['public']['Tables']['compliance_records']['Insert'];

// ============================================================================
// Labels
// ============================================================================

/**
 * Create a new label in Supabase
 */
export async function createLabel(
  label: Omit<Label, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Label> {
  const labelData: LabelInsert = {
    file_name: label.fileName,
    file_url: label.fileUrl,
    file_size: label.fileSize,
    mime_type: label.mimeType,
    barcode: label.barcode,
    product_name: label.productName,
    net_weight: label.netWeight,
    revision: label.revision,
    bom_id: label.bomId || null,
    scan_status: label.scanStatus,
    scan_completed_at: label.scanCompletedAt,
    scan_error: label.scanError,
    extracted_data: label.extractedData as any,
    ingredient_comparison: label.ingredientComparison as any,
    verified: label.verified,
    verified_by: label.verifiedBy || null,
    verified_at: label.verifiedAt,
    file_type: label.fileType,
    status: label.status,
    approved_by: label.approvedBy || null,
    approved_date: label.approvedDate,
    notes: label.notes,
    uploaded_by: label.uploadedBy || null,
  };

  const { data, error } = await supabase
    .from('labels')
    .insert(labelData)
    .select()
    .single();

  if (error) {
    console.error('Error creating label:', error);
    throw new Error(`Failed to create label: ${error.message}`);
  }

  return mapLabelFromDb(data);
}

/**
 * Update an existing label
 */
export async function updateLabel(
  id: string,
  updates: Partial<Omit<Label, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Label> {
  const updateData: LabelUpdate = {
    file_name: updates.fileName,
    file_url: updates.fileUrl,
    file_size: updates.fileSize,
    mime_type: updates.mimeType,
    barcode: updates.barcode,
    product_name: updates.productName,
    net_weight: updates.netWeight,
    revision: updates.revision,
    bom_id: updates.bomId,
    scan_status: updates.scanStatus,
    scan_completed_at: updates.scanCompletedAt,
    scan_error: updates.scanError,
    extracted_data: updates.extractedData as any,
    ingredient_comparison: updates.ingredientComparison as any,
    verified: updates.verified,
    verified_by: updates.verifiedBy,
    verified_at: updates.verifiedAt,
    file_type: updates.fileType,
    status: updates.status,
    approved_by: updates.approvedBy,
    approved_date: updates.approvedDate,
    notes: updates.notes,
  };

  // Remove undefined values
  Object.keys(updateData).forEach(key => {
    if (updateData[key as keyof LabelUpdate] === undefined) {
      delete updateData[key as keyof LabelUpdate];
    }
  });

  const { data, error } = await supabase
    .from('labels')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating label:', error);
    throw new Error(`Failed to update label: ${error.message}`);
  }

  return mapLabelFromDb(data);
}

/**
 * Get a label by ID
 */
export async function getLabel(id: string): Promise<Label | null> {
  const { data, error } = await supabase
    .from('labels')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('Error getting label:', error);
    throw new Error(`Failed to get label: ${error.message}`);
  }

  return mapLabelFromDb(data);
}

/**
 * Get all labels for a BOM
 */
export async function getLabelsByBom(bomId: string): Promise<Label[]> {
  const { data, error } = await supabase
    .from('labels')
    .select('*')
    .eq('bom_id', bomId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error getting labels by BOM:', error);
    throw new Error(`Failed to get labels: ${error.message}`);
  }

  return data.map(mapLabelFromDb);
}

/**
 * Get all labels (with optional filters)
 */
export async function getAllLabels(filters?: {
  scanStatus?: Label['scanStatus'];
  verified?: boolean;
  status?: Label['status'];
  limit?: number;
}): Promise<Label[]> {
  let query = supabase
    .from('labels')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.scanStatus) {
    query = query.eq('scan_status', filters.scanStatus);
  }
  if (filters?.verified !== undefined) {
    query = query.eq('verified', filters.verified);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error getting all labels:', error);
    throw new Error(`Failed to get labels: ${error.message}`);
  }

  return data.map(mapLabelFromDb);
}

/**
 * Search labels by barcode
 */
export async function searchLabelsByBarcode(barcode: string): Promise<Label[]> {
  const { data, error } = await supabase
    .from('labels')
    .select('*')
    .eq('barcode', barcode)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error searching labels by barcode:', error);
    throw new Error(`Failed to search labels: ${error.message}`);
  }

  return data.map(mapLabelFromDb);
}

/**
 * Delete a label
 */
export async function deleteLabel(id: string): Promise<void> {
  const { error } = await supabase
    .from('labels')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting label:', error);
    throw new Error(`Failed to delete label: ${error.message}`);
  }
}

// ============================================================================
// Product Data Sheets
// ============================================================================

/**
 * Create a new product data sheet
 */
export async function createProductDataSheet(
  dataSheet: Omit<ProductDataSheet, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ProductDataSheet> {
  const dataSheetData: ProductDataSheetInsert = {
    bom_id: dataSheet.bomId,
    label_id: dataSheet.labelId || null,
    document_type: dataSheet.documentType,
    title: dataSheet.title,
    version: dataSheet.version,
    description: dataSheet.description,
    content: dataSheet.content as any,
    pdf_url: dataSheet.pdfUrl,
    pdf_generated_at: dataSheet.pdfGeneratedAt,
    pdf_file_size: dataSheet.pdfFileSize,
    status: dataSheet.status,
    approved_by: dataSheet.approvedBy || null,
    approved_at: dataSheet.approvedAt,
    approval_notes: dataSheet.approvalNotes,
    is_ai_generated: dataSheet.isAiGenerated,
    ai_model_used: dataSheet.aiModelUsed,
    generation_prompt: dataSheet.generationPrompt,
    last_edited_by: dataSheet.lastEditedBy || null,
    edit_count: dataSheet.editCount,
    edit_history: dataSheet.editHistory as any,
    published_at: dataSheet.publishedAt,
    published_version: dataSheet.publishedVersion,
    tags: dataSheet.tags,
    notes: dataSheet.notes,
    created_by: dataSheet.createdBy || null,
  };

  const { data, error } = await supabase
    .from('product_data_sheets')
    .insert(dataSheetData)
    .select()
    .single();

  if (error) {
    console.error('Error creating product data sheet:', error);
    throw new Error(`Failed to create product data sheet: ${error.message}`);
  }

  return mapProductDataSheetFromDb(data);
}

/**
 * Get all product data sheets for a BOM
 */
export async function getProductDataSheetsByBom(bomId: string): Promise<ProductDataSheet[]> {
  const { data, error } = await supabase
    .from('product_data_sheets')
    .select('*')
    .eq('bom_id', bomId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error getting product data sheets:', error);
    throw new Error(`Failed to get product data sheets: ${error.message}`);
  }

  return data.map(mapProductDataSheetFromDb);
}

// ============================================================================
// Compliance Records
// ============================================================================

/**
 * Create a new compliance record
 */
export async function createComplianceRecord(
  record: Omit<ComplianceRecord, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ComplianceRecord> {
  const recordData: ComplianceRecordInsert = {
    bom_id: record.bomId,
    label_id: record.labelId || null,
    compliance_type: record.complianceType,
    category: record.category,
    issuing_authority: record.issuingAuthority,
    state_code: record.stateCode,
    state_name: record.stateName,
    registration_number: record.registrationNumber,
    license_number: record.licenseNumber,
    registered_date: record.registeredDate,
    effective_date: record.effectiveDate,
    expiration_date: record.expirationDate,
    renewal_date: record.renewalDate,
    last_renewed_date: record.lastRenewedDate,
    status: record.status,
    registration_fee: record.registrationFee,
    renewal_fee: record.renewalFee,
    late_fee: record.lateFee,
    currency: record.currency,
    payment_status: record.paymentStatus,
    certificate_url: record.certificateUrl,
    certificate_file_name: record.certificateFileName,
    certificate_file_size: record.certificateFileSize,
    additional_documents: record.additionalDocuments as any,
    requirements: record.requirements,
    restrictions: record.restrictions,
    conditions: record.conditions as any,
    contact_person: record.contactPerson,
    contact_email: record.contactEmail,
    contact_phone: record.contactPhone,
    authority_website: record.authorityWebsite,
    assigned_to: record.assignedTo || null,
    priority: record.priority,
    notes: record.notes,
    internal_notes: record.internalNotes,
    created_by: record.createdBy || null,
  };

  const { data, error } = await supabase
    .from('compliance_records')
    .insert(recordData)
    .select()
    .single();

  if (error) {
    console.error('Error creating compliance record:', error);
    throw new Error(`Failed to create compliance record: ${error.message}`);
  }

  return mapComplianceRecordFromDb(data);
}

/**
 * Get all compliance records for a BOM
 */
export async function getComplianceRecordsByBom(bomId: string): Promise<ComplianceRecord[]> {
  const { data, error } = await supabase
    .from('compliance_records')
    .select('*')
    .eq('bom_id', bomId)
    .order('expiration_date', { ascending: true });

  if (error) {
    console.error('Error getting compliance records:', error);
    throw new Error(`Failed to get compliance records: ${error.message}`);
  }

  return data.map(mapComplianceRecordFromDb);
}

/**
 * Get upcoming renewals (within specified days)
 */
export async function getUpcomingRenewals(daysAhead: number = 90): Promise<ComplianceRecord[]> {
  const { data, error } = await supabase
    .rpc('get_upcoming_renewals', { p_days_ahead: daysAhead });

  if (error) {
    console.error('Error getting upcoming renewals:', error);
    throw new Error(`Failed to get upcoming renewals: ${error.message}`);
  }

  return data.map(mapComplianceRecordFromDb);
}

// ============================================================================
// Helper Functions - Map Database Types to Application Types
// ============================================================================

function mapLabelFromDb(dbLabel: any): Label {
  return {
    id: dbLabel.id,
    fileName: dbLabel.file_name,
    fileUrl: dbLabel.file_url,
    fileSize: dbLabel.file_size,
    mimeType: dbLabel.mime_type,
    barcode: dbLabel.barcode,
    productName: dbLabel.product_name,
    netWeight: dbLabel.net_weight,
    revision: dbLabel.revision,
    bomId: dbLabel.bom_id,
    scanStatus: dbLabel.scan_status,
    scanCompletedAt: dbLabel.scan_completed_at,
    scanError: dbLabel.scan_error,
    extractedData: dbLabel.extracted_data,
    ingredientComparison: dbLabel.ingredient_comparison,
    verified: dbLabel.verified,
    verifiedBy: dbLabel.verified_by,
    verifiedAt: dbLabel.verified_at,
    fileType: dbLabel.file_type,
    status: dbLabel.status,
    approvedBy: dbLabel.approved_by,
    approvedDate: dbLabel.approved_date,
    notes: dbLabel.notes,
    uploadedBy: dbLabel.uploaded_by,
    createdAt: dbLabel.created_at,
    updatedAt: dbLabel.updated_at,
  };
}

function mapProductDataSheetFromDb(dbSheet: any): ProductDataSheet {
  return {
    id: dbSheet.id,
    bomId: dbSheet.bom_id,
    labelId: dbSheet.label_id,
    documentType: dbSheet.document_type,
    title: dbSheet.title,
    version: dbSheet.version,
    description: dbSheet.description,
    content: dbSheet.content,
    pdfUrl: dbSheet.pdf_url,
    pdfGeneratedAt: dbSheet.pdf_generated_at,
    pdfFileSize: dbSheet.pdf_file_size,
    status: dbSheet.status,
    approvedBy: dbSheet.approved_by,
    approvedAt: dbSheet.approved_at,
    approvalNotes: dbSheet.approval_notes,
    isAiGenerated: dbSheet.is_ai_generated,
    aiModelUsed: dbSheet.ai_model_used,
    generationPrompt: dbSheet.generation_prompt,
    lastEditedBy: dbSheet.last_edited_by,
    editCount: dbSheet.edit_count,
    editHistory: dbSheet.edit_history,
    publishedAt: dbSheet.published_at,
    publishedVersion: dbSheet.published_version,
    tags: dbSheet.tags,
    notes: dbSheet.notes,
    createdBy: dbSheet.created_by,
    createdAt: dbSheet.created_at,
    updatedAt: dbSheet.updated_at,
  };
}

function mapComplianceRecordFromDb(dbRecord: any): ComplianceRecord {
  return {
    id: dbRecord.id,
    bomId: dbRecord.bom_id,
    labelId: dbRecord.label_id,
    complianceType: dbRecord.compliance_type,
    category: dbRecord.category,
    issuingAuthority: dbRecord.issuing_authority,
    stateCode: dbRecord.state_code,
    stateName: dbRecord.state_name,
    registrationNumber: dbRecord.registration_number,
    licenseNumber: dbRecord.license_number,
    registeredDate: dbRecord.registered_date,
    effectiveDate: dbRecord.effective_date,
    expirationDate: dbRecord.expiration_date,
    renewalDate: dbRecord.renewal_date,
    lastRenewedDate: dbRecord.last_renewed_date,
    status: dbRecord.status,
    daysUntilExpiration: dbRecord.days_until_expiration,
    registrationFee: dbRecord.registration_fee,
    renewalFee: dbRecord.renewal_fee,
    lateFee: dbRecord.late_fee,
    currency: dbRecord.currency,
    paymentStatus: dbRecord.payment_status,
    certificateUrl: dbRecord.certificate_url,
    certificateFileName: dbRecord.certificate_file_name,
    certificateFileSize: dbRecord.certificate_file_size,
    additionalDocuments: dbRecord.additional_documents,
    dueSoonAlertSent: dbRecord.due_soon_alert_sent,
    urgentAlertSent: dbRecord.urgent_alert_sent,
    expirationAlertSent: dbRecord.expiration_alert_sent,
    alertEmailAddresses: dbRecord.alert_email_addresses,
    requirements: dbRecord.requirements,
    restrictions: dbRecord.restrictions,
    conditions: dbRecord.conditions,
    contactPerson: dbRecord.contact_person,
    contactEmail: dbRecord.contact_email,
    contactPhone: dbRecord.contact_phone,
    authorityWebsite: dbRecord.authority_website,
    assignedTo: dbRecord.assigned_to,
    priority: dbRecord.priority,
    notes: dbRecord.notes,
    internalNotes: dbRecord.internal_notes,
    createdBy: dbRecord.created_by,
    createdAt: dbRecord.created_at,
    updatedAt: dbRecord.updated_at,
    lastVerifiedAt: dbRecord.last_verified_at,
    lastVerifiedBy: dbRecord.last_verified_by,
  };
}
