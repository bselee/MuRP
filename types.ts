export interface BOMComponent {
  sku: string;
  quantity: number;
  name: string;
  unit?: string; // e.g., 'lbs', 'kg', 'gallons', 'each'
  // Enhanced fields for MRP
  unitCost?: number;
  supplierSku?: string;
  leadTimeDays?: number;
  // Substitution alternatives for out-of-stock scenarios
  substitutes?: Array<{
    sku: string;
    name: string;
    reason?: string; // e.g., "Same grade", "Lower cost", "Better availability"
  }>;
}

export interface ComponentSwapSuggestion {
  sku: string;
  description?: string;
  note?: string;
  similarityTag?: string;
  availabilityTag?: 'in_stock' | 'limited' | 'special_order';
  priority?: 'preferred' | 'alternate' | 'experimental';
}

export interface ComponentSwapRule {
  sku: string;
  reason?: string;
  flaggedBy?: string;
  updatedAt?: string;
  suggestions: ComponentSwapSuggestion[];
}

export type ComponentSwapMap = Record<string, ComponentSwapRule>;

export interface Artwork {
  id: string;
  fileName: string;
  revision: number;
  url: string; // File URL (Supabase storage) or base64 data
  regulatoryDocLink?: string;
  barcode?: string;
  folderId?: string;

  // Enhanced tracking
  fileType?: 'label' | 'bag' | 'document' | 'regulatory' | 'artwork' | 'other';
  status?: 'draft' | 'approved' | 'archived';
  approvedBy?: string;
  approvedDate?: string;
  notes?: string;

  // File metadata
  fileSize?: number; // bytes
  mimeType?: string; // 'application/pdf', 'application/postscript' (.ai files)
  uploadedAt?: string;
  uploadedBy?: string;
  
  // DAM Features
  printReady?: boolean; // rtp_flag
  vectorSvg?: string; // SVG content for vector editing
  vectorGeneratedAt?: string;
  lastEditedAt?: string;
  lastEditedBy?: string;

  // AI Label Scanning
  scanStatus?: 'pending' | 'scanning' | 'completed' | 'failed';
  scanCompletedAt?: string;
  scanError?: string;

  // Extracted label data from AI
  extractedData?: {
    productName?: string;
    netWeight?: string;
    barcode?: string;

    ingredients?: Array<{
      name: string;
      percentage?: string;
      order: number; // Position on label (1st, 2nd, 3rd ingredient)
      confidence: number; // AI confidence 0-1
    }>;

    guaranteedAnalysis?: {
      nitrogen?: string; // e.g., "10.0%"
      phosphate?: string; // e.g., "5.0%"
      potassium?: string; // e.g., "8.0%"
      otherNutrients?: Record<string, string>; // Micronutrients
    };

    claims?: string[]; // ["OMRI Listed", "Organic", "100% Natural"]
    warnings?: string[]; // Safety warnings, keep out of reach
    directions?: string; // Application instructions
    otherText?: string[]; // Any other notable text
  };

  // Ingredient comparison with BOM
  ingredientComparison?: {
    comparedAt: string;
    matchedIngredients: number;
    missingFromLabel: string[]; // In BOM but not on label
    missingFromBOM: string[]; // On label but not in BOM
    orderMatches: boolean; // Do ingredients appear in same order?
    percentageVariances?: Array<{
      ingredient: string;
      labelValue: string;
      bomValue: string;
      variance: number;
    }>;
  };

  // Verification
  verified: boolean; // User confirmed extraction is accurate
  verifiedBy?: string;
  verifiedAt?: string;

  // DAM Features
  printReady?: boolean; // rtp_flag
  vectorSvg?: string | null;
  vectorGeneratedAt?: string;
  lastEditedAt?: string;
  lastEditedBy?: string;
}

export type ArtworkEditorTool = 'brush' | 'text' | 'eraser';

export interface ArtworkAsset {
  id: string;
  legacyId?: string;
  fileName: string;
  fileType: Artwork['fileType'];
  status: Artwork['status'];
  revision: number;
  downloadUrl?: string;
  notes?: string | null;
  barcode?: string | null;
  metadata?: Record<string, any>;
  uploadedBy?: string | null;
  uploadedAt?: string;
  updatedAt?: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  approvalNotes?: string | null;
  isArchived?: boolean;
}

export interface BomArtworkAssetLink {
  asset: ArtworkAsset;
  usageType?: string;
  workflowState?: string;
  isPrimary?: boolean;
}

export type BomRevisionStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'reverted' | 'superseded';

export interface BomRevision {
  id: string;
  bomId: string;
  revisionNumber: number;
  status: BomRevisionStatus;
  summary?: string | null;
  changeSummary?: string | null;
  changeDiff?: Record<string, any> | null;
  snapshot: BillOfMaterials;
  createdBy?: string | null;
  createdAt: string;
  reviewerId?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  revertedFromRevisionId?: string | null;
  approvalNotes?: string | null;
}

export interface BomRevisionRequestOptions {
  summary?: string;
  reviewerId?: string | null;
  autoApprove?: boolean;
  changeType?: 'components' | 'artwork' | 'packaging' | 'compliance' | 'metadata';
}

export interface ArtworkFolder {
    id: string;
    name: string;
}

export interface Packaging {
  bagType: string;
  labelType: string;
  specialInstructions: string;
  // Enhanced packaging specs
  bagSku?: string;
  labelSku?: string;
  boxSku?: string;
  insertSku?: string;
  weight?: number;
  weightUnit?: string;
  dimensions?: string;
}

// ============================================================================
// Enhanced Types for Product Data Management System
// ============================================================================

// Label - Dedicated type for scanned labels with AI-extracted data
export interface Label {
  id: string;

  // File information
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;

  // Label metadata
  barcode?: string;
  productName?: string;
  netWeight?: string;
  revision?: number;

  // Associations
  bomId?: string;

  // AI Scanning status
  scanStatus: 'pending' | 'scanning' | 'completed' | 'failed';
  scanCompletedAt?: string;
  scanError?: string;

  // Extracted data from AI
  extractedData?: {
    productName?: string;
    netWeight?: string;
    barcode?: string;
    ingredients?: Array<{
      name: string;
      percentage?: string;
      order: number;
      confidence: number;
    }>;
    guaranteedAnalysis?: {
      nitrogen?: string;
      phosphate?: string;
      potassium?: string;
      otherNutrients?: Record<string, string>;
    };
    claims?: string[];
    warnings?: string[];
    directions?: string;
    otherText?: string[];
  };

  // Ingredient comparison with BOM
  ingredientComparison?: {
    comparedAt: string;
    matchedIngredients: number;
    missingFromLabel: string[];
    missingFromBOM: string[];
    orderMatches: boolean;
    percentageVariances?: Array<{
      ingredient: string;
      labelValue: string;
      bomValue: string;
      variance: number;
    }>;
  };

  // Verification tracking
  verified: boolean;
  verifiedBy?: string;
  verifiedAt?: string;

  // File type and status
  fileType?: 'label' | 'regulatory' | 'other';
  status?: 'draft' | 'approved' | 'archived';

  // Approval tracking
  approvedBy?: string;
  approvedDate?: string;

  // Notes
  notes?: string;

  // Audit trail
  uploadedBy?: string;
  createdAt: string;
  updatedAt: string;
}

declare global {
  interface Window {
    ImageTracer?: {
      imageToSVG: (
        url: string,
        callback: (svgString: string) => void,
        options?: Record<string, unknown>
      ) => void;
    };
    JSZip?: any;
  }
}

// Product Data Sheet - AI-generated and editable product documentation
export interface ProductDataSheet {
  id: string;

  // Associations
  bomId: string;
  labelId?: string;

