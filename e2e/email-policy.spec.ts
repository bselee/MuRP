import { test, expect } from '@playwright/test';

test.describe('Company Email Policy', () => {
  test('allows admin to configure a managed mailbox', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('murp::forceMockData', '1');
    });
    await page.goto('/settings?e2e=1');

    const sectionToggle = page.getByRole('button', { name: /Email Sender Policy/i });
    await sectionToggle.click();

    const fromInput = page.getByLabel('Company from address');
    await expect(fromInput).toBeVisible();
    await fromInput.fill('purchasing@acme.test');

    await page.getByLabel('Workspace Gmail').check();
    const enforceToggle = page.getByLabel('Enforce company sender on artwork emails');
    await enforceToggle.check({ force: true });

    await page.getByRole('button', { name: 'Save Policy' }).click();
    await expect(page.getByText('Company email policy updated.', { exact: false })).toBeVisible();

    const stored = await page.evaluate(() => window.localStorage.getItem('murp::companyEmailSettings'));
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.fromAddress).toBe('purchasing@acme.test');
    expect(parsed.enforceCompanySender).toBe(true);
    expect(parsed.provider).toBe('gmail');
  });
});

test.describe('Artwork Sharing Experience', () => {
  test('surfaces managed mailbox details in share modal', async ({ page }) => {
    const policy = {
      fromAddress: 'purchasing@acme.test',
      enforceCompanySender: true,
      provider: 'resend' as const,
      workspaceMailbox: null,
    };

    await page.addInitScript(value => {
      window.localStorage.setItem('murp::companyEmailSettings', JSON.stringify(value));
      window.localStorage.setItem('murp::forceMockData', '1');
    }, policy);

    await page.goto('/artwork?e2e=1');
    await expect(page.getByText('Artwork Library')).toBeVisible();
    await expect(page.getByText('Alicia Admin (E2E)')).toBeVisible();

    const search = await page.evaluate(() => window.location.search);
    expect(search).toContain('e2e=1');
    const mockFlag = await page.evaluate(() => window.localStorage.getItem('murp::forceMockData'));
    expect(mockFlag).toBe('1');

    const debugCounts = await page.evaluate(() => (window as any).__murpE2E ?? null);
    expect(debugCounts?.boms ?? 0).toBeGreaterThan(0);

    const cardCount = await page.locator('[data-testid="artwork-card"]').count();
    expect(cardCount).toBeGreaterThan(0);

    const shareButton = page.locator('[data-testid="artwork-card-share"]').first();
    await shareButton.waitFor({ state: 'visible' });
    await shareButton.click();

    await expect(page.getByText('Artwork Delivery')).toBeVisible();
    await expect(page.getByText('Company mailbox purchasing@acme.test will handle this send.', { exact: false })).toBeVisible();
    await expect(page.getByText('Managed Mailbox')).toBeVisible();

    await page.getByLabel('Artwork recipient emails').fill('packaging-team@example.com');
    await page.getByLabel('Artwork email subject').fill('Playwright QA run');
    await page.getByLabel('Artwork email body').fill('Ensuring managed mailbox UI renders in modal.');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Artwork Delivery')).toBeHidden();
  });
});
