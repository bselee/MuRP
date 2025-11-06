// Types for Tier 1 AI Enhancement: Compliance Knowledge Base

export interface RegulatoryScan {
  id: string;
  productName: string;
  ingredients: Array<{ sku: string; name: string; quantity: number }>;
  state: string;
  scanDate: string; // ISO timestamp
  results: string; // The AI-generated compliance advice
  sourceUrls: string[]; // URLs scanned during the analysis
  expiresAt: string; // ISO timestamp - 90 days from scanDate
  bomId: string; // Link to the BOM that was scanned
}

export interface BatchArtworkVerification {
  id: string;
  createdAt: string;
  results: BatchArtworkResult[];
  status: 'Processing' | 'Completed' | 'Failed';
}

export interface BatchArtworkResult {
  fileName: string;
  bomId?: string;
  productName?: string;
  expectedBarcode?: string;
  status: 'Success' | 'Warning' | 'Error';
  message: string;
  verificationDetails?: {
    barcodeMatch: boolean;
    qualityScore: string; // e.g., "Excellent", "Good", "Poor"
    issues: string[];
  };
}

// Enhanced Regulatory Compliance Types (Phase 1.5+)

export type ComplianceRiskLevel = 'clear' | 'low' | 'medium' | 'high' | 'critical' | 'unknown';

export interface ComplianceIssue {
  ingredient: string; // Ingredient name that triggered the issue
  state: string; // State abbreviation (e.g., "CA", "OR", "WA")
  riskLevel: ComplianceRiskLevel;
  issue: string; // Short description (e.g., "Requires pesticide registration")
  recommendation: string; // What to do (e.g., "Register with CA Dept of Agriculture")
  regulationUrl?: string; // Link to specific regulation
  detectedAt: string; // ISO timestamp
}

export interface ComplianceStatus {
  bomId: string;
  lastScanDate: string; // ISO timestamp
  overallRisk: ComplianceRiskLevel; // Highest risk across all issues
  issueCount: number; // Total number of issues found
  issues: ComplianceIssue[]; // Detailed issues
  statesScanned: string[]; // List of states that have been checked
  expiresAt: string; // ISO timestamp - 90 days from lastScanDate
}

export interface ComplianceDashboardStats {
  totalBOMs: number;
  scannedBOMs: number;
  clearBOMs: number; // No issues
  lowRiskBOMs: number;
  mediumRiskBOMs: number;
  highRiskBOMs: number;
  criticalRiskBOMs: number;
  unknownBOMs: number; // Not scanned yet
  topIngredients: Array<{ ingredient: string; issueCount: number }>;
  topStates: Array<{ state: string; issueCount: number }>;
}
