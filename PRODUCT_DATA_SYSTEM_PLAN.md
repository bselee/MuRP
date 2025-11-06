# Product Data & Compliance Management System - Implementation Plan

## Executive Summary

This plan outlines the implementation of a comprehensive product data management system that:
- Stores all BOM, label, and compliance data in Supabase
- Enables manual label scanning for data extraction
- Generates AI-powered product data sheets (similar to SDS/spec sheets)
- Provides editable, versioned product documentation
- Tracks compliance and registration data persistently

---

## Phase 1: Supabase Schema Enhancement

### Current State
- Basic Supabase schema exists for: `boms`, `inventory_items`, `vendors`, `users`
- BOM artwork is stored as JSON within the `boms` table
- Label extracted data is stored within artwork JSON
- No persistent storage for scanned labels, product data sheets, or compliance documents

### Proposed Schema Additions

#### 1. `labels` Table (Dedicated Label Storage)
```sql
CREATE TABLE labels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- File information
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL, -- Supabase storage URL
  file_size BIGINT, -- bytes
  mime_type TEXT,

  -- Label metadata
  barcode TEXT,
  product_name TEXT,
  net_weight TEXT,
  revision NUMERIC DEFAULT 1.0,

  -- Associations
  bom_id UUID REFERENCES boms(id) ON DELETE SET NULL, -- Can be null for standalone scans

  -- AI Scanning
  scan_status TEXT DEFAULT 'pending', -- pending, scanning, completed, failed
  scan_completed_at TIMESTAMPTZ,
  scan_error TEXT,

  -- Extracted data (JSONB for flexible structure)
  extracted_data JSONB, -- Contains ingredients, NPK, claims, warnings, etc.

  -- Comparison with BOM
  ingredient_comparison JSONB, -- Results of comparing label vs BOM

  -- Verification
  verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,

  -- Audit
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  INDEX idx_labels_bom_id (bom_id),
  INDEX idx_labels_barcode (barcode),
  INDEX idx_labels_scan_status (scan_status)
);
```

#### 2. `product_data_sheets` Table (AI-Generated Documents)
```sql
CREATE TABLE product_data_sheets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Associations
  bom_id UUID REFERENCES boms(id) ON DELETE CASCADE NOT NULL,
  label_id UUID REFERENCES labels(id) ON DELETE SET NULL,

  -- Document info
  document_type TEXT NOT NULL, -- 'sds', 'spec_sheet', 'product_info', 'compliance_doc'
  title TEXT NOT NULL,
  version NUMERIC DEFAULT 1.0,

  -- AI-generated content (editable)
  content JSONB NOT NULL, -- Structured document sections
  /*
    Example structure:
    {
      "productIdentification": {
        "productName": "...",
        "sku": "...",
        "barcode": "...",
        "manufacturer": "..."
      },
      "composition": {
        "ingredients": [...],
        "guaranteedAnalysis": {...}
      },
      "regulatoryInformation": {
        "registrations": [...],
        "compliance": [...]
      },
      "storageAndHandling": {...},
      "technicalData": {...},
      "customSections": [...]
    }
  */

  -- PDF generation
  pdf_url TEXT, -- Generated PDF stored in Supabase storage
  pdf_generated_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'draft', -- draft, review, approved, published
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,

  -- Edit tracking
  is_ai_generated BOOLEAN DEFAULT true,
  last_edited_by UUID REFERENCES users(id),
  edit_history JSONB, -- Track changes over time

  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  INDEX idx_pds_bom_id (bom_id),
  INDEX idx_pds_status (status),
  INDEX idx_pds_type (document_type)
);
```

