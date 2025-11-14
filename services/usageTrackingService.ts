/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📊 USAGE TRACKING SERVICE - Monitor Every AI Interaction with Grace
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This service provides comprehensive tracking and analytics for all AI operations,
 * enabling cost monitoring, usage attribution, and business intelligence.
 *
 * Features:
 * ✨ Real-time usage tracking per user/feature
 * ✨ Cost calculation and aggregation
 * ✨ Monthly reset and quota management
 * ✨ Analytics for business insights
 * ✨ Beautiful data aggregation and reporting
 *
 * @module services/usageTrackingService
 * @author TGF-MRP Development Team
 * @version 2.0.0 - AI Gateway Edition
 */

import { supabase } from '../lib/supabase/client';
import type { AIFeatureType, UsageStats } from './aiGatewayService';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Type Definitions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Usage record stored in database
 */
export interface UsageRecord {
  id?: string;
  user_id: string;
  feature_type: AIFeatureType;
  model_used: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  compliance_tier: 'basic' | 'full_ai';
  metadata?: Record<string, any>;
  created_at?: string;
}

/**
 * Aggregated usage statistics for a time period
 */
export interface AggregatedUsage {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  byFeature: Record<AIFeatureType, {
    requests: number;
    tokens: number;
    cost: number;
    averageCostPerRequest: number;
  }>;
  byModel: Record<string, {
    requests: number;
    tokens: number;
    cost: number;
  }>;
  timeRange: {
    start: string;
    end: string;
  };
}

/**
 * User usage summary for dashboard
 */
