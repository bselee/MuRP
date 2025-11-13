

import { GoogleGenAI } from "@google/genai";
import type { BillOfMaterials, InventoryItem, Vendor, PurchaseOrder, BOMComponent, WatchlistItem } from '../types';
import type { Forecast } from './forecastingService';
import { searchInventory, searchBOMs, searchVendors, getEmbeddingStats } from './semanticSearch';

// Support both import.meta.env (Vite) and process.env (Node cli/backends)
const envApiKey = import.meta.env?.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? (process as any).env?.API_KEY : undefined);

if (!envApiKey) {
    console.warn('Gemini API key is not configured. Set VITE_GEMINI_API_KEY in your environment.');
}

const ai = new GoogleGenAI({ apiKey: envApiKey! });

/**
 * Smart filter to limit data sent to AI API
 * Reduces token usage by only sending relevant items
 */
function smartFilter<T>(
  items: T[],
  question: string,
  maxItems: number = 20
): T[] {
  if (items.length <= maxItems) {
    return items;
  }

  // Simple keyword-based filtering for now
  // In production, could use embeddings/semantic search
  const keywords = question.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  if (keywords.length === 0) {
    // No keywords, just return first N items
    return items.slice(0, maxItems);
  }

  // Score each item by keyword relevance
  const scored = items.map((item: any) => {
    const text = JSON.stringify(item).toLowerCase();
    const score = keywords.reduce((acc, keyword) =>
      text.includes(keyword) ? acc + 1 : acc, 0
    );
    return { item, score };
  });

  // Return top N most relevant items
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .map(s => s.item);
}

/**
 * Parse quota exceeded (429) errors from Gemini API
 */
function parseQuotaError(error: any): string {
  try {
    // Try to parse the error message as JSON
    const errorStr = error.message || JSON.stringify(error);
    const jsonMatch = errorStr.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return `⏰ **API Quota Exceeded**

You've reached your API quota limit.

**What to do:**
1. Wait 1 minute and try again
2. Ask shorter, more specific questions
3. Upgrade your plan: https://ai.google.dev/pricing

📊 Monitor usage: https://ai.dev/usage?tab=rate-limit`;
    }

    const errorData = JSON.parse(jsonMatch[0]);
    const retryInfo = errorData.error?.details?.find((d: any) =>
      d['@type']?.includes('RetryInfo')
    );
    const quotaInfo = errorData.error?.details?.find((d: any) =>
      d['@type']?.includes('QuotaFailure')
    );

    const retryDelay = retryInfo?.retryDelay || '60s';
    const retrySeconds = parseInt(retryDelay.replace('s', ''));
    const quotaLimit = quotaInfo?.violations?.[0]?.quotaValue || '250,000';
    const quotaMetric = quotaInfo?.violations?.[0]?.quotaMetric || 'tokens';

    return `⏰ **API Quota Exceeded**

You've reached your **${quotaLimit}** token limit for this time period.

**What this means:**
- Free tier limit: 250,000 tokens/minute
- Please wait **${retrySeconds} seconds** before trying again

**Your options:**
1. ⏱️ Wait ${retrySeconds}s and try again
2. 💡 Ask shorter, more specific questions
3. 💳 Upgrade to paid tier: https://ai.google.dev/pricing

**Resources:**
📊 Monitor your usage: https://ai.dev/usage?tab=rate-limit
📚 Rate limit docs: https://ai.google.dev/gemini-api/docs/rate-limits

💡 **Tip:** Specific questions use fewer tokens and get better answers!`;
  } catch (parseError) {
    // Fallback if parsing fails
    return `⏰ **API Quota Exceeded**

Please wait 1 minute before trying again, or upgrade your plan.

📊 Monitor usage: https://ai.dev/usage?tab=rate-limit
💳 Upgrade: https://ai.google.dev/pricing`;
  }
}

