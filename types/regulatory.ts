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
