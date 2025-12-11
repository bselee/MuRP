/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STANDARD OPERATING PROCEDURES (SOP) SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AI-powered SOP creation and management system integrated with BOM workflows.
 * Generates comprehensive build instructions with managerial oversight and PDF output.
 *
 * Features:
 * ✨ AI-assisted documentation generation using tier-aware AI Gateway
 * ✨ Managerial input collection and approval workflows
 * ✨ PDF generation for printable build instructions
 * ✨ Integration with BOM system and build orders
 * ✨ Usage tracking and quality metrics
 * ✨ Template-based SOP creation
 *
 * @module services/sopService
 * @author MuRP Development Team
 */

import type {
  StandardOperatingProcedure,
  SOPSection,
  SOPManagerInput,
  SOPAttachment,
  SOPTemplate,
  SOPReview,
  SOPUsageLog,
  BillOfMaterials,
  BuildOrder,
  User
} from '../types';
import { sendChatMessage } from './aiGatewayService';
import { generatePoPdf } from './pdfService';
import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 SOP TEMPLATES - Standardized Build Process Frameworks
// ═══════════════════════════════════════════════════════════════════════════

export const SOP_TEMPLATES: Record<string, SOPTemplate> = {
  soil_mixing: {
    id: 'soil_mixing',
    name: 'Soil Mixing & Batching',
    description: 'Standard procedure for mixing soil amendments and potting mixes',
    category: 'Manufacturing',
    difficulty: 'intermediate',
    estimatedTimeMinutes: 45,
    requiredSections: [
      'introduction',
      'materials',
      'equipment',
      'safety',
      'procedure',
      'quality_control',
      'cleanup',
      'troubleshooting'
    ],
    defaultPrompts: {
      introduction: `Write a brief introduction for a Standard Operating Procedure for mixing {product_name}.
      Include the purpose, scope, and key safety considerations. Keep it under 200 words.`,

      materials: `List all materials and components needed for producing {product_name} based on this BOM:
      {bom_components}
      Include quantities, specifications, and any preparation requirements.`,

      equipment: `List all equipment and tools required for mixing {product_name}.
      Include mixing equipment, measuring tools, safety gear, and any specialized machinery.
      Specify calibration requirements and maintenance notes.`,

      safety: `Write comprehensive safety instructions for mixing {product_name}.
      Include PPE requirements, hazard identification, emergency procedures, and safe handling practices.
      Consider dust control, chemical hazards, and equipment operation risks.`,

      procedure: `Write detailed step-by-step mixing instructions for {product_name}.
      Break down the process into clear, numbered steps with specific measurements and timing.
      Include quality checkpoints, mixing techniques, and batch documentation requirements.
      Structure as: 1. Preparation, 2. Measuring, 3. Mixing, 4. Quality Checks, 5. Packaging.`,

      quality_control: `Define quality control checkpoints for {product_name} production.
      Include visual inspections, weight checks, moisture testing, and contamination prevention.
      Specify acceptable ranges and rejection criteria.`,

      cleanup: `Write cleanup and sanitation procedures for mixing equipment and work area.
      Include disassembly instructions, cleaning methods, waste disposal, and equipment storage.
      Specify any sanitization requirements for food-grade or organic products.`,

      troubleshooting: `Create a troubleshooting guide for common issues in {product_name} mixing.
      Include problems like poor mixing, contamination, equipment failure, and quality issues.
      Provide specific solutions and when to escalate to management.`,
    },
    isActive: true,
    usageCount: 0,
    createdBy: 'system',
    createdAt: new Date().toISOString(),
  },

  packaging: {
    id: 'packaging',
    name: 'Product Packaging & Labeling',
    description: 'Standard procedure for packaging finished products with labels and artwork',
    category: 'Packaging',
    difficulty: 'beginner',
    estimatedTimeMinutes: 20,
    requiredSections: [
      'introduction',
      'materials',
      'equipment',
      'safety',
      'procedure',
      'quality_control',
      'cleanup'
    ],
    defaultPrompts: {
      introduction: `Write an introduction for packaging {product_name}.
      Include packaging specifications, label requirements, and quality standards.`,

      materials: `List packaging materials for {product_name}:
      {packaging_specs}
      Include bags, labels, tags, and any additional packaging components.`,

      equipment: `List packaging equipment needed for {product_name}.
      Include sealing machines, label applicators, weighing scales, and hand tools.`,

      safety: `Write safety instructions for packaging operations.
      Include proper lifting techniques, equipment operation safety, and label handling.`,

      procedure: `Write step-by-step packaging instructions for {product_name}.
      Include weighing, bagging, sealing, labeling, and final inspection steps.`,

      quality_control: `Define packaging quality checks for {product_name}.
      Include weight verification, seal integrity, label placement, and barcode scanning.`,

      cleanup: `Write cleanup procedures for packaging area and equipment.`,
    },
    isActive: true,
    usageCount: 0,
    createdBy: 'system',
    createdAt: new Date().toISOString(),
  },

  quality_assurance: {
    id: 'quality_assurance',
    name: 'Quality Assurance & Testing',
    description: 'Standard procedure for quality testing and assurance checks',
    category: 'Quality',
    difficulty: 'advanced',
    estimatedTimeMinutes: 30,
    requiredSections: [
      'introduction',
      'materials',
      'equipment',
      'safety',
      'procedure',
      'quality_control',
      'troubleshooting'
    ],
    defaultPrompts: {
      introduction: `Write an introduction for quality assurance testing of {product_name}.`,

      materials: `List testing materials and reference samples needed.`,

      equipment: `List testing equipment and calibration requirements.`,

      safety: `Write safety instructions for quality testing procedures.`,

      procedure: `Write detailed testing procedures and acceptance criteria.`,

      quality_control: `Define quality control standards and documentation requirements.`,

      troubleshooting: `Create troubleshooting guide for testing equipment and procedures.`,
    },
    isActive: true,
    usageCount: 0,
    createdBy: 'system',
    createdAt: new Date().toISOString(),
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 🤖 AI-ASSISTED SOP GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate an SOP section using AI based on BOM data and template prompts
 */
export async function generateSOPSection(
  sectionType: SOPSection['type'],
  template: SOPTemplate,
  bom: BillOfMaterials,
  userId: string
): Promise<SOPSection> {
  const prompt = template.defaultPrompts[sectionType];

  if (!prompt) {
    throw new Error(`No prompt template found for section type: ${sectionType}`);
  }

  // Prepare context data
  const contextData = {
    product_name: bom.name,
    bom_components: JSON.stringify(bom.components, null, 2),
    packaging_specs: JSON.stringify(bom.packaging, null, 2),
    artwork_info: bom.artwork?.length ? `Artwork files: ${bom.artwork.map(a => a.fileName).join(', ')}` : 'No artwork specified',
  };

  // Replace placeholders in prompt
  let processedPrompt = prompt;
  Object.entries(contextData).forEach(([key, value]) => {
    processedPrompt = processedPrompt.replace(new RegExp(`{${key}}`, 'g'), value);
  });

  // Generate content using AI Gateway
  const aiResponse = await sendChatMessage({
    userId,
    messages: [{ role: 'user', content: processedPrompt }],
    systemPrompt: `You are an expert manufacturing documentation specialist. Create clear, detailed, and safe operating procedures for manufacturing processes. Use professional language, include specific measurements and safety considerations, and structure information logically.`,
    temperature: 0.3,
  });

  return {
    id: `${sectionType}_${Date.now()}`,
    type: sectionType,
    title: sectionType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
    content: aiResponse.content,
    order: template.requiredSections.indexOf(sectionType),
    isAiGenerated: true,
    aiPromptUsed: processedPrompt,
    lastEditedBy: userId,
    lastEditedAt: new Date().toISOString(),
  };
}

/**
 * Generate a complete SOP using AI and templates
 */
export async function generateSOPFromBOM(
  bom: BillOfMaterials,
  templateId: string,
  userId: string
): Promise<StandardOperatingProcedure> {
  const template = SOP_TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  // Generate all required sections in parallel
  const sectionPromises = template.requiredSections.map(sectionType =>
    generateSOPSection(sectionType, template, bom, userId)
  );

  const sections = await Promise.all(sectionPromises);

  // Sort sections by order
  sections.sort((a, b) => a.order - b.order);

  const sop: StandardOperatingProcedure = {
    id: `sop_${bom.id}_${Date.now()}`,
    bomId: bom.id,
    bomName: bom.name,
    bomSku: bom.finishedSku,
    title: `SOP: ${bom.name} Production`,
    description: `Standard Operating Procedure for manufacturing ${bom.name}`,
    version: 1,
    status: 'draft',
    estimatedTimeMinutes: template.estimatedTimeMinutes,
    difficulty: template.difficulty,
    requiredSkills: ['Basic manufacturing experience', 'Safety training'],
    safetyLevel: 'medium',

    sections,

    managerInputs: [],
    requiresManagerApproval: true,

    isAiGenerated: true,
    aiModelUsed: 'gpt-4o', // Will be updated based on actual model used
    generationPrompt: `Generated using template: ${template.name}`,
    aiConfidence: 0.85,

    attachments: [],
    attachedToBuildOrders: [],
    usageCount: 0,

    createdBy: userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return sop;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📄 PDF GENERATION FOR SOPs
// ═══════════════════════════════════════════════════════════════════════════

// Declare global jspdf from CDN
declare const jspdf: any;

/**
 * Generate a PDF version of the SOP for printing and distribution
 */
export async function generateSOPPdf(sop: StandardOperatingProcedure): Promise<string> {
  // Use CDN-loaded jspdf instead of npm package to avoid version conflicts
  if (typeof jspdf === 'undefined' || !jspdf?.jsPDF) {
    throw new Error('jsPDF library not loaded. Please ensure the CDN script is included.');
  }
  const { jsPDF } = jspdf;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let yPosition = margin;

  // Helper function to add text with page breaks
  const addText = (text: string, fontSize = 10, isBold = false) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');

    const lines = doc.splitTextToSize(text, pageWidth - 2 * margin);
    const lineHeight = fontSize * 0.4;

    for (const line of lines) {
      if (yPosition + lineHeight > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }
      doc.text(line, margin, yPosition);
      yPosition += lineHeight;
    }
    yPosition += 5; // Extra space after paragraph
  };

  // Title Page
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('STANDARD OPERATING PROCEDURE', pageWidth / 2, 50, { align: 'center' });

  doc.setFontSize(18);
  doc.text(sop.title, pageWidth / 2, 70, { align: 'center' });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Version ${sop.version}`, pageWidth / 2, 85, { align: 'center' });
  doc.text(`Effective Date: ${new Date().toLocaleDateString()}`, pageWidth / 2, 95, { align: 'center' });

  // Basic Info
  yPosition = 120;
  addText(`Product: ${sop.bomName} (${sop.bomSku})`, 12, true);
  addText(`Estimated Time: ${sop.estimatedTimeMinutes} minutes`, 10);
  addText(`Difficulty: ${sop.difficulty}`, 10);
  addText(`Safety Level: ${sop.safetyLevel}`, 10);
  addText(`Required Skills: ${sop.requiredSkills.join(', ')}`, 10);

  // Add sections
  sop.sections.forEach((section, index) => {
    // Check if we need a new page
    if (yPosition > pageHeight - 100) {
      doc.addPage();
      yPosition = margin;
    }

    // Section header
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`${index + 1}. ${section.title}`, margin, yPosition);
    yPosition += 10;

    // Section content
    addText(section.content, 10);
    yPosition += 10;
  });

  // Footer on each page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`SOP-${sop.id} v${sop.version} | Page ${i} of ${pageCount}`, margin, pageHeight - 10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
  }

  // Convert to base64 for storage
  const pdfBuffer = doc.output('arraybuffer');
  const base64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));

  return `data:application/pdf;base64,${base64}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 💾 DATABASE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Save SOP to database
 */
export async function saveSOP(sop: StandardOperatingProcedure): Promise<StandardOperatingProcedure> {
  const { data, error } = await supabase
    .from('sops')
    .upsert(sop)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get SOP by ID
 */
export async function getSOP(id: string): Promise<StandardOperatingProcedure | null> {
  const { data, error } = await supabase
    .from('sops')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }
  return data;
}

/**
 * Get SOPs for a BOM
 */
export async function getSOPsForBOM(bomId: string): Promise<StandardOperatingProcedure[]> {
  const { data, error } = await supabase
    .from('sops')
    .select('*')
    .eq('bomId', bomId)
    .order('version', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Attach SOP to build order
 */
export async function attachSOPToBuildOrder(sopId: string, buildOrderId: string): Promise<void> {
  // Update SOP
  const { error: sopError } = await supabase
    .from('sops')
    .update({
      attachedToBuildOrders: supabase.sql`array_append(attached_to_build_orders, ${buildOrderId})`,
      updatedAt: new Date().toISOString()
    })
    .eq('id', sopId);

  if (sopError) throw sopError;

  // Log usage
  await logSOPUsage(sopId, buildOrderId, 'system', 'Attached to build order');
}

/**
 * Log SOP usage
 */
export async function logSOPUsage(
  sopId: string,
  buildOrderId: string,
  userId: string,
  userName: string,
  notes?: string
): Promise<void> {
  const usageLog: Partial<SOPUsageLog> = {
    sopId,
    buildOrderId,
    userId,
    userName,
    startedAt: new Date().toISOString(),
    notes,
  };

  const { error } = await supabase
    .from('sop_usage_logs')
    .insert(usageLog);

  if (error) throw error;
}

/**
 * Complete SOP usage
 */
export async function completeSOPUsage(
  usageId: string,
  successRating?: 1 | 2 | 3 | 4 | 5,
  issues?: string[]
): Promise<void> {
  const { error } = await supabase
    .from('sop_usage_logs')
    .update({
      completedAt: new Date().toISOString(),
      successRating,
      issuesEncountered: issues,
    })
    .eq('id', usageId);

  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════════════════════
// 👔 MANAGERIAL OVERSIGHT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add managerial input to SOP
 */
export async function addManagerInput(
  sopId: string,
  managerId: string,
  managerName: string,
  sectionId: string,
  inputType: SOPManagerInput['inputType'],
  content: string
): Promise<SOPManagerInput> {
  const managerInput: Partial<SOPManagerInput> = {
    sopId,
    managerId,
    managerName,
    sectionId,
    inputType,
    content,
    timestamp: new Date().toISOString(),
    resolved: false,
  };

  const { data, error } = await supabase
    .from('sop_manager_inputs')
    .insert(managerInput)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Approve SOP
 */
export async function approveSOP(sopId: string, managerId: string): Promise<void> {
  const { error } = await supabase
    .from('sops')
    .update({
      status: 'approved',
      approvedBy: managerId,
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .eq('id', sopId);

  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 ANALYTICS AND REPORTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get SOP usage statistics
 */
export async function getSOPStatistics(sopId: string): Promise<{
  usageCount: number;
  averageCompletionTime: number;
  successRate: number;
  commonIssues: string[];
}> {
  const { data: usageLogs, error } = await supabase
    .from('sop_usage_logs')
    .select('*')
    .eq('sopId', sopId)
    .not('completedAt', 'is', null);

  if (error) throw error;

  if (!usageLogs || usageLogs.length === 0) {
    return {
      usageCount: 0,
      averageCompletionTime: 0,
      successRate: 0,
      commonIssues: [],
    };
  }

  const completedLogs = usageLogs.filter(log => log.completedAt);
  const averageTime = completedLogs.reduce((sum, log) => {
    if (log.timeSpentMinutes) return sum + log.timeSpentMinutes;
    const start = new Date(log.startedAt).getTime();
    const end = new Date(log.completedAt!).getTime();
    return sum + (end - start) / (1000 * 60); // Convert to minutes
  }, 0) / completedLogs.length;

  const successRate = completedLogs.filter(log => log.successRating && log.successRating >= 4).length / completedLogs.length;

  // Collect common issues
  const allIssues = completedLogs.flatMap(log => log.issuesEncountered || []);
  const issueCounts: Record<string, number> = {};
  allIssues.forEach(issue => {
    issueCounts[issue] = (issueCounts[issue] || 0) + 1;
  });

  const commonIssues = Object.entries(issueCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([issue]) => issue);

  return {
    usageCount: usageLogs.length,
    averageCompletionTime: Math.round(averageTime),
    successRate: Math.round(successRate * 100),
    commonIssues,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get available SOP templates
 */
export function getSOPTemplates(): SOPTemplate[] {
  return Object.values(SOP_TEMPLATES).filter(template => template.isActive);
}

/**
 * Validate SOP data
 */
export function validateSOP(sop: Partial<StandardOperatingProcedure>): string[] {
  const errors: string[] = [];

  if (!sop.title?.trim()) errors.push('Title is required');
  if (!sop.bomId) errors.push('BOM ID is required');
  if (!sop.sections?.length) errors.push('At least one section is required');
  if (!sop.createdBy) errors.push('Creator ID is required');

  return errors;
}

/**
 * Create a new SOP from template
 */
export function createSOPFromTemplate(
  template: SOPTemplate,
  bom: BillOfMaterials,
  userId: string
): Partial<StandardOperatingProcedure> {
  return {
    bomId: bom.id,
    bomName: bom.name,
    bomSku: bom.finishedSku,
    title: `SOP: ${bom.name} Production`,
    description: template.description,
    version: 1,
    status: 'draft',
    estimatedTimeMinutes: template.estimatedTimeMinutes,
    difficulty: template.difficulty,
    requiredSkills: ['Basic manufacturing experience'],
    safetyLevel: 'medium',
    sections: [],
    managerInputs: [],
    requiresManagerApproval: true,
    attachments: [],
    attachedToBuildOrders: [],
    usageCount: 0,
    createdBy: userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}