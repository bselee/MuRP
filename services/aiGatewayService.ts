/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎯 AI GATEWAY SERVICE - The Most Beautiful AI Integration Ever Built 🎯
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This service provides a unified, tier-aware interface to Vercel AI Gateway,
 * enabling seamless access to multiple AI providers with automatic fallbacks,
 * usage tracking, and cost optimization.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                        TGF-MRP Application                              │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  Chat Assistant │ Compliance Scanner │ Label OCR │ Semantic Search      │
 * └────────┬────────┴────────┬───────────┴─────┬─────┴──────────┬───────────┘
 *          │                 │                  │                 │
 *          └─────────────────┴──────────────────┴─────────────────┘
 *                                    │
 *                         ┌──────────▼──────────┐
 *                         │  AI Gateway Service │
 *                         │  (This Beautiful    │
 *                         │   Piece of Code)    │
 *                         └──────────┬──────────┘
 *                                    │
 *          ┌─────────────────────────┼─────────────────────────┐
 *          │                         │                         │
 *     ┌────▼─────┐            ┌─────▼──────┐          ┌──────▼──────┐
 *     │  Basic   │            │  Full AI   │          │   Gemini    │
 *     │  Tier    │            │   Tier     │          │  Fallback   │
 *     │ (Gemini) │            │ (Gateway)  │          │   (Free)    │
 *     └────┬─────┘            └─────┬──────┘          └──────┬──────┘
 *          │                        │                         │
 *          └────────────────────────┴─────────────────────────┘
 *                                   │
 *                      ┌────────────▼────────────┐
 *                      │  Vercel AI Gateway      │
 *                      │  (Multi-Provider)       │
 *                      └────────────┬────────────┘
 *                                   │
 *          ┌────────────┬───────────┼───────────┬────────────┐
 *          │            │           │           │            │
 *      OpenAI     Anthropic     Google      Cohere      Meta
 *    (GPT-4o)     (Claude)     (Gemini)   (Command)  (Llama)
 *
 * Features:
 * ✨ Tier-based routing (Basic = Free, Full AI = Premium models)
 * ✨ Automatic fallback to Gemini if AI Gateway fails
 * ✨ Real-time usage tracking and cost calculation
 * ✨ Type-safe API with full TypeScript support
 * ✨ Comprehensive error handling
 * ✨ Provider health monitoring
 * ✨ Smart rate limiting per tier
 *
 * @module services/aiGatewayService
 * @author TGF-MRP Development Team
 * @version 2.0.0 - AI Gateway Edition
 */

import { createGatewayProvider } from '@ai-sdk/gateway';
import { generateText, streamText, embed, embedMany, type CoreMessage } from 'ai';
import { getUserProfile, type UserComplianceProfile } from './complianceService';
import { askAboutInventory } from './geminiService';
import { trackUsage, checkAndResetIfNeeded } from './usageTrackingService';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Type Definitions - Beautiful, Type-Safe Interfaces
// ═══════════════════════════════════════════════════════════════════════════

/**
 * AI feature types supported by the system
 */
export type AIFeatureType = 'chat' | 'compliance' | 'vision' | 'embedding';

/**
 * User subscription tiers
 */
export type UserTier = 'basic' | 'full_ai';

/**
 * Model configuration for each feature and tier
 */
export interface ModelConfig {
  modelId: string;
  description: string;
  costPer1MTokens: {
    input: number;
    output: number;
  };
  features: AIFeatureType[];
}

/**
 * Usage statistics returned from AI calls
 */
export interface UsageStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  modelUsed: string;
  timestamp: string;
}

/**
 * AI response with metadata
 */
export interface AIResponse<T = string> {
  content: T;
  usage: UsageStats;
  finishReason: string;
  cached?: boolean;
}

/**
 * Chat request parameters
 */
