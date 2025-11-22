/**
 * useContext7 Hook
 * 
 * React hook for searching libraries and fetching documentation via Context7 MCP server
 */

import { useState, useCallback } from 'react';
import {
  resolveLibraryId,
  getLibraryDocs,
  getSearchHistory,
  clearCache,
  getCacheStats,
  type LibrarySearchResult,
  type LibraryDocumentation,
} from '../services/context7Service';

export interface UseContext7Result {
  // Search state
  searchResults: LibrarySearchResult[];
  isSearching: boolean;
  searchError: string | null;
  
  // Documentation state
  documentation: LibraryDocumentation | null;
  isFetchingDocs: boolean;
  docsError: string | null;
  
  // History
  searchHistory: string[];
  
  // Actions
  searchLibrary: (libraryName: string) => Promise<void>;
  fetchDocs: (libraryId: string, topic?: string, maxTokens?: number) => Promise<void>;
  clearDocumentation: () => void;
  clearSearchResults: () => void;
  refreshHistory: () => void;
  clearAllCache: () => void;
  
  // Stats
  cacheStats: {
    searchCount: number;
    docCount: number;
    historyCount: number;
    cacheSize: string;
  };
}

export function useContext7(): UseContext7Result {
  const [searchResults, setSearchResults] = useState<LibrarySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  const [documentation, setDocumentation] = useState<LibraryDocumentation | null>(null);
  const [isFetchingDocs, setIsFetchingDocs] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  
  const [searchHistory, setSearchHistory] = useState<string[]>(() => getSearchHistory());
  const [cacheStats, setCacheStats] = useState(() => getCacheStats());

  const searchLibrary = useCallback(async (libraryName: string) => {
    if (!libraryName.trim()) {
      setSearchError('Please enter a library name');
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const results = await resolveLibraryId(libraryName);
      setSearchResults(results);
      setSearchHistory(getSearchHistory());
      setCacheStats(getCacheStats());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to search library';
      setSearchError(message);
      console.error('[useContext7] Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const fetchDocs = useCallback(async (
    libraryId: string,
    topic?: string,
    maxTokens: number = 10000
  ) => {
    setIsFetchingDocs(true);
    setDocsError(null);
    setDocumentation(null);

    try {
      const docs = await getLibraryDocs(libraryId, topic, maxTokens);
      setDocumentation(docs);
      setCacheStats(getCacheStats());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch documentation';
      setDocsError(message);
      console.error('[useContext7] Fetch docs failed:', error);
    } finally {
      setIsFetchingDocs(false);
    }
  }, []);

  const clearDocumentation = useCallback(() => {
    setDocumentation(null);
    setDocsError(null);
  }, []);

  const clearSearchResults = useCallback(() => {
    setSearchResults([]);
    setSearchError(null);
  }, []);

  const refreshHistory = useCallback(() => {
    setSearchHistory(getSearchHistory());
    setCacheStats(getCacheStats());
  }, []);

  const clearAllCache = useCallback(() => {
    clearCache();
    setSearchHistory([]);
    setCacheStats(getCacheStats());
    clearDocumentation();
    clearSearchResults();
  }, [clearDocumentation, clearSearchResults]);

  return {
    searchResults,
    isSearching,
    searchError,
    documentation,
    isFetchingDocs,
    docsError,
    searchHistory,
    searchLibrary,
    fetchDocs,
    clearDocumentation,
    clearSearchResults,
    refreshHistory,
    clearAllCache,
    cacheStats,
  };
}
