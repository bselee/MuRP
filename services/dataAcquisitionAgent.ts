/**
 * Data Acquisition Agent
 *
 * Intelligent routing and orchestration for all data acquisition methods.
 * Provides a unified interface for Finale API, Google Sheets, CSV uploads, and manual entry.
 *
 * Features:
 * - Automatic source selection based on context
 * - Error recovery with fallback to alternative sources
 * - Consistent filtering across all sources
 * - User guidance and recommendations
 * - Health monitoring and diagnostics
 */

import { transformInventoryBatch, transformVendorsBatch, transformBOMsBatch } from '../lib/schema/transformers';
import { getFinaleSync Service } from './finaleSyncService';
import { getGoogleSheetsSyncService } from './googleSheetsSyncService';
import { supabase } from '../lib/supabase/client';

// ============================================================================
// Types
// ============================================================================

export type DataSource = 'finale_api' | 'google_sheets' | 'csv_upload' | 'manual_entry';
export type DataType = 'inventory' | 'vendors' | 'boms' | 'purchase_orders';
export type AcquisitionStrategy = 'auto' | 'primary_only' | 'fallback_enabled' | 'manual_select';

export interface AcquisitionContext {
  userId: string;
  dataType: DataType;
  strategy?: AcquisitionStrategy;
  preferredSource?: DataSource;
  filters?: FilterConfig;
  options?: AcquisitionOptions;
}

export interface FilterConfig {
  includeInactive?: boolean;
  includeDropship?: boolean;
  excludedCategories?: string[];
  includedCategories?: string[];
  allowedLocations?: string[];
  customRules?: FilterRule[];
}

export interface FilterRule {
  field: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'greaterThan' | 'lessThan';
  value: string | number;
  action: 'include' | 'exclude';
}

export interface AcquisitionOptions {
  createBackup?: boolean;
  validateBeforeImport?: boolean;
  dryRun?: boolean;
  batchSize?: number;
  retryOnFailure?: boolean;
}

export interface AcquisitionResult {
  success: boolean;
  source: DataSource;
  itemsImported: number;
  itemsFiltered: number;
  itemsFailed: number;
  filterBreakdown?: FilterBreakdown;
  errors: string[];
  warnings: string[];
  recommendations?: string[];
  duration: number;
  nextSource?: DataSource;
}

export interface FilterBreakdown {
  inactiveItems: number;
  dropshipItems: number;
  deprecatedCategories: number;
  missingData: number;
  customFilters: number;
  other: number;
}

export interface SourceHealthStatus {
  source: DataSource;
  available: boolean;
  configured: boolean;
  lastSuccess?: Date;
  errorRate: number;
  avgDuration: number;
  recommended: boolean;
  reason: string;
}

// ============================================================================
// Data Acquisition Agent Class
// ============================================================================

export class DataAcquisitionAgent {
  private finaleService = getFinaleSyncService();
  private googleSheetsService = getGoogleSheetsSyncService();