  // Document information
  documentType: 'sds' | 'spec_sheet' | 'product_info' | 'compliance_doc' | 'custom';
  title: string;
  version: number;
  description?: string;

  // AI-generated content (structured)
  content: {
    productIdentification?: {
      productName?: string;
      sku?: string;
      barcode?: string;
      manufacturer?: string;
      manufacturerAddress?: string;
      emergencyPhone?: string;
      productUse?: string;
    };
    composition?: {
      ingredients?: Array<{
        name: string;
        percentage?: string;
        casNumber?: string;
        function?: string;
      }>;
      guaranteedAnalysis?: {
        totalNitrogen?: string;
        availablePhosphate?: string;
        soluablePotash?: string;
        [key: string]: string | undefined;
      };
    };
    hazardsIdentification?: {
      hazardClassification?: string;
      labelElements?: string[];
      warningStatements?: string[];
      firstAidMeasures?: {
        inhalation?: string;
        skinContact?: string;
        eyeContact?: string;
        ingestion?: string;
      };
    };
    storageAndHandling?: {
      storageConditions?: string;
      temperatureRange?: string;
      shelfLife?: string;
      handlingPrecautions?: string[];
      incompatibilities?: string;
    };
    regulatoryInformation?: {
      stateRegistrations?: Array<{
        state: string;
        registrationNumber: string;
        expirationDate: string;
        status: string;
      }>;
      certifications?: string[];
      epaRegistration?: string;
      tsca?: string;
    };
    technicalData?: {
      applicationRates?: Record<string, string>;
      directions?: string;
      compatibility?: string;
      physicalProperties?: {
        appearance?: string;
        odor?: string;
        pH?: string;
        solubility?: string;
        density?: string;
      };
    };
    manufacturingInformation?: {
      bomComponents?: Array<{
        sku: string;
        name: string;
        quantity: number;
        unit: string;
      }>;
      packagingSpecs?: {
        bagType?: string;
        labelType?: string;
        netWeight?: string;
      };
      yieldInformation?: {
        batchSize?: string;
        unitsPerBatch?: number;
        manufactureDate?: string;
      };
    };
    customSections?: Array<{
      title: string;
      content: string;
    }>;
  };

  // PDF generation
  pdfUrl?: string;
  pdfGeneratedAt?: string;
  pdfFileSize?: number;

  // Document status
  status: 'draft' | 'review' | 'approved' | 'published' | 'archived';

  // Approval workflow
  approvedBy?: string;
  approvedAt?: string;
  approvalNotes?: string;

  // Generation tracking
  isAiGenerated: boolean;
  aiModelUsed?: string;
  generationPrompt?: string;

  // Edit tracking
  lastEditedBy?: string;
  editCount: number;
  editHistory?: Array<{
    timestamp: string;
    userId: string;
    action: string;
    section?: string;
    changes: string;
  }>;

  // Publishing
  publishedAt?: string;
  publishedVersion?: number;

  // Metadata
  tags?: string[];
  notes?: string;

  // Audit trail
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

// State Regulation - Individual regulatory requirement
export interface StateRegulation {
  id: string;
  state: string;
  state_name?: string;
  category: string;
  subcategory?: string;
  rule_title: string;
  rule_text: string;
  rule_summary?: string;
  regulation_code?: string;
  statute_reference?: string;
  source_url: string;
  source_type?: string;
  agency_name?: string;
  agency_contact_email?: string;
  agency_contact_phone?: string;
  effective_date?: string;
  expiration_date?: string;
  last_verified_at?: string;
  extraction_method?: string;
  confidence_score?: number;
  keywords?: string[];
  status?: string;
  created_at: string;
  updated_at: string;
}

// Compliance Check Result - Result of checking a label against regulations
export interface ComplianceCheck {
  id: string;
  artwork_id?: string;
  label_id?: string;
  bom_id?: string;
  check_date: string;
  states_checked: string[];
  categories_checked?: string[];
  extracted_text?: any;
  extracted_claims?: string[];
  extracted_ingredients?: string[];
  extracted_warnings?: string[];
  product_name?: string;
  net_weight?: string;
  overall_status: 'pass' | 'warning' | 'fail' | 'requires_review';
  violations: ComplianceViolation[];
  warnings: ComplianceWarning[];
  recommendations: ComplianceRecommendation[];
  ai_model_used?: string;
  ai_confidence_score?: number;
  compliance_score?: number;
  risk_level?: 'low' | 'medium' | 'high' | 'critical';
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ComplianceViolation {
  severity: 'critical' | 'high' | 'medium' | 'low';
  state: string;
  category: string;
  regulation_id: string;
  issue: string;
  regulation_text?: string;
  regulation_code?: string;
  recommendation: string;
}

export interface ComplianceWarning {
  severity: 'high' | 'medium' | 'low';
  state: string;
  category: string;
  regulation_id: string;
  issue: string;
  recommendation?: string;
}

export interface ComplianceRecommendation {
  severity: 'low' | 'medium' | 'high';
  state: string;
  category: string;
  regulation_id?: string;
  issue: string;
  recommendation: string;
}

// Compliance Record - Comprehensive compliance tracking
export interface ComplianceRecord {
  id: string;

  // Associations
  bomId: string;
  labelId?: string;

  // Compliance type
  complianceType: 'state_registration' | 'organic_cert' | 'omri' | 'epa' | 'wsda' | 'cdfa' | 'custom';
  category?: string;

  // Registration/certification details
  issuingAuthority?: string;
  stateCode?: string;
  stateName?: string;
  registrationNumber: string;
  licenseNumber?: string;

  // Important dates
  registeredDate?: string;
  effectiveDate?: string;
  expirationDate?: string;
  renewalDate?: string;
  lastRenewedDate?: string;

  // Status tracking
  status: 'current' | 'due_soon' | 'urgent' | 'expired' | 'pending' | 'suspended' | 'cancelled' | 'renewed';
  daysUntilExpiration?: number;

  // Financial information
  registrationFee?: number;
  renewalFee?: number;
  lateFee?: number;
  currency?: string;
  paymentStatus?: 'paid' | 'pending' | 'overdue';

  // Documents
  certificateUrl?: string;
  certificateFileName?: string;
  certificateFileSize?: number;
  additionalDocuments?: Array<{
    name: string;
    url: string;
    uploadedAt: string;
  }>;

  // Alert tracking
  dueSoonAlertSent?: boolean;
  urgentAlertSent?: boolean;
  expirationAlertSent?: boolean;
  alertEmailAddresses?: string[];

  // Requirements and conditions
  requirements?: string;
  restrictions?: string;
  conditions?: {
    annualReportRequired?: boolean;
    reportDueDate?: string;
    inspectionRequired?: boolean;
    labelApprovalRequired?: boolean;
    [key: string]: any;
  };

  // Contact information
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  authorityWebsite?: string;

  // Internal tracking
  assignedTo?: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  notes?: string;
  internalNotes?: string;

  // Audit trail
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt?: string;
  lastVerifiedBy?: string;
}

// Legacy type - kept for backward compatibility, will be deprecated
// Use ComplianceRecord instead
export interface ProductRegistration extends ComplianceRecord {
  bomId: string;
  renewalStatus: 'current' | 'due_soon' | 'urgent' | 'expired';
  lastUpdated: string;
  updatedBy?: string;
}

export interface BillOfMaterials {
  id: string;
  finishedSku: string;
  name: string;
  components: BOMComponent[];
  artwork: Artwork[];
  artworkAssets?: BomArtworkAssetLink[];
  packaging: Packaging;
  barcode?: string;
  // Enhanced fields for sync and tracking
  description?: string;
  category?: string;
  yieldQuantity?: number; // How many units this BOM produces
  dataSource?: 'manual' | 'csv' | 'api';
  lastSyncAt?: string;
  syncStatus?: 'synced' | 'pending' | 'error';
  notes?: string;

