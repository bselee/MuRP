/**
 * Connector Registry
 * Factory pattern for creating data connector instances
 */

import type { DataConnector, ConnectorFactory, SyncConfig } from './types';
import { FinaleConnector } from './finale';

// Registry of available connectors
const CONNECTOR_MAP: Record<string, new () => DataConnector> = {
  'finale_inventory': FinaleConnector,
  // Future connectors:
  // 'quickbooks': QuickBooksConnector,
  // 'csv_api': CsvApiConnector,
  // 'json_api': JsonApiConnector,
};

export class ConnectorRegistry implements ConnectorFactory {
  /**
   * Create a connector instance based on sync configuration
   */
  createConnector(config: SyncConfig): DataConnector {
    const ConnectorClass = CONNECTOR_MAP[config.sourceType];

    if (!ConnectorClass) {
      throw new Error(`Unsupported connector type: ${config.sourceType}`);
    }

    const connector = new ConnectorClass();
    
    return connector;
  }

  /**
   * Get list of supported connector types
   */
  getSupportedTypes(): string[] {
    return Object.keys(CONNECTOR_MAP);
  }

  /**
   * Check if a connector type is supported
   */
  isSupported(sourceType: string): boolean {
    return sourceType in CONNECTOR_MAP;
  }

  /**
   * Register a new connector type (for extensibility)
   */
  register(sourceType: string, connectorClass: new () => DataConnector): void {
    if (this.isSupported(sourceType)) {
      console.warn(`Connector type '${sourceType}' is already registered. Overwriting...`);
    }
    CONNECTOR_MAP[sourceType] = connectorClass;
  }
}

// Export singleton instance
export const connectorRegistry = new ConnectorRegistry();

// Export convenience function
export function createConnector(config: SyncConfig): DataConnector {
  return connectorRegistry.createConnector(config);
}

// Export supported types
export function getSupportedConnectorTypes(): string[] {
  return connectorRegistry.getSupportedTypes();
}
