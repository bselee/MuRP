import type { IDataAdapter } from './BaseAdapter';
import { SupabaseAdapter } from './SupabaseAdapter';
import { CSVAdapter } from './CSVAdapter';
import { FinaleAdapter, type FinaleConfig } from './FinaleAdapter';
import { DataError, DataErrorCode } from '../errors';

export type PrimarySource = 'supabase' | 'finale' | 'csv';

export interface DataSourceConfig {
  primary: PrimarySource;
  fallback?: 'supabase';
  syncIntervalMinutes?: number;
  autoSync?: boolean;
  // Placeholders for Finale config; to be filled when integrating
  finaleApiKey?: string;
  finaleBaseUrl?: string;
  finaleAccountId?: string;
}

export function createAdapter(kind: PrimarySource): IDataAdapter {
  switch (kind) {
    case 'supabase':
      return new SupabaseAdapter();
    case 'csv':
      return new CSVAdapter();
    // case 'finale':
    //   return new FinaleAdapter(config);
    // case 'csv':
    //   return new CSVAdapter();
    default:
      return new SupabaseAdapter();
  }
}

export function createAdapterFromConfig(config: DataSourceConfig): IDataAdapter {
  switch (config.primary) {
    case 'finale': {
      if (!config.finaleApiKey || !config.finaleAccountId) {
        throw new DataError(DataErrorCode.INVALID_CONFIG, 'Finale API key and account id are required');
      }
      const finaleCfg: FinaleConfig = {
        apiKey: config.finaleApiKey,
        accountId: config.finaleAccountId,
        baseUrl: config.finaleBaseUrl || 'https://app.finaleinventory.com/api/v1',
      };
      return new FinaleAdapter(finaleCfg);
    }
    case 'csv':
      return new CSVAdapter();
    case 'supabase':
    default:
      return new SupabaseAdapter();
  }
}