  // Product data management (new in Phase 1)
  primaryLabelId?: string; // References labels table
  primaryDataSheetId?: string; // References product_data_sheets table

  // Compliance tracking (new in Phase 1)
  complianceStatus?: 'compliant' | 'due_soon' | 'urgent' | 'non_compliant' | 'unknown';
  totalStateRegistrations?: number;
  expiringRegistrationsCount?: number;
  complianceLastChecked?: string;

  // Production metadata
  buildTimeMinutes?: number;
  laborCostPerHour?: number;

  // Revision + approval tracking
  revisionNumber?: number;
  revisionStatus?: BomRevisionStatus;
  revisionSummary?: string | null;
  revisionRequestedBy?: string | null;
  revisionRequestedAt?: string | null;
  revisionReviewerId?: string | null;
  revisionApprovedBy?: string | null;
  revisionApprovedAt?: string | null;
  lastApprovedAt?: string | null;
  lastApprovedBy?: string | null;

  // Legacy compliance fields (deprecated, use compliance_records table instead)
  complianceStatusId?: string; // Links to ComplianceStatus in regulatory cache
  registrations?: ProductRegistration[]; // Use ComplianceRecord[] instead
}

export interface InventoryItem {
  sku: string;
  name: string;
  category: string;
  stock: number;
  onOrder: number;
  reorderPoint: number;
  vendorId: string;
  moq?: number;
  safetyStock?: number;
  leadTimeDays?: number;
  // Enhanced fields from migration 003
  description?: string;
  status?: 'active' | 'inactive' | 'discontinued';
  unitCost?: number;
  unitPrice?: number;
  warehouseLocation?: string;
  binLocation?: string;
  salesVelocity?: number;
  sales30Days?: number;
  sales60Days?: number;
  sales90Days?: number;
  dataSource?: 'manual' | 'csv' | 'api';
  lastSyncAt?: string;
  syncStatus?: 'synced' | 'pending' | 'error';
}

export interface Vendor {
    id: string;
    name: string;
    contactEmails: string[];
    phone: string;
    address: string;
    website: string;
    leadTimeDays: number;
    // Enhanced address fields (from migration 002_enhance_vendor_schema)
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    // Additional fields
    notes?: string;
    dataSource?: 'manual' | 'csv' | 'api';
    lastSyncAt?: string;
    syncStatus?: 'synced' | 'pending' | 'error';
    // Automation fields (from migration 023_vendor_automation_settings)
    autoPoEnabled?: boolean;
    autoPoThreshold?: 'critical' | 'high' | 'normal' | 'low';
    autoSendEmail?: boolean;
    isRecurringVendor?: boolean;
    automationNotes?: string;
}

export type PurchaseOrderStatus =
  | 'draft'
  | 'committed'
  | 'pending'
  | 'sent'
  | 'confirmed'
  | 'partial'
  | 'received'
  | 'cancelled'
  | 'Pending'
  | 'Submitted'
  | 'Fulfilled';

export interface PurchaseOrderItem {
  id?: string;
  productId?: string;
  sku: string;
  description: string;
  name?: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  dailyConsumption?: number;
  consumption30Day?: number;
  consumption60Day?: number;
  consumption90Day?: number;
  supplierLeadTime?: number;
  suggestedQty?: number;
  finaleMetadata?: Record<string, unknown>;
  price?: number;
}

export type VendorResponseStatus =
  | 'pending_response'
  | 'vendor_responded'
  | 'verified_confirmed'
  | 'verified_with_issues'
  | 'requires_clarification'
  | 'vendor_non_responsive'
  | 'cancelled';

export interface VendorCommunication {
  id: string;
  poId: string;
  communicationType: string;
  direction: 'inbound' | 'outbound';
  stage?: number | null;
  gmailMessageId?: string | null;
  gmailThreadId?: string | null;
  subject?: string | null;
  bodyPreview?: string | null;
  senderEmail?: string | null;
  recipientEmail?: string | null;
  sentAt?: string | null;
  receivedAt?: string | null;
  attachments?: Record<string, unknown>[] | null;
  metadata?: Record<string, unknown> | null;
  extractedData?: Record<string, unknown> | null;
  aiConfidence?: number | null;
  aiCostUsd?: number | null;
  aiExtracted?: boolean;
  correlationConfidence?: number | null;
  createdAt?: string;
}

export interface VendorEmailAIConfig {
  enabled: boolean;
  maxEmailsPerHour: number;
  maxDailyCostUsd: number;
  minConfidence: number;
  keywordFilters: string[];
  maxBodyCharacters: number;
}

export interface PurchaseOrder {
  id: string;
  orderId: string;
  vendorId?: string;
  supplier: string;
  status: PurchaseOrderStatus;
  orderDate: string;
  estimatedReceiveDate?: string;
  expectedDate?: string;
  destination?: string;
  shipToFormatted?: string;
  shipments?: string;
  total: number;
  taxableFeeFreight?: number;
  trackingLink?: string;
  trackingNumber?: string;
  trackingCarrier?: string;
  trackingStatus?: POTrackingStatus;
  trackingLastCheckedAt?: string;
  trackingLastException?: string;
  trackingEstimatedDelivery?: string;
  trackingEvents?: POTrackingEvent[];
  estDaysOfStock?: number;
  dateOutOfStock?: string;
  fulfillment?: string;
  allocation?: string;
  internalNotes?: string;
  recordLastUpdated?: string;
  autoGenerated?: boolean;
  generationReason?: string;
  vendorNotes?: string;
  notes?: string;
  emailDraft?: string;
  emailSent?: boolean;
  emailSentAt?: string;
  finaleSyncStatus?: 'pending' | 'synced' | 'error';
  lastSyncedAt?: string;
  createdAt: string;
  approvedAt?: string;
  sentAt?: string;
  items: PurchaseOrderItem[];
  requisitionIds?: string[];
  followUpRequired?: boolean;
  lastFollowUpStage?: number;
  lastFollowUpSentAt?: string;
  followUpStatus?: VendorResponseStatus | null;
  followUpCount?: number;
  vendorResponseStatus?: VendorResponseStatus | null;
  vendorResponseReceivedAt?: string | null;
  vendorResponseEmailId?: string | null;
  vendorResponseThreadId?: string | null;
  vendorResponseSummary?: Record<string, any> | null;
  verificationRequired?: boolean;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  verificationNotes?: string | null;
  escalationLevel?: number;
  nextFollowUpDueAt?: string | null;
  invoiceDetectedAt?: string;
  invoiceGmailMessageId?: string | null;
  invoiceSummary?: Record<string, any> | null;
}

export interface CreatePurchaseOrderItemInput {
  sku: string;
  name: string;
  quantity: number;
  unitCost: number;
}

export interface CreatePurchaseOrderInput {
  vendorId: string;
  items: CreatePurchaseOrderItemInput[];
  expectedDate?: string;
  notes?: string;
  requisitionIds?: string[];
  trackingNumber?: string;
  trackingCarrier?: string;
}

export type POTrackingStatus =
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception'
  | 'cancelled'
  | 'invoice_received';

export interface POTrackingEvent {
  id?: string;
  poId: string;
  status: POTrackingStatus;
  carrier?: string;
  trackingNumber?: string;
  description?: string;
  rawPayload?: Record<string, unknown>;
  createdAt?: string;
}

export interface HistoricalSale {
    sku: string;
    date: string; // YYYY-MM-DD
    quantity: number;
}

export interface MaterialRequirement {
    sku: string;
    name: string;
    requiredQuantity: number;
    availableQuantity: number;
    shortfall: number;
    vendorId?: string;
    vendorName?: string;
    leadTimeDays?: number;
    estimatedCost?: number;
    sourced?: boolean;
    sourcedAt?: string;
    notes?: string;
}

export interface BuildOrder {
    id: string;
    finishedSku: string;
    name: string;
    quantity: number;
    status: 'Pending' | 'In Progress' | 'Completed';
    createdAt: string;
    scheduledDate?: string; // ISO date for when build should start
    dueDate?: string; // ISO date for when build should complete
    calendarEventId?: string; // Google Calendar event ID
    materialRequirements?: MaterialRequirement[]; // Component sourcing info
    notes?: string; // Additional build notes
    estimatedDurationHours?: number; // How long the build should take
    assignedUserId?: string; // Who is responsible for the build
}

export interface GuidedLaunchState {
    completed?: boolean;
    snoozeUntil?: string | null;
    updatedAt?: string;
}

export interface User {
    id: string;
    name: string;
    email: string;
    role: 'Admin' | 'Manager' | 'Staff';
    department: 'Purchasing' | 'Operations' | 'MFG 1' | 'MFG 2' | 'Fulfillment' | 'SHP/RCV';
    onboardingComplete?: boolean;
    metadata?: Record<string, unknown> | null;
    guidedLaunchState?: GuidedLaunchState | null;