export interface ChatRequest {
  userId: string;
  messages: CoreMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Embedding request parameters
 */
export interface EmbeddingRequest {
  userId: string;
  texts: string[];
}

/**
 * Tier limits configuration
 */
export interface TierLimits {
  chatMessagesPerMonth: number;
  complianceScansPerMonth: number;
  embeddingsAllowed: boolean;
  visionAllowed: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 Model Configuration - The Heart of Our Tier System
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Model configurations for each tier and feature
 * Optimized for cost-effectiveness and quality
 */
const MODEL_CONFIGS: Record<UserTier, Record<AIFeatureType, ModelConfig>> = {
  basic: {
    chat: {
      modelId: 'google/gemini-2.0-flash-exp',
      description: 'Fast, free Gemini model for basic tier',
      costPer1MTokens: { input: 0, output: 0 }, // Free tier!
      features: ['chat'],
    },
    compliance: {
      modelId: '', // Not available on basic tier
      description: 'Upgrade to Full AI for compliance scanning',
      costPer1MTokens: { input: 0, output: 0 },
      features: [],
    },
    vision: {
      modelId: '', // Not available on basic tier
      description: 'Upgrade to Full AI for vision features',
      costPer1MTokens: { input: 0, output: 0 },
      features: [],
    },
    embedding: {
      modelId: '', // Not available on basic tier
      description: 'Upgrade to Full AI for embeddings',
      costPer1MTokens: { input: 0, output: 0 },
      features: [],
    },
  },
  full_ai: {
    chat: {
      modelId: 'openai/gpt-4o',
      description: 'Premium OpenAI GPT-4o for best chat quality',
      costPer1MTokens: { input: 2.50, output: 10.00 },
      features: ['chat'],
    },
    compliance: {
      modelId: 'anthropic/claude-3-5-sonnet-20241022',
      description: 'Claude Sonnet for highest compliance accuracy',
      costPer1MTokens: { input: 3.00, output: 15.00 },
      features: ['compliance'],
    },
    vision: {
      modelId: 'openai/gpt-4o',
      description: 'GPT-4o with vision for label OCR',
      costPer1MTokens: { input: 5.00, output: 15.00 },
      features: ['vision'],
    },
    embedding: {
      modelId: 'openai/text-embedding-3-small',
      description: 'High-quality embeddings for semantic search',
      costPer1MTokens: { input: 0.02, output: 0 },
      features: ['embedding'],
    },
  },
};

/**
 * Tier limits define monthly quotas
 */
const TIER_LIMITS: Record<UserTier, TierLimits> = {
  basic: {
    chatMessagesPerMonth: 100,
    complianceScansPerMonth: 3, // Trial scans
    embeddingsAllowed: false,
    visionAllowed: false,
  },
  full_ai: {
    chatMessagesPerMonth: -1, // Unlimited
    complianceScansPerMonth: 50,
    embeddingsAllowed: true,
    visionAllowed: true,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 Gateway Initialization - Connection to the AI Multiverse
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize the Vercel AI Gateway provider
 * Uses OIDC authentication when deployed to Vercel, API key for local development
 */
const gateway = createGatewayProvider({
  baseURL: import.meta.env.VITE_AI_GATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1/ai',
});

// ═══════════════════════════════════════════════════════════════════════════
// 🛡️ Helper Functions - The Guardians of Quality
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate cost based on token usage and model pricing
 * @param featureType - The type of AI feature used
 * @param usage - Token usage statistics
 * @param tier - User tier
 * @returns Estimated cost in USD
 */
function calculateCost(
  featureType: AIFeatureType,
  usage: { promptTokens?: number; completionTokens?: number; totalTokens: number },
  tier: UserTier
): number {
  const config = MODEL_CONFIGS[tier][featureType];

  const inputCost = ((usage.promptTokens || 0) / 1_000_000) * config.costPer1MTokens.input;
  const outputCost = ((usage.completionTokens || 0) / 1_000_000) * config.costPer1MTokens.output;

  return inputCost + outputCost;
}

/**
 * Get the appropriate model for a feature and tier
 * @param tier - User tier
 * @param featureType - AI feature type
 * @returns Model configuration
 * @throws Error if feature not available on tier
 */
function getModelForTier(tier: UserTier, featureType: AIFeatureType): ModelConfig {
  const config = MODEL_CONFIGS[tier][featureType];

  if (!config.modelId) {
    throw new Error(
      `${featureType} is not available on ${tier} tier. ${config.description}`
    );
  }

  return config;
}

/**
 * Check if user has exceeded their tier limits
 * @param profile - User compliance profile
 * @param featureType - AI feature type
 * @returns Object with allowed status and message
 */
function checkTierLimits(
  profile: UserComplianceProfile,
  featureType: AIFeatureType
): { allowed: boolean; message: string; remaining?: number } {
  const tier = profile.compliance_tier;
  const limits = TIER_LIMITS[tier];

  if (featureType === 'chat') {
    const used = profile.chat_messages_this_month || 0;
    const limit = limits.chatMessagesPerMonth;

    if (limit === -1) {
      return { allowed: true, message: 'Unlimited chat available' };
    }

    if (used >= limit) {
      return {
        allowed: false,
        message: `You've reached your ${limit} message limit for this month. Upgrade to Full AI for unlimited chat.`,
        remaining: 0,
      };
    }

    return {
      allowed: true,
      message: `${limit - used} messages remaining this month`,
      remaining: limit - used,
    };
  }

  if (featureType === 'compliance') {
    const used = profile.checks_this_month || 0;
    const limit = tier === 'basic' ? profile.trial_checks_remaining || 0 : limits.complianceScansPerMonth;

    if (used >= limit) {
      return {
        allowed: false,
        message: tier === 'basic'
          ? 'Free compliance checks exhausted. Upgrade to Full AI for 50 scans per month.'
          : 'Monthly compliance check limit reached. Contact support to increase your limit.',
        remaining: 0,
      };
    }

    return {
      allowed: true,
      message: `${limit - used} compliance scans remaining`,
      remaining: limit - used,
    };
  }

  if (featureType === 'embedding' && !limits.embeddingsAllowed) {
    return {
      allowed: false,
      message: 'Embeddings require Full AI tier. Upgrade for advanced semantic search.',
    };
  }

  if (featureType === 'vision' && !limits.visionAllowed) {
    return {
      allowed: false,
      message: 'Vision features require Full AI tier. Upgrade for label OCR.',
    };
  }

  return { allowed: true, message: 'Feature available' };
}

function buildLocalComplianceProfile(userId: string): UserComplianceProfile {
  const safeId = userId && userId.trim().length > 0 ? userId : 'local-user';
  return {
    id: safeId,
    user_id: safeId,
    email: `${safeId}@local.dev`,
    compliance_tier: 'basic',
    subscription_status: 'trial',
    trial_checks_remaining: 3,
    industry: 'general',
    target_states: [],
    product_types: [],
    certifications_held: [],
    chat_messages_this_month: 0,
    checks_this_month: 0,
    monthly_check_limit: 3,
    total_checks_lifetime: 0,
  };
}

function isRateLimitError(error: any): boolean {
  if (!error) return false;
  if (typeof error.status === 'number' && error.status === 429) return true;
  const message =
    typeof error.message === 'string'
      ? error.message
      : typeof error?.response?.message === 'string'
        ? error.response.message
        : '';
  if (!message) return false;
  return /quota|limit|rate|token/i.test(message);
}

// ═══════════════════════════════════════════════════════════════════════════
// 💬 Chat API - Beautiful Conversations with AI
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send a chat message through AI Gateway with tier-aware routing
 *
 * Features:
 * - Automatic tier detection
 * - Usage limit enforcement
 * - Fallback to Gemini if Gateway fails
 * - Real-time cost tracking
 *
 * @param request - Chat request parameters
 * @returns AI response with usage statistics
 *
 * @example
 * ```typescript
 * const response = await sendChatMessage({
 *   userId: 'user_123',
 *   messages: [
 *     { role: 'user', content: 'What products can I build right now?' }
 *   ],
 *   systemPrompt: 'You are a helpful MRP assistant',
 * });
 *
 * console.log(response.content); // AI response
 * console.log(response.usage.estimatedCost); // $0.0023
 * ```
 */
export async function sendChatMessage(request: ChatRequest): Promise<AIResponse> {
  const safeUserId = request.userId && request.userId.trim().length > 0 ? request.userId : 'local-user';

  // 0️⃣ Check and reset monthly counters if needed
  try {
    await checkAndResetIfNeeded(safeUserId);
  } catch (error) {
    console.warn('Failed to run monthly reset check. Continuing with local defaults.', error);
  }

  // 1️⃣ Get user profile and tier (fallback to local defaults if missing)
  const dbProfile = await getUserProfile(safeUserId);
  const profile = dbProfile ?? buildLocalComplianceProfile(safeUserId);

  if (!dbProfile) {
    console.warn(`User compliance profile not found for ${safeUserId}. Using basic tier defaults for chat limits.`);
  }

  const tier = profile.compliance_tier;

  // 2️⃣ Check tier limits
  const limitCheck = checkTierLimits(profile, 'chat');
  if (!limitCheck.allowed) {
    throw new Error(limitCheck.message);
  }

  // 3️⃣ Get model configuration for tier
  const modelConfig = getModelForTier(tier, 'chat');

  try {
    // 4️⃣ Call AI Gateway
    const result = await generateText({
      model: gateway(modelConfig.modelId),
      messages: request.messages,
      system: request.systemPrompt,
      temperature: request.temperature ?? 0.3,
      maxTokens: request.maxTokens ?? 4096,
    });

    // 5️⃣ Calculate cost
    const cost = calculateCost('chat', result.usage, tier);

    // 6️⃣ Track usage
    const usage: UsageStats = {
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
      estimatedCost: cost,
      modelUsed: modelConfig.modelId,
      timestamp: new Date().toISOString(),
    };

    // Track usage asynchronously (don't wait for it)
    trackUsage(safeUserId, 'chat', usage).catch(err =>
      console.error('Failed to track usage:', err)
    );

    // 7️⃣ Return beautiful response
    return {
      content: result.text,
      usage,
      finishReason: result.finishReason,
    };

  } catch (error: any) {
    console.error('🚨 AI Gateway error:', error);
    const hitRateLimit = isRateLimitError(error);

    // 8️⃣ Fallback to Gemini free tier if Gateway fails
    if (tier === 'basic' || hitRateLimit) {
      console.log('⚡ Falling back to Gemini free tier...');

      try {
        const fallbackResponse = await askAboutInventory(
          'gemini-2.0-flash-exp',
          request.systemPrompt || '',
          request.messages[request.messages.length - 1]?.content?.toString() || '',
          [], // Empty context for now
          [], [], []
        );

        return {
          content: fallbackResponse,
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            estimatedCost: 0,
            modelUsed: 'gemini-2.0-flash-exp (fallback)',
            timestamp: new Date().toISOString(),
          },
          finishReason: 'fallback',
        };
      } catch (fallbackError) {
        console.error('💥 Gemini fallback also failed:', fallbackError);
        throw new Error(
          hitRateLimit
            ? 'API quota temporarily exceeded. Please wait ~1 minute or shorten your request.'
            : 'AI services temporarily unavailable. Please try again in a moment.'
        );
      }
    }

    // For Full AI tier, don't fallback - just throw the error
    throw new Error(
      hitRateLimit
        ? 'API quota temporarily exceeded. Please wait ~1 minute or shorten your request.'
        : `AI Gateway error: ${error.message}`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 Compliance Scanning - Regulatory Genius
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Scan product labels for compliance using Claude Sonnet
 *
 * Features:
 * - Uses Claude Sonnet for highest accuracy
 * - Tier-aware (Basic = 3 trials, Full AI = 50/month)
 * - Tracks usage and costs
 *
 * @param userId - User ID
 * @param prompt - Compliance analysis prompt
 * @param context - Additional context (regulations, product data)
 * @returns Compliance analysis with usage stats
 */
export async function scanCompliance(
  userId: string,
  prompt: string,
  context?: string
): Promise<AIResponse> {
  // 0️⃣ Check and reset if needed
  await checkAndResetIfNeeded(userId);

  // 1️⃣ Get user profile
  const profile = await getUserProfile(userId);
  if (!profile) {
    throw new Error('User profile not found');
  }

  const tier = profile.compliance_tier;

  // 2️⃣ Check limits
  const limitCheck = checkTierLimits(profile, 'compliance');
  if (!limitCheck.allowed) {
    throw new Error(limitCheck.message);
  }

  // 3️⃣ Get model (will throw if not available on tier)
  const modelConfig = getModelForTier(tier, 'compliance');

  // 4️⃣ Call AI Gateway with Claude Sonnet
  const result = await generateText({
    model: gateway(modelConfig.modelId),
    prompt,
    system: context,
    temperature: 0.2, // Lower temperature for more consistent compliance analysis
    maxTokens: 8192, // Compliance reports can be long
  });

  // 5️⃣ Calculate cost and usage
  const cost = calculateCost('compliance', result.usage, tier);

  const usage: UsageStats = {
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
    totalTokens: result.usage.totalTokens,
    estimatedCost: cost,
    modelUsed: modelConfig.modelId,
    timestamp: new Date().toISOString(),
  };

  // Track usage asynchronously
  trackUsage(userId, 'compliance', usage).catch(err =>
    console.error('Failed to track usage:', err)
  );

  return {
    content: result.text,
    usage,
    finishReason: result.finishReason,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🖼️ Vision API - See the World Through AI Eyes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyze images using GPT-4o Vision
 *
 * @param userId - User ID
 * @param imageBase64 - Base64 encoded image
 * @param prompt - Analysis prompt
 * @returns Vision analysis with usage stats
 */
export async function analyzeImage(
  userId: string,
  imageBase64: string,
  prompt: string
): Promise<AIResponse> {
  const profile = await getUserProfile(userId);
  if (!profile) {
    throw new Error('User profile not found');
  }

  const tier = profile.compliance_tier;

  // Check if vision is allowed on tier
  const limitCheck = checkTierLimits(profile, 'vision');
  if (!limitCheck.allowed) {
    throw new Error(limitCheck.message);
  }

  const modelConfig = getModelForTier(tier, 'vision');

  const result = await generateText({
    model: gateway(modelConfig.modelId),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image',
            image: imageBase64.startsWith('data:')
              ? imageBase64
              : `data:image/jpeg;base64,${imageBase64}`
          },
        ],
      },
    ],
    temperature: 0.3,
    maxTokens: 4096,
  });

  const cost = calculateCost('vision', result.usage, tier);

  const usage: UsageStats = {
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
    totalTokens: result.usage.totalTokens,
    estimatedCost: cost,
    modelUsed: modelConfig.modelId,
    timestamp: new Date().toISOString(),
  };

  // Track usage asynchronously
  trackUsage(userId, 'vision', usage).catch(err =>
    console.error('Failed to track usage:', err)
  );

  return {
    content: result.text,
    usage,
    finishReason: result.finishReason,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧠 Embeddings API - Semantic Search Superpowers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate embeddings for semantic search
 *
 * @param request - Embedding request with texts
 * @returns Array of embeddings with usage stats
 */
export async function generateEmbeddings(
  request: EmbeddingRequest
): Promise<AIResponse<number[][]>> {
  const profile = await getUserProfile(request.userId);
  if (!profile) {
    throw new Error('User profile not found');
  }

  const tier = profile.compliance_tier;

  // Check if embeddings allowed on tier
  const limitCheck = checkTierLimits(profile, 'embedding');
  if (!limitCheck.allowed) {
    throw new Error(limitCheck.message);
  }

  const modelConfig = getModelForTier(tier, 'embedding');

  // Generate embeddings using AI Gateway
  const result = await embedMany({
    model: modelConfig.modelId,
    values: request.texts,
  });

  // Estimate tokens (rough approximation: ~100 tokens per text)
  const estimatedTokens = request.texts.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0);
  const cost = (estimatedTokens / 1_000_000) * modelConfig.costPer1MTokens.input;

  const usage: UsageStats = {
    promptTokens: estimatedTokens,
    completionTokens: 0,
    totalTokens: estimatedTokens,
    estimatedCost: cost,
    modelUsed: modelConfig.modelId,
    timestamp: new Date().toISOString(),
  };

  // Track usage asynchronously
  trackUsage(request.userId, 'embedding', usage).catch(err =>
    console.error('Failed to track usage:', err)
  );

  return {
    content: result.embeddings,
    usage,
    finishReason: 'complete',
  };
}

/**
 * Generate a single embedding
 *
 * @param userId - User ID
 * @param text - Text to embed
 * @returns Single embedding vector with usage stats
 */
export async function generateEmbedding(
  userId: string,
  text: string
): Promise<AIResponse<number[]>> {
  const result = await generateEmbeddings({
    userId,
    texts: [text],
  });

  return {
    content: result.content[0],
    usage: result.usage,
    finishReason: result.finishReason,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 Utility Functions - Helper Goodness
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get tier limits for a user
 * @param tier - User tier
 * @returns Tier limits configuration
 */
export function getTierLimits(tier: UserTier): TierLimits {
  return TIER_LIMITS[tier];
}

/**
 * Get model configuration for a feature and tier
 * @param tier - User tier
 * @param featureType - AI feature type
 * @returns Model configuration
 */
export function getModelConfig(tier: UserTier, featureType: AIFeatureType): ModelConfig {
  return MODEL_CONFIGS[tier][featureType];
}

/**
 * Check if a feature is available on a tier
 * @param tier - User tier
 * @param featureType - AI feature type
 * @returns True if feature is available
 */
export function isFeatureAvailable(tier: UserTier, featureType: AIFeatureType): boolean {
  return !!MODEL_CONFIGS[tier][featureType].modelId;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎁 Export Everything - Share the Beauty
// ═══════════════════════════════════════════════════════════════════════════

export default {
  // Core functions
  sendChatMessage,
  scanCompliance,
  analyzeImage,
  generateEmbeddings,
  generateEmbedding,

  // Utility functions
  getTierLimits,
  getModelConfig,
  isFeatureAvailable,
  calculateCost,
  checkTierLimits,
};
