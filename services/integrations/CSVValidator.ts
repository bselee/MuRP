export type ValidationSeverity = 'error' | 'warning';

export interface ValidationError {
  row: number; // 1-based, includes header offset in display
  field: string;
  message: string;
  severity: ValidationSeverity;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  summary: {
    totalRows: number;
    validRows: number;
    errorRows: number;
  };
}

type Entity = 'inventory' | 'vendors';

// Field synonyms we accept in CSV/JSON
const FIELD_ALIASES: Record<Entity, Record<string, string[]>> = {
  inventory: {
    'SKU': ['SKU', 'sku'],
    'Name': ['Name', 'name'],
    'Category': ['Category', 'category'],
    'Stock': ['Stock', 'stock'],
    'On Order': ['On Order', 'onOrder'],
    'Reorder Point': ['Reorder Point', 'reorderPoint'],
    'MOQ': ['MOQ', 'moq'],
    'Vendor ID': ['Vendor ID', 'vendorId', 'vendor_id'],
  },
  vendors: {
    'ID': ['ID', 'id'],
    'Name': ['Name', 'name'],
    'Emails': ['Emails', 'Email', 'email'],
    'Phone': ['Phone', 'phone'],
    'Address': ['Address', 'address'],
    'Website': ['Website', 'website'],
    'Lead Time Days': ['Lead Time Days', 'leadTimeDays'],
  },
};

const REQUIRED_FIELDS: Record<Entity, string[]> = {
  inventory: ['SKU', 'Name', 'Category'],
  vendors: ['Name', 'Emails'], // at least one email is recommended
};

const NUMERIC_FIELDS: Record<Entity, string[]> = {
  inventory: ['Stock', 'On Order', 'Reorder Point', 'MOQ'],
  vendors: ['Lead Time Days'],
};

function getValue(row: any, logicalField: string, entity: Entity): any {
  const aliases = FIELD_ALIASES[entity][logicalField] || [logicalField];
  for (const key of aliases) {
    if (row[key] !== undefined) return row[key];
  }
  return undefined;
}

function isNonEmpty(v: any): boolean {
  return v !== undefined && v !== null && String(v).trim() !== '';
}

function cleanNumericValue(value: any): number | null {
  if (!isNonEmpty(value)) return null;
  
  // Remove common non-numeric characters: $, commas, spaces, %
  const cleaned = String(value)
    .replace(/[$,\s%]/g, '')
    .trim();
  
  const num = Number(cleaned);
  
  if (isNaN(num)) {
    return null; // Invalid
  }
  
  return num;
}

export class CSVValidator {
  // More comprehensive email regex that handles most valid email formats
  // while still being practical for CSV validation
  private static readonly EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  private static readonly LARGE_FILE_THRESHOLD = 500;

  validate(data: any[], entity: Entity): ValidationResult {
    return this.validateSync(data, entity);
  }

