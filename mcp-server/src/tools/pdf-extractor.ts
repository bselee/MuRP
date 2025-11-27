/**
 * PDF Extraction Tool
 * Extracts regulation text from PDF documents
 */

import axios from 'axios';
import pdfParse from 'pdf-parse';

export async function extractRegulationFromPdf(
  url: string,
  state: string,
  category?: string
): Promise<any> {
  try {
    console.error(`Extracting from: ${url}`);

    // Check if it's a PDF
    if (url.toLowerCase().endsWith('.pdf')) {
      return await extractFromPdfUrl(url, state, category);
    } else {
      // For HTML pages, use cheerio (already in web-search)
      return await extractFromHtmlUrl(url, state, category);
    }
  } catch (error: any) {
    console.error(`Extraction error: ${error.message}`);
    return {
      success: false,
      error: error.message,
      url,
    };
  }
}

async function extractFromPdfUrl(
  url: string,
  state: string,
  category?: string
): Promise<any> {
  // Download PDF
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': 'MuRP-Compliance-Bot/1.0',
    },
    timeout: 30000,
  });

  // Parse PDF
  const data = await pdfParse(Buffer.from(response.data));

  // Extract text
  const fullText = data.text;

  // Find relevant sections (basic pattern matching)
  const sections = extractRelevantSections(fullText, category);

  return {
    success: true,
    url,
    state,
    category,
    total_pages: data.numpages,
    extracted_text: fullText,
    relevant_sections: sections,
    metadata: data.info,
  };
}

async function extractFromHtmlUrl(
  url: string,
  state: string,
  category?: string
): Promise<any> {
  const axios = (await import('axios')).default;
  const cheerio = await import('cheerio');

  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'MuRP-Compliance-Bot/1.0',
    },
    timeout: 10000,
  });

  const $ = cheerio.load(response.data);

  // Remove script and style elements
  $('script, style').remove();

  // Extract main content
  const mainContent = $('main, article, .content, #content').text() || $('body').text();

  // Clean up whitespace
  const cleanText = mainContent.replace(/\s+/g, ' ').trim();

  // Find relevant sections
  const sections = extractRelevantSections(cleanText, category);

  return {
    success: true,
    url,
    state,
    category,
    extracted_text: cleanText,
    relevant_sections: sections,
    page_title: $('title').text(),
  };
}

function extractRelevantSections(text: string, category?: string): any[] {
  const sections: any[] = [];

  // Split into paragraphs
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 50);

  // Look for section headers and regulation codes
  const sectionPatterns = [
    /(?:Section|§)\s+\d+[\d.]*[\d]*/g,
    /(?:Chapter|Article)\s+\d+/g,
    /(?:Title)\s+\d+/g,
  ];

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];

    // Check if this paragraph contains a section reference
    let hasSectionRef = false;
    let sectionCode = '';

    for (const pattern of sectionPatterns) {
      const match = para.match(pattern);
      if (match) {
        hasSectionRef = true;
        sectionCode = match[0];
        break;
      }
    }

    // Check if relevant to category
    const isRelevant = category 
      ? para.toLowerCase().includes(category.toLowerCase())
      : true;

    if (hasSectionRef && isRelevant) {
      sections.push({
        section_code: sectionCode,
        text: para.substring(0, 500), // First 500 chars
        position: i,
        relevance: isRelevant ? 'high' : 'medium',
      });
    }
  }

  return sections.slice(0, 10); // Top 10 relevant sections
}
