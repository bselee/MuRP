import type { Page } from '../App';

/**
 * URL routing utilities for the application
 * Centralized mapping between pages and URL paths
 */

// Map page names to URL paths
export const pageToPath: Record<Page, string> = {
  'Dashboard': '/',
  'Inventory': '/inventory',
  'Purchase Orders': '/purchase-orders',
  'Vendors': '/vendors',
  'Production': '/production',
  'BOMs': '/boms',
  'Stock Intelligence': '/stock-intelligence',
  'Settings': '/settings',
  'API Documentation': '/api',
  'Artwork': '/artwork',
  'Projects': '/projects',
  'Label Scanner': '/label-scanner',
  'Product Page': '/product',
  'Agent Command Center': '/admin/agents',
  'Compliance': '/compliance',
};

// Map URL paths to page names (includes aliases)
export const pathToPage: Record<string, Page> = {
  '': 'Dashboard',
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  '/inventory': 'Inventory',
  '/purchase-orders': 'Purchase Orders',
  '/purchaseorders': 'Purchase Orders',
  '/vendors': 'Vendors',
  '/production': 'Production',
  '/boms': 'BOMs',
  '/stock-intelligence': 'Stock Intelligence',
  '/settings': 'Settings',
  '/api': 'API Documentation',
  '/artwork': 'Artwork',
  '/label-scanner': 'Label Scanner',
  '/labels': 'Label Scanner',
  '/projects': 'Projects',
  '/product': 'Product Page',
  '/admin/agents': 'Agent Command Center',
  '/compliance': 'Compliance',
};

/**
 * Get the URL path for a page
 */
export function getPathForPage(page: Page): string {
  return pageToPath[page] || '/';
}

/**
 * Get the page name from a URL path
 */
export function getPageFromPath(pathname: string): Page {
  const path = pathname.replace(/\/$/, ''); // Remove trailing slash
  return pathToPage[path] ?? 'Dashboard';
}

/**
 * Navigate to a page using history API
 * Preserves query parameters and hash
 */
export function navigateTo(page: Page, options?: { preserveHash?: boolean }): void {
  if (typeof window === 'undefined') return;

  const path = getPathForPage(page);
  const search = window.location.search;
  const hash = options?.preserveHash ? window.location.hash : '';

  window.history.pushState({ page }, '', path + search + hash);
}

/**
 * Replace current history entry without adding to stack
 */
export function replaceHistoryState(page: Page): void {
  if (typeof window === 'undefined') return;

  const path = getPathForPage(page);
  const search = window.location.search;
  const hash = window.location.hash;

  window.history.replaceState({ page }, '', path + search + hash);
}

/**
 * Parse the current URL and return page info
 */
export function parseCurrentUrl(): { page: Page; hash: string; search: string } {
  if (typeof window === 'undefined') {
    return { page: 'Dashboard', hash: '', search: '' };
  }

  const { pathname, hash, search } = window.location;
  const page = getPageFromPath(pathname);

  return { page, hash, search };
}

/**
 * Build a full URL for a page with optional hash
 */
export function buildUrl(page: Page, hash?: string): string {
  const path = getPathForPage(page);
  const hashPart = hash ? `#${hash.replace(/^#/, '')}` : '';
  return path + hashPart;
}