    // User agreements - stored for review in Settings
    agreements?: {
        regulatory?: {
            accepted: boolean;
            acceptedAt?: string;
            version?: string;
            fullName?: string;
            title?: string;
            companyName?: string;
            electronicSignature?: string;
        };
        dataRetention?: {
            accepted: boolean;
            acceptedAt?: string;
            version?: string;
        };
        // Additional agreements can be added here (terms of service, privacy policy, etc.)
    };

    // Legacy field for backward compatibility - will be removed in future version
    regulatoryAgreement?: {
        accepted: boolean;
        acceptedAt?: string;
        version?: string;
        fullName?: string;
        title?: string;
        companyName?: string;
        electronicSignature?: string;
    };
}

export type JobDescriptionStatus = 'draft' | 'pending_review' | 'approved';

export interface JobDescription {
    id: string;
    role: User['role'];
    department: User['department'];
    overview: string;
    mission: string;
    successMetrics: string[];
    keyTools: string[];
    sopSections: Array<{
        title: string;
        trigger: string;
        owner: string;
        steps: string[];
    }>;
    automationIdeas?: string[];
    status: JobDescriptionStatus;
    lastUpdatedBy?: string;
    updatedAt?: string;
    googleDocUrl?: string | null;
}

export type RequisitionRequestType = 'consumable' | 'product_alert' | 'finished_good' | 'other';
export type RequisitionPriority = 'low' | 'medium' | 'high';

export type ExternalRequisitionSource = 'amazon' | 'external_link';

export interface RequisitionItem {
    sku: string;
    name: string;
    quantity: number;
    reason: string;
    notes?: string;
    isCustomSku?: boolean;
    externalUrl?: string | null;
    externalSource?: ExternalRequisitionSource | null;
    metadata?: Record<string, any> | null;
}

export interface InternalRequisition {
    id: string;
    requesterId: string | null; // Can be null for system-generated reqs
    source: 'Manual' | 'System';
    department: User['department'];
    createdAt: string;
    status: 'Pending' | 'ManagerApproved' | 'OpsPending' | 'OpsApproved' | 'Rejected' | 'Ordered' | 'Fulfilled';
    items: RequisitionItem[];
    requestType?: RequisitionRequestType;
    priority?: RequisitionPriority;
    needByDate?: string | null;
    alertOnly?: boolean;
    autoPo?: boolean;
    notifyRequester?: boolean;
    context?: string | null;
    metadata?: Record<string, any> | null;
    notes?: string;
    managerApprovedBy?: string | null;
    managerApprovedAt?: string | null;
    opsApprovalRequired?: boolean;
    opsApprovedBy?: string | null;
    opsApprovedAt?: string | null;
    forwardedToPurchasingAt?: string | null;
}

export interface RequisitionRequestOptions {
    requestType?: RequisitionRequestType;
    priority?: RequisitionPriority;
    needByDate?: string | null;
    alertOnly?: boolean;
    autoPo?: boolean;
    notifyRequester?: boolean;
    context?: string | null;
    notes?: string;
    metadata?: Record<string, any>;
    opsApprovalRequired?: boolean;
}

export type FollowUpTriggerType = 'tracking_missing' | 'invoice_missing' | 'custom';

export interface FollowUpCampaign {
  id: string;
  name: string;
  description?: string | null;
  triggerType: FollowUpTriggerType;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface FollowUpRule {
  id: string;
  campaignId: string;
  stage: number;
  waitHours: number;
  subjectTemplate: string;
  bodyTemplate: string;
  instructions?: string | null;
  active: boolean;
  updatedAt?: string;
}

export interface VendorFollowUpEvent {
  id: string;
  poId: string;
  vendorId?: string | null;
  campaignId?: string | null;
  stage: number;
  sentAt: string;
  respondedAt?: string | null;
  responseLatency?: string | null;
  notes?: string | null;
  metadata?: Record<string, any> | null;
}

export interface ArtworkShareEvent {
  id: string;
  artworkId: string;
  bomId: string;
  productSku?: string;
  productName?: string;
  to: string[];
  cc: string[];
  subject: string;
  includeCompliance: boolean;
  attachFile: boolean;
  attachmentHash?: string | null;
  sentViaGmail: boolean;
  senderEmail?: string | null;
  timestamp: string;
  channel?: 'gmail' | 'resend' | 'simulation';
}

export interface DamSettingsState {
  defaultPrintSize: string;
  showPrintReadyWarning: boolean;
  requireApproval: boolean;
  allowedDomains: string;
  autoArchive: boolean;
  emailNotifications: boolean;
  defaultShareCc: string;
}

export interface QuickRequestDefaults {
    sku?: string;
    requestType?: RequisitionRequestType;
    priority?: RequisitionPriority;
    alertOnly?: boolean;
    autoPo?: boolean;
    context?: string;
    metadata?: Record<string, any>;
}

export interface ExternalConnection {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string;
}

export interface GmailConnection {
  isConnected: boolean;
  email: string | null;
}

export interface CompanyEmailSettings {
  fromAddress: string;
  enforceCompanySender: boolean;
  provider: 'resend' | 'gmail';
  workspaceMailbox?: {
    email: string;
    connectedBy?: string | null;
    connectedAt?: string | null;
  };
}

export interface WatchlistItem {
    id: string;
    type: 'Ingredient' | 'Claim' | 'Testing';
    term: string; 
    reason: string;
}

export interface AiPrompt {
    id: string;
    name: string;
    description: string;
    prompt: string;
}

export interface AiConfig {
    model: string;
    prompts: AiPrompt[];
}

export interface AiSettings {
    // Model Configuration
    model: string; // e.g., 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'

    // Usage Tracking
    tokensUsedThisMonth: number;
    queriesThisMonth: number;
    lastResetDate: string; // ISO date of last monthly reset

    // Quota Management
    monthlyTokenLimit: number; // e.g., 250000 for free tier
    alertThreshold: number; // Percentage (0-100) to trigger warning

    // Optimization Controls
    maxContextItems: number; // Max items per data type (10-100)
    enableSmartFiltering: boolean; // Use keyword-based relevance filtering

