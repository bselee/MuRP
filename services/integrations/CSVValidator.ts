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
    'Vendor ID': ['Vendor ID', 'vendorId', 'VendorID', 'vendor_id', 'Vendor Id'],
    'Price': ['Price', 'price', 'Unit Price', 'unit_price'],
    'Cost': ['Cost', 'cost', 'Unit Cost', 'unit_cost'],
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
  private static EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  validate(data: any[], entity: Entity): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const required = REQUIRED_FIELDS[entity] || [];
    const numeric = NUMERIC_FIELDS[entity] || [];

    // Duplicate check for Inventory SKU
    const seenKeys = new Map<string, number>();
    // Duplicate check for Vendor Name
    const seenVendorNames = new Map<string, number>();

    data.forEach((row, index) => {
      const rowNumber = index + 2; // +1 header row, +1 for 1-based

      // Required fields
      for (const logicalField of required) {
        const val = getValue(row, logicalField, entity);
        if (!isNonEmpty(val)) {
          errors.push({ row: rowNumber, field: logicalField, message: `${logicalField} is required`, severity: 'error' });
        } else if (entity === 'vendors' && logicalField === 'Emails') {
          // For vendors, ensure at least one email present if provided aliases
          const str = String(val);
          const emails = str.split(/[,;\s]+/).filter(Boolean);
          if (emails.length === 0) {
            errors.push({ row: rowNumber, field: logicalField, message: `At least one email is required`, severity: 'error' });
          } else {
            // Email format validation for each address
            for (const email of emails) {
              if (!CSVValidator.EMAIL_REGEX.test(email)) {
                errors.push({ row: rowNumber, field: 'Emails', message: `Invalid email format: ${email}` , severity: 'error' });
              }
            }
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

        // Stock level warning: stock below reorder point
        const stockVal = getValue(row, 'Stock', entity);
        const ropVal = getValue(row, 'Reorder Point', entity);
        const stockNum = isNonEmpty(stockVal) ? Number(stockVal) : null;
        const ropNum = isNonEmpty(ropVal) ? Number(ropVal) : null;
        if (stockNum !== null && ropNum !== null && !isNaN(stockNum) && !isNaN(ropNum) && stockNum < ropNum) {
          warnings.push({ row: rowNumber, field: 'Stock', message: `Stock (${stockNum}) is below Reorder Point (${ropNum})`, severity: 'warning' });
        }

        // Pricing validation if both Price and Cost provided
        const priceVal = getValue(row, 'Price', entity);
        const costVal = getValue(row, 'Cost', entity);
        const priceNum = isNonEmpty(priceVal) ? Number(String(priceVal).replace(/[$,\s]/g, '')) : null;
        const costNum = isNonEmpty(costVal) ? Number(String(costVal).replace(/[$,\s]/g, '')) : null;
        if (priceNum !== null && costNum !== null && !isNaN(priceNum) && !isNaN(costNum) && priceNum < costNum) {
          warnings.push({ row: rowNumber, field: 'Price', message: `Price (${priceNum}) is below Cost (${costNum})`, severity: 'warning' });
        }
      }

      if (entity === 'vendors') {
        const name = getValue(row, 'Name', entity);
        if (isNonEmpty(name)) {
          const key = String(name).toLowerCase();
          if (seenVendorNames.has(key)) {
            warnings.push({ row: rowNumber, field: 'Name', message: `Duplicate vendor name: ${name}`, severity: 'warning' });
          } else {
            seenVendorNames.set(key, rowNumber);
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

  /**
   * Async validation for large datasets. Processes rows in chunks and yields
   * to the event loop between chunks to keep the UI responsive.
   */
  async validateAsync(
    data: any[],
    entity: Entity,
    options: { chunkSize?: number; onProgress?: (progress: number) => void } = {}
  ): Promise<ValidationResult> {
    const chunkSize = options.chunkSize ?? 200;
    const onProgress = options.onProgress;

    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const required = REQUIRED_FIELDS[entity] || [];
    const numeric = NUMERIC_FIELDS[entity] || [];
    const seenKeys = new Map<string, number>();
    const seenVendorNames = new Map<string, number>();

    const totalRows = data.length;

    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      chunk.forEach((row, offset) => {
        const index = i + offset;
        const rowNumber = index + 2;

        // Required
        for (const logicalField of required) {
          const val = getValue(row, logicalField, entity);
          if (!isNonEmpty(val)) {
            errors.push({ row: rowNumber, field: logicalField, message: `${logicalField} is required`, severity: 'error' });
          } else if (entity === 'vendors' && logicalField === 'Emails') {
            const str = String(val);
            const emails = str.split(/[,;\s]+/).filter(Boolean);
            if (emails.length === 0) {
              errors.push({ row: rowNumber, field: logicalField, message: `At least one email is required`, severity: 'error' });
            } else {
              for (const email of emails) {
                if (!CSVValidator.EMAIL_REGEX.test(email)) {
                  errors.push({ row: rowNumber, field: 'Emails', message: `Invalid email format: ${email}`, severity: 'error' });
                }
              }
            }
          }
        }

        // Numeric
        for (const nf of numeric) {
          const v = getValue(row, nf, entity);
          if (isNonEmpty(v) && isNaN(Number(v))) {
            errors.push({ row: rowNumber, field: nf, message: `${nf} must be a number`, severity: 'error' });
          }
        }

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
          const stockVal = getValue(row, 'Stock', entity);
          const ropVal = getValue(row, 'Reorder Point', entity);
          const stockNum = isNonEmpty(stockVal) ? Number(stockVal) : null;
          const ropNum = isNonEmpty(ropVal) ? Number(ropVal) : null;
          if (stockNum !== null && ropNum !== null && !isNaN(stockNum) && !isNaN(ropNum) && stockNum < ropNum) {
            warnings.push({ row: rowNumber, field: 'Stock', message: `Stock (${stockNum}) is below Reorder Point (${ropNum})`, severity: 'warning' });
          }
          const priceVal = getValue(row, 'Price', entity);
          const costVal = getValue(row, 'Cost', entity);
          const priceNum = isNonEmpty(priceVal) ? Number(String(priceVal).replace(/[$,\s]/g, '')) : null;
          const costNum = isNonEmpty(costVal) ? Number(String(costVal).replace(/[$,\s]/g, '')) : null;
          if (priceNum !== null && costNum !== null && !isNaN(priceNum) && !isNaN(costNum) && priceNum < costNum) {
            warnings.push({ row: rowNumber, field: 'Price', message: `Price (${priceNum}) is below Cost (${costNum})`, severity: 'warning' });
          }
        } else if (entity === 'vendors') {
          const name = getValue(row, 'Name', entity);
          if (isNonEmpty(name)) {
            const key = String(name).toLowerCase();
            if (seenVendorNames.has(key)) {
              warnings.push({ row: rowNumber, field: 'Name', message: `Duplicate vendor name: ${name}`, severity: 'warning' });
            } else {
              seenVendorNames.set(key, rowNumber);
            }
          }
        }
      });

      // progress
      const processed = Math.min(i + chunk.length, totalRows);
      const progress = totalRows === 0 ? 100 : Math.round((processed / totalRows) * 100);
      onProgress?.(progress);
      // yield to main thread
      await new Promise((r) => setTimeout(r, 0));
    }

    const errorRowsSet = new Set(errors.map(e => e.row));
    const errorRows = errorRowsSet.size;
    const validRows = data.length - errorRows;

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      summary: { totalRows: data.length, validRows, errorRows },
    };
  }
}

export default CSVValidator;