export async function callGemini(model: string, prompt: string, isJson = false, imageBase64?: string) {
    try {
        let contents: any;

        // If image provided, use multimodal format
        if (imageBase64) {
            const imagePart = {
                inlineData: {
                    mimeType: 'image/png', // Default to PNG, works for most images
                    data: imageBase64,
                },
            };
            const textPart = { text: prompt };
            contents = { parts: [imagePart, textPart] };
        } else {
            // Text-only
            contents = prompt;
        }

        const response = await ai.models.generateContent({
            model: model,
            contents: contents,
        });

        // FIX: Directly access the .text property as per Gemini API guidelines.
        if (!response.text) {
            return "I'm sorry, I couldn't generate a response. Please try again.";
        }
        return response.text;
    } catch (error) {
        console.error("Error calling Gemini API:", error);

        // Check for quota exceeded (429) errors
        if (error instanceof Error) {
            const errorStr = error.message || '';
            if (errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED') || errorStr.includes('Quota exceeded')) {
                return parseQuotaError(error);
            }
            return `An error occurred: ${error.message}. Make sure your API key is configured correctly.`;
        }
        return "An unknown error occurred while contacting the AI assistant.";
    }
}

export async function askAboutInventory(
  model: string,
  promptTemplate: string,
  question: string,
  boms: BillOfMaterials[],
  inventory: InventoryItem[],
  vendors: Vendor[],
  purchaseOrders: PurchaseOrder[]
): Promise<string> {
  // Calculate buildability for all BOMs (enhanced context)
  const buildabilityData = boms.map(bom => {
    const inventoryMap = new Map(inventory.map(item => [item.sku, item]));
    const componentStatus = bom.components.map(comp => {
      const invItem = inventoryMap.get(comp.sku);
      const available = invItem?.stock || 0;
      const needed = comp.quantity;
      return {
        sku: comp.sku,
        name: comp.name,
        needed,
        available,
        shortfall: Math.max(0, needed - available),
        sufficient: available >= needed
      };
    });
    
    const buildable = componentStatus.every(c => c.sufficient);
    const limitingComponent = componentStatus.find(c => !c.sufficient);
    
    return {
      sku: bom.finishedSku,
      name: bom.name,
      buildable,
      limitingComponent: limitingComponent ? limitingComponent.sku : null,
      componentStatus: componentStatus.slice(0, 5) // Limit details to prevent context overflow
    };
  });

  // Check if semantic search embeddings are available
  const embeddingStats = getEmbeddingStats();
  const useSemanticSearch = embeddingStats.total > 0;

  let relevantBOMs: BillOfMaterials[];
  let relevantInventory: InventoryItem[];
  let relevantVendors: Vendor[];
  let relevantPOs: PurchaseOrder[];

  if (useSemanticSearch) {
    console.log(`[AI Assistant] Using SEMANTIC SEARCH (${embeddingStats.total} embeddings available)`);

    try {
      // Use semantic search for better relevance
      relevantInventory = await searchInventory(question, inventory, 20);
      relevantBOMs = await searchBOMs(question, boms, 20);
      relevantVendors = await searchVendors(question, vendors, 10);
      relevantPOs = smartFilter(purchaseOrders, question, 10); // POs still use keyword filtering

      console.log(`[AI Assistant] Semantic search: ${inventory.length} → ${relevantInventory.length} inventory items`);
      console.log(`[AI Assistant] Semantic search: ${boms.length} → ${relevantBOMs.length} BOMs`);
      console.log(`[AI Assistant] Semantic search: ${vendors.length} → ${relevantVendors.length} vendors`);
    } catch (error) {
      console.error('[AI Assistant] Semantic search failed, falling back to keyword filtering:', error);
      useSemanticSearch && console.log('[AI Assistant] Fallback to KEYWORD FILTERING');

      // Fallback to keyword filtering
      relevantBOMs = smartFilter(boms, question, 20);
      relevantInventory = smartFilter(inventory, question, 20);
      relevantVendors = smartFilter(vendors, question, 10);
      relevantPOs = smartFilter(purchaseOrders, question, 10);
    }
  } else {
    console.log(`[AI Assistant] Using KEYWORD FILTERING (no embeddings available)`);

    // Use keyword-based smart filtering (Phase 0)
    relevantBOMs = smartFilter(boms, question, 20);
    relevantInventory = smartFilter(inventory, question, 20);
    relevantVendors = smartFilter(vendors, question, 10);
    relevantPOs = smartFilter(purchaseOrders, question, 10);

    console.log(`[AI Assistant] Keyword filtering: ${inventory.length} → ${relevantInventory.length} inventory items`);
    console.log(`[AI Assistant] Keyword filtering: ${boms.length} → ${relevantBOMs.length} BOMs`);
    console.log(`[AI Assistant] Keyword filtering: ${vendors.length} → ${relevantVendors.length} vendors`);
  }

  // Get relevant buildability data based on the BOMs in context
  const relevantBuildability = buildabilityData.filter(b => 
    relevantBOMs.some(bom => bom.finishedSku === b.sku)
  );

  const finalPrompt = promptTemplate
    .replace('{{question}}', question)
    .replace('{{boms}}', JSON.stringify(relevantBOMs, null, 2))
    .replace('{{inventory}}', JSON.stringify(relevantInventory, null, 2))
    .replace('{{vendors}}', JSON.stringify(relevantVendors, null, 2))
    .replace('{{purchaseOrders}}', JSON.stringify(relevantPOs, null, 2))
    .replace('{{buildability}}', JSON.stringify(relevantBuildability, null, 2));

  return callGemini(model, finalPrompt);
}