#### 3. `compliance_records` Table (Comprehensive Compliance Tracking)
```sql
CREATE TABLE compliance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Associations
  bom_id UUID REFERENCES boms(id) ON DELETE CASCADE NOT NULL,
  label_id UUID REFERENCES labels(id) ON DELETE SET NULL,

  -- Compliance type
  compliance_type TEXT NOT NULL, -- 'state_registration', 'organic_cert', 'omri', 'epa', 'custom'

  -- Registration details
  state_code TEXT, -- For state registrations: "CA", "OR", etc.
  state_name TEXT,
  registration_number TEXT,

  -- Dates
  registered_date DATE,
  expiration_date DATE,
  renewal_date DATE,

  -- Status
  status TEXT DEFAULT 'current', -- current, due_soon, urgent, expired, pending
  days_until_expiration INTEGER, -- Calculated field

  -- Financial
  registration_fee NUMERIC,
  renewal_fee NUMERIC,
  currency TEXT DEFAULT 'USD',

  -- Documents
  certificate_url TEXT, -- PDF of certificate
  certificate_file_name TEXT,

  -- Alerts
  due_soon_alert_sent BOOLEAN DEFAULT false,
  urgent_alert_sent BOOLEAN DEFAULT false,

  -- Metadata
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  INDEX idx_compliance_bom_id (bom_id),
  INDEX idx_compliance_type (compliance_type),
  INDEX idx_compliance_status (status),
  INDEX idx_compliance_expiration (expiration_date)
);
```

#### 4. Enhanced `boms` Table (Add Compliance References)
```sql
ALTER TABLE boms ADD COLUMN IF NOT EXISTS
  product_data_sheet_id UUID REFERENCES product_data_sheets(id);

ALTER TABLE boms ADD COLUMN IF NOT EXISTS
  primary_label_id UUID REFERENCES labels(id);
```

### Storage Buckets (Supabase Storage)
```
/labels/{bom_id}/{file_name}
/product-data-sheets/{bom_id}/v{version}.pdf
/compliance-certificates/{bom_id}/{state_code}/{file_name}
```

---

## Phase 2: Manual Label Scanning Interface

### New Component: `ManualLabelScanner.tsx`

**Features:**
- Standalone label upload and scanning (not tied to BOM initially)
- Drag-and-drop file upload
- Real-time AI scanning with progress
- Display extracted data with edit capabilities
- Option to link to existing BOM or create new product
- Save to Supabase `labels` table

**User Flow:**
1. User clicks "Scan Label" from navigation or dashboard
2. Uploads label file (PDF, image, .ai)
3. AI scans and extracts data in real-time
4. User reviews and edits extracted data
5. User optionally links label to existing BOM or creates new product
6. Data saved to Supabase with full audit trail

**UI Components:**
```typescript
<ManualLabelScanner />
  ├── <FileDropzone /> - Upload area
  ├── <ScanProgress /> - Real-time scanning status
  ├── <ExtractedDataEditor /> - Edit AI results
  ├── <BomLinker /> - Link to BOM or create new
  └── <SaveToDatabase /> - Persist to Supabase
```

---

## Phase 3: AI Product Data Sheet Generator

### Service: `productDataSheetService.ts`

**Purpose:** Generate comprehensive, editable product data sheets using AI

**Input Sources:**
1. BOM data (components, packaging, yield)
2. Label extracted data (ingredients, NPK, claims)
3. Compliance records (registrations, certifications)
4. User-provided additional info

**AI Prompt Structure:**
```typescript
const generateProductDataSheet = async (
  bom: BillOfMaterials,
  label: Label,
  complianceRecords: ComplianceRecord[],
  options: {
    documentType: 'sds' | 'spec_sheet' | 'product_info',
    includeImages: boolean,
    format: 'pdf' | 'json',
  }
): Promise<ProductDataSheet>
```

**Generated Sections:**
1. **Product Identification**
   - Product name, SKU, barcode
   - Manufacturer information
   - Emergency contact

2. **Composition/Ingredients**
   - Ingredient list with percentages
   - Guaranteed analysis (NPK values)
   - CAS numbers (if applicable)

3. **Hazards Identification**
   - Safety warnings from label
   - Handling precautions
   - First aid measures

4. **Storage & Handling**
   - Storage temperature/conditions
   - Shelf life
   - Packaging specifications

