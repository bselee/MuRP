// ============================================================================
// AI Provider Service - Unified interface for all AI providers
// Supports: Gemini (default), OpenAI, Anthropic, Azure OpenAI
// ============================================================================

import { supabase } from '../lib/supabase/client';

// AI Provider Types
export type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'azure';

export interface AIProviderConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  endpoint?: string; // For Azure custom endpoints
}

export interface AIRequest {
  systemPrompt?: string;
  userPrompt: string;
  imageData?: string; // Base64 encoded image for vision models
  temperature?: number;
  maxTokens?: number;
}

export interface AIResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

// Default model configurations
const DEFAULT_MODELS: Record<AIProvider, string> = {
  gemini: 'gemini-1.5-flash-latest',
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
  azure: 'gpt-4o', // User must configure deployment name
};

// ============================================================================
// Settings Management
// ============================================================================

/**
 * Get current AI provider settings from database
 */
export async function getAIProviderSettings(): Promise<AIProviderConfig> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .eq('setting_key', 'ai_provider_config')
    .single();

  if (error || !data) {
    // Return Gemini as default
    return {
      provider: 'gemini',
      apiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
      model: DEFAULT_MODELS.gemini,
      temperature: 0.3,
      maxTokens: 4096,
    };
  }

  return data.setting_value as AIProviderConfig;
}

/**
 * Update AI provider settings
 */
export async function updateAIProviderSettings(config: Partial<AIProviderConfig>): Promise<void> {
  const currentSettings = await getAIProviderSettings();
  const newSettings = { ...currentSettings, ...config };

  const { error } = await supabase
    .from('app_settings')
    .upsert({
      setting_key: 'ai_provider_config',
      setting_value: newSettings,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    throw new Error(`Failed to update AI provider settings: ${error.message}`);
  }
}

/**
 * Test AI provider connection
 */
export async function testAIProviderConnection(config: AIProviderConfig): Promise<boolean> {
  try {
    const response = await callAI(
      {
        userPrompt: 'Respond with "OK" if you can read this.',
        temperature: 0.1,
        maxTokens: 10,
      },
      config
    );
    return response.content.toLowerCase().includes('ok');
  } catch (error) {
    console.error('AI provider test failed:', error);
    return false;
  }
}

// ============================================================================
// Provider-Specific Implementations
// ============================================================================

/**
 * Call Gemini API
 */
async function callGemini(request: AIRequest, config: AIProviderConfig): Promise<AIResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

  const contents: any[] = [];

  if (request.systemPrompt) {
    contents.push({
      role: 'user',
      parts: [{ text: request.systemPrompt }],
    });
    contents.push({
      role: 'model',
      parts: [{ text: 'Understood. I will follow these instructions.' }],
    });
  }

  const userParts: any[] = [{ text: request.userPrompt }];
  if (request.imageData) {
    userParts.push({
      inline_data: {
        mime_type: 'image/jpeg',
        data: request.imageData,
      },
    });
  }

  contents.push({
    role: 'user',
    parts: userParts,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: request.temperature ?? config.temperature ?? 0.3,
        maxOutputTokens: request.maxTokens ?? config.maxTokens ?? 4096,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Gemini API error: ${response.status} - ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];

  if (!candidate) {
    throw new Error('No response from Gemini');
  }

  return {
    content: candidate.content.parts[0].text,
    model: config.model,
    usage: {
      promptTokens: data.usageMetadata?.promptTokenCount || 0,
      completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: data.usageMetadata?.totalTokenCount || 0,
    },
    finishReason: candidate.finishReason,
  };
}

/**
 * Call OpenAI API
 */
async function callOpenAI(request: AIRequest, config: AIProviderConfig): Promise<AIResponse> {
  const messages: any[] = [];

  if (request.systemPrompt) {
    messages.push({
      role: 'system',
      content: request.systemPrompt,
    });
  }

  const userContent: any[] = [{ type: 'text', text: request.userPrompt }];
  if (request.imageData) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: `data:image/jpeg;base64,${request.imageData}`,
      },
    });
  }

  messages.push({
    role: 'user',
    content: userContent,
  });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: request.temperature ?? config.temperature ?? 0.3,
      max_tokens: request.maxTokens ?? config.maxTokens ?? 4096,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API error: ${response.status} - ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();

  return {
    content: data.choices[0].message.content,
    model: data.model,
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
    finishReason: data.choices[0].finish_reason,
  };
}

