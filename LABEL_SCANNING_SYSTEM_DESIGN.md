# Label Upload & AI Scanning System
## Design Document

**Date:** 2025-11-06
**Focus:** Upload existing labels (PDF/AI), extract ingredients, wording, and barcodes via AI

---

## 🎯 Core Requirements

### What You Have
- Completed label artwork (PDF and Adobe Illustrator .ai formats)
- Each product has a dedicated barcode

### What You Need
1. **Upload labels** to system (PDF or .ai files)
2. **AI scan labels** to extract:
   - Ingredients list
   - Wording/claims ("OMRI Listed", "Organic", product descriptions)
   - Barcode number
3. **Link barcode** from label to BOM items
4. **Compare** extracted ingredients vs. BOM ingredients
5. **Store** labels associated with products

### What You DON'T Need (Yet)
- ❌ Label generation/creation
- ❌ Label design tools
- ❌ Multi-state label variants (future phase)

---

## 📐 System Architecture

### Database Schema

```typescript
// Extend BillOfMaterials interface
interface BillOfMaterials {
  id: string;
  name: string;
  sku: string;
  components: BOMComponent[];

  // NEW: Label management
  labels?: ProductLabel[];
  barcode?: string; // Primary barcode for this product
  registrations?: ProductRegistration[]; // State registrations
}

interface ProductLabel {
  id: string;
  productId: string; // Links to BOM
  version: string; // "1.0", "1.1", "2.0"

  // File storage
  fileName: string; // "product-x-label-v1.2.pdf"
  fileType: 'pdf' | 'ai'; // Adobe Illustrator or PDF
  fileUrl: string; // URL or base64 data
  fileSize: number; // bytes
  uploadedAt: string;
  uploadedBy: string; // User ID

  // AI extraction status
  scanStatus: 'pending' | 'scanning' | 'completed' | 'failed';
  scanCompletedAt?: string;
  scanError?: string;

  // Extracted data from AI
  extractedData?: {
    ingredients: ExtractedIngredient[];
    claims: string[]; // ["OMRI Listed", "Organic", "100% Natural"]
    productName: string;
    netWeight: string; // "50 lbs", "2.5 gallons"
    barcode: string;
    guaranteedAnalysis?: {
      nitrogen?: string; // "5.0%"
      phosphate?: string; // "10.0%"
      potassium?: string; // "8.0%"
      other?: Record<string, string>; // Micronutrients
    };
    otherText: string[]; // Any other notable text
  };

  // Verification
  verified: boolean; // User confirmed extraction is accurate
  verifiedBy?: string;
  verifiedAt?: string;

  // Status
  status: 'draft' | 'active' | 'archived';
  notes?: string;
}

interface ExtractedIngredient {
  name: string;
  percentage?: string; // "45%" if shown on label
  order: number; // Order on label (1st, 2nd, 3rd ingredient)
  confidence: number; // AI confidence 0-1

  // Matching to BOM
  matchedToBOM?: boolean;
  bomComponentId?: string; // If matched
  matchConfidence?: number;
}

interface ProductRegistration {
  id: string;
  productId: string; // Links to BOM
  stateCode: string; // "CA", "OR", "WA", etc.

  registrationNumber: string; // State-issued number
  registeredDate: string;
  expirationDate: string;

  // Renewal tracking
  renewalStatus: 'current' | 'renewal_due_soon' | 'renewal_due_urgent' | 'expired';
  renewalNoticeSent?: boolean;
  renewalNoticeDate?: string;

  // Fees
  registrationFee?: number;
  renewalFee?: number;

  // Documents
  certificateUrl?: string; // PDF of registration certificate

  notes?: string;
  lastUpdated: string;
}
```

---

## 🔧 Implementation Plan

### Phase 1: File Upload & Storage (Week 1)

**Components to Build:**
1. **LabelUploadModal.tsx**
   - Drag-and-drop file upload
   - Accept PDF and .ai files
   - File preview (thumbnail for PDF)
   - Version number input
   - Notes field

2. **File Storage Service**
   - Store in Supabase Storage or base64 in database
   - Generate unique filenames
   - Handle large files (AI files can be big)

3. **Label Management UI in BOM Page**
   - Tab: "Labels" next to "Components"
   - Show all label versions for this product
   - Upload button
   - View/download labels
   - Status indicators (pending scan, scanned, verified)

**Data Flow:**
```
User clicks "Upload Label"
  → Modal opens
  → User drags PDF/AI file
  → File uploaded to storage
  → ProductLabel record created (status: pending scan)
  → Modal closes, label appears in list
```

---

### Phase 2: AI Label Scanning (Week 2)

**AI Extraction Process:**

1. **PDF Processing**
   - Convert PDF to image (first page)
   - Send image to Gemini Vision API
   - Extract text and structured data