    // Cost Tracking (for display purposes)
    estimatedMonthlyCost: number; // In USD
}

export interface RoleAccessRule {
    canView: boolean;
    canEdit: boolean;
}

export interface RolePermissions {
    boms: {
        manager: RoleAccessRule;
        staff: RoleAccessRule;
    };
    purchaseOrders: {
        managersCanCreate: boolean;
        staffCanCreate: boolean;
    };
    requisitions: {
        staffCanCreate: boolean;
    };
}

export const defaultRolePermissions: RolePermissions = {
    boms: {
        manager: { canView: true, canEdit: false },
        staff: { canView: true, canEdit: false },
    },
    purchaseOrders: {
        managersCanCreate: true,
        staffCanCreate: false,
    },
    requisitions: {
        staffCanCreate: true,
    },
};


export const mockWatchlist: WatchlistItem[] = [
    { id: 'watch-1', type: 'Ingredient', term: 'Neem Seed Meal', reason: 'Potential pesticide registration requirements in some states.' },
    { id: 'watch-2', type: 'Ingredient', term: 'Kelp Meal', reason: 'Often requires guaranteed analysis for certain minerals.' },
    { id: 'watch-3', type: 'Claim', term: 'Organic', reason: 'Use of "Organic" term is highly regulated and requires certification.' },
    { id: 'watch-4', type: 'Testing', term: 'Heavy Metals', reason: 'Products sold in CA, OR, WA require heavy metals analysis.' },
];

export const mockArtworkFolders: ArtworkFolder[] = [
    { id: 'folder-1', name: 'Soil Products' },
    { id: 'folder-2', name: 'Amendments' },
    { id: 'folder-3', name: 'Archived Designs' },
];

export const mockUsers: User[] = [
    { id: 'user-admin', name: 'Alicia Admin', email: 'alicia.admin@goodestfungus.com', role: 'Admin', department: 'Purchasing', onboardingComplete: true },
    { id: 'user-manager-mfg1', name: 'Brenda Prod', email: 'brenda.prod@goodestfungus.com', role: 'Manager', department: 'MFG 1', onboardingComplete: true },
    { id: 'user-manager-mfg2', name: 'Charles Fab', email: 'charles.fab@goodestfungus.com', role: 'Manager', department: 'MFG 2', onboardingComplete: true },
    { id: 'user-staff-mfg1', name: 'Steve Worker', email: 'steve.worker@goodestfungus.com', role: 'Staff', department: 'MFG 1', onboardingComplete: true },
    { id: 'user-staff-shp', name: 'Diana Ship', email: 'diana.ship@goodestfungus.com', role: 'Staff', department: 'SHP/RCV', onboardingComplete: true },
    { id: 'user-staff-ful', name: 'Edward Pack', email: 'edward.pack@goodestfungus.com', role: 'Staff', department: 'Fulfillment', onboardingComplete: true },
    { id: 'user-new-invite', name: 'Frank Newbie', email: 'frank.newbie@goodestfungus.com', role: 'Staff', department: 'MFG 1', onboardingComplete: false },
];

export const mockVendors: Vendor[] = [
    { 
        id: 'VEND-001', 
        name: 'Soil Solutions Inc.', 
        contactEmails: ['sales@soilsolutions.com', 'support@soilsolutions.com'], 
        phone: '1-800-555-0101',
        address: '123 Green Way, Soilsville, CA 90210',
        website: 'https://www.soilsolutions.com',
        leadTimeDays: 14,
        dataSource: 'csv',
        lastSyncAt: '2025-01-10T12:00:00.000Z',
        autoPoEnabled: true,
        autoPoThreshold: 'critical'
    },
    { 
        id: 'VEND-002', 
        name: 'Garden Supplies Co.', 
        contactEmails: ['orders@gardensupplies.co'], 
        phone: '1-888-555-0102',
        address: '456 Bloom Ave, Gardenton, TX 75001',
        website: 'https://www.gardensupplies.co',
        leadTimeDays: 7,
        dataSource: 'api',
        lastSyncAt: '2025-01-11T08:30:00.000Z',
        autoPoEnabled: false
    },
    { 
        id: 'VEND-003', 
        name: 'Eco Packaging', 
        contactEmails: ['contact@ecopackaging.com', 'billing@ecopackaging.com'], 
        phone: '1-877-555-0103',
        address: '789 Recycle Rd, Packburg, FL 33101',
        website: 'https://www.ecopackaging.com',
        leadTimeDays: 21,
        dataSource: 'manual',
        autoPoEnabled: false
    },
];

export const mockInventory: InventoryItem[] = [
  { sku: "COMP-001", name: "Worm Castings (1 lb)", category: "Amendments", stock: 500, onOrder: 100, reorderPoint: 200, vendorId: 'VEND-001', moq: 50 },
  { sku: "COMP-002", name: "Pumice (1/8 inch)", category: "Aggregates", stock: 250, onOrder: 50, reorderPoint: 150, vendorId: 'VEND-002', moq: 50 },
  { sku: "COMP-003", name: "Coconut Coir Brick", category: "Growing Media", stock: 150, onOrder: 75, reorderPoint: 100, vendorId: 'VEND-001', moq: 25 },
  { sku: "COMP-004", name: "Kelp Meal (1 lb)", category: "Amendments", stock: 80, onOrder: 0, reorderPoint: 50, vendorId: 'VEND-001' },
  { sku: "COMP-005", name: "Neem Seed Meal (1 lb)", category: "Pest Control", stock: 75, onOrder: 0, reorderPoint: 40, vendorId: 'VEND-002', moq: 20 },
  { sku: "COMP-006", name: "Biochar (1 gallon)", category: "Soil Conditioners", stock: 30, onOrder: 50, reorderPoint: 25, vendorId: 'VEND-001' },
  { sku: "COMP-007", name: "Mycorrhizal Fungi Inoculant", category: "Inoculants", stock: 120, onOrder: 0, reorderPoint: 60, vendorId: 'VEND-002' },
  { sku: "BAG-SML", name: "Small Burlap Bag (1 cu ft)", category: "Packaging", stock: 1000, onOrder: 500, reorderPoint: 800, vendorId: 'VEND-003', moq: 500 },
  { sku: "BAG-MED", name: "Medium Burlap Bag (2 cu ft)", category: "Packaging", stock: 500, onOrder: 0, reorderPoint: 400, vendorId: 'VEND-003', moq: 250 },
  { sku: "BAG-LRG", name: "Large Burlap Bag (4 cu ft)", category: "Packaging", stock: 200, onOrder: 100, reorderPoint: 150, vendorId: 'VEND-003', moq: 100 },
  
  // Finished Goods & Sub-Assemblies
  { sku: "PROD-A", name: "Premium Potting Mix (1 cu ft)", category: "Finished Goods", stock: 100, onOrder: 0, reorderPoint: 50, vendorId: 'N/A' },
  { sku: "PROD-B", name: "Organic Super Soil (2 cu ft)", category: "Finished Goods", stock: 40, onOrder: 0, reorderPoint: 25, vendorId: 'N/A' },
  { sku: "PROD-C", name: "Biochar Soil Conditioner (4 cu ft)", category: "Finished Goods", stock: 15, onOrder: 0, reorderPoint: 20, vendorId: 'N/A' },
  { sku: "PROD-D", name: "Seed Starting Mix (1 cu ft)", category: "Finished Goods", stock: 50, onOrder: 0, reorderPoint: 30, vendorId: 'N/A' },
  { sku: "SUB-A", name: "Seed Starter Kit", category: "Sub-Assembly", stock: 20, onOrder: 0, reorderPoint: 15, vendorId: 'N/A' },
];

export const mockBOMs: BillOfMaterials[] = [
  {
    id: "bom_110105",
    finishedSku: "PROD-A",
    name: "Premium Potting Mix (1 cu ft)",
    barcode: "850012345011",
    components: [
      { sku: "COMP-001", name: "Worm Castings (1 lb)", quantity: 5 },
      { sku: "COMP-002", name: "Pumice (1/8 inch)", quantity: 2 },
      { sku: "COMP-003", name: "Coconut Coir Brick", quantity: 1 },
      { sku: "BAG-SML", name: "Small Burlap Bag (1 cu ft)", quantity: 1 },
    ],
    artwork: [
      { id: "art-001", fileName: "premium-potting-mix-label-5x6.ai", revision: 3, url: "/art/premium-label-v3.pdf", verified: false, regulatoryDocLink: "https://example.com/docs/reg/prod-a", barcode: "850012345011", folderId: "folder-1" }
    ],
    packaging: {
      bagType: "Printed Burlap Sack",
      labelType: "Front Sticker, 5x6 inch",
      specialInstructions: "Ensure bag is heat-sealed and batch code is stamped on bottom right corner."
    }
  },
  {
    id: "bom_110106",
    finishedSku: "PROD-B",
    name: "Organic Super Soil (2 cu ft)",
    barcode: "850012345028",
    components: [
      { sku: "COMP-001", name: "Worm Castings (1 lb)", quantity: 10 },
      { sku: "SUB-A", name: "Seed Starter Kit", quantity: 1 }, // Using a sub-assembly
      { sku: "BAG-MED", name: "Medium Burlap Bag (2 cu ft)", quantity: 1 },
    ],
    artwork: [
        { id: "art-002a", fileName: "super-soil-front-6x5.5.png", revision: 1, url: "/art/super-soil-front-v1.pdf", verified: false, folderId: "folder-1" },
        { id: "art-002b", fileName: "super-soil-back-6x5.5.png", revision: 2, url: "/art/super-soil-back-v2.pdf", verified: false, folderId: "folder-1" }
    ],
    packaging: {
        bagType: "Heavy-duty poly bag",
        labelType: "Front and Back Stickers, 6x5.5 inch",
        specialInstructions: "Attach 'Organic Certified' tag to the top seam."
    }
  },
  {
    id: "bom_110107",
    finishedSku: "PROD-C",
    name: "Biochar Soil Conditioner (4 cu ft)",
    components: [
      { sku: "COMP-006", name: "Biochar (1 gallon)", quantity: 4 },
      { sku: "COMP-001", name: "Worm Castings (1 lb)", quantity: 8 },
      { sku: "COMP-003", name: "Coconut Coir Brick", quantity: 2 },
      { sku: "BAG-LRG", name: "Large Burlap Bag (4 cu ft)", quantity: 1 },
    ],
    artwork: [],
    packaging: {
        bagType: "Unprinted Burlap Sack",
        labelType: "Stapled Cardstock Tag",
        specialInstructions: "Use jute twine for the tie. Double-knot."
    }
  },
  {
    id: "bom_110108",
    finishedSku: "PROD-D",
    name: "Seed Starting Mix (1 cu ft)",
    barcode: "850012345042",
    components: [
      { sku: "COMP-003", name: "Coconut Coir Brick", quantity: 3 },
      { sku: "COMP-002", name: "Pumice (1/8 inch)", quantity: 5 },
      { sku: "COMP-004", name: "Kelp Meal (1 lb)", quantity: 1 },
      { sku: "BAG-SML", name: "Small Burlap Bag (1 cu ft)", quantity: 1 },
    ],
    artwork: [
        { id: "art-004", fileName: "seed-start-label-5x6.svg", revision: 5, url: "/art/seed-start-v5.pdf", verified: false, regulatoryDocLink: "https://example.com/docs/reg/prod-d", folderId: "folder-2" }
    ],
    packaging: {
        bagType: "Printed Burlap Sack",
        labelType: "Front Sticker, 5x6 inch",
        specialInstructions: "None."
    }
  },
  {
    id: "bom_sub_a",
    finishedSku: "SUB-A",
    name: "Seed Starter Kit",
    components: [
        { sku: "COMP-005", name: "Neem Seed Meal (1 lb)", quantity: 2 },
        { sku: "COMP-007", name: "Mycorrhizal Fungi Inoculant", quantity: 1 },
    ],
    artwork: [
         { id: "art-005", fileName: "starter-kit-sticker.ai", revision: 1, url: "/art/starter-kit-sticker-v1.pdf", verified: false, folderId: "folder-2" }
    ],
    packaging: {
        bagType: "Small plastic ziplock",
        labelType: "Small instructional sticker",
        specialInstructions: "Pack inside a small cardboard box before shipping."
    }
  }
];

export const mockBuildOrders: BuildOrder[] = [
    {
        id: 'BO-2024-001',
        finishedSku: 'PROD-A',
        name: 'Premium Potting Mix (1 cu ft)',
        quantity: 50,
        status: 'In Progress',
        createdAt: '2024-08-04T11:00:00Z',
    },
    {
        id: 'BO-2024-002',
        finishedSku: 'PROD-D',
        name: 'Seed Starting Mix (1 cu ft)',
        quantity: 30,
        status: 'Pending',
        createdAt: '2024-08-06T15:00:00Z',
    }
];

export const mockInternalRequisitions: InternalRequisition[] = [
    {
        id: 'REQ-2024-001',
        requesterId: 'user-staff-mfg1', 
        source: 'Manual',
        department: 'MFG 1',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), 
        status: 'ManagerApproved',
        requestType: 'consumable',
        priority: 'high',
        needByDate: null,
        alertOnly: false,
        autoPo: true,
        notifyRequester: true,
        context: 'Floor stock getting tight',
        metadata: {},
        managerApprovedBy: 'user-manager-mfg1',
        managerApprovedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        opsApprovalRequired: true,
        items: [
            { sku: 'COMP-001', name: 'Worm Castings (1 lb)', quantity: 50, reason: 'Low on production line' },
            { sku: 'BAG-SML', name: 'Small Burlap Bag (1 cu ft)', quantity: 100, reason: 'Stock running out for PROD-A run' }
        ]
    },
    {
        id: 'REQ-2024-002',
        requesterId: 'user-manager-mfg2',
        source: 'Manual',
        department: 'MFG 2',
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'Pending',
        requestType: 'product_alert',
        priority: 'medium',
        needByDate: null,
        alertOnly: true,
        autoPo: false,
        notifyRequester: true,
        context: 'Heads up before seasonal push',
        metadata: {},
        items: [
            { sku: 'COMP-006', name: 'Biochar (1 gallon)', quantity: 20, reason: 'Scheduled build for PROD-C' },
        ]
    },
     {
        id: 'REQ-2024-003',
        requesterId: 'user-staff-shp',
        source: 'Manual',
        department: 'SHP/RCV',
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'Rejected',
        requestType: 'consumable',
        priority: 'high',
        needByDate: null,
        alertOnly: false,
        autoPo: false,
        notifyRequester: true,
        context: 'Emergency buffer',
        metadata: {},
        items: [
            { sku: 'BAG-LRG', name: 'Large Burlap Bag (4 cu ft)', quantity: 200, reason: 'Emergency stock request' },
        ]
    },
     {
        id: 'REQ-2024-004',
        requesterId: 'user-staff-mfg1',
        source: 'Manual',
        department: 'MFG 1',
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'Ordered',
        requestType: 'finished_good',
        priority: 'medium',
        needByDate: null,
        alertOnly: false,
        autoPo: true,
        notifyRequester: false,
        context: '',
        metadata: {},
        items: [
            { sku: 'COMP-003', name: 'Coconut Coir Brick', quantity: 50, reason: 'Restocking safety levels' },
        ]
    },
    {
        id: 'REQ-2024-005',
        requesterId: null,
        source: 'System',
        department: 'Purchasing',
        createdAt: new Date().toISOString(),
        status: 'Pending',
        requestType: 'consumable',
        priority: 'medium',
        needByDate: null,
        alertOnly: false,
        autoPo: false,
        notifyRequester: true,
        context: 'AI forecasted shortfall',
        metadata: { generatedBy: 'inventory_intel' },
        items: [
            { sku: 'COMP-002', name: 'Pumice (1/8 inch)', quantity: 150, reason: 'AI Forecast: Predicted shortage in 25 days.' },
        ]
    }
];


const generateHistoricalSales = (): HistoricalSale[] => {
    const sales: HistoricalSale[] = [];
    const skus = ["PROD-A", "PROD-B", "PROD-C", "PROD-D"];
    const today = new Date();
    for (let i = 90; i > 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateString = date.toISOString().split('T')[0];

        if (Math.random() > 0.3) {
            sales.push({ sku: 'PROD-A', date: dateString, quantity: Math.floor(Math.random() * 5) + 1 });
        }
        if (Math.random() > 0.4) {
             sales.push({ sku: 'PROD-B', date: dateString, quantity: Math.floor(Math.random() * 8) + 2 });
        }
        if (Math.random() > 0.8) {
             sales.push({ sku: 'PROD-C', date: dateString, quantity: Math.floor(Math.random() * 2) + 1 });
        }
    }
    return sales;
};
export const mockHistoricalSales: HistoricalSale[] = generateHistoricalSales();

export const defaultAiConfig: AiConfig = {
    model: 'gemini-2.5-flash',
    prompts: [
        {
            id: 'askAboutInventory',
            name: 'Inventory Assistant',
            description: 'Main prompt for the AI chat assistant that answers questions about inventory, POs, vendors, and BOMs.',
            prompt: `You are an expert inventory management AI assistant for a company that sells organic soil and amendments.
Analyze the following data to answer the user's question.
Provide clear, concise answers. You can use markdown for formatting if needed.

INVENTORY DATA (Current Stock Levels, On Order, Reorder Points):
{{inventory}}

BILLS OF MATERIALS (BOMs) DATA (Recipes for finished products):
{{boms}}

BUILDABILITY STATUS (Production readiness for each BOM):
This shows which products CAN be built right now based on current inventory:
- "buildable: true" = Can produce this product now
- "buildable: false" = Missing components (see limitingComponent)
- "componentStatus" = Detailed breakdown of each component's availability
{{buildability}}

VENDORS DATA:
{{vendors}}

PURCHASE ORDERS DATA:
{{purchaseOrders}}

USER QUESTION: {{question}}

When answering questions about production, shortages, or "what can be built", always reference the BUILDABILITY STATUS data first.`
        },
        {
            id: 'getAiPlanningInsight',
            name: 'Planning Insight',
            description: 'Analyzes forecast and inventory to identify the most critical upcoming supply chain risk.',
            prompt: `You are a senior supply chain analyst AI. Your task is to analyze the provided inventory data, bills of materials, and sales forecast to identify the single most critical upcoming risk to the supply chain.
        
Provide a concise, one-sentence summary of the risk, followed by a one-sentence recommended action. Be specific about the item and the timeline.

Example:
"Forecasted demand for Organic Super Soil will deplete your Worm Castings inventory in approximately 22 days, halting production.
ACTION: Immediately create a purchase order for at least 250 units of Worm Castings (COMP-001) to prevent a stockout."

CURRENT INVENTORY:
{{inventory}}

BILLS OF MATERIALS:
{{boms}}

DEMAND FORECAST (next 90 days, daily):
{{forecast}}`
        },
        {
            id: 'getRegulatoryAdvice',
            name: 'Regulatory Co-Pilot',
            description: 'Scans state regulations for potential compliance issues based on product ingredients.',
            prompt: `You are a highly skilled regulatory compliance co-pilot for a consumer packaged goods company. 
Your primary goal is to identify and flag potential out-of-compliance issues for the product "{{productName}}" based on its ingredients when sold in {{state}}.

**Product Ingredients:** {{ingredientList}}.

**Internal Compliance Watchlist:**
Pay special attention to these items. If any are present in the product or implied by the product name, they MUST be addressed in your analysis.
{{watchlist}}
        
**Instructions:**
1. Use your search tool to find the most current and specific regulations for the {{state}} Department of Agriculture (or equivalent) regarding the sale, labeling, and registration of soil amendments, organic fertilizers, and related gardening products.
2. Based on your search, create a "Scanned Sources" section first. This MUST include the primary URL you are using for your analysis and any contact information (like a phone number or email) for the relevant state agency. Format it as:
   **Scanned Sources:**
   - Website: [URL]
   - Contact: [Phone Number or Email]
3. Structure the rest of your response in two sections:
   - **Potential Issues:** A bulleted list of any ingredients or claims that may trigger specific {{state}} regulations (e.g., Prop 65 warnings, tonnage reports, specific ingredient registrations). Explicitly mention if a watchlisted item is a concern and why. Be direct.
   - **Recommendations:** A bulleted list of actionable steps the company should take, such as "Register product with the [State] Department of Agriculture" or "Add specific warning language to the label."

If you find no specific issues after a thorough search, explicitly state that "No specific compliance issues were identified for the given ingredients based on current regulations," but still provide the "Scanned Sources" section.`
        },
        {
            id: 'draftComplianceLetter',
            name: 'Compliance Letter Drafter',
            description: 'Drafts a formal letter to a state regulatory body based on a compliance analysis.',
            prompt: `You are a compliance professional drafting a formal letter to the {{state}} Department of Agriculture (or its equivalent regulatory body for soil/fertilizer products).
        
Your task is to generate a draft letter based on a product's details and our internal compliance analysis. The letter should be professional, clear, and aim to either register the product or seek clarification on compliance requirements.

**Product Details:**
- Product Name: {{productName}}
- Ingredients:
{{ingredientList}}

**Internal Compliance Analysis Summary:**
{{complianceAnalysis}}

**Instructions for the letter:**
1.  Use standard business letter format.
2.  Include placeholders for company-specific information: [Company Name], [Company Address], [City, State, ZIP], [Date], and [Your Name/Title].
3.  Address the letter to the appropriate division, such as "Feed, Fertilizer, and Livestock Drugs Regulatory Services" or similar. If you can't find a specific division via search, address it generally to the Department of Agriculture.
4.  Clearly state the purpose of the letter (e.g., to inquire about registration, to submit a new product for registration).
5.  Reference the product name and list its key ingredients.
6.  Based on the provided analysis, politely ask for clarification on any potential issues (e.g., "Our analysis suggested we may need to address specific labeling for...").
7.  Conclude by stating a desire to ensure full compliance and provide contact information.

Generate the draft letter now.`
        },
        {
            id: 'verifyArtworkLabel',
            name: 'Artwork & Barcode Verifier',
            description: 'Analyzes an image of a product label to verify the barcode and check for quality issues.',
            prompt: `You are a quality control AI specializing in packaging and label verification. Analyze the provided image of a product label.

**Expected Barcode:** {{expectedBarcode}}

**Your Tasks:**
1.  **Barcode Presence:** Determine if a barcode is clearly visible in the image.
2.  **Barcode Reading:** If a barcode is present, attempt to read its numerical value.
3.  **Barcode Matching:** Compare the read barcode number to the "Expected Barcode". State clearly whether they MATCH or DO NOT MATCH.
4.  **Quality Analysis:** Provide a brief, bulleted analysis of the barcode's print quality. Check for potential scanning issues like:
    *   **Clarity:** Is it blurry, smudged, or pixelated?
    *   **Quiet Zones:** Are the blank spaces on either side of the barcode clear of any text or images?
    *   **Contrast:** Is the contrast between the bars and the background sufficient?

**Format your response as follows:**

**Barcode Status:** [Present / Not Present]
**Read Barcode:** [The number you read / N/A]
**Verification:** [MATCH / MISMATCH / N/A]
**Quality Analysis:**
*   Clarity: [Your analysis]
*   Quiet Zones: [Your analysis]
*   Contrast: [Your analysis]`
        }
    ]
};

export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  dashboardLayout?: string[]; // Section IDs in order
  collapsedSections?: string[]; // IDs of collapsed sections
  