5. **Regulatory Information**
   - State registrations by state
   - Certifications (OMRI, Organic, etc.)
   - EPA/regulatory compliance

6. **Technical Data**
   - Application rates
   - Directions for use
   - Compatibility information

7. **Manufacturing Information**
   - BOM components
   - Packaging specs
   - Yield information

**Editable Interface:**
- Rich text editor for each section
- Add/remove custom sections
- Version control with diff tracking
- Approval workflow

---

## Phase 4: Data Persistence Implementation

### Migration Strategy

**Step 1: Create Supabase Migrations**
```
supabase/migrations/
  ├── 004_create_labels_table.sql
  ├── 005_create_product_data_sheets_table.sql
  ├── 006_create_compliance_records_table.sql
  └── 007_enhance_boms_table.sql
```

**Step 2: Update TypeScript Types**
- Add `Label`, `ProductDataSheet`, `ComplianceRecord` interfaces
- Update `Database` type with new tables
- Create type-safe hooks for Supabase queries

**Step 3: Create Data Service Layer**
```typescript
// services/labelDataService.ts
export const labelDataService = {
  // Labels
  createLabel(label: Omit<Label, 'id'>): Promise<Label>
  updateLabel(id: string, updates: Partial<Label>): Promise<Label>
  getLabel(id: string): Promise<Label>
  getLabelsByBom(bomId: string): Promise<Label[]>
  deletelabel(id: string): Promise<void>

  // Product Data Sheets
  generateDataSheet(bomId: string, options: DataSheetOptions): Promise<ProductDataSheet>
  updateDataSheet(id: string, content: any): Promise<ProductDataSheet>
  publishDataSheet(id: string): Promise<ProductDataSheet>
  generatePDF(dataSheetId: string): Promise<string> // Returns PDF URL

  // Compliance
  createComplianceRecord(record: Omit<ComplianceRecord, 'id'>): Promise<ComplianceRecord>
  getUpcomingRenewals(daysAhead: number): Promise<ComplianceRecord[]>
  updateComplianceStatus(id: string, status: string): Promise<ComplianceRecord>
}
```

**Step 4: Migrate Existing Data**
- Create migration script to move localStorage BOMs to Supabase
- Extract artwork/labels from BOM JSON to `labels` table
- Extract registrations to `compliance_records` table
- Maintain data integrity with foreign keys

---

## Phase 5: PDF Generation & Editing

### PDF Generation Service

**Technology Options:**
1. **jsPDF** (client-side) - Lightweight, good for simple PDFs
2. **Puppeteer** (server-side via Supabase Edge Function) - Full HTML/CSS rendering
3. **react-pdf** - React components → PDF (recommended)

**Implementation: `pdfGenerationService.ts`**
```typescript
import { PDFDocument } from 'pdf-lib';
import { renderToString } from 'react-dom/server';

export const generateProductPDF = async (
  dataSheet: ProductDataSheet
): Promise<Blob> => {
  // Render data sheet as HTML
  const html = renderToString(<ProductDataSheetTemplate data={dataSheet} />);

  // Convert to PDF (via edge function or jsPDF)
  const pdf = await convertHTMLToPDF(html);

  return pdf;
}
```

**Editable Document Features:**
- **Section Editor**: Rich text editing for each document section
- **Template System**: Pre-built templates for SDS, spec sheets, product info
- **Version Control**: Track all changes with diff viewer
- **Approval Workflow**: Draft → Review → Approved → Published
- **Export Options**: PDF, Word (DOCX), HTML

---

## Implementation Phases & Timeline

### Priority 1: Core Infrastructure (Week 1)
- [ ] Create Supabase schema migrations
- [ ] Update TypeScript types
- [ ] Build data service layer
- [ ] Create storage buckets
- [ ] Test data persistence

### Priority 2: Manual Label Scanning (Week 2)
- [ ] Build `ManualLabelScanner` component
- [ ] Integrate with AI label scanning service
- [ ] Add BOM linking functionality
- [ ] Implement save to Supabase
- [ ] Test end-to-end workflow