2. **AI Files (.ai)**
   - Adobe Illustrator files are binary
   - Convert to PDF first (using pdf-lib or similar)
   - Then process as PDF

3. **Gemini Vision Prompt**
```typescript
const LABEL_EXTRACTION_PROMPT = `
You are analyzing a product label for an agricultural/fertilizer product.

**Your task:** Extract all information from this label and return structured JSON.

**Extract:**
1. Product name
2. Net weight (with units)
3. Barcode number (usually UPC or EAN, 12-13 digits)
4. Complete ingredients list (in order as shown)
5. Guaranteed analysis (NPK percentages, micronutrients)
6. All claims (OMRI Listed, Organic, certifications, etc.)
7. Any other notable text (directions, warnings, company info)

**IMPORTANT:**
- List ingredients in EXACT order shown on label
- Include percentages if shown next to ingredient names
- For guaranteed analysis, preserve exact percentages
- Identify barcodes carefully (usually at bottom, 12-13 digits)

**Return Format:**
{
  "productName": "Product Name Here",
  "netWeight": "50 lbs",
  "barcode": "012345678901",
  "ingredients": [
    {"name": "Ingredient Name", "percentage": "45%", "order": 1},
    {"name": "Second Ingredient", "order": 2}
  ],
  "guaranteedAnalysis": {
    "nitrogen": "5.0%",
    "phosphate": "10.0%",
    "potassium": "8.0%"
  },
  "claims": ["OMRI Listed", "100% Organic"],
  "otherText": ["Directions: ...", "Warning: ..."]
}

If you cannot find certain information, omit that field or set to null.
`;
```

4. **Processing Service**
```typescript
// services/labelScanningService.ts

export async function scanLabel(label: ProductLabel): Promise<ExtractedData> {
  // 1. Get file from storage
  const fileData = await getFileFromStorage(label.fileUrl);

  // 2. Convert to image if needed
  let imageData: string;
  if (label.fileType === 'pdf') {
    imageData = await convertPdfToImage(fileData);
  } else if (label.fileType === 'ai') {
    const pdfData = await convertAiToPdf(fileData);
    imageData = await convertPdfToImage(pdfData);
  }

  // 3. Call Gemini Vision API
  const response = await callGeminiVision(imageData, LABEL_EXTRACTION_PROMPT);

  // 4. Parse response
  const extractedData = JSON.parse(response);

  // 5. Add confidence scores (Gemini doesn't provide these, default to 0.9)
  const ingredients = extractedData.ingredients.map((ing, idx) => ({
    ...ing,
    confidence: 0.9,
    order: ing.order || idx + 1
  }));

  return {
    ...extractedData,
    ingredients
  };
}
```

**Components to Build:**
1. **ScanLabelButton**
   - Trigger scan for a specific label
   - Show scanning progress
   - Display results when complete

2. **LabelScanResults Component**
   - Display extracted data in readable format
   - Side-by-side: Scanned Data | BOM Data
   - Highlight mismatches
   - Checkboxes to verify each field
   - "Mark as Verified" button

---

### Phase 3: Barcode Extraction & BOM Linking (Week 2)

**Features:**
1. **Auto-populate BOM barcode**
   - When label scanned, extract barcode
   - Option: "Use this barcode for product?"
   - Updates BOM.barcode field

2. **Barcode Display in BOM**
   - Show barcode number
   - Generate barcode image (Code128 or UPC-A)
   - Print-friendly barcode

3. **Barcode Search**
   - Search all BOMs by barcode
   - Quick lookup: "What product is barcode 012345678901?"

**Components to Build:**
1. **BarcodeDisplay.tsx**
   - Show barcode number
   - Generate SVG barcode using `jsbarcode` library
   - Copy to clipboard button

2. **Barcode search in inventory**
   - Add barcode field to search
   - Semantic search includes barcode

---

### Phase 4: Ingredient Comparison (Week 3)

**Smart Matching:**
```typescript
// Compare extracted ingredients vs BOM components
export function compareIngredientsWithBOM(
  extractedIngredients: ExtractedIngredient[],
  bomComponents: BOMComponent[]
): ComparisonResult {

  const matches: IngredientMatch[] = [];
  const missing: ExtractedIngredient[] = [];
  const extra: BOMComponent[] = [];

  // Try to match each extracted ingredient to BOM component
  for (const extracted of extractedIngredients) {
    const bomMatch = findBestMatch(extracted.name, bomComponents);

    if (bomMatch && bomMatch.similarity > 0.7) {
      matches.push({
        extracted,
        bomComponent: bomMatch.component,
        similarity: bomMatch.similarity,
        orderMatch: extracted.order === bomMatch.component.order
      });
    } else {
      missing.push(extracted); // On label but not in BOM
    }
  }

  // Find BOM components not on label
  for (const component of bomComponents) {
    const found = matches.some(m => m.bomComponent.id === component.id);
    if (!found) {
      extra.push(component); // In BOM but not on label
    }
  }

  return { matches, missing, extra };
}

// Fuzzy matching for ingredient names
function findBestMatch(
  ingredientName: string,
  bomComponents: BOMComponent[]
): { component: BOMComponent; similarity: number } | null {

  let bestMatch: { component: BOMComponent; similarity: number } | null = null;

  for (const component of bomComponents) {
    const similarity = stringSimilarity(
      ingredientName.toLowerCase(),
      component.name.toLowerCase()
    );

    if (!bestMatch || similarity > bestMatch.similarity) {
      bestMatch = { component, similarity };
    }
  }

  return bestMatch;
}
```