  // DAM Settings
  damSettings?: {
    defaultPrintSize?: string;
    showPrintReadyWarning?: boolean;
  };
}

export type DAMTier = 'basic' | 'mid' | 'full';

export const DAM_TIER_LIMITS: Record<DAMTier, { storage: number; compliance: boolean; editing: boolean }> = {
  basic: { storage: 100 * 1024 * 1024, compliance: false, editing: false }, // 100MB
  mid: { storage: 10 * 1024 * 1024 * 1024, compliance: false, editing: true }, // 10GB
  full: { storage: 100 * 1024 * 1024 * 1024, compliance: true, editing: true }, // 100GB
};

// ============================================================================
// PROJECT MANAGEMENT & TICKETING SYSTEM
// ============================================================================

export type TicketStatus = 'open' | 'in_progress' | 'review' | 'blocked' | 'done' | 'closed' | 'cancelled';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketType = 'task' | 'question' | 'bug' | 'feature' | 'maintenance' | 'follow_up' | 'approval_request' | 'escalation';
export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';
export type ProjectType = 'general' | 'production' | 'maintenance' | 'compliance' | 'development' | 'operations';
export type DelegationTaskType = 'maintenance' | 'build_order' | 'bom_revision_approval' | 'artwork_approval' | 'po_approval' | 'requisition_approval' | 'general_task' | 'question' | 'follow_up';

export interface Project {
  id: string;
  name: string;
  description?: string;
  code?: string;
  status: ProjectStatus;
  projectType: ProjectType;
  ownerId: string;
  delegateId: string;
  department?: string;
  defaultAssigneeId?: string;
  boardColumns: string[];
  startDate: string;
  targetEndDate: string;
  actualEndDate?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Ticket {
  id: string;
  ticketNumber: number;
  projectId?: string;
  title: string;
  description?: string;
  status: TicketStatus;
  ticketType: TicketType;
  priority: TicketPriority;
  reporterId?: string;
  assigneeId?: string;
  directedToId?: string;
  directedToRole?: User['role'];
  department?: string;
  dueDate?: string;
  startedAt?: string;
  completedAt?: string;
  estimatedHours?: number;
  actualHours?: number;
  parentTicketId?: string;
  relatedEntityType?: 'purchase_order' | 'bom' | 'requisition' | 'build_order';
  relatedEntityId?: string;
  tags?: string[];
  boardColumn: string;
  boardPosition: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  
  // Joined fields for display
  reporter?: User;
  assignee?: User;
  directedTo?: User;
  project?: Project;
  subtasks?: Ticket[];
  commentCount?: number;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  authorId?: string;
  content: string;
  commentType: 'comment' | 'reply' | 'resolution' | 'internal_note' | 'system';
  parentCommentId?: string;
  mentionedUserIds?: string[];
  attachments?: Array<{ name: string; url: string; type: string }>;
  editedAt?: string;
  createdAt: string;
  
  // Joined fields
  author?: User;
  replies?: TicketComment[];
}

export type TicketActivityAction =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'assigned'
  | 'unassigned'
  | 'priority_changed'
  | 'due_date_changed'
  | 'commented'
  | 'mentioned'
  | 'moved'
  | 'linked'
  | 'unlinked'
  | 'escalated'
  | 'resolved'
  | 'reopened'
  | 'closed';

export interface TicketActivity {
  id: string;
  ticketId: string;
  actorId?: string;
  action: TicketActivityAction;
  fieldName?: string;
  oldValue?: unknown;
  newValue?: unknown;
  comment?: string;
  createdAt: string;
  
