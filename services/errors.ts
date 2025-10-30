export enum DataErrorCode {
  AUTH_FAILED = 'AUTH_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  RATE_LIMIT = 'RATE_LIMIT',
  TIMEOUT = 'TIMEOUT',
  INVALID_DATA = 'INVALID_DATA',
  ADAPTER_NOT_FOUND = 'ADAPTER_NOT_FOUND',
}

export class DataError extends Error {
  constructor(
    public code: DataErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'DataError';
  }
}
