

import { GoogleGenAI } from "@google/genai";
import type { BillOfMaterials, InventoryItem, Vendor, PurchaseOrder, BOMComponent, WatchlistItem } from '../types';
import type { Forecast } from './forecastingService';

// Support both import.meta.env (Vite) and process.env (Node cli/backends)
// @ts-expect-error process may be undefined in browser environments
const envApiKey = import.meta.env?.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env?.API_KEY : undefined);

if (!envApiKey) {
    console.warn('Gemini API key is not configured. Set VITE_GEMINI_API_KEY in your environment.');
}

const ai = new GoogleGenAI({ apiKey: envApiKey! });

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
        if (error instanceof Error) {
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
  const finalPrompt = promptTemplate
    .replace('{{question}}', question)
    .replace('{{boms}}', JSON.stringify(boms, null, 2))
    .replace('{{inventory}}', JSON.stringify(inventory, null, 2))
    .replace('{{vendors}}', JSON.stringify(vendors, null, 2))
    .replace('{{purchaseOrders}}', JSON.stringify(purchaseOrders, null, 2));
    
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