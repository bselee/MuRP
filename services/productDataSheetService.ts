/**
 * Product Data Sheet Service
 *
 * AI-powered service for generating comprehensive product documentation
 * Generates SDS, spec sheets, product info, and compliance documents
 * from BOM data, label extractions, and compliance records
 */

import type { BillOfMaterials, Label, ComplianceRecord, ProductDataSheet } from '../types';

// Gemini AI client (using existing service)
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent';

interface GenerateDataSheetOptions {
  documentType: ProductDataSheet['documentType'];
  bom: BillOfMaterials;
  label?: Label;
  complianceRecords?: ComplianceRecord[];
  includeManufacturingInfo?: boolean;
  includeRegulatoryInfo?: boolean;
  customSections?: Array<{ title: string; prompt: string }>;
}

/**
 * Generate a comprehensive product data sheet using AI
 */
export async function generateProductDataSheet(
  options: GenerateDataSheetOptions
): Promise<ProductDataSheet['content']> {
  const {
    documentType,
    bom,
    label,
    complianceRecords = [],
    includeManufacturingInfo = true,
    includeRegulatoryInfo = true,
    customSections = []
  } = options;

  // Build comprehensive prompt
  const prompt = buildDataSheetPrompt(
    documentType,
    bom,
    label,
    complianceRecords,
    includeManufacturingInfo,
    includeRegulatoryInfo,
    customSections
  );

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.4, // Lower temperature for more factual, consistent output
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      throw new Error('No content generated from AI');
    }

    // Parse the JSON response
    const content = parseDataSheetResponse(generatedText, documentType);

    return content;

  } catch (error) {
    console.error('Error generating product data sheet:', error);
    throw new Error(`Failed to generate data sheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Build the AI prompt for data sheet generation
 */
function buildDataSheetPrompt(
  documentType: ProductDataSheet['documentType'],
  bom: BillOfMaterials,
  label: Label | undefined,
  complianceRecords: ComplianceRecord[],
  includeManufacturingInfo: boolean,
  includeRegulatoryInfo: boolean,
  customSections: Array<{ title: string; prompt: string }>
): string {
  const bomInfo = `
PRODUCT INFORMATION:
- Product Name: ${bom.name}
- SKU: ${bom.finishedSku}
- Barcode: ${bom.barcode || 'Not specified'}
- Category: ${bom.category || 'Not specified'}
- Description: ${bom.description || 'Not specified'}
- Yield Quantity: ${bom.yieldQuantity || 'Not specified'}

COMPONENTS/INGREDIENTS:
${bom.components.map(c => `- ${c.name} (SKU: ${c.sku}): ${c.quantity} ${c.unitCost ? `@ $${c.unitCost}` : ''}`).join('\n')}

PACKAGING:
- Bag Type: ${bom.packaging.bagType}
- Label Type: ${bom.packaging.labelType}
- Special Instructions: ${bom.packaging.specialInstructions}
${bom.packaging.weight ? `- Weight: ${bom.packaging.weight} ${bom.packaging.weightUnit || ''}` : ''}
${bom.packaging.dimensions ? `- Dimensions: ${bom.packaging.dimensions}` : ''}
`;

  const labelInfo = label?.extractedData ? `
LABEL EXTRACTED DATA:
- Product Name: ${label.extractedData.productName || 'Not specified'}
- Net Weight: ${label.extractedData.netWeight || 'Not specified'}
- Barcode: ${label.extractedData.barcode || 'Not specified'}

INGREDIENTS (from label):
${label.extractedData.ingredients?.map(ing =>
  `${ing.order}. ${ing.name}${ing.percentage ? ` - ${ing.percentage}` : ''}`
).join('\n') || 'No ingredients extracted'}

GUARANTEED ANALYSIS:
${label.extractedData.guaranteedAnalysis ? `
- Total Nitrogen (N): ${label.extractedData.guaranteedAnalysis.nitrogen || 'Not specified'}
- Available Phosphate (P₂O₅): ${label.extractedData.guaranteedAnalysis.phosphate || 'Not specified'}
- Soluble Potash (K₂O): ${label.extractedData.guaranteedAnalysis.potassium || 'Not specified'}
${Object.entries(label.extractedData.guaranteedAnalysis.otherNutrients || {}).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
` : 'Not available'}

CLAIMS:
${label.extractedData.claims?.map(c => `- ${c}`).join('\n') || 'None'}

WARNINGS:
${label.extractedData.warnings?.map(w => `- ${w}`).join('\n') || 'None'}

DIRECTIONS FOR USE:
${label.extractedData.directions || 'Not specified'}
` : '';

  const complianceInfo = includeRegulatoryInfo && complianceRecords.length > 0 ? `
REGULATORY COMPLIANCE:
${complianceRecords.map(cr => `
- ${cr.complianceType.toUpperCase()}: ${cr.stateName || cr.issuingAuthority || 'Unknown'}
  Registration #: ${cr.registrationNumber}
  Status: ${cr.status}
  Expiration: ${cr.expirationDate || 'Not specified'}
  ${cr.restrictions ? `Restrictions: ${cr.restrictions}` : ''}
`).join('\n')}
` : '';

  const manufacturingInfo = includeManufacturingInfo ? `
MANUFACTURING INFORMATION:
- Batch Size: Based on BOM yield of ${bom.yieldQuantity || 'unspecified'} units
- Components: ${bom.components.length} raw materials
` : '';

  // Document type specific instructions
  const typeInstructions = getDocumentTypeInstructions(documentType);

  const prompt = `You are a technical writer specializing in agricultural and fertilizer product documentation. Generate a comprehensive ${documentType.toUpperCase().replace('_', ' ')} for the following product.

${bomInfo}
${labelInfo}
${complianceInfo}
${manufacturingInfo}

${typeInstructions}

IMPORTANT FORMATTING INSTRUCTIONS:
1. Return ONLY valid JSON with no markdown code blocks or backticks
2. Use the exact structure specified in the instructions
3. Include all required sections
4. Be factual and professional
5. If information is not available, use "Not specified" or "Information not available"
6. For safety information, include standard warnings even if not explicitly provided
7. All percentage values should include the % symbol
8. Use proper chemical notation when applicable

${customSections.length > 0 ? `
ADDITIONAL CUSTOM SECTIONS:
${customSections.map(s => `- ${s.title}: ${s.prompt}`).join('\n')}
` : ''}

Generate the complete document now in valid JSON format.`;

  return prompt;
}

/**
 * Get document type specific instructions
 */
function getDocumentTypeInstructions(documentType: ProductDataSheet['documentType']): string {
  switch (documentType) {
    case 'sds':
      return `Generate a Safety Data Sheet (SDS) following GHS format with these sections:

Return JSON with this structure:
{
  "productIdentification": {
    "productName": "string",
    "sku": "string",
    "barcode": "string",
    "manufacturer": "string",
    "manufacturerAddress": "string",
    "emergencyPhone": "string",
    "productUse": "string"
  },
  "hazardsIdentification": {
    "hazardClassification": "string",
    "labelElements": ["string"],
    "warningStatements": ["string"],
    "firstAidMeasures": {
      "inhalation": "string",
      "skinContact": "string",
      "eyeContact": "string",
      "ingestion": "string"
    }
  },
  "composition": {
    "ingredients": [
      {"name": "string", "percentage": "string", "casNumber": "string", "function": "string"}
    ],
    "guaranteedAnalysis": {
      "totalNitrogen": "string",
      "availablePhosphate": "string",
      "soluablePotash": "string"
    }
  },
  "storageAndHandling": {
    "storageConditions": "string",
    "temperatureRange": "string",
    "shelfLife": "string",
    "handlingPrecautions": ["string"],
    "incompatibilities": "string"
  },
  "regulatoryInformation": {
    "stateRegistrations": [{"state": "string", "registrationNumber": "string", "expirationDate": "string", "status": "string"}],
    "certifications": ["string"],
    "epaRegistration": "string",
    "tsca": "string"
  }
}`;

    case 'spec_sheet':
      return `Generate a Technical Specification Sheet with detailed product specifications:

Return JSON with this structure:
{
  "productIdentification": {
    "productName": "string",
    "sku": "string",
    "barcode": "string",
    "manufacturer": "string"
  },
  "composition": {
    "ingredients": [{"name": "string", "percentage": "string", "function": "string"}],
    "guaranteedAnalysis": {
      "totalNitrogen": "string",
      "availablePhosphate": "string",
      "soluablePotash": "string"
    }
  },
  "technicalData": {
    "applicationRates": {"crop1": "rate", "crop2": "rate"},
    "directions": "string",
    "compatibility": "string",
    "physicalProperties": {
      "appearance": "string",
      "odor": "string",
      "pH": "string",
      "solubility": "string",
      "density": "string"
    }
  },
  "storageAndHandling": {
    "storageConditions": "string",
    "shelfLife": "string",
    "handlingPrecautions": ["string"]
  },
  "regulatoryInformation": {
    "stateRegistrations": [{"state": "string", "registrationNumber": "string"}],
    "certifications": ["string"]
  }
}`;

    case 'product_info':
      return `Generate a Product Information Sheet for marketing and sales:

Return JSON with this structure:
{
  "productIdentification": {
    "productName": "string",
    "sku": "string",
    "productUse": "string"
  },
  "composition": {
    "ingredients": [{"name": "string", "percentage": "string"}],
    "guaranteedAnalysis": {
      "totalNitrogen": "string",
      "availablePhosphate": "string",
      "soluablePotash": "string"
    }
  },
  "technicalData": {
    "applicationRates": {"crop1": "rate"},
    "directions": "string"
  },
  "storageAndHandling": {
    "storageConditions": "string",
    "shelfLife": "string"
  },
  "customSections": [
    {"title": "Benefits", "content": "string"},
    {"title": "Best Used For", "content": "string"}
  ]
}`;

    case 'compliance_doc':
      return `Generate a Compliance Documentation Sheet focused on regulatory information:

Return JSON with this structure:
{
  "productIdentification": {
    "productName": "string",
    "sku": "string",
    "barcode": "string"
  },
  "composition": {
    "ingredients": [{"name": "string", "percentage": "string", "casNumber": "string"}]
  },
  "regulatoryInformation": {
    "stateRegistrations": [
      {"state": "string", "registrationNumber": "string", "expirationDate": "string", "status": "string"}
    ],
    "certifications": ["string"],
    "epaRegistration": "string",
    "restrictions": "string",
    "labelApproval": "string"
  },
  "customSections": [
    {"title": "Compliance Notes", "content": "string"}
  ]
}`;

    default:
      return `Generate a comprehensive product document with all available information.`;
  }
}

/**
 * Parse AI response and validate structure
 */
function parseDataSheetResponse(
  generatedText: string,
  documentType: ProductDataSheet['documentType']
): ProductDataSheet['content'] {
  try {
    // Remove markdown code blocks if present
    let cleanedText = generatedText.trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    const parsed = JSON.parse(cleanedText);

    // Validate required sections based on document type
    validateDataSheetStructure(parsed, documentType);

    return parsed;

  } catch (error) {
    console.error('Error parsing AI response:', error);
    console.error('Generated text:', generatedText);
    throw new Error(`Failed to parse AI response: ${error instanceof Error ? error.message : 'Invalid JSON'}`);
  }
}

/**
 * Validate data sheet structure
 */
function validateDataSheetStructure(
  content: any,
  documentType: ProductDataSheet['documentType']
): void {
  if (!content || typeof content !== 'object') {
    throw new Error('Invalid content structure: must be an object');
  }

  // Basic validation - check for at least one major section
  const hasSections =
    content.productIdentification ||
    content.composition ||
    content.hazardsIdentification ||
    content.storageAndHandling ||
    content.technicalData ||
    content.regulatoryInformation ||
    content.manufacturingInformation;

  if (!hasSections) {
    throw new Error('Invalid content structure: missing required sections');
  }

  // All validations passed
}

/**
 * Generate a simple preview/summary of a data sheet
 */
export function generateDataSheetSummary(content: ProductDataSheet['content']): string {
  const sections: string[] = [];

  if (content.productIdentification) {
    sections.push(`Product: ${content.productIdentification.productName || 'Unknown'}`);
  }

  if (content.composition?.ingredients) {
    sections.push(`Ingredients: ${content.composition.ingredients.length} listed`);
  }

  if (content.composition?.guaranteedAnalysis) {
    const ga = content.composition.guaranteedAnalysis;
    if (ga.totalNitrogen || ga.availablePhosphate || ga.soluablePotash) {
      sections.push(`NPK: ${ga.totalNitrogen || 'N/A'}-${ga.availablePhosphate || 'N/A'}-${ga.soluablePotash || 'N/A'}`);
    }
  }

  if (content.regulatoryInformation?.stateRegistrations) {
    sections.push(`Registrations: ${content.regulatoryInformation.stateRegistrations.length} states`);
  }

  return sections.join(' | ');
}
