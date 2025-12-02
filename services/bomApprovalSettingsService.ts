/**
 * BOM Approval Settings Service
 * 
 * Manages loading and caching of BOM approval settings
 * Integrates with approvalService to enforce configured rules
 */

import { supabase } from '../lib/supabase/client';
import type { BOMApprovalSettings } from '../types';
import { defaultBOMApprovalSettings } from '../types';

let cachedSettings: BOMApprovalSettings | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Load BOM approval settings from database
 * Uses in-memory cache to avoid repeated queries
 */
export async function loadBOMApprovalSettings(): Promise<BOMApprovalSettings> {
  const now = Date.now();

  // Return cached settings if still valid
  if (cachedSettings && now - cacheTimestamp < CACHE_DURATION) {
    return cachedSettings;
  }

  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('setting_value, updated_at')
      .eq('setting_key', 'bom_approval_settings')
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (data?.setting_value) {
      cachedSettings = data.setting_value as BOMApprovalSettings;
    } else {
      cachedSettings = defaultBOMApprovalSettings;
    }

    cacheTimestamp = now;
    return cachedSettings;
  } catch (error) {
    console.error('[loadBOMApprovalSettings] Error loading settings:', error);
    // Fall back to defaults on error
    return defaultBOMApprovalSettings;
  }
}

/**
 * Save BOM approval settings to database
 */
export async function saveBOMApprovalSettings(
  settings: BOMApprovalSettings
): Promise<{ success: boolean; error?: string }> {
  try {
    const now = new Date().toISOString();
    const updatedSettings = {
      ...settings,
      updatedAt: now,
    };

    const { error } = await supabase.from('app_settings').upsert(
      {
        setting_key: 'bom_approval_settings',
        setting_category: 'bom',
        setting_value: updatedSettings,
        display_name: 'BOM Approval Settings',
        description:
          'Configure BOM revision blocking and artwork approval workflows',
      },
      { onConflict: 'setting_key' }
    );

    if (error) throw error;

    // Clear cache to force refresh
    cachedSettings = updatedSettings;
    cacheTimestamp = Date.now();

    return { success: true };
  } catch (error) {
    console.error('[saveBOMApprovalSettings] Error saving settings:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Clear the settings cache
 * Call this when you know settings have been updated externally
 */
export function clearBOMApprovalSettingsCache(): void {
  cachedSettings = null;
  cacheTimestamp = 0;
}

/**
 * Check if BOM revision blocking is enabled and applicable
 */
export async function shouldBlockBuildForRevision(
  componentCount?: number
): Promise<boolean> {
  const settings = await loadBOMApprovalSettings();

  if (!settings.enableBOMRevisionBlocking) {
    return false;
  }

  if (settings.enforceForAllProducts) {
    return true;
  }

  if (
    settings.enforceForHighValueBOMs &&
    componentCount &&
    settings.highValueThreshold &&
    componentCount >= settings.highValueThreshold
  ) {
    return true;
  }

  return false;
}

/**
 * Check if artwork approval workflow is enabled
 */
export async function isArtworkApprovalEnabled(): Promise<boolean> {
  const settings = await loadBOMApprovalSettings();
  return settings.enableArtworkApprovalWorkflow;
}

/**
 * Check if artwork approval is required before marking as print-ready
 */
export async function requiresArtworkApprovalForPrintReady(): Promise<boolean> {
  const settings = await loadBOMApprovalSettings();
  return (
    settings.enableArtworkApprovalWorkflow &&
    settings.requireArtworkApprovalBeforePrintReady
  );
}

/**
 * Get the blocking message to show users
 */
export async function getBOMRevisionBlockingMessage(): Promise<string> {
  const settings = await loadBOMApprovalSettings();
  return (
    settings.bomRevisionBlockingMessage ||
    'This BOM has pending revisions that must be approved before builds can proceed.'
  );
}

/**
 * Get the artwork approval message to show users
 */
export async function getArtworkApprovalMessage(): Promise<string> {
  const settings = await loadBOMApprovalSettings();
  return (
    settings.artworkApprovalMessage ||
    'Artwork must be approved by the design team before marking as print-ready.'
  );
}

/**
 * Get teams that can approve BOM revisions
 */
export async function getBOMRevisionApprovers(): Promise<
  ('Operations' | 'Design' | 'Quality')[]
> {
  const settings = await loadBOMApprovalSettings();
  return settings.bomRevisionApproversTeam;
}

/**
 * Get teams that can approve artwork for print-ready
 */
export async function getArtworkApprovers(): Promise<
  ('Operations' | 'Design' | 'Quality')[]
> {
  const settings = await loadBOMApprovalSettings();
  return settings.artworkApproversTeam;
}
