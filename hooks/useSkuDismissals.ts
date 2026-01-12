/**
 * SKU Dismissals Hook
 *
 * Manages dismissed and snoozed SKUs for purchasing guidance.
 * - Dismiss: Hide permanently with a reason (dropship, bulk order, etc.)
 * - Snooze: Hide temporarily and show again after a set time
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export type DismissReason =
  | 'dropship'        // Handled by vendor directly
  | 'bulk_order'      // Will order in bulk with other items
  | 'seasonal'        // Seasonal item, not needed now
  | 'low_priority'    // Low priority, can wait
  | 'discontinued'    // Being phased out
  | 'vendor_managed'  // Vendor manages inventory (VMI)
  | 'custom';         // Custom reason

export type DismissType = 'dismiss' | 'snooze';

export interface SkuDismissal {
  sku: string;
  dismiss_type: DismissType;
  dismiss_reason: DismissReason | null;
  notes: string | null;
  snooze_until: string | null;
  created_at: string;
}

export interface DismissOptions {
  reason: DismissReason;
  notes?: string;
}

export interface SnoozeOptions {
  duration: 'tomorrow' | '3days' | '1week' | '2weeks' | '1month' | 'custom';
  customDate?: Date;
  notes?: string;
}

export interface UseSkuDismissalsResult {
  /** Currently active dismissals */
  dismissals: SkuDismissal[];

  /** Loading state */
  loading: boolean;

  /** Check if a SKU is currently dismissed or snoozed */
  isDismissed: (sku: string) => boolean;

  /** Get dismissal info for a SKU */
  getDismissal: (sku: string) => SkuDismissal | undefined;

  /** Dismiss a SKU with a reason */
  dismissSku: (sku: string, options: DismissOptions) => Promise<boolean>;

  /** Snooze a SKU for a period */
  snoozeSku: (sku: string, options: SnoozeOptions) => Promise<boolean>;

  /** Remove dismissal (un-dismiss) */
  undismissSku: (sku: string) => Promise<boolean>;

  /** Refresh dismissals from database */
  refresh: () => Promise<void>;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getSnoozeDate(duration: SnoozeOptions['duration'], customDate?: Date): Date {
  const now = new Date();

  switch (duration) {
    case 'tomorrow':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case '3days':
      return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    case '1week':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case '2weeks':
      return new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    case '1month':
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    case 'custom':
      return customDate || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
}

export function formatSnoozeDuration(duration: SnoozeOptions['duration']): string {
  switch (duration) {
    case 'tomorrow':
      return 'Tomorrow';
    case '3days':
      return '3 days';
    case '1week':
      return '1 week';
    case '2weeks':
      return '2 weeks';
    case '1month':
      return '1 month';
    case 'custom':
      return 'Custom date';
    default:
      return duration;
  }
}

export function formatDismissReason(reason: DismissReason): string {
  switch (reason) {
    case 'dropship':
      return 'Dropship item';
    case 'bulk_order':
      return 'Order in bulk';
    case 'seasonal':
      return 'Seasonal item';
    case 'low_priority':
      return 'Low priority';
    case 'discontinued':
      return 'Discontinued';
    case 'vendor_managed':
      return 'Vendor managed';
    case 'custom':
      return 'Other reason';
    default:
      return reason;
  }
}

// ============================================================================
// HOOK
// ============================================================================

export function useSkuDismissals(): UseSkuDismissalsResult {
  const [dismissals, setDismissals] = useState<SkuDismissal[]>([]);
  const [loading, setLoading] = useState(true);

  // Load dismissals on mount
  const loadDismissals = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_active_dismissals');

      if (error) {
        console.error('[useSkuDismissals] Failed to load dismissals:', error);
        return;
      }

      setDismissals(data || []);
    } catch (err) {
      console.error('[useSkuDismissals] Error loading dismissals:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDismissals();
  }, [loadDismissals]);

  // Check if a SKU is dismissed
  const isDismissed = useCallback((sku: string): boolean => {
    const normalizedSku = sku.toUpperCase().trim();
    return dismissals.some(d => d.sku.toUpperCase().trim() === normalizedSku);
  }, [dismissals]);

  // Get dismissal info for a SKU
  const getDismissal = useCallback((sku: string): SkuDismissal | undefined => {
    const normalizedSku = sku.toUpperCase().trim();
    return dismissals.find(d => d.sku.toUpperCase().trim() === normalizedSku);
  }, [dismissals]);

  // Dismiss a SKU
  const dismissSku = useCallback(async (sku: string, options: DismissOptions): Promise<boolean> => {
    try {
      const { error } = await supabase.rpc('dismiss_sku', {
        p_sku: sku.toUpperCase().trim(),
        p_dismiss_type: 'dismiss',
        p_dismiss_reason: options.reason,
        p_notes: options.notes || null,
        p_snooze_until: null,
      });

      if (error) {
        console.error('[useSkuDismissals] Failed to dismiss SKU:', error);
        return false;
      }

      // Refresh to get updated list
      await loadDismissals();
      return true;
    } catch (err) {
      console.error('[useSkuDismissals] Error dismissing SKU:', err);
      return false;
    }
  }, [loadDismissals]);

  // Snooze a SKU
  const snoozeSku = useCallback(async (sku: string, options: SnoozeOptions): Promise<boolean> => {
    try {
      const snoozeUntil = getSnoozeDate(options.duration, options.customDate);

      const { error } = await supabase.rpc('dismiss_sku', {
        p_sku: sku.toUpperCase().trim(),
        p_dismiss_type: 'snooze',
        p_dismiss_reason: null,
        p_notes: options.notes || null,
        p_snooze_until: snoozeUntil.toISOString(),
      });

      if (error) {
        console.error('[useSkuDismissals] Failed to snooze SKU:', error);
        return false;
      }

      await loadDismissals();
      return true;
    } catch (err) {
      console.error('[useSkuDismissals] Error snoozing SKU:', err);
      return false;
    }
  }, [loadDismissals]);

  // Un-dismiss a SKU
  const undismissSku = useCallback(async (sku: string): Promise<boolean> => {
    try {
      const { error } = await supabase.rpc('undismiss_sku', {
        p_sku: sku.toUpperCase().trim(),
      });

      if (error) {
        console.error('[useSkuDismissals] Failed to undismiss SKU:', error);
        return false;
      }

      await loadDismissals();
      return true;
    } catch (err) {
      console.error('[useSkuDismissals] Error undismissing SKU:', err);
      return false;
    }
  }, [loadDismissals]);

  return {
    dismissals,
    loading,
    isDismissed,
    getDismissal,
    dismissSku,
    snoozeSku,
    undismissSku,
    refresh: loadDismissals,
  };
}

export default useSkuDismissals;
