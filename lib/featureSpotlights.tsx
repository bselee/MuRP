import React from 'react';
import {
  LightBulbIcon,
  ShieldCheckIcon,
  CogIcon,
} from '@/components/icons';
import { isFeatureEnabled, type FeatureFlagKey } from './featureFlags';

export type SpotlightId = 'appearance' | 'security' | 'sales-channel';

export interface SpotlightDefinition {
  id: SpotlightId;
  title: string;
  description: string;
  accent: string;
  pill: string;
  icon: React.ReactNode;
  requiresFlag?: FeatureFlagKey;
  needsAttention?: () => boolean;
  ctaPage?: string;
}

const PREF_STORAGE_KEY = 'murp-user-preferences';
const TWO_FACTOR_KEY = 'murp-twofactor-enabled';
const SHOPIFY_SETUP_KEY = 'murp::shopifySetupState';

const parseJSON = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const hasCustomizedAppearance = (): boolean => {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage.getItem(PREF_STORAGE_KEY);
  const data = parseJSON<{ rowDensity?: string; fontScale?: string }>(stored, {});
  return data.rowDensity !== undefined || data.fontScale !== undefined;
};

const hasTwoFactorEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage.getItem(TWO_FACTOR_KEY);
  const data = parseJSON<{ enabled?: boolean }>(stored, { enabled: false });
  return Boolean(data.enabled);
};

const hasStartedShopifySetup = (): boolean => {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage.getItem(SHOPIFY_SETUP_KEY);
  const data = parseJSON<{ status?: string }>(stored, { status: 'disabled' });
  return data.status && data.status !== 'disabled';
};

export const spotlightDefinitions: SpotlightDefinition[] = [
  {
    id: 'appearance',
    pill: 'Theme',
    title: 'Glass the workspace',
    description:
      'Appearance presets let you flip between stealth glass, high contrast, or warm daylight vibes without reloading a page.',
    accent: 'from-indigo-500/20 via-sky-500/10 to-transparent',
    icon: <LightBulbIcon className="h-5 w-5 text-indigo-200" />,
    needsAttention: () => !hasCustomizedAppearance(),
    ctaPage: 'Settings',
  },
  {
    id: 'security',
    pill: 'Security',
    title: 'Two-factor in two clicks',
    description:
      'Keep purchasing safe by pairing an authenticator app. Each user owns their own codes so OTPs stay compliant.',
    accent: 'from-emerald-500/20 via-teal-500/10 to-transparent',
    icon: <ShieldCheckIcon className="h-5 w-5 text-emerald-200" />,
    needsAttention: () => !hasTwoFactorEnabled(),
    ctaPage: 'Settings',
  },
  {
    id: 'sales-channel',
    pill: 'Beta',
    title: 'Sales channel wizard',
    description:
      'When you drop Shopify credentials into Settings → Sales Channels, MuRP stages SKU matching before any sync goes live.',
    accent: 'from-amber-500/20 via-orange-500/10 to-transparent',
    icon: <CogIcon className="h-5 w-5 text-amber-200" />,
    requiresFlag: 'shopify',
    needsAttention: () => !hasStartedShopifySetup(),
    ctaPage: 'Settings',
  },
];

export const getSpotlightsNeedingAttention = (): SpotlightDefinition[] =>
  spotlightDefinitions.filter((spot) => {
    if (spot.requiresFlag && !isFeatureEnabled(spot.requiresFlag)) {
      return false;
    }
    return spot.needsAttention ? spot.needsAttention() : true;
  });

export const getSpotlightById = (id: SpotlightId): SpotlightDefinition | undefined =>
  spotlightDefinitions.find((spot) => spot.id === id);

export const featureUsageDetectors = {
  hasCustomizedAppearance,
  hasTwoFactorEnabled,
  hasStartedShopifySetup,
};