  /**
   * Main acquisition method - intelligently routes to best source
   */
  async acquire(context: AcquisitionContext): Promise<AcquisitionResult> {
    const startTime = Date.now();

    // Determine best source
    const source = await this.selectBestSource(context);

    console.log(`[DataAcquisitionAgent] Using source: ${source} for ${context.dataType}`);

    // Create backup if requested
    if (context.options?.createBackup) {
      await this.createBackup(context.dataType);
    }

    // Acquire data from selected source
    let result: AcquisitionResult;

    try {
      switch (source) {
        case 'finale_api':
          result = await this.acquireFromFinale(context);
          break;
        case 'google_sheets':
          result = await this.acquireFromGoogleSheets(context);
          break;
        case 'csv_upload':
          result = await this.acquireFromCSV(context);
          break;
        case 'manual_entry':
          throw new Error('Manual entry is handled directly in UI, not through agent');
        default:
          throw new Error(`Unknown source: ${source}`);
      }

      result.duration = Date.now() - startTime;

      // Add recommendations based on result
      result.recommendations = this.generateRecommendations(result, context);

      // If failed and fallback enabled, try next source
      if (!result.success && context.strategy === 'fallback_enabled') {
        console.warn(`[DataAcquisitionAgent] ${source} failed, trying fallback`);
        const fallbackSource = this.getNextFallbackSource(source, context);
        if (fallbackSource) {
          result.nextSource = fallbackSource;
          const fallbackContext = { ...context, preferredSource: fallbackSource };
          return this.acquire(fallbackContext);
        }
      }

      return result;

    } catch (error) {
      console.error(`[DataAcquisitionAgent] Acquisition failed:`, error);
      return {
        success: false,
        source,
        itemsImported: 0,
        itemsFiltered: 0,
        itemsFailed: 0,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: [],
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Select the best data source based on context and health status
   */
  async selectBestSource(context: AcquisitionContext): Promise<DataSource> {
    // If user specified preferred source, use it
    if (context.preferredSource) {
      return context.preferredSource;
    }

    // If manual select strategy, require user to choose
    if (context.strategy === 'manual_select') {
      throw new Error('Manual select strategy requires preferredSource to be specified');
    }

    // Get health status for all sources
    const healthStatuses = await this.getSourceHealthStatuses(context);

    // Sort by recommendation score
    const sortedSources = healthStatuses
      .filter(s => s.available)
      .sort((a, b) => {
        if (a.recommended === b.recommended) {
          return a.errorRate - b.errorRate; // Lower error rate wins
        }
        return a.recommended ? -1 : 1; // Recommended wins
      });

    if (sortedSources.length === 0) {
      throw new Error('No available data sources configured');
    }

    return sortedSources[0].source;
  }

  /**
   * Get health status for all data sources
   */
  async getSourceHealthStatuses(context: AcquisitionContext): Promise<SourceHealthStatus[]> {
    const statuses: SourceHealthStatus[] = [];

    // Finale API
    const finaleConfigured = await this.isFinaleConfigured();
    statuses.push({
      source: 'finale_api',
      available: finaleConfigured,
      configured: finaleConfigured,
      recommended: finaleConfigured && context.dataType !== 'manual_entry',
      errorRate: 0, // TODO: Calculate from audit logs
      avgDuration: 45000, // TODO: Calculate from audit logs
      reason: finaleConfigured
        ? 'Automatic real-time sync, best for production'
        : 'Finale API credentials not configured'
    });

    // Google Sheets
    const googleConfigured = await this.isGoogleSheetsConfigured();
    statuses.push({
      source: 'google_sheets',
      available: googleConfigured,
      configured: googleConfigured,
      recommended: googleConfigured && context.dataType === 'inventory',
      errorRate: 0, // TODO: Calculate from audit logs
      avgDuration: 15000, // TODO: Calculate from audit logs
      reason: googleConfigured
        ? 'Good for collaboration and manual edits'
        : 'Google OAuth not configured'
    });

    // CSV Upload
    statuses.push({
      source: 'csv_upload',
      available: true, // Always available
      configured: true,
      recommended: false, // Manual trigger only
      errorRate: 0,
      avgDuration: 5000,
      reason: 'Best for one-time imports or migrations'
    });

    return statuses;
  }

  /**
   * Get next fallback source if current source fails
   */
  getNextFallbackSource(currentSource: DataSource, context: AcquisitionContext): DataSource | null {
    // Fallback priority: finale_api → google_sheets → csv_upload
    const fallbackChain: DataSource[] = ['finale_api', 'google_sheets', 'csv_upload'];

    const currentIndex = fallbackChain.indexOf(currentSource);
    if (currentIndex === -1 || currentIndex === fallbackChain.length - 1) {
      return null; // No more fallbacks
    }

    return fallbackChain[currentIndex + 1];
  }

  /**
   * Acquire data from Finale API
   */
  private async acquireFromFinale(context: AcquisitionContext): Promise<AcquisitionResult> {
    const result: AcquisitionResult = {
      success: false,
      source: 'finale_api',
      itemsImported: 0,
      itemsFiltered: 0,
      itemsFailed: 0,
      errors: [],
      warnings: [],
      duration: 0
    };

    try {
      const syncResult = await this.finaleService.syncAll();

      result.success = syncResult.success;
      result.itemsImported = syncResult.totalImported || 0;
      result.itemsFiltered = syncResult.totalFiltered || 0;
      result.itemsFailed = syncResult.totalFailed || 0;
      result.errors = syncResult.errors || [];
      result.warnings = syncResult.warnings || [];
      result.filterBreakdown = syncResult.filterBreakdown;

    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Acquire data from Google Sheets
   */
  private async acquireFromGoogleSheets(context: AcquisitionContext): Promise<AcquisitionResult> {
    const result: AcquisitionResult = {
      success: false,
      source: 'google_sheets',
      itemsImported: 0,
      itemsFiltered: 0,
      itemsFailed: 0,
      errors: [],
      warnings: [],
      duration: 0
    };

    try {
      // TODO: Get spreadsheet URL from context or user config
      const spreadsheetUrl = context.options?.spreadsheetUrl || '';
      if (!spreadsheetUrl) {
        throw new Error('Spreadsheet URL required for Google Sheets import');
      }

      const importResult = await this.googleSheetsService.importInventory({
        spreadsheetId: this.extractSpreadsheetId(spreadsheetUrl),
        sheetName: context.options?.sheetName || 'Sheet1',
        mergeStrategy: context.options?.mergeStrategy || 'update_existing',
        skipFirstRow: true
      });

      result.success = importResult.success;
      result.itemsImported = importResult.itemsImported;
      result.itemsFailed = importResult.itemsSkipped;
      result.errors = importResult.errors;

    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Acquire data from CSV upload
   */
  private async acquireFromCSV(context: AcquisitionContext): Promise<AcquisitionResult> {
    const result: AcquisitionResult = {
      success: false,
      source: 'csv_upload',
      itemsImported: 0,
      itemsFiltered: 0,
      itemsFailed: 0,
      errors: [],
      warnings: [],
      duration: 0
    };

    try {
      // TODO: Implement CSV upload logic
      // For now, return error indicating not implemented
      throw new Error('CSV upload is not yet implemented. See DATA_ACQUISITION_ANALYSIS.md Phase 5');

    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Create backup before acquisition
   */
  private async createBackup(dataType: DataType): Promise<void> {
    console.log(`[DataAcquisitionAgent] Creating backup for ${dataType}`);

    const tableName = this.getTableName(dataType);

    const { error } = await supabase.rpc('backup_table', {
      p_table_name: tableName,
      p_backup_reason: 'pre-acquisition',
      p_backup_source: 'data-acquisition-agent'
    });

    if (error) {
      console.warn(`[DataAcquisitionAgent] Backup failed:`, error);
      throw new Error(`Backup failed: ${error.message}`);
    }
  }

  /**
   * Generate recommendations based on acquisition result
   */
  private generateRecommendations(result: AcquisitionResult, context: AcquisitionContext): string[] {
    const recommendations: string[] = [];

    // High filter rate
    if (result.itemsFiltered > result.itemsImported * 0.5) {
      recommendations.push(
        `⚠️ High filter rate (${result.itemsFiltered} filtered vs ${result.itemsImported} imported). ` +
        `Check if inactive/dropship items should be included. See DATA_FILTERING_GUIDE.md`
      );
    }

    // High failure rate
    if (result.itemsFailed > result.itemsImported * 0.1) {
      recommendations.push(
        `⚠️ High failure rate (${result.itemsFailed} failed vs ${result.itemsImported} imported). ` +
        `Review error messages and fix data quality issues.`
      );
    }

    // No items imported
    if (result.itemsImported === 0 && result.success) {
      recommendations.push(
        `ℹ️ No items imported. This could be normal if: ` +
        `1) All items were filtered, 2) No new data available, 3) Source is empty. ` +
        `Check source data and filter settings.`
      );
    }

    // Source-specific recommendations
    if (result.source === 'finale_api' && result.itemsImported < 100) {
      recommendations.push(
        `ℹ️ Low item count from Finale. Verify CSV report URLs haven't expired. ` +
        `Go to Finale → Reports → Re-export and update URLs in settings.`
      );
    }

    if (result.source === 'google_sheets' && result.itemsFiltered > 0) {
      recommendations.push(
        `ℹ️ Google Sheets import filtered ${result.itemsFiltered} items. ` +
        `Unlike Finale, Google Sheets doesn't auto-filter. Add status/dropship columns to your sheet.`
      );
    }

    return recommendations;
  }

  /**
   * Check if Finale is configured
   */
  private async isFinaleConfigured(): Promise<boolean> {
    // Check for Finale credentials in environment or user settings
    const hasCredentials = !!(
      process.env.FINALE_API_KEY &&
      process.env.FINALE_API_SECRET
    );

    if (!hasCredentials) {
      return false;
    }

    // Check if last sync was successful (within last 24 hours)
    const { data, error } = await supabase
      .from('sync_metadata')
      .select('last_sync_time, success')
      .eq('sync_type', 'finale')
      .order('last_sync_time', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return hasCredentials; // Configured but never synced
    }

    const lastSyncTime = new Date(data.last_sync_time);
    const hoursSinceSync = (Date.now() - lastSyncTime.getTime()) / (1000 * 60 * 60);

    return hasCredentials && data.success && hoursSinceSync < 24;
  }

  /**
   * Check if Google Sheets is configured
   */
  private async isGoogleSheetsConfigured(): Promise<boolean> {
    // Check for Google OAuth credentials
    const hasCredentials = !!(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET
    );

    if (!hasCredentials) {
      return false;
    }

    // Check if user has valid OAuth token
    const { data, error } = await supabase
      .from('user_oauth_tokens')
      .select('expires_at')
      .eq('provider', 'google')
      .single();

    if (error || !data) {
      return false;
    }

    const expiresAt = new Date(data.expires_at);
    return expiresAt > new Date();
  }

  /**
   * Get table name for data type
   */
  private getTableName(dataType: DataType): string {
    const tableMap: Record<DataType, string> = {
      inventory: 'inventory_items',
      vendors: 'vendors',
      boms: 'boms',
      purchase_orders: 'purchase_orders'
    };

    return tableMap[dataType];
  }

  /**
   * Extract spreadsheet ID from URL
   */
  private extractSpreadsheetId(url: string): string {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      throw new Error('Invalid Google Sheets URL');
    }
    return match[1];
  }

  /**
   * Provide user guidance on which source to use
   */
  async getUserGuidance(context: Partial<AcquisitionContext>): Promise<{
    recommendedSource: DataSource;
    reason: string;
    alternatives: Array<{ source: DataSource; reason: string }>;
  }> {
    const healthStatuses = await this.getSourceHealthStatuses({
      userId: context.userId || 'system',
      dataType: context.dataType || 'inventory'
    });

    const recommended = healthStatuses.find(s => s.recommended) || healthStatuses[0];
    const alternatives = healthStatuses
      .filter(s => s.source !== recommended.source && s.available)
      .map(s => ({ source: s.source, reason: s.reason }));

    return {
      recommendedSource: recommended.source,
      reason: recommended.reason,
      alternatives
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let agentInstance: DataAcquisitionAgent | null = null;

export function getDataAcquisitionAgent(): DataAcquisitionAgent {
  if (!agentInstance) {
    agentInstance = new DataAcquisitionAgent();
  }
  return agentInstance;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick acquire with auto-detection
 */
export async function acquireData(
  userId: string,
  dataType: DataType,
  options?: Partial<AcquisitionOptions>
): Promise<AcquisitionResult> {
  const agent = getDataAcquisitionAgent();
  return agent.acquire({
    userId,
    dataType,
    strategy: 'auto',
    options
  });
}

/**
 * Get user guidance on which source to use
 */
export async function getConnectionGuidance(
  userId: string,
  dataType: DataType
): Promise<{
  recommendedSource: DataSource;
  reason: string;
  alternatives: Array<{ source: DataSource; reason: string }>;
}> {
  const agent = getDataAcquisitionAgent();
  return agent.getUserGuidance({ userId, dataType });
}

/**
 * Check health of all data sources
 */
export async function checkDataSourceHealth(
  userId: string
): Promise<SourceHealthStatus[]> {
  const agent = getDataAcquisitionAgent();
  return agent.getSourceHealthStatuses({
    userId,
    dataType: 'inventory'
  });
}
