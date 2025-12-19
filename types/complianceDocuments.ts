/**
 * Compliance Document System Types
 *
 * Type definitions for the compliance document management system
 * including document storage, state selection, and product correlation.
 */

// =============================================================================
// ENUMS AND CONSTANTS
// =============================================================================

export const COMPLIANCE_DOCUMENT_TYPES = [
  'artwork',
  'label_proof',
  'certificate',
  'registration',
  'test_report',
  'statute',
  'guidance',
  'letter',
  'sds',
  'specification',
  'approval',
  'amendment',
  'renewal',
  'audit_report',
  'other',
] as const;

export type ComplianceDocumentType = typeof COMPLIANCE_DOCUMENT_TYPES[number];

export const COMPLIANCE_DOCUMENT_STATUS = [
  'draft',
  'pending_review',
  'pending_approval',
  'approved',
  'expired',
  'superseded',
  'rejected',
  'archived',
] as const;

export type ComplianceDocumentStatus = typeof COMPLIANCE_DOCUMENT_STATUS[number];

export const COMPLIANCE_STATUS = [
  'unknown',
  'compliant',
  'pending',
  'needs_attention',
  'non_compliant',
  'not_applicable',
  'exempt',
] as const;

export type ComplianceStatus = typeof COMPLIANCE_STATUS[number];

export const RELATIONSHIP_TYPES = [
  'applies_to',
  'required_for',
  'supersedes_for',
  'reference',
  'certification',
  'artwork',
  'test_result',
  'registration',
] as const;

export type RelationshipType = typeof RELATIONSHIP_TYPES[number];

export const JURISDICTION_LEVELS = [
  'federal',
  'state',
  'local',
  'international',
] as const;

export type JurisdictionLevel = typeof JURISDICTION_LEVELS[number];

export const ALERT_TYPES = [
  'expiration_warning',
  'expired',
  'renewal_due',
  'regulation_change',
  'new_requirement',
  'review_due',
  'missing_document',
  'compliance_issue',
  'custom',
] as const;

export type AlertType = typeof ALERT_TYPES[number];

export const ALERT_SEVERITY = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
] as const;

export type AlertSeverity = typeof ALERT_SEVERITY[number];

export const ALERT_STATUS = [
  'active',
  'acknowledged',
  'resolved',
  'snoozed',
  'dismissed',
] as const;

export type AlertStatus = typeof ALERT_STATUS[number];

export const REVIEW_TYPES = [
  'internal',
  'external',
  'agency',
  'legal',
  'final',
] as const;

export type ReviewType = typeof REVIEW_TYPES[number];

export const REVIEW_STATUS = [
  'pending',
  'approved',
  'rejected',
  'changes_requested',
  'skipped',
] as const;

export type ReviewStatus = typeof REVIEW_STATUS[number];

// =============================================================================
// MAIN TYPES
// =============================================================================

/**
 * Compliance Document - Central document record
 */
export interface ComplianceDocument {
  id: string;
  documentName: string;
  documentType: ComplianceDocumentType;
  documentNumber?: string;
  description?: string;

  // File storage
  filePath?: string;
  fileUrl?: string;
  fileName: string;
  fileSize?: number;
  fileMimeType?: string;
  fileHash?: string;
  thumbnailUrl?: string;

  // Geographic scope
  applicableStates: string[];
  isNational: boolean;
  jurisdictionLevel: JurisdictionLevel;

  // Regulatory context
  regulatoryCategory?: string;
  agencyName?: string;
  agencyContactEmail?: string;
  agencyContactPhone?: string;
  regulationCode?: string;

  // Validity period
  effectiveDate?: string;
  expirationDate?: string;
  renewalReminderDays: number;

  // Status
  status: ComplianceDocumentStatus;
  statusChangedAt?: string;
  statusChangedBy?: string;
  statusNotes?: string;

  // Version control
  version: number;
  supersedesId?: string;
  supersededById?: string;

  // Content extraction
  extractedText?: string;
  extractedData?: Record<string, unknown>;
  extractionMethod?: string;
  extractionDate?: string;

  // Tags and search
  tags: string[];
  keywords: string[];

  // Ownership
  uploadedBy?: string;
  ownedBy?: string;

  // Metadata
  customFields: Record<string, unknown>;
  notes?: string;
  internalNotes?: string;

  // Audit
  createdAt: string;
  createdBy?: string;
  updatedAt: string;
  updatedBy?: string;
}

/**
 * Product-Document correlation
 */
export interface ProductComplianceDocument {
  id: string;
  documentId: string;

  // Product references
  sku?: string;
  bomId?: string;
  productGroup?: string;

  // Relationship
  relationshipType: RelationshipType;
  applicableStates: string[];

  // Validity
  effectiveDate?: string;
  expirationDate?: string;
  isActive: boolean;

  // Priority
  priority: number;

  // Notes
  notes?: string;

  // Audit
  createdAt: string;
  createdBy?: string;
  updatedAt: string;
  updatedBy?: string;
}

/**
 * Compliance Item State Selection
 */
export interface ComplianceItemState {
  id: string;