  // Joined fields
  actor?: User;
}

export interface DelegationSetting {
  id: string;
  taskType: DelegationTaskType;
  canCreateRoles: User['role'][];
  canAssignRoles: User['role'][];
  assignableToRoles: User['role'][];
  restrictedToDepartments?: User['department'][];
  requiresApproval: boolean;
  approvalChain?: User['role'][];
  autoEscalateHours?: number;
  escalationTargetRole?: User['role'];
  notifyOnCreate: boolean;
  notifyOnAssign: boolean;
  notifyOnComplete: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

// Input types for mutations
export interface CreateTicketInput {
  projectId?: string;
  title: string;
  description?: string;
  ticketType?: TicketType;
  priority?: TicketPriority;
  assigneeId?: string;
  directedToId?: string;
  directedToRole?: User['role'];
  department?: string;
  dueDate?: string;
  estimatedHours?: number;
  parentTicketId?: string;
  relatedEntityType?: Ticket['relatedEntityType'];
  relatedEntityId?: string;
  tags?: string[];
}

export interface UpdateTicketInput {
  title?: string;
  description?: string;
  status?: TicketStatus;
  ticketType?: TicketType;
  priority?: TicketPriority;
  assigneeId?: string | null;
  directedToId?: string | null;
  dueDate?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  boardColumn?: string;
  boardPosition?: number;
  tags?: string[];
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  code?: string;
  projectType?: ProjectType;
  department?: string;
  defaultAssigneeId?: string;
  ownerId: string;
  delegateId: string;
  startDate: string;
  targetEndDate: string;
  tags?: string[];
}

// Mock data for E2E testing
export const mockProjects: Project[] = [
  {
    id: 'proj-001',
    name: 'Q4 Production Ramp',
    description: 'Scale up production for holiday season',
    code: 'Q4-PROD',
    status: 'active',
    projectType: 'production',
    department: 'Operations',
    boardColumns: ['open', 'in_progress', 'review', 'done'],
    tags: ['priority', 'seasonal'],
    ownerId: mockUsers[0]?.id ?? 'user-admin',
    delegateId: mockUsers[1]?.id,
    startDate: new Date().toISOString(),
    targetEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'proj-002',
    name: 'Compliance Audit 2025',
    description: 'Annual regulatory compliance review',
    code: 'COMPLY-25',
    status: 'active',
    projectType: 'compliance',
    department: 'Operations',
    boardColumns: ['open', 'in_progress', 'review', 'done'],
    tags: ['compliance', 'annual'],
    ownerId: mockUsers[2]?.id ?? mockUsers[0]?.id ?? 'user-admin',
    delegateId: mockUsers[3]?.id,
    startDate: new Date().toISOString(),
    targetEndDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const mockTickets: Ticket[] = [
  {
    id: 'ticket-001',
    ticketNumber: 1,
    projectId: 'proj-001',
    title: 'Increase worm castings order for Q4',
    description: 'Need to double our usual order to meet holiday demand',
    status: 'open',
    ticketType: 'task',
    priority: 'high',
    reporterId: 'user-staff-mfg1',
    assigneeId: 'user-manager-mfg1',
    department: 'MFG 1',
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    boardColumn: 'open',
    boardPosition: 0,
    tags: ['purchasing', 'urgent'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'ticket-002',
    ticketNumber: 2,
    projectId: 'proj-001',
    title: 'Question: Can we expedite the biochar shipment?',
    description: 'Vendor says 3 weeks lead time but we need it in 2. What options do we have?',
    status: 'open',
    ticketType: 'question',
    priority: 'medium',
    reporterId: 'user-staff-mfg1',
    directedToRole: 'Manager',
    department: 'MFG 1',
    boardColumn: 'open',
    boardPosition: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'ticket-003',
    ticketNumber: 3,
    projectId: 'proj-002',
    title: 'Review CA registration renewal',
    description: 'California product registration expires next month',
    status: 'in_progress',
    ticketType: 'approval_request',
    priority: 'urgent',
    reporterId: 'user-admin',
    assigneeId: 'user-admin',
    department: 'Operations',
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    boardColumn: 'in_progress',
    boardPosition: 0,
    tags: ['compliance', 'california'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
