import { test, expect } from '@playwright/test';

test.describe('Company Email Policy', () => {
  test('allows admin to configure a managed mailbox', async ({ page }) => {
    // Set up initial empty state
    await page.addInitScript(() => {
      window.localStorage.setItem('murp::forceMockData', '1');
      // Clear any existing email settings to ensure clean state
      window.localStorage.removeItem('murp::companyEmailSettings');
    });
    await page.goto('/settings?e2e=1');
    await page.waitForTimeout(500);

    // Section was renamed from "Email Configuration" to "Email Policy"
    const sectionToggle = page.getByRole('button', { name: /Email Policy/i });
    await expect(sectionToggle).toBeVisible({ timeout: 10000 });
    await sectionToggle.click();

    const fromInput = page.getByLabel('Company from address');
    await expect(fromInput).toBeVisible();
    await fromInput.fill('purchasing@acme.test');

    // Select Gmail provider option
    await page.getByText('Workspace Gmail').click();

    // Wait for the form to update
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: 'Save Policy' }).click();
    await expect(page.getByText('Company email policy updated.', { exact: false })).toBeVisible();

    // Verify saved settings - check email and provider but not toggle state
    // (toggle default may vary)
    const stored = await page.evaluate(() => window.localStorage.getItem('murp::companyEmailSettings'));
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.fromAddress).toBe('purchasing@acme.test');
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
