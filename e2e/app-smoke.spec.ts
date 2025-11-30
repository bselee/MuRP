import { test, expect, Page } from '@playwright/test';

type RouteCheck = {
  name: string;
  path: string;
  assert: (page: Page) => Promise<void>;
};

const routes: RouteCheck[] = [
  {
    name: 'Dashboard',
    path: '/',
    assert: async (page) => {
      await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /View Reorder Queue/i })).toBeVisible();
    },
  },
  {
    name: 'Inventory',
    path: '/inventory',
    assert: async (page) => {
      await expect(page.getByRole('heading', { name: /Inventory/i })).toBeVisible();
      await expect(page.getByPlaceholder(/Search/i)).toBeVisible();
      await expect(page.getByRole('table')).toBeVisible();
    },
  },
  {
    name: 'Purchase Orders',
    path: '/purchase-orders',
    assert: async (page) => {
      await expect(page.getByRole('heading', { name: 'Purchase Orders', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'External Purchase Orders', exact: true })).toBeVisible();
    },
  },
  {
    name: 'Vendors',
    path: '/vendors',
    assert: async (page) => {
      await expect(page.getByRole('heading', { name: /Vendors/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Add New Vendor/i })).toBeVisible();
    },
  },
  {
    name: 'Production',
    path: '/production',
    assert: async (page) => {
      await expect(page.getByRole('heading', { name: /Production/i })).toBeVisible();
      await expect(page.getByText(/Schedule Build/i)).toBeVisible();
    },
  },
  {
    name: 'Bills of Materials',
    path: '/boms',
    assert: async (page) => {
      await expect(page.getByRole('heading', { name: /Bills of Materials/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Quick Request/i })).toBeVisible();
    },
  },
  {
    name: 'Artwork Library',
    path: '/artwork',
    assert: async (page) => {
      await expect(page.getByRole('heading', { name: /Artwork Library/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Upload Artwork/i })).toBeVisible();
    },
  },
  {
    name: 'Projects',
    path: '/projects',
    assert: async (page) => {
      await expect(page.getByRole('heading', { name: /Projects & Tasks/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /New Project/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Projects/i })).toBeVisible();
    },
  },
  {
    name: 'Settings',
    path: '/settings',
    assert: async (page) => {
      await expect(page.locator('h1').filter({ hasText: 'Settings' })).toBeVisible();
      await expect(page.getByRole('button', { name: /Email Sender Policy/i })).toBeVisible();
    },
  },
  {
    name: 'API Documentation',
    path: '/api',
    assert: async (page) => {
      await expect(page.getByRole('heading', { name: /API Documentation/i })).toBeVisible();
      await expect(page.getByText(/Context7 Research Assistant/i)).toBeVisible();
    },
  },
];

const withE2EParam = (path: string) => {
  const hasQuery = path.includes('?');
  return `${path}${hasQuery ? '&' : '?'}e2e=1`;
};

test.describe('Application smoke coverage', () => {
  for (const route of routes) {
    test(`loads ${route.name} page`, async ({ page }) => {
      await page.goto(withE2EParam(route.path));
      await route.assert(page);
    });
  }
});
