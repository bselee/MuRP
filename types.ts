

export interface BOMComponent {
  sku: string;
  quantity: number;
  name: string;
  unit?: string; // e.g., 'lbs', 'kg', 'gallons', 'each'
  // Enhanced fields for MRP
  unitCost?: number;
  supplierSku?: string;
  leadTimeDays?: number;
}

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
}

export interface PurchaseOrderItem {
    sku: string;
    name:string;
    quantity: number;
    price: number;
}

export interface PurchaseOrder {
    id: string;
    vendorId: string;
    status: 'Pending' | 'Submitted' | 'Fulfilled';
    createdAt: string;
    items: PurchaseOrderItem[];
    expectedDate?: string;
    notes?: string;
    requisitionIds?: string[];
}

export interface HistoricalSale {
    sku: string;
    date: string; // YYYY-MM-DD
    quantity: number;
}

export interface BuildOrder {
    id: string;
    finishedSku: string;
    name: string;
    quantity: number;
    status: 'Pending' | 'In Progress' | 'Completed';
    createdAt: string;
}

export interface User {
    id: string;
    name: string;
    email: string;
    role: 'Admin' | 'Manager' | 'Staff';
    department: 'Purchasing' | 'MFG 1' | 'MFG 2' | 'Fulfillment' | 'SHP/RCV';
    onboardingComplete?: boolean;

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

export interface RequisitionItem {
    sku: string;
    name: string;
    quantity: number;
    reason: string;
}

export interface InternalRequisition {
    id: string;
    requesterId: string | null; // Can be null for system-generated reqs
    source: 'Manual' | 'System';
    department: User['department'];
    createdAt: string;
    status: 'Pending' | 'Approved' | 'Rejected' | 'Ordered';
    items: RequisitionItem[];
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
        leadTimeDays: 14 
    },
    { 
        id: 'VEND-002', 
        name: 'Garden Supplies Co.', 
        contactEmails: ['orders@gardensupplies.co'], 
        phone: '1-888-555-0102',
        address: '456 Bloom Ave, Gardenton, TX 75001',
        website: 'https://www.gardensupplies.co',
        leadTimeDays: 7 
    },
    { 
        id: 'VEND-003', 
        name: 'Eco Packaging', 
        contactEmails: ['contact@ecopackaging.com', 'billing@ecopackaging.com'], 
        phone: '1-877-555-0103',
        address: '789 Recycle Rd, Packburg, FL 33101',
        website: 'https://www.ecopackaging.com',
        leadTimeDays: 21 
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

export const mockPurchaseOrders: PurchaseOrder[] = [
    {
        id: 'PO-2024-001',
        vendorId: 'VEND-001',
        status: 'Fulfilled',
        createdAt: '2024-07-15T10:00:00Z',
        items: [
            { sku: 'COMP-001', name: 'Worm Castings (1 lb)', quantity: 200, price: 5.50 },
            { sku: 'COMP-003', name: 'Coconut Coir Brick', quantity: 100, price: 2.75 },
        ],
        expectedDate: '2024-07-29',
        notes: 'Standard delivery.'
    },
    {
        id: 'PO-2024-002',
        vendorId: 'VEND-003',
        status: 'Submitted',
        createdAt: '2024-08-01T14:30:00Z',
        items: [
            { sku: 'BAG-SML', name: 'Small Burlap Bag (1 cu ft)', quantity: 500, price: 0.50 },
            { sku: 'BAG-LRG', name: 'Large Burlap Bag (4 cu ft)', quantity: 100, price: 1.25 },
        ],
        expectedDate: '2024-08-22',
        notes: 'Please palletize bags by size.'
    },
    {
        id: 'PO-2024-003',
        vendorId: 'VEND-002',
        status: 'Pending',
        createdAt: '2024-08-05T09:00:00Z',
        items: [
            { sku: 'COMP-002', name: 'Pumice (1/8 inch)', quantity: 50, price: 3.00 },
            { sku: 'COMP-005', name: 'Neem Seed Meal (1 lb)', quantity: 40, price: 4.25 },
        ]
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
        status: 'Approved',
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

VENDORS DATA:
{{vendors}}

PURCHASE ORDERS DATA:
{{purchaseOrders}}

USER QUESTION: {{question}}`
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