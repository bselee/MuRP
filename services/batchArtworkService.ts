// Tier 1 AI Enhancement: Batch Artwork Verification
// Service for verifying multiple artwork files in parallel

import type { BatchArtworkResult } from '../types/regulatory';
import type { BillOfMaterials } from '../types';
import { verifyArtworkLabel } from './geminiService';

// Configurable concurrency - can be adjusted based on API limits and system resources
export const MAX_CONCURRENT_REQUESTS = 10; // Process 10 images in parallel

/**
 * Process multiple artwork files in batches
 */
export async function verifyArtworkBatch(
  files: File[],
  boms: BillOfMaterials[],
  aiModel: string,
  promptTemplate: string,
  onProgress?: (completed: number, total: number) => void
): Promise<BatchArtworkResult[]> {
  const results: BatchArtworkResult[] = [];
  const totalFiles = files.length;
  let completedFiles = 0;

  // Process files in chunks to avoid overwhelming the API
  for (let i = 0; i < files.length; i += MAX_CONCURRENT_REQUESTS) {
    const chunk = files.slice(i, i + MAX_CONCURRENT_REQUESTS);
    const chunkResults = await Promise.all(
      chunk.map(file => processArtworkFile(file, boms, aiModel, promptTemplate))
    );
    
    results.push(...chunkResults);
    completedFiles += chunk.length;
    
    if (onProgress) {
      onProgress(completedFiles, totalFiles);
    }
  }

  return results;
}

/**
 * Process a single artwork file
 */
async function processArtworkFile(
  file: File,
  boms: BillOfMaterials[],
  aiModel: string,
  promptTemplate: string
): Promise<BatchArtworkResult> {
  try {
    // Try to match the file to a BOM
    const matchedBom = findMatchingBom(file.name, boms);
    
    if (!matchedBom) {
      return {
        fileName: file.name,
        status: 'Warning',
        message: 'Could not match file to a product BOM. Upload manually via the Artwork page.',
      };
    }

    // Convert file to base64
    const base64 = await fileToBase64(file);
    
    // Verify with AI
    const expectedBarcode = matchedBom.barcode || '';
    const verificationResult = await verifyArtworkLabel(
      aiModel,
      promptTemplate,
      base64,
      expectedBarcode
    );

    // Parse the result
    const parsedResult = parseVerificationResult(verificationResult, expectedBarcode);

    return {
      fileName: file.name,
      bomId: matchedBom.id,
      productName: matchedBom.name,
      expectedBarcode,
      status: parsedResult.status,
      message: parsedResult.message,
      verificationDetails: parsedResult.details,
    };
  } catch (error) {
    console.error(`Error processing ${file.name}:`, error);
    return {
      fileName: file.name,
      status: 'Error',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Try to match a filename to a BOM
 * Looks for SKU patterns in the filename
 */
function findMatchingBom(fileName: string, boms: BillOfMaterials[]): BillOfMaterials | null {
  const normalizedName = fileName.toLowerCase();
  
  // Try exact SKU match first
  for (const bom of boms) {
    if (normalizedName.includes(bom.finishedSku.toLowerCase())) {
      return bom;
    }
  }
  
  // Try product name match (fuzzy)
  for (const bom of boms) {
    const productWords = bom.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const matchedWords = productWords.filter(word => normalizedName.includes(word));
    
    // If at least 50% of significant words match, consider it a match
    if (matchedWords.length >= productWords.length * 0.5 && productWords.length > 0) {
      return bom;
    }
  }
  
  return null;
}

/**
 * Convert File to base64 string
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        // Remove the data URL prefix (e.g., "data:image/png;base64,")
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Failed to convert file to base64'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Parse the AI verification result into structured data
 */
function parseVerificationResult(
  result: string,
  expectedBarcode: string
): {
  status: 'Success' | 'Warning' | 'Error';
  message: string;
  details?: {
    barcodeMatch: boolean;
    qualityScore: string;
    issues: string[];
  };
} {
  const lowerResult = result.toLowerCase();
  
  // Check for barcode match
  const barcodeMatch = lowerResult.includes('match') && !lowerResult.includes('not match') && !lowerResult.includes('mismatch');
  
  // Determine quality score
  let qualityScore = 'Good';
  if (lowerResult.includes('excellent')) qualityScore = 'Excellent';
  else if (lowerResult.includes('poor') || lowerResult.includes('low quality')) qualityScore = 'Poor';
  
  // Extract issues
  const issues: string[] = [];
  if (lowerResult.includes('contrast') || lowerResult.includes('readable')) {
    issues.push('Low contrast or readability issues detected');
  }
  if (lowerResult.includes('blur') || lowerResult.includes('resolution')) {
    issues.push('Image quality may affect scanning');
  }
  if (!barcodeMatch && expectedBarcode) {
    issues.push(`Barcode mismatch - Expected: ${expectedBarcode}`);
  }
  
  // Determine overall status
  let status: 'Success' | 'Warning' | 'Error' = 'Success';
  if (issues.length > 0) {
    status = issues.some(i => i.includes('mismatch')) ? 'Error' : 'Warning';
  }
  
  return {
    status,
    message: result,
    details: {
      barcodeMatch,
      qualityScore,
      issues,
    },
  };
}

/**
 * Export batch results to CSV
 */
export function exportBatchResultsToCSV(results: BatchArtworkResult[]): string {
  const headers = ['File Name', 'Product', 'Status', 'Barcode Match', 'Quality', 'Issues'];
  const rows = results.map(r => [
    r.fileName,
    r.productName || 'N/A',
    r.status,
    r.verificationDetails?.barcodeMatch ? 'Yes' : 'No',
    r.verificationDetails?.qualityScore || 'N/A',
    r.verificationDetails?.issues.join('; ') || 'None',
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');
  
  return csvContent;
}