  async validateForeignKeys(data: any[], entity: Entity): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];
    
    if (entity === 'inventory') {
      // Get all unique vendor IDs from CSV
      const vendorIds = new Set<string>();
      data.forEach(row => {
        const vendorId = getValue(row, 'Vendor ID', entity) || row['Vendor ID'] || row['vendorId'];
        if (isNonEmpty(vendorId) && vendorId !== 'N/A') {
          vendorIds.add(String(vendorId));
        }
      });
      
      if (vendorIds.size > 0) {
        try {
          // Dynamically import supabase to avoid circular dependencies
          const { supabase } = await import('../dataService');
          const { data: existingVendors, error } = await supabase
            .from('vendors')
            .select('id')
            .in('id', Array.from(vendorIds))
            .eq('is_deleted', false);
          
          if (error) {
            console.error('Foreign key validation error:', error);
            // Add a general error to inform user that validation couldn't complete
            errors.push({
              row: 1,
              field: 'Vendor ID',
              message: 'Unable to validate vendor IDs against database. Please try again.',
              severity: 'error'
            });
            return errors;
          }
          
          const existingIds = new Set(existingVendors?.map(v => v.id) || []);
          
          // Flag missing vendors
          data.forEach((row, index) => {
            const vendorId = getValue(row, 'Vendor ID', entity) || row['Vendor ID'] || row['vendorId'];
            if (isNonEmpty(vendorId) && vendorId !== 'N/A' && !existingIds.has(String(vendorId))) {
              errors.push({
                row: index + 2,
                field: 'Vendor ID',
                message: `Vendor "${vendorId}" does not exist in database`,
                severity: 'error'
              });
            }
          });
        } catch (err) {
          console.error('Failed to validate foreign keys:', err);
        }
      }
    }
    
    return errors;
  }

  async validateAsync(
    data: any[], 
    entity: Entity, 
    onProgress?: (processed: number, total: number) => void
  ): Promise<ValidationResult> {
    const CHUNK_SIZE = 100;
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const total = data.length;
    
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, Math.min(i + CHUNK_SIZE, data.length));
      const chunkResult = this.validateSync(chunk, entity, i);
      
      errors.push(...chunkResult.errors);
      warnings.push(...chunkResult.warnings);
      
      if (onProgress) {
        onProgress(Math.min(i + CHUNK_SIZE, total), total);
      }
      
      // Yield to UI thread to keep interface responsive
      // Using setTimeout(0) as a cross-browser compatible approach
      // Could be enhanced with scheduler.postTask() when browser support improves
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const errorRowsSet = new Set(errors.map(e => e.row));
    const errorRows = errorRowsSet.size;
    const totalRows = data.length;
    const validRows = totalRows - errorRows;

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      summary: { totalRows, validRows, errorRows },
    };
  }

  private validateSync(data: any[], entity: Entity, rowOffset: number = 0): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const required = REQUIRED_FIELDS[entity] || [];
    const numeric = NUMERIC_FIELDS[entity] || [];

    // Duplicate check for Inventory SKU
    const seenKeys = new Map<string, number>();

    data.forEach((row, index) => {
      const rowNumber = rowOffset + index + 2; // +rowOffset for chunking, +1 header row, +1 for 1-based

      // Required fields
      for (const logicalField of required) {
        const val = getValue(row, logicalField, entity);
        if (!isNonEmpty(val)) {
          errors.push({ row: rowNumber, field: logicalField, message: `${logicalField} is required`, severity: 'error' });
        } else if (entity === 'vendors' && logicalField === 'Emails') {
          // For vendors, ensure at least one email present and validate format
          const str = String(val);
          const emails = str.split(/[,;\s]+/).filter(Boolean);
          if (emails.length === 0) {
            errors.push({ row: rowNumber, field: logicalField, message: `At least one email is required`, severity: 'error' });
          } else {
            // Validate each email format
            emails.forEach(email => {
              if (!CSVValidator.EMAIL_REGEX.test(email)) {
                errors.push({ 
                  row: rowNumber, 
                  field: logicalField, 
                  message: `Invalid email format: "${email}"`, 
                  severity: 'error' 
                });
              }
            });
          }
        }
      }

      // Numeric fields
      for (const nf of numeric) {
        const v = getValue(row, nf, entity);
        if (isNonEmpty(v)) {
          const cleaned = cleanNumericValue(v);
          if (cleaned === null) {
            errors.push({ 
              row: rowNumber, 
              field: nf, 
              message: `${nf} must be a number (found: "${v}")`, 
              severity: 'error' 
            });
          }
        }
      }

      // Entity-specific checks
      if (entity === 'inventory') {
        const sku = getValue(row, 'SKU', entity);
        if (isNonEmpty(sku)) {
          const key = String(sku);
          if (seenKeys.has(key)) {
            warnings.push({ row: rowNumber, field: 'SKU', message: `Duplicate SKU: ${key}`, severity: 'warning' });
          } else {
            seenKeys.set(key, rowNumber);
          }
        }
      }
    });

    // Summaries: count unique rows with at least one error
    const errorRowsSet = new Set(errors.map(e => e.row));
    const errorRows = errorRowsSet.size;
    const totalRows = data.length;
    const validRows = totalRows - errorRows;

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      summary: { totalRows, validRows, errorRows },
    };
  }
}

export default CSVValidator;