  // Item identification
  sku?: string;
  bomId?: string;
  productGroup?: string;

  // State selection
  stateCode: string;
  complianceStatus: ComplianceStatus;

  // Registration tracking
  isRegistered: boolean;
  registrationNumber?: string;
  registrationDate?: string;
  registrationExpiry?: string;
  registrationFeePaid?: number;

  // Notes and requirements
  stateSpecificNotes?: string;
  specialRequirements: string[];
  requiredWarnings: string[];
  prohibitedClaims: string[];

  // Assessment tracking
  lastAssessmentDate?: string;
  lastAssessmentBy?: string;
  nextReviewDate?: string;

  // Active flag
  isActive: boolean;
  marketPriority: number;

  // Audit
  createdAt: string;
  createdBy?: string;
  updatedAt: string;
  updatedBy?: string;
}

/**
 * Document Version
 */
export interface ComplianceDocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  filePath?: string;
  fileUrl?: string;
  fileName: string;
  fileSize?: number;
  fileHash?: string;
  changeSummary?: string;
  changeType?: 'minor_update' | 'major_revision' | 'correction' | 'renewal' | 'initial';
  statusAtVersion?: ComplianceDocumentStatus;
  createdAt: string;
  createdBy?: string;
}

/**
 * Document Review
 */
export interface ComplianceDocumentReview {
  id: string;
  documentId: string;
  reviewType: ReviewType;
  reviewerName: string;
  reviewerEmail?: string;
  reviewerRole?: string;
  reviewerOrganization?: string;
  reviewStatus: ReviewStatus;
  requestedAt: string;
  dueDate?: string;
  completedAt?: string;
  comments?: string;
  requestedChanges: string[];
  attachmentUrls: string[];
  createdAt: string;
  createdBy?: string;
}

/**
 * Compliance Alert
 */
export interface ComplianceAlert {
  id: string;
  documentId?: string;
  itemStateId?: string;
  regulationId?: string;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  actionRequired?: string;
  actionDeadline?: string;
  applicableStates: string[];
  affectedSkus: string[];
  affectedBomIds: string[];
  status: AlertStatus;
  snoozedUntil?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
  notificationSent: boolean;
  notificationSentAt?: string;
  notificationRecipients: string[];
  createdAt: string;
  createdBy?: string;
}

// =============================================================================
// VIEW TYPES (Joined/Computed Data)
// =============================================================================

/**
 * Document Overview (from view)
 */
export interface ComplianceDocumentOverview extends Omit<ComplianceDocument, 'extractedText' | 'customFields' | 'internalNotes'> {
  daysUntilExpiry?: number;
  linkedProductsCount: number;
  pendingReviewsCount: number;
  activeAlertsCount: number;
}

/**
 * Product Compliance Overview (from view)
 */
export interface ProductComplianceOverview {
  productIdentifier: string;
  sku?: string;
  bomId?: string;
  productGroup?: string;
  totalStates: number;
  compliantStates: number;
  nonCompliantStates: number;
  attentionNeededStates: number;
  registeredStates: number;
  nextExpiringRegistration?: string;
  activeStates: string[];
  lastAssessment?: string;
}

/**
 * Compliance Alert Dashboard (from view)
 */
export interface ComplianceAlertDashboard extends ComplianceAlert {
  documentName?: string;
  documentType?: ComplianceDocumentType;
  documentNumber?: string;
}

/**
 * State Compliance Matrix (from view)
 */
export interface StateComplianceMatrix {
  stateCode: string;
  stateName: string;
  strictnessLevel: string;
  strictnessScore: number;
  registrationRequired: boolean;
  activeProducts: number;
  compliantProducts: number;
  registeredProducts: number;
  documentCount: number;
  activeAlerts: number;
}

// =============================================================================
// FUNCTION RETURN TYPES
// =============================================================================

/**
 * Result from get_product_compliance_documents function
 */
export interface ProductDocumentResult {
  documentId: string;
  documentName: string;
  documentType: ComplianceDocumentType;
  documentNumber?: string;
  status: ComplianceDocumentStatus;
  relationshipType: RelationshipType;
  effectiveDate?: string;
  expirationDate?: string;
  fileUrl?: string;
  applicableStates: string[];
  agencyName?: string;
}

/**
 * Result from get_product_compliance_summary function
 */
export interface ProductComplianceSummary {
  stateCode: string;
  stateName: string;
  complianceStatus: ComplianceStatus;
  isRegistered: boolean;
  registrationExpiry?: string;
  documentCount: number;
  missingDocumentTypes: string[];
  alertsCount: number;
  lastAssessment?: string;
}

/**
 * Result from get_expiring_documents function
 */
export interface ExpiringDocument {
  documentId: string;
  documentName: string;
  documentType: ComplianceDocumentType;
  documentNumber?: string;
  expirationDate: string;
  daysUntilExpiry: number;
  applicableStates: string[];
  affectedProducts: Array<{
    sku?: string;
    bomId?: string;
    relationship: RelationshipType;
  }>;
}

