// Semantic Search: Embedding Generation Service
// Generate vector embeddings using Google Gemini Embedding API

import { GoogleGenAI } from "@google/genai";
import type { InventoryItem, BillOfMaterials, Vendor } from '../types';

// Support both import.meta.env (Vite) and process.env (Node cli/backends)
const envApiKey = import.meta.env?.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? (process as any).env?.API_KEY : undefined);

if (!envApiKey) {
    console.warn('Gemini API key is not configured. Embedding service will not work.');
}

const ai = new GoogleGenAI({ apiKey: envApiKey! });

/**
 * Generate embedding vector for a given text
 * Returns a 768-dimensional vector using gemini-embedding-001
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot generate embedding for empty text');
  }

  try {
    const response = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: text,
    });

    if (!response.embedding) {
      throw new Error('No embedding returned from API');
    }

    // Gemini embedding API returns a 768-dimensional vector
    return response.embedding;
  } catch (error) {
    console.error('[Embedding Service] Error generating embedding:', error);
    throw error;
  }
}

/**
 * Create searchable text representation of an inventory item
 */
export function createInventorySearchText(item: InventoryItem): string {
  const parts = [
    item.name,
    item.sku,
    item.category,
    item.description || '',
    item.status || '',
    item.warehouseLocation || '',
    item.binLocation || '',
    `stock: ${item.stock}`,
    `reorder point: ${item.reorderPoint}`,
  ];

  return parts.filter(p => p.length > 0).join(' | ');
}

/**
 * Create searchable text representation of a BOM
 */
export function createBOMSearchText(bom: BillOfMaterials): string {
  const componentNames = bom.components.map(c => c.name).join(', ');
  const parts = [
    bom.name,
    bom.finishedSku,
    bom.description || '',
    bom.category || '',
    `components: ${componentNames}`,
    `packaging: ${bom.packaging.bagType} ${bom.packaging.labelType}`,
  ];

  return parts.filter(p => p.length > 0).join(' | ');
}

/**
 * Create searchable text representation of a vendor
 */
export function createVendorSearchText(vendor: Vendor): string {
  const parts = [
    vendor.name,
    vendor.id,
    vendor.contactEmails.join(' '),
    vendor.phone,
    vendor.website,
    vendor.city || '',
    vendor.state || '',
    vendor.country || '',
    `lead time: ${vendor.leadTimeDays} days`,
  ];

  return parts.filter(p => p.length > 0).join(' | ');
}

/**
 * Generate embeddings for all inventory items
 * @param items Inventory items to process
 * @param onProgress Callback for progress tracking
 * @returns Map of SKU → embedding vector
 */
export async function generateInventoryEmbeddings(
  items: InventoryItem[],
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, number[]>> {
  console.log(`[Embedding Service] Generating embeddings for ${items.length} inventory items`);

  const embeddings = new Map<string, number[]>();
  const batchSize = 10; // Process 10 items at a time to avoid rate limits

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, Math.min(i + batchSize, items.length));

    // Process batch in parallel
    const batchPromises = batch.map(async (item) => {
      try {
        const searchText = createInventorySearchText(item);
        const embedding = await generateEmbedding(searchText);
        return { sku: item.sku, embedding };
      } catch (error) {
        console.error(`[Embedding Service] Failed to generate embedding for ${item.sku}:`, error);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);

    // Store successful embeddings
    batchResults.forEach(result => {
      if (result) {
        embeddings.set(result.sku, result.embedding);
      }
    });

    // Progress callback
    if (onProgress) {
      onProgress(Math.min(i + batchSize, items.length), items.length);
    }

    // Rate limiting: wait 1 second between batches
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`[Embedding Service] Generated ${embeddings.size} embeddings for inventory`);
  return embeddings;
}

/**
 * Generate embeddings for all BOMs
 */
export async function generateBOMEmbeddings(
  boms: BillOfMaterials[],
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, number[]>> {
  console.log(`[Embedding Service] Generating embeddings for ${boms.length} BOMs`);

  const embeddings = new Map<string, number[]>();
  const batchSize = 10;

  for (let i = 0; i < boms.length; i += batchSize) {
    const batch = boms.slice(i, Math.min(i + batchSize, boms.length));

    const batchPromises = batch.map(async (bom) => {
      try {
        const searchText = createBOMSearchText(bom);
        const embedding = await generateEmbedding(searchText);
        return { id: bom.id, embedding };
      } catch (error) {
        console.error(`[Embedding Service] Failed to generate embedding for ${bom.id}:`, error);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);

    batchResults.forEach(result => {
      if (result) {
        embeddings.set(result.id, result.embedding);
      }
    });

    if (onProgress) {
      onProgress(Math.min(i + batchSize, boms.length), boms.length);
    }

    if (i + batchSize < boms.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`[Embedding Service] Generated ${embeddings.size} embeddings for BOMs`);
  return embeddings;
}

/**
 * Generate embeddings for all vendors
 */
export async function generateVendorEmbeddings(
  vendors: Vendor[],
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, number[]>> {
  console.log(`[Embedding Service] Generating embeddings for ${vendors.length} vendors`);

  const embeddings = new Map<string, number[]>();
  const batchSize = 10;

  for (let i = 0; i < vendors.length; i += batchSize) {
    const batch = vendors.slice(i, Math.min(i + batchSize, vendors.length));

    const batchPromises = batch.map(async (vendor) => {
      try {
        const searchText = createVendorSearchText(vendor);
        const embedding = await generateEmbedding(searchText);
        return { id: vendor.id, embedding };
      } catch (error) {
        console.error(`[Embedding Service] Failed to generate embedding for ${vendor.id}:`, error);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);

    batchResults.forEach(result => {
      if (result) {
        embeddings.set(result.id, result.embedding);
      }
    });

    if (onProgress) {
      onProgress(Math.min(i + batchSize, vendors.length), vendors.length);
    }

    if (i + batchSize < vendors.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`[Embedding Service] Generated ${embeddings.size} embeddings for vendors`);
  return embeddings;
}

/**
 * Calculate cosine similarity between two vectors
 * Returns a value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite)
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}
