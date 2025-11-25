import { supabase } from '../lib/supabase/client';
import type { ComponentSwapMap, ComponentSwapRule } from '../types';

const COMPONENT_SWAP_SETTING_KEY = 'bom_component_swaps';

interface ComponentSwapSettingPayload {
  rules?: ComponentSwapRule[];
}

const DEFAULT_SETTING_METADATA = {
  setting_key: COMPONENT_SWAP_SETTING_KEY,
  setting_category: 'bom',
  display_name: 'Component Swap Suggestions',
  description: 'Flagged component SKUs with preferred alternates for production planning',
  is_secret: false,
  is_required: false
};

const parseRules = (value: unknown): ComponentSwapRule[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return (value as ComponentSwapRule[]).map(rule => ({
      ...rule,
      suggestions: Array.isArray(rule?.suggestions) ? rule.suggestions : []
    }));
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as ComponentSwapSettingPayload;
    if (Array.isArray(obj.rules)) {
      return obj.rules.map(rule => ({
        ...rule,
        suggestions: Array.isArray(rule?.suggestions) ? rule.suggestions : []
      }));
    }
  }
  return [];
};

export const normalizeComponentSwapRules = (rules: ComponentSwapRule[]): ComponentSwapRule[] => {
  return (rules || [])
    .filter(rule => rule?.sku?.trim())
    .map(rule => ({
      ...rule,
      sku: rule.sku.trim().toUpperCase(),
      suggestions: (rule.suggestions || [])
        .filter(suggestion => suggestion?.sku?.trim())
        .map(suggestion => ({
          ...suggestion,
          sku: suggestion.sku.trim().toUpperCase()
        }))
    }))
    .filter(rule => rule.suggestions.length > 0);
};

export const mapComponentSwaps = (rules: ComponentSwapRule[]): ComponentSwapMap => {
  return normalizeComponentSwapRules(rules).reduce<ComponentSwapMap>((acc, rule) => {
    acc[rule.sku] = rule;
    return acc;
  }, {});
};

export async function fetchComponentSwapRules(): Promise<{ rules: ComponentSwapRule[]; updatedAt: string | null }> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_value, updated_at')
    .eq('setting_key', COMPONENT_SWAP_SETTING_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(`[ComponentSwapService] Failed to load swap settings: ${error.message}`);
  }

  const rules = parseRules(data?.setting_value);
  return { rules, updatedAt: data?.updated_at ?? null };
}

export async function saveComponentSwapRules(rules: ComponentSwapRule[]): Promise<void> {
  const sanitizedRules = normalizeComponentSwapRules(rules);

  const payload = {
    ...DEFAULT_SETTING_METADATA,
    setting_value: { rules: sanitizedRules },
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('app_settings')
    .upsert(payload, { onConflict: 'setting_key' });

  if (error) {
    throw new Error(`[ComponentSwapService] Failed to save swap settings: ${error.message}`);
  }
}