// =============================================================================
// INPUT TYPES (For creating/updating)
// =============================================================================

/**
 * Input for creating a new compliance document
 */
export interface CreateComplianceDocumentInput {
  documentName: string;
  documentType: ComplianceDocumentType;
  documentNumber?: string;
  description?: string;
  fileName: string;
  filePath?: string;
  fileUrl?: string;
  fileSize?: number;
  fileMimeType?: string;
  applicableStates?: string[];
  isNational?: boolean;
  jurisdictionLevel?: JurisdictionLevel;
  regulatoryCategory?: string;
  agencyName?: string;
  agencyContactEmail?: string;
  agencyContactPhone?: string;
  regulationCode?: string;
  effectiveDate?: string;
  expirationDate?: string;
  renewalReminderDays?: number;
  tags?: string[];
  notes?: string;
}

/**
 * Input for updating a compliance document
 */
export interface UpdateComplianceDocumentInput extends Partial<CreateComplianceDocumentInput> {
  id: string;
  status?: ComplianceDocumentStatus;
  statusNotes?: string;
}

/**
 * Input for linking document to product
 */
export interface LinkDocumentToProductInput {
  documentId: string;
  sku?: string;
  bomId?: string;
  productGroup?: string;
  relationshipType: RelationshipType;
  applicableStates?: string[];
  effectiveDate?: string;
  expirationDate?: string;
  priority?: number;
  notes?: string;
}

/**
 * Input for setting product state compliance
 */
export interface SetProductStateComplianceInput {
  sku?: string;
  bomId?: string;
  productGroup?: string;
  stateCode: string;
  complianceStatus?: ComplianceStatus;
  isRegistered?: boolean;
  registrationNumber?: string;
  registrationDate?: string;
  registrationExpiry?: string;
  stateSpecificNotes?: string;
  specialRequirements?: string[];
  isActive?: boolean;
  marketPriority?: number;
}

/**
 * Input for creating a document review
 */
export interface CreateDocumentReviewInput {
  documentId: string;
  reviewType: ReviewType;
  reviewerName: string;
  reviewerEmail?: string;
  reviewerRole?: string;
  reviewerOrganization?: string;
  dueDate?: string;
}

/**
 * Input for completing a document review
 */
export interface CompleteDocumentReviewInput {
  reviewId: string;
  reviewStatus: Exclude<ReviewStatus, 'pending'>;
  comments?: string;
  requestedChanges?: string[];
}

// =============================================================================
// FILTER/QUERY TYPES
// =============================================================================

/**
 * Filters for querying compliance documents
 */
export interface ComplianceDocumentFilters {
  documentType?: ComplianceDocumentType | ComplianceDocumentType[];
  status?: ComplianceDocumentStatus | ComplianceDocumentStatus[];
  applicableStates?: string[];
  regulatoryCategory?: string;
  agencyName?: string;
  tags?: string[];
  isNational?: boolean;
  expiringWithinDays?: number;
  searchText?: string;
  linkedToSku?: string;
  linkedToBomId?: string;
  createdAfter?: string;
  createdBefore?: string;
}

/**
 * Filters for querying compliance alerts
 */
export interface ComplianceAlertFilters {
  alertType?: AlertType | AlertType[];
  severity?: AlertSeverity | AlertSeverity[];
  status?: AlertStatus | AlertStatus[];
  applicableStates?: string[];
  affectedSku?: string;
  documentId?: string;
  hasActionDeadline?: boolean;
  deadlineBefore?: string;
}

/**
 * Filters for product compliance summary
 */
export interface ProductComplianceFilters {
  sku?: string;
  bomId?: string;
  productGroup?: string;
  stateCode?: string;
  complianceStatus?: ComplianceStatus | ComplianceStatus[];
  isRegistered?: boolean;
  hasActiveAlerts?: boolean;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * State with compliance info for selection UI
 */
export interface StateSelectionOption {
  stateCode: string;
  stateName: string;
  strictnessLevel: string;
  strictnessScore: number;
  registrationRequired: boolean;
  isSelected: boolean;
  complianceStatus?: ComplianceStatus;
  documentCount?: number;
}

/**
 * Document upload result
 */
export interface DocumentUploadResult {
  success: boolean;
  documentId?: string;
  filePath?: string;
  fileUrl?: string;
  error?: string;
}

/**
 * Bulk state selection result
 */
export interface BulkStateSelectionResult {
  success: boolean;
  statesAdded: string[];
  statesRemoved: string[];
  errors?: Array<{ stateCode: string; error: string }>;
}

/**
 * Compliance dashboard summary
 */
export interface ComplianceDashboardSummary {
  totalDocuments: number;
  documentsByType: Record<ComplianceDocumentType, number>;
  documentsByStatus: Record<ComplianceDocumentStatus, number>;
  expiringWithin30Days: number;
  expiringWithin90Days: number;
  activeAlerts: number;
  alertsBySeverity: Record<AlertSeverity, number>;
  totalProducts: number;
  compliantProducts: number;
  nonCompliantProducts: number;
  statesCovered: number;
  pendingReviews: number;
}
