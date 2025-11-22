/**
 * Context7 Service
 * 
 * Interacts with Context7 MCP server for fetching library documentation.
 * Provides persistent caching and search history.
 */

import { callContext7ResolveLibrary, callContext7GetDocs } from '../lib/mcpClient';

export interface LibrarySearchResult {
  id: string;
  name: string;
  description: string;
  trustScore: number;
  codeSnippetCount: number;
  version?: string;
}

export interface LibraryDocumentation {
  libraryId: string;
  content: string;
  topic?: string;
  fetchedAt: string;
  tokens?: number;
}

export interface Context7Cache {
  searches: Record<string, LibrarySearchResult[]>;
  documentation: Record<string, LibraryDocumentation>;
  searchHistory: string[];
}

const CACHE_KEY = 'context7_cache';
const MAX_HISTORY = 20;
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Get cache from localStorage
 */
function getCache(): Context7Cache {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) {
      return { searches: {}, documentation: {}, searchHistory: [] };
    }
    return JSON.parse(cached);
  } catch (error) {
    console.error('[Context7] Failed to load cache:', error);
    return { searches: {}, documentation: {}, searchHistory: [] };
  }
}

/**
 * Save cache to localStorage
 */
function saveCache(cache: Context7Cache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('[Context7] Failed to save cache:', error);
  }
}

/**
 * Add search to history
 */
function addToHistory(libraryName: string): void {
  const cache = getCache();
  const history = cache.searchHistory.filter(h => h !== libraryName);
  history.unshift(libraryName);
  cache.searchHistory = history.slice(0, MAX_HISTORY);
  saveCache(cache);
}

/**
 * Check if cached data is still valid
 */
function isCacheValid(fetchedAt: string): boolean {
  const fetchTime = new Date(fetchedAt).getTime();
  return Date.now() - fetchTime < CACHE_DURATION_MS;
}

/**
 * Resolve library name to Context7 ID
 * 
 * Calls the MCP tool: mcp_context7_resolve-library-id
 */
export async function resolveLibraryId(libraryName: string): Promise<LibrarySearchResult[]> {
  // Check cache first
  const cache = getCache();
  const cacheKey = libraryName.toLowerCase();
  
  if (cache.searches[cacheKey]) {
    const cached = cache.searches[cacheKey];
    console.log(`[Context7] Using cached search results for "${libraryName}"`);
    return cached;
  }

  try {
    console.log(`[Context7] Searching for library via MCP: "${libraryName}"`);
    
    // Call the actual MCP server
    const result = await callContext7ResolveLibrary(libraryName);
    
    // Transform MCP response to our format
    const results: LibrarySearchResult[] = Array.isArray(result) ? result.map((lib: any) => ({
      id: lib.id || lib.libraryId || `/${libraryName}`,
      name: lib.name || libraryName,
      description: lib.description || '',
      trustScore: lib.trustScore || lib.trust_score || 0,
      codeSnippetCount: lib.codeSnippetCount || lib.code_snippet_count || 0,
      version: lib.version,
    })) : [{
      id: result.id || result.libraryId || `/${libraryName}`,
      name: result.name || libraryName,
      description: result.description || '',
      trustScore: result.trustScore || result.trust_score || 0,
      codeSnippetCount: result.codeSnippetCount || result.code_snippet_count || 0,
      version: result.version,
    }];

    // Cache the results
    cache.searches[cacheKey] = results;
    saveCache(cache);
    addToHistory(libraryName);

    return results;
  } catch (error) {
    console.error('[Context7] Failed to resolve library:', error);
    
    // Return mock data as fallback
    console.warn('[Context7] Falling back to mock data');
    const fallbackResults: LibrarySearchResult[] = [
      {
        id: `/${libraryName}`,
        name: libraryName,
        description: `Documentation for ${libraryName} (MCP server unavailable)`,
        trustScore: 0,
        codeSnippetCount: 0,
      }
    ];
    
    return fallbackResults;
  }
}

/**
 * Fetch library documentation
 * 
 * Calls the MCP tool: mcp_context7_get-library-docs
 */
export async function getLibraryDocs(
  libraryId: string,
  topic?: string,
  maxTokens: number = 10000
): Promise<LibraryDocumentation> {
  // Check cache first
  const cache = getCache();
  const cacheKey = `${libraryId}${topic ? `:${topic}` : ''}`;
  
  if (cache.documentation[cacheKey]) {
    const cached = cache.documentation[cacheKey];
    if (isCacheValid(cached.fetchedAt)) {
      console.log(`[Context7] Using cached docs for "${libraryId}"${topic ? ` (${topic})` : ''}`);
      return cached;
    }
  }

  try {
    console.log(`[Context7] Fetching docs via MCP: "${libraryId}"${topic ? ` (${topic})` : ''}`);
    
    // Call the actual MCP server
    const result = await callContext7GetDocs(libraryId, topic, maxTokens);
    
    // Transform MCP response to our format
    const docs: LibraryDocumentation = {
      libraryId,
      topic,
      content: result.content || result.documentation || result.docs || 'No documentation available',
      fetchedAt: new Date().toISOString(),
      tokens: result.tokens || result.tokenCount || 0,
    };

    // Cache the documentation
    cache.documentation[cacheKey] = docs;
    saveCache(cache);

    return docs;
  } catch (error) {
    console.error('[Context7] Failed to fetch documentation:', error);
    
    // Return mock data as fallback
    console.warn('[Context7] Falling back to mock documentation');
    const fallbackDocs: LibraryDocumentation = {
      libraryId,
      topic,
      content: `# ${libraryId} Documentation\n\n` +
               `${topic ? `## ${topic}\n\n` : ''}` +
               `⚠️ **MCP Server Unavailable**\n\n` +
               `The Context7 MCP server is not responding. This may be due to:\n` +
               `- Server not running\n` +
               `- Network connectivity issues\n` +
               `- Missing API key\n\n` +
               `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
               `Once the MCP server is available, real documentation will be fetched automatically.`,
      fetchedAt: new Date().toISOString(),
      tokens: 100,
    };
    
    return fallbackDocs;
  }
}

/**
 * Get search history
 */
export function getSearchHistory(): string[] {
  const cache = getCache();
  return cache.searchHistory;
}

/**
 * Clear cache
 */
export function clearCache(): void {
  localStorage.removeItem(CACHE_KEY);
  console.log('[Context7] Cache cleared');
}

/**
 * Get cache stats
 */
export function getCacheStats(): {
  searchCount: number;
  docCount: number;
  historyCount: number;
  cacheSize: string;
} {
  const cache = getCache();
  const cacheString = JSON.stringify(cache);
  const sizeKB = (new Blob([cacheString]).size / 1024).toFixed(2);
  
  return {
    searchCount: Object.keys(cache.searches).length,
    docCount: Object.keys(cache.documentation).length,
    historyCount: cache.searchHistory.length,
    cacheSize: `${sizeKB} KB`,
  };
}
