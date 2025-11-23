import { useCallback, useMemo } from 'react';
import usePersistentState from './usePersistentState';

export type ShopifySalesSource = 'shopify' | 'shopify+finale' | 'shopify+fishbowl' | 'shopify+spreadsheets';
export type ShopifySetupStatus = 'disabled' | 'planning' | 'matching' | 'ready';

export interface ShopifySkuMatch {
  shopifySku?: string;
  status: 'matched' | 'needs_review';
  lastTouched: string;
}

export interface ShopifySetupState {
  status: ShopifySetupStatus;
  salesSource?: ShopifySalesSource;
  shopDomain?: string;
  credentialStrategy?: 'supabase-secrets' | 'env-file' | 'manual';
  hasCredentialPlaceholders?: boolean;
  skuMatches: Record<string, ShopifySkuMatch>;
  updatedAt?: string;
  completedAt?: string | null;
}

const DEFAULT_STATE: ShopifySetupState = {
  status: 'disabled',
  skuMatches: {},
};

const now = () => new Date().toISOString();

export const useShopifySetup = () => {
  const [state, setState] = usePersistentState<ShopifySetupState>('shopifySetupState', DEFAULT_STATE);

  const markSalesSource = useCallback((source: ShopifySalesSource) => {
    setState((prev) => ({
      ...prev,
      salesSource: source,
      status: prev.status === 'disabled' ? 'planning' : prev.status,
      updatedAt: now(),
    }));
  }, [setState]);

  const markCredentials = useCallback(
    (payload: { shopDomain: string; credentialStrategy: ShopifySetupState['credentialStrategy']; hasPlaceholders?: boolean }) => {
      setState((prev) => ({
        ...prev,
        status: 'matching',
        shopDomain: payload.shopDomain,
        credentialStrategy: payload.credentialStrategy,
        hasCredentialPlaceholders: Boolean(payload.hasPlaceholders),
        updatedAt: now(),
      }));
    },
    [setState],
  );

  const upsertSkuMatch = useCallback(
    (localSku: string, shopifySku: string) => {
      setState((prev) => {
        const nextMatches: Record<string, ShopifySkuMatch> = {
          ...prev.skuMatches,
          [localSku]: {
            shopifySku,
            status: shopifySku.trim() ? 'matched' : 'needs_review',
            lastTouched: now(),
          },
        };
        const allMatched = Object.values(nextMatches).length > 0 && Object.values(nextMatches).every((entry) => entry.status === 'matched');
        return {
          ...prev,
          skuMatches: nextMatches,
          status: allMatched ? 'ready' : 'matching',
          completedAt: allMatched ? now() : prev.completedAt ?? null,
          updatedAt: now(),
        };
      });
    },
    [setState],
  );

  const resetSetup = useCallback(() => setState(DEFAULT_STATE), [setState]);

  const progress = useMemo(() => {
    if (state.status === 'ready') return 100;
    if (state.status === 'matching') {
      const matches = Object.values(state.skuMatches);
      if (matches.length === 0) return 55;
      const ratio = matches.filter((entry) => entry.status === 'matched').length / matches.length;
      return Math.min(95, 55 + Math.round(ratio * 35));
    }
    if (state.status === 'planning') return 30;
    return 10;
  }, [state]);

  return {
    state,
    progress,
    markSalesSource,
    markCredentials,
    upsertSkuMatch,
    resetSetup,
    setState,
  };
};