### Priority 3: Product Data Sheet Generator (Week 3)
- [ ] Design AI prompt for data sheet generation
- [ ] Build `ProductDataSheetGenerator` service
- [ ] Create data sheet editor UI
- [ ] Implement section editing
- [ ] Add version control

### Priority 4: PDF Generation (Week 4)
- [ ] Set up PDF generation service
- [ ] Create document templates
- [ ] Build export functionality
- [ ] Add approval workflow
- [ ] Test PDF generation

### Priority 5: Compliance Dashboard (Week 5)
- [ ] Migrate state registrations to new schema
- [ ] Build compliance dashboard
- [ ] Add renewal alerts
- [ ] Create reporting views
- [ ] Integration testing

---

## Key Features Summary

### 1. Manual Label Scanning
✅ Scan any label without BOM association
✅ Extract data (ingredients, NPK, claims, warnings)
✅ Edit and verify extracted data
✅ Link to existing BOM or create new product
✅ Save to Supabase with full audit trail

### 2. AI Product Data Sheets
✅ Generate comprehensive product documentation
✅ Multiple document types (SDS, spec sheet, product info)
✅ AI-powered content generation from BOM + label data
✅ Fully editable with rich text editor
✅ Version control and approval workflow
✅ Export to PDF/Word

### 3. Persistent Data Storage
✅ All data stored in Supabase (not localStorage)
✅ Relational data model with foreign keys
✅ File storage in Supabase buckets
✅ Real-time sync capabilities
✅ Full audit trail (created_by, updated_at, etc.)

### 4. Compliance Tracking
✅ Comprehensive compliance record system
✅ Track state registrations, certifications
✅ Renewal alerts and notifications
✅ Document attachment (certificates, permits)
✅ Status tracking and reporting

---

## Database Migration Strategy

### From localStorage to Supabase

**Current State:** BOMs stored in localStorage as JSON
**Target State:** Relational data in Supabase

**Migration Steps:**
1. Export all localStorage BOMs to JSON
2. Create migration script (`scripts/migrate-to-supabase.ts`)
3. For each BOM:
   - Insert BOM core data into `boms` table
   - Extract labels → insert into `labels` table
   - Extract registrations → insert into `compliance_records` table
   - Upload artwork files to Supabase storage
   - Update foreign key references
4. Verify data integrity
5. Clear localStorage (with backup)
6. Switch app to Supabase-only mode

---

## Security Considerations

### Row-Level Security (RLS)
```sql
-- Users can only see their organization's data
CREATE POLICY "Users see own org data" ON labels
  FOR SELECT USING (
    uploaded_by IN (
      SELECT id FROM users WHERE organization_id = current_user_org_id()
    )
  );

-- Similar policies for product_data_sheets, compliance_records
```

### File Upload Security
- Validate file types (PDF, PNG, JPG, AI only)
- Scan for malware (Supabase has built-in protection)
- Limit file sizes (50MB max)
- Generate unique file names to prevent collisions

### API Rate Limiting
- Limit AI scanning requests (5 per minute)
- Cache frequently accessed data
- Implement retry logic with exponential backoff

---

## Testing Strategy

### Unit Tests
- Data service methods
- AI prompt generation
- PDF generation
- Type conversions

### Integration Tests
- End-to-end label scanning workflow
- Data persistence to Supabase
- PDF generation and download
- Compliance record creation

### E2E Tests (Playwright)
- Manual label scan flow
- Product data sheet generation
- Edit and save workflow
- BOM linking

---

## Next Steps

**Before proceeding, please confirm:**

1. ✅ Do you approve this overall architecture?
2. ✅ Should we start with Priority 1 (Supabase schema) or would you like to see a different priority order?
3. ✅ Do you have existing Supabase project credentials, or do we need to set that up?
4. ✅ Any specific requirements for the product data sheet format/sections?
5. ✅ Any regulatory compliance specifics we should know (EPA, OMRI, state-specific requirements)?

Once approved, I'll begin implementation starting with the Supabase schema migrations and data service layer.
