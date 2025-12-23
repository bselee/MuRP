// types/ingredientCompliance.ts
// TypeScript types for the ingredient-level compliance system

// ============================================================================
// INGREDIENT COMPLIANCE STATUS
// ============================================================================

export type IngredientComplianceStatus =
  | 'compliant'      // Meets all requirements for this state
  | 'restricted'     // Allowed with restrictions
  | 'prohibited'     // Not allowed in this state
  | 'conditional'    // Allowed under specific conditions
  | 'pending_review' // Needs compliance review
  | 'unknown';       // Status not yet determined

export type ConcentrationUnit = 'percent' | 'ppm' | 'ppb';

export interface IngredientComplianceRecord {
  id: string;
  ingredientSku: string;
  ingredientName: string | null;
  casNumber: string | null;
  stateCode: string;
  complianceStatus: IngredientComplianceStatus;
  restrictionType: string | null;
  restrictionDetails: string | null;
  maxConcentration: number | null;
  concentrationUnit: ConcentrationUnit;
  regulationCode: string | null;
  regulationSourceId: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  sdsDocumentId: string | null;
  sdsRequired: boolean;
  sdsStatus: 'current' | 'expired' | 'missing' | 'pending';
  lastReviewedAt: string | null;
  lastReviewedBy: string | null;
  reviewNotes: string | null;
  nextReviewDate: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// INGREDIENT SDS DOCUMENTS
// ============================================================================

export type SDSFormat = 'ghs' | 'osha' | 'ansi' | 'other';
export type SDSSource = 'uploaded' | 'scraped' | 'api' | 'manual_entry';
export type SDSStatus = 'active' | 'expired' | 'superseded' | 'archived' | 'pending_review';

export interface GHSHazardInfo {
  hazardCodes: string[];      // H-codes (H302, H315, etc.)
  precautionaryCodes: string[]; // P-codes (P264, P280, etc.)
  signalWord: 'Danger' | 'Warning' | null;
  hazardStatements: string[];
}

export interface PhysicalProperties {
  physicalState: 'solid' | 'liquid' | 'gas' | null;
  appearance: string | null;
  odor: string | null;
  ph: number | null;
  flashPoint: number | null;
  flashPointUnit: 'C' | 'F';
}

export interface ExtractedIngredient {
  name: string;
  casNumber?: string;
  percentage?: number;
  concentrationRange?: string; // "1-5%" format
}

export interface IngredientSDSDocument {
  id: string;
  ingredientSku: string;
  ingredientName: string | null;
  casNumber: string | null;

  // Document reference
  complianceDocumentId: string | null;
  sdsFileUrl: string | null;
  sdsFilePath: string | null;
  sdsSource: SDSSource | null;
  sdsSourceUrl: string | null;

  // Manufacturer info
  manufacturerName: string | null;
  supplierName: string | null;
  supplierSku: string | null;

  // SDS metadata
  sdsRevisionDate: string | null;
  sdsExpirationDate: string | null;
  sdsLanguage: string;
  sdsFormat: SDSFormat;

  // GHS classification
  ghsHazardCodes: string[];
  ghsPrecautionaryCodes: string[];
  signalWord: 'Danger' | 'Warning' | null;
  hazardStatements: string[];

  // Physical properties
  physicalState: string | null;
  appearance: string | null;
  odor: string | null;
  ph: number | null;
  flashPoint: number | null;
  flashPointUnit: 'C' | 'F';

  // Extracted content
  extractedIngredients: ExtractedIngredient[] | null;
  extractedHazards: Record<string, unknown> | null;
  fullExtractedText: string | null;
  extractionMethod: 'ocr' | 'ai' | 'manual' | 'api' | null;
  extractionDate: string | null;

  // Status
  status: SDSStatus;
  isPrimary: boolean;

