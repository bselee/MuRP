// Token counter and usage tracking service for AI Settings (Phase 1.5)

import type { AiSettings } from '../types';

/**
 * Estimate token count for a given text
 * Uses simple heuristic: ~4 characters per token (average for English text)
 * This is an approximation - actual token count may vary
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // Remove extra whitespace and count characters
  const cleanText = text.replace(/\s+/g, ' ').trim();
  const charCount = cleanText.length;

  // Rough estimate: 4 characters per token
  const estimatedTokens = Math.ceil(charCount / 4);

  return estimatedTokens;
}

/**
 * Calculate the total tokens for a chat interaction
 * @param question User's question
 * @param context Stringified context data sent to AI
 * @param response AI's response
 */
export function calculateInteractionTokens(
  question: string,
  context: string,
  response: string
): { input: number; output: number; total: number } {
  const inputTokens = estimateTokens(question) + estimateTokens(context);
  const outputTokens = estimateTokens(response);
  const totalTokens = inputTokens + outputTokens;

  return { input: inputTokens, output: outputTokens, total: totalTokens };
}

/**
 * Track usage for a single AI interaction and update settings
 * @param question User's question
 * @param context Stringified context data
 * @param response AI's response
 * @param currentSettings Current AI settings
 * @returns Updated AI settings with new usage data
 */
export function trackUsage(
  question: string,
  context: string,
  response: string,
  currentSettings: AiSettings
): AiSettings {
  const tokens = calculateInteractionTokens(question, context, response);

  // Check if we need to reset monthly counters
  const now = new Date();
  const lastReset = new Date(currentSettings.lastResetDate);
  const shouldReset =
    now.getMonth() !== lastReset.getMonth() ||
    now.getFullYear() !== lastReset.getFullYear();

  let tokensUsed = currentSettings.tokensUsedThisMonth + tokens.total;
  let queriesCount = currentSettings.queriesThisMonth + 1;
  let resetDate = currentSettings.lastResetDate;

  if (shouldReset) {
    // Reset monthly counters
    tokensUsed = tokens.total;
    queriesCount = 1;
    resetDate = now.toISOString();
  }

  // Calculate estimated monthly cost
  const estimatedCost = calculateCost(tokensUsed, currentSettings.model);

  return {
    ...currentSettings,
    tokensUsedThisMonth: tokensUsed,
    queriesThisMonth: queriesCount,
    lastResetDate: resetDate,
    estimatedMonthlyCost: estimatedCost,
  };
}

/**
 * Calculate estimated cost based on tokens used and model
 * Pricing as of 2024 (https://ai.google.dev/pricing):
 *
 * Free Tier (all models):
 * - Up to 15 requests/minute
 * - Up to 1M tokens/minute
 * - Up to 1,500 requests/day
 *
 * Pay-as-you-go (above free tier):
 * - gemini-1.5-flash: $0.075 per 1M input tokens, $0.30 per 1M output tokens
 * - gemini-1.5-pro: $1.25 per 1M input tokens, $5.00 per 1M output tokens
 * - gemini-2.5-flash: $0.15 per 1M input tokens, $0.60 per 1M output tokens
 *
 * For simplicity, we'll use average cost per token assuming 80% input / 20% output ratio
 */
export function calculateCost(totalTokens: number, model: string): number {
  // If under free tier daily limit (~41,666 tokens/day = 1,250,000/month), cost is $0
  const freeMonthlyLimit = 1_250_000; // Rough estimate based on 1M tokens/minute

  if (totalTokens <= freeMonthlyLimit) {
    return 0;
  }

  // Billable tokens (above free tier)
  const billableTokens = totalTokens - freeMonthlyLimit;

  // Cost per 1M tokens (weighted average: 80% input, 20% output)
  let costPer1MTokens = 0;

  if (model.includes('gemini-1.5-flash')) {
    costPer1MTokens = (0.075 * 0.8) + (0.30 * 0.2); // $0.12 per 1M tokens
  } else if (model.includes('gemini-1.5-pro')) {
    costPer1MTokens = (1.25 * 0.8) + (5.00 * 0.2); // $2.00 per 1M tokens
  } else if (model.includes('gemini-2.5-flash')) {
    costPer1MTokens = (0.15 * 0.8) + (0.60 * 0.2); // $0.24 per 1M tokens
  } else {
    // Default to flash pricing
    costPer1MTokens = 0.12;
  }

  const cost = (billableTokens / 1_000_000) * costPer1MTokens;
  return parseFloat(cost.toFixed(4)); // Round to 4 decimal places
}

/**
 * Get default AI settings
 */
export function getDefaultAiSettings(): AiSettings {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  return {
    model: 'gemini-2.5-flash',
    tokensUsedThisMonth: 0,
    queriesThisMonth: 0,
    lastResetDate: firstDayOfMonth.toISOString(),
    monthlyTokenLimit: 1_250_000, // Free tier approximate limit
    alertThreshold: 80, // Alert at 80% usage
    maxContextItems: 20, // Default from Phase 0
    enableSmartFiltering: true,
    estimatedMonthlyCost: 0,
  };
}

/**
 * Check if usage has exceeded alert threshold
 */
export function shouldShowAlert(settings: AiSettings): boolean {
  const usagePercent = (settings.tokensUsedThisMonth / settings.monthlyTokenLimit) * 100;
  return usagePercent >= settings.alertThreshold;
}

/**
 * Get usage percentage (0-100)
 */
export function getUsagePercentage(settings: AiSettings): number {
  const percent = (settings.tokensUsedThisMonth / settings.monthlyTokenLimit) * 100;
  return Math.min(Math.round(percent), 100); // Cap at 100%
}

/**
 * Format number with commas for display
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Get color class for usage indicator based on percentage
 */
export function getUsageColorClass(percentage: number): string {
  if (percentage < 50) return 'text-green-600';
  if (percentage < 80) return 'text-yellow-600';
  return 'text-red-600';
}
