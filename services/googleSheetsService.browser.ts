/**
 * Browser-safe Google Sheets Service
 * 
 * Stub implementation that directs all calls to Supabase Edge Functions
 * This prevents googleapis from being bundled in the browser build
 */

export interface SheetData {
  range: string;
  values: any[][];
}

export interface SpreadsheetInfo {
  spreadsheetId: string;
  title: string;
  sheets: SheetInfo[];
}

export interface SheetInfo {
  sheetId: number;
  title: string;
  index: number;
  rowCount: number;
  columnCount: number;
}

export class GoogleSheetsService {
  async readSheet(): Promise<any[][]> {
    throw new Error('Google Sheets operations should use Supabase Edge Functions in production');
  }

  async writeSheet(): Promise<void> {
    throw new Error('Google Sheets operations should use Supabase Edge Functions in production');
  }

  async appendToSheet(): Promise<void> {
    throw new Error('Google Sheets operations should use Supabase Edge Functions in production');
  }

  async createSpreadsheet(): Promise<SpreadsheetInfo> {
    throw new Error('Google Sheets operations should use Supabase Edge Functions in production');
  }

  async getSpreadsheetInfo(): Promise<SpreadsheetInfo> {
    throw new Error('Google Sheets operations should use Supabase Edge Functions in production');
  }

  parseSpreadsheetId(url: string): string {
    // This function is safe to keep as it's just string parsing
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      throw new Error('Invalid Google Sheets URL');
    }
    return match[1];
  }

  async exportInventoryToSheets(): Promise<string> {
    throw new Error('Google Sheets operations should use Supabase Edge Functions in production');
  }

  async importInventoryFromSheets(): Promise<any[]> {
    throw new Error('Google Sheets operations should use Supabase Edge Functions in production');
  }
}

let instance: GoogleSheetsService | null = null;

export function getGoogleSheetsService(): GoogleSheetsService {
  if (!instance) {
    instance = new GoogleSheetsService();
  }
  return instance;
}
