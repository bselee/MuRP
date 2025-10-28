import { GoogleGenAI } from "@google/genai";
import type { BillOfMaterials, InventoryItem, Vendor, PurchaseOrder } from '../types';
import type { Forecast } from './forecastingService';


// The API key is injected from the environment and does not need to be managed in the UI.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

export async function askAboutInventory(
  question: string,
  boms: BillOfMaterials[],
  inventory: InventoryItem[],
  vendors: Vendor[],
  purchaseOrders: PurchaseOrder[]
): Promise<string> {
  const model = 'gemini-2.5-flash';

  const context = `
    You are an expert inventory management AI assistant for a company that sells organic soil and amendments.
    Analyze the following data to answer the user's question.
    Provide clear, concise answers. You can use markdown for formatting if needed.

    INVENTORY DATA (Current Stock Levels, On Order, Reorder Points):
    ${JSON.stringify(inventory, null, 2)}

    BILLS OF MATERIALS (BOMs) DATA (Recipes for finished products):
    ${JSON.stringify(boms, null, 2)}

    VENDORS DATA:
    ${JSON.stringify(vendors, null, 2)}

    PURCHASE ORDERS DATA:
    ${JSON.stringify(purchaseOrders, null, 2)}
  `;

  const prompt = `${context}\n\nUSER QUESTION: ${question}`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });
    
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

export async function getAiPlanningInsight(
  inventory: InventoryItem[],
  boms: BillOfMaterials[],
  forecast: Forecast[]
): Promise<string> {
    const model = 'gemini-2.5-flash';

    const context = `
        You are a senior supply chain analyst AI. Your task is to analyze the provided inventory data, bills of materials, and sales forecast to identify the single most critical upcoming risk to the supply chain.
        
        Provide a concise, one-sentence summary of the risk, followed by a one-sentence recommended action. Be specific about the item and the timeline.

        Example:
        "Forecasted demand for Organic Super Soil will deplete your Worm Castings inventory in approximately 22 days, halting production.
        ACTION: Immediately create a purchase order for at least 250 units of Worm Castings (COMP-001) to prevent a stockout."

        CURRENT INVENTORY:
        ${JSON.stringify(inventory, null, 2)}

        BILLS OF MATERIALS:
        ${JSON.stringify(boms, null, 2)}

        DEMAND FORECAST (next 90 days, daily):
        ${JSON.stringify(forecast, null, 2)}
    `;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: context,
        });
        return response.text ?? "Could not generate an insight at this time.";
    } catch (error) {
        console.error("Error generating AI planning insight:", error);
        return "Error analyzing data. Please check API configuration.";
    }
}