/**
 * Call Anthropic Claude API
 */
async function callAnthropic(request: AIRequest, config: AIProviderConfig): Promise<AIResponse> {
  const content: any[] = [{ type: 'text', text: request.userPrompt }];

  if (request.imageData) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: request.imageData,
      },
    });
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: request.maxTokens ?? config.maxTokens ?? 4096,
      temperature: request.temperature ?? config.temperature ?? 0.3,
      system: request.systemPrompt,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error: ${response.status} - ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();

  return {
    content: data.content[0].text,
    model: data.model,
    usage: {
      promptTokens: data.usage?.input_tokens || 0,
      completionTokens: data.usage?.output_tokens || 0,
      totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
    finishReason: data.stop_reason,
  };
}

/**
 * Call Azure OpenAI API
 */
async function callAzureOpenAI(request: AIRequest, config: AIProviderConfig): Promise<AIResponse> {
  if (!config.endpoint) {
    throw new Error('Azure OpenAI requires an endpoint URL');
  }

  const messages: any[] = [];

  if (request.systemPrompt) {
    messages.push({
      role: 'system',
      content: request.systemPrompt,
    });
  }

  const userContent: any[] = [{ type: 'text', text: request.userPrompt }];
  if (request.imageData) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: `data:image/jpeg;base64,${request.imageData}`,
      },
    });
  }

  messages.push({
    role: 'user',
    content: userContent,
  });

  const url = `${config.endpoint}/openai/deployments/${config.model}/chat/completions?api-version=2024-02-15-preview`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': config.apiKey,
    },
    body: JSON.stringify({
      messages,
      temperature: request.temperature ?? config.temperature ?? 0.3,
      max_tokens: request.maxTokens ?? config.maxTokens ?? 4096,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Azure OpenAI API error: ${response.status} - ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();

  return {
    content: data.choices[0].message.content,
    model: config.model,
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
    finishReason: data.choices[0].finish_reason,
  };
}

// ============================================================================
// Unified Interface
// ============================================================================

/**
 * Call AI with current app settings or override config
 */
export async function callAI(
  request: AIRequest,
  overrideConfig?: AIProviderConfig
): Promise<AIResponse> {
  const config = overrideConfig || (await getAIProviderSettings());

  switch (config.provider) {
    case 'gemini':
      return callGemini(request, config);
    case 'openai':
      return callOpenAI(request, config);
    case 'anthropic':
      return callAnthropic(request, config);
    case 'azure':
      return callAzureOpenAI(request, config);
    default:
      throw new Error(`Unsupported AI provider: ${config.provider}`);
  }
}

/**
 * Get available models for a provider
 */
export function getAvailableModels(provider: AIProvider): string[] {
  const models: Record<AIProvider, string[]> = {
    gemini: [
      'gemini-1.5-flash-latest',
      'gemini-1.5-pro-latest',
      'gemini-1.5-flash-8b-latest',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
    ],
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    anthropic: [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ],
    azure: ['gpt-4o', 'gpt-4', 'gpt-35-turbo'], // Deployment names configured by user
  };

  return models[provider] || [];
}

/**
 * Get default model for provider
 */
export function getDefaultModel(provider: AIProvider): string {
  return DEFAULT_MODELS[provider];
}

/**
 * Validate API key format (basic check)
 */
export function validateAPIKey(provider: AIProvider, apiKey: string): boolean {
  const patterns: Record<AIProvider, RegExp> = {
    gemini: /^AIza[0-9A-Za-z_-]{35}$/,
    openai: /^sk-[A-Za-z0-9]{20,}$/,
    anthropic: /^sk-ant-[A-Za-z0-9_-]{95,}$/,
    azure: /.{32,}/, // Azure keys are more variable
  };

  return patterns[provider]?.test(apiKey) ?? false;
}
