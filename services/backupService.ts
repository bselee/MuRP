/**
 * Database Backup Service
 * 
 * Provides automatic backup and rollback functionality for data tables.
 * Prevents data loss during sync operations by creating snapshots before writes.
 */

import { supabase } from '../lib/supabase/client';

export interface BackupResult {
  backupTableName: string;
  rowsBackedUp: number;
  timestamp: Date;
}

export interface RollbackResult {
  rowsRestored: number;
  rowsDeleted: number;
  success: boolean;
}

export interface BackupInfo {
  backupTable: string;
  rowCount: number;
  createdAt: Date;
  triggeredBy: string | null;
}

class BackupService {
  /**
   * Create a backup of a table before making changes
   */
  async createBackup(
    tableName: string,
    suffix?: string,
    triggeredBy?: string
  ): Promise<BackupResult> {
    console.log(`[BackupService] Creating backup of ${tableName}...`);

    const { data, error } = await supabase.rpc('backup_table', {
      p_source_table: tableName,
      p_backup_suffix: suffix || null,
      p_triggered_by: triggeredBy || 'system',
    });

    if (error) {
      console.error('[BackupService] Backup failed:', error);
      throw new Error(`Backup failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      throw new Error('Backup function returned no data');
    }

    const result = data[0];
    console.log(`[BackupService] ✅ Backup created: ${result.backup_table_name} (${result.rows_backed_up} rows)`);

    return {
      backupTableName: result.backup_table_name,
      rowsBackedUp: result.rows_backed_up,
      timestamp: new Date(),
    };
  }

  /**
   * Restore data from a backup
   */
  async rollbackFromBackup(
    targetTable: string,
    backupTable: string
  ): Promise<RollbackResult> {
    console.log(`[BackupService] Rolling back ${targetTable} from ${backupTable}...`);

    const { data, error } = await supabase.rpc('rollback_from_backup', {
      p_target_table: targetTable,
      p_backup_table: backupTable,
    });

    if (error) {
      console.error('[BackupService] Rollback failed:', error);
      return {
        rowsRestored: 0,
        rowsDeleted: 0,
        success: false,
      };
    }

    if (!data || data.length === 0) {
      throw new Error('Rollback function returned no data');
    }

    const result = data[0];
    console.log(`[BackupService] ✅ Rollback complete: ${result.rows_restored} rows restored, ${result.rows_deleted} rows deleted`);

    return {
      rowsRestored: result.rows_restored,
      rowsDeleted: result.rows_deleted,
      success: true,
    };
  }

  /**
   * List all available backups for a table
   */
  async listBackups(tableName: string): Promise<BackupInfo[]> {
    const { data, error } = await supabase.rpc('list_backups', {
      p_source_table: tableName,
    });

    if (error) {
      console.error('[BackupService] Failed to list backups:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      backupTable: row.backup_table,
      rowCount: row.row_count,
      createdAt: new Date(row.created_at),
      triggeredBy: row.triggered_by,
    }));
  }

  /**
   * Get the most recent backup for a table
   */
  async getLatestBackup(tableName: string): Promise<BackupInfo | null> {
    const backups = await this.listBackups(tableName);
    return backups.length > 0 ? backups[0] : null;
  }

  /**
   * Clean up old backups (older than specified days)
   */
  async cleanupOldBackups(daysToKeep: number = 30): Promise<number> {
    console.log(`[BackupService] Cleaning up backups older than ${daysToKeep} days...`);

    const { data, error } = await supabase.rpc('cleanup_old_backups', {
      p_days_to_keep: daysToKeep,
    });

    if (error) {
      console.error('[BackupService] Cleanup failed:', error);
      return 0;
    }

    const deletedCount = data?.length || 0;
    console.log(`[BackupService] ✅ Cleaned up ${deletedCount} old backups`);

    return deletedCount;
  }
}

// Singleton instance
let backupServiceInstance: BackupService | null = null;

export function createBackupService(): BackupService {
  if (!backupServiceInstance) {
    backupServiceInstance = new BackupService();
  }
  return backupServiceInstance;
}

export type { BackupService };
