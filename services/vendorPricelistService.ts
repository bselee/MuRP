import { supabase } from '../lib/supabase/client';
import { generateAIResponse } from './aiGatewayService';
import type { PricelistItem, PricelistDiffSummary, VendorPricelist } from '../types';

const PRICELIST_BUCKET = 'vendor-pricelists';

export interface UploadPricelistOptions {
  vendorId: string;
  name: string;
  file?: File | Blob;
  effectiveDate?: string;
  expirationDate?: string;
  notes?: string;
  googleDocId?: string;
  source?: 'upload' | 'email' | 'google_docs' | 'api';
}

export interface PricelistExtractionResult {
  items: PricelistItem[];
  confidence: number;
  method: 'inline' | 'pdf' | 'spreadsheet' | 'google_sheet' | 'ai_fallback' | 'email_attachment';
  warnings?: string[];
  rawAttachmentId?: string;
}

export interface PricelistInsights {
  currentVersion: number;
  totalVersions: number;
  lastUpdated: string;
  totalProducts: number;
  priceChangesLastVersion: number;
  significantChanges: number;
  avgPriceChangePercentage: number;
  changes: PricelistChange[];
}

export interface PricelistChange {
  changeType: 'price_increase' | 'price_decrease' | 'new_product' | 'removed_product' | 'variant_change';
  sku?: string;
  productDescription?: string;
  oldValue?: any;
  newValue?: any;
  percentageChange?: number;
  absoluteChange?: number;
  category?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export async function uploadPricelist(options: UploadPricelistOptions): Promise<{ id: string }> {
  let filePath: string | undefined;

  // Handle file upload if provided
  if (options.file) {
    filePath = `${options.vendorId}/${Date.now()}-${Math.random().toString(36).slice(2)}.bin`;
    const { error: uploadError, data: storageResult } = await supabase.storage
      .from(PRICELIST_BUCKET)
      .upload(filePath, options.file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('[vendorPricelistService] uploadPricelist storage failed', uploadError);
      throw uploadError;
    }
  }

  const { data, error } = await supabase
    .from('vendor_pricelists')
    .insert({
      vendor_id: options.vendorId,
      name: options.name,
      effective_date: options.effectiveDate ?? null,
      expiration_date: options.expirationDate ?? null,
      file_url: filePath,
      file_type: options.file instanceof File ? options.file.type : null,
      google_doc_id: options.googleDocId,
      source: options.source || 'upload',
      notes: options.notes ?? null,
      extraction_status: options.googleDocId ? 'pending' : 'pending',
    })
    .select('id')
    .maybeSingle();

  if (error || !data) {
    console.error('[vendorPricelistService] uploadPricelist insert failed', error);
    throw error;
  }

  // If Google Doc ID provided, trigger extraction
  if (options.googleDocId) {
    setTimeout(() => extractFromGoogleDocs(data.id, options.googleDocId!), 1000);
  }

  return { id: data.id };
}

/**
 * Extract pricelist from Google Docs
 */
export async function extractFromGoogleDocs(pricelistId: string, googleDocId: string): Promise<void> {
  try {
    // TODO: Implement Google Docs API integration
    // For now, simulate extraction with mock data
    const mockItems: PricelistItem[] = [
      {
        sku: 'GD-001',
        description: 'Google Docs Product A',
        price: 29.99,
        unit: 'EA',
        moq: 5,
        category: 'Electronics'
      },
      {
        sku: 'GD-002',
        description: 'Google Docs Product B',
        price: 49.99,
        unit: 'EA',
        moq: 10,
        category: 'Hardware'
      }
    ];

    await markExtractionComplete(pricelistId, mockItems, 'google_sheet', 0.85);
  } catch (error) {
    console.error('Error extracting from Google Docs:', error);
    await supabase
      .from('vendor_pricelists')
      .update({
        extraction_status: 'error',
        extraction_error: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('id', pricelistId);
  }
}

/**
 * Extract pricelist from Excel file
 */
export async function extractFromExcel(pricelistId: string, fileUrl: string): Promise<void> {
  try {
    // TODO: Implement Excel parsing
    // For now, simulate extraction
    const mockItems: PricelistItem[] = [
      {
        sku: 'XL-001',
        description: 'Excel Product 1',
        price: 19.99,
        unit: 'EA',
        category: 'Supplies'
      }
    ];

    await markExtractionComplete(pricelistId, mockItems, 'spreadsheet', 0.80);
  } catch (error) {
    console.error('Error extracting from Excel:', error);
    await supabase
      .from('vendor_pricelists')
      .update({
        extraction_status: 'error',
        extraction_error: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('id', pricelistId);
  }
}

/**
 * Mark extraction as complete and calculate changes
 */
export async function markExtractionComplete(
  pricelistId: string,
  items: PricelistItem[],
  method: string = 'ai_fallback',
  confidence: number = 0.8
): Promise<void> {
  const { error } = await supabase
    .from('vendor_pricelists')
    .update({
      items: items,
      extracted_items_count: items.length,
      extraction_status: 'extracted',
      extraction_confidence: confidence,
      updated_at: new Date().toISOString()
    })
    .eq('id', pricelistId);

  if (error) throw error;
}

export async function getCurrentPricelists(): Promise<VendorPricelist[]> {
  const { data, error } = await supabase
    .from('vendor_pricelists')
    .select('*')
    .eq('is_current', true)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[vendorPricelistService] getCurrentPricelists failed', error);
    throw error;
  }

  return (data ?? []).map(mapPricelistRow);
}

export async function getPricelistHistory(vendorId: string, limit = 10): Promise<VendorPricelist[]> {
  const { data, error } = await supabase
    .from('vendor_pricelists')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('uploaded_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[vendorPricelistService] getPricelistHistory failed', error);
    throw error;
  }

  return (data ?? []).map(mapPricelistRow);
}

/**
 * Get comprehensive pricelist insights
 */
export async function getPricelistInsights(vendorId: string): Promise<PricelistInsights> {
  // Get basic insights from database function
  const { data: insightsData, error: insightsError } = await supabase
    .rpc('get_pricelist_insights', { vendor_id: vendorId });

  if (insightsError) throw insightsError;

  // Get detailed changes for the current version
  const { data: currentPricelist } = await supabase
    .from('vendor_pricelists')
    .select('id')
    .eq('vendor_id', vendorId)
    .eq('is_current', true)
    .single();

  let changes: PricelistChange[] = [];
  if (currentPricelist) {
    const { data: changesData } = await supabase
      .from('pricelist_changes')
      .select('*')
      .eq('pricelist_id', currentPricelist.id)
      .order('created_at', { ascending: false });

    changes = changesData?.map(change => ({
      changeType: change.change_type as any,
      sku: change.sku,
      productDescription: change.product_description,
      oldValue: change.old_value,
      newValue: change.new_value,
      percentageChange: change.percentage_change,
      absoluteChange: change.absolute_change,
      category: change.category,
      severity: change.severity as any
    })) || [];
  }

  return {
    currentVersion: insightsData?.[0]?.current_version || 1,
    totalVersions: insightsData?.[0]?.total_versions || 0,
    lastUpdated: insightsData?.[0]?.last_updated || '',
    totalProducts: insightsData?.[0]?.total_products || 0,
    priceChangesLastVersion: insightsData?.[0]?.price_changes_last_version || 0,
    significantChanges: insightsData?.[0]?.significant_changes || 0,
    avgPriceChangePercentage: insightsData?.[0]?.avg_price_change_percentage || 0,
    changes
  };
}

/**
 * Generate insights summary for team sharing
 */
export async function generateInsightsSummary(vendorId: string): Promise<string> {
  const insights = await getPricelistInsights(vendorId);

  const summaryPrompt = `
    Generate a concise, professional summary of pricelist changes for team sharing.

    Current pricelist version: ${insights.currentVersion}
    Total versions tracked: ${insights.totalVersions}
    Total products: ${insights.totalProducts}
    Price changes this version: ${insights.priceChangesLastVersion}
    Significant changes: ${insights.significantChanges}
    Average price change: ${insights.avgPriceChangePercentage}%

    Key changes:
    ${insights.changes.slice(0, 10).map(change =>
      `- ${change.changeType}: ${change.productDescription || change.sku} (${change.percentageChange ? change.percentageChange.toFixed(1) + '%' : 'N/A'})`
    ).join('\n')}

    Format as a brief email/update summary suitable for management.
    Highlight significant price changes and new products.
    Keep it under 300 words.
  `;

  const aiResponse = await generateAIResponse([{
    role: 'user',
    content: summaryPrompt
  }], 'chat', 'basic');

  return aiResponse.content;
}

/**
 * Compare two pricelist versions
 */
export async function comparePricelistVersions(
  vendorId: string,
  version1Id?: string,
  version2Id?: string
): Promise<any> {
  // If no specific versions, compare current with previous
  let v1Id = version1Id;
  let v2Id = version2Id;

  if (!v1Id || !v2Id) {
    const { data: pricelists } = await supabase
      .from('vendor_pricelists')
      .select('id, version, is_current')
      .eq('vendor_id', vendorId)
      .order('version', { ascending: false })
      .limit(2);

    if (pricelists && pricelists.length >= 2) {
      v1Id = pricelists[1].id; // Previous version
      v2Id = pricelists[0].id; // Current version
    }
  }

  if (!v1Id || !v2Id) {
    throw new Error('Not enough versions to compare');
  }

  // Get both pricelists
  const { data: pricelist1 } = await supabase
    .from('vendor_pricelists')
    .select('*')
    .eq('id', v1Id)
    .single();

  const { data: pricelist2 } = await supabase
    .from('vendor_pricelists')
    .select('*')
    .eq('id', v2Id)
    .single();

  // Get changes between them
  const { data: changes } = await supabase
    .from('pricelist_changes')
    .select('*')
    .eq('pricelist_id', v2Id)
    .eq('previous_pricelist_id', v1Id);

  return {
    version1: {
      id: pricelist1?.id,
      name: pricelist1?.name,
      version: pricelist1?.version,
      itemsCount: pricelist1?.extracted_items_count
    },
    version2: {
      id: pricelist2?.id,
      name: pricelist2?.name,
      version: pricelist2?.version,
      itemsCount: pricelist2?.extracted_items_count
    },
    changes: changes?.map(change => ({
      type: change.change_type,
      sku: change.sku,
      description: change.product_description,
      percentageChange: change.percentage_change,
      absoluteChange: change.absolute_change,
      severity: change.severity
    })) || []
  };
}

/**
 * Process pricelist from email attachment (integration point for gmail webhook)
 */
export async function processPricelistFromEmail(
  vendorId: string,
  gmailMessageId: string,
  attachmentId: string,
  attachmentName: string
): Promise<{ id: string }> {
  try {
    // Extract pricing data from the attachment
    const extractionResult = await extractPricelistFromEmail(gmailMessageId);

    if (!extractionResult.items.length) {
      throw new Error('No pricelist items extracted from email');
    }

    // Create the pricelist record
    const uploadResult = await uploadPricelist({
      vendorId,
      name: `Email Pricelist - ${attachmentName}`,
      description: `Automatically extracted from email attachment`,
      source: 'email'
    });

    // Mark as extracted with the items
    await markExtractionComplete(uploadResult.id, extractionResult.items, 'email_attachment', extractionResult.confidence);

    // Log the extraction
    await supabase
      .from('vendor_pricelist_extraction_logs')
      .insert({
        vendor_id: vendorId,
        pricelist_id: uploadResult.id,
        gmail_message_id: gmailMessageId,
        attachment_id: attachmentId,
        extraction_method: 'email_attachment',
        success: true,
        confidence: extractionResult.confidence,
        metadata: {
          attachment_name: attachmentName,
          items_extracted: extractionResult.items.length
        }
      });

    return uploadResult;
  } catch (error) {
    console.error('Error processing pricelist from email:', error);

    // Log the failed extraction
    await supabase
      .from('vendor_pricelist_extraction_logs')
      .insert({
        vendor_id: vendorId,
        gmail_message_id: gmailMessageId,
        attachment_id: attachmentId,
        extraction_method: 'email_attachment',
        success: false,
        metadata: { error: error.message }
      });

    throw error;
  }
}

export async function extractPricelistFromEmail(messageId: string): Promise<PricelistExtractionResult> {
  // Enhanced implementation - real extraction will parse Gmail payload/attachments.
  // For now, simulate extraction with more realistic data
  const mockItems: PricelistItem[] = [
    {
      sku: 'EMAIL-001',
      description: 'Premium Widget',
      price: 45.00,
      unit: 'EA',
      moq: 10,
      category: 'Components'
    },
    {
      sku: 'EMAIL-002',
      description: 'Standard Gadget',
      price: 25.50,
      unit: 'EA',
      moq: 25,
      category: 'Accessories'
    },
    {
      sku: 'EMAIL-003',
      description: 'Bulk Cable Set',
      price: 125.00,
      unit: 'SET',
      moq: 5,
      category: 'Cabling'
    }
  ];

  return {
    items: mockItems,
    confidence: 0.82,
    method: 'email_attachment',
    warnings: []
  };
}

export function diffPricelistVersions(previous: VendorPricelist | null, next: VendorPricelist): PricelistDiffSummary {
  const previousMap = new Map<string, PricelistItem>();
  previous?.items.forEach(item => previousMap.set(item.sku, item));

  const nextMap = new Map<string, PricelistItem>();
  next.items.forEach(item => nextMap.set(item.sku, item));

  const added: PricelistItem[] = [];
  const removed: PricelistItem[] = [];
  const changed: PricelistDiffSummary['changed'] = [];

  next.items.forEach(item => {
    if (!previousMap.has(item.sku)) {
      added.push(item);
      return;
    }
    const prev = previousMap.get(item.sku)!;
    if (prev.price !== item.price || prev.moq !== item.moq) {
      const variancePercent =
        prev.price && item.price ? ((item.price - prev.price) / prev.price) * 100 : undefined;
      changed.push({
        sku: item.sku,
        previousPrice: prev.price,
        newPrice: item.price,
        variancePercent,
        previousMoq: prev.moq,
        newMoq: item.moq,
      });
    }
  });

  previous?.items.forEach(item => {
    if (!nextMap.has(item.sku)) {
      removed.push(item);
    }
  });

  const summaryText = [
    added.length ? `${added.length} item(s) added` : null,
    removed.length ? `${removed.length} removed` : null,
    changed.length ? `${changed.length} price change(s)` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    added,
    removed,
    changed,
    summaryText: summaryText || 'No changes detected',
  };
}

function mapPricelistRow(row: any): VendorPricelist {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    name: row.name,
    effectiveDate: row.effective_date,
    expirationDate: row.expiration_date,
    fileUrl: row.file_url,
    fileType: row.file_type,
    googleDocId: row.google_doc_id,
    extractionStatus: row.extraction_status,
    extractionConfidence: row.extraction_confidence,
    extractionError: row.extraction_error,
    items: Array.isArray(row.items) ? row.items : [],
    version: row.version,
    previousVersionId: row.previous_version_id,
    isCurrent: row.is_current,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
    notes: row.notes,
  };
}
