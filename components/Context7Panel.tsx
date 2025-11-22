/**
 * Context7 Documentation Panel
 * 
 * Search and view library documentation via Context7 MCP server
 */

import React, { useState } from 'react';
import { useContext7 } from '../hooks/useContext7';
import { BookOpen, Search, History, Trash2, FileText, ExternalLink, Loader } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export function Context7Panel() {
  const {
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
    clearAllCache,
    cacheStats,
  } = useContext7();

  const [searchInput, setSearchInput] = useState('');
  const [selectedLibrary, setSelectedLibrary] = useState<string | null>(null);
  const [topicInput, setTopicInput] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await searchLibrary(searchInput);
  };

  const handleFetchDocs = async (libraryId: string, libraryName: string) => {
    setSelectedLibrary(libraryName);
    await fetchDocs(libraryId, topicInput || undefined);
  };

  const handleHistoryClick = (libraryName: string) => {
    setSearchInput(libraryName);
    searchLibrary(libraryName);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-blue-500" />
          <h2 className="text-2xl font-bold text-gray-900">Library Documentation</h2>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>Cache: {cacheStats.cacheSize}</span>
          <span>{cacheStats.docCount} docs</span>
          <button
            onClick={clearAllCache}
            className="text-red-600 hover:text-red-700 flex items-center gap-1"
            title="Clear all cache"
          >
            <Trash2 className="w-4 h-4" />
            Clear Cache
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <strong>Context7 Integration:</strong> Search for any library to fetch up-to-date documentation.
          Results are cached for 7 days for faster access.
        </p>
      </div>

      {/* Search Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <form onSubmit={handleSearch} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search Library
            </label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Enter library name (e.g., react, next.js, supabase)"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching || !searchInput.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSearching ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Search
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Optional Topic Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Topic (Optional)
            </label>
            <input
              type="text"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              placeholder="e.g., hooks, routing, authentication"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </form>

        {searchError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {searchError}
          </div>
        )}
      </div>

      {/* Search History */}
      {searchHistory.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <History className="w-5 h-5" />
            Recent Searches
          </h3>
          <div className="flex flex-wrap gap-2">
            {searchHistory.map((lib) => (
              <button
                key={lib}
                onClick={() => handleHistoryClick(lib)}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-sm transition-colors"
              >
                {lib}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Search Results ({searchResults.length})
            </h3>
            <button
              onClick={clearSearchResults}
              className="text-sm text-gray-600 hover:text-gray-700"
            >
              Clear
            </button>
          </div>
          <div className="space-y-3">
            {searchResults.map((result) => (
              <div
                key={result.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">{result.name}</h4>
                    {result.version && (
                      <span className="text-sm text-gray-500">v{result.version}</span>
                    )}
                    <p className="text-sm text-gray-600 mt-1">{result.description}</p>
                    <div className="flex gap-4 mt-2 text-xs text-gray-500">
                      <span>Trust Score: {result.trustScore}/10</span>
                      <span>{result.codeSnippetCount} code examples</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleFetchDocs(result.id, result.name)}
                    disabled={isFetchingDocs}
                    className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 text-sm flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    View Docs
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documentation Display */}
      {documentation && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {selectedLibrary} Documentation
              {documentation.topic && <span className="text-gray-500">- {documentation.topic}</span>}
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                {documentation.tokens} tokens • Fetched {new Date(documentation.fetchedAt).toLocaleDateString()}
              </span>
              <button
                onClick={clearDocumentation}
                className="text-sm text-gray-600 hover:text-gray-700"
              >
                Close
              </button>
            </div>
          </div>
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown>{documentation.content}</ReactMarkdown>
          </div>
        </div>
      )}

      {docsError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {docsError}
        </div>
      )}

      {isFetchingDocs && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <Loader className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Fetching documentation...</p>
        </div>
      )}

      {/* Help Section */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">How to Use</h3>
        <ul className="space-y-2 text-sm text-gray-700">
          <li>• <strong>Search:</strong> Enter a library name (e.g., "react", "supabase", "tailwindcss")</li>
          <li>• <strong>Topic:</strong> Optionally specify a topic to focus documentation (e.g., "hooks", "authentication")</li>
          <li>• <strong>Cache:</strong> Results are automatically cached for 7 days for faster access</li>
          <li>• <strong>History:</strong> Click recent searches to quickly re-fetch documentation</li>
        </ul>
      </div>
    </div>
  );
}
