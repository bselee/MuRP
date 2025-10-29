/**
 * Data Connector Types
 * Defines interfaces for external data source connectors
 */

// =============================================================================
// CONNECTOR INTERFACE
// =============================================================================

export interface DataConnector {
  /** Unique identifier for this connector type */
  readonly source: string;
  
  /** Whether this connector supports real-time updates */
  readonly supportsRealtime: boolean;
  
  /** Authenticate with the external API */
  authenticate(credentials: ConnectorCredentials): Promise<boolean>;
  
  /** Fetch inventory items from external source */
  fetchInventory(): Promise<ExternalInventoryItem[]>;
  
  /** Fetch vendors from external source */
  fetchVendors(): Promise<ExternalVendor[]>;
  
  /** Fetch purchase orders from external source */
  fetchPurchaseOrders(): Promise<ExternalPurchaseOrder[]>;
  
  /** Get rate limit information */
  getRateLimits(): RateLimitInfo;
  
  /** Check if within rate limits */
  isWithinRateLimits(): boolean;
}

// =============================================================================
// CONNECTOR CREDENTIALS
// =============================================================================

export type ConnectorCredentials = 
  | FinaleCredentials
  | QuickBooksCredentials
  | CsvApiCredentials
  | JsonApiCredentials
  | CustomWebhookCredentials;

export interface FinaleCredentials {
  type: 'finale_inventory';
  apiKey: string;
  apiSecret: string;
  baseUrl?: string; // Optional for testing/sandbox
}

export interface QuickBooksCredentials {
  type: 'quickbooks';
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  realmId: string;
}

export interface CsvApiCredentials {
  type: 'csv_api';
  url: string;
  authType: 'none' | 'bearer' | 'basic' | 'api_key';
  authToken?: string;
  apiKey?: string;
}

export interface JsonApiCredentials {
  type: 'json_api';
  url: string;
  authType: 'none' | 'bearer' | 'basic' | 'api_key';
  authToken?: string;
  apiKey?: string;
}

export interface CustomWebhookCredentials {
  type: 'custom_webhook';
  webhookUrl: string;
  secret: string;
}

// =============================================================================
// EXTERNAL DATA MODELS (Pre-transformation)
// =============================================================================

export interface ExternalInventoryItem {
  externalId: string;
  sku?: string;
  name: string;
  description?: string;
  quantityOnHand: number;
  reorderPoint?: number;
  unitCost?: number;
  preferredVendorExternalId?: string;
  category?: string;
  metadata?: Record<string, any>;
}

export interface ExternalVendor {
  externalId: string;
  name: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  leadTimeDays?: number;
  metadata?: Record<string, any>;
}

export interface ExternalPurchaseOrder {
  externalId: string;
  vendorExternalId: string;
  orderNumber: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  status: string;
  lineItems: ExternalPOLineItem[];
  totalAmount?: number;
  metadata?: Record<string, any>;
}

export interface ExternalPOLineItem {
  inventoryExternalId: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

// =============================================================================
// RATE LIMITING
// =============================================================================

export interface RateLimitInfo {
  requestsPerMinute: number;
  requestsPerHour: number;
  currentMinute: number;
  currentHour: number;
  lastRequestAt: Date | null;
}

// =============================================================================
// CONNECTOR RESULT
// =============================================================================

export interface ConnectorResult<T> {
  success: boolean;
  data?: T;
  error?: ConnectorError;
  cached?: boolean;
  fromCache?: boolean;
}

export interface ConnectorError {
  code: ConnectorErrorCode;
  message: string;
  retryable: boolean;
  details?: any;
}

export type ConnectorErrorCode =
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'DATA_ERROR'
  | 'MAPPING_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN';

// =============================================================================
// FIELD MAPPING
// =============================================================================

export interface FieldMapping {
  inventory?: Record<string, string>;
  vendors?: Record<string, string>;
  purchaseOrders?: Record<string, string>;
}

export interface MappingContext {
  sourceType: string;
  mapping: FieldMapping;
  defaultValues?: Record<string, any>;
}

// =============================================================================
// SYNC CONFIGURATION
// =============================================================================

export interface SyncConfig {
  sourceId: string;
  sourceType: string;
  credentials: ConnectorCredentials;
  fieldMapping: FieldMapping;
  syncFrequency: 'realtime' | 'every_15_minutes' | 'hourly' | 'daily' | 'manual';
  enabled: boolean;
}

// =============================================================================
// CONNECTOR FACTORY
// =============================================================================

export interface ConnectorFactory {
  createConnector(config: SyncConfig): DataConnector;
  getSupportedTypes(): string[];
}

// =============================================================================
// CACHE ENTRY
// =============================================================================

export interface CacheEntry<T> {
  data: T;
  cachedAt: Date;
  expiresAt: Date;
  sourceId: string;
}
