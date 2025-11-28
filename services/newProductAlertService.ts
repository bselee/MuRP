/**
 * New Product Alert Service
 *
 * Manages alerts for new SKUs, price changes, availability changes, and specification changes.
 * Provides functionality to create, read, update, and manage product alerts.
 */

import { supabase } from '../lib/supabase';

export interface NewProductAlert {
  id: string;
  sku: string;
  productName: string;
  category: string;
  vendorId?: string;
  vendorName?: string;
  alertType: 'new_sku' | 'price_change' | 'availability_change' | 'specification_change';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  message: string;
  details: Record<string, any>;
  isRead: boolean;
  readBy?: string;
  readAt?: string;
  expiresAt?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAlertInput {
  sku: string;
  productName: string;
  category: string;
  vendorId?: string;
  vendorName?: string;
  alertType: 'new_sku' | 'price_change' | 'availability_change' | 'specification_change';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  message: string;
  details?: Record<string, any>;
  expiresAt?: string;
}

/**
 * Get all alerts for the current user
 */
export const getUserAlerts = async (): Promise<{ success: boolean; data?: NewProductAlert[]; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('new_product_alerts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching alerts:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as NewProductAlert[] };
  } catch (err) {
    console.error('Failed to get user alerts:', err);
    return { success: false, error: 'Failed to load alerts' };
  }
};

/**
 * Get unread alerts count
 */
export const getUnreadAlertsCount = async (): Promise<{ success: boolean; count?: number; error?: string }> => {
  try {
    const { count, error } = await supabase
      .from('new_product_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false);

    if (error) {
      console.error('Error counting unread alerts:', error);
      return { success: false, error: error.message };
    }

    return { success: true, count };
  } catch (err) {
    console.error('Failed to get unread alerts count:', err);
    return { success: false, error: 'Failed to count unread alerts' };
  }
};

/**
 * Mark alert as read
 */
export const markAlertAsRead = async (alertId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { error } = await supabase
      .from('new_product_alerts')
      .update({
        is_read: true,
        read_by: user.id,
        read_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', alertId);

    if (error) {
      console.error('Error marking alert as read:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Failed to mark alert as read:', err);
    return { success: false, error: 'Failed to mark alert as read' };
  }
};

/**
 * Mark multiple alerts as read
 */
export const markAlertsAsRead = async (alertIds: string[]): Promise<{ success: boolean; error?: string }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { error } = await supabase
      .from('new_product_alerts')
      .update({
        is_read: true,
        read_by: user.id,
        read_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .in('id', alertIds);

    if (error) {
      console.error('Error marking alerts as read:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Failed to mark alerts as read:', err);
    return { success: false, error: 'Failed to mark alerts as read' };
  }
};

/**
 * Create a new product alert
 */
export const createAlert = async (alertData: CreateAlertInput): Promise<{ success: boolean; data?: NewProductAlert; error?: string }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const alertPayload = {
      sku: alertData.sku,
      product_name: alertData.productName,
      category: alertData.category,
      vendor_id: alertData.vendorId,
      vendor_name: alertData.vendorName,
      alert_type: alertData.alertType,
      priority: alertData.priority || 'normal',
      message: alertData.message,
      details: alertData.details || {},
      expires_at: alertData.expiresAt,
      created_by: user.id,
    };

    const { data, error } = await supabase
      .from('new_product_alerts')
      .insert(alertPayload)
      .select()
      .single();

    if (error) {
      console.error('Error creating alert:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as NewProductAlert };
  } catch (err) {
    console.error('Failed to create alert:', err);
    return { success: false, error: 'Failed to create alert' };
  }
};

/**
 * Delete an alert
 */
export const deleteAlert = async (alertId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('new_product_alerts')
      .delete()
      .eq('id', alertId);

    if (error) {
      console.error('Error deleting alert:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Failed to delete alert:', err);
    return { success: false, error: 'Failed to delete alert' };
  }
};

/**
 * Get alerts by SKU
 */
export const getAlertsBySku = async (sku: string): Promise<{ success: boolean; data?: NewProductAlert[]; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('new_product_alerts')
      .select('*')
      .eq('sku', sku)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching alerts by SKU:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as NewProductAlert[] };
  } catch (err) {
    console.error('Failed to get alerts by SKU:', err);
    return { success: false, error: 'Failed to load alerts for SKU' };
  }
};

/**
 * Get alerts by type
 */
export const getAlertsByType = async (alertType: string): Promise<{ success: boolean; data?: NewProductAlert[]; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('new_product_alerts')
      .select('*')
      .eq('alert_type', alertType)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching alerts by type:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as NewProductAlert[] };
  } catch (err) {
    console.error('Failed to get alerts by type:', err);
    return { success: false, error: 'Failed to load alerts by type' };
  }
};

/**
 * Clean up expired alerts
 */
export const cleanupExpiredAlerts = async (): Promise<{ success: boolean; deletedCount?: number; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('new_product_alerts')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      console.error('Error cleaning up expired alerts:', error);
      return { success: false, error: error.message };
    }

    return { success: true, deletedCount: data?.length || 0 };
  } catch (err) {
    console.error('Failed to cleanup expired alerts:', err);
    return { success: false, error: 'Failed to cleanup expired alerts' };
  }
};

/**
 * Get alert statistics
 */
export const getAlertStats = async (): Promise<{
  success: boolean;
  stats?: {
    total: number;
    unread: number;
    byType: Record<string, number>;
    byPriority: Record<string, number>;
  };
  error?: string;
}> => {
  try {
    // Get total count
    const { count: totalCount, error: totalError } = await supabase
      .from('new_product_alerts')
      .select('*', { count: 'exact', head: true });

    if (totalError) {
      return { success: false, error: totalError.message };
    }

    // Get unread count
    const { count: unreadCount, error: unreadError } = await supabase
      .from('new_product_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false);

    if (unreadError) {
      return { success: false, error: unreadError.message };
    }

    // Get counts by type
    const { data: typeData, error: typeError } = await supabase
      .from('new_product_alerts')
      .select('alert_type')
      .then(({ data, error }) => {
        if (error) return { data: null, error };
        const counts: Record<string, number> = {};
        data?.forEach(item => {
          counts[item.alert_type] = (counts[item.alert_type] || 0) + 1;
        });
        return { data: counts, error: null };
      });

    if (typeError) {
      return { success: false, error: typeError.message };
    }

    // Get counts by priority
    const { data: priorityData, error: priorityError } = await supabase
      .from('new_product_alerts')
      .select('priority')
      .then(({ data, error }) => {
        if (error) return { data: null, error };
        const counts: Record<string, number> = {};
        data?.forEach(item => {
          counts[item.priority] = (counts[item.priority] || 0) + 1;
        });
        return { data: counts, error: null };
      });

    if (priorityError) {
      return { success: false, error: priorityError.message };
    }

    return {
      success: true,
      stats: {
        total: totalCount || 0,
        unread: unreadCount || 0,
        byType: typeData || {},
        byPriority: priorityData || {},
      }
    };
  } catch (err) {
    console.error('Failed to get alert stats:', err);
    return { success: false, error: 'Failed to load alert statistics' };
  }
};