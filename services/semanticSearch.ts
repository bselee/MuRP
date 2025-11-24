// Semantic Search: Vector Similarity Search
// Find relevant items using semantic embeddings instead of keyword matching

import type { InventoryItem, BillOfMaterials, Vendor } from '../types';
import { supabase } from '../lib/supabase/client';
import {
  generateEmbedding,
  cosineSimilarity,
  createInventorySearchText,
  createBOMSearchText,
  createVendorSearchText,
} from './embeddingService';

// In-memory embedding storage (would be pgvector in production)
const inventoryEmbeddings = new Map<string, number[]>();
const bomEmbeddings = new Map<string, number[]>();
const vendorEmbeddings = new Map<string, number[]>();
type EmbeddingEntity = 'inventory' | 'bom' | 'vendor';

let embeddingsLoaded = false;
let loadPromise: Promise<void> | null = null;

async function persistEmbeddings(entityType: EmbeddingEntity, embeddings: Map<string, number[]>): Promise<void> {
  if (embeddings.size === 0) return;

  const rows = Array.from(embeddings.entries()).map(([entityId, embedding]) => ({
    entity_type: entityType,
    entity_id: entityId,
    embedding,
    updated_at: new Date().toISOString(),
  }));

  const batchSize = 50;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from('semantic_embeddings')
      .upsert(chunk, { onConflict: 'entity_type,entity_id' });
    if (error) {
      console.error('[Semantic Search] Failed to persist embeddings', error);
      throw error;
    }
  }
}

async function loadEmbeddingsFromDatabase(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('semantic_embeddings')
      .select('entity_type, entity_id, embedding');

    if (error) throw error;

    inventoryEmbeddings.clear();
    bomEmbeddings.clear();
    vendorEmbeddings.clear();

    (data || []).forEach((row) => {
      const vector = Array.isArray(row.embedding) ? (row.embedding as number[]) : [];
      if (row.entity_type === 'inventory') {
        inventoryEmbeddings.set(row.entity_id, vector);
      } else if (row.entity_type === 'bom') {
        bomEmbeddings.set(row.entity_id, vector);
      } else if (row.entity_type === 'vendor') {
        vendorEmbeddings.set(row.entity_id, vector);
      }
    });

    embeddingsLoaded = true;
  } catch (error) {
    console.error('[Semantic Search] Failed to load embeddings from Supabase:', error);
  } finally {
    loadPromise = null;
  }
}

export async function ensureEmbeddingsLoaded(): Promise<void> {
  if (embeddingsLoaded) return;
  if (!loadPromise) {
    loadPromise = loadEmbeddingsFromDatabase();
  }
  await loadPromise;
}

/**
 * Store embeddings for inventory items
 */
export async function setInventoryEmbeddings(embeddings: Map<string, number[]>): Promise<void> {
  embeddings.forEach((embedding, sku) => {
    inventoryEmbeddings.set(sku, embedding);
  });
  await persistEmbeddings('inventory', embeddings);
  embeddingsLoaded = true;
  console.log(`[Semantic Search] Loaded ${inventoryEmbeddings.size} inventory embeddings`);
}

/**
 * Store embeddings for BOMs
 */
export async function setBOMEmbeddings(embeddings: Map<string, number[]>): Promise<void> {
  embeddings.forEach((embedding, id) => {
    bomEmbeddings.set(id, embedding);
  });
  await persistEmbeddings('bom', embeddings);
  embeddingsLoaded = true;
  console.log(`[Semantic Search] Loaded ${bomEmbeddings.size} BOM embeddings`);
}

/**
 * Store embeddings for vendors
 */
export async function setVendorEmbeddings(embeddings: Map<string, number[]>): Promise<void> {
  embeddings.forEach((embedding, id) => {
    vendorEmbeddings.set(id, embedding);
  });
  await persistEmbeddings('vendor', embeddings);
  embeddingsLoaded = true;
  console.log(`[Semantic Search] Loaded ${vendorEmbeddings.size} vendor embeddings`);
}

/**
 * Search inventory items using semantic similarity
 * @param query User's search query
 * @param allItems All available inventory items
 * @param limit Maximum number of results to return
 * @param similarityThreshold Minimum similarity score (0-1)
 * @returns Most relevant inventory items sorted by similarity
 */
