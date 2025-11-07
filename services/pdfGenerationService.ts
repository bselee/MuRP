/**
 * PDF Generation Service
 *
 * Converts ProductDataSheet JSONB content into professional PDF documents.
 * Supports multiple document types: SDS, spec sheets, product info, compliance docs.
 *
 * Installation required:
 * npm install jspdf jspdf-autotable
 * npm install --save-dev @types/jspdf
 *
 * NOTE: Currently stubbed out - install dependencies to enable PDF generation
 */

// import jsPDF from 'jspdf';
// import autoTable from 'jspdf-autotable';
import type { ProductDataSheet } from '../types';

// Stub types for jsPDF until library is installed
type jsPDF = any;
const jsPDF = {} as any;
const autoTable = {} as any;

// Company branding colors
const COLORS = {
  primary: '#4F46E5', // Indigo-600
  secondary: '#6366F1', // Indigo-500
  text: '#111827', // Gray-900
  textLight: '#6B7280', // Gray-500
  border: '#E5E7EB', // Gray-200
  background: '#F9FAFB', // Gray-50
  success: '#10B981', // Green-500
  warning: '#F59E0B', // Amber-500
  danger: '#EF4444', // Red-500
};

// Page dimensions for US Letter
const PAGE_WIDTH = 8.5 * 25.4; // mm
const PAGE_HEIGHT = 11 * 25.4; // mm
const MARGIN = 20; // mm

/**
 * Generate a PDF from ProductDataSheet content
 */
