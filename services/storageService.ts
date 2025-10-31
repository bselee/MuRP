const STORAGE_PREFIX = 'tgf-mrp::';

const hasWindow = (): boolean => typeof window !== 'undefined';

const getStorageKey = (key: string): string => `${STORAGE_PREFIX}${key}`;

export function loadState<T>(key: string, fallback: T): T {
  if (!hasWindow()) {
    return fallback;
  }

  try {
    const rawValue = window.localStorage.getItem(getStorageKey(key));
    if (!rawValue) {
      return fallback;
    }

    return JSON.parse(rawValue) as T;
  } catch (error) {
    console.warn(`Failed to load persisted state for "${key}":`, error);
    return fallback;
  }
}

export function saveState<T>(key: string, value: T): void {
  if (!hasWindow()) {
    return;
  }

  try {
    window.localStorage.setItem(getStorageKey(key), JSON.stringify(value));
  } catch (error) {
    console.warn(`Failed to persist state for "${key}":`, error);
  }
}

export function clearState(key: string): void {
  if (!hasWindow()) {
    return;
  }

  try {
    window.localStorage.removeItem(getStorageKey(key));
  } catch (error) {
    console.warn(`Failed to clear persisted state for "${key}":`, error);
  }
}
