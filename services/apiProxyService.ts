/**
 * API Proxy Service
 * 
 * Handles communication with the Supabase Edge Function (api-proxy).
 * Routes all external API calls through the secure backend proxy.
 * 
 * Features:
 * - Secure API key handling (never exposed to frontend)
 * - Automatic authentication
 * - Request/response logging
 * - Error handling
 * - Timeout management
 */

import { supabase, getCurrentSession, isSupabaseConfigured } from '../lib/supabase/client';
import type { InventoryItem, Vendor, PurchaseOrder } from '../types';

/**
 * API proxy request
 */
interface ApiProxyRequest {
  service: string;
  action: string;
  params?: Record<string, unknown>;
}

/**
 * API proxy response
 */
interface ApiProxyResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    executionTime: number;
    requestId: string;
  };
}

/**
 * Finale sync result
 */
interface FinaleSyncResult {
  inventory: InventoryItem[];
  vendors: Vendor[];
  purchaseOrders: PurchaseOrder[];
}

/**
 * Check if API proxy is available
 */
export function isApiProxyAvailable(): boolean {
  return isSupabaseConfigured();
}

/**
 * Call the API proxy
 */
async function callApiProxy<T>(
  service: string,
  action: string,
  params?: Record<string, unknown>
): Promise<T> {
  if (!isApiProxyAvailable()) {
    throw new Error('API proxy not available. Check Supabase configuration.');
  }

  // Get current session for authentication
  const session = await getCurrentSession();
  if (!session) {
    throw new Error('Authentication required. Please sign in.');
  }

  console.log(`📡 Calling API proxy: ${service}.${action}`);

  try {
    // Call the edge function
    const { data, error } = await supabase.functions.invoke('api-proxy', {
      body: {
        service,
        action,
        params,
      } as ApiProxyRequest,
    });

    if (error) {
      console.error('API proxy error:', error);
      throw new Error(`API proxy error: ${error.message}`);
    }

    const response = data as ApiProxyResponse<T>;

    if (!response.success) {
      throw new Error(response.error || 'API proxy request failed');
    }

    console.log(`✅ API proxy success (${response.metadata?.executionTime}ms)`);
    return response.data as T;

  } catch (error) {
    console.error('API proxy call failed:', error);
    throw error;
  }
}

// ============================================================================
// FINALE INVENTORY API
// ============================================================================

/**
 * Pull inventory from Finale
 */
export async function pullFinaleInventory(): Promise<InventoryItem[]> {
  console.log('📦 Pulling inventory from Finale...');
  
  const result = await callApiProxy<any[]>('finale', 'pullInventory');
  
  // Transform Finale data to application format
  return result.map(item => ({
    sku: item.product_id || item.sku,
    name: item.product_name || item.name,
    category: item.category || 'Uncategorized',
    stock: item.quantity_available || 0,
    onOrder: item.quantity_on_order || 0,
    reorderPoint: item.reorder_point || 0,
    vendorId: item.primary_vendor_id || 'unknown',
    moq: item.moq || undefined,
  }));
}

/**
 * Pull vendors from Finale
 */
export async function pullFinaleVendors(): Promise<Vendor[]> {
  console.log('🏢 Pulling vendors from Finale...');
  
  const result = await callApiProxy<any[]>('finale', 'pullVendors');
  
  // Transform Finale data to application format
  return result.map(vendor => ({
    id: vendor.vendor_id || vendor.id,
    name: vendor.vendor_name || vendor.name,
    contactEmails: vendor.email ? [vendor.email] : [],
    phone: vendor.phone || '',
    address: vendor.address || '',
    website: vendor.website || '',
    leadTimeDays: vendor.lead_time_days || 7,
  }));
}

/**
 * Pull purchase orders from Finale
 */
export async function pullFinalePurchaseOrders(): Promise<PurchaseOrder[]> {
  console.log('📋 Pulling purchase orders from Finale...');
  
  const result = await callApiProxy<any[]>('finale', 'pullPurchaseOrders');
  
  // Transform Finale data to application format
  return result.map(po => ({
    id: po.po_number || po.id,
    vendorId: po.vendor_id,
    status: po.status === 'open' ? 'Pending' : po.status === 'closed' ? 'Fulfilled' : 'Submitted',
    items: po.line_items || [],
    expectedDate: po.expected_delivery_date || undefined,
    notes: po.notes || undefined,
    createdAt: po.created_at || new Date().toISOString(),
  }));
}

/**
 * Sync all data from Finale
 */
export async function syncFinaleAll(): Promise<FinaleSyncResult> {
  console.log('🔄 Syncing all data from Finale...');
  
  const result = await callApiProxy<FinaleSyncResult>('finale', 'syncAll');
  
  console.log(`✅ Finale sync complete:`, {
    inventory: result.inventory.length,
    vendors: result.vendors.length,
    purchaseOrders: result.purchaseOrders.length,
  });
  
  return result;
}

/**
 * Get Finale API status
 */
export async function getFinaleStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  lastSync?: string;
}> {
  try {
    // Try to make a simple call to check if configured
    await callApiProxy('finale', 'pullInventory');
    
    return {
      configured: true,
      connected: true,
      lastSync: localStorage.getItem('last-finale-sync') || undefined,
    };
  } catch (error) {
    return {
      configured: false,
      connected: false,
    };
  }
}

// ============================================================================
// GEMINI AI API
// ============================================================================

/**
 * Generate text using Gemini AI through proxy
 */
export async function generateTextViaProxy(
  prompt: string,
  model: string = 'gemini-pro'
): Promise<string> {
  console.log('🤖 Generating text via Gemini proxy...');
  
  const result = await callApiProxy<any>('gemini', 'generateText', {
    prompt,
    model,
  });
  
  // Extract text from Gemini response
  if (result.candidates && result.candidates[0]) {
    const content = result.candidates[0].content;
    if (content.parts && content.parts[0]) {
      return content.parts[0].text;
    }
  }
  
  throw new Error('Invalid Gemini API response');
}

/**
 * Test Gemini API connection through proxy
 */
export async function testGeminiConnection(): Promise<boolean> {
  try {
    await generateTextViaProxy('Hello', 'gemini-pro');
    return true;
  } catch (error) {
    console.error('Gemini connection test failed:', error);
    return false;
  }
}

// ============================================================================
// AUDIT LOG QUERIES
// ============================================================================

/**
 * Fetch audit logs (requires admin role)
 */
export async function fetchAuditLogs(options?: {
  service?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}): Promise<any[]> {
  const { data, error } = await supabase
    .from('api_audit_log')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(options?.limit || 100);

  if (error) {
    console.error('Error fetching audit logs:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch cost summary
 */
export async function fetchCostSummary(days: number = 30): Promise<any[]> {
  const { data, error } = await supabase
    .from('api_cost_summary')
    .select('*')
    .gte('date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
    .order('date', { ascending: false });

  if (error) {
    console.error('Error fetching cost summary:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch user API usage
 */
export async function fetchUserApiUsage(userId: string): Promise<any> {
  const { data, error } = await supabase
    .from('user_api_usage')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('Error fetching user API usage:', error);
    throw error;
  }

  return data;
}
