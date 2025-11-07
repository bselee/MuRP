/**
 * PDF Storage Service
 *
 * Manages PDF upload/download/deletion in Supabase Storage
 */

import type { ProductDataSheet } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const PDF_BUCKET = 'product-datasheets';

/**
 * Upload PDF to Supabase Storage and return public URL
 */
export async function uploadPDFToStorage(
  dataSheet: ProductDataSheet,
  pdfBlob: Blob
): Promise<string> {
  const filename = generateStoragePath(dataSheet);

  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${PDF_BUCKET}/${filename}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/pdf',
      },
      body: pdfBlob,
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to upload PDF: ${error.message || response.statusText}`);
  }

  // Return public URL
  return `${SUPABASE_URL}/storage/v1/object/public/${PDF_BUCKET}/${filename}`;
}

/**
 * Delete PDF from Supabase Storage
 */
export async function deletePDFFromStorage(pdfUrl: string): Promise<void> {
  // Extract filename from URL
  const filename = pdfUrl.split(`${PDF_BUCKET}/`)[1];
  if (!filename) {
    throw new Error('Invalid PDF URL');
  }

  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${PDF_BUCKET}/${filename}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to delete PDF: ${error.message || response.statusText}`);
  }
}

/**
 * Generate storage path for PDF
 */
function generateStoragePath(dataSheet: ProductDataSheet): string {
  const date = new Date(dataSheet.createdAt).toISOString().split('T')[0];
  const bomId = dataSheet.bomId;
  const type = dataSheet.documentType;
  const version = dataSheet.version;
  const id = dataSheet.id;

  return `${bomId}/${type}/${date}_v${version}_${id}.pdf`;
}

/**
 * Update ProductDataSheet record with PDF URL
 */
export async function updateDataSheetPDFUrl(
  dataSheetId: string,
  pdfUrl: string
): Promise<void> {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/product_data_sheets?id=eq.${dataSheetId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        pdf_url: pdfUrl,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update data sheet PDF URL: ${error}`);
  }
}