**UI Components:**
1. **IngredientComparisonTable.tsx**
   - 3 columns: Label | Match % | BOM
   - Green: Perfect match (>90%)
   - Yellow: Possible match (70-90%)
   - Red: No match (<70%)
   - Manual override: "This label ingredient = this BOM component"

2. **Mismatch Alerts**
   - "WARNING: Label shows 5 ingredients, BOM has 7"
   - "WARNING: Ingredient order doesn't match"
   - "INFO: Label shows 45% Ingredient X, BOM shows 44.5%"

---

### Phase 5: Registration Renewal Management (Week 3)

**Simple Registration Tracking:**

```typescript
interface ProductRegistration {
  id: string;
  productId: string;
  stateCode: string;
  registrationNumber: string;
  expirationDate: string;
  renewalStatus: 'current' | 'due_soon' | 'urgent' | 'expired';
}
```

**Components to Build:**

1. **RegistrationPanel.tsx** (in BOM page)
   - Tab: "Registrations"
   - Table of all state registrations
   - Add/edit registrations
   - Upload certificate PDFs
   - Status badges (current, due soon, urgent, expired)

2. **RegistrationRenewalAlerts.tsx**
   - Dashboard widget
   - "5 products need renewal in next 90 days"
   - Click to see details
   - Grouped by state

3. **RegistrationCalendar.tsx** (Settings page)
   - Calendar view of all renewal dates
   - Filter by state, product, urgency
   - Export to CSV

**Alert Logic:**
```typescript
function calculateRenewalStatus(expirationDate: string): string {
  const daysUntilExpiration = daysBetween(new Date(), new Date(expirationDate));

  if (daysUntilExpiration < 0) return 'expired';
  if (daysUntilExpiration <= 30) return 'urgent'; // Red
  if (daysUntilExpiration <= 90) return 'due_soon'; // Yellow
  return 'current'; // Green
}

// Email alerts (future)
function checkRenewalAlerts() {
  const registrations = getAllRegistrations();

  for (const reg of registrations) {
    const status = calculateRenewalStatus(reg.expirationDate);

    if (status === 'urgent' && !reg.urgentAlertSent) {
      sendEmail({
        to: 'admin@company.com',
        subject: `URGENT: ${reg.productName} registration expires in ${daysLeft} days`,
        body: `State: ${reg.stateCode}\nExpires: ${reg.expirationDate}`
      });
      markAlertSent(reg.id, 'urgent');
    }

    if (status === 'due_soon' && !reg.dueSoonAlertSent) {
      sendEmail({...}); // 90-day notice
      markAlertSent(reg.id, 'due_soon');
    }
  }
}
```

---

## 🎨 UI Mockups

