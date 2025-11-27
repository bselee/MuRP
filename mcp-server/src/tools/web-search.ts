/**
 * Web Search Tool
 * Searches for state regulations on official government websites
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  relevance_score: number;
}

export async function searchWebForRegulations(
  state: string,
  category: string,
  keywords: string[] = []
): Promise<{ results: SearchResult[]; search_queries: string[] }> {
  
  // Build search queries
  const stateNames: Record<string, string> = {
    'CA': 'California',
    'OR': 'Oregon',
    'WA': 'Washington',
    'CO': 'Colorado',
    'NY': 'New York',
    // Add more states as needed
  };

  const stateName = stateNames[state] || state;
  const baseKeywords = keywords.length > 0 ? keywords : getCategoryKeywords(category);
  
  const searchQueries = [
    `${stateName} department of agriculture ${category} regulations`,
    `${stateName} fertilizer registration requirements ${baseKeywords.join(' ')}`,
    `${stateName} ${category} compliance ${baseKeywords.join(' ')}`,
    `${state}.gov agriculture ${category}`,
  ];

  console.error(`Searching for: ${searchQueries[0]}`);

  // In production, you would use a real search API (Google Custom Search, Bing, etc.)
  // For now, we'll construct likely government URLs
  const likelyUrls = constructGovernmentUrls(state, stateName, category);

  const results: SearchResult[] = [];

  // Fetch and parse each URL
  for (const url of likelyUrls) {
    try {
      console.error(`Fetching: ${url}`);
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'MuRP-Compliance-Bot/1.0',
        },
        timeout: 10000,
      });

      const $ = cheerio.load(response.data);
      
      // Extract page title and relevant text
      const title = $('title').text() || $('h1').first().text() || 'Untitled';
      
      // Extract text content
      const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
      
      // Calculate relevance based on keyword matches
      const relevance = calculateRelevance(bodyText, [...baseKeywords, category, stateName]);
      
      // Create snippet from first 200 chars of relevant text
      const snippet = bodyText.substring(0, 300) + '...';

      results.push({
        url,
        title,
        snippet,
        relevance_score: relevance,
      });

    } catch (error: any) {
      console.error(`Failed to fetch ${url}: ${error.message}`);
      // Continue to next URL
    }
  }

  // Sort by relevance
  results.sort((a, b) => b.relevance_score - a.relevance_score);

  return {
    results: results.slice(0, 10), // Top 10 results
    search_queries: searchQueries,
  };
}

function getCategoryKeywords(category: string): string[] {
  const categoryKeywords: Record<string, string[]> = {
    'labeling': ['label', 'labeling', 'packaging', 'required information', 'product name'],
    'ingredients': ['ingredient', 'guaranteed analysis', 'composition', 'material', 'content'],
    'claims': ['claim', 'organic', 'natural', 'statement', 'advertising'],
    'registration': ['registration', 'license', 'permit', 'certificate', 'approval'],
    'packaging': ['package', 'container', 'bag', 'bottle', 'material'],
    'testing': ['test', 'analysis', 'laboratory', 'heavy metals', 'contaminants'],
  };

  return categoryKeywords[category] || [category];
}

function constructGovernmentUrls(state: string, stateName: string, category: string): string[] {
  // Construct likely government URLs based on state
  // This is a starting point - in production, you'd have a curated list
  
  const urls: string[] = [];

  const stateGovUrls: Record<string, string[]> = {
    'CA': [
      'https://www.cdfa.ca.gov/is/ffldrs/',
      'https://www.cdfa.ca.gov/plant/fertilizer/',
      'https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?lawCode=FAC&division=7',
    ],
    'OR': [
      'https://www.oregon.gov/oda/programs/pesticides-fertilizer/pages/fertilizer-home.aspx',
      'https://www.oregon.gov/oda/shared/documents/publications/fertilizer/fertilizerhandbook.pdf',
    ],
    'WA': [
      'https://agr.wa.gov/departments/pesticides-and-fertilizers/fertilizers',
      'https://apps.leg.wa.gov/wac/default.aspx?cite=16-200',
    ],
    'CO': [
      'https://ag.colorado.gov/plants/commercial-feed-fertilizer',
    ],
  };

  if (stateGovUrls[state]) {
    urls.push(...stateGovUrls[state]);
  }

  // Generic search patterns
  urls.push(
    `https://www.${state.toLowerCase()}.gov/agriculture`,
    `https://agriculture.${stateName.toLowerCase().replace(' ', '')}.gov`,
  );

  return urls;
}

function calculateRelevance(text: string, keywords: string[]): number {
  const lowerText = text.toLowerCase();
  let score = 0;

  for (const keyword of keywords) {
    const regex = new RegExp(keyword.toLowerCase(), 'g');
    const matches = lowerText.match(regex);
    if (matches) {
      score += matches.length;
    }
  }

  // Normalize to 0-1 range
  return Math.min(score / 20, 1.0);
}
