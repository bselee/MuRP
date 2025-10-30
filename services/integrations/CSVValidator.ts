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

export class CSVValidator {
  private static readonly EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  validate(data: any[], entity: Entity): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const required = REQUIRED_FIELDS[entity] || [];
    const numeric = NUMERIC_FIELDS[entity] || [];

    // Duplicate check for Inventory SKU
    const seenKeys = new Map<string, number>();

    data.forEach((row, index) => {
      const rowNumber = index + 2; // +1 header row, +1 for 1-based

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
        if (isNonEmpty(v) && isNaN(Number(v))) {
          errors.push({ row: rowNumber, field: nf, message: `${nf} must be a number`, severity: 'error' });
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