### BOM Page - Labels Tab
```
┌────────────────────────────────────────────────────────────┐
│  Product: Premium Organic Fertilizer 10-5-8               │
│  [ Components ] [ Labels ] [ Registrations ]              │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Labels                                    [Upload Label] │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Version  File Name         Uploaded    Status    Actions│
│  │ ──────────────────────────────────────────────────────│ │
│  │ 2.0     label-v2.pdf      2025-11-01  ✓ Verified     │ │
│  │         [Thumbnail]                   Barcode: 012...│ │
│  │         Scanned: 5 ingredients match                 │ │
│  │                                    [View] [Rescan]   │ │
│  │                                                       │ │
│  │ 1.5     label-v1.5.ai     2025-09-15  ⚠ Not Scanned │ │
│  │         [Thumbnail]                                  │ │
│  │                                    [View] [Scan]     │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### Scan Results View
```
┌────────────────────────────────────────────────────────────┐
│  Label Scan Results - Version 2.0                          │
├────────────────────────────────────────────────────────────┤
│  Product Name: Premium Organic Fertilizer 10-5-8          │
│  Net Weight: 50 lbs                                        │
│  Barcode: 012345678901      [Use for Product] [Copy]      │
│                                                            │
│  Ingredients (5 extracted)              ┌─────────────┐   │
│  ┌───────────────────────────┬──────────┤ BOM Match % │   │
│  │ Label                     │ BOM      │             │   │
│  ├───────────────────────────┼──────────┼─────────────┤   │
│  │ 1. Blood Meal             │ Blood... │ ✓ 95%       │   │
│  │ 2. Bone Meal              │ Bone...  │ ✓ 98%       │   │
│  │ 3. Kelp Powder            │ Kelp...  │ ✓ 100%      │   │
│  │ 4. Rock Phosphate         │ Rock...  │ ✓ 92%       │   │
│  │ 5. Potassium Sulfate      │ Potass...│ ✓ 88%       │   │
│  └───────────────────────────┴──────────┴─────────────┘   │
│                                                            │
│  Claims: OMRI Listed, 100% Organic                         │
│                                                            │
│  Guaranteed Analysis:                                      │
│    Nitrogen: 10.0%    (BOM calculates: 10.2%) ⚠ 0.2% diff │
│    Phosphate: 5.0%    (BOM calculates: 4.8%) ⚠ 0.2% diff  │
│    Potassium: 8.0%    (BOM calculates: 8.1%) ✓ Match      │
│                                                            │
│                    [Mark as Verified] [Edit Manually]      │
└────────────────────────────────────────────────────────────┘
```

### BOM Page - Registrations Tab
```
┌────────────────────────────────────────────────────────────┐
│  Product: Premium Organic Fertilizer 10-5-8               │
│  [ Components ] [ Labels ] [ Registrations ]              │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  State Registrations                  [Add Registration]  │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ State  Reg #      Expires      Status      Actions   │ │
│  │ ────────────────────────────────────────────────────│ │
│  │ CA     CA-12345   2025-12-31   ✓ Current   [Edit]   │ │
│  │ OR     OR-98765   2025-11-30   ⚠ Due Soon  [Renew]  │ │
│  │ WA     WA-55555   2025-11-15   🔴 Urgent   [Renew]  │ │
│  │ NY     NY-77777   2024-10-01   ❌ Expired  [Renew]  │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Summary: 4 states registered, 1 urgent, 1 expired        │
└────────────────────────────────────────────────────────────┘
```

### Dashboard - Renewal Alerts Widget
```
┌────────────────────────────────────────┐
│  ⚠️ Registration Renewals              │
├────────────────────────────────────────┤
│  🔴 Urgent (< 30 days): 3 products     │
│  ⚠️  Due Soon (< 90 days): 7 products  │
│  ❌ Expired: 1 product                 │
│                                        │
│              [View All Renewals]       │
└────────────────────────────────────────┘
```

---

## 🚀 Implementation Priority

### Week 1: Label Upload & Storage
- [ ] Create ProductLabel type
- [ ] Build LabelUploadModal component
- [ ] File upload to Supabase storage
- [ ] Labels tab in BOM page
- [ ] Display uploaded labels

### Week 2: AI Scanning
- [ ] PDF to image conversion
- [ ] Gemini Vision integration
- [ ] Label extraction service
- [ ] Scan results display
- [ ] Ingredient comparison algorithm

### Week 3: Barcode & Registrations
- [ ] Barcode extraction and display
- [ ] Link barcode to BOM
- [ ] ProductRegistration type
- [ ] Registrations tab in BOM
- [ ] Renewal status calculation
- [ ] Dashboard renewal alerts widget

---

## 🔌 Technical Dependencies

**NPM Packages:**
```bash
npm install jsbarcode          # Barcode generation
npm install pdf-lib            # PDF manipulation
npm install pdfjs-dist         # PDF to image
npm install string-similarity  # Fuzzy ingredient matching
```

**APIs:**
- Gemini Vision API (for label scanning)
- Supabase Storage (for file storage)

**File Size Limits:**
- PDF: Up to 10MB
- AI files: Up to 50MB (Adobe Illustrator files can be large)

---

## 💰 Cost Estimation

**Gemini Vision API:**
- $0.0025 per image (for gemini-2.0-flash-vision)
- Assume 100 labels scanned = $0.25
- Very affordable for this use case

**Storage:**
- Supabase: 1GB free, then $0.021/GB/month
- 100 PDF labels @ 500KB each = 50MB
- Negligible cost

---

## ✅ Success Criteria

1. **Upload works**: User can upload PDF or .ai label files
2. **Scan accuracy**: AI extracts ingredients with >85% accuracy
3. **Barcode detection**: AI finds barcode on >90% of labels
4. **Ingredient matching**: Fuzzy match to BOM components with >80% success
5. **Renewal alerts**: Clear visibility of upcoming expirations

---

## 🎯 Next Steps

1. Review this design
2. Confirm approach
3. Start with Week 1 implementation
4. Test with 2-3 real label files
5. Iterate based on accuracy

Ready to start building? 🚀
