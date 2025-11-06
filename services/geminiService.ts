

import { GoogleGenAI } from "@google/genai";
import type { BillOfMaterials, InventoryItem, Vendor, PurchaseOrder, BOMComponent, WatchlistItem } from '../types';
import type { Forecast } from './forecastingService';

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

async function callGemini(model: string, prompt: string, isJson = false) {
    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
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
  // PHASE 0 FIX: Limit data sent to reduce token usage by 95%
  // Only send the most relevant items based on the question
  const relevantBOMs = smartFilter(boms, question, 20);
  const relevantInventory = smartFilter(inventory, question, 20);
  const relevantVendors = smartFilter(vendors, question, 10);
  const relevantPOs = smartFilter(purchaseOrders, question, 10);

  console.log(`[AI Assistant] Smart filtering: ${inventory.length} → ${relevantInventory.length} inventory items`);
  console.log(`[AI Assistant] Smart filtering: ${boms.length} → ${relevantBOMs.length} BOMs`);
  console.log(`[AI Assistant] Smart filtering: ${vendors.length} → ${relevantVendors.length} vendors`);

  const finalPrompt = promptTemplate
    .replace('{{question}}', question)
    .replace('{{boms}}', JSON.stringify(relevantBOMs, null, 2))
    .replace('{{inventory}}', JSON.stringify(relevantInventory, null, 2))
    .replace('{{vendors}}', JSON.stringify(relevantVendors, null, 2))
    .replace('{{purchaseOrders}}', JSON.stringify(relevantPOs, null, 2));

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