export async function generatePDF(
  dataSheet: ProductDataSheet
): Promise<Blob> {
  // Check if jsPDF is available
  if (!jsPDF || typeof jsPDF !== 'function') {
    throw new Error(
      'PDF generation library not installed. Please run: npm install jspdf jspdf-autotable'
    );
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  // Route to appropriate template based on document type
  switch (dataSheet.documentType) {
    case 'sds':
      renderSDSTemplate(doc, dataSheet);
      break;
    case 'spec_sheet':
      renderSpecSheetTemplate(doc, dataSheet);
      break;
    case 'product_info':
      renderProductInfoTemplate(doc, dataSheet);
      break;
    case 'compliance_doc':
      renderComplianceTemplate(doc, dataSheet);
      break;
    default:
      renderGenericTemplate(doc, dataSheet);
  }

  // Return as Blob for upload/download
  return doc.output('blob');
}

/**
 * Safety Data Sheet Template
 * Professional format following OSHA GHS standards
 */
function renderSDSTemplate(doc: jsPDF, dataSheet: ProductDataSheet) {
  const content = dataSheet.content as any;
  let yPosition = MARGIN;

  // Header with company branding
  doc.setFillColor(COLORS.primary);
  doc.rect(0, 0, PAGE_WIDTH, 40, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('SAFETY DATA SHEET', MARGIN, 20);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Version ${dataSheet.version}`, MARGIN, 30);
  doc.text(`Effective Date: ${new Date(dataSheet.createdAt).toLocaleDateString()}`, PAGE_WIDTH - MARGIN - 60, 30);

  yPosition = 50;

  // Product Identification Section
  yPosition = addSection(doc, 'Section 1: Product Identification', yPosition);
  doc.setFontSize(10);
  doc.setTextColor(COLORS.text);

  if (content.productIdentification) {
    addKeyValue(doc, 'Product Name:', content.productIdentification.productName, yPosition);
    yPosition += 8;
    addKeyValue(doc, 'Product SKU:', content.productIdentification.sku, yPosition);
    yPosition += 8;
    if (content.productIdentification.manufacturer) {
      addKeyValue(doc, 'Manufacturer:', content.productIdentification.manufacturer, yPosition);
      yPosition += 8;
    }
    if (content.productIdentification.emergencyPhone) {
      addKeyValue(doc, 'Emergency Phone:', content.productIdentification.emergencyPhone, yPosition);
      yPosition += 8;
    }
  }
  yPosition += 5;

  // Hazard Identification Section
  if (content.hazardIdentification) {
    yPosition = checkPageBreak(doc, yPosition, 60);
    yPosition = addSection(doc, 'Section 2: Hazard Identification', yPosition);

    if (content.hazardIdentification.classification) {
      addKeyValue(doc, 'Classification:', content.hazardIdentification.classification, yPosition);
      yPosition += 8;
    }

    if (content.hazardIdentification.signalWord) {
      const color = content.hazardIdentification.signalWord === 'DANGER' ? COLORS.danger : COLORS.warning;
      doc.setTextColor(color);
      doc.setFont('helvetica', 'bold');
      doc.text(content.hazardIdentification.signalWord, MARGIN, yPosition);
      doc.setTextColor(COLORS.text);
      doc.setFont('helvetica', 'normal');
      yPosition += 8;
    }

    if (content.hazardIdentification.hazardStatements?.length > 0) {
      addKeyValue(doc, 'Hazard Statements:', '', yPosition);
      yPosition += 6;
      content.hazardIdentification.hazardStatements.forEach((statement: string) => {
        doc.setFontSize(9);
        doc.text(`  • ${statement}`, MARGIN + 5, yPosition);
        yPosition += 6;
      });
      doc.setFontSize(10);
    }
    yPosition += 5;
  }

  // Composition / Ingredients Section
  if (content.composition?.ingredients) {
    yPosition = checkPageBreak(doc, yPosition, 80);
    yPosition = addSection(doc, 'Section 3: Composition / Ingredients', yPosition);

    // Create table for ingredients
    const tableData = content.composition.ingredients.map((ing: any) => [
      ing.name || '',
      ing.casNumber || 'N/A',
      ing.percentage || '',
      ing.function || '',
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Ingredient Name', 'CAS Number', 'Concentration (%)', 'Function']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: COLORS.primary,
        textColor: '#FFFFFF',
        fontSize: 9,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 9,
        textColor: COLORS.text,
      },
      alternateRowStyles: {
        fillColor: COLORS.background,
      },
      margin: { left: MARGIN, right: MARGIN },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 10;
  }

  // First Aid Measures Section
  if (content.firstAid) {
    yPosition = checkPageBreak(doc, yPosition, 60);
    yPosition = addSection(doc, 'Section 4: First Aid Measures', yPosition);

    const firstAidMeasures = [
      { label: 'Inhalation:', value: content.firstAid.inhalation },
      { label: 'Skin Contact:', value: content.firstAid.skinContact },
      { label: 'Eye Contact:', value: content.firstAid.eyeContact },
      { label: 'Ingestion:', value: content.firstAid.ingestion },
    ];

    firstAidMeasures.forEach((measure) => {
      if (measure.value) {
        doc.setFont('helvetica', 'bold');
        doc.text(measure.label, MARGIN, yPosition);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(measure.value, PAGE_WIDTH - 2 * MARGIN - 40);
        doc.text(lines, MARGIN + 35, yPosition);
        yPosition += 6 * Math.ceil(lines.length);
        yPosition += 3;
      }
    });
    yPosition += 5;
  }

  // Storage and Handling Section
  if (content.handling) {
    yPosition = checkPageBreak(doc, yPosition, 40);
    yPosition = addSection(doc, 'Section 7: Handling and Storage', yPosition);

    if (content.handling.precautions) {
      addKeyValue(doc, 'Precautions:', '', yPosition);
      yPosition += 6;
      const lines = doc.splitTextToSize(content.handling.precautions, PAGE_WIDTH - 2 * MARGIN - 10);
      doc.text(lines, MARGIN + 5, yPosition);
      yPosition += 6 * lines.length + 5;
    }

    if (content.handling.storageConditions) {
      addKeyValue(doc, 'Storage Conditions:', '', yPosition);
      yPosition += 6;
      const lines = doc.splitTextToSize(content.handling.storageConditions, PAGE_WIDTH - 2 * MARGIN - 10);
      doc.text(lines, MARGIN + 5, yPosition);
      yPosition += 6 * lines.length + 5;
    }
  }

  // Regulatory Information Section
  if (content.regulatory) {
    yPosition = checkPageBreak(doc, yPosition, 40);
    yPosition = addSection(doc, 'Section 15: Regulatory Information', yPosition);

    if (content.regulatory.epaRegistration) {
      addKeyValue(doc, 'EPA Registration:', content.regulatory.epaRegistration, yPosition);
      yPosition += 8;
    }

    if (content.regulatory.stateRegistrations?.length > 0) {
      addKeyValue(doc, 'State Registrations:', content.regulatory.stateRegistrations.join(', '), yPosition);
      yPosition += 8;
    }

    if (content.regulatory.certifications?.length > 0) {
      addKeyValue(doc, 'Certifications:', content.regulatory.certifications.join(', '), yPosition);
      yPosition += 8;
    }
  }

  // Footer on every page
  addFooter(doc, dataSheet);
}

/**
 * Specification Sheet Template
 * Clean, product-focused layout
 */
function renderSpecSheetTemplate(doc: jsPDF, dataSheet: ProductDataSheet) {
  const content = dataSheet.content as any;
  let yPosition = MARGIN;

  // Header with gradient effect
  doc.setFillColor(COLORS.primary);
  doc.rect(0, 0, PAGE_WIDTH, 35, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('PRODUCT SPECIFICATION SHEET', MARGIN, 20);

  yPosition = 45;

  // Product Overview
  if (content.productOverview) {
    doc.setFontSize(16);
    doc.setTextColor(COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.text(content.productOverview.name || dataSheet.title, MARGIN, yPosition);
    yPosition += 10;

    doc.setFontSize(10);
    doc.setTextColor(COLORS.textLight);
    doc.setFont('helvetica', 'normal');
    doc.text(`SKU: ${content.productOverview.sku || 'N/A'}`, MARGIN, yPosition);
    yPosition += 6;
    doc.text(`Version: ${dataSheet.version} | ${new Date(dataSheet.createdAt).toLocaleDateString()}`, MARGIN, yPosition);
    yPosition += 12;

    if (content.productOverview.description) {
      doc.setTextColor(COLORS.text);
      const lines = doc.splitTextToSize(content.productOverview.description, PAGE_WIDTH - 2 * MARGIN);
      doc.text(lines, MARGIN, yPosition);
      yPosition += 6 * lines.length + 10;
    }
  }

  // Technical Specifications Table
  if (content.specifications) {
    yPosition = checkPageBreak(doc, yPosition, 60);
    yPosition = addSection(doc, 'Technical Specifications', yPosition);

    const specs = content.specifications;
    const tableData: string[][] = [];

    // Build table data from specifications
    if (specs.npkRatio) tableData.push(['NPK Ratio', specs.npkRatio]);
    if (specs.guaranteedAnalysis) {
      Object.entries(specs.guaranteedAnalysis).forEach(([key, value]) => {
        tableData.push([key, String(value)]);
      });
    }
    if (specs.physicalForm) tableData.push(['Physical Form', specs.physicalForm]);
    if (specs.color) tableData.push(['Color', specs.color]);
    if (specs.odor) tableData.push(['Odor', specs.odor]);
    if (specs.pH) tableData.push(['pH', specs.pH]);
    if (specs.density) tableData.push(['Density', specs.density]);

    if (tableData.length > 0) {
      autoTable(doc, {
        startY: yPosition,
        body: tableData,
        theme: 'striped',
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 60 },
          1: { cellWidth: 'auto' },
        },
        headStyles: {
          fillColor: COLORS.primary,
        },
        bodyStyles: {
          fontSize: 10,
          textColor: COLORS.text,
        },
        alternateRowStyles: {
          fillColor: COLORS.background,
        },
        margin: { left: MARGIN, right: MARGIN },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 10;
    }
  }

  // Applications and Usage
  if (content.applications) {
    yPosition = checkPageBreak(doc, yPosition, 50);
    yPosition = addSection(doc, 'Applications & Usage', yPosition);

    if (content.applications.recommendedUse) {
      doc.setFontSize(10);
      doc.setTextColor(COLORS.text);
      const lines = doc.splitTextToSize(content.applications.recommendedUse, PAGE_WIDTH - 2 * MARGIN);
      doc.text(lines, MARGIN, yPosition);
      yPosition += 6 * lines.length + 8;
    }

    if (content.applications.applicationRate) {
      addKeyValue(doc, 'Application Rate:', content.applications.applicationRate, yPosition);
      yPosition += 8;
    }

    if (content.applications.frequency) {
      addKeyValue(doc, 'Frequency:', content.applications.frequency, yPosition);
      yPosition += 8;
    }
  }

  // Safety and Warnings
  if (content.safetyWarnings?.length > 0) {
    yPosition = checkPageBreak(doc, yPosition, 40);
    yPosition = addSection(doc, 'Safety Information', yPosition);

    doc.setFontSize(9);
    doc.setTextColor(COLORS.text);
    content.safetyWarnings.forEach((warning: string) => {
      doc.text(`⚠ ${warning}`, MARGIN + 5, yPosition);
      yPosition += 6;
    });
    yPosition += 5;
  }

  // Footer
  addFooter(doc, dataSheet);
}

/**
 * Product Information Template
 * Marketing-focused layout
 */
function renderProductInfoTemplate(doc: jsPDF, dataSheet: ProductDataSheet) {
  const content = dataSheet.content as any;
  let yPosition = MARGIN;

  // Header
  doc.setFillColor(COLORS.secondary);
  doc.rect(0, 0, PAGE_WIDTH, 40, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text(content.productName || dataSheet.title, MARGIN, 25);

  yPosition = 50;

  // Product description
  if (content.description) {
    doc.setFontSize(11);
    doc.setTextColor(COLORS.text);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(content.description, PAGE_WIDTH - 2 * MARGIN);
    doc.text(lines, MARGIN, yPosition);
    yPosition += 7 * lines.length + 15;
  }

  // Key Benefits
  if (content.keyBenefits?.length > 0) {
    yPosition = checkPageBreak(doc, yPosition, 40);
    yPosition = addSection(doc, 'Key Benefits', yPosition);

    doc.setFontSize(10);
    content.keyBenefits.forEach((benefit: string) => {
      doc.text(`✓ ${benefit}`, MARGIN + 5, yPosition);
      yPosition += 7;
    });
    yPosition += 10;
  }

  // Features
  if (content.features?.length > 0) {
    yPosition = checkPageBreak(doc, yPosition, 40);
    yPosition = addSection(doc, 'Product Features', yPosition);

    doc.setFontSize(10);
    content.features.forEach((feature: string) => {
      doc.text(`• ${feature}`, MARGIN + 5, yPosition);
      yPosition += 7;
    });
    yPosition += 10;
  }

  // Usage instructions
  if (content.usageInstructions) {
    yPosition = checkPageBreak(doc, yPosition, 40);
    yPosition = addSection(doc, 'Usage Instructions', yPosition);

    doc.setFontSize(10);
    doc.setTextColor(COLORS.text);
    const lines = doc.splitTextToSize(content.usageInstructions, PAGE_WIDTH - 2 * MARGIN);
    doc.text(lines, MARGIN, yPosition);
    yPosition += 6 * lines.length + 10;
  }

  addFooter(doc, dataSheet);
}

/**
 * Compliance Document Template
 * Formal regulatory format
 */
function renderComplianceTemplate(doc: jsPDF, dataSheet: ProductDataSheet) {
  const content = dataSheet.content as any;
  let yPosition = MARGIN;

  // Header
  doc.setFillColor(COLORS.text);
  doc.rect(0, 0, PAGE_WIDTH, 35, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('COMPLIANCE DOCUMENTATION', MARGIN, 22);

  yPosition = 45;

  // Document info
  doc.setFontSize(10);
  doc.setTextColor(COLORS.text);
  doc.text(`Document: ${dataSheet.title}`, MARGIN, yPosition);
  yPosition += 6;
  doc.text(`Version: ${dataSheet.version}`, MARGIN, yPosition);
  yPosition += 6;
  doc.text(`Date: ${new Date(dataSheet.createdAt).toLocaleDateString()}`, MARGIN, yPosition);
  yPosition += 15;

  // Regulatory compliance section
  if (content.regulatory) {
    yPosition = addSection(doc, 'Regulatory Compliance Status', yPosition);

    if (content.regulatory.federalCompliance) {
      doc.setFont('helvetica', 'bold');
      doc.text('Federal Compliance:', MARGIN, yPosition);
      doc.setFont('helvetica', 'normal');
      yPosition += 6;

      Object.entries(content.regulatory.federalCompliance).forEach(([key, value]) => {
        doc.text(`  ${key}: ${value}`, MARGIN + 5, yPosition);
        yPosition += 6;
      });
      yPosition += 5;
    }

    if (content.regulatory.stateCompliance) {
      yPosition = checkPageBreak(doc, yPosition, 40);
      doc.setFont('helvetica', 'bold');
      doc.text('State Compliance:', MARGIN, yPosition);
      doc.setFont('helvetica', 'normal');
      yPosition += 6;

      Object.entries(content.regulatory.stateCompliance).forEach(([state, status]) => {
        doc.text(`  ${state}: ${status}`, MARGIN + 5, yPosition);
        yPosition += 6;
      });
      yPosition += 5;
    }
  }

  // Registration information
  if (content.registrations?.length > 0) {
    yPosition = checkPageBreak(doc, yPosition, 60);
    yPosition = addSection(doc, 'Product Registrations', yPosition);

    const tableData = content.registrations.map((reg: any) => [
      reg.state || '',
      reg.registrationNumber || '',
      reg.expirationDate ? new Date(reg.expirationDate).toLocaleDateString() : 'N/A',
      reg.status || '',
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['State', 'Registration #', 'Expiration', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: COLORS.text,
        textColor: '#FFFFFF',
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 9,
      },
      margin: { left: MARGIN, right: MARGIN },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 10;
  }

  addFooter(doc, dataSheet);
}

/**
 * Generic template fallback
 */
function renderGenericTemplate(doc: jsPDF, dataSheet: ProductDataSheet) {
  let yPosition = MARGIN;

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(COLORS.text);
  doc.text(dataSheet.title, MARGIN, yPosition);
  yPosition += 15;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.textLight);
  doc.text(`Version ${dataSheet.version} | ${new Date(dataSheet.createdAt).toLocaleDateString()}`, MARGIN, yPosition);
  yPosition += 15;

  // Render JSON content as formatted text
  doc.setTextColor(COLORS.text);
  doc.setFontSize(10);
  const contentStr = JSON.stringify(dataSheet.content, null, 2);
  const lines = doc.splitTextToSize(contentStr, PAGE_WIDTH - 2 * MARGIN);

  lines.forEach((line: string) => {
    yPosition = checkPageBreak(doc, yPosition, 10);
    doc.text(line, MARGIN, yPosition);
    yPosition += 5;
  });

  addFooter(doc, dataSheet);
}

/**
 * Helper: Add section header
 */
function addSection(doc: jsPDF, title: string, yPosition: number): number {
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(COLORS.primary);
  doc.text(title, MARGIN, yPosition);

  // Underline
  doc.setDrawColor(COLORS.primary);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, yPosition + 2, PAGE_WIDTH - MARGIN, yPosition + 2);

  return yPosition + 10;
}

/**
 * Helper: Add key-value pair
 */
function addKeyValue(doc: jsPDF, key: string, value: string, yPosition: number) {
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(COLORS.text);
  doc.text(key, MARGIN, yPosition);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.textLight);
  doc.text(value, MARGIN + 50, yPosition);
}

/**
 * Helper: Check if page break is needed
 */
function checkPageBreak(doc: jsPDF, yPosition: number, neededSpace: number): number {
  if (yPosition + neededSpace > PAGE_HEIGHT - MARGIN - 15) {
    doc.addPage();
    return MARGIN;
  }
  return yPosition;
}

/**
 * Helper: Add footer to current page
 */
function addFooter(doc: jsPDF, dataSheet: ProductDataSheet) {
  const pageCount = doc.getNumberOfPages();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    doc.setFontSize(8);
    doc.setTextColor(COLORS.textLight);
    doc.setFont('helvetica', 'normal');

    // Left: Document ID
    doc.text(`Doc ID: ${dataSheet.id}`, MARGIN, PAGE_HEIGHT - 10);

    // Center: Page number
    doc.text(`Page ${i} of ${pageCount}`, PAGE_WIDTH / 2 - 10, PAGE_HEIGHT - 10);

    // Right: Confidential notice
    doc.text('Confidential', PAGE_WIDTH - MARGIN - 20, PAGE_HEIGHT - 10);
  }
}

/**
 * Download PDF directly to user's device
 */
export function downloadPDF(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Generate filename for PDF based on data sheet
 */
export function generatePDFFilename(dataSheet: ProductDataSheet): string {
  const date = new Date(dataSheet.createdAt).toISOString().split('T')[0];
  const type = dataSheet.documentType.toUpperCase();
  const title = dataSheet.title.replace(/[^a-zA-Z0-9]/g, '_');
  return `${type}_${title}_v${dataSheet.version}_${date}.pdf`;
}
