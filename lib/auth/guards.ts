const DEV_FLAG_KEY = 'murp::devGodMode';
const DEV_PARAM = 'dev';
const E2E_PARAM = 'e2e';

export const isDevelopment = () => Boolean(import.meta.env?.DEV);

export const isE2ETesting = () => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get(E2E_PARAM) === '1';
};

export const canBypassAuth = () => isDevelopment();

export const shouldEnableGodModeFromUrl = () => {
  if (!isDevelopment() || typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get(DEV_PARAM) === '1';
};

export const loadGodModeFlag = () => {
  if (!isDevelopment() || typeof window === 'undefined') return false;
  return window.localStorage.getItem(DEV_FLAG_KEY) === '1';
};

export const persistGodModeFlag = (enabled: boolean) => {
  if (!isDevelopment() || typeof window === 'undefined') return;
  if (enabled) {
    window.localStorage.setItem(DEV_FLAG_KEY, '1');
  } else {
    window.localStorage.removeItem(DEV_FLAG_KEY);
  }
};

export const GOD_MODE_KEY = DEV_FLAG_KEY;