export interface UserUsageSummary {
  userId: string;
  tier: 'basic' | 'full_ai';
  currentMonth: {
    chatMessages: number;
    chatMessagesLimit: number;
    complianceScans: number;
    complianceScansLimit: number;
    totalCost: number;
    lastResetDate: string;
  };
  allTime: {
    totalRequests: number;
    totalCost: number;
    totalTokens: number;
  };
  topFeatures: Array<{
    feature: AIFeatureType;
    usage: number;
    percentage: number;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📝 Core Tracking Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Track a single AI usage event
 *
 * @param userId - User ID
 * @param featureType - Type of AI feature used
 * @param usage - Usage statistics from AI Gateway
 * @param metadata - Optional additional metadata
 *
 * @example
 * ```typescript
 * await trackUsage('user_123', 'chat', {
 *   promptTokens: 150,
 *   completionTokens: 300,
 *   totalTokens: 450,
 *   estimatedCost: 0.0023,
 *   modelUsed: 'openai/gpt-4o',
 *   timestamp: new Date().toISOString()
 * });
 * ```
 */
export async function trackUsage(
  userId: string,
  featureType: AIFeatureType,
  usage: UsageStats,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    // Get user's compliance tier
    const { data: profile } = await supabase
      .from('user_compliance_profiles')
      .select('compliance_tier')
      .eq('user_id', userId)
      .single();

    const tier = profile?.compliance_tier || 'basic';

    // Insert usage record
    const { error: insertError } = await supabase
      .from('ai_usage_tracking')
      .insert({
        user_id: userId,
        feature_type: featureType,
        model_used: usage.modelUsed,
        prompt_tokens: usage.promptTokens,
        completion_tokens: usage.completionTokens,
        total_tokens: usage.totalTokens,
        estimated_cost: usage.estimatedCost,
        compliance_tier: tier,
        metadata: metadata || {},
        created_at: usage.timestamp,
      });

    if (insertError) {
      console.error('❌ Failed to insert usage record:', insertError);
      throw insertError;
    }

    // Update user profile counters
    await updateUserCounters(userId, featureType, tier);

    console.log(`✅ Tracked ${featureType} usage for user ${userId}: ${usage.totalTokens} tokens, $${usage.estimatedCost.toFixed(6)}`);

  } catch (error) {
    console.error('🚨 Error tracking usage:', error);
    // Don't throw - we don't want tracking failures to break AI functionality
  }
}

/**
 * Update user's monthly counters
 *
 * @param userId - User ID
 * @param featureType - Feature type
 * @param tier - User tier
 */
async function updateUserCounters(
  userId: string,
  featureType: AIFeatureType,
  tier: 'basic' | 'full_ai'
): Promise<void> {
  if (featureType === 'chat') {
    // Increment chat message counter
    const { error } = await supabase.rpc('increment_chat_messages', {
      p_user_id: userId,
    });

    if (error) {
      console.error('Failed to increment chat counter:', error);
    }
  } else if (featureType === 'compliance') {
    // Increment compliance scan counter
    if (tier === 'basic') {
      // Decrement trial checks
      const { error } = await supabase.rpc('decrement_trial_checks', {
        p_user_id: userId,
      });

      if (error) {
        console.error('Failed to decrement trial checks:', error);
      }
    } else {
      // Increment monthly checks
      const { error } = await supabase.rpc('increment_compliance_checks', {
        p_user_id: userId,
      });

      if (error) {
        console.error('Failed to increment compliance checks:', error);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📈 Analytics and Reporting Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get aggregated usage statistics for a user in a time range
 *
 * @param userId - User ID
 * @param startDate - Start date (ISO string)
 * @param endDate - End date (ISO string)
 * @returns Aggregated usage statistics
 */
export async function getAggregatedUsage(
  userId: string,
  startDate: string,
  endDate: string
): Promise<AggregatedUsage> {
  const { data, error } = await supabase
    .from('ai_usage_tracking')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  if (error) {
    throw new Error(`Failed to fetch usage data: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      byFeature: {} as any,
      byModel: {},
      timeRange: { start: startDate, end: endDate },
    };
  }

  // Aggregate by feature
  const byFeature: Record<string, any> = {};
  const byModel: Record<string, any> = {};

  let totalRequests = 0;
  let totalTokens = 0;
  let totalCost = 0;

  for (const record of data) {
    totalRequests++;
    totalTokens += record.total_tokens;
    totalCost += record.estimated_cost;

    // By feature
    if (!byFeature[record.feature_type]) {
      byFeature[record.feature_type] = {
        requests: 0,
        tokens: 0,
        cost: 0,
        averageCostPerRequest: 0,
      };
    }

    byFeature[record.feature_type].requests++;
    byFeature[record.feature_type].tokens += record.total_tokens;
    byFeature[record.feature_type].cost += record.estimated_cost;

    // By model
    if (!byModel[record.model_used]) {
      byModel[record.model_used] = {
        requests: 0,
        tokens: 0,
        cost: 0,
      };
    }

    byModel[record.model_used].requests++;
    byModel[record.model_used].tokens += record.total_tokens;
    byModel[record.model_used].cost += record.estimated_cost;
  }

  // Calculate averages
  for (const feature in byFeature) {
    byFeature[feature].averageCostPerRequest =
      byFeature[feature].cost / byFeature[feature].requests;
  }

  return {
    totalRequests,
    totalTokens,
    totalCost,
    byFeature: byFeature as any,
    byModel,
    timeRange: { start: startDate, end: endDate },
  };
}

/**
 * Get user usage summary for dashboard display
 *
 * @param userId - User ID
 * @returns Comprehensive user usage summary
 */
export async function getUserUsageSummary(userId: string): Promise<UserUsageSummary> {
  // Get user profile
  const { data: profile, error: profileError } = await supabase
    .from('user_compliance_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (profileError || !profile) {
    throw new Error('User profile not found');
  }

  // Get current month stats
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const currentMonthUsage = await getAggregatedUsage(userId, startOfMonth, endOfMonth);

  // Get all-time stats
  const { data: allTimeData, error: allTimeError } = await supabase
    .from('ai_usage_tracking')
    .select('total_tokens, estimated_cost')
    .eq('user_id', userId);

  const allTimeStats = allTimeData?.reduce(
    (acc, record) => ({
      totalRequests: acc.totalRequests + 1,
      totalTokens: acc.totalTokens + record.total_tokens,
      totalCost: acc.totalCost + record.estimated_cost,
    }),
    { totalRequests: 0, totalTokens: 0, totalCost: 0 }
  ) || { totalRequests: 0, totalTokens: 0, totalCost: 0 };

  // Calculate top features
  const featureUsage = Object.entries(currentMonthUsage.byFeature).map(([feature, stats]) => ({
    feature: feature as AIFeatureType,
    usage: stats.requests,
    percentage: (stats.requests / currentMonthUsage.totalRequests) * 100,
  }));

  featureUsage.sort((a, b) => b.usage - a.usage);

  return {
    userId,
    tier: profile.compliance_tier,
    currentMonth: {
      chatMessages: profile.chat_messages_this_month || 0,
      chatMessagesLimit: profile.compliance_tier === 'basic' ? 100 : -1,
      complianceScans: profile.checks_this_month || 0,
      complianceScansLimit: profile.compliance_tier === 'basic'
        ? profile.trial_checks_remaining || 0
        : profile.monthly_check_limit || 50,
      totalCost: currentMonthUsage.totalCost,
      lastResetDate: profile.last_chat_reset_date || startOfMonth,
    },
    allTime: allTimeStats,
    topFeatures: featureUsage,
  };
}

/**
 * Get usage breakdown by feature for a user this month
 *
 * @param userId - User ID
 * @returns Feature breakdown with costs and usage
 */
export async function getMonthlyFeatureBreakdown(userId: string): Promise<{
  chat: { requests: number; cost: number };
  compliance: { requests: number; cost: number };
  vision: { requests: number; cost: number };
  embedding: { requests: number; cost: number };
}> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const usage = await getAggregatedUsage(userId, startOfMonth, endOfMonth);

  return {
    chat: {
      requests: usage.byFeature.chat?.requests || 0,
      cost: usage.byFeature.chat?.cost || 0,
    },
    compliance: {
      requests: usage.byFeature.compliance?.requests || 0,
      cost: usage.byFeature.compliance?.cost || 0,
    },
    vision: {
      requests: usage.byFeature.vision?.requests || 0,
      cost: usage.byFeature.vision?.cost || 0,
    },
    embedding: {
      requests: usage.byFeature.embedding?.requests || 0,
      cost: usage.byFeature.embedding?.cost || 0,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔄 Monthly Reset Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Reset monthly usage counters for a user
 * Called automatically at the start of each month
 *
 * @param userId - User ID
 */
export async function resetMonthlyUsage(userId: string): Promise<void> {
  const { error } = await supabase
    .from('user_compliance_profiles')
    .update({
      chat_messages_this_month: 0,
      checks_this_month: 0,
      last_chat_reset_date: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to reset monthly usage:', error);
    throw error;
  }

  console.log(`✅ Reset monthly usage for user ${userId}`);
}

/**
 * Check if a user's monthly counters need to be reset
 * Should be called before each usage check
 *
 * @param userId - User ID
 */
export async function checkAndResetIfNeeded(userId: string): Promise<void> {
  const { data: profile } = await supabase
    .from('user_compliance_profiles')
    .select('last_chat_reset_date')
    .eq('user_id', userId)
    .single();

  if (!profile) return;

  const lastReset = new Date(profile.last_chat_reset_date || 0);
  const now = new Date();

  // Check if we're in a new month
  if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
    await resetMonthlyUsage(userId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎁 Export Everything
// ═══════════════════════════════════════════════════════════════════════════

export default {
  trackUsage,
  getAggregatedUsage,
  getUserUsageSummary,
  getMonthlyFeatureBreakdown,
  resetMonthlyUsage,
  checkAndResetIfNeeded,
};
