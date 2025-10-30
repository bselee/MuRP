import type { IDataAdapter } from './BaseAdapter';
import { SupabaseAdapter } from './SupabaseAdapter';
import { CSVAdapter } from './CSVAdapter';

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