export async function searchInventory(
  query: string,
  allItems: InventoryItem[],
  limit: number = 20,
  similarityThreshold: number = 0.5
): Promise<InventoryItem[]> {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Calculate similarities
    const scored: Array<{ item: InventoryItem; similarity: number }> = [];

    for (const item of allItems) {
      const embedding = inventoryEmbeddings.get(item.sku);

      if (!embedding) {
        // Item doesn't have an embedding yet, skip it
        // In production, this would trigger background embedding generation
        continue;
      }

      const similarity = cosineSimilarity(queryEmbedding, embedding);

      if (similarity >= similarityThreshold) {
        scored.push({ item, similarity });
      }
    }

    // Sort by similarity (highest first) and return top N
    const results = scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(s => s.item);

    console.log(`[Semantic Search] Found ${results.length} inventory items for query: "${query}"`);

    return results;
  } catch (error) {
    console.error('[Semantic Search] Error searching inventory:', error);
    // Fallback to returning first N items if search fails
    return allItems.slice(0, limit);
  }
}

/**
 * Search BOMs using semantic similarity
 */
export async function searchBOMs(
  query: string,
  allBOMs: BillOfMaterials[],
  limit: number = 20,
  similarityThreshold: number = 0.5
): Promise<BillOfMaterials[]> {
  try {
    const queryEmbedding = await generateEmbedding(query);

    const scored: Array<{ bom: BillOfMaterials; similarity: number }> = [];

    for (const bom of allBOMs) {
      const embedding = bomEmbeddings.get(bom.id);

      if (!embedding) {
        continue;
      }

      const similarity = cosineSimilarity(queryEmbedding, embedding);

      if (similarity >= similarityThreshold) {
        scored.push({ bom, similarity });
      }
    }

    const results = scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(s => s.bom);

    console.log(`[Semantic Search] Found ${results.length} BOMs for query: "${query}"`);

    return results;
  } catch (error) {
    console.error('[Semantic Search] Error searching BOMs:', error);
    return allBOMs.slice(0, limit);
  }
}

/**
 * Search vendors using semantic similarity
 */
export async function searchVendors(
  query: string,
  allVendors: Vendor[],
  limit: number = 10,
  similarityThreshold: number = 0.5
): Promise<Vendor[]> {
  try {
    const queryEmbedding = await generateEmbedding(query);

    const scored: Array<{ vendor: Vendor; similarity: number }> = [];

    for (const vendor of allVendors) {
      const embedding = vendorEmbeddings.get(vendor.id);

      if (!embedding) {
        continue;
      }

      const similarity = cosineSimilarity(queryEmbedding, embedding);

      if (similarity >= similarityThreshold) {
        scored.push({ vendor, similarity });
      }
    }

    const results = scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(s => s.vendor);

    console.log(`[Semantic Search] Found ${results.length} vendors for query: "${query}"`);

    return results;
  } catch (error) {
    console.error('[Semantic Search] Error searching vendors:', error);
    return allVendors.slice(0, limit);
  }
}

/**
 * Generate and store embedding for a single inventory item
 * Used when new items are added
 */
export async function indexInventoryItem(item: InventoryItem): Promise<void> {
  try {
    const searchText = createInventorySearchText(item);
    const embedding = await generateEmbedding(searchText);
    inventoryEmbeddings.set(item.sku, embedding);
    console.log(`[Semantic Search] Indexed inventory item: ${item.sku}`);
  } catch (error) {
    console.error(`[Semantic Search] Failed to index item ${item.sku}:`, error);
  }
}

/**
 * Generate and store embedding for a single BOM
 */
export async function indexBOM(bom: BillOfMaterials): Promise<void> {
  try {
    const searchText = createBOMSearchText(bom);
    const embedding = await generateEmbedding(searchText);
    bomEmbeddings.set(bom.id, embedding);
    console.log(`[Semantic Search] Indexed BOM: ${bom.id}`);
  } catch (error) {
    console.error(`[Semantic Search] Failed to index BOM ${bom.id}:`, error);
  }
}

/**
 * Generate and store embedding for a single vendor
 */
export async function indexVendor(vendor: Vendor): Promise<void> {
  try {
    const searchText = createVendorSearchText(vendor);
    const embedding = await generateEmbedding(searchText);
    vendorEmbeddings.set(vendor.id, embedding);
    console.log(`[Semantic Search] Indexed vendor: ${vendor.id}`);
  } catch (error) {
    console.error(`[Semantic Search] Failed to index vendor ${vendor.id}:`, error);
  }
}

/**
 * Get embedding statistics
 */
export function getEmbeddingStats() {
  return {
    inventoryCount: inventoryEmbeddings.size,
    bomCount: bomEmbeddings.size,
    vendorCount: vendorEmbeddings.size,
    total: inventoryEmbeddings.size + bomEmbeddings.size + vendorEmbeddings.size,
  };
}

/**
 * Clear all embeddings (useful for testing/reset)
 */
export function clearAllEmbeddings(): void {
  inventoryEmbeddings.clear();
  bomEmbeddings.clear();
  vendorEmbeddings.clear();
  embeddingsLoaded = false;
  void supabase.from('semantic_embeddings').delete().neq('entity_type', ''); // delete all rows
  console.log('[Semantic Search] All embeddings cleared');
}