  // Audit
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

// ============================================================================
// ARTWORK EXTRACTED INGREDIENTS
// ============================================================================

export type ExtractionMethod = 'ocr' | 'ai' | 'manual' | 'hybrid';
export type DiscrepancySeverity = 'critical' | 'high' | 'medium' | 'low';

export interface ParsedIngredient {
  name: string;
  percentage?: number;
  cas?: string;
  order?: number; // Position in ingredient list
}

export interface IngredientDiscrepancy {
  type: 'missing_in_bom' | 'missing_in_artwork' | 'percentage_mismatch' | 'name_mismatch';
  ingredientName: string;
  bomValue?: string;
  artworkValue?: string;
  details: string;
}

export interface ArtworkExtractedIngredients {
  id: string;
  bomId: string;
  artworkAssetId: string | null;
  complianceDocumentId: string | null;
  sourceType: 'artwork' | 'label' | 'product_sheet' | 'manual';
  sourceFileUrl: string | null;
  rawIngredientList: string | null;
  parsedIngredients: ParsedIngredient[];
  extractionConfidence: number | null;
  extractionMethod: ExtractionMethod;
  extractionDate: string;
  extractedBy: string | null;
  isVerified: boolean;
  verifiedAt: string | null;
  verifiedBy: string | null;
  verificationNotes: string | null;
  hasDiscrepancy: boolean;
  discrepancyDetails: IngredientDiscrepancy[] | null;
  discrepancySeverity: DiscrepancySeverity | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// BOM INGREDIENT COMPLIANCE VIEW
// ============================================================================

export interface BOMIngredientCompliance {
  bomId: string;
  finishedSku: string;
  bomName: string;
  ingredientSku: string;
  ingredientName: string | null;
  quantity: number;
  stateCode: string | null;
  complianceStatus: IngredientComplianceStatus;
  restrictionType: string | null;
  restrictionDetails: string | null;
  sdsRevisionDate: string | null;
  sdsExpirationDate: string | null;
  sdsStatus: SDSStatus | null;
  ghsHazardCodes: string[] | null;
  signalWord: 'Danger' | 'Warning' | null;
  sdsMissing: boolean;
  sdsExpired: boolean;
}

// ============================================================================
// BOM COMPLIANCE SUMMARY
// ============================================================================

export interface BlockingIngredient {
  sku: string;
  name: string | null;
  status: IngredientComplianceStatus;
  restriction: string | null;
}

export interface BOMComplianceSummary {
  stateCode: string;
  totalIngredients: number;
  compliantCount: number;
  restrictedCount: number;
  prohibitedCount: number;
  unknownCount: number;
  sdsMissingCount: number;
  sdsExpiredCount: number;
  overallStatus: 'compliant' | 'needs_attention' | 'pending_review' | 'non_compliant';
  blockingIngredients: BlockingIngredient[];
}

// ============================================================================
// REGULATION SYNC SCHEDULE
// ============================================================================

export type SyncFrequency = 'hourly' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
export type SyncType = 'full' | 'incremental' | 'differential';
export type SyncStatus = 'success' | 'partial' | 'failed' | 'skipped';

export interface RegulationSyncSchedule {
  id: string;
  regulatorySourceId: string;
  stateCode: string;
  syncFrequency: SyncFrequency;
  cronExpression: string | null;
  nextScheduledRun: string | null;
  lastRunAt: string | null;
  lastRunStatus: SyncStatus | null;
  lastRunDurationMs: number | null;
  syncType: SyncType;
  priority: number;
  consecutiveFailures: number;
  lastErrorMessage: string | null;
  retryCount: number;
  backoffMinutes: number;
  isActive: boolean;
  isPaused: boolean;
  pauseReason: string | null;
  notifyOnChange: boolean;
  notifyOnFailure: boolean;
  notificationEmails: string[];
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// SERVICE INPUT/OUTPUT TYPES
// ============================================================================

export interface CreateIngredientComplianceInput {
  ingredientSku: string;
  ingredientName?: string;
  casNumber?: string;
  stateCode: string;
  complianceStatus?: IngredientComplianceStatus;
  restrictionType?: string;
  restrictionDetails?: string;
  maxConcentration?: number;
  concentrationUnit?: ConcentrationUnit;
  regulationCode?: string;
  sdsRequired?: boolean;
  notes?: string;
}

export interface CreateSDSDocumentInput {
  ingredientSku: string;
  ingredientName?: string;
  casNumber?: string;
  sdsFileUrl?: string;
  sdsSource?: SDSSource;
  sdsSourceUrl?: string;
  manufacturerName?: string;
  supplierName?: string;
  supplierSku?: string;
  sdsRevisionDate?: string;
  sdsExpirationDate?: string;
  sdsFormat?: SDSFormat;
  ghsHazardCodes?: string[];
  ghsPrecautionaryCodes?: string[];
  signalWord?: 'Danger' | 'Warning';
  hazardStatements?: string[];
  isPrimary?: boolean;
}

export interface SDSSearchParams {
  ingredientSku?: string;
  casNumber?: string;
  manufacturerName?: string;
  hazardCode?: string;
  signalWord?: 'Danger' | 'Warning';
  status?: SDSStatus;
  expiringSoon?: boolean; // Within 30 days
}

export interface IngredientSearchParams {
  stateCode?: string;
  complianceStatus?: IngredientComplianceStatus;
  restrictionType?: string;
  sdsMissing?: boolean;
  hasHazardCode?: string;
}

export interface BOMComplianceCheckResult {
  bomId: string;
  bomName: string;
  finishedSku: string;
  stateSummaries: BOMComplianceSummary[];
  ingredientDetails: BOMIngredientCompliance[];
  overallStatus: 'compliant' | 'needs_attention' | 'pending_review' | 'non_compliant';
  issues: {
    prohibitedIngredients: BlockingIngredient[];
    restrictedIngredients: BlockingIngredient[];
    missingSDSIngredients: string[];
    expiredSDSIngredients: string[];
  };
  recommendations: string[];
}

// ============================================================================
// AGENT QUERY TYPES
// ============================================================================

export interface IngredientHazardQuery {
  ingredientSku?: string;
  casNumber?: string;
  hazardType?: 'physical' | 'health' | 'environmental';
}

export interface IngredientHazardResult {
  ingredientSku: string;
  ingredientName: string | null;
  casNumber: string | null;
  hazards: GHSHazardInfo;
  physicalProperties: PhysicalProperties;
  stateRestrictions: Array<{
    stateCode: string;
    status: IngredientComplianceStatus;
    restriction: string | null;
  }>;
  sdsAvailable: boolean;
  sdsExpirationDate: string | null;
}

export interface CrossUseIngredientInfo {
  ingredientSku: string;
  ingredientName: string | null;
  usedInBOMs: Array<{
    bomId: string;
    bomName: string;
    finishedSku: string;
    quantity: number;
  }>;
  complianceIssues: Array<{
    stateCode: string;
    status: IngredientComplianceStatus;
    affectedBOMs: string[];
  }>;
}
