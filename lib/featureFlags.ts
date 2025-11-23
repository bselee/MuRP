type EnvSource = Record<string, any>;

const getEnv = (): EnvSource => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env as EnvSource;
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env as EnvSource;
  }
  return {};
};

const env = getEnv();
const toBool = (value: any) => String(value ?? '').toLowerCase() === 'true';

export const featureFlags = {
  shopify: toBool(env.VITE_SHOPIFY_INTEGRATION_ENABLED ?? env.SHOPIFY_INTEGRATION_ENABLED),
};

export type FeatureFlagKey = keyof typeof featureFlags;

export const isFeatureEnabled = (key: FeatureFlagKey): boolean => Boolean(featureFlags[key]);
