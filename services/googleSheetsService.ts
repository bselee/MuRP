/**
 * Google Sheets Service
 *
 * Provides read/write access to Google Sheets
 * Handles data transformation between Sheets and database
 */

import { getGoogleAuthService } from './googleAuthService';
import type { InventoryItem, Vendor, BillOfMaterials } from '../types';

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
  private _authService: ReturnType<typeof getGoogleAuthService> | null = null;

  private get authService() {
    if (!this._authService) {
      this._authService = getGoogleAuthService();
    }
    return this._authService;
  }

  /**
   * Read data from a Google Sheet
   */
  async readSheet(
    spreadsheetId: string,
    range: string
  ): Promise<any[][]> {
    try {
      const data = await this.sheetsRequest<{ values?: any[][] }>(
        `spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
      );

      return data.values || [];
    } catch (error) {
      console.error('[GoogleSheetsService] Error reading sheet:', error);
      throw new Error(`Failed to read sheet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Write data to a Google Sheet
   */
  async writeSheet(
    spreadsheetId: string,
    range: string,
    values: any[][],
    options?: {
      valueInputOption?: 'RAW' | 'USER_ENTERED';
      clearExisting?: boolean;
    }
  ): Promise<void> {
    try {
      // Clear existing data if requested
      if (options?.clearExisting) {
        await this.sheetsRequest(
          `spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
          {
            method: 'POST',
            body: JSON.stringify({}),
          }
        );
      }

      const valueInputOption = options?.valueInputOption || 'USER_ENTERED';

      await this.sheetsRequest(
        `spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=${valueInputOption}`,
        {
          method: 'PUT',
          body: JSON.stringify({ values }),
        }
      );

      console.log(`[GoogleSheetsService] Successfully wrote ${values.length} rows to ${range}`);
    } catch (error) {
      console.error('[GoogleSheetsService] Error writing sheet:', error);
      throw new Error(`Failed to write sheet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Append data to a Google Sheet
   */
  async appendSheet(
    spreadsheetId: string,
    range: string,
    values: any[][],
    options?: {
      valueInputOption?: 'RAW' | 'USER_ENTERED';
    }
  ): Promise<void> {
    try {
      const params = new URLSearchParams({
        valueInputOption: options?.valueInputOption || 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
      });

      await this.sheetsRequest(
        `spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?${params.toString()}`,
        {
          method: 'POST',
          body: JSON.stringify({ values }),
        }
      );

      console.log(`[GoogleSheetsService] Successfully appended ${values.length} rows to ${range}`);
    } catch (error) {
      console.error('[GoogleSheetsService] Error appending to sheet:', error);
      throw new Error(`Failed to append to sheet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get spreadsheet metadata
   */
  async getSpreadsheetInfo(spreadsheetId: string): Promise<SpreadsheetInfo> {
    try {
      const spreadsheet = await this.sheetsRequest<any>(`spreadsheets/${spreadsheetId}`);

      return {
        spreadsheetId: spreadsheet.spreadsheetId!,
        title: spreadsheet.properties?.title || 'Untitled',
        sheets: (spreadsheet.sheets || []).map(sheet => ({
          sheetId: sheet.properties?.sheetId || 0,
          title: sheet.properties?.title || 'Sheet1',
          index: sheet.properties?.index || 0,
          rowCount: sheet.properties?.gridProperties?.rowCount || 0,
          columnCount: sheet.properties?.gridProperties?.columnCount || 0,
        })),
      };
    } catch (error) {
      console.error('[GoogleSheetsService] Error getting spreadsheet info:', error);
      throw new Error(`Failed to get spreadsheet info: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a new spreadsheet
   */
  async createSpreadsheet(
    title: string,
    sheetTitles: string[] = ['Sheet1']
  ): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
    try {
      const response = await this.sheetsRequest<any>('spreadsheets', {
        method: 'POST',
        body: JSON.stringify({
          properties: { title },
          sheets: sheetTitles.map((sheetTitle, index) => ({
            properties: { title: sheetTitle, index },
          })),
        }),
      });

      const spreadsheetId = response.spreadsheetId as string;
      const spreadsheetUrl = response.spreadsheetUrl as string;

      console.log(`[GoogleSheetsService] Created spreadsheet: ${title} (${spreadsheetId})`);

      return { spreadsheetId, spreadsheetUrl };
    } catch (error) {
      console.error('[GoogleSheetsService] Error creating spreadsheet:', error);
      throw new Error(`Failed to create spreadsheet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a new sheet in existing spreadsheet
   */
  async createSheet(
    spreadsheetId: string,
    sheetTitle: string
  ): Promise<number> {
    try {
      const response = await this.batchUpdate(spreadsheetId, [{
        addSheet: {
          properties: {
            title: sheetTitle,
          },
        },
      }]);

      const sheetId = response.replies?.[0]?.addSheet?.properties?.sheetId || 0;

      console.log(`[GoogleSheetsService] Created sheet: ${sheetTitle} (${sheetId})`);

      return sheetId;
    } catch (error) {
      console.error('[GoogleSheetsService] Error creating sheet:', error);
      throw new Error(`Failed to create sheet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Format sheet with headers
   */
  async formatHeaders(
    spreadsheetId: string,
    sheetId: number,
    options?: {
      bold?: boolean;
      backgroundColor?: { red: number; green: number; blue: number };
      freeze?: boolean;
    }
  ): Promise<void> {
    try {
      const requests: any[] = [];

      // Bold headers
      if (options?.bold !== false) {
        requests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
            },
            cell: {
              userEnteredFormat: {
                textFormat: {
                  bold: true,
                },
              },
            },
            fields: 'userEnteredFormat.textFormat.bold',
          },
        });
      }

      // Background color
      if (options?.backgroundColor) {
        requests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: options.backgroundColor,
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        });
      }

      // Freeze header row
      if (options?.freeze !== false) {
        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: {
                frozenRowCount: 1,
              },
            },
            fields: 'gridProperties.frozenRowCount',
          },
        });
      }

      if (requests.length > 0) {
        await this.batchUpdate(spreadsheetId, requests);
      }

      console.log(`[GoogleSheetsService] Formatted headers for sheet ${sheetId}`);
    } catch (error) {
      console.error('[GoogleSheetsService] Error formatting headers:', error);
      throw new Error(`Failed to format headers: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Parse spreadsheet ID from URL
   */
  parseSpreadsheetId(url: string): string | null {
    // Handle full URLs: https://docs.google.com/spreadsheets/d/{id}/edit#gid=0
    const urlMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (urlMatch) {
      return urlMatch[1];
    }

    // Handle direct IDs
    if (/^[a-zA-Z0-9-_]+$/.test(url)) {
      return url;
    }

    return null;
  }

  /**
   * Parse sheet name from URL
   */
  parseSheetName(url: string): string | null {
    const gidMatch = url.match(/[#&]gid=(\d+)/);
    if (gidMatch) {
      // TODO: Convert gid to sheet name by fetching spreadsheet metadata
      return null;
    }

    return null;
  }

  /**
   * Auto-resize columns
   */
  async autoResizeColumns(
    spreadsheetId: string,
    sheetId: number,
    startColumn: number = 0,
    endColumn?: number
  ): Promise<void> {
    try {
      await this.batchUpdate(spreadsheetId, [{
        autoResizeDimensions: {
          dimensions: {
            sheetId,
            dimension: 'COLUMNS',
            startIndex: startColumn,
            endIndex: endColumn,
          },
        },
      }]);

      console.log(`[GoogleSheetsService] Auto-resized columns for sheet ${sheetId}`);
    } catch (error) {
      console.error('[GoogleSheetsService] Error auto-resizing columns:', error);
      throw new Error(`Failed to auto-resize columns: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async sheetsRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const accessToken = await this.authService.getAccessToken();

    const response = await fetch(`https://sheets.googleapis.com/v4/${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(init.headers || {}),
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google Sheets API error (${response.status}): ${text}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  private async batchUpdate(spreadsheetId: string, requests: any[]) {
    return this.sheetsRequest<{ replies?: any[] }>(
      `spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        body: JSON.stringify({ requests }),
      }
    );
  }
}

// Singleton instance
let googleSheetsServiceInstance: GoogleSheetsService | null = null;

export function getGoogleSheetsService(): GoogleSheetsService {
  if (!googleSheetsServiceInstance) {
    googleSheetsServiceInstance = new GoogleSheetsService();
  }
  return googleSheetsServiceInstance;
}
