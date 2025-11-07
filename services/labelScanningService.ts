// AI Label Scanning Service
// Extracts ingredients, wording, barcodes, and guaranteed analysis from label images

import { callGemini } from './geminiService';
import type { Artwork, BillOfMaterials } from '../types';

// Prompt for comprehensive label extraction
const LABEL_EXTRACTION_PROMPT = `You are analyzing a product label for an agricultural/fertilizer product.

**Your task:** Extract all information from this label image and return structured JSON.

**Extract the following:**
1. Product name (main product title)
2. Net weight (with units, e.g., "50 lbs", "2.5 gallons")
3. Barcode number (usually UPC or EAN, typically 12-13 digits at bottom of label)
4. Complete ingredients list (in EXACT order as shown on label)
5. Guaranteed analysis (NPK percentages and any micronutrients)
6. All claims and certifications (OMRI Listed, Organic, certifications, etc.)
7. Warnings (e.g., "Keep out of reach of children", safety warnings)
8. Directions for use/application instructions
9. Any other notable text

**IMPORTANT:**
- List ingredients in EXACT order shown on label
- Include percentages next to ingredient names if shown (e.g., "Blood Meal 45%")
- For guaranteed analysis, preserve exact percentages as shown
- Identify barcodes carefully - usually at bottom, 12-13 digits
- Claims are usually in prominent locations (logos, badges, text)

**Return Format:**
Return ONLY a valid JSON object with this exact structure (no markdown, no extra text):

{
  "productName": "Product Name as shown on label",
  "netWeight": "50 lbs",
  "barcode": "012345678901",
  "ingredients": [
    {"name": "Ingredient Name", "percentage": "45%", "order": 1},
    {"name": "Second Ingredient", "order": 2}
  ],
  "guaranteedAnalysis": {
    "nitrogen": "10.0%",
    "phosphate": "5.0%",
    "potassium": "8.0%",
    "otherNutrients": {"Sulfur": "2.0%", "Calcium": "3.0%"}
  },
  "claims": ["OMRI Listed", "100% Organic", "Non-GMO"],
  "warnings": ["Keep out of reach of children", "Harmful if swallowed"],
  "directions": "Apply 1 cup per plant monthly during growing season...",
  "otherText": ["Made in USA", "Company Name", "Address"]
}

**If you cannot find certain information:**
- Omit that field or set to null
- For empty arrays, use []
- For missing values, use null

Return ONLY the JSON object, nothing else.`;

/**
 * Scan a label image using Gemini Vision API
 */
export async function scanLabelImage(
  imageBase64: string,
  aiModel: string = 'gemini-2.0-flash-vision-exp'
): Promise<Artwork['extractedData']> {
  try {
    console.log('[Label Scanning] Starting AI extraction...');

    // Call Gemini Vision with the image
    const response = await callGemini(aiModel, LABEL_EXTRACTION_PROMPT, false, imageBase64);

    console.log('[Label Scanning] Raw AI response:', response);

    // Parse the JSON response
    const extracted = parseExtractionResponse(response);

    // Add confidence scores (Gemini doesn't provide these, default to 0.9)
    if (extracted.ingredients) {
      extracted.ingredients = extracted.ingredients.map((ing, idx) => ({
        ...ing,
        confidence: 0.9,
        order: ing.order || idx + 1
      }));
    }

    console.log('[Label Scanning] Extraction completed successfully');
    return extracted;

  } catch (error) {
    console.error('[Label Scanning] Error during extraction:', error);
    throw new Error(
      `Failed to extract label data: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Parse the AI response (handles various response formats)
 */
function parseExtractionResponse(response: string): Artwork['extractedData'] {
  try {
    // Try to extract JSON from response (AI might wrap it in markdown or extra text)
    let jsonText = response.trim();

    // Remove markdown code blocks if present
    if (jsonText.includes('```json')) {
      const match = jsonText.match(/```json\s*([\s\S]*?)```/);
      if (match) {
        jsonText = match[1].trim();
      }
    } else if (jsonText.includes('```')) {
      const match = jsonText.match(/```\s*([\s\S]*?)```/);
      if (match) {
        jsonText = match[1].trim();
      }
    }

    // Parse JSON
    const parsed = JSON.parse(jsonText);

    return {
      productName: parsed.productName || undefined,
      netWeight: parsed.netWeight || undefined,
      barcode: parsed.barcode || undefined,
      ingredients: parsed.ingredients || [],
      guaranteedAnalysis: parsed.guaranteedAnalysis || undefined,
      claims: parsed.claims || [],
      warnings: parsed.warnings || [],
      directions: parsed.directions || undefined,
      otherText: parsed.otherText || []
    };

  } catch (error) {
    console.error('[Label Scanning] Failed to parse AI response:', error);
    console.error('[Label Scanning] Raw response was:', response);

    // Return empty structure if parsing fails
    return {
      ingredients: [],
      claims: [],
      warnings: [],
      otherText: []
    };
  }
}