export async function getAiPlanningInsight(
  model: string,
  promptTemplate: string,
  inventory: InventoryItem[],
  boms: BillOfMaterials[],
  forecast: Forecast[]
): Promise<string> {
    const finalPrompt = promptTemplate
        .replace('{{inventory}}', JSON.stringify(inventory, null, 2))
        .replace('{{boms}}', JSON.stringify(boms, null, 2))
        .replace('{{forecast}}', JSON.stringify(forecast, null, 2));

    return callGemini(model, finalPrompt);
}

export async function getRegulatoryAdvice(
    model: string,
    promptTemplate: string,
    productName: string,
    ingredients: BOMComponent[],
    state: string,
    watchlist: WatchlistItem[]
): Promise<string> {
    const ingredientList = ingredients.map(c => c.name).join(', ');
    const finalPrompt = promptTemplate
        .replace('{{productName}}', productName)
        .replace('{{state}}', state)
        .replace('{{ingredientList}}', ingredientList)
        .replace('{{watchlist}}', JSON.stringify(watchlist, null, 2));

    try {
        const response = await ai.models.generateContent({
            model,
            contents: finalPrompt,
            config: {
                tools: [{ googleSearch: {} }],
            },
        });
        // FIX: Directly access the .text property as per Gemini API guidelines.
        return response.text ?? "Could not generate regulatory advice at this time.";
    } catch (error) {
        console.error("Error calling Gemini API for regulatory advice:", error);
        return "An error occurred while fetching regulatory information. Please try again.";
    }
}

export async function draftComplianceLetter(
    model: string,
    promptTemplate: string,
    productName: string,
    ingredients: BOMComponent[],
    state: string,
    complianceAnalysis: string
): Promise<string> {
    const ingredientList = ingredients.map(c => `- ${c.name} (${c.sku})`).join('\n');
    const finalPrompt = promptTemplate
        .replace('{{state}}', state)
        .replace('{{productName}}', productName)
        .replace('{{ingredientList}}', ingredientList)
        .replace('{{complianceAnalysis}}', complianceAnalysis);

    try {
        const response = await ai.models.generateContent({
            model,
            contents: finalPrompt,
            config: {
                tools: [{ googleSearch: {} }],
            },
        });
        // FIX: Directly access the .text property as per Gemini API guidelines.
        return response.text ?? "Could not generate the draft letter at this time.";
    } catch (error) {
        console.error("Error calling Gemini API for letter drafting:", error);
        return "An error occurred while drafting the compliance letter. Please try again.";
    }
}

export async function verifyArtworkLabel(
    model: string, // Expects a multimodal model like 'gemini-2.5-flash-image'
    promptTemplate: string,
    artworkImageBase64: string,
    expectedBarcode: string
): Promise<string> {
    const finalPrompt = promptTemplate.replace('{{expectedBarcode}}', expectedBarcode);
    
    try {
        const imagePart = {
            inlineData: {
                mimeType: 'image/png',
                data: artworkImageBase64,
            },
        };
        const textPart = { text: finalPrompt };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image', // Hardcode to a known multimodal model for this specific task
            contents: { parts: [imagePart, textPart] },
        });

        // FIX: Directly access the .text property as per Gemini API guidelines.
        return response.text ?? "Could not analyze the artwork image.";
    } catch (error) {
        console.error("Error calling Gemini API for artwork verification:", error);
        return "An error occurred during image analysis. Please try again.";
    }
}