import { supabase } from '../lib/supabase/client';
import type { PurchaseOrder, POTrackingStatus } from '../types';

interface AutonomousSettings {
  id: string;
  autonomous_shipping_enabled: boolean;
  autonomous_pricing_enabled: boolean;
  require_approval_for_shipping: boolean;
  require_approval_for_pricing: boolean;
  auto_approve_below_threshold: number;
}

interface AutonomousUpdate {
  type: 'shipping' | 'pricing';
  poId: string;
  changes: Record<string, any>;
  source: 'email' | 'api' | 'carrier';
  confidence: number;
  requiresApproval: boolean;
}

/**
 * Service for handling autonomous PO updates (shipping status and pricing)
 */
export class AutonomousPOService {
  private static instance: AutonomousPOService;
  private settings: AutonomousSettings | null = null;
  private settingsLoadedAt: number = 0;
  private readonly SETTINGS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  static getInstance(): AutonomousPOService {
    if (!AutonomousPOService.instance) {
      AutonomousPOService.instance = new AutonomousPOService();
    }
    return AutonomousPOService.instance;
  }

  /**
   * Get current autonomous settings with caching
   */
  async getSettings(): Promise<AutonomousSettings | null> {
    const now = Date.now();

    // Return cached settings if still valid
    if (this.settings && (now - this.settingsLoadedAt) < this.SETTINGS_CACHE_DURATION) {
      return this.settings;
    }

    try {
      const { data, error } = await supabase
        .from('autonomous_po_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error loading autonomous settings:', error);
        return null;
      }

      this.settings = data || null;
      this.settingsLoadedAt = now;
      return this.settings;
    } catch (error) {
      console.error('Failed to load autonomous settings:', error);
      return null;
    }
  }

  /**
   * Process an autonomous shipping update
   */
  async processShippingUpdate(
    poId: string,
    newStatus: POTrackingStatus,
    trackingData: {
      carrier?: string;
      trackingNumber?: string;
      estimatedDelivery?: string;
      location?: string;
    },
    source: 'email' | 'api' | 'carrier' = 'carrier',
    confidence: number = 0.8
  ): Promise<{ applied: boolean; requiresApproval: boolean; reason?: string }> {
    const settings = await this.getSettings();

    if (!settings?.autonomous_shipping_enabled) {
      return {
        applied: false,
        requiresApproval: false,
        reason: 'Autonomous shipping updates are disabled'
      };
    }

    // Check if this is a significant status change that might need approval
    const significantStatuses: POTrackingStatus[] = ['delivered', 'exception', 'cancelled'];
    const requiresApproval = settings.require_approval_for_shipping &&
                            significantStatuses.includes(newStatus);

    const update: AutonomousUpdate = {
      type: 'shipping',
      poId,
      changes: {
        trackingStatus: newStatus,
        ...trackingData,
        lastAutonomousUpdate: new Date().toISOString(),
        autonomousUpdateSource: source,
        autonomousConfidence: confidence,
      },
      source,
      confidence,
      requiresApproval,
    };

    if (requiresApproval) {
      // Create approval request instead of applying directly
      await this.createApprovalRequest(update);
      return {
        applied: false,
        requiresApproval: true,
        reason: 'Update requires manual approval'
      };
    } else {
      // Apply the update directly
      await this.applyShippingUpdate(update);
      return {
        applied: true,
        requiresApproval: false
      };
    }
  }

  /**
   * Process an autonomous pricing update
   */
  async processPricingUpdate(
    poId: string,
    itemUpdates: Array<{
      itemId: string;
      oldPrice: number;
      newPrice: number;
      reason?: string;
    }>,
    source: 'email' | 'api' = 'email',
    confidence: number = 0.7
  ): Promise<{ applied: boolean; requiresApproval: boolean; reason?: string }> {
    const settings = await this.getSettings();

    if (!settings?.autonomous_pricing_enabled) {
      return {
        applied: false,
        requiresApproval: false,
        reason: 'Autonomous pricing updates are disabled'
      };
    }

    // Calculate total price change
    const totalChange = itemUpdates.reduce((sum, item) => sum + Math.abs(item.newPrice - item.oldPrice), 0);

    // Check if changes exceed auto-approval threshold
    const requiresApproval = settings.require_approval_for_pricing ||
                            totalChange >= settings.auto_approve_below_threshold;

    const update: AutonomousUpdate = {
      type: 'pricing',
      poId,
      changes: {
        itemPriceUpdates: itemUpdates,
        totalPriceChange: totalChange,
        lastAutonomousUpdate: new Date().toISOString(),
        autonomousUpdateSource: source,
        autonomousConfidence: confidence,
      },
      source,
      confidence,
      requiresApproval,
    };

    if (requiresApproval) {
      // Create approval request
      await this.createApprovalRequest(update);
      return {
        applied: false,
        requiresApproval: true,
        reason: `Price change of $${totalChange.toFixed(2)} requires approval`
      };
    } else {
      // Apply the update directly
      await this.applyPricingUpdate(update);
      return {
        applied: true,
        requiresApproval: false
      };
    }
  }

  /**
   * Create an approval request for autonomous updates
   */
  private async createApprovalRequest(update: AutonomousUpdate): Promise<void> {
    const { error } = await supabase
      .from('autonomous_update_approvals')
      .insert({
        po_id: update.poId,
        update_type: update.type,
        changes: update.changes,
        source: update.source,
        confidence: update.confidence,
        status: 'pending',
        requested_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Failed to create approval request:', error);
      throw error;
    }

    // TODO: Send notification to admins about pending approval
    console.log(`Created approval request for ${update.type} update on PO ${update.poId}`);
  }

  /**
   * Apply shipping update directly
   */
  private async applyShippingUpdate(update: AutonomousUpdate): Promise<void> {
    const { error } = await supabase
      .from('purchase_orders')
      .update(update.changes)
      .eq('id', update.poId);

    if (error) {
      console.error('Failed to apply autonomous shipping update:', error);
      throw error;
    }

    // Log the autonomous update
    await this.logAutonomousUpdate(update);

    console.log(`Applied autonomous shipping update to PO ${update.poId}`);
  }

  /**
   * Apply pricing update directly
   */
  private async applyPricingUpdate(update: AutonomousUpdate): Promise<void> {
    // Update PO items with new prices
    const itemUpdates = update.changes.itemPriceUpdates as Array<{
      itemId: string;
      newPrice: number;
    }>;

    for (const itemUpdate of itemUpdates) {
      const { error } = await supabase
        .from('purchase_order_items')
        .update({
          unit_price: itemUpdate.newPrice,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemUpdate.itemId);

      if (error) {
        console.error('Failed to update item price:', error);
        throw error;
      }
    }

    // Update PO metadata
    const { error: poError } = await supabase
      .from('purchase_orders')
      .update({
        lastAutonomousUpdate: update.changes.lastAutonomousUpdate,
        autonomousUpdateSource: update.changes.autonomousUpdateSource,
        autonomousConfidence: update.changes.autonomousConfidence,
      })
      .eq('id', update.poId);

    if (poError) {
      console.error('Failed to update PO metadata:', poError);
      throw poError;
    }

    // Log the autonomous update
    await this.logAutonomousUpdate(update);

    console.log(`Applied autonomous pricing update to PO ${update.poId}`);
  }

  /**
   * Log autonomous update for audit trail
   */
  private async logAutonomousUpdate(update: AutonomousUpdate): Promise<void> {
    const { error } = await supabase
      .from('autonomous_update_log')
      .insert({
        po_id: update.poId,
        update_type: update.type,
        changes: update.changes,
        source: update.source,
        confidence: update.confidence,
        applied_at: new Date().toISOString(),
        applied_by: 'autonomous_system',
      });

    if (error) {
      console.error('Failed to log autonomous update:', error);
      // Don't throw here - logging failure shouldn't stop the update
    }
  }

  /**
   * Get pending approval requests
   */
  async getPendingApprovals(): Promise<any[]> {
    const { data, error } = await supabase
      .from('autonomous_update_approvals')
      .select(`
        *,
        purchase_orders (
          id,
          order_id,
          vendor_name
        )
      `)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch pending approvals:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Approve or reject an autonomous update
   */
  async processApproval(
    approvalId: string,
    approved: boolean,
    reviewedBy: string,
    notes?: string
  ): Promise<void> {
    // Get the approval request
    const { data: approval, error: fetchError } = await supabase
      .from('autonomous_update_approvals')
      .select('*')
      .eq('id', approvalId)
      .single();

    if (fetchError || !approval) {
      throw new Error('Approval request not found');
    }

    // Update approval status
    const { error: updateError } = await supabase
      .from('autonomous_update_approvals')
      .update({
        status: approved ? 'approved' : 'rejected',
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        review_notes: notes,
      })
      .eq('id', approvalId);

    if (updateError) {
      throw updateError;
    }

    if (approved) {
      // Apply the update
      const update: AutonomousUpdate = {
        type: approval.update_type,
        poId: approval.po_id,
        changes: approval.changes,
        source: approval.source,
        confidence: approval.confidence,
        requiresApproval: false, // Already approved
      };

      if (update.type === 'shipping') {
        await this.applyShippingUpdate(update);
      } else if (update.type === 'pricing') {
        await this.applyPricingUpdate(update);
      }
    }
  }
}

export const autonomousPOService = AutonomousPOService.getInstance();