/**
 * Compare extracted ingredients with BOM components
 */
export function compareIngredientsWithBOM(
  extractedIngredients: NonNullable<Artwork['extractedData']>['ingredients'],
  bomComponents: BillOfMaterials['components']
): Artwork['ingredientComparison'] {
  const compared: Artwork['ingredientComparison'] = {
    comparedAt: new Date().toISOString(),
    matchedIngredients: 0,
    missingFromLabel: [],
    missingFromBOM: [],
    orderMatches: true,
    percentageVariances: []
  };

  if (!extractedIngredients || !bomComponents) {
    return compared;
  }

  // Create normalized names for comparison
  const labelIngredientNames = extractedIngredients.map(ing => normalizeIngredientName(ing.name));
  const bomIngredientNames = bomComponents.map(comp => normalizeIngredientName(comp.name));

  // Find matches
  const matches: Array<{ label: typeof extractedIngredients[0]; bom: typeof bomComponents[0] }> = [];

  for (const labelIng of extractedIngredients) {
    const labelNorm = normalizeIngredientName(labelIng.name);

    for (const bomComp of bomComponents) {
      const bomNorm = normalizeIngredientName(bomComp.name);
      const similarity = calculateStringSimilarity(labelNorm, bomNorm);

      if (similarity > 0.7) {
        matches.push({ label: labelIng, bom: bomComp });
        compared.matchedIngredients++;
        break; // Found a match, move to next label ingredient
      }
    }
  }

  // Find missing ingredients
  for (const bomComp of bomComponents) {
    const bomNorm = normalizeIngredientName(bomComp.name);
    const found = matches.some(m => normalizeIngredientName(m.bom.name) === bomNorm);

    if (!found) {
      compared.missingFromLabel.push(bomComp.name);
    }
  }

  for (const labelIng of extractedIngredients) {
    const labelNorm = normalizeIngredientName(labelIng.name);
    const found = matches.some(m => normalizeIngredientName(m.label.name) === labelNorm);

    if (!found) {
      compared.missingFromBOM.push(labelIng.name);
    }
  }

  // Check order
  // Compare top 5 ingredients (order is most important for first few)
  const topLabelIngredients = extractedIngredients.slice(0, 5);
  const topBomComponents = bomComponents.slice(0, 5);

  for (let i = 0; i < Math.min(topLabelIngredients.length, topBomComponents.length); i++) {
    const labelNorm = normalizeIngredientName(topLabelIngredients[i].name);
    const bomNorm = normalizeIngredientName(topBomComponents[i].name);
    const similarity = calculateStringSimilarity(labelNorm, bomNorm);

    if (similarity < 0.7) {
      compared.orderMatches = false;
      break;
    }
  }

  return compared;
}

/**
 * Normalize ingredient name for comparison
 */
function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' '); // Normalize spaces
}

/**
 * Calculate string similarity (simple Levenshtein-based)
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) {
    return 1.0;
  }

  // Check if one string contains the other
  if (longer.includes(shorter)) {
    return 0.85; // High similarity if one contains the other
  }

  // Simple word-based similarity
  const longerWords = new Set(longer.split(' '));
  const shorterWords = new Set(shorter.split(' '));
  const intersection = new Set([...shorterWords].filter(x => longerWords.has(x)));

  return intersection.size / Math.max(longerWords.size, shorterWords.size);
}

/**
 * Convert File to base64 string for API submission
 */
export function fileToBase64(file: File): Promise<string> {
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
 * Calculate renewal status based on expiration date
 */
export function calculateRenewalStatus(
  expirationDate: string
): 'current' | 'due_soon' | 'urgent' | 'expired' {
  const now = new Date();
  const expiration = new Date(expirationDate);
  const daysUntilExpiration = Math.ceil((expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilExpiration < 0) return 'expired';
  if (daysUntilExpiration <= 30) return 'urgent';
  if (daysUntilExpiration <= 90) return 'due_soon';
  return 'current';
}

/**
 * Calculate days until expiration
 */
export function calculateDaysUntilExpiration(expirationDate: string): number {
  const now = new Date();
  const expiration = new Date(expirationDate);
  return Math.ceil((expